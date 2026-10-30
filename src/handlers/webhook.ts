import { verifyMPSignature } from '../lib/payments/signature.js';
import { MercadoPagoClient } from '../lib/payments/client.js';
import { paymentConfig } from '../lib/payments/config.js';
import { syncSubscription, syncInvoice, syncPayment } from '../lib/payments/sync.js';
import { deliverEmails } from '../lib/email.js';
export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Webhook no configurado' }, { status: 503 });
  const url = new URL(request.url);
  const resourceId = url.searchParams.get('data.id');
  if (!verifyMPSignature({ signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'), resourceId, secret })) return Response.json({ error: 'Firma inválida' }, { status: 401 });
  let body: { type?: string; data?: { id?: string | number } };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (String(body?.data?.id).toLowerCase() !== resourceId!.toLowerCase()) return Response.json({ error: 'Recurso inconsistente' }, { status: 400 });
  const handlers = { payment: syncPayment, subscription_preapproval: syncSubscription, subscription_authorized_payment: syncInvoice };
  if (!body.type || !Object.hasOwn(handlers, body.type)) return Response.json({ received: true, ignored: true });
  try {
    const config = paymentConfig();
    const client = new MercadoPagoClient(config.token);
    const result = await handlers[body.type as keyof typeof handlers](resourceId!, client, { collector: config.collector, live: config.mode === 'live' });
    await deliverEmails().catch(() => {}); // Durable outbox is retried independently.
    return Response.json({ received: true, ...result });
  } catch {
    console.error('Mercado Pago: conciliación fallida; se requiere reintento');
    return Response.json({ error: 'No se pudo conciliar la notificación' }, { status: 500 });
  }
}
