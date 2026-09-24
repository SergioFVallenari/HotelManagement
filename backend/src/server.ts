import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';

console.log('[GH] server module loading');

process.on('uncaughtException', (err) => {
  console.error('[GH] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[GH] unhandledRejection', reason);
});

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`API de gestión de alojamiento escuchando en http://localhost:${env.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} recibido, cerrando servidor...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));