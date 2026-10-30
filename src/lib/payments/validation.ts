import type { MPPayment, MPSubscription } from './client.js';
export function checkSubscription(resource: MPSubscription, intent: { id: string; amount: number; months: number | null }, collector: string) {
  if (String(resource.collector_id) !== collector || resource.external_reference !== intent.id || resource.auto_recurring.currency_id !== 'CLP' || resource.auto_recurring.transaction_amount !== intent.amount || resource.auto_recurring.frequency_type !== 'months' || resource.auto_recurring.frequency !== intent.months) throw new Error('La suscripción no corresponde al comercio, plan o monto esperado');
}
export function checkPayment(payment: MPPayment, intent: { id: string; amount: number }, collector: string, live: boolean, referenceRequired = true) {
  if (String(payment.collector_id) !== collector || payment.currency_id !== 'CLP' || payment.transaction_amount !== intent.amount || payment.live_mode !== live || (referenceRequired && payment.external_reference !== intent.id)) throw new Error('El pago no corresponde al comercio, modo, moneda o monto esperado');
  const refunded = payment.transaction_amount_refunded || 0;
  if (!Number.isInteger(refunded) || refunded < 0 || refunded > payment.transaction_amount) throw new Error('Monto reembolsado inválido');
}
export function addMonthsClamped(start: Date, months: number) {
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}
