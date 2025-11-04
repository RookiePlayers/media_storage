import { BaseStorageService } from '../src/utils/baseStorage';
import type { IntegrityAlgo, StorageResult } from '../src/types';

// Mocks for dependencies used inside BaseStorageService
const computeSRI = jest.fn();
const assertHasIntegrity = jest.fn((x) => x);

jest.mock('../src/utils/encryptions', () => ({
  computeSRI: (...args: any[]) => (computeSRI as any)(...args),
}));

jest.mock('../src/utils/validate', () => ({
  assertHasIntegrity: (...args: any[]) => (assertHasIntegrity as any)(...args),
}));

class TestService extends BaseStorageService {
  public runFinalize(
    core: Partial<StorageResult> & Pick<StorageResult, 'url' | 'downloadUrl' | 'key'>,
    opts?: { data?: Buffer | Uint8Array | ArrayBuffer; algo?: IntegrityAlgo }
  ) {
    // expose the protected method for testing
    // @ts-ignore
    return this.finalizeResult(core, opts);
  }
}

describe('BaseStorageService.finalizeResult', () => {
  const svc = new TestService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns result using provided integrity without calling computeSRI', () => {
    const input = {
      url: 'https://cdn/x',
      downloadUrl: 'https://cdn/x',
      key: 'abc',
      integrity: 'sha256-DEADBEEF==',
      sizeBytes: 123,
      locator: { provider: 'r2', bucket: 'b', key: 'k' as any },
    } as any;

    const out = svc.runFinalize(input);

    expect(computeSRI).not.toHaveBeenCalled();
    expect(assertHasIntegrity).toHaveBeenCalledTimes(1);
    expect(assertHasIntegrity).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn/x',
        downloadUrl: 'https://cdn/x',
        key: 'abc',
        integrity: 'sha256-DEADBEEF==',
        sizeBytes: 123,
        locator: { provider: 'r2', bucket: 'b', key: 'k' },
      })
    );
    expect(out).toEqual(
      expect.objectContaining({
        url: 'https://cdn/x',
        downloadUrl: 'https://cdn/x',
        key: 'abc',
        integrity: 'sha256-DEADBEEF==',
        sizeBytes: 123,
        locator: { provider: 'r2', bucket: 'b', key: 'k' },
      })
    );
  });

  it('computes integrity from data when missing (default sha256)', () => {
    computeSRI.mockReturnValueOnce('sha256-COMPUTED==');

    const data = Buffer.from('hello');
    const out = svc.runFinalize(
      {
        url: 'u',
        downloadUrl: 'u',
        key: 'k',
        sizeBytes: data.length,
      },
      { data } // no algo provided -> defaults to 'sha256'
    );

    expect(computeSRI).toHaveBeenCalledTimes(1);
    expect(computeSRI).toHaveBeenCalledWith(data, 'sha256');
    expect(assertHasIntegrity).toHaveBeenCalledWith(
      expect.objectContaining({
        integrity: 'sha256-COMPUTED==',
        sizeBytes: data.length,
      })
    );
    expect(out.integrity).toBe('sha256-COMPUTED==');
  });

  it('uses custom algo when provided (e.g., sha512)', () => {
    computeSRI.mockReturnValueOnce('sha512-ABCD==');

    const data = new Uint8Array([1, 2, 3]);
    const out = svc.runFinalize(
      {
        url: 'u2',
        downloadUrl: 'u2',
        key: 'k2',
      },
      { data, algo: 'sha512' }
    );

    expect(computeSRI).toHaveBeenCalledWith(data, 'sha512');
    expect(out.integrity).toBe('sha512-ABCD==');
  });

  it('throws if neither integrity nor data is provided', () => {
    expect(() =>
      svc.runFinalize({
        url: 'u3',
        downloadUrl: 'u3',
        key: 'k3',
      })
    ).toThrow('Integrity missing and no data provided to compute it');
    expect(computeSRI).not.toHaveBeenCalled();
    expect(assertHasIntegrity).not.toHaveBeenCalled();
  });

  it('passes through locator and sizeBytes correctly', () => {
    computeSRI.mockReturnValueOnce('sha256-XYZ==');

    const data = Buffer.from([9, 9, 9]);
    const locator = { provider: 'firebase', bucket: 'bucket-x', objectPath: 'p/q' } as any;

    const out = svc.runFinalize(
      {
        url: 'ux',
        downloadUrl: 'ux',
        key: 'kx',
        locator,
        sizeBytes: data.length,
      },
      { data }
    );

    expect(out.locator).toBe(locator);
    expect(out.sizeBytes).toBe(data.length);
    expect(out.integrity).toBe('sha256-XYZ==');
  });
});