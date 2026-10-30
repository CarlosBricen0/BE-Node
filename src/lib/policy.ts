import { HttpError } from './errors.js';
export function hasAccess(subscription: { endDate: Date; status: string } | null | undefined, now = new Date()) {
  return Boolean(subscription && ['active', 'trialing', 'authorized', 'paused', 'cancelled'].includes(subscription.status) && subscription.endDate > now);
}
export function validText(value: unknown, max = 5000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400,`Text must contain 1–${max} characters`);
  return value.trim();
}
export function validMedia(value: unknown) {
  if (!value) return undefined;
  if (typeof value !== 'string') throw new HttpError(400,'Invalid media');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password) throw new HttpError(400,'Media must be uploaded to Cloudinary');
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (cloud && url.pathname.split('/')[1] !== cloud) throw new HttpError(400,'Invalid Cloudinary account');
  return value;
}
export { pesoAmount as priceInPesos } from './money.js';
export const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export function publicPost<T extends { isPublic: boolean; mediaUrl: string | null; text: string; comments: unknown[] }>(post: T, entitled: boolean) {
  if (post.isPublic || entitled) return post;
  return { ...post, text: 'Subscribe to unlock this exclusive post.', mediaUrl: null, comments: [] };
}
