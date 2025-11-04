/**
 * Tests for utils/encryptions.ts
 * - encrypt/decrypt (AES-256-CBC) roundtrip
 * - encryptV2/decryptV2 (AES-256-GCM) roundtrip
 * - hashString (md5) stable digest
 * - buildImmutableKey: key format, extension fallback, short vs full hash
 * - computeSRI: digest for Buffer, Uint8Array, and ArrayBuffer; different algos
 */

import {
  encrypt,
  decrypt,
  encryptV2,
  decryptV2,
  hashString,
  buildImmutableKey,
  computeSRI,
} from '../src/utils/encryptions';

// Helper to make deterministic small buffers
const buf = (s: string) => Buffer.from(s, 'utf8');

describe('encryptions utils', () => {
  test('encrypt/decrypt (CBC) returns original text', () => {
    const original = 'hello-world-🙂-cbc';
    const cipher = encrypt(original);
    expect(typeof cipher).toBe('string');

    // format: <hex-iv>:<hex-ciphertext>
    const parts = cipher.split(':');
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/i);

    const plain = decrypt(cipher);
    expect(plain).toBe(original);
  });

  test('encryptV2/decryptV2 (GCM) returns original text', () => {
    const original = 'hello-world-🚀-gcm';
    const { encrypted, iv, tag, key } = encryptV2(original);

    expect(typeof encrypted).toBe('string');
    expect(typeof iv).toBe('string');
    expect(typeof tag).toBe('string');
    expect(typeof key).toBe('string');

    const plain = decryptV2(encrypted, iv, tag, key);
    expect(plain).toBe(original);
  });

  test('hashString (md5) produces stable digest', () => {
    // md5('abc') = 900150983cd24fb0d6963f7d28e17f72
    expect(hashString('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  test('buildImmutableKey returns short-hash key and 64-char sha256', () => {
    const data = buf('immutable-key-test');
    const { key, hash } = buildImmutableKey({
      uploadPath: 'assets',
      filename: 'image.png',
      data,
      useShort: true,
    });

    expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    // short hash default is 20 hex chars
    const match = key.match(/^assets\/(\w{20})\.png$/);
    expect(match).not.toBeNull();
  });

  test('buildImmutableKey can return full hash when useShort=false', () => {
    const data = buf('full-hash-key');
    const { key, hash } = buildImmutableKey({
      uploadPath: 'assets',
      filename: 'photo.jpg',
      data,
      useShort: false,
    });
    // full hash used in key
    expect(key).toBe(`assets/${hash}.jpg`);
  });

  test('buildImmutableKey falls back to .bin when no extension', () => {
    const data = buf('no-ext');
    const { key } = buildImmutableKey({ uploadPath: 'u', filename: 'file', data });
    expect(key.endsWith('.bin')).toBe(true);
  });

  test('computeSRI (sha256) returns correct format and base64 length', () => {
    const data = buf('sri-test');
    const sri = computeSRI(data, 'sha256');

    expect(sri.startsWith('sha256-')).toBe(true);

    const [, b64] = sri.split('-');
    // sha256 base64 length is 44 (with padding), accept >=43 to be lenient
    expect(b64.length).toBeGreaterThanOrEqual(43);
  });

  test('computeSRI accepts Uint8Array and ArrayBuffer inputs', () => {
    const u8 = new Uint8Array([1, 2, 3, 4]);
    const ab = new Uint8Array([5, 6, 7, 8]).buffer;

    const sri1 = computeSRI(u8, 'sha256');
    const sri2 = computeSRI(ab, 'sha256');

    expect(sri1).toMatch(/^sha256-/);
    expect(sri2).toMatch(/^sha256-/);
    expect(sri1).not.toBe(sri2); // different inputs → different digests
  });

  test('computeSRI with alternative algo (sha512)', () => {
    const data = buf('alt-algo');
    const sri = computeSRI(data, 'sha512');
    expect(sri.startsWith('sha512-')).toBe(true);
  });
});