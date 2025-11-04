// verify/universalVerify.ts
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { drive_v3 } from 'googleapis';
import type { Storage } from '@google-cloud/storage';
import { base64ToHex, parseSRI } from './integrity';
import {
  SRI,
  StorageLocator,
  StorageLocatorDrive,
  StorageLocatorFirebase,
  StorageLocatorR2,
  StorageResult,
} from '../types';

export type VerifyOutcome = {
  exists: boolean;
  integrityMatches: boolean | 'unknown';
  sizeMatches?: boolean;
  details?: string;
};

export type VerifyContext = {
  r2?: { s3: S3Client };
  firebase?: { gcs: Storage }; // firebase-admin storage().bucket().storage
  drive?: { client: drive_v3.Drive };
};

/**
 * Universal verification for R2, Firebase (GCS), and Google Drive.
 * - Does NOT download the object.
 * - Uses provider metadata hashes when available.
 */
export async function verifyStorage(
  resultOrLocator: StorageResult | StorageLocator,
  ctx: VerifyContext
): Promise<VerifyOutcome> {
  const locator: StorageLocator =
    (resultOrLocator as StorageResult).locator ?? (resultOrLocator as StorageLocator);

  // Expected hashes derived from SRI if available (sha256 → hex)
  let expectedSha256Hex: string | undefined;
  let expectedSize: number | undefined;
  if ((resultOrLocator as StorageResult).integrity) {
    const { b64 } = parseSRI((resultOrLocator as StorageResult).integrity as SRI);
    expectedSha256Hex = base64ToHex(b64);
    expectedSize = (resultOrLocator as StorageResult).sizeBytes;
  }

  switch (locator.provider) {
    case 'r2':
      return verifyR2(locator, ctx.r2?.s3, expectedSha256Hex, expectedSize);

    case 'firebase':
      return verifyFirebase(locator, ctx.firebase?.gcs, expectedSha256Hex, expectedSize);

    case 'drive':
      return verifyDrive(locator, ctx.drive?.client, expectedSize);

    default:
      return { exists: false, integrityMatches: 'unknown', details: 'Unknown provider' };
  }
}

/** R2 / S3 */
async function verifyR2(
  loc: StorageLocatorR2,
  s3?: S3Client,
  expectedSha256Hex?: string,
  expectedSize?: number
): Promise<VerifyOutcome> {
  if (!s3) return { exists: false, integrityMatches: 'unknown', details: 'Missing S3 client' };
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: loc.bucket, Key: loc.key }));
    const storedSha = head.Metadata?.['sha256']; // you store this on upload
    const sizeMatches = expectedSize != null ? head.ContentLength === expectedSize : undefined;

    if (!expectedSha256Hex) {
      // We can still assert existence (and size) even if no expected hash provided
      return { exists: true, integrityMatches: storedSha ? 'unknown' : 'unknown', sizeMatches };
    }

    const integrityMatches = storedSha === expectedSha256Hex;
    return { exists: true, integrityMatches, sizeMatches };
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode && [403, 404].includes(err.$metadata.httpStatusCode)) {
      return { exists: false, integrityMatches: 'unknown' };
    }
    throw err;
  }
}

/** Firebase Storage (GCS) */
async function verifyFirebase(
  loc: StorageLocatorFirebase,
  gcs?: Storage,
  expectedSha256Hex?: string,
  expectedSize?: number
): Promise<VerifyOutcome> {
  if (!gcs) return { exists: false, integrityMatches: 'unknown', details: 'Missing GCS client' };
  const bucket = gcs.bucket(loc.bucket);
  const file = bucket.file(loc.objectPath);

  // exists()
  const [exists] = await file.exists();
  if (!exists) return { exists: false, integrityMatches: 'unknown' };

  // metadata
  const [meta] = await file.getMetadata();
  const customSha = meta.metadata?.sha256 as string | undefined; // recommended: store this at upload
  const sizeMatches = expectedSize != null ? Number(meta.size) === expectedSize : undefined;

  if (!expectedSha256Hex) {
    return { exists: true, integrityMatches: customSha ? 'unknown' : 'unknown', sizeMatches };
  }
  if (!customSha) {
    // GCS exposes md5Hash/crc32c but not sha256 unless you store it; report unknown
    return { exists: true, integrityMatches: 'unknown', sizeMatches, details: 'No sha256 custom metadata present' };
  }
  return { exists: true, integrityMatches: customSha === expectedSha256Hex, sizeMatches };
}

/** Google Drive */
async function verifyDrive(
  loc: StorageLocatorDrive,
  drive?: drive_v3.Drive,
  expectedSize?: number
): Promise<VerifyOutcome> {
  if (!drive) return { exists: false, integrityMatches: 'unknown', details: 'Missing Drive client' };
  try {
    const file = await drive.files.get({
      fileId: loc.fileId,
      fields: 'id, size, md5Checksum',
      supportsAllDrives: !!loc.shouldSupportSharedDrives,
    });
    const sizeMatches = expectedSize != null ? Number(file.data.size || 0) === expectedSize : undefined;

    // Drive gives md5Checksum; unless you computed/returned expected MD5, SHA-256 match is unknown.
    return { exists: true, integrityMatches: 'unknown', sizeMatches };
  } catch (e: any) {
    if (e?.code === 404 || e?.code === 403) {
      return { exists: false, integrityMatches: 'unknown' };
    }
    throw e;
  }
}