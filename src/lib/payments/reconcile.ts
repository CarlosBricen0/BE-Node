import prisma from '../../db/prisma.js';
import { paymentConfig } from './config.js';
import { MercadoPagoClient } from './client.js';
import { reconcileSubscription, syncPayment } from './sync.js';
export async function reconcileBilling() {
  const config = paymentConfig();
  const client = new MercadoPagoClient(config.token);
  const options = { collector: config.collector, live: config.mode === 'live' };
  let errors = 0;
  const subscriptions = await prisma.subscription.findMany({ where: { provider: 'mercadopago', providerSubscriptionId: { not: null }, OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: new Date(Date.now() - 900000) } }] }, orderBy: [{ lastReconciledAt: { sort: 'asc', nulls: 'first' } },{ id: 'asc' }], take: 20 });
  for (const subscription of subscriptions) {
    try { await reconcileSubscription(subscription.providerSubscriptionId!,client,options); }
    catch { errors++; await prisma.subscription.update({ where: { id: subscription.id }, data: { lastReconciledAt: new Date() } }); }
  }
  const intents = await prisma.paymentIntent.findMany({ where: { status: { in: ['pending','creating','needs_review','approved'] }, OR: [{ lastReconciledAt: null },{ lastReconciledAt: { lt: new Date(Date.now() - 900000) } }] }, orderBy: { lastReconciledAt: { sort: 'asc', nulls: 'first' } }, take: 20 });
  for (const intent of intents) {
    try {
      if (intent.kind === 'subscription') {
        const result = await client.request<{ results: { id: string; external_reference: string }[] }>(`/preapproval/search?external_reference=${encodeURIComponent(intent.id)}`);
        const matches = result.results.filter(row => row.external_reference === intent.id);
        if (matches.length > 1) throw new Error('Más de una suscripción requiere revisión');
        if (matches[0]) await reconcileSubscription(matches[0].id,client,options);
      } else {
        const result = await client.request<{ results: { id: number }[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(intent.id)}&sort=date_last_updated&criteria=desc&limit=100`);
        for (const payment of result.results) await syncPayment(String(payment.id),client,options);
      }
    } catch { errors++; }
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { lastReconciledAt: new Date() } });
  }
  await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (errors) throw new Error(`${errors} recursos de Mercado Pago requieren reintento o revisión`);
  return { subscriptions: subscriptions.length, intents: intents.length };
}
