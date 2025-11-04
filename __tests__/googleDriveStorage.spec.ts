/**
 * GoogleDriveStorageService tests
 * - Uploads file
 * - Grants public permission
 * - Fetches links
 * - verifyStorage is mocked to “exists: true”
 */

// ---- define mocks BEFORE importing the service
const permissionsCreateMock = jest.fn();
const filesGetMock = jest.fn();
const filesCreateMock = jest.fn();

jest.mock('googleapis/build/src/apis/drive', () => ({
  drive: jest.fn(() => ({
    permissions: { create: permissionsCreateMock },
    files: {
      get: filesGetMock,
      create: filesCreateMock,
    },
  })),
}));

jest.mock('../src/config/gcp_config', () => ({
  GCPConfig: jest.fn(() => ({ auth: {} })), // ctor expects .auth
}));

// Mock the universal verifier so this spec stays focused on service logic
jest.mock('../src/utils/universalIntegrityVerifier', () => ({
  verifyStorage: jest.fn(async () => ({
    exists: true,
    integrityMatches: 'unknown',
    sizeMatches: true,
  })),
}));

import { sriSha256, makeBuffer } from './helpers/testUtils';

describe('GoogleDriveStorageService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uploads and (mock) verifies existence (integrity unknown)', async () => {
    // Import AFTER mocks
    const { GoogleDriveStorageService } = await import('../src/services/googleDriveStorage');

    const svc = new GoogleDriveStorageService();
    const data = makeBuffer(10, 'drive-file');

    // files.create -> returns id
    filesCreateMock.mockResolvedValueOnce({ data: { id: 'file123' } });

    // permissions.create -> ok
    permissionsCreateMock.mockResolvedValueOnce({});

    // files.get -> links (generatePublicUrlForDrive)
    filesGetMock.mockResolvedValueOnce({
      data: {
        webViewLink: 'https://drive.google.com/file/d/file123/view',
        webContentLink: 'https://drive.google.com/uc?export=download&id=file123',
      },
    });

    const res = await svc.uploadFile({
      file: { name: 'd.png', mimetype: 'image/png', data },
      parentPathIds: ['folderA'],
    });

    expect(res.integrity).toEqual(sriSha256(data));
    expect(res.url).toBe('https://drive.google.com/uc?export=view&id=file123');
    expect(res.downloadUrl).toBe('https://drive.google.com/uc?export=download&id=file123');
    expect(res.sizeBytes).toBe(data.length);
    expect(res.locator).toEqual({
      provider: 'drive',
      fileId: 'file123',
      shouldSupportSharedDrives: false,
    });

    expect(filesCreateMock).toHaveBeenCalledTimes(1);
    expect(permissionsCreateMock).toHaveBeenCalledTimes(1);
    expect(filesGetMock).toHaveBeenCalledTimes(1); // only the links call
  });
});