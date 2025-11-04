import { randomBytes, createHash } from 'crypto';

export function makeBuffer(len = 16, seed?: string) {
  return seed ? Buffer.from(seed) : randomBytes(len);
}

export function sha256Hex(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sriSha256(buf: Buffer) {
  return `sha256-${createHash('sha256').update(buf).digest('base64')}`;
}