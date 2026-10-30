import { enforceLimit } from '../lib/rate-limit.js';
import { v2 as cloudinary } from 'cloudinary';
import { requireUser, isAdminUser } from '../lib/auth.js';
export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try { await enforceLimit('upload-signature', user.id, 10, 60000); } catch { return Response.json({ error: 'Demasiadas solicitudes' }, { status: 429 }); }
  if (!process.env.CLOUDINARY_API_SECRET) return Response.json({ error: 'Uploads are not configured' }, { status: 503 });
  const { paramsToSign } = await request.json();
  const timestamp = Number(paramsToSign?.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return Response.json({ error: 'Invalid timestamp' }, { status: 400 });
  // Folder and upload options are supplied by the server, never signed blindly.
  const folder = isAdminUser(user) ? 'onlyhorse/content' : `onlyhorse/avatars/${user.id}`;
  const allowed = new Set(['timestamp', 'source', 'folder', 'upload_preset']);
  if (!isAdminUser(user) && (!process.env.CLOUDINARY_AVATAR_PRESET || paramsToSign.upload_preset !== process.env.CLOUDINARY_AVATAR_PRESET || paramsToSign.folder !== folder)) return Response.json({ error: 'Avatar upload preset or folder is not configured correctly' }, { status: 400 });
  if (Object.keys(paramsToSign).some(key => !allowed.has(key)) || (paramsToSign.folder && paramsToSign.folder !== folder)) return Response.json({ error: 'Invalid upload parameters' }, { status: 400 });
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
  return Response.json({ signature });
}
