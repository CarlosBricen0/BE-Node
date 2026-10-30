
import { requireUser } from '../lib/auth.js';
import { createMembershipCheckout } from '../lib/payments/checkout.js';
import { MercadoPagoClient } from '../lib/payments/client.js';
import { paymentConfig } from '../lib/payments/config.js';
import { syncSubscription, reconcileSubscription } from '../lib/payments/sync.js';
import { enforceLimit } from '../lib/rate-limit.js';
import prisma from '../db/prisma.js';

export async function startMembershipAction(plan: string) {

  return createMembershipCheckout(await requireUser(), plan);
}
export async function cancelMembershipAction() {
  const user = await requireUser();
  await enforceLimit('cancel-subscription', user.id, 5, 300000);
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!subscription?.providerSubscriptionId || subscription.provider !== 'mercadopago') throw new Error('No hay una membresía de Mercado Pago para cancelar');
  const config = paymentConfig();
  const client = new MercadoPagoClient(config.token);
  const current = await client.subscription(subscription.providerSubscriptionId);
  const intent = await prisma.paymentIntent.findUnique({ where: { id: current.external_reference } });
  if (intent?.userId !== user.id || String(current.collector_id) !== config.collector) throw new Error('Membresía no autorizada');
  await client.request(`/preapproval/${encodeURIComponent(current.id)}`, 'PUT', { status: 'cancelled' }, `cancel-${current.id}`);
  await syncSubscription(current.id, client, { collector: config.collector, live: config.mode === 'live' });
  return { success: true };
}
export async function refreshMembershipAction() {
  const user = await requireUser();
  await enforceLimit('refresh-subscription', user.id, 3, 60000);
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  const intent = await prisma.paymentIntent.findFirst({ where: { userId: user.id, kind: 'subscription', providerId: { not: null } }, orderBy: { createdAt: 'desc' } });
  const id = subscription?.providerSubscriptionId || intent?.providerId;
  if (!id) throw new Error('No hay una membresía pendiente de conciliación');
  const config = paymentConfig();
  await reconcileSubscription(id, new MercadoPagoClient(config.token), { collector: config.collector, live: config.mode === 'live' });
  return { success: true };
}
