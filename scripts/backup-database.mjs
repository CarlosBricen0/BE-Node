import 'dotenv/config';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const local=path.join(process.cwd(),'.local');
const url=new URL(process.env.DATABASE_URL || '');
const bin=[process.env.POSTGRES_BIN,'/opt/homebrew/opt/postgresql@16/bin','/usr/lib/postgresql/16/bin','/usr/local/opt/postgresql@16/bin'].filter(Boolean).find(dir=>existsSync(path.join(dir,'pg_dump')));
if (!bin) throw new Error('Instala PostgreSQL 16 o define POSTGRES_BIN');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port || '5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1),PGSSLMODE:url.searchParams.get('sslmode') || 'prefer'};
const dir=path.join(local,'backups');mkdirSync(dir,{recursive:true,mode:0o700});
const output=path.join(dir,`onlyhorse-${new Date().toISOString().replaceAll(':','-')}.dump`);
const fd=openSync(output,'wx',0o600);
try { execFileSync(path.join(bin,'pg_dump'),['--format=custom','--no-owner','--no-acl'],{env,stdio:['ignore',fd,'pipe']}); } finally { closeSync(fd); }
console.log(`Backup local creado: ${path.relative(process.cwd(),output)}`);
if (process.argv.includes('--verify')) {
  if (!['127.0.0.1','localhost'].includes(url.hostname) || !existsSync(path.join(local,'database.json'))) throw new Error('La restauración automática solo está permitida en la instancia local del proyecto');
  const credentials=JSON.parse(readFileSync(path.join(local,'database.json'),'utf8'));
  const admin={...env,PGUSER:'onlyhorse_admin',PGPASSWORD:credentials.adminPassword,PGDATABASE:'postgres'};
  const database=`onlyhorse_restore_${randomUUID().replaceAll('-','')}`;
  const sql=text=>execFileSync(path.join(bin,'psql'),['-v','ON_ERROR_STOP=1','-At','-f','-'],{env:admin,input:text,encoding:'utf8',stdio:'pipe'});
  sql(`CREATE DATABASE ${database} OWNER onlyhorse;`);
  try {
    execFileSync(path.join(bin,'pg_restore'),['--no-owner','--no-acl','--exit-on-error','--dbname',database,output],{env:{...env,PGDATABASE:database},stdio:'pipe'});
    const count=execFileSync(path.join(bin,'psql'),['-At','-c',`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`],{env:{...env,PGDATABASE:database},encoding:'utf8',stdio:'pipe'}).trim();
    if (Number(count)<14) throw new Error('La copia restaurada no contiene las tablas esperadas');
    console.log(`Restauración comprobada en base temporal aislada (${count} tablas).`);
  } finally { sql(`DROP DATABASE ${database};`); }
}
