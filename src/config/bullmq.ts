import type { ConnectionOptions } from 'bullmq';

/**
 * Parse REDIS_URL into a BullMQ-compatible ConnectionOptions object.
 * BullMQ requires a plain host/port/password object — it cannot accept
 * a full redis:// URL string the way ioredis can.
 */
function parseBullMQConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      family: 4, // Force IPv4 (Railway uses IPv4)
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    };
  } catch {
    return { host: 'localhost', port: 6379, family: 4, maxRetriesPerRequest: null };
  }
}

export const bullmqConnection: ConnectionOptions = parseBullMQConnection();
