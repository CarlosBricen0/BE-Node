import prisma from '../db/prisma.js';
import { Resend } from 'resend';
export async function deliverEmails() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const pending = await prisma.emailDelivery.findMany({ where: { sentAt: null }, take: 25, orderBy: { createdAt: 'asc' } });
  for (const email of pending) {
    const result = await resend.emails.send({ from: process.env.EMAIL_FROM, to: email.recipient, subject: email.subject, text: email.body }, { idempotencyKey: email.id });
    if (result.error) throw new Error(result.error.message);
    await prisma.emailDelivery.update({ where: { id: email.id }, data: { sentAt: new Date() } });
  }
}
