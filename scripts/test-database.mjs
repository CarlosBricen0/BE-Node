import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error('Configura TEST_DATABASE_URL o ejecuta npm run db:local');
const url = new URL(target);
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/onlyhorse_test') throw new Error('Las pruebas requieren la base local aislada onlyhorse_test');
const env = { ...process.env, DATABASE_URL:target, RUN_DATABASE_TESTS:'1', NODE_ENV:'test' };
for (const [bin,args] of [['./node_modules/.bin/prisma',['migrate','deploy']],['./node_modules/.bin/tsx',['--test','tests/billing.integration.test.ts','tests/http.integration.test.ts']]]) {
  const result=spawnSync(bin,args,{env,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
