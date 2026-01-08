import EnvironmentRegister from '../src/register';

const mockInitializeApp = jest.fn();
const mockGetApp = jest.fn();
const mockGetApps = jest.fn();
const mockCert = jest.fn();
const mockGetStorage = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApp: (...args: unknown[]) => mockGetApp(...args),
  getApps: (...args: unknown[]) => mockGetApps(...args),
  cert: (...args: unknown[]) => mockCert(...args),
}));

jest.mock('firebase-admin/storage', () => ({
  getStorage: (...args: unknown[]) => mockGetStorage(...args),
}));

describe('FirebaseConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips cert when service account env is missing', () => {
    const apps: Array<{ name: string }> = [];
    mockGetApps.mockImplementation(() => apps);
    mockInitializeApp.mockImplementation((config: unknown) => {
      const app = { name: 'default', config };
      apps.push(app);
      return app;
    });
    mockGetApp.mockImplementation(() => apps[0]);

    EnvironmentRegister.getInstance().registerEnvironments({
      firebase_service_account_key_base64: '',
      firebase_storage_bucket: 'bucket',
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { FirebaseConfig } = require('../src/config/firebase_config');
    FirebaseConfig();

    expect(mockCert).not.toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ storageBucket: 'bucket' })
    );
    expect(mockGetStorage).toHaveBeenCalledWith(apps[0]);

    errorSpy.mockRestore();
  });

  it('reuses the existing app across calls', () => {
    const apps: Array<{ name: string }> = [];
    mockGetApps.mockImplementation(() => apps);
    mockInitializeApp.mockImplementation((config: unknown) => {
      const app = { name: 'default', config };
      apps.push(app);
      return app;
    });
    mockGetApp.mockImplementation(() => apps[0]);
    mockCert.mockReturnValue({ kind: 'cert' });

    const base64 = Buffer.from(
      JSON.stringify({
        project_id: 'demo',
        client_email: 'demo@example.com',
        private_key: 'fake',
      })
    ).toString('base64');

    EnvironmentRegister.getInstance().registerEnvironments({
      firebase_service_account_key_base64: base64,
      firebase_storage_bucket: 'bucket',
    });

    const { FirebaseConfig } = require('../src/config/firebase_config');
    FirebaseConfig();
    FirebaseConfig();

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockGetApp).toHaveBeenCalledTimes(1);
    expect(mockGetStorage).toHaveBeenCalledTimes(2);
    expect(mockGetStorage).toHaveBeenCalledWith(apps[0]);
  });
});
