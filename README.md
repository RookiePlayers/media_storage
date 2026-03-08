# Media Storage Library

A powerful and modular **Node.js media storage library** that provides a unified interface for managing file uploads, integrity verification, and deletions across multiple providers — including **Cloudflare R2**, **Firebase Storage (GCS)**, and **Google Drive**.

---

## 🚀 Features

- 🔁 Unified API for multiple storage providers (R2, Firebase, Drive)
- 🔒 Automatic integrity verification with Subresource Integrity (SRI)
- 🧠 Smart caching and checksum validation (sha256)
- 🧩 Pluggable architecture for extending storage backends
- ⚙️ Strongly typed (TypeScript)
- 📦 Multipart / chunked uploads for large files (R2 and Firebase)

---

## 📦 Installation

```bash
npm install universal_media_storage
```

or with yarn:

```bash
yarn add universal_media_storage
```

---

## 🧰 Supported Providers

| Provider | Module | Notes |
| --------- | ------- | ----- |
| **Cloudflare R2** | `CloudFlareR2StorageService` | S3-compatible; uses `@aws-sdk/client-s3` |
| **Firebase Storage (GCS)** | `FirebaseStorageService` | Uses `@google-cloud/storage` |
| **Google Drive** | `GoogleDriveStorageService` | Uses `googleapis` Drive v3 |

---

## 🧠 Core Concepts

### 1. Storage Service

Each provider implements a subclass of `BaseStorageService` with a unified `uploadFile` API. For deletions, you can either call the provider's `deleteFile` method directly or use the `deleteFileFromStorage` helper with a `StorageResult.locator`.

```ts
interface UploadParams {
  file: {
    name: string;
    data: Buffer;
    mimetype: string;
    uri?: string;
  };
  uploadPath?: string;
  parentPathIds?: string[];
  cacheControl?: string;
  /**
   * Enable multipart/chunked upload. If omitted, multipart is used automatically
   * for files larger than 100 MB on providers that support it.
   */
  multipart?: {
    chunkSizeMB?: number;   // Minimum 5 MB (S3/R2 requirement). Defaults to 10 MB.
    thresholdMB?: number;   // Auto-enable above this size. Defaults to 100 MB.
    retries?: number;       // Per-chunk retry attempts. Defaults to 3.
  };
}
```

Example:

```ts
import { MediaStorage } from 'universal_media_storage';
import { CloudFlareR2StorageService } from 'universal_media_storage/services/cloudFlareR2Storage';
import { FirebaseStorageService } from 'universal_media_storage/services/firebaseStorage';
import { GoogleDriveStorageService } from 'universal_media_storage/services/googleDriveStorage';

const fb_storage = new MediaStorage({
  config: {
    firebase_service_account_key_base64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',
    firebase_storage_bucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },
  service: new FirebaseStorageService(),
});

const r2_storage = new MediaStorage({
  service: new CloudFlareR2StorageService(),
  config: {
    r2_account_id: process.env.R2_ACCOUNT_ID || '',
    r2_bucket: process.env.R2_BUCKET || '',
    r2_access_key_id: process.env.R2_ACCESS_KEY_ID || '',
    r2_access_key_secret: process.env.R2_ACCESS_KEY_SECRET || '',
    r2_cdn_base: process.env.R2_CDN_BASE || '',
  },
});

const gd_storage = new MediaStorage({
  service: new GoogleDriveStorageService(),
  config: {
    gcp_service_account_key_base64: process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 || '',
    gcp_drive_scopes: process.env.GCP_DRIVE_SCOPES || '',
  },
});
```

Firebase app reuse (safe to call multiple times in the same process):

```ts
import { FirebaseStorageService } from 'universal_media_storage/services/firebaseStorage';

const serviceA = new FirebaseStorageService();
const serviceB = new FirebaseStorageService(); // reuses the existing Firebase app
```

---

### 2. Integrity Verification

Every upload generates a **sha256 SRI hash** that can later be validated using the universal verifier:

```ts
import { verifyStorage } from 'universal_media_storage';
import { S3Client } from '@aws-sdk/client-s3';

const r2Client = new S3Client({ region: 'auto', endpoint: 'https://<account>.r2.cloudflarestorage.com' });
const outcome = await verifyStorage(result, { r2: { s3: r2Client } });

console.log(outcome);
```

Sample output:

```json
{
  "exists": true,
  "integrityMatches": true,
  "sizeMatches": true
}
```

---

### 3. Uploading Files

The `uploadFile` method returns a `StorageResult` with URLs, integrity, size, and a provider-specific `locator` that includes `fileId` and `filePath`.

Cloudflare R2:

```ts
const r2Result = await r2_storage.uploadFile({
  file: {
    name: 'avatar.png',
    mimetype: 'image/png',
    data: fileBuffer,
  },
  uploadPath: 'profiles/user123',
});
```

Firebase Storage:

```ts
const fbResult = await fb_storage.uploadFile({
  file: {
    name: 'avatar.png',
    mimetype: 'image/png',
    data: fileBuffer,
  },
  uploadPath: 'profiles/user123',
});
```

Google Drive:

```ts
const gdResult = await gd_storage.uploadFile({
  parentPathIds: ['<drive-folder-id>'],
  file: {
    name: 'avatar.png',
    mimetype: 'image/png',
    data: fileBuffer,
  },
});
```

---

### 4. Multipart Uploads (R2 & Firebase)

For large files, multipart upload is triggered automatically above the threshold (default 100 MB) or you can opt in explicitly:

```ts
// Explicit opt-in — force multipart regardless of file size
const result = await r2_storage.uploadFile({
  file: { name: 'video.mp4', mimetype: 'video/mp4', data: largeBuffer },
  uploadPath: 'videos',
  multipart: {
    chunkSizeMB: 10, // 10 MB chunks
    retries: 3,      // retry each chunk up to 3 times on failure
  },
});

// Auto-threshold — multipart kicks in when file exceeds 50 MB
const result = await r2_storage.uploadFile({
  file: { name: 'video.mp4', mimetype: 'video/mp4', data: largeBuffer },
  uploadPath: 'videos',
  multipart: {
    thresholdMB: 50,
    chunkSizeMB: 10,
  },
});
```

---

### 5. Client-Driven Multipart Uploads (R2 & Firebase)

For scenarios where you send chunks one-by-one (e.g. browser uploads, resumable pipelines), use the low-level multipart API directly.

**Cloudflare R2:**

```ts
import { CloudFlareR2StorageService } from 'universal_media_storage/services/cloudFlareR2Storage';
import { UploadedPart } from 'universal_media_storage';

const r2Service = r2_storage.getStorageService() as CloudFlareR2StorageService;

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB minimum for S3/R2
const key = 'uploads/large-file.bin';

const session = await r2Service.initiateMultipartUpload({
  key,
  contentType: 'application/octet-stream',
});

const parts: UploadedPart[] = [];
for (let i = 0; i * CHUNK_SIZE < fileBuffer.length; i++) {
  const chunk = fileBuffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const part = await r2Service.uploadChunk({
    uploadId: session.uploadId,
    key: session.key,
    partNumber: i + 1,
    data: chunk,
  });
  parts.push(part);
}

const result = await r2Service.completeMultipartUpload({
  uploadId: session.uploadId,
  key: session.key,
  parts,
  contentType: 'application/octet-stream',
  sizeBytes: fileBuffer.length,
});
```

**Firebase Storage (GCS Resumable Upload):**

> GCS requires chunks to be multiples of 256 KiB (except the final chunk). 5 MB = 20 × 256 KiB.
> `sizeBytes` is required to finalise the upload.

```ts
import { FirebaseStorageService } from 'universal_media_storage/services/firebaseStorage';
import { UploadedPart } from 'universal_media_storage';

const fbService = fb_storage.getStorageService() as FirebaseStorageService;

const CHUNK_SIZE = 5 * 1024 * 1024; // must be a multiple of 256 KiB
const key = 'uploads/large-file.bin';

const session = await fbService.initiateMultipartUpload({
  key,
  contentType: 'application/octet-stream',
});

const parts: UploadedPart[] = [];
for (let i = 0; i * CHUNK_SIZE < fileBuffer.length; i++) {
  const chunk = fileBuffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const part = await fbService.uploadChunk({
    uploadId: session.uploadId,
    key: session.key,
    partNumber: i + 1,
    data: chunk,
  });
  parts.push(part);
}

const result = await fbService.completeMultipartUpload({
  uploadId: session.uploadId,
  key: session.key,
  parts,
  contentType: 'application/octet-stream',
  sizeBytes: fileBuffer.length, // required for GCS
});
```

To abort an in-progress session:

```ts
await r2Service.abortMultipartUpload(session);
// or
await fbService.abortMultipartUpload(session);
```

---

### 6. Deleting Files (Direct)

You can delete by `fileId` or `filePath`, depending on the provider.

Cloudflare R2:

```ts
await r2_storage.deleteFile(undefined, r2Result.locator?.filePath);
```

Firebase Storage:

```ts
await fb_storage.deleteFile(undefined, fbResult.locator?.filePath);
```

Google Drive:

```ts
await gd_storage.deleteFile(gdResult.locator?.fileId);
```

---

### 7. Presigned URLs (Cloudflare R2)

For private R2 buckets, generate a **time-limited** presigned URL for downloads. Use the object `key` returned from `uploadFile` (or stored in your DB).

```ts
const r2Service = r2_storage.getStorageService() as CloudFlareR2StorageService;
const downloadUrl = await r2Service.getPresignedUrl(r2Result.key!, 600); // 10 minutes
```

You can also create a presigned PUT URL for direct client uploads:

```ts
const uploadUrl = await r2Service.getPresignedUploadUrl(r2Result.key!, 'image/png', 600);
```

---

### 8. Deleting Files (Universal)

Use the `deleteFileFromStorage` helper with the `locator` returned by `uploadFile`.

```ts
import { deleteFileFromStorage } from 'universal_media_storage';
import { S3Client } from '@aws-sdk/client-s3';

const r2Client = new S3Client({ region: 'auto', endpoint: 'https://<account>.r2.cloudflarestorage.com' });

await deleteFileFromStorage(result, { r2: { s3: r2Client } });
```

---

## ⚙️ Environment Configuration

Environment variables are managed by the built-in `EnvironmentRegister` class. You can register them at runtime or load from process.env.

```ts
import EnvironmentRegister from 'universal_media_storage/register';

const env = EnvironmentRegister.getInstance();
env.loadFromProcessEnv();
```

For Google Drive, you can authenticate with either a service account (`GCP_SERVICE_ACCOUNT_KEY_BASE64`) or a user OAuth token (`GCP_OAUTH_ACCESS_TOKEN`, optionally with refresh token + client id/secret).

### Getting Google Drive credentials

Service account (Shared Drives only):

- Create a service account in Google Cloud Console and generate a JSON key.
- Base64-encode the JSON file and set `GCP_SERVICE_ACCOUNT_KEY_BASE64`.
- Share the target Shared Drive or folder with the service account email.

User OAuth (My Drive quota):

- Create an OAuth client (Desktop/Web) in Google Cloud Console and note the client id/secret.
- Run an OAuth consent flow with the Drive scope you need (e.g. `https://www.googleapis.com/auth/drive.file`).
- Use the resulting access token as `GCP_OAUTH_ACCESS_TOKEN`. For long-lived use, request offline access and store the refresh token as `GCP_OAUTH_REFRESH_TOKEN`.

### Example `.env` file

```bash
R2_ACCOUNT_ID=your-account
R2_BUCKET=media
R2_ACCESS_KEY_ID=xxxx
R2_ACCESS_KEY_SECRET=xxxx
R2_CDN_BASE=https://cdn.example.com
FIREBASE_STORAGE_BUCKET=my-app.appspot.com
FIREBASE_SERVICE_ACCOUNT_BASE64=...base64...
GCP_SERVICE_ACCOUNT_KEY_BASE64=...base64...
GCP_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file
GCP_OAUTH_ACCESS_TOKEN=ya29...        # optional alternative to service account
GCP_OAUTH_REFRESH_TOKEN=1//...        # optional, enables refresh when paired with client id/secret
GCP_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GCP_OAUTH_CLIENT_SECRET=...
```

---

## 🧪 Testing

Run the Jest test suite:

```bash
npm test
```

Key tests:

- **cloudflareR2.spec.ts** — Verifies R2 upload, integrity, and race conditions
- **firebaseStorage.spec.ts** — Validates Firebase metadata and size checks
- **googleDriveStorage.spec.ts** — Tests Drive uploads and mock API verification
- **environmentRegister.spec.ts** — Ensures correct env registration and immutability
- **baseStorage.spec.ts** — Validates integrity computation and result normalization
- **multipartUpload.spec.ts** — Tests multipart routing, chunk retry, and abort logic

---

## 🧱 Project Structure

```text
media_storage/
 ├── src/
 │   ├── register.ts              # Environment config
 │   ├── services/                # Provider implementations
 │   │   ├── cloudFlareR2Storage.ts
 │   │   ├── firebaseStorage.ts
 │   │   └── googleDriveStorage.ts
 │   ├── utils/                   # Common utilities
 │   │   ├── encryptions.ts
 │   │   ├── deleteFileFromStorage.ts
 │   │   ├── integrity.ts
 │   │   ├── universalIntegrityVerifier.ts
 │   │   └── validate.ts
 │   └── types.ts                 # Type definitions
 │
 ├── __tests__/                   # Jest test suite
 ├── package.json
 └── README.md
```

## 📜 License

MIT License © 2025 [Rookie Players]
