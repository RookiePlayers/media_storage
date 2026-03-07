/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "stream";

export const bufferToStream = (buffer: any)=>{
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export type DriveParams = {
    requestBody: {
        role: string;
        type: string;
    };
    fileId: string;
    version: "v3";
    shouldSupportSharedDrives: boolean;
}

export type MultipartOptions = {
  /** Chunk size in MB. Minimum 5 MB (S3/R2 requirement). Defaults to 10 MB. */
  chunkSizeMB?: number;
  /** File size threshold in MB for using multipart upload. Defaults to 100 MB. */
  thresholdMB?: number;
  /** How many times to retry a failed chunk before aborting. Defaults to 3. */
  retries?: number;
};

export type UploadParams = {
  file:{
    name: string;
    mimetype: string;
    data: Buffer;
    uri?: string;
  },
  uploadPath?: string;
  parentPathIds?: string[];
  cacheControl?: string;
  /**
   * Enable multipart/chunked upload. If omitted, multipart is used automatically
   * for files larger than 100 MB on providers that support it.
   */
  multipart?: MultipartOptions;
}

// types.ts
export type IntegrityAlgo = 'sha256' | 'sha384' | 'sha512' ;
export type StorageProvider = 'r2' | 'firebase' | 'drive';


/** Subresource Integrity (SRI) format: e.g. "sha256-BASE64" */
export type SRI = `${IntegrityAlgo}-${string}`;


export type StorageResult = {
  downloadUrl: string;
  url: string;
  key?: string;
  integrity?: string;
  sizeBytes?: number;
  locator?: StorageLocator;
  provider?: StorageProvider; // helpful redundancy
};

export type DeletionResult = {
  success: boolean;
  message?: string;
}

/** Returned by initiateMultipartUpload — pass uploadId + key to each chunk call */
export type MultipartSession = {
  uploadId: string;
  key: string;
};

/** Returned per chunk — collect all and pass to completeMultipartUpload */
export type UploadedPart = {
  partNumber: number;
  etag: string;
};

export type InitiateMultipartParams = {
  key: string;
  contentType: string;
  cacheControl?: string;
  /** Store sha256 hex in object metadata for later integrity verification */
  sha256Hex?: string;
};

export type UploadChunkParams = {
  uploadId: string;
  key: string;
  /** 1-based part number */
  partNumber: number;
  data: Buffer;
};

export type CompleteMultipartParams = {
  uploadId: string;
  key: string;
  parts: UploadedPart[];
  contentType: string;
  sizeBytes?: number;
  integrity?: string;
};

export interface StorageLocatorR2 {
  provider: 'r2';
  bucket: string;
  key: string;             // R2 object key
  fileId?: string;
  filePath?: string;
}

export interface StorageLocatorFirebase {
  provider: 'firebase';
  bucket: string;
  objectPath: string;      // gs://<bucket>/<objectPath> (no "gs://")
  fileId?: string;
  filePath?: string;
}

export interface StorageLocatorDrive {
  provider: 'drive';
  fileId: string;
  shouldSupportSharedDrives?: boolean; // aka Team Drives
  filePath?: string;
}

export type StorageLocator =
  | StorageLocatorR2
  | StorageLocatorFirebase
  | StorageLocatorDrive;


export type EnvironmentConfig = {
  firebase_service_account_key_base64?: string;
  firebase_storage_bucket?: string;
  gcp_service_account_key_base64?: string;
  gcp_drive_scopes?: string;
  gcp_oauth_access_token?: string;
  gcp_oauth_refresh_token?: string;
  gcp_oauth_client_id?: string;
  gcp_oauth_client_secret?: string;
  r2_account_id?: string;
  r2_bucket?: string;
  r2_access_key_secret?: string;
  r2_access_key_id?: string;
  r2_cdn_base?: string;
}
