import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { S3Client } from "@aws-sdk/client-s3";
import { CloudFlareR2StorageService } from "../src/services/cloudFlareR2Storage";
import { FirebaseStorageService } from "../src/services/firebaseStorage";
import { GoogleDriveStorageService } from "../src/services/googleDriveStorage";
import { MediaStorage } from "../src/MediaStorage";
import { UploadedPart } from "../src/types";

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
        if (process.env.DELETE_AFTER_UPLOAD === 'true') {
            const fileId = result.locator?.provider === 'drive' ? result.locator.fileId : undefined;
            if (fileId) {
                gd_storage.deleteFile(fileId).then(() => {
                    console.log('Drive file deleted');
                }).catch(err => console.error('Drive delete error:', err));
            }
        }
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
            const key = result.locator?.provider === 'r2' ? result.locator.key : undefined;
            if (key) {
                await r2_storage.deleteFile(undefined, key);
                console.log('R2 file deleted');
            }
        }
    }).catch(err => {
        console.error('R2 upload error:', err);
    })

    // ── Multipart upload: explicit opt-in ─────────────────────────────────────
    // Force multipart even for a small file by passing `multipart: {}`.
    // Useful for verifying the multipart code path without needing a large file.
    r2_storage.uploadFile({
        file: {
            name: 'multipart-explicit.bin',
            mimetype: 'application/octet-stream',
            // 6 MB: two 5 MB-minimum parts (part 1 = 5 MB, part 2 = 1 MB)
            data: Buffer.alloc(6 * 1024 * 1024, 0xab),
        },
        uploadPath: 'example/multipart',
        multipart: {
            chunkSizeMB: 5,  // 5 MB chunks (S3/R2 minimum)
            retries: 2,
        },
    }).then(async result => {
        console.log('R2 multipart (explicit) uploaded:', result);
        if (process.env.DELETE_AFTER_UPLOAD === 'true') {
            const key = result.locator?.provider === 'r2' ? result.locator.key : undefined;
            if (key) {
                await r2_storage.deleteFile(undefined, key);
                console.log('R2 multipart (explicit) deleted');
            }
        }
    }).catch(err => {
        console.error('R2 multipart (explicit) error:', err);
    });

    // ── Multipart upload: auto-threshold ──────────────────────────────────────
    // Trigger multipart automatically by lowering the threshold to 5 MB.
    // In production the default is 100 MB; here we lower it to prove the
    // auto-detection path without allocating 100+ MB in the example.
    r2_storage.uploadFile({
        file: {
            name: 'multipart-auto.bin',
            mimetype: 'application/octet-stream',
            // 12 MB: exceeds the 5 MB threshold → auto-multipart (3 × 5 MB parts, last partial)
            data: Buffer.alloc(12 * 1024 * 1024, 0xcd),
        },
        uploadPath: 'example/multipart',
        multipart: {
            thresholdMB: 5,   // auto-enable multipart above 5 MB
            chunkSizeMB: 5,
            retries: 3,
        },
    }).then(async result => {
        console.log('R2 multipart (auto-threshold) uploaded:', result);
        if (process.env.DELETE_AFTER_UPLOAD === 'true') {
            const key = result.locator?.provider === 'r2' ? result.locator.key : undefined;
            if (key) {
                await r2_storage.deleteFile(undefined, key);
                console.log('R2 multipart (auto-threshold) deleted');
            }
        }
    }).catch(err => {
        console.error('R2 multipart (auto-threshold) error:', err);
    });

    // ── Client-driven multipart upload ────────────────────────────────────────
    // Simulates a client that slices the file itself and sends chunks one by one.
    // This is the pattern for large browser uploads or resumable pipelines where
    // the full file buffer is never held in memory all at once.
    (async () => {
        const r2Service = r2_storage.getStorageService() as CloudFlareR2StorageService;

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
        const fileData = Buffer.alloc(12 * 1024 * 1024, 0xef); // 12 MB test file
        const key = 'example/multipart/client-driven.bin';

        const session = await r2Service.initiateMultipartUpload({
            key,
            contentType: 'application/octet-stream',
        });
        console.log('Client-driven session started:', session);

        const collectedParts: UploadedPart[] = [];
        try {
            for (let i = 0; i * CHUNK_SIZE < fileData.length; i++) {
                const chunk = fileData.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const part = await r2Service.uploadChunk({
                    uploadId: session.uploadId,
                    key: session.key,
                    partNumber: i + 1,
                    data: chunk,
                });
                collectedParts.push(part);
                console.log(`  Part ${part.partNumber} uploaded (${chunk.length} bytes), ETag: ${part.etag}`);
            }

            const result = await r2Service.completeMultipartUpload({
                uploadId: session.uploadId,
                key: session.key,
                parts: collectedParts,
                contentType: 'application/octet-stream',
                sizeBytes: fileData.length,
            });
            console.log('Client-driven upload complete:', result);

            if (process.env.DELETE_AFTER_UPLOAD === 'true') {
                await r2_storage.deleteFile(undefined, key);
                console.log('Client-driven upload deleted');
            }
        } catch (err) {
            console.error('Client-driven upload failed, aborting session:', err);
            await r2Service.abortMultipartUpload(session);
        }
    })();

    // ── Firebase client-driven multipart upload ───────────────────────────────
    // GCS resumable uploads require chunks that are multiples of 256 KiB
    // (except the final chunk). 5 MB = 20 × 256 KiB, so it qualifies
    // `sizeBytes` must be passed to completeMultipartUpload so GCS can finalize.
    (async () => {
        const fbService = fb_storage.getStorageService() as FirebaseStorageService;

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB — valid GCS chunk size (multiple of 256 KiB)
        const fileData = Buffer.alloc(12 * 1024 * 1024, 0xfe); // 12 MB test file
        const objectPath = `example/multipart/firebase-client-driven.bin`;

        const session = await fbService.initiateMultipartUpload({
            key: objectPath,
            contentType: 'application/octet-stream',
        });
        console.log('Firebase client-driven session started:', session.uploadId.slice(0, 80) + '…');

        const collectedParts: UploadedPart[] = [];
        try {
            for (let i = 0; i * CHUNK_SIZE < fileData.length; i++) {
                const chunk = fileData.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const part = await fbService.uploadChunk({
                    uploadId: session.uploadId,
                    key: session.key,
                    partNumber: i + 1,
                    data: chunk,
                });
                collectedParts.push(part);
                console.log(`  Firebase part ${part.partNumber} uploaded (${chunk.length} bytes)`);
            }

            const result = await fbService.completeMultipartUpload({
                uploadId: session.uploadId,
                key: session.key,
                parts: collectedParts,
                contentType: 'application/octet-stream',
                sizeBytes: fileData.length,
            });
            console.log('Firebase client-driven upload complete:', result);

            if (process.env.DELETE_AFTER_UPLOAD === 'true') {
                await fb_storage.deleteFile(undefined, objectPath);
                console.log('Firebase client-driven upload deleted');
            }
        } catch (err) {
            console.error('Firebase client-driven upload failed, aborting session:', err);
            await fbService.abortMultipartUpload(session);
        }
    })();

    const app = express();
    app.use(express.json());

    app.listen(3000, () => {
        console.log('Server started on http://localhost:3000');
    }); 

}

init();
