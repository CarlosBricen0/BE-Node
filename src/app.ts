import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import prisma from './db/prisma.js';
import { authenticate, withActor, HttpError, requireAdmin } from './lib/auth.js';
import * as feed from './services/feed.js';
import * as admin from './services/admin.js';
import * as profile from './services/profile.js';
import * as billing from './services/billing.js';
import * as orders from './services/orders.js';
import * as queries from './services/queries.js';
import { createProductCheckout } from './lib/payments/checkout.js';
import { requireUser } from './lib/auth.js';
import { plans } from './lib/payments/config.js';
import { POST as webhook } from './handlers/webhook.js';
import { POST as upload } from './handlers/upload.js';
import { GET as billingCron } from './handlers/cron-billing.js';
import { GET as emailCron } from './handlers/cron-emails.js';

type Authenticator = typeof authenticate;
export function createApp(identity: Authenticator = authenticate) {
  const app = express();
  app.disable('x-powered-by'); app.use(helmet()); app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use(express.json({limit:'32kb'}));
  const handle = (work: (req: Request) => unknown) => async (req: Request,res: Response,next: NextFunction) => {
    try { const value=await work(req);res.json(value ?? {success:true}); } catch(error) {next(error);}
  };
  app.get('/health/live',handle(()=>({status:'ok'})));
  app.get('/health/ready',handle(async()=>{await prisma.$queryRaw`SELECT 1`; if(!process.env.KINDE_ISSUER_URL || !process.env.KINDE_AUDIENCE) throw new HttpError(503,'Identity is not configured');return {status:'ready'};}));
  app.get('/v1/plans',handle(plans)); app.get('/v1/creator',handle(queries.creator));
  const bridge = (handler: (request: globalThis.Request) => Promise<globalThis.Response>) => async (req: Request,res: Response,next: NextFunction) => {
    try {
      const request=new globalThis.Request(`http://backend.local${req.originalUrl}`,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([,v])=>typeof v==='string')) as Record<string,string>,...(req.method==='POST'?{body:JSON.stringify(req.body)}:{})});
      const result=await handler(request);res.status(result.status);result.headers.forEach((value,key)=>res.setHeader(key,value));res.send(await result.text());
    } catch(error) {next(error);}
  };
  app.post('/webhooks/mercadopago',bridge(webhook));
  // Cron authorization is a separate machine credential, compared in constant time.
  app.use('/internal', (req,res,next)=>{
    const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`); const actual=Buffer.from(req.headers.authorization || '');
    if(!process.env.CRON_SECRET || expected.length!==actual.length || !timingSafeEqual(expected,actual)) {res.status(401).json({error:'Unauthorized'});return;}next();
  });
  app.get('/internal/cron/billing',bridge(billingCron));app.get('/internal/cron/emails',bridge(emailCron));
  app.use('/v1',async(req,_res,next)=>{try {const user=await identity(req.headers.authorization);withActor(user,()=>next());}catch(error){next(error);}});
  app.get('/v1/me',handle(profile.getUserProfileAction));
  app.patch('/v1/me',handle(req=>profile.updateUserProfileAction(req.body)));
  app.get('/v1/feed',handle(feed.getPostsAction));
  app.post('/v1/posts/:id/likes',handle(req=>feed.likePostAction(String(req.params.id))));
  app.post('/v1/posts/:id/comments',handle(req=>feed.commentOnPostAction(String(req.params.id),req.body?.text)));
  app.delete('/v1/posts/:id',handle(req=>feed.deletePostAction(String(req.params.id))));
  app.get('/v1/products',handle(queries.products));app.get('/v1/products/:id',handle(req=>queries.product(String(req.params.id))));
  app.post('/v1/orders/checkout',handle(async req=>createProductCheckout(await requireUser(),req.body)));
  app.get('/v1/orders/:id',handle(req=>orders.checkProductPaidStatus(String(req.params.id))));
  app.get('/v1/billing',handle(queries.billing));app.post('/v1/billing/checkout',handle(req=>billing.startMembershipAction(req.body?.plan)));
  app.post('/v1/billing/cancel',handle(billing.cancelMembershipAction));app.post('/v1/billing/refresh',handle(billing.refreshMembershipAction));
  app.post('/v1/uploads/sign',bridge(upload));
  app.use('/v1/admin',async(_req,_res,next)=>{try {await requireAdmin();next();}catch(error){next(error);}});
  app.get('/v1/admin/check',handle(profile.getUserProfileAction));app.get('/v1/admin/products',handle(admin.getAllProductsAction));
  app.post('/v1/admin/products',handle(req=>admin.addNewProductToStoreAction(req.body)));
  app.post('/v1/admin/products/:id/archive',handle(req=>admin.toggleProductArchiveAction(String(req.params.id))));
  app.post('/v1/admin/posts',handle(req=>admin.createPostAction(req.body)));app.get('/v1/admin/analytics',handle(admin.getDashboardData));
  app.use((_req,res)=>{res.status(404).json({error:'Not found'});});
  app.use((error: unknown,_req: Request,res: Response,_next: NextFunction)=>{
    const code=(error as {code?:string})?.code;
    const status=error instanceof HttpError ? error.status : [400,413].includes((error as {status?:number})?.status || 0) ? (error as {status:number}).status : code==='P2025'?404:code==='P2002'?409:500;
    // Provider errors, payloads and database details never reach clients or logs.
    if(status>=500) console.error('Backend request failed; inspect service readiness and provider configuration');
    res.status(status).json({error:status===500?'No se pudo completar la operación':status===503?'Servicio pendiente de configuración':status===400?'Solicitud inválida':error instanceof HttpError?error.message:'No se pudo completar la operación'});
  });
  return app;
}
