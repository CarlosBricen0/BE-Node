import { reconcileBilling } from '../lib/payments/reconcile.js';
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized',{ status: 401 });
  try { return Response.json(await reconcileBilling()); }
  catch { return Response.json({ error: 'Conciliación pendiente; revisar configuración y alertas' },{ status: 503 }); }
}
