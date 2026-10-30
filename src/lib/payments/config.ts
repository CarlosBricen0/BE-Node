import { pesoAmount } from '../money.js';
export type PlanId = 'monthly' | 'yearly';
export function plans() {
  const read = (value: string | undefined) => { try { return pesoAmount(value); } catch { return null; } };
  return [
    { id: 'monthly' as const, name: 'Membresía mensual', months: 1, amount: read(process.env.MEMBERSHIP_MONTHLY_CLP) },
    { id: 'yearly' as const, name: 'Membresía anual', months: 12, amount: read(process.env.MEMBERSHIP_YEARLY_CLP) },
  ];
}
export function planById(id: string) {
  const plan = plans().find(item => item.id === id);
  if (!plan) throw new Error('Plan inválido');
  if (!plan.amount) throw new Error('El precio de la membresía aún no está configurado');
  return { ...plan, amount: plan.amount };
}
export function paymentConfig() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const collector = process.env.MERCADOPAGO_COLLECTOR_ID;
  const mode = process.env.MERCADOPAGO_MODE;
  const origin = process.env.WEB_APP_URL;
  const webhook = process.env.MERCADOPAGO_WEBHOOK_URL;
  if (!token || !collector || !['test','live'].includes(mode || '') || !origin || !webhook) throw new Error('Configura Mercado Pago antes de iniciar un cobro');
  if (!/^\d+$/.test(collector)) throw new Error('Collector de Mercado Pago inválido');
  if (new URL(webhook).protocol !== 'https:' || new URL(origin).protocol !== 'https:') throw new Error('Mercado Pago requiere URLs públicas HTTPS para esta integración');
  return { token, collector, mode, origin: origin.replace(/\/$/, ''), webhook };
}
