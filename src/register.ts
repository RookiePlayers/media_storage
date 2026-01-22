import { EnvironmentConfig } from "./types";

/**
 * A tiny registry for environment/config values with strong typing.
 * - Stores config as Partial<EnvironmentConfig>
 * - Provides set/get/require/merge utilities
 * - Optional hydration from process.env
 */
export default class EnvironmentRegister {
  private static instance: EnvironmentRegister;
  private environments: Partial<EnvironmentConfig>;
  private requiredKeys: Set<keyof EnvironmentConfig>;

  private constructor() {
    this.environments = {};
    this.requiredKeys = new Set();
  }

  public static getInstance(): EnvironmentRegister {
    if (!EnvironmentRegister.instance) {
      EnvironmentRegister.instance = new EnvironmentRegister();
    }
    return EnvironmentRegister.instance;
  }

  /**
   * Set a single key with type safety.
   */
  public registerEnvironment<K extends keyof EnvironmentConfig>(
    name: K,
    value: EnvironmentConfig[K]
  ): void {
    (this.environments as Record<string, unknown>)[name] = value;
  }

  /**
   * Merge many keys at once.
   */
  public registerEnvironments(configs: Partial<EnvironmentConfig>): void {
    this.environments = { ...this.environments, ...configs };
    console.log("[Media Storage] Registered environments:", Object.keys(configs));
  }

  /**
   * Get a value or throw a clear error (great for boot-time checks).
   */
  public require<K extends keyof EnvironmentConfig>(name: K): NonNullable<EnvironmentConfig[K]> {
    const value = this.getEnvironment(name);
    if (value === undefined || value === null || value === '') {
      throw new Error(`EnvironmentRegister: required key "${String(name)}" is missing`);
    }
    return value as NonNullable<EnvironmentConfig[K]>;
  }

  /**
   * Get a value (undefined if missing).
   */
  public getEnvironment<K extends keyof EnvironmentConfig>(
    name: K
  ): EnvironmentConfig[K] | undefined {
    return this.environments[name] as EnvironmentConfig[K] | undefined;
  }

  checkRequired(): void {
    const missing = Array.from(this.requiredKeys).filter(key => this.getEnvironment(key) === undefined);
    if (missing.length > 0) {
      throw new Error(`EnvironmentRegister: missing required keys: ${missing.join(", ")}`);
    }
  }

  public requiredSubset<K extends keyof EnvironmentConfig>(
    keys: K[]
  ): { [P in K]: NonNullable<EnvironmentConfig[P]> } {
    const result = {} as { [P in K]: NonNullable<EnvironmentConfig[P]> };
    keys.forEach((key) => {
      this.requiredKeys.add(key);
      result[key] = this.require(key);
    });
    return result;
  }

  /**
   * Return a read-only snapshot.
   */
  public getAllEnvironments(): Readonly<Partial<EnvironmentConfig>> {
    return Object.freeze({ ...this.environments });
  }

  /**
   * Optional: hydrate from process.env once (idempotent).
   * Map env vars -> your typed keys here.
   */
  public loadFromProcessEnv(): void {
    const map: Partial<EnvironmentConfig> = {
      firebase_service_account_key_base64: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
      firebase_storage_bucket: process.env.FIREBASE_STORAGE_BUCKET,

      gcp_service_account_key_base64: process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64,
      gcp_drive_scopes: process.env.GCP_DRIVE_SCOPES, // e.g. "https://www.googleapis.com/auth/drive"
      gcp_oauth_access_token: process.env.GCP_OAUTH_ACCESS_TOKEN,
      gcp_oauth_refresh_token: process.env.GCP_OAUTH_REFRESH_TOKEN,
      gcp_oauth_client_id: process.env.GCP_OAUTH_CLIENT_ID,
      gcp_oauth_client_secret: process.env.GCP_OAUTH_CLIENT_SECRET,

      r2_account_id: process.env.R2_ACCOUNT_ID,
      r2_bucket: process.env.R2_BUCKET,
      r2_access_key_id: process.env.R2_ACCESS_KEY_ID,
      r2_access_key_secret: process.env.R2_SECRET ?? process.env.R2_ACCESS_KEY_SECRET,
      r2_cdn_base: process.env.R2_CDN_BASE ?? process.env.CDN_BASE,
    };
    this.registerEnvironments(map);
  }
}
