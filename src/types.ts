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


export interface StorageLocatorR2 {
  provider: 'r2';
  bucket: string;
  key: string;             // R2 object key
}

export interface StorageLocatorFirebase {
  provider: 'firebase';
  bucket: string;
  objectPath: string;      // gs://<bucket>/<objectPath> (no "gs://")
}

export interface StorageLocatorDrive {
  provider: 'drive';
  fileId: string;
  shouldSupportSharedDrives?: boolean; // aka Team Drives
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
  r2_account_id?: string;
  r2_bucket?: string;
  r2_access_key_secret?: string;
  r2_access_key_id?: string;
  r2_cdn_base?: string;
}