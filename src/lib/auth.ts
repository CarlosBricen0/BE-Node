import { AsyncLocalStorage } from 'node:async_hooks';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { User } from '@prisma/client';
import prisma from '../db/prisma.js';

import { HttpError } from './errors.js';
export { HttpError } from './errors.js';
const actors = new AsyncLocalStorage<User>();
export function withActor<T>(user: User, work: () => T): T { return actors.run(user, work); }
export async function requireUser() { const user = actors.getStore(); if (!user) throw new HttpError(401, 'Unauthorized'); return user; }
export function isAdminUser(user: { id?: string; email?: string | null } | null | undefined) {
  if (!user?.id) return false;
  if (process.env.ADMIN_USER_ID) return user.id === process.env.ADMIN_USER_ID;
  return process.env.NODE_ENV !== 'production' && Boolean(process.env.ADMIN_EMAIL && user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase());
}
export async function requireAdmin() { const user = await requireUser(); if (!isAdminUser(user)) throw new HttpError(403, 'Forbidden'); return user; }
let remote: ReturnType<typeof createRemoteJWKSet> | undefined;
let remoteIssuer: string | undefined;
export async function verifyAccessToken(token: string, options?: { issuer: string; audience: string; key: JWTVerifyGetKey }) {
  const issuer = options?.issuer || process.env.KINDE_ISSUER_URL;
  const audience = options?.audience || process.env.KINDE_AUDIENCE;
  if (!issuer || !audience) throw new HttpError(503, 'Kinde API audience is not configured');
  if (!options && (!remote || remoteIssuer !== issuer)) {
    const url = new URL(issuer);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new HttpError(503, 'Invalid Kinde issuer');
    remote = createRemoteJWKSet(new URL('/.well-known/jwks.json', url)); remoteIssuer = issuer;
  }
  try {
    const { payload } = await jwtVerify(token, options?.key || remote!, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub','exp','iat'] });
    if (!payload.sub) throw new Error('Missing subject');
    return payload;
  } catch { throw new HttpError(401, 'Invalid access token'); }
}
export async function authenticate(header: string | undefined) {
  if (!header?.startsWith('Bearer ') || header.length > 20000) throw new HttpError(401, 'Unauthorized');
  const token = header.slice(7);
  const claims = await verifyAccessToken(token);
  // Identity attributes come only from Kinde, never request bodies or x-user headers.
  const response = await fetch(new URL('/oauth2/v2/user_profile', process.env.KINDE_ISSUER_URL), {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 503, 'Identity profile unavailable');
  const profile = await response.json() as { id?: string; sub?: string; email?: string; given_name?: string; family_name?: string; picture?: string };
  if ((profile.id || profile.sub) !== claims.sub || !profile.email) throw new HttpError(401, 'Identity profile mismatch');
  return prisma.user.upsert({ where: { id: claims.sub! }, update: { email: profile.email.toLowerCase() }, create: {
    id: claims.sub!, email: profile.email.toLowerCase(), name: [profile.given_name, profile.family_name].filter(Boolean).join(' ') || 'Member', image: profile.picture,
  } });
}
