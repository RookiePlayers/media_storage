// services/baseStorage.ts

import { StorageResult, IntegrityAlgo } from "../types";
import { computeSRI } from "./encryptions";
import { assertHasIntegrity } from "./validate";


export abstract class BaseStorageService {
  async getPresignedUrl(_key: string, _expiresInSeconds = 900): Promise<string> {
    void _expiresInSeconds;
    throw new Error('Presigned URLs are not supported by this storage provider.');
  }

  async getPresignedUploadUrl(
    _key: string,
    _contentType: string,
    _expiresInSeconds = 900
  ): Promise<string> {
    void _expiresInSeconds;
    throw new Error('Presigned upload URLs are not supported by this storage provider.');
  }

  protected finalizeResult(
    {
      url,
      downloadUrl,
      key,
      integrity,
      locator,
      sizeBytes,
    }: Partial<StorageResult> & Pick<StorageResult, 'url' | 'downloadUrl' | 'key'>,
    {
      data,
      algo = 'sha256' as IntegrityAlgo,
    }: { data?: Buffer | Uint8Array | ArrayBuffer; algo?: IntegrityAlgo } = {}
  ): StorageResult {
    const sri = integrity ?? (data ? computeSRI(data, algo) : undefined);
    if (!sri) {
      throw new Error('Integrity missing and no data provided to compute it');
    }
    return assertHasIntegrity({
      url,
      downloadUrl,
      key,
      integrity: sri,
      sizeBytes,
      locator,
    });
  }
}
