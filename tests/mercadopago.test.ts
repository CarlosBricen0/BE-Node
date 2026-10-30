import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMPSignature } from '../src/lib/payments/signature.js';
import { MercadoPagoClient, type MPPayment } from '../src/lib/payments/client.js';
import { checkPayment, addMonthsClamped } from '../src/lib/payments/validation.js';
import { checkoutUrl } from '../src/lib/payments/checkout.js';
const now = Date.UTC(2026,9,29,12);
function signed(ts: string, id='abc123', request='request-1') { return `ts=${ts},v1=${createHmac('sha256','fixture-secret').update(`id:${id};request-id:${request};ts:${ts};`).digest('hex')}`; }
test('HMAC binds the resource, request id and timestamp and rejects stale or forged notifications', () => {
  for (const ts of [String(now),String(now/1000)]) assert.equal(verifyMPSignature({ signature: signed(ts), requestId:'request-1',resourceId:'ABC123',secret:'fixture-secret',now }),true);
  const valid = { signature: signed(String(now)), requestId:'request-1', resourceId:'abc123',secret:'fixture-secret',now };
  assert.equal(verifyMPSignature({...valid,resourceId:'other'}),false);
  assert.equal(verifyMPSignature({...valid,requestId:'other'}),false);
  assert.equal(verifyMPSignature({...valid,signature:'ts=abc,v1=bad'}),false);
  assert.equal(verifyMPSignature({...valid,now:now+16*60000}),false);
});
test('provider requests send secrets in headers, never URLs, with bounded timeout and idempotency', async () => {
  let seen = false;
  const fake: typeof fetch = async (input,init) => { seen=true; assert.equal(String(input),'https://api.mercadopago.com/preapproval'); assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fixture'); assert.equal((init?.headers as Record<string,string>)['X-Idempotency-Key'],'intent-1'); assert.equal(init?.method,'POST'); assert.equal(JSON.parse(String(init?.body)).auto_recurring.currency_id,'CLP'); assert.ok(init?.signal); return Response.json({id:'sub1'}); };
  await new MercadoPagoClient('fixture',fake).request('/preapproval','POST',{auto_recurring:{currency_id:'CLP',transaction_amount:10000}},'intent-1');
  assert.equal(seen,true);
});
test('payment verification rejects a different seller, amount, currency, mode or reference', () => {
  const payment = {id:1,external_reference:'intent',collector_id:99,status:'approved',date_last_updated:new Date(now).toISOString(),date_approved:new Date(now).toISOString(),currency_id:'CLP',transaction_amount:10000,live_mode:false} satisfies MPPayment;
  checkPayment(payment,{id:'intent',amount:10000},'99',false);
  for (const changed of [{collector_id:98},{transaction_amount:1},{currency_id:'USD'},{live_mode:true},{external_reference:'another'}]) assert.throws(() => checkPayment({...payment,...changed},{id:'intent',amount:10000},'99',false));
});
test('month/year periods clamp month ends and leap days', () => {
  assert.equal(addMonthsClamped(new Date('2027-01-31T12:00:00Z'),1).toISOString(),'2027-02-28T12:00:00.000Z');
  assert.equal(addMonthsClamped(new Date('2028-02-29T12:00:00Z'),12).toISOString(),'2029-02-28T12:00:00.000Z');
});
test('checkout redirects are restricted to Mercado Pago HTTPS URLs', () => {
  assert.equal(checkoutUrl('https://www.mercadopago.cl/checkout'),'https://www.mercadopago.cl/checkout');
  for (const value of ['javascript:alert(1)','https://mercadopago.cl.attacker.example/','http://www.mercadopago.cl/']) assert.throws(() => checkoutUrl(value));
});
