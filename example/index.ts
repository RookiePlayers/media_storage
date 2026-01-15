import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { S3Client } from "@aws-sdk/client-s3";
import { CloudFlareR2StorageService } from "../src/services/cloudFlareR2Storage";
import { FirebaseStorageService } from "../src/services/firebaseStorage";
import { GoogleDriveStorageService } from "../src/services/googleDriveStorage";
import {MediaStorage} from "../src/MediaStorage";

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
    const app = express();
    app.use(express.json());

    app.listen(3000, () => {
        console.log('Server started on http://localhost:3000');
    }); 

}

init();
