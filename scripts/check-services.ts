import 'dotenv/config';
import { serviceVariables } from '../src/lib/services-config.js';

async function main() {
  let pending = 0;
  for (const [name,variables] of Object.entries(serviceVariables)) {
    const absent = variables.filter(key => !process.env[key]);
    if (absent.length) { console.log(`${name}: BLOQUEADO (${absent.join(', ')})`); pending++; continue; }
    try {
      if (name === 'PostgreSQL') {
        const { PrismaClient } = await import('@prisma/client');
        const db = new PrismaClient();
        try { await db.$queryRaw`SELECT 1`; const roles = await db.$queryRaw<{rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean}[]>`SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`; if (roles[0].rolsuper || roles[0].rolcreatedb || roles[0].rolcreaterole) throw new Error(); const tables = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('User','PaymentIntent','Payment','RateLimit')`; if (Number(tables[0].count) !== 4) throw new Error(); }
        finally { await db.$disconnect(); }
        console.log('PostgreSQL: OK (conexión, tablas y rol sin privilegios de administración del servidor)');
      } else if (name === 'MercadoPago') {
        const { paymentConfig, planById } = await import('../src/lib/payments/config.js');
        const { MercadoPagoClient } = await import('../src/lib/payments/client.js');
        const config = paymentConfig(); planById('monthly'); planById('yearly');
        const account = await new MercadoPagoClient(config.token).request<{ id: number; site_id: string }>('/users/me');
        if (String(account.id) !== config.collector || account.site_id !== 'MLC') throw new Error();
        console.log('MercadoPago: OK (identidad de cuenta Chile; cobros y webhooks aún requieren pruebas)');
      } else if (name === 'Kinde') {
        const url = new URL('/.well-known/openid-configuration', process.env.KINDE_ISSUER_URL!);
        if (url.protocol !== 'https:') throw new Error();
        const response = await fetch(url,{ signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error();
        console.log('Kinde: OK (discovery disponible; login real pendiente)');
      } else if (name === 'Cloudinary') {
        const { v2 } = await import('cloudinary');
        v2.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
        await v2.api.ping();
        console.log('Cloudinary: OK (autenticación; carga real pendiente)');
      } else {
        console.log(`${name}: CONFIGURADO (prueba real pendiente; no se envían correos ni cobros desde este diagnóstico)`);
      }
    } catch { console.log(`${name}: ERROR (revisar conexión/configuración; valores ocultos)`); pending++; }
  }
  process.exitCode = pending ? 1 : 0;
}
main();
