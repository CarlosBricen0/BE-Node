import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
const db = new PrismaClient();
async function seed() {
 if (process.env.NODE_ENV === "production") throw new Error("El seed de demostración no se ejecuta en producción");
  // The real Kinde identity creates the creator profile at first login.
  // Products use tutorial assets until replaced by uploads in the dashboard.
  for (const [id, name, image, price] of [
    ['seed-shirt-1', 'OnlyHorse Classic', '/tshirts/1.png', 19990],
    ['seed-shirt-2', 'OnlyHorse Signature', '/tshirts/2.png', 24990],
  ] as const) {
    await db.product.upsert({ where: { id }, update: {}, create: { id, name, image, price, currency: "CLP" } });
  }
  console.log('Seed complete. Sign in with ADMIN_EMAIL to create the creator profile, then publish posts.');
}
seed().finally(() => db.$disconnect());
