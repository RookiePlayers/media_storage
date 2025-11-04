# Media Storage Library

A powerful and modular **Node.js media storage library** that provides a unified interface for managing file uploads, integrity verification, and deletions across multiple providers — including **Cloudflare R2**, **Firebase Storage (GCS)**, and **Google Drive**.

---

## 🚀 Features

- 🔁 Unified API for multiple storage providers (R2, Firebase, Drive)
- 🔒 Automatic integrity verification with Subresource Integrity (SRI)
- 🧠 Smart caching and checksum validation (sha256)
- 🧩 Pluggable architecture for extending storage backends
- ⚙️ Strongly typed (TypeScript)

---

## 📦 Installation

```bash
npm install media-storage
```

or with yarn:

```bash
yarn add media-storage
```

---

## 🧰 Supported Providers

| Provider | Module | Notes |
|-----------|---------|-------|
| **Cloudflare R2** | `CloudFlareR2StorageService` | S3-compatible; uses `@aws-sdk/client-s3` |
| **Firebase Storage (GCS)** | `FirebaseStorageService` | Uses `@google-cloud/storage` |
| **Google Drive** | `GoogleDriveStorageService` | Uses `googleapis` Drive v3 |

---

## 🧠 Core Concepts

### 1. Storage Service
Each provider implements a subclass of `BaseStorageService` with a unified `uploadFile`, `deleteFile`, and optional `verifyStorage` API.

```ts
interface UploadParams {
  file: {
    name: string;
    data: Buffer;
    mimetype: string;
  };
  uploadPath?: string;
}
```

Example:

```ts
import { CloudFlareR2StorageService } from 'media-storage';

const svc = new CloudFlareR2StorageService();

const result = await svc.uploadFile({
  file: {
    name: 'example.png',
    mimetype: 'image/png',
    data: fs.readFileSync('example.png'),
  },
  uploadPath: 'assets',
});

console.log(result);
```

---

### 2. Integrity Verification

Every upload generates a **sha256 SRI hash** that can later be validated using the universal verifier:

```ts
import { verifyStorage } from 'media-storage';

const outcome = await verifyStorage(result, { r2: { s3: new S3Client() } });

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

## ⚙️ Environment Configuration

Environment variables are managed by the built-in `EnvironmentRegister` class. You can register them at runtime or load from process.env.

```ts
import EnvironmentRegister from 'media-storage/register';

const env = EnvironmentRegister.getInstance();
env.loadFromProcessEnv();
```

### Example `.env` file

```bash
R2_ACCOUNT_ID=your-account
R2_BUCKET=media
R2_ACCESS_KEY_ID=xxxx
R2_ACCESS_KEY_SECRET=xxxx
FIREBASE_STORAGE_BUCKET=my-app.appspot.com
GCP_SERVICE_ACCOUNT_KEY_BASE64=...base64...
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

---

## 🧱 Project Structure

```
media_storage/
 ├── src/
 │   ├── register/                # Environment config
 │   ├── services/                # Provider implementations
 │   │   ├── cloudFlareR2Storage.ts
 │   │   ├── firebaseStorage.ts
 │   │   └── googleDriveStorage.ts
 │   ├── utils/                   # Common utilities
 │   │   ├── encryptions.ts
 │   │   ├── universalIntegrityVerifier.ts
 │   │   └── validate.ts
 │   └── types/                   # Type definitions
 │
 ├── __tests__/                   # Jest test suite
 ├── package.json
 └── README.md
```



## 📜 License

MIT License © 2025 [Rookie Players]

