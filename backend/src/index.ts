import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

// No host argument: Node binds all IPv4 and IPv6 interfaces (so a phone on the same Wi-Fi can
// reach the API), and a port already used by another app fails with EADDRINUSE instead of
// silently sharing it on one address family.
const server = app.listen(env.PORT, () => {
  console.log(`MiniLedger API listening on http://localhost:${env.PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use. Set a different PORT in backend/.env.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
