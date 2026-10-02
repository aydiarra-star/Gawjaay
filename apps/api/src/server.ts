import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

async function main() {
  const app = createApp();
  // Écoute sur 0.0.0.0 pour être joignable derrière un proxy/hébergeur (Render,
  // Docker, reverse-proxy). Le port est fourni par la plateforme via $PORT.
  const host = env.HOST;
  const server = app.listen(env.PORT, host, () => {
    // eslint-disable-next-line no-console
    console.log(`GawJaay API démarrée sur http://${host}:${env.PORT} (env=${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} reçu, arrêt en cours…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Échec du démarrage:', err);
  process.exit(1);
});
