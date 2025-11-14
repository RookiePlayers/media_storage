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
import { UploadParams, StorageResult, StorageProvider } from '../types';
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

      await fileToStore.save(buffer, {
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
}
