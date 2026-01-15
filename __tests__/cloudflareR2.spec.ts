/**
 * Cloudflare R2 provider tests:
 * - HEAD 404 → PUT → HEAD (internal verify) → success
 * - HEAD match → no PUT → success
 */

import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { sriSha256, sha256Hex, makeBuffer } from './helpers/testUtils';
import { CloudFlareR2StorageService } from '../src/services/cloudFlareR2Storage';
import EnvironmentRegister from '../src/register';

// ---- Quiet console.error for cleaner output (optional)
let consoleErrorSpy: jest.SpyInstance;
beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

// --- Mock S3Client .send() behavior
const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: class {
      send = sendMock;
    },
    HeadObjectCommand: actual.HeadObjectCommand,
    PutObjectCommand: actual.PutObjectCommand,
    DeleteObjectCommand: actual.DeleteObjectCommand,
  };
});

// Minimal firebase fallback mock (not used in happy path)
jest.mock('../src/services/firebaseStorage', () => ({
  FirebaseStorageService: { getInstance: () => ({ uploadFile: jest.fn() }) },
}));

// ---------- helpers to robustly detect command type ----------
const isHead = (cmd: any) =>
  cmd instanceof HeadObjectCommand || cmd?.constructor?.name === 'HeadObjectCommand';

const isPut = (cmd: any) =>
  cmd instanceof PutObjectCommand || cmd?.constructor?.name === 'PutObjectCommand';

const isDelete = (cmd: any) =>
  cmd?.constructor?.name === 'DeleteObjectCommand';

describe('CloudFlareR2StorageService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    EnvironmentRegister.getInstance().registerEnvironments({
      r2_account_id: 'acc',
      r2_bucket: 'bucket',
      r2_access_key_id: 'id',
      r2_access_key_secret: 'secret',
      r2_cdn_base: 'https://cdn.example.com',
    });
  });

  it('uploads when not exists, saves content sha256 metadata, verifies internally', async () => {
    const svc = new CloudFlareR2StorageService();

    const data = makeBuffer(8, 'hello-R2');
    const contentSha = sha256Hex(data);

    let call = 0;
    sendMock.mockImplementation((cmd: any) => {
      call++;

      if (isHead(cmd)) {
        if (call === 1) {
          // pre-HEAD => 404 not found
          const err: any = new Error('NotFound');
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        // verify-HEAD (and any further HEADs) => object present with matching sha256 + size
        return { Metadata: { sha256: contentSha }, ContentLength: data.length };
      }

      if (isPut(cmd)) {
        // write succeeds
        return {};
      }

      return {};
    });

    const res = await svc.uploadFile({
      file: { name: 'a.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    });

    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/assets\//);
    expect(res.downloadUrl).toEqual(res.url);
    expect(res.integrity).toEqual(sriSha256(data));
    expect(res.sizeBytes).toBe(data.length);
    expect(res.locator).toEqual({ provider: 'r2', bucket: 'bucket', key: expect.any(String) });

    // sanity: at least two HEADs (pre + verify) and one PUT
    const headCalls = sendMock.mock.calls.filter(([c]) => isHead(c)).length;
    const putCalls = sendMock.mock.calls.filter(([c]) => isPut(c)).length;
    expect(headCalls).toBeGreaterThanOrEqual(2);
    expect(putCalls).toBe(1);
  });

  it('short-circuits when HEAD already has matching content sha256 (no PUT), then verifies internally', async () => {
    const svc = new CloudFlareR2StorageService();

    const data = makeBuffer(8, 'same-content');
    const contentSha = sha256Hex(data);

    sendMock.mockImplementation((cmd: any) => {
      if (isHead(cmd)) {
        // both pre-HEAD and verify-HEAD show present + matching sha
        return { Metadata: { sha256: contentSha }, ContentLength: data.length };
      }
      if (isPut(cmd)) {
        throw new Error('PUT should not be called when object already matches');
      }
      return {};
    });

    const res = await svc.uploadFile({
      file: { name: 'b.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    });

    // ensure no PUT occurred
    const putCalls = sendMock.mock.calls.filter(([c]) => isPut(c)).length;
    expect(putCalls).toBe(0);

    expect(res.integrity).toEqual(sriSha256(data));
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/assets\//);
  });
});

// 1) Race-condition 412 handling
it('handles PUT race (412) gracefully: HEAD 404 -> PUT 412 -> verify HEAD ok', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(8, 'race-412');
  const contentSha = sha256Hex(data);

  let call = 0;
  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      call++;
      if (call === 1) {
        const err: any = new Error('NotFound');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      // verify head
      return { Metadata: { sha256: contentSha }, ContentLength: data.length };
    }
    if (isPut(cmd)) {
      const err: any = new Error('PreconditionFailed');
      err.$metadata = { httpStatusCode: 412 };
      throw err; // service should swallow 412 and continue
    }
    return {};
  });

  const res = await svc.uploadFile({
    file: { name: 'race.png', mimetype: 'image/png', data },
    uploadPath: 'assets',
  });

  expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/assets\//);
  expect(res.integrity).toEqual(sriSha256(data));
});

// 2) Throws when post-upload verify HEAD says 404 (exists=false)
it('throws when verifyStorage says object does not exist after upload', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(6, 'no-exist');

  let call = 0;
  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      call++;
      if (call === 1) {
        const err: any = new Error('NotFound');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      // verify head: still 404
      const err: any = new Error('NotFound');
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
    if (isPut(cmd)) return {};
    return {};
  });

  await expect(
    svc.uploadFile({
      file: { name: 'x.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    })
  ).rejects.toThrow(/object not found after upload/i);
});

// 3) Throws when integrity mismatches on verify
it('throws when verifyStorage detects integrity mismatch', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(9, 'bad-hash');
  const wrongSha = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  let headCount = 0;
  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      headCount++;
      if (headCount === 1) {
        const err: any = new Error('NotFound');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      // verify head: exists but wrong sha
      return { Metadata: { sha256: wrongSha }, ContentLength: data.length };
    }
    if (isPut(cmd)) return {};
    return {};
  });

  await expect(
    svc.uploadFile({
      file: { name: 'y.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    })
  ).rejects.toThrow(/sha256 mismatch/i);
});

// 4) Throws when size mismatches on verify
it('throws when verifyStorage detects size mismatch', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(4, 'size');

  let headCount = 0;
  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      headCount++;
      if (headCount === 1) {
        const err: any = new Error('NotFound');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      // verify head: exists but different ContentLength
      return { Metadata: { sha256: sha256Hex(data) }, ContentLength: data.length + 1 };
    }
    if (isPut(cmd)) return {};
    return {};
  });

  await expect(
    svc.uploadFile({
      file: { name: 'z.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    })
  ).rejects.toThrow(/size mismatch/i);
});

// 5) Unexpected HEAD error (e.g., 500) bubbles up
it('bubbles unexpected HEAD errors (non-403/404)', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(7, 'err-500');

  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      const err: any = new Error('InternalError');
      err.$metadata = { httpStatusCode: 500 };
      throw err;
    }
    return {};
  });

  await expect(
    svc.uploadFile({
      file: { name: 'e.png', mimetype: 'image/png', data },
      uploadPath: 'assets',
    })
  ).rejects.toThrow(/InternalError/);
});

// 6) Asserts PUT writes correct metadata.sha256 and IfNoneMatch
it('sends correct Metadata.sha256 and IfNoneMatch "*" on PUT', async () => {
  const svc = new CloudFlareR2StorageService();
  const data = makeBuffer(5, 'meta!');
  const expectedSha = sha256Hex(data);

  let capturedPut: any;
  let stage: 'pre' | 'afterPut' | 'verify' = 'pre';
  sendMock.mockImplementation((cmd: any) => {
    if (isHead(cmd)) {
      if (stage === 'pre') {
        const err: any = new Error('NotFound');
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      // After PUT, verify HEAD should report correct metadata and size
      return { Metadata: { sha256: expectedSha }, ContentLength: data.length };
    }
    if (isPut(cmd)) {
      stage = 'afterPut';
      capturedPut = cmd;
      return {};
    }
    return {};
  });

  const res = await svc.uploadFile({
    file: { name: 'm.png', mimetype: 'image/png', data },
    uploadPath: 'assets',
  });

  // AWS SDK v3 command instances keep input under ".input"
  expect(capturedPut?.input?.Metadata?.sha256).toBe(expectedSha);
  expect(capturedPut?.input?.IfNoneMatch).toBe('*');
  expect(res.integrity).toEqual(sriSha256(data));
});

// 7) deleteFile sends DeleteObjectCommand with normalized key
it('deleteFile sends DeleteObjectCommand with normalized key', async () => {
  const svc = new CloudFlareR2StorageService();

  const calls: any[] = [];
  sendMock.mockImplementation((cmd: any) => {
    calls.push(cmd);
    return {};
  });

  await svc.deleteFile('uploads', { uri: '/images/photo.png', name: 'ignored.png' });

  const deleteCall = calls.find((c) => isDelete(c));
  expect(deleteCall).toBeDefined();
  expect(deleteCall.input).toEqual(
    expect.objectContaining({
      Bucket: 'bucket',
      Key: 'uploads/images/photo.png',
    })
  );
});

// 8) deleteFile returns success
it('deleteFile returns success', async () => {
  const svc = new CloudFlareR2StorageService();

  sendMock.mockImplementation(() => ({}));

  const res = await svc.deleteFile('uploads', { uri: '/images/photo.png', name: 'ignored.png' });

  expect(res).toEqual({ success: true });
});
