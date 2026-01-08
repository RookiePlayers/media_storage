/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { drive_v3 } from 'googleapis';
import type { Storage } from '@google-cloud/storage';
import {
  StorageLocator,
  StorageLocatorDrive,
  StorageLocatorFirebase,
  StorageLocatorR2,
  StorageResult,
} from '../types';

export type DeleteContext = {
  r2?: { s3: S3Client };
  firebase?: { gcs: Storage };
  drive?: { client: drive_v3.Drive };
};

export async function deleteFileFromStorage(
  resultOrLocator: StorageResult | StorageLocator,
  ctx: DeleteContext
): Promise<void> {
  const locator: StorageLocator =
    (resultOrLocator as StorageResult).locator ?? (resultOrLocator as StorageLocator);

  switch (locator.provider) {
    case 'r2':
      return deleteR2(locator, ctx.r2?.s3);

    case 'firebase':
      return deleteFirebase(locator, ctx.firebase?.gcs);

    case 'drive':
      return deleteDrive(locator, ctx.drive?.client);

    default:
      throw new Error('Unknown provider for deleteFileFromStorage');
  }
}

async function deleteR2(loc: StorageLocatorR2, s3?: S3Client): Promise<void> {
  if (!s3) {
    throw new Error('Missing S3 client for deleteFileFromStorage');
  }
  await s3.send(new DeleteObjectCommand({ Bucket: loc.bucket, Key: loc.key }));
}

async function deleteFirebase(loc: StorageLocatorFirebase, gcs?: Storage): Promise<void> {
  if (!gcs) {
    throw new Error('Missing GCS client for deleteFileFromStorage');
  }
  const bucket = gcs.bucket(loc.bucket);
  const file = bucket.file(loc.objectPath);
  await file.delete({ ignoreNotFound: true });
}

async function deleteDrive(loc: StorageLocatorDrive, drive?: drive_v3.Drive): Promise<void> {
  if (!drive) {
    throw new Error('Missing Drive client for deleteFileFromStorage');
  }
  try {
    await drive.files.delete({
      fileId: loc.fileId,
      supportsAllDrives: !!loc.shouldSupportSharedDrives,
    });
  } catch (err: any) {
    if (err?.code === 404) {
      return;
    }
    throw err;
  }
}
