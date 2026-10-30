import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db/prisma.js';
import { hasAccess } from '../policy.js';
import { MercadoPagoClient, type MPPayment, type MPInvoice } from './client.js';
import { checkPayment, checkSubscription, addMonthsClamped } from './validation.js';
export type SyncConfig = { collector: string; live: boolean };
const date = (value: string) => { const result = new Date(value); if (!Number.isFinite(result.getTime())) throw new Error('Fecha de proveedor inválida'); return result; };
const receipt = (...parts: unknown[]) => `mp:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
async function transaction<T>(db: PrismaClient, userId: string, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    // One user owns each intent; row locking serializes concurrent deliveries and renewals.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    return callback(tx);
  }, { timeout: 15000 });
}
export async function syncSubscription(id: string, client: MercadoPagoClient, config: SyncConfig, db = prisma) {
  const resource = await client.subscription(id);
  const intent = await db.paymentIntent.findUnique({ where: { id: resource.external_reference } });
  if (!intent || intent.kind !== 'subscription') return { ignored: true };
  checkSubscription(resource, intent, config.collector);
  if (!['pending','authorized','paused','cancelled'].includes(resource.status)) throw new Error('Estado de suscripción desconocido');
  const stamp = date(resource.last_modified);
  return transaction(db, intent.userId, async tx => {
    const key = receipt('subscription', resource.id, resource.last_modified, resource.status);
    if (await tx.webhookEvent.findUnique({ where: { id: key } })) return { duplicate: true };
    const current = await tx.subscription.findUnique({ where: { userId: intent.userId } });
    const previousIntent = current?.intentId ? await tx.paymentIntent.findUnique({ where: { id: current.intentId } }) : null;
    const olderIntent = previousIntent && previousIntent.createdAt > intent.createdAt;
    const olderVersion = current?.intentId === intent.id && current.providerUpdatedAt && current.providerUpdatedAt > stamp;
    if (!olderIntent && !olderVersion) {
      const same = current?.intentId === intent.id;
      const updated = await tx.subscription.upsert({ where: { userId: intent.userId }, create: {
        userId: intent.userId, provider: 'mercadopago', providerSubscriptionId: resource.id, intentId: intent.id,
        currency: 'CLP', status: resource.status, planId: intent.planId!, price: intent.amount,
        startDate: new Date(), endDate: new Date(0), providerUpdatedAt: stamp,
      }, update: {
        provider: 'mercadopago', providerSubscriptionId: resource.id, intentId: intent.id, currency: 'CLP',
        status: resource.status, planId: intent.planId!, price: intent.amount, providerUpdatedAt: stamp,
        ...(!same ? { endDate: new Date(0), entitlementPaymentId: null } : {}),
      }});
      await tx.user.update({ where: { id: intent.userId }, data: { isSubscribed: hasAccess(updated) } });
    }
    if (!olderVersion) await tx.paymentIntent.update({ where: { id: intent.id }, data: { providerId: resource.id, status: resource.status } });
    await tx.webhookEvent.create({ data: { id: key } });
    return { synced: true };
  });
}
async function applyPayment(payment: MPPayment, intentId: string, config: SyncConfig, db: PrismaClient, invoice?: MPInvoice) {
  const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
  checkPayment(payment, intent, config.collector, config.live, !invoice);
  const stamp = date(payment.date_last_updated);
  const approved = payment.status === 'approved';
  const refunded = payment.transaction_amount_refunded || 0;
  const revoked = ['refunded','charged_back','cancelled'].includes(payment.status) || refunded >= intent.amount;
  if (approved && !payment.date_approved) throw new Error('Pago aprobado sin fecha de aprobación');
  return transaction(db, intent.userId, async tx => {
    const key = receipt('payment', payment.id, payment.date_last_updated, payment.status, refunded);
    if (await tx.webhookEvent.findUnique({ where: { id: key } })) return { duplicate: true };
    const paymentId = `mp:${payment.id}`;
    const existing = await tx.payment.findUnique({ where: { id: paymentId } });
    if (existing && existing.intentId !== intentId) throw new Error('El pago ya corresponde a otra intención');
    if (existing?.providerUpdatedAt && existing.providerUpdatedAt > stamp) return { ignored: true };
    await tx.payment.upsert({ where: { id: paymentId }, create: {
      id: paymentId, provider: 'mercadopago', userId: intent.userId, amount: intent.amount, currency: 'CLP', kind: intent.kind,
      status: payment.status, refundedAmount: payment.status === 'charged_back' ? intent.amount : refunded, providerUpdatedAt: stamp, intentId,
    }, update: { status: payment.status, refundedAmount: payment.status === 'charged_back' ? intent.amount : refunded, providerUpdatedAt: stamp } });
    if (intent.kind === 'merchandise') {
      const order = await tx.order.findUniqueOrThrow({ where: { id: intent.orderId! } });
      if (order.userId !== intent.userId || order.currency !== 'CLP' || order.price !== intent.amount) throw new Error('Pedido inconsistente');
      await tx.order.update({ where: { id: order.id }, data: { isPaid: approved && !revoked, paymentStatus: payment.status } });
      if (approved && !revoked) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: intent.userId } });
        await tx.emailDelivery.upsert({ where: { id: `receipt-${order.id}` }, update: {}, create: {
          id: `receipt-${order.id}`, recipient: user.email, subject: `Recibo OnlyHorse ${order.id}`,
          body: `Pago confirmado por CLP ${intent.amount}. Pedido ${order.id}, talla ${order.size}.`,
        }});
      }
    } else if (invoice) {
      const current = await tx.subscription.findUniqueOrThrow({ where: { userId: intent.userId } });
      if (current.intentId === intent.id) {
        const start = date(invoice.debit_date || payment.date_approved!);
        const end = addMonthsClamped(start, intent.months!);
        const extend = approved && !revoked && current.endDate < end;
        const revoke = revoked && current.entitlementPaymentId === paymentId;
        const updated = await tx.subscription.update({ where: { id: current.id }, data: {
          ...(extend ? { startDate: start, endDate: end, entitlementPaymentId: paymentId } : {}),
          ...(revoke ? { endDate: new Date(0), entitlementPaymentId: null } : {}),
        }});
        await tx.user.update({ where: { id: intent.userId }, data: { isSubscribed: hasAccess(updated) } });
        if (extend) {
          const user = await tx.user.findUniqueOrThrow({ where: { id: intent.userId } });
          await tx.emailDelivery.upsert({ where: { id: `membership-${payment.id}` }, update: {}, create: {
            id: `membership-${payment.id}`, recipient: user.email, subject: 'Membresía OnlyHorse confirmada',
            body: `Tu pago por CLP ${intent.amount} está confirmado. Acceso pagado hasta ${end.toISOString().slice(0,10)}.`,
          }});
        }
      }
    }
    if (intent.kind === 'merchandise') await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: payment.status } });
    await tx.webhookEvent.create({ data: { id: key } });
    return { synced: true };
  });
}
export async function syncInvoice(id: string, client: MercadoPagoClient, config: SyncConfig, db = prisma) {
  const invoice = await client.invoice(id);
  if (!invoice.payment?.id) return { pending: true };
  const subscription = await client.subscription(invoice.preapproval_id);
  const intent = await db.paymentIntent.findUnique({ where: { id: subscription.external_reference } });
  if (!intent || intent.kind !== 'subscription') return { ignored: true };
  checkSubscription(subscription, intent, config.collector);
  await syncSubscription(subscription.id, client, config, db);
  const payment = await client.payment(String(invoice.payment.id));
  return applyPayment(payment, intent.id, config, db, invoice);
}
export async function reconcileSubscription(id: string, client: MercadoPagoClient, config: SyncConfig, db = prisma) {
  await syncSubscription(id, client, config, db);
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await client.request<{ results: { id: number }[] }>(`/authorized_payments?preapproval_id=${encodeURIComponent(id)}&limit=100&offset=${offset}`);
    for (const invoice of page.results) await syncInvoice(String(invoice.id), client, config, db);
    if (page.results.length < 100) break;
    if (offset === 900) throw new Error('Revisar paginación de conciliación de suscripción');
  }
  await db.subscription.updateMany({ where: { providerSubscriptionId: id }, data: { lastReconciledAt: new Date() } });
}
export async function syncPayment(id: string, client: MercadoPagoClient, config: SyncConfig, db = prisma) {
  const payment = await client.payment(id);
  const intent = payment.external_reference ? await db.paymentIntent.findUnique({ where: { id: payment.external_reference } }) : null;
  if (!intent) return { ignored: true }; // Subscription invoices are also recovered by the reconciliation cron.
  if (intent.kind === 'subscription') {
    if (!intent.providerId) return { pending: true };
    await reconcileSubscription(intent.providerId, client, config, db);
    return { synced: true };
  }
  return applyPayment(payment, intent.id, config, db);
}
