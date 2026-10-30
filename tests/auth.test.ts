import {test} from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import {verifyAccessToken, HttpError, withActor, requireUser, requireAdmin} from '../src/lib/auth.js';
import {createApp} from '../src/app.js';
import type {User} from '@prisma/client';

test('API validates signature, issuer, audience, expiry and RS256',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='test';
 const key=createLocalJWKSet({keys:[jwk]});const options={issuer:'https://identity.example',audience:'urn:onlyhorse:api',key};
 const sign=(iss=options.issuer,aud=options.audience,exp='2m')=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('member').setIssuedAt().setIssuer(iss).setAudience(aud).setExpirationTime(exp).sign(privateKey);
 assert.equal((await verifyAccessToken(await sign(),options)).sub,'member');
 for(const token of [await sign('https://wrong.example'),await sign(options.issuer,'other'),await sign(options.issuer,options.audience,'-1s'),'not.a.token']) await assert.rejects(verifyAccessToken(token,options),error=>error instanceof HttpError && error.status===401);
 const other=await generateKeyPair('RS256');const forged=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('member').setIssuedAt().setIssuer(options.issuer).setAudience(options.audience).setExpirationTime('2m').sign(other.privateKey);
 await assert.rejects(verifyAccessToken(forged,options));
});
test('actor context is isolated between concurrent asynchronous requests',async()=>{
 const a={id:'a',email:'a@example.invalid'} as User;const b={id:'b',email:'b@example.invalid'} as User;
 const result=await Promise.all([a,b].map(user=>withActor(user,async()=>{await new Promise(resolve=>setTimeout(resolve,5));return (await requireUser()).id;})));
 assert.deepEqual(result,['a','b']);await assert.rejects(requireUser());
});
test('direct API calls reject missing credentials, forged x-user headers and invalid JSON',async()=>{
 const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 try {
  assert.equal((await fetch(`${base}/health/live`)).status,200);
  for(const path of ['/v1/me','/v1/feed','/v1/admin/products','/v1/orders/other']) assert.equal((await fetch(base+path,{headers:{'x-user-id':'admin','x-user-email':'admin@example.invalid'}})).status,401);
  assert.equal((await fetch(`${base}/internal/cron/billing`)).status,401);
  assert.equal((await fetch(`${base}/v1/me`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('backend enforces administrator authorization independently of frontend',async()=>{
 const previous=process.env.ADMIN_USER_ID;process.env.ADMIN_USER_ID='creator';
 try {await withActor({id:'member'} as User,()=>assert.rejects(requireAdmin(),error=>error instanceof HttpError && error.status===403));assert.equal((await withActor({id:'creator'} as User,requireAdmin)).id,'creator');}
 finally{if(previous===undefined)delete process.env.ADMIN_USER_ID;else process.env.ADMIN_USER_ID=previous;}
});
