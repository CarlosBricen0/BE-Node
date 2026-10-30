import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import prisma from '../src/db/prisma.js';
import {HttpError} from '../src/lib/auth.js';
test('API permissions and private data against isolated PostgreSQL',{skip:process.env.RUN_DATABASE_TESTS!=='1'},async()=>{
 const prefix=`api-${randomUUID()}`;
 const member=await prisma.user.create({data:{id:`${prefix}-member`,email:`${prefix}@example.invalid`,name:'Member'}});
 const creator=await prisma.user.create({data:{id:`${prefix}-creator`,email:`${prefix}-creator@example.invalid`,name:'Creator'}});
 const previous=process.env.ADMIN_USER_ID;process.env.ADMIN_USER_ID=creator.id;
 const post=await prisma.post.create({data:{userId:creator.id,text:'private-test-text',mediaUrl:'https://res.cloudinary.com/fixture/private.jpg',isPublic:false}});
 const product=await prisma.product.create({data:{name:prefix,image:'/tshirts/1.png',price:10000,currency:'CLP'}});
 const order=await prisma.order.create({data:{userId:creator.id,productId:product.id,price:10000,currency:'CLP',size:'M'}});
 const server=createApp(async header=>{if(header==='Bearer fixture-member')return member;if(header==='Bearer fixture-creator')return creator;throw new HttpError(401,'Unauthorized');}).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const call=(path:string,method='GET',body?:unknown,token='fixture-member')=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try {
  const feed=await (await call('/v1/feed')).json();const locked=feed.find((p:{id:string})=>p.id===post.id);assert.equal(locked.mediaUrl,null);assert.notEqual(locked.text,'private-test-text');assert.deepEqual(locked.comments,[]);
  assert.equal((await call('/v1/admin/products')).status,403);
  assert.equal((await call(`/v1/posts/${post.id}`,'DELETE')).status,403);
  assert.equal((await call(`/v1/posts/${post.id}/comments`,'POST',{text:'test',userId:creator.id})).status,403);
  assert.equal(await (await call(`/v1/orders/${order.id}`)).json(),false);
  assert.equal((await call('/v1/me','PATCH',{name:'Updated',image:''})).status,200);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).name,'Updated');
  await prisma.subscription.create({data:{userId:member.id,status:'authorized',provider:'mercadopago',planId:'monthly',price:10000,currency:'CLP',endDate:new Date(Date.now()+86400000)}});
  assert.equal((await call(`/v1/posts/${post.id}/comments`,'POST',{text:'  paid comment  ',userId:creator.id})).status,200);
  const comment=await prisma.comment.findFirstOrThrow({where:{postId:post.id}});assert.equal(comment.userId,member.id);assert.equal(comment.text,'paid comment');
  const unlocked=(await (await call('/v1/feed')).json()).find((p:{id:string})=>p.id===post.id);assert.equal(unlocked.text,'private-test-text');
  assert.equal((await call('/v1/admin/products','GET',undefined,'fixture-creator')).status,200);
 }finally{
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await prisma.post.delete({where:{id:post.id}});await prisma.order.delete({where:{id:order.id}});await prisma.product.delete({where:{id:product.id}});await prisma.subscription.deleteMany({where:{userId:member.id}});await prisma.user.deleteMany({where:{id:{in:[member.id,creator.id]}}});
  if(previous===undefined)delete process.env.ADMIN_USER_ID;else process.env.ADMIN_USER_ID=previous;
  await prisma.$disconnect();
 }
});
