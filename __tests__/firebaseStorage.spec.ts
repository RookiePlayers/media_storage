/**
 * Validates that:
 * - File is saved with custom metadata.metadata.sha256
 * - Public URL returned
 * - verifyStorage confirms existence and integrity
 */

import EnvironmentRegister from '../src/register';
import { FirebaseStorageService } from '../src/services/firebaseStorage';
import { verifyStorage } from '../src/utils/universalIntegrityVerifier';
import { sriSha256, sha256Hex, makeBuffer } from './helpers/testUtils';

// Mocks for bucket/file methods
const makePublicMock = jest.fn();
const saveMock = jest.fn();
const getMetadataMock = jest.fn();
const existsMock = jest.fn();
const deleteMock = jest.fn();

// Mock the firebase_config module used by the service & verifier context
jest.mock('../src/config/firebase_config', () => {
  const bucketObj = {
    name: 'test-bucket',
    file: (p: string) => ({
      save: saveMock,
      makePublic: makePublicMock,
      getMetadata: getMetadataMock,
      exists: existsMock,
      delete: deleteMock,
      publicUrl: () => `https://storage.googleapis.com/test-bucket/${p}`,
    }),
    // shim for @google-cloud/storage-like API used by verifyStorage
    storage: {
      bucket: (_name: string) => ({
        file: (_p: string) => ({
          exists: existsMock,
          getMetadata: getMetadataMock,
        }),
      }),
    },
  };

  return {
    firebaseStorage: { bucket: () => bucketObj },
    FirebaseConfig: jest.fn(() => {
      return {
        firebaseStorage: { bucket: () => bucketObj }
      };
    }), // ctor safe
  };
});

describe('FirebaseStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EnvironmentRegister.getInstance().registerEnvironments({
      firebase_service_account_key_base64: 'dummy', // not decoded in test
      firebase_storage_bucket: 'test-bucket',
    });
  });

  it('saves with custom sha256 metadata and verifies', async () => {
    const svc = new FirebaseStorageService();
    const data = makeBuffer(8, 'firebase!');
    const hex = sha256Hex(data);

    // save/makePublic succeed
    saveMock.mockResolvedValueOnce(undefined);
    makePublicMock.mockResolvedValueOnce(undefined);

    // exists() must return a tuple [boolean] EVERY time it's called
    existsMock.mockImplementation(async () => [true]);

    // getMetadata() must return an array with a metadata object
    // NOTE: your upload stores { metadata: { sha256: hex } }
    // GCS returns { metadata: { ...custom } }
    getMetadataMock.mockImplementation(async () => [
      { size: `${data.length}`, metadata: { sha256: hex } },
    ]);

    const res = await svc.uploadFile({
      file: { name: 'c.png', mimetype: 'image/png', data },
      uploadPath: 'profiles',
    });

    // ensure custom metadata was written as { metadata: { sha256 } }
    expect(saveMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({
          metadata: { sha256: hex },
        }),
      })
    );

    expect(res.integrity).toEqual(sriSha256(data));

    // Use SAME mocked gcs shim for verifier
    const { firebaseStorage } = require('../src/config/firebase_config');
    const out = await verifyStorage(res, {
      firebase: { gcs: firebaseStorage.bucket().storage },
    });

    expect(out.exists).toBe(true);
    expect(out.integrityMatches).toBe(true);
    expect(out.sizeMatches).toBe(true);
  });

  it('deletes a file by path', async () => {
    const svc = new FirebaseStorageService();

    deleteMock.mockResolvedValueOnce(undefined);

    const res = await svc.deleteFile(undefined, 'profiles/to-delete.png');

    expect(deleteMock).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(res).toEqual({ success: true });
  });
});
