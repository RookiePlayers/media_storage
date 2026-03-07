import {
  CompleteMultipartParams,
  DeletionResult,
  DriveParams,
  InitiateMultipartParams,
  MultipartSession,
  StorageProvider,
  StorageResult,
  UploadChunkParams,
  UploadParams,
  UploadedPart,
} from "./types";

export interface IStorageService {
  readonly provider: StorageProvider;
  init(): Promise<void>;
  deleteFile(fileId?: string, filePath?: string): Promise<DeletionResult>;
  uploadFile(objectParams: UploadParams, otherParams?: DriveParams): Promise<StorageResult>;
  getPresignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
  getPresignedUploadUrl?(
    key: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<string>;
  /** Begin a client-driven multipart upload session. */
  initiateMultipartUpload?(params: InitiateMultipartParams): Promise<MultipartSession>;
  /** Upload a single chunk. Returns the ETag for that part. */
  uploadChunk?(params: UploadChunkParams): Promise<UploadedPart>;
  /** Finalise the upload once all chunks have been sent. */
  completeMultipartUpload?(params: CompleteMultipartParams): Promise<StorageResult>;
  /** Abort and clean up an in-progress multipart session. */
  abortMultipartUpload?(session: MultipartSession): Promise<void>;
}
