import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { MercadoPagoClient, type MPSubscription, type MPPayment, type MPInvoice } from '../src/lib/payments/client.js';
import { syncSubscription, syncInvoice, syncPayment } from '../src/lib/payments/sync.js';
import { hasAccess } from '../src/lib/policy.js';
import { enforceLimit } from '../src/lib/rate-limit.js';
test('PostgreSQL: transactional Mercado Pago lifecycle', { skip: process.env.RUN_DATABASE_TESTS !== '1' },async t => {
  const db = new PrismaClient();
  const userId = `test-${randomUUID()}`;
  const intentId = `test-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  const payments = new Map<string,MPPayment>();
  const invoices = new Map<string,MPInvoice>();
  let stamp = Date.now();
  const subscription: MPSubscription = { id:`sub-${randomUUID()}`,external_reference:intentId,collector_id:99,status:'authorized',last_modified:new Date(++stamp).toISOString(),auto_recurring:{currency_id:'CLP',transaction_amount:10000,frequency:1,frequency_type:'months'} };
  const fake: typeof fetch = async input => {
    const url = new URL(String(input)); let value;
    if (url.pathname === `/preapproval/${subscription.id}`) value=subscription;
    else if (url.pathname.startsWith('/authorized_payments/')) value=invoices.get(url.pathname.split('/').pop()!);
    else if (url.pathname.startsWith('/v1/payments/')) value=payments.get(url.pathname.split('/').pop()!);
    if (!value) throw new Error(`Unexpected fixture request ${url.pathname}`);
    return Response.json(value);
  };
  const client = new MercadoPagoClient('fixture',fake);
  const config = { collector:'99',live:false };
  try {
    await db.user.create({data:{id:userId,email,name:'Integration fixture'}});
    await db.paymentIntent.create({data:{id:intentId,userId,kind:'subscription',amount:10000,months:1,planId:'monthly'}});
    await t.test('authorization without approved payment does not grant access',async()=>{
      await syncSubscription(subscription.id,client,config,db);
      assert.equal(hasAccess(await db.subscription.findUnique({where:{userId}})),false);
    });
    function invoice(id:number,start:string) {
      payments.set(String(id),{id,external_reference:intentId,collector_id:99,status:'approved',date_last_updated:new Date(++stamp).toISOString(),date_approved:start,currency_id:'CLP',transaction_amount:10000,live_mode:false});
      invoices.set(String(id),{id,preapproval_id:subscription.id,payment:{id},debit_date:start,last_modified:new Date(stamp).toISOString()});
    }
    invoice(101,'2030-01-31T12:00:00Z');
    await t.test('concurrent duplicate invoice yields one payment, receipt and paid period',async()=>{
      await Promise.all([syncInvoice('101',client,config,db),syncInvoice('101',client,config,db)]);
      assert.equal(await db.payment.count({where:{userId}}),1);
      assert.equal(await db.emailDelivery.count({where:{recipient:email}}),1);
      const current=await db.subscription.findUniqueOrThrow({where:{userId}});
      assert.equal(current.endDate.toISOString(),'2030-02-28T12:00:00.000Z');
      assert.equal(hasAccess(current,new Date('2030-02-01')),true);
    });
    invoice(102,'2030-02-28T12:00:00Z');
    await t.test('renewal extends once and cancelling retains the already-paid period',async()=>{
      await syncInvoice('102',client,config,db);
      subscription.status='cancelled';subscription.last_modified=new Date(++stamp).toISOString();
      await syncSubscription(subscription.id,client,config,db);
      const current=await db.subscription.findUniqueOrThrow({where:{userId}});
      assert.equal(current.endDate.toISOString(),'2030-03-28T12:00:00.000Z');
      assert.equal(hasAccess(current,new Date('2030-03-01')),true);
    });
    await t.test('an older subscription snapshot cannot overwrite cancellation metadata',async()=>{
      const previous=subscription.last_modified;
      subscription.status='authorized';subscription.last_modified=new Date(stamp-1000).toISOString();
      await syncSubscription(subscription.id,client,config,db);
      assert.equal((await db.subscription.findUniqueOrThrow({where:{userId}})).status,'cancelled');
      assert.equal((await db.paymentIntent.findUniqueOrThrow({where:{id:intentId}})).status,'cancelled');
      subscription.status='cancelled';subscription.last_modified=previous;
    });
    await t.test('refunding an older period cannot revoke a newer paid period',async()=>{
      payments.get('101')!.status='refunded';payments.get('101')!.transaction_amount_refunded=10000;payments.get('101')!.date_last_updated=new Date(++stamp).toISOString();
      await syncInvoice('101',client,config,db);
      assert.equal((await db.subscription.findUniqueOrThrow({where:{userId}})).entitlementPaymentId,'mp:102');
    });
    await t.test('chargeback of current payment revokes access and removes net revenue',async()=>{
      payments.get('102')!.status='charged_back';payments.get('102')!.date_last_updated=new Date(++stamp).toISOString();
      await syncInvoice('102',client,config,db);
      assert.equal(hasAccess(await db.subscription.findUnique({where:{userId}})),false);
      assert.equal((await db.payment.findUniqueOrThrow({where:{id:'mp:102'}})).refundedAmount,10000);
    });
    await t.test('seller or amount mismatch rolls back all local changes',async()=>{
      payments.get('102')!.collector_id=123;
      await assert.rejects(()=>syncInvoice('102',client,config,db));
      assert.equal(await db.payment.count({where:{userId}}),2);
    });
    await t.test('PostgreSQL enforces foreign keys and CLP amount constraints',async()=>{
      await assert.rejects(()=>db.paymentIntent.create({data:{userId:'missing',kind:'subscription',amount:1,months:1,planId:'monthly'}}));
      await assert.rejects(()=>db.paymentIntent.create({data:{userId,kind:'subscription',amount:-1,months:1,planId:'monthly'}}));
    });
    await t.test('durable rate limit remains consistent under concurrent requests',async()=>{
      const results=await Promise.allSettled([1,2,3].map(()=>enforceLimit('fixture',userId,2,60000,db)));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
    });
    await t.test('a paid merchandise order is confirmed once and only for its own intent',async()=>{
      const product=await db.product.create({data:{name:'Fixture',image:'/tshirts/1.png',price:19990,currency:'CLP'}});
      const order=await db.order.create({data:{userId,productId:product.id,price:19990,currency:'CLP',provider:'mercadopago',size:'M'}});
      const intent=await db.paymentIntent.create({data:{userId,kind:'merchandise',amount:19990,orderId:order.id}});
      payments.set('103',{id:103,external_reference:intent.id,collector_id:99,status:'approved',date_last_updated:new Date(++stamp).toISOString(),date_approved:new Date().toISOString(),currency_id:'CLP',transaction_amount:19990,live_mode:false});
      await Promise.all([syncPayment('103',client,config,db),syncPayment('103',client,config,db)]);
      assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).isPaid,true);
      assert.equal(await db.payment.count({where:{id:'mp:103'}}),1);
      await db.paymentIntent.delete({where:{id:intent.id}});await db.order.delete({where:{id:order.id}});await db.product.delete({where:{id:product.id}});
    });
  } finally {
    await db.payment.deleteMany({where:{userId}});await db.subscription.deleteMany({where:{userId}});await db.paymentIntent.deleteMany({where:{userId}});await db.emailDelivery.deleteMany({where:{recipient:email}});await db.user.deleteMany({where:{id:userId}});
    await db.webhookEvent.deleteMany();await db.rateLimit.deleteMany();await db.$disconnect();
  }
});
