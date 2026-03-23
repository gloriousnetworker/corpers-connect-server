// Force IPv4 DNS resolution — Railway containers prefer IPv6 by default,
// which causes ENETUNREACH when connecting to smtp.gmail.com:587
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { env } from './config/env';
import { redis } from './config/redis';
import { prisma } from './config/prisma';
import app from './app';

// Initialise Firebase (side-effect import — just runs the config)
import './config/firebase';

const PORT = env.PORT;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.info('✅ PostgreSQL connected');

    // Connect Redis
    await redis.connect();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.info(`
╔════════════════════════════════════════════╗
║     CORPERS CONNECT API — SERVER RUNNING   ║
╠════════════════════════════════════════════╣
║  Environment : ${env.NODE_ENV.padEnd(28)}║
║  Port        : ${String(PORT).padEnd(28)}║
║  Health      : http://localhost:${String(PORT).padEnd(11)}/health ║
║  API Base    : http://localhost:${String(PORT).padEnd(11)}/api/v1 ║
╚════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        await redis.quit();
        console.info('✅ Server shut down cleanly');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
