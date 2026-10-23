// Verifies DATABASE_URL works and the migrated tables exist. Run: npm run db:check
import { prisma } from '../lib/prisma.js';

try {
  const [info] = await prisma.$queryRaw<{ database: string; version: string }[]>`
    SELECT current_database() AS database, version() AS version`;
  console.log(`Connected to database "${info?.database}"`);
  console.log(info?.version);

  const [users, loans] = await Promise.all([prisma.user.count(), prisma.loan.count()]);
  console.log(`Tables OK: users=${users}, loans=${loans}`);
} catch (error) {
  console.error('Database check failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
