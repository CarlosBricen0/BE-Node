
import prisma from '../db/prisma.js';
import { requireUser } from '../lib/auth.js';
export async function checkProductPaidStatus(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id }, select: {
    product: true, isPaid: true, paymentStatus: true, price: true, currency: true, size: true, shippingAddress: true,
  }});
  return order || false;
}
