import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyMPSignature({ signature, requestId, resourceId, secret, now = Date.now() }: { signature: string | null; requestId: string | null; resourceId: string | null; secret: string; now?: number }) {
  if (!signature || !requestId || !resourceId || !secret || !/^[a-zA-Z0-9_-]+$/.test(resourceId)) return false;
  const parts = signature.split(',').map(part => part.trim().split('='));
  const ts = parts.find(([key]) => key === 'ts')?.[1];
  const hashes = parts.filter(([key]) => key === 'v1').map(([,value]) => value);
  if (!ts || !/^\d{10,13}$/.test(ts)) return false;
  const millis = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - millis) > 15 * 60 * 1000) return false;
  const expected = createHmac('sha256', secret).update(`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest();
  return hashes.some(hash => /^[a-fA-F0-9]{64}$/.test(hash) && timingSafeEqual(expected, Buffer.from(hash, 'hex')));
}
