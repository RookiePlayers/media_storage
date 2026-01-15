import { DeletionResult, DriveParams, StorageProvider, StorageResult, UploadParams } from "./types";

export interface IStorageService {
  readonly provider: StorageProvider;
  init(): Promise<void>;
  deleteFile(fileId?: string, filePath?: string): Promise<DeletionResult>;
  uploadFile(objectParams: UploadParams, otherParams?: DriveParams): Promise<StorageResult>;
}