import { IStorageService } from "./iStorage";
import EnvironmentRegister from "./register";
import { DeletionResult, EnvironmentConfig, UploadParams } from "./types";

/**
 * Thin wrapper binding a storage service to a config snapshot.
 */
export class MediaStorage {
  private mediaStorage: IStorageService;

  constructor({
    config,
    service,
    hydrateFromEnv = false,
  }: {
    config?: Partial<EnvironmentConfig>;
    service: IStorageService;
    hydrateFromEnv?: boolean;
  }) {
    const env = EnvironmentRegister.getInstance();
    if (hydrateFromEnv) env.loadFromProcessEnv();
    if (config) env.registerEnvironments(config);
    if ('init' in service && typeof service.init === 'function') {
      void service.init();
    }
    env.checkRequired();
    this.mediaStorage = service;
  }

  public getStorageService(): IStorageService {
    return this.mediaStorage;
  }

  public uploadFile(params: UploadParams) {
    return this.mediaStorage.uploadFile(params);
  }

  public deleteFile(fileId?: string, filePath?: string): Promise<DeletionResult> {
    return this.mediaStorage.deleteFile(fileId, filePath);
  }
}
