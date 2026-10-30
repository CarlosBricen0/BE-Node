
import prisma from '../db/prisma.js';
import { requireUser, requireAdmin, isAdminUser, HttpError } from '../lib/auth.js';
import { hasAccess, validText, publicPost } from '../lib/policy.js';
import { enforceLimit } from '../lib/rate-limit.js';


async function requireMember() {
  const user = await requireUser();
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!isAdminUser(user) && !hasAccess(subscription)) throw new HttpError(403,'An active subscription is required');
  return user;
}
export async function getPostsAction() {
  const user = await requireUser();
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  const entitled = isAdminUser(user) || hasAccess(subscription);
  const posts = await prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: {
    comments: { orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { id: true, name: true, image: true } } } },
    likesList: { where: { userId: user.id }, select: { userId: true } }, _count: { select: { likesList: true } },
  }});
  return posts.map(post => publicPost({ ...post, likes: post._count.likesList }, entitled));
}
export async function deletePostAction(postId: string) {
  await requireAdmin();
  await prisma.post.delete({ where: { id: postId } });
  return { success: true };
}
export async function likePostAction(postId: string) {
  const user = await requireMember();
  // Serializable transaction and bounded retry keep a unique like and consistent count under concurrency.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        const existing = await tx.like.findUnique({ where: { userId_postId: { userId: user.id, postId } } });
        if (existing) await tx.like.delete({ where: { id: existing.id } });
        else await tx.like.create({ data: { userId: user.id, postId } });
        const likes = await tx.like.count({ where: { postId } });
        await tx.post.update({ where: { id: postId }, data: { likes } });
      }, { isolationLevel: 'Serializable' });
      return { success: true };
    } catch (error) {
      if (attempt === 2 || !['P2034', 'P2002'].includes((error as { code: string }).code)) throw error;
    }
  }
}
export async function commentOnPostAction(postId: string, text: string) {
  const user = await requireMember();
  await enforceLimit('comment', user.id, 30, 60000);
  await prisma.comment.create({ data: { text: validText(text, 1000), postId, userId: user.id } });
  return { success: true };
}
