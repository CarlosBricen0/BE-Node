import prisma from '../db/prisma.js';
import { hasAccess } from '../lib/policy.js';
import { requireUser, HttpError } from '../lib/auth.js';
export async function creator() {
  if (!process.env.ADMIN_USER_ID && (process.env.NODE_ENV === 'production' || !process.env.ADMIN_EMAIL)) return null;
  const user = await prisma.user.findUnique({ where: process.env.ADMIN_USER_ID ? { id: process.env.ADMIN_USER_ID } : { email: process.env.ADMIN_EMAIL!.toLowerCase() }, select: { id: true, name: true, image: true } });
  if (!user) return null;
  const [imageCount,videoCount,likes] = await Promise.all([prisma.post.count({where:{mediaType:'image'}}),prisma.post.count({where:{mediaType:'video'}}),prisma.post.aggregate({_sum:{likes:true}})]);
  return { ...user, imageCount, videoCount, totalLikes: likes._sum.likes || 0 };
}
export async function products() { return prisma.product.findMany({where:{isArchived:false},take:100,orderBy:{id:'asc'}}); }
export async function product(id: string) { const value=await prisma.product.findFirst({where:{id,isArchived:false}}); if(!value) throw new HttpError(404,'Product not found'); return value; }
export async function billing() {
  const user=await requireUser();
  const subscription=await prisma.subscription.findUnique({where:{userId:user.id},select:{status:true,price:true,currency:true,endDate:true,providerSubscriptionId:true}});
  return { subscription, hasAccess: hasAccess(subscription) };
}
