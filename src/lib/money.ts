import { HttpError } from './errors.js';
export function pesoAmount(value: unknown): number {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) throw new HttpError(400,'El monto CLP debe ser un número entero de pesos');
  const amount = Number(text);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) throw new HttpError(400,'Monto CLP fuera de rango');
  return amount;
}
/** New CLP records store whole pesos; historical USD records retain cents. No FX conversion. */
export function formatMoney(amount: number, currency = 'CLP') {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: code, maximumFractionDigits: code === 'CLP' ? 0 : 2 }).format(code === 'USD' ? amount / 100 : amount);
}
