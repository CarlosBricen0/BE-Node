import { deliverEmails } from '../lib/email.js';
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
  await deliverEmails();
  return Response.json({ success: true });
}
