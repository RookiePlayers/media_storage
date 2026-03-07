/**
 * FirebaseStorageService
 * 
 * A singleton class that handles file uploads to Google Firebase Storage.
 * Designed for use in Node.js backends or serverless functions.
 * 
 * Features:
 * - Uploads a file buffer to a specified Firebase Storage bucket path
 * - Automatically sets cache control headers
 * - Generates public URLs for uploaded files
 * - Hashes filenames for unique key generation
 * 
 * Example usage:
 * ```ts
 * const storageService = FirebaseStorageService.getInstance();
 * const result = await storageService.uploadFile({
 *   file: {
 *     name: 'image.png',
 *     mimetype: 'image/png',
 *     data: fileBuffer
 *   },
 *   uploadPath: 'user-uploads/profile-pictures'
 * });
 * console.log(result.downloadUrl);
 * ```
 */
import { BaseStorageService } from '../utils/baseStorage';
import { FirebaseConfig } from '../config/firebase_config';
import { IStorageService } from '../iStorage';
import {
  CompleteMultipartParams,
  DeletionResult,
  InitiateMultipartParams,
  MultipartSession,
  StorageProvider,
  StorageResult,
  UploadChunkParams,
  UploadParams,
  UploadedPart,
} from '../types';
import { computeSRI, hashString } from '../utils/encryptions';
import { verifyStorage } from '../utils/universalIntegrityVerifier';
import EnvironmentRegister from '../register';
import { Storage } from 'firebase-admin/storage';

export class FirebaseStorageService extends BaseStorageService implements IStorageService {

  provider: StorageProvider = 'firebase';
  private firebaseStorage?: Storage;
  private initialized = false;

  constructor() {
    super(); 
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    EnvironmentRegister.getInstance().requiredSubset([
      'firebase_service_account_key_base64',
      'firebase_storage_bucket'
    ])
    this.firebaseStorage = FirebaseConfig().firebaseStorage;
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Upload a file to Firebase Storage and return its public URL and metadata.
   *
   * @param {UploadParams} objectParams - The parameters for file upload:
   *  - `file`: { name, data (Buffer or ArrayBuffer), mimetype }
   *  - `uploadPath`: Optional path within the Firebase bucket (default: `STR_<timestamp>`)
   *  - `cacheControl`: Optional cache policy (default: `public, max-age=31536000`)
   *
   * @returns {Promise<StorageResult>} - An object containing:
   *  - `downloadUrl`: The public download URL of the uploaded file
   *  - `url`: Alias for downloadUrl
   *  - `key`: A hashed unique key derived from the file name
   *
   * @throws Will throw an error if the upload fails
   */
  async uploadFile(objectParams: UploadParams): Promise<StorageResult> {
    try {
      await this.ensureInitialized();
      if(!this.firebaseStorage) {
        throw new Error('Firebase Storage not initialized. Call init() first.');
      }
      const storage = this.firebaseStorage.bucket();
      const buffer = Buffer.from(objectParams.file.data);
      const filePath = `${objectParams.uploadPath ?? `STR_${Date.now()}`}/${objectParams.file.name}`;
      const fileToStore = storage.file(filePath);

      // compute sha256 (hex) and SRI
      const integrity = computeSRI(buffer, 'sha256');
      const sha256Hex = integrity.split('-')[1] ? Buffer.from(integrity.split('-')[1], 'base64').toString('hex') : undefined;

      const RESUMABLE_THRESHOLD = (objectParams.multipart?.thresholdMB ?? 5) * 1024 * 1024;
      const useResumable = objectParams.multipart !== undefined || buffer.length > RESUMABLE_THRESHOLD;

      await fileToStore.save(buffer, {
        resumable: useResumable,
        metadata: {
          contentType: objectParams.file.mimetype,
          cacheControl: objectParams.cacheControl ?? 'public, max-age=31536000',
          // ⬇store custom sha256 so verifyStorage can read it later
          metadata: sha256Hex ? { sha256: sha256Hex } : undefined,
        },
      });

      await fileToStore.makePublic();
      const url = fileToStore.publicUrl();

      const result = this.finalizeResult(
        {
          url,
          downloadUrl: url,
          key: hashString(objectParams.file.name),
          integrity,
          sizeBytes: buffer.length,
          locator: {
            provider: 'firebase',
            bucket: storage.name,      // same bucket name
            objectPath: filePath,      // path within bucket
            fileId: filePath,
            filePath,
          },
          provider: 'firebase',
        },
        {}
      );

      // UNIVERSAL VERIFY
      const outcome = await verifyStorage(result, {
        firebase: { gcs: storage.storage }, // firebase-admin's underlying GCS client
      });

      if (!outcome.exists) {
        throw new Error(`verifyStorage: object not found after upload (gs://${storage.name}/${filePath})`);
      }
      // integrityMatches will be 'unknown' unless custom sha256 was stored (we did above)
      if (outcome.integrityMatches === false) {
        throw new Error('verifyStorage: sha256 mismatch after upload (firebase)');
      }
      if (outcome.sizeMatches === false) {
        throw new Error('verifyStorage: size mismatch after upload (firebase)');
      }

      return result;
    } catch (e) {
      throw e;
    }
  }

  // ── Client-driven multipart API (GCS resumable uploads) ──────────────────
  //
  // GCS resumable uploads differ from S3 multipart in two important ways:
  //   1. Chunks must be multiples of 256 KiB (except the final chunk).
  //   2. Chunks are sequential byte ranges, not numbered parts.
  //
  // The session URI returned by GCS is stored as `uploadId`.
  // Byte offsets are tracked per-session in `_multipartOffsets`.

  /** Maps GCS session URI → next byte offset */
  private _multipartOffsets = new Map<string, number>();

  private _gcsAuthClient() {
    // `@google-cloud/storage` exposes its GoogleAuth instance on `authClient`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.firebaseStorage!.bucket().storage as any).authClient;
  }

  async initiateMultipartUpload(params: InitiateMultipartParams): Promise<MultipartSession> {
    await this.ensureInitialized();
    const bucket = this.firebaseStorage!.bucket();
    const [uri] = await bucket.file(params.key).createResumableUpload({
      metadata: {
        contentType: params.contentType,
        cacheControl: params.cacheControl ?? 'public, max-age=31536000',
        ...(params.sha256Hex ? { metadata: { sha256: params.sha256Hex } } : {}),
      },
    });
    this._multipartOffsets.set(uri, 0);
    return { uploadId: uri, key: params.key };
  }

  /**
   * Upload a single chunk to GCS.
   * Chunks must be multiples of 256 KiB except the very last one.
   * Parts must be uploaded sequentially (partNumber is informational only).
   */
  async uploadChunk(params: UploadChunkParams): Promise<UploadedPart> {
    await this.ensureInitialized();
    const { uploadId, data, partNumber } = params;
    const offset = this._multipartOffsets.get(uploadId) ?? 0;
    const end = offset + data.length - 1;

    const authClient = this._gcsAuthClient();
    const response = await authClient.request({
      method: 'PUT',
      url: uploadId,
      headers: {
        'Content-Range': `bytes ${offset}-${end}/*`,
        'Content-Length': String(data.length),
      },
      body: data,
      // GCS returns 308 (Resume Incomplete) for successful intermediate chunks
      validateStatus: (status: number) => [200, 201, 308].includes(status),
    });

    if (![200, 201, 308].includes(response.status)) {
      throw new Error(`GCS chunk upload failed: HTTP ${response.status}`);
    }

    this._multipartOffsets.set(uploadId, offset + data.length);
    return { partNumber, etag: String(offset + data.length) };
  }

  /**
   * Finalise a GCS resumable upload.
   * `sizeBytes` is required — GCS needs the total size to close the session.
   */
  async completeMultipartUpload(params: CompleteMultipartParams): Promise<StorageResult> {
    await this.ensureInitialized();
    if (!params.sizeBytes) {
      throw new Error('sizeBytes is required to finalise a Firebase/GCS multipart upload.');
    }

    const authClient = this._gcsAuthClient();
    const response = await authClient.request({
      method: 'PUT',
      url: params.uploadId,
      headers: {
        'Content-Range': `bytes */${params.sizeBytes}`,
        'Content-Length': '0',
      },
      validateStatus: (status: number) => [200, 201].includes(status),
    });

    if (![200, 201].includes(response.status)) {
      throw new Error(`GCS upload finalisation failed: HTTP ${response.status}`);
    }

    this._multipartOffsets.delete(params.uploadId);

    const bucket = this.firebaseStorage!.bucket();
    const file = bucket.file(params.key);
    await file.makePublic();
    const url = file.publicUrl();

    return this.finalizeResult(
      {
        url,
        downloadUrl: url,
        key: hashString(params.key),
        integrity: params.integrity,
        sizeBytes: params.sizeBytes,
        locator: {
          provider: 'firebase',
          bucket: bucket.name,
          objectPath: params.key,
          filePath: params.key,
        },
        provider: 'firebase',
      },
      {}
    );
  }

  /** Abort and clean up a GCS resumable upload session. */
  async abortMultipartUpload(session: MultipartSession): Promise<void> {
    await this.ensureInitialized();
    const authClient = this._gcsAuthClient();
    try {
      await authClient.request({
        method: 'DELETE',
        url: session.uploadId,
        headers: { 'Content-Length': '0' },
        validateStatus: () => true, // best-effort: ignore any status
      });
    } catch { /* best-effort */ }
    this._multipartOffsets.delete(session.uploadId);
  }

  async deleteFile(fileId?: string, filePath?: string): Promise<DeletionResult> {
    await this.ensureInitialized();
    if (!this.firebaseStorage) {
      throw new Error('Firebase Storage not initialized. Call init() first.');
    }

    const objectPath = filePath ?? fileId;
    if (!objectPath) {
      return { success: false, message: 'filePath or fileId is required for Firebase delete.' };
    }

    const storage = this.firebaseStorage.bucket();
    const file = storage.file(objectPath);
    await file.delete({ ignoreNotFound: true });
    return { success: true };
  }
}
