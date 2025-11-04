import { DriveParams, StorageProvider, StorageResult, UploadParams } from "./types";

export interface IStorageService {
  readonly provider: StorageProvider;
  uploadFile(objectParams: UploadParams, otherParams?: DriveParams): Promise<StorageResult>;
}