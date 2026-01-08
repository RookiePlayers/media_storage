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
npm install universal_media_storage
```

or with yarn:

```bash
yarn add universal_media_storage
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
Each provider implements a subclass of `BaseStorageService` with a unified `uploadFile` API. For deletions across providers, use the `deleteFileFromStorage` helper with a `StorageResult.locator`.

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
}
```

Example:

```ts
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { S3Client } from "@aws-sdk/client-s3";
import { CloudFlareR2StorageService } from "../src/services/cloudFlareR2Storage";
import { FirebaseStorageService } from "../src/services/firebaseStorage";
import { GoogleDriveStorageService } from "../src/services/googleDriveStorage";
import {MediaStorage} from "../src/MediaStorage";
import { deleteFileFromStorage } from "../src/utils/deleteFileFromStorage";

function init() {
    const fb_storage =new MediaStorage(
        {
            config: {
                'firebase_service_account_key_base64': process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',
                'firebase_storage_bucket': process.env.FIREBASE_STORAGE_BUCKET || '',
            
            },
            service: new FirebaseStorageService()
        }
    );
    const r2_storage = new MediaStorage({
        service:new CloudFlareR2StorageService(),
        config:{
            r2_account_id: process.env.R2_ACCOUNT_ID || '',
            r2_bucket: process.env.R2_BUCKET || '',
            r2_access_key_id: process.env.R2_ACCESS_KEY_ID || '',
            r2_access_key_secret: process.env.R2_ACCESS_KEY_SECRET || '',
            r2_cdn_base: process.env.R2_CDN_BASE || '',
        }
    })
    const gd_storage = new MediaStorage({
        service:new GoogleDriveStorageService(),
        config:{
            gcp_service_account_key_base64: process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 || '',
            gcp_drive_scopes: process.env.GCP_DRIVE_SCOPES || '',
        }
    })

    const r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_ACCESS_KEY_SECRET || '',
        },
    });
    gd_storage.uploadFile({
        // For Google Drive, you can specify parent folder IDs to organize files
        parentPathIds:[
            process.env.PARENT_FOLDER_ID || ''
        ],
        //--------------------------------------
        file: {
            name: 'test.txt',
            mimetype: 'text/plain',
            data: Buffer.from('Hello, world!')
        },
        uploadPath: 'test'
    }).then(result => {
        console.log('File uploaded:', result);
    }).catch(err => {
        console.error('Upload error:', err);
    })

    r2_storage.uploadFile({
        file: {
            name: 'delete-me.txt',
            mimetype: 'text/plain',
            data: Buffer.from('Delete me after upload'),
        },
        uploadPath: 'example',
    }).then(async result => {
        console.log('R2 file uploaded:', result);

        if (process.env.DELETE_AFTER_UPLOAD === 'true') {
            await deleteFileFromStorage(result, { r2: { s3: r2Client } });
            console.log('R2 file deleted');
        }
    }).catch(err => {
        console.error('R2 upload error:', err);
    })
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

### 3. Deleting Files (Universal)

Use the `deleteFileFromStorage` helper with the `locator` returned by `uploadFile`.

```ts
import { deleteFileFromStorage } from 'media-storage';
import { S3Client } from '@aws-sdk/client-s3';

const r2Client = new S3Client({ region: 'auto', endpoint: 'https://<account>.r2.cloudflarestorage.com' });

await deleteFileFromStorage(result, { r2: { s3: r2Client } });
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
CDN_BASE=https://cdn.example.com
FIREBASE_STORAGE_BUCKET=my-app.appspot.com
FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=...base64...
GCP_SERVICE_ACCOUNT_KEY_BASE64=...base64...
GCP_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file
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
