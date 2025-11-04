import { StorageResult } from '../types';

export function assertHasIntegrity(res: StorageResult): StorageResult {
  if (!res?.integrity || !/^(sha(256|384|512))-[A-Za-z0-9+/=]+$/.test(res.integrity)) {
    throw new Error('StorageResult missing valid integrity (SRI) value');
  }
  return res;
}