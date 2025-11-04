import crypto, { createHash } from 'crypto';
import path from 'path';
import { IntegrityAlgo, SRI } from '../types';

const algorithm = 'aes-256-cbc';
const algorithm2 = 'aes-256-gcm';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

export const encrypt = (text: string): string => {
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
export const encryptV2 = (text: string): { encrypted: string; iv: string; tag: string; key: string } => {
    const cipher = crypto.createCipheriv(algorithm2, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // GCM mode requires authentication tag
    const tag = cipher.getAuthTag().toString('base64');

    return {
        encrypted,
        iv: iv.toString('base64'),
        tag,
        key: key.toString('base64'), // Share securely
    };
}

export const decryptV2 = (encrypted: string, iv: string, tag: string, key: string): string => {
    const decipher = crypto.createDecipheriv(algorithm2, Buffer.from(key, 'base64'), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export const decrypt = (text: string): string => {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift()!, 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export const hashString = (text: string): string => {
    return crypto.createHash('md5').update(text).digest('hex');
}


function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex"); // 64 chars
}

// Optional: shorter key while keeping uniqueness low-collision risk
function shortHash(hex: string, len = 16) {
  return hex.slice(0, len);
}

function extFromNameOrMime(name: string, _mime?: string) {
   const ext = path.extname(name).replace(/^\./, "");
    return ext || "bin";
}

function buildImmutableKey({
  uploadPath = "assets",
  filename,
  mime,
  data,
  useShort = true, // toggle if you want shorter keys
}: {
  uploadPath?: string;
  filename: string;
  mime?: string;
  data: Buffer;
  useShort?: boolean;
}) {
  const hash = sha256Hex(data);
  const ext = extFromNameOrMime(filename, mime);
  const hashPart = useShort ? shortHash(hash, 20) : hash; // 20 hex ~ 80 bits
  const key = `${uploadPath}/${hashPart}.${ext}`.replace(/\/+/g, "/");
  return { key, hash };
}

function computeSRI(
  data: Buffer | Uint8Array | ArrayBuffer,
  algo: IntegrityAlgo = 'sha256'
): SRI {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data as ArrayBufferLike);
  const digest = createHash(algo).update(buf).digest('base64');
  return `${algo}-${digest}`;
}


export { buildImmutableKey, computeSRI }