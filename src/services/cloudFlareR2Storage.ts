/**
 * CloudFlareR2StorageService
 *
 * A singleton service for uploading and managing files on **Cloudflare R2**
 * (S3-compatible object storage). Includes:
 * - Object de-duplication using SHA-256 hashes.
 * - Immutable upload behavior (prevents overwrites via `IfNoneMatch`).
 * - Strong caching headers for CDN optimization.
 * - Optional fallback to Firebase Storage when upload fails.
 *
 * Requirements:
 * - Environment variables:
 *   - `R2_ACCOUNT_ID`
 *   - `R2_BUCKET`
 *   - `R2_ACCESS_KEY_ID`
 *   - `R2_SECRET`
 *   - `CDN_BASE` (e.g., `https://cdn.example.com`)
 *
 * Example:
 * ```ts
 * const r2 = CloudFlareR2StorageService.getInstance();
 * const result = await r2.uploadFile({
 *   file: {
 *     name: "avatar.png",
 *     mimetype: "image/png",
 *     data: fs.readFileSync("./avatar.png"),
 *   },
 *   uploadPath: "profiles/user123",
 * });
 * console.log(result.url);
 * ```
 */

import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageProvider, StorageResult, UploadParams } from '../types';
import { buildImmutableKey, computeSRI } from '../utils/encryptions';
import { IStorageService } from '../iStorage';
import { BaseStorageService } from '../utils/baseStorage';
import { verifyStorage } from '../utils/universalIntegrityVerifier';
import EnvironmentRegister from '../register';
import { sriToHex } from '../utils/integrity';

export class CloudFlareR2StorageService extends BaseStorageService implements IStorageService {

  provider: StorageProvider = 'r2';

  /** Environment variables for R2 setup */
  private R2_ACCOUNT_ID: string; 
  private R2_BUCKET: string;
  private R2_ACCESS_KEY_ID: string;
  private R2_SECRET: string;
  private CDN_BASE: string;

  /** S3-compatible client configured for Cloudflare R2 */
  private s3: S3Client;

  constructor() {
    super();
     EnvironmentRegister.getInstance().requiredSubset([
      'r2_account_id',
      'r2_bucket',
      'r2_access_key_id',
      'r2_access_key_secret',
      'r2_cdn_base',
    ]);

    this.R2_ACCOUNT_ID = EnvironmentRegister.getInstance().getEnvironment('r2_account_id')!;
    this.R2_BUCKET = EnvironmentRegister.getInstance().getEnvironment('r2_bucket')!;
    this.R2_ACCESS_KEY_ID = EnvironmentRegister.getInstance().getEnvironment('r2_access_key_id')!;
    this.R2_SECRET = EnvironmentRegister.getInstance().getEnvironment('r2_access_key_secret')!;
    this.CDN_BASE = EnvironmentRegister.getInstance().getEnvironment('r2_cdn_base')!;

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${this.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.R2_ACCESS_KEY_ID,
        secretAccessKey: this.R2_SECRET,
      },
    });
  }

  /**
   * Uploads a file to Cloudflare R2 with cache and immutability optimizations.
   * Falls back to Firebase Storage if upload fails.
   *
   * @param objectParams - The file upload parameters:
   *   - `file`: { name, mimetype, data (Buffer or Uint8Array) }
   *   - `uploadPath`: optional path prefix (default: `OBJ_<timestamp>`)
   *   - `cacheControl`: optional HTTP cache control (default: 1-year immutable)
   *
   * @returns {Promise<StorageResult>} Object containing:
   *   - `url`: CDN-accessible URL of uploaded object
   *   - `downloadUrl`: same as `url`
   *   - `key`: unique SHA-256 hash used as cache key
   */
  async uploadFile(objectParams: UploadParams): Promise<StorageResult> {
    try {
      const { file, uploadPath = `OBJ_${Date.now()}` } = objectParams;

    // Build immutable key (for path) + compute integrity from CONTENT BYTES
    const { key /*, hash: immutableKeyHash */ } = buildImmutableKey({
      uploadPath,
      filename: file.name,
      mime: file.mimetype,
      data: file.data,
    });

    // Compute SRI + hex for content-based verification & metadata
    const integrity = computeSRI(file.data, 'sha256');
    const contentSha256Hex = sriToHex(integrity);

    // --------------------------
    // 1) HEAD: short-circuit if exact same CONTENT already present
    // --------------------------
    let exists = false;
    try {
      const head = await this.s3.send(new HeadObjectCommand({
        Bucket: this.R2_BUCKET,
        Key: key,
      }));
      const storedSha = head.Metadata?.['sha256'];
      if (storedSha && storedSha === contentSha256Hex) {
        // ✅ exact same content present -> skip PUT
        exists = true;
      } else {
        // present but different/missing hash -> force reupload
        exists = false;
      }
    } catch (err: any) {
      // 404/403 treated as not-found; anything else bubbles up
      if (err?.$metadata?.httpStatusCode && ![403, 404].includes(err.$metadata.httpStatusCode)) {
        throw err;
      }
    }

    // Public URL (CDN) for return payload
    const url = `${this.CDN_BASE}/${key}`;

    // --------------------------
    // 2) PUT: only if missing/mismatch; swallow 412 race
    // --------------------------
    if (!exists) {
      try {
        await this.s3.send(new PutObjectCommand({
          Bucket: this.R2_BUCKET,
          Key: key,
          Body: file.data,
          ContentType: file.mimetype,
          CacheControl: objectParams.cacheControl ?? 'public, max-age=31536000, immutable',
          // store CONTENT sha256 (hex) so verifyStorage can HEAD-compare
          Metadata: { sha256: contentSha256Hex },
          IfNoneMatch: '*',
        }));
      } catch (e: any) {
        const status = e?.$metadata?.httpStatusCode;
        if (status === 412) {
          // Another writer won the race; proceed to verify via HEAD.
        } else {
          // Real failure
          console.error('Error uploading file to CloudFlare R2:', e);
          throw e;
        }
      }
    }

    // --------------------------
    // 3) Build result & UNIVERSAL VERIFY (HEAD without download)
    // --------------------------
    const result = this.finalizeResult(
      {
        url,
        downloadUrl: url,
        key,
        integrity,                 // SRI from content bytes
        sizeBytes: file.data.length,
        locator: { provider: 'r2', bucket: this.R2_BUCKET, key },
        provider: 'r2',
      },
      {}
    );

    const outcome = await verifyStorage(result, { r2: { s3: this.s3 } });

    if (!outcome.exists) {
      throw new Error(`verifyStorage: object not found after upload (r2://${this.R2_BUCKET}/${key})`);
    }
    if (outcome.integrityMatches === false) {
      throw new Error(`verifyStorage: sha256 mismatch after upload (expected ${contentSha256Hex})`);
    }
    if (outcome.sizeMatches === false) {
      throw new Error('verifyStorage: size mismatch after upload');
    }

    return result;


    } catch (error) {
      console.error('Error uploading file to CloudFlare R2:', error);
      throw error;
    }
  }

  /**
   * Deletes a file from Cloudflare R2.
   *
   * @param uploadPath - The logical folder/path prefix.
   * @param file - File reference ({ uri?: string; name: string }).
   */
  async deleteFile(uploadPath: string, file: { uri?: string; name: string }): Promise<void> {
    const key = this.normalizeKey(uploadPath, file);

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.R2_BUCKET,
        Key: key,
      })
    );
  }

  /**
   * Normalize a file path into a consistent R2 object key.
   * - Prefers `file.uri` (if provided)
   * - Falls back to `file.name`
   * - Strips leading slashes and Windows-style paths
   *
   * Example:
   * ```
   * normalizeKey("uploads", { uri: "/assets/img.png" })
   * // → "uploads/assets/img.png"
   * ```
   */
  normalizeKey(uploadPath: string, file: { uri?: string; name: string }) {
    const relative = (file.uri && file.uri.trim()) || file.name || '';
    const clean = relative.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    return `${uploadPath}/${clean}`.replace(/\/+/g, '/');
  }
}