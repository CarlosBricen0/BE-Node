import 'dotenv/config';
import { createApp } from './app.js';
import prisma from './db/prisma.js';
const port=Number(process.env.PORT || 4000);
const server=createApp().listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`OnlyHorse API listening on port ${port}`));
server.requestTimeout=30000;server.headersTimeout=15000;
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{server.close(async()=>{await prisma.$disconnect();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
