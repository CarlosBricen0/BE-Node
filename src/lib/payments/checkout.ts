import { randomUUID } from 'node:crypto';
import prisma from '../../db/prisma.js';
import { MercadoPagoClient } from './client.js';
import { paymentConfig, planById } from './config.js';
import { enforceLimit } from '../rate-limit.js';
import { validText, sizes } from '../policy.js';
import { hasAccess } from '../policy.js';
export type Shipping = { address: string; city: string; state: string; postalCode: string };
export function checkoutUrl(value: string | undefined) {
  if (!value) throw new Error('El proveedor no entregó una URL de pago');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['mercadopago.cl','mercadopago.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error('URL de pago inválida');
  return value;
}
export async function createMembershipCheckout(user: { id: string; email: string }, planId: string) {
  const config = paymentConfig();
  const plan = planById(planId);
  await enforceLimit('subscription-checkout', user.id, 5, 300000);
  const intent = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.subscription.findUnique({ where: { userId: user.id } });
    if (current && (hasAccess(current) || current.status === 'authorized')) throw new Error('Ya tienes una membresía. Adminístrala en Facturación.');
    const pending = await tx.paymentIntent.findFirst({ where: { userId: user.id, kind: 'subscription', status: { in: ['creating','pending','needs_review'] } }, orderBy: { createdAt: 'desc' } });
    if (pending) {
      if (pending.planId !== planId || pending.amount !== plan.amount || !pending.providerId) throw new Error('Existe una solicitud en preparación. Revisa Facturación antes de intentar otro cobro.');
      return pending;
    }
    return tx.paymentIntent.create({ data: { userId: user.id, kind: 'subscription', planId, amount: plan.amount, months: plan.months, status: 'creating' } });
  });
  const client = new MercadoPagoClient(config.token);
  if (intent.providerId) return { url: checkoutUrl((await client.subscription(intent.providerId)).init_point) };
  try {
    const result = await client.request<{ id: string; init_point: string }>('/preapproval', 'POST', {
      reason: `OnlyHorse · ${plan.name}`, external_reference: intent.id, payer_email: config.mode === 'test' ? process.env.MERCADOPAGO_TEST_PAYER_EMAIL || user.email : user.email,
      auto_recurring: { frequency: plan.months, frequency_type: 'months', transaction_amount: plan.amount, currency_id: 'CLP' },
      back_url: `${config.origin}/billing`, status: 'pending',
    }, intent.id);
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerId: result.id, status: 'pending' } });
    return { url: checkoutUrl(result.init_point) };
  } catch (error) {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'needs_review' } });
    throw error;
  }
}
export async function createProductCheckout(user: { id: string; email: string }, args: { productId: string; size: string; requestKey: string; shipping: Shipping }) {
  const config = paymentConfig();
  if (!sizes.includes(args.size) || !/^[0-9a-f-]{36}$/i.test(args.requestKey)) throw new Error('Solicitud de compra inválida');
  const shipping = { address: validText(args.shipping?.address, 200), city: validText(args.shipping?.city,100), state: validText(args.shipping?.state,100), postalCode: validText(args.shipping?.postalCode,20), country: 'CL' };
  await enforceLimit('product-checkout', user.id, 5, 300000);
  const intentId = `${user.id}:${args.requestKey}`;
  const intent = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const previous = await tx.paymentIntent.findUnique({ where: { id: intentId } });
    if (previous) {
      if (previous.userId !== user.id || previous.kind !== 'merchandise' || !previous.providerId) throw new Error('La compra anterior requiere revisión antes de reintentar');
      return previous;
    }
    const product = await tx.product.findFirst({ where: { id: args.productId, isArchived: false, currency: 'CLP' } });
    if (!product) throw new Error('El producto no está disponible para venta en CLP');
    const order = await tx.order.create({ data: { user: { connect: { id: user.id } }, product: { connect: { id: product.id } }, price: product.price, currency: 'CLP', provider: 'mercadopago', size: args.size, shippingAddress: { create: shipping } } });
    return tx.paymentIntent.create({ data: { id: intentId, userId: user.id, kind: 'merchandise', amount: order.price, orderId: order.id, status: 'creating' } });
  });
  const client = new MercadoPagoClient(config.token);
  if (intent.providerId) {
    const previous = await client.request<{ init_point: string; sandbox_init_point?: string }>(`/checkout/preferences/${encodeURIComponent(intent.providerId)}`);
    return { url: checkoutUrl(config.mode === 'test' ? previous.sandbox_init_point : previous.init_point) };
  }
  try {
    const product = await prisma.order.findUniqueOrThrow({ where: { id: intent.orderId! }, include: { product: true } });
    const result = await client.request<{ id: string; init_point: string; sandbox_init_point: string }>('/checkout/preferences', 'POST', {
      external_reference: intent.id, items: [{ id: product.productId, title: product.product.name, quantity: 1, unit_price: intent.amount, currency_id: 'CLP' }],
      payer: { email: config.mode === 'test' ? process.env.MERCADOPAGO_TEST_PAYER_EMAIL || user.email : user.email }, notification_url: config.webhook,
      back_urls: { success: `${config.origin}/purchase-success?orderId=${intent.orderId}`, pending: `${config.origin}/purchase-success?orderId=${intent.orderId}`, failure: `${config.origin}/merch/${product.productId}` }, auto_return: 'approved',
    }, intent.id);
    await prisma.$transaction([
      prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerId: result.id, status: 'pending' } }),
      prisma.order.update({ where: { id: intent.orderId! }, data: { providerPreferenceId: result.id } }),
    ]);
    return { url: checkoutUrl(config.mode === 'test' ? result.sandbox_init_point : result.init_point) };
  } catch (error) {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'needs_review' } });
    throw error;
  }
}
// Client keys are not secrets; this helper is also useful for controlled integration callers.
export const newCheckoutKey = () => randomUUID();
