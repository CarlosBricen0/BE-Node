import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const root = process.cwd();
const local = path.join(root, '.local');
const data = path.join(local, 'postgres');
mkdirSync(local, { recursive: true, mode: 0o700 });
const bins = [process.env.POSTGRES_BIN, '/opt/homebrew/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin', '/usr/local/opt/postgresql@16/bin'].filter(Boolean);
const bin = bins.find(candidate => existsSync(path.join(candidate, 'pg_ctl')));
if (!bin) throw new Error('Instala PostgreSQL 16 o configura POSTGRES_BIN. En macOS: brew install postgresql@16');
const ctl = (...args) => execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, ...args], { encoding: 'utf8', stdio: 'pipe' });
if (process.argv.includes('--stop')) {
  if (existsSync(path.join(data,'postmaster.pid'))) ctl('stop','-m','fast');
  console.log('Instancia PostgreSQL del proyecto detenida.');
  process.exit(0);
}
const file = path.join(local,'database.json');
const config = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : { port: 5433, adminPassword: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex') };
writeFileSync(file,JSON.stringify(config),{ mode: 0o600 }); chmodSync(file,0o600);
if (!existsSync(path.join(data,'PG_VERSION'))) {
  const passwordFile = path.join(local,'postgres-password');
  writeFileSync(passwordFile,config.adminPassword,{ mode: 0o600 });
  execFileSync(path.join(bin,'initdb'),['-D',data,'-U','onlyhorse_admin','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile',passwordFile],{ stdio:'pipe' });
}
let running = false;
try { ctl('status'); running = true; } catch {}
if (!running) ctl('start','-l',path.join(local,'postgres.log'),'-o',`-h 127.0.0.1 -p ${config.port} -k ${local}`);
const sql = text => execFileSync(path.join(bin,'psql'),['-h','127.0.0.1','-p',String(config.port),'-U','onlyhorse_admin','-d','postgres','-v','ON_ERROR_STOP=1','-At','-f','-'],{ input: text, encoding: 'utf8', env: { ...process.env, PGPASSWORD: config.adminPassword }, stdio:'pipe' });
if (!sql("SELECT 1 FROM pg_roles WHERE rolname='onlyhorse';").trim()) sql(`CREATE ROLE onlyhorse LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${config.appPassword}';`);
for (const name of ['onlyhorse','onlyhorse_test']) {
  if (!sql(`SELECT 1 FROM pg_database WHERE datname='${name}';`).trim()) sql(`CREATE DATABASE ${name} OWNER onlyhorse;`);
}
const url = `postgresql://onlyhorse:${config.appPassword}@127.0.0.1:${config.port}/onlyhorse?schema=public`;
const testUrl = url.replace('/onlyhorse?', '/onlyhorse_test?');
const updateEnv = (name, fields, fallback = '') => {
  const destination = path.join(root,name);
  let content = existsSync(destination) ? readFileSync(destination,'utf8') : fallback;
  const currentUrl = content.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g,'');
  if (currentUrl && !currentUrl.includes(`@127.0.0.1:${config.port}/onlyhorse`) && !currentUrl.includes('@localhost:5433/onlyhorse')) throw new Error(`No se reemplazó DATABASE_URL externo en ${name}`);
  if (name === '.env') {
    for (const line of readFileSync(path.join(root,'.env.example'),'utf8').split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !new RegExp(`^${match[1]}=`,'m').test(content)) content += `\n${line}\n`;
    }
    if (!content.match(/^CRON_SECRET=.+$/m)) fields.CRON_SECRET = randomBytes(32).toString('hex');
  }
  for (const [key,value] of Object.entries(fields)) {
    const pattern = new RegExp(`^${key}=.*$`,'m');
    content = pattern.test(content) ? content.replace(pattern,`${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(destination,content,{mode:0o600}); chmodSync(destination,0o600);
};
updateEnv('.env',{ DATABASE_URL: url, TEST_DATABASE_URL: testUrl, POSTGRES_PASSWORD: config.appPassword });

console.log('PostgreSQL 16 listo en 127.0.0.1:5433. Bases onlyhorse y onlyhorse_test creadas.');
console.log('Credenciales guardadas en archivos ignorados; no se imprimen. Ejecuta npm run db:deploy.');
