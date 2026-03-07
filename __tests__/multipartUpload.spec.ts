/* eslint-disable @typescript-eslint/no-explicit-any */
import { CloudFlareR2StorageService } from '../src/services/cloudFlareR2Storage';

// ── AWS SDK mocks ─────────────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...original,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// ── Internal util mocks ───────────────────────────────────────────────────────

jest.mock('../src/register', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      requiredSubset: jest.fn(),
      getEnvironment: (key: string) => {
        const env: Record<string, string> = {
          r2_account_id: 'test-account',
          r2_bucket: 'test-bucket',
          r2_access_key_id: 'key-id',
          r2_access_key_secret: 'key-secret',
          r2_cdn_base: 'https://cdn.example.com',
        };
        return env[key];
      },
    }),
  },
}));

jest.mock('../src/utils/encryptions', () => ({
  buildImmutableKey: jest.fn(() => ({ key: 'test/path/file.bin' })),
  computeSRI: jest.fn(() => 'sha256-AAAA=='),
}));

jest.mock('../src/utils/integrity', () => ({
  sriToHex: jest.fn(() => 'aabbccdd'),
}));

jest.mock('../src/utils/universalIntegrityVerifier', () => ({
  verifyStorage: jest.fn(() => ({ exists: true, integrityMatches: true, sizeMatches: true })),
}));

jest.mock('../src/utils/validate', () => ({
  assertHasIntegrity: jest.fn((x: any) => x),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Buffer of `sizeMB` MB filled with zeros. */
const makeBuf = (sizeMB: number) => Buffer.alloc(sizeMB * 1024 * 1024);

const baseParams = (data: Buffer, multipart?: any) => ({
  file: { name: 'file.bin', mimetype: 'application/octet-stream', data },
  uploadPath: 'test/path',
  ...(multipart !== undefined ? { multipart } : {}),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CloudFlareR2StorageService – multipart upload', () => {
  let svc: CloudFlareR2StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    svc = new CloudFlareR2StorageService();

    // Default HEAD → 404 (object does not exist yet)
    mockSend.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        const err: any = new Error('Not found');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload-123' };
      if (name === 'UploadPartCommand')            return { ETag: '"etag-part"' };
      if (name === 'CompleteMultipartUploadCommand') return {};
      if (name === 'PutObjectCommand')             return {};
      return {};
    });

    await svc.init();
  });

  it('uses PutObject for small files (< threshold)', async () => {
    await svc.uploadFile(baseParams(makeBuf(1))); // 1 MB – well under 100 MB

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).toContain('PutObjectCommand');
    expect(sentCommands).not.toContain('CreateMultipartUploadCommand');
  });

  it('uses multipart when file exceeds the 100 MB auto-threshold', async () => {
    await svc.uploadFile(baseParams(makeBuf(101))); // 101 MB

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).toContain('CreateMultipartUploadCommand');
    expect(sentCommands).toContain('UploadPartCommand');
    expect(sentCommands).toContain('CompleteMultipartUploadCommand');
    expect(sentCommands).not.toContain('PutObjectCommand');
  });

  it('uses multipart when multipart option is explicitly set, even for small files', async () => {
    await svc.uploadFile(baseParams(makeBuf(1), { chunkSizeMB: 5 }));

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).toContain('CreateMultipartUploadCommand');
    expect(sentCommands).toContain('UploadPartCommand');
    expect(sentCommands).toContain('CompleteMultipartUploadCommand');
  });

  it('splits data into correct number of parts based on chunkSizeMB', async () => {
    // 25 MB file, 10 MB chunks → 3 parts
    await svc.uploadFile(baseParams(makeBuf(25), { chunkSizeMB: 10 }));

    const uploadPartCalls = mockSend.mock.calls.filter(
      (c) => c[0].constructor.name === 'UploadPartCommand'
    );
    expect(uploadPartCalls).toHaveLength(3);
    expect(uploadPartCalls[0][0].input.PartNumber).toBe(1);
    expect(uploadPartCalls[1][0].input.PartNumber).toBe(2);
    expect(uploadPartCalls[2][0].input.PartNumber).toBe(3);
  });

  it('enforces 5 MB minimum chunk size', async () => {
    // 12 MB file, 1 MB requested chunk size → clamped to 5 MB → 3 parts
    await svc.uploadFile(baseParams(makeBuf(12), { chunkSizeMB: 1 }));

    const uploadPartCalls = mockSend.mock.calls.filter(
      (c) => c[0].constructor.name === 'UploadPartCommand'
    );
    // ceil(12 / 5) = 3 parts
    expect(uploadPartCalls).toHaveLength(3);
  });

  it('retries a failed chunk and succeeds on a subsequent attempt', async () => {
    let uploadPartCallCount = 0;

    mockSend.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        const err: any = new Error('Not found');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload-123' };
      if (name === 'UploadPartCommand') {
        uploadPartCallCount++;
        // Fail the first two attempts of part 1, succeed on the third
        if (uploadPartCallCount <= 2) throw new Error('transient network error');
        return { ETag: '"etag-part"' };
      }
      if (name === 'CompleteMultipartUploadCommand') return {};
      return {};
    });

    // 5 MB file with 5 MB chunk = 1 part; 2 failures + 1 success = 3 total send calls for that part
    await expect(svc.uploadFile(baseParams(makeBuf(5), { chunkSizeMB: 5, retries: 3 }))).resolves.toBeDefined();
    expect(uploadPartCallCount).toBe(3);
  });

  it('aborts the multipart upload after all retries are exhausted', async () => {
    mockSend.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        const err: any = new Error('Not found');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload-123' };
      if (name === 'UploadPartCommand')            throw new Error('permanent failure');
      if (name === 'AbortMultipartUploadCommand')  return {};
      return {};
    });

    await expect(
      svc.uploadFile(baseParams(makeBuf(5), { chunkSizeMB: 5, retries: 2 }))
    ).rejects.toThrow('permanent failure');

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).toContain('AbortMultipartUploadCommand');
    expect(sentCommands).not.toContain('CompleteMultipartUploadCommand');
  });

  it('aborts on CompleteMultipartUpload failure', async () => {
    mockSend.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        const err: any = new Error('Not found');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (name === 'CreateMultipartUploadCommand')  return { UploadId: 'upload-123' };
      if (name === 'UploadPartCommand')             return { ETag: '"etag-part"' };
      if (name === 'CompleteMultipartUploadCommand') throw new Error('complete failed');
      if (name === 'AbortMultipartUploadCommand')   return {};
      return {};
    });

    await expect(
      svc.uploadFile(baseParams(makeBuf(5), { chunkSizeMB: 5 }))
    ).rejects.toThrow('complete failed');

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).toContain('AbortMultipartUploadCommand');
  });

  it('skips upload entirely when object already exists with matching sha256', async () => {
    mockSend.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        return { Metadata: { sha256: 'aabbccdd' } }; // matches contentSha256Hex mock
      }
      return {};
    });

    await svc.uploadFile(baseParams(makeBuf(6), { chunkSizeMB: 5 }));

    const sentCommands = mockSend.mock.calls.map((c) => c[0].constructor.name);
    expect(sentCommands).not.toContain('CreateMultipartUploadCommand');
    expect(sentCommands).not.toContain('PutObjectCommand');
  });
});
