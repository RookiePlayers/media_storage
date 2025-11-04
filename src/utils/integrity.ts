import { SRI, IntegrityAlgo } from "../types";

export function parseSRI(sri: SRI): { algo: IntegrityAlgo; b64: string } {
  const [algo, b64] = sri.split('-') as [IntegrityAlgo, string];
  return { algo, b64 };
}

export function base64ToHex(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  return buf.toString('hex');
}
export function sriToHex(sri: string): string {
  const [, b64] = sri.split('-', 2);
  return Buffer.from(b64, 'base64').toString('hex');
}