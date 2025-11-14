import { DriveParams, StorageProvider, StorageResult, UploadParams } from "./types";

export interface IStorageService {
  readonly provider: StorageProvider;
  init(): Promise<void>;
  uploadFile(objectParams: UploadParams, otherParams?: DriveParams): Promise<StorageResult>;
}