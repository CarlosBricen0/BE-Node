
import prisma from '../db/prisma.js';
import { requireUser, isAdminUser } from '../lib/auth.js';
import { hasAccess, validText, validMedia } from '../lib/policy.js';

export async function getUserProfileAction() {

  const user = await requireUser();
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  return { id: user.id, name: user.name, email: user.email, image: user.image, isAdmin: isAdminUser(user), isSubscribed: isAdminUser(user) || hasAccess(subscription) };
}
export async function updateUserProfileAction({ name, image }: { name: string; image: string }) {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { name: validText(name, 100), ...(image ? { image: validMedia(image) } : {}) } });
  return { success: true };
}
