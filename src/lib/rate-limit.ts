import { HttpError } from './errors.js';
import { createHash } from 'node:crypto';
import prisma from '../db/prisma.js';
export async function enforceLimit(scope: string, userId: string, maximum: number, windowMs: number, db = prisma) {
  const window = Math.floor(Date.now() / windowMs);
  const id = createHash('sha256').update(`${scope}:${userId}:${window}`).digest('hex');
  const record = await db.rateLimit.upsert({ where: { id }, create: { id, count: 1, expiresAt: new Date((window + 1) * windowMs) }, update: { count: { increment: 1 } } });
  if (record.count > maximum) throw new HttpError(429,'Demasiadas solicitudes. Espera unos minutos e intenta nuevamente.');
}
