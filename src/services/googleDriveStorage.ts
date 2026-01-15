/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GoogleDriveStorageService
 *
 * A singleton wrapper around the Google Drive API for uploading files and returning
 * publicly accessible URLs. Works with Service Account credentials via `googleapis`.
 *
 * Supports both regular "My Drive" and Shared Drives (Team Drives)
 * using the `shouldSupportSharedDrives` flag.
 */

import { drive as gdrive } from 'googleapis/build/src/apis/drive';
import { GCPConfig } from '../config/gcp_config';
import { DeletionResult, DriveParams, StorageProvider, StorageResult, UploadParams, bufferToStream } from '../types';
import { computeSRI, hashString } from '../utils/encryptions';
import { IStorageService } from '../iStorage';
import { BaseStorageService } from '../utils/baseStorage';
import { verifyStorage } from '../utils/universalIntegrityVerifier';


export class GoogleDriveStorageService extends BaseStorageService implements IStorageService {

  provider: StorageProvider = 'drive';
  private auth: any;
  
  constructor() {
    super();
  }

  init(): Promise<void> {
      
    this.auth = GCPConfig().auth;
    return Promise.resolve();
  }

  async deleteFile(fileId?: string, filePath?: string): Promise<DeletionResult> {
    await this.init();
    const id = fileId ?? filePath;
    if (!id) {
      return { success: false, message: 'fileId is required for Drive delete.' };
    }

    const drive = gdrive({
      version: 'v3',
      auth: this.auth,
    });

    try {
      await drive.files.delete({
        fileId: id,
        supportsAllDrives: false,
      });
      return { success: true };
    } catch (err: any) {
      if (err?.code === 404) {
        return { success: true, message: 'File not found in Drive.' };
      }
      throw err;
    }
  }

  /**
   * Grants public read permission for a file and returns useful links.
   */
  private async generatePublicUrlForDrive({
    googleResponse,
    params,
  }: {
    googleResponse: any;
    params?: DriveParams;
  }) {
    try {
      const drive = gdrive({
        version: params?.version ?? 'v3',
        auth: this.auth,
      });


      await drive.permissions.create({
        fileId: googleResponse.id,
        requestBody: params?.requestBody ?? {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: params?.shouldSupportSharedDrives ?? false,
      });

      const result = await drive.files.get({
        fileId: googleResponse.id,
        fields: 'webViewLink, webContentLink',
        supportsAllDrives: params?.shouldSupportSharedDrives ?? false,
      });

      const publicUrl = `https://drive.google.com/uc?export=view&id=${googleResponse.id}`;

      return {
        webViewLink: result.data.webViewLink,
        webContentLink: result.data.webContentLink,
        publicUrl,
      };
    } catch (e) {
      console.error('Failed to set public permission or fetch links:', e);
      return null;
    }
  }

  /**
   * Uploads a file to Google Drive and returns public links + a hashed key.
   *
   * @param objectParams - Upload parameters
   * @param otherParams - Advanced Drive params:
   *   - `shouldSupportSharedDrives?`: enable Shared Drive support (requires Service Account access)
   */
 async uploadFile(objectParams: UploadParams, otherParams?: DriveParams): Promise<StorageResult> {

    const drive = gdrive({
      version: otherParams?.version ?? 'v3',
      auth: this.auth,
    });

    try {
      const parents = objectParams.parentPathIds ?? [`OBJ_${Date.now()}`];

      const fileMetadata = { name: objectParams.file.name, parents };
      const media = { mimeType: objectParams.file.mimetype, body: bufferToStream(objectParams.file.data) };

      // If uploading to a Shared Drive, ensure Service Account has access.
      const shouldSupportSharedDrives =
        otherParams?.shouldSupportSharedDrives ?? false;

      const resp = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: "id",
        supportsAllDrives: shouldSupportSharedDrives,
      });
      const links = await this.generatePublicUrlForDrive({
        googleResponse: resp.data,
        params:  {
            requestBody: {
            role: otherParams?.requestBody.role ?? 'reader',
            type: otherParams?.requestBody.type ?? 'anyone',
            },
            fileId: otherParams?.fileId ?? 'id',
            version: otherParams?.version ?? 'v3',
            shouldSupportSharedDrives,
        }
      });

      const buffer = Buffer.from(objectParams.file.data);
      const integrity = computeSRI(buffer, 'sha256');

      const filePath = `${parents.join('/')}/${objectParams.file.name}`;
      const result = this.finalizeResult(
        {
          downloadUrl: links?.webContentLink ?? '',
          url: links?.publicUrl ?? '',
          key: hashString(objectParams.file.name),
          integrity,
          sizeBytes: buffer.length,
          locator: {
            provider: 'drive',
            fileId: resp.data.id!,
            filePath,
            shouldSupportSharedDrives,
          },
          provider: 'drive',
        },
        {}
      );

      // UNIVERSAL VERIFY
      const outcome = await verifyStorage(result, {
        drive: { client: drive },
      });

      if (!outcome.exists) {
        throw new Error(`verifyStorage: Drive file not found after upload (id=${resp.data.id})`);
      }
      // Drive integrity usually 'unknown' (it exposes md5Checksum, not sha256). We still assert existence/size.
      if (outcome.sizeMatches === false) {
        throw new Error('verifyStorage: size mismatch after upload (drive)');
      }

      return result;
    } catch (e) {
      throw e;
    }
  }
}
