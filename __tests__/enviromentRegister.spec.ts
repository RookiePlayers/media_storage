// __tests__/environmentRegister.spec.ts
import EnvironmentRegister from '../src/register';
import type { EnvironmentConfig } from '../src/types';

describe('EnvironmentRegister', () => {
  const ORIG_ENV = process.env;

  beforeEach(() => {
    // Fresh copy of process.env (don’t mutate global reference)
    process.env = { ...ORIG_ENV };
    // Reset the singleton between tests
    (EnvironmentRegister as any).instance = undefined;
  });

  afterAll(() => {
    process.env = ORIG_ENV;
  });

  test('singleton: getInstance returns the same instance', () => {
    const a = EnvironmentRegister.getInstance();
    const b = EnvironmentRegister.getInstance();
    expect(a).toBe(b);
  });

  test('registerEnvironment + getEnvironment store and read typed values', () => {
    const reg = EnvironmentRegister.getInstance();

    reg.registerEnvironment('r2_account_id', 'acc-123');
    reg.registerEnvironment('r2_bucket', 'bucket-x');

    expect(reg.getEnvironment('r2_account_id')).toBe('acc-123');
    expect(reg.getEnvironment('r2_bucket')).toBe('bucket-x');

    // not set → undefined
    expect(reg.getEnvironment('gcp_drive_scopes')).toBeUndefined();
  });

  test('registerEnvironments merges multiple keys (non-destructive)', () => {
    const reg = EnvironmentRegister.getInstance();

    reg.registerEnvironment('r2_account_id', 'old');
    reg.registerEnvironments({
      r2_bucket: 'b',
      r2_account_id: 'new', // should overwrite this one
    });

    expect(reg.getEnvironment('r2_account_id')).toBe('new');
    expect(reg.getEnvironment('r2_bucket')).toBe('b');
  });

  test('require throws a clear error when missing', () => {
    const reg = EnvironmentRegister.getInstance();

    expect(() => reg.require('r2_account_id')).toThrow(
      'EnvironmentRegister: required key "r2_account_id" is missing'
    );

    reg.registerEnvironment('r2_account_id', 'acc-777');
    expect(reg.require('r2_account_id')).toBe('acc-777');
  });

  test('requiredSubset returns a typed object and throws if any key is missing', () => {
    const reg = EnvironmentRegister.getInstance();

    reg.registerEnvironments({
      r2_account_id: 'acc',
      r2_bucket: 'my-bucket',
    });

    const subset = reg.requiredSubset(['r2_account_id', 'r2_bucket']);
    expect(subset).toEqual({
      r2_account_id: 'acc',
      r2_bucket: 'my-bucket',
    });

    // missing key → throws
    expect(() => reg.requiredSubset(['r2_account_id', 'r2_access_key_id'])).toThrow(
      'EnvironmentRegister: required key "r2_access_key_id" is missing'
    );
  });

  test('getAllEnvironments returns an immutable snapshot', () => {
  const reg = EnvironmentRegister.getInstance();
  reg.registerEnvironments({
    r2_account_id: 'acc',
    r2_bucket: 'bkt',
  });

  const snap = reg.getAllEnvironments();
  expect(snap).toEqual({ r2_account_id: 'acc', r2_bucket: 'bkt' });

  // It's a frozen snapshot
  expect(Object.isFrozen(snap)).toBe(true);

  // Attempting to mutate should throw (frozen object)
  expect(() => {
    (snap as any).r2_bucket = 'mutated';
  }).toThrow(TypeError);

  // Internal state remains unchanged
  const freshSnap = reg.getAllEnvironments();
  expect(freshSnap).toEqual({ r2_account_id: 'acc', r2_bucket: 'bkt' });
});

  test('loadFromProcessEnv maps variables and is idempotent', () => {
    // Arrange env vars
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 = 'fb64';
    process.env.FIREBASE_STORAGE_BUCKET = 'fb-bucket';

    process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 = 'gcp64';
    process.env.GCP_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive';

    process.env.R2_ACCOUNT_ID = 'r2-acc';
    process.env.R2_BUCKET = 'r2-bkt';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET = 'r2-secret';
    process.env.CDN_BASE = 'https://cdn.example.com';

    const reg = EnvironmentRegister.getInstance();

    // First load
    reg.loadFromProcessEnv();

    expect(reg.getEnvironment('firebase_service_account_key_base64')).toBe('fb64');
    expect(reg.getEnvironment('firebase_storage_bucket')).toBe('fb-bucket');

    expect(reg.getEnvironment('gcp_service_account_key_base64')).toBe('gcp64');
    expect(reg.getEnvironment('gcp_drive_scopes')).toBe(
      'https://www.googleapis.com/auth/drive'
    );

    expect(reg.getEnvironment('r2_account_id')).toBe('r2-acc');
    expect(reg.getEnvironment('r2_bucket')).toBe('r2-bkt');
    expect(reg.getEnvironment('r2_access_key_id')).toBe('r2-key');
    expect(reg.getEnvironment('r2_access_key_secret')).toBe('r2-secret');
    expect(reg.getEnvironment('r2_cdn_base')).toBe('https://cdn.example.com');

    // Change a process.env var, then load again (idempotent merge behavior)
    process.env.R2_BUCKET = 'r2-bkt-2';
    reg.loadFromProcessEnv();

    expect(reg.getEnvironment('r2_bucket')).toBe('r2-bkt-2');
  });

  test('loadFromProcessEnv supports R2_ACCESS_KEY_SECRET fallback via R2_SECRET', () => {
    const reg = EnvironmentRegister.getInstance();

    // Only set R2_SECRET, not R2_ACCESS_KEY_SECRET
    process.env.R2_SECRET = 'secret-via-fallback';
    delete process.env.R2_ACCESS_KEY_SECRET;

    reg.loadFromProcessEnv();

    expect(reg.getEnvironment('r2_access_key_secret')).toBe('secret-via-fallback');
  });
});