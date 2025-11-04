/**
 * Tests for verify/universalVerify.ts
 * - Dispatch via StorageResult and via StorageLocator
 * - R2: match, no expected hash, 404/403, unexpected errors
 * - Firebase (GCS): exists + sha256 custom metadata, exists w/o sha256, not found, missing client
 * - Drive: exists (unknown integrity), size check, 404/403, missing client
 */

import { verifyStorage } from '../src/utils/universalIntegrityVerifier';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// ---- helpers to make integrity SRI and buffers
const toSRI = (buf: Buffer, algo: 'sha256' | 'sha512' = 'sha256') =>
  `${algo}-${crypto.createHash(algo).update(buf).digest('base64')}`;

const makeBuf = (s: string) => Buffer.from(s, 'utf8');

// ---- mocks/stubs for AWS S3, GCS, Drive ----

// We'll pass a fake S3 client with a .send method we control
class FakeS3 {
  constructor(public sendImpl: (cmd: any) => any | Promise<any>) {}
  send(cmd: any) { return this.sendImpl(cmd); }
}

// Minimal GCS shapes we call: bucket().file().exists(), getMetadata()
function makeGCS({
  exists = true,
  size = 0,
  metadataSha256, // hex
}: { exists?: boolean; size?: number; metadataSha256?: string } = {}) {
  return {
    bucket: (_bucketName: string) => ({
      file: (_objectPath: string) => ({
        exists: jest.fn().mockResolvedValue([exists]),
        getMetadata: jest.fn().mockResolvedValue([
          {
            size: `${size}`,
            metadata: metadataSha256 ? { sha256: metadataSha256 } : undefined,
          },
        ]),
      }),
    }),
  } as any;
}

// Minimal Drive client: files.get()
function makeDrive({
  code,        // simulate error code (404/403)
  size,        // as string per API
  md5Checksum, // present but unused for sha256
}: { code?: number; size?: string; md5Checksum?: string } = {}) {
  return {
    files: {
      get: jest.fn(async () => {
        if (code) {
          const err: any = new Error('Drive error');
          err.code = code;
          throw err;
        }
        return { data: { id: 'file123', size, md5Checksum } };
      }),
    },
  } as any;
}

// ---------- TESTS ----------

describe('verifyStorage (R2 / S3)', () => {
  test('R2: exists with matching sha256 and size -> integrityMatches=true sizeMatches=true', async () => {
    const data = makeBuf('r2-ok');
    const sri = toSRI(data, 'sha256');
    const expectedHex = crypto.createHash('sha256').update(data).digest('hex');

    // Head returns stored sha256 and matching size
    const s3 = new FakeS3((cmd) => {
      expect(cmd).toBeInstanceOf(HeadObjectCommand);
      return { Metadata: { sha256: expectedHex }, ContentLength: data.length };
    });

    const res = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'r2', bucket: 'bkt', key: 'path/key.png' },
      } as any,
      { r2: { s3: s3 as any } }
    );

    expect(res.exists).toBe(true);
    expect(res.integrityMatches).toBe(true);
    expect(res.sizeMatches).toBe(true);
  });

  test('R2: exists but no expected hash (locator only) -> integrityMatches "unknown"', async () => {
    const s3 = new FakeS3(() => ({ Metadata: {}, ContentLength: 123 }));

    const res = await verifyStorage(
      { provider: 'r2', bucket: 'bkt', key: 'k' } as any,
      { r2: { s3: s3 as any } }
    );

    expect(res.exists).toBe(true);
    expect(res.integrityMatches).toBe('unknown');
    // sizeMatches undefined (no expected size provided)
    expect(res.sizeMatches).toBeUndefined();
  });

  test('R2: HEAD returns 404 -> exists=false integrity "unknown"', async () => {
    const s3 = new FakeS3(() => {
      const err: any = new Error('NotFound');
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    });

    const out = await verifyStorage(
      { provider: 'r2', bucket: 'bkt', key: 'missing' } as any,
      { r2: { s3: s3 as any } }
    );
    expect(out.exists).toBe(false);
    expect(out.integrityMatches).toBe('unknown');
  });

  test('R2: unexpected error (500) bubbles', async () => {
    const s3 = new FakeS3(() => {
      const err: any = new Error('InternalError');
      err.$metadata = { httpStatusCode: 500 };
      throw err;
    });

    await expect(
      verifyStorage({ provider: 'r2', bucket: 'bkt', key: 'k' } as any, { r2: { s3: s3 as any } })
    ).rejects.toThrow(/InternalError/);
  });

  test('R2: missing client -> exists=false with details', async () => {
    const out = await verifyStorage(
      { provider: 'r2', bucket: 'b', key: 'k' } as any,
      { /* no r2 */ }
    );
    expect(out.exists).toBe(false);
    expect(out.integrityMatches).toBe('unknown');
    expect(out.details).toMatch(/Missing S3 client/i);
  });
});

describe('verifyStorage (Firebase / GCS)', () => {
  test('Firebase: exists with custom sha256 metadata and matching size', async () => {
    const data = makeBuf('gcs-ok');
    const sri = toSRI(data, 'sha256');
    const hex = crypto.createHash('sha256').update(data).digest('hex');

    const gcs = makeGCS({ exists: true, size: data.length, metadataSha256: hex });

    const out = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'firebase', bucket: 'bkt', objectPath: 'p' },
      } as any,
      { firebase: { gcs: gcs as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe(true);
    expect(out.sizeMatches).toBe(true);
  });

  test('Firebase: exists but no custom sha256 -> integrity "unknown"', async () => {
    const data = makeBuf('no-sha256');
    const sri = toSRI(data);

    const gcs = makeGCS({ exists: true, size: data.length, metadataSha256: undefined });

    const out = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'firebase', bucket: 'b', objectPath: 'k' },
      } as any,
      { firebase: { gcs: gcs as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe('unknown');
    expect(out.sizeMatches).toBe(true);
    expect(out.details).toMatch(/No sha256 custom metadata/i);
  });

  test('Firebase: exists but no expected hash provided (locator only)', async () => {
    const gcs = makeGCS({ exists: true, size: 42, metadataSha256: 'abc' });

    const out = await verifyStorage(
      { provider: 'firebase', bucket: 'b', objectPath: 'p' } as any,
      { firebase: { gcs: gcs as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe('unknown');
    expect(out.sizeMatches).toBeUndefined();
  });

  test('Firebase: not found -> exists=false', async () => {
    const gcs = makeGCS({ exists: false });

    const out = await verifyStorage(
      { provider: 'firebase', bucket: 'b', objectPath: 'p' } as any,
      { firebase: { gcs: gcs as any } }
    );

    expect(out.exists).toBe(false);
    expect(out.integrityMatches).toBe('unknown');
  });

  test('Firebase: missing client -> exists=false with details', async () => {
    const out = await verifyStorage(
      { provider: 'firebase', bucket: 'b', objectPath: 'p' } as any,
      { /* no firebase */ }
    );
    expect(out.exists).toBe(false);
    expect(out.details).toMatch(/Missing GCS client/i);
  });
});

describe('verifyStorage (Google Drive)', () => {
  test('Drive: exists, integrity unknown, size matches', async () => {
    const data = makeBuf('drive-size');
    const sri = toSRI(data);

    const drive = makeDrive({ size: String(data.length), md5Checksum: 'whatever' });

    const out = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'drive', fileId: 'file123', shouldSupportSharedDrives: false },
      } as any,
      { drive: { client: drive as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe('unknown');
    expect(out.sizeMatches).toBe(true);
  });

  test('Drive: exists but size mismatch -> sizeMatches=false', async () => {
    const data = makeBuf('drive-size-mismatch');
    const sri = toSRI(data);

    const drive = makeDrive({ size: String(data.length + 10) });

    const out = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'drive', fileId: 'file123' },
      } as any,
      { drive: { client: drive as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe('unknown');
    expect(out.sizeMatches).toBe(false);
  });

  test('Drive: 404 -> exists=false', async () => {
    const drive = makeDrive({ code: 404 });

    const out = await verifyStorage(
      { provider: 'drive', fileId: 'missing' } as any,
      { drive: { client: drive as any } }
    );

    expect(out.exists).toBe(false);
    expect(out.integrityMatches).toBe('unknown');
  });

  test('Drive: missing client -> exists=false with details', async () => {
    const out = await verifyStorage(
      { provider: 'drive', fileId: 'x' } as any,
      { /* no drive */ }
    );
    expect(out.exists).toBe(false);
    expect(out.details).toMatch(/Missing Drive client/i);
  });

  test('Drive: unexpected error bubbles', async () => {
    const badDrive = {
      files: {
        get: jest.fn(async () => {
          const e: any = new Error('Boom');
          e.code = 500;
          throw e;
        }),
      },
    } as any;

    await expect(
      verifyStorage({ provider: 'drive', fileId: 'x' } as any, { drive: { client: badDrive } })
    ).rejects.toThrow(/Boom/);
  });
});

describe('verifyStorage dispatch behavior', () => {
  test('Accepts a plain locator (no integrity/size) and returns unknown integrity', async () => {
    const s3 = new FakeS3(() => ({ Metadata: {}, ContentLength: 1 }));
    const out = await verifyStorage(
      { provider: 'r2', bucket: 'b', key: 'k' } as any,
      { r2: { s3: s3 as any } }
    );
    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe('unknown');
  });

  test('Accepts a full StorageResult (includes SRI and sizeBytes)', async () => {
    const data = makeBuf('full-result');
    const sri = toSRI(data);
    const hex = crypto.createHash('sha256').update(data).digest('hex');

    const s3 = new FakeS3(() => ({ Metadata: { sha256: hex }, ContentLength: data.length }));

    const out = await verifyStorage(
      {
        integrity: sri,
        sizeBytes: data.length,
        locator: { provider: 'r2', bucket: 'b', key: 'path/key' },
      } as any,
      { r2: { s3: s3 as any } }
    );

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe(true);
    expect(out.sizeMatches).toBe(true);
  });
});

describe('verifyStorage - unknown provider branch', () => {
  it('returns expected outcome for unknown provider', async () => {
    const res = await verifyStorage(
      {
        locator: { provider: 'mystery' } as any, // 👈 not r2/firebase/drive
      } as any,
      {}
    );

    expect(res).toEqual({
      exists: false,
      integrityMatches: 'unknown',
      details: 'Unknown provider',
    });
  });
});