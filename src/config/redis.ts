import Redis from 'ioredis';
import { env } from './env';

const createRedisClient = () => {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 0,      // Fail fast — no per-request retries
    enableReadyCheck: false,
    lazyConnect: true,
    enableOfflineQueue: false,    // Don't queue commands while disconnected
  });

  client.on('connect', () => console.info('✅ Redis connected'));
  client.on('error', (err) => console.error('❌ Redis error:', err.message));
  client.on('close', () => console.warn('⚠️  Redis connection closed'));

  return client;
};

export const redis = createRedisClient();

// Typed helper wrappers — all operations fail-safe when Redis is unavailable
export const redisHelpers = {
  async set(key: string, value: string): Promise<void> {
    try { await redis.set(key, value); } catch { /* Redis unavailable */ }
  },

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    try { await redis.setex(key, ttlSeconds, value); } catch { /* Redis unavailable */ }
  },

  async get(key: string): Promise<string | null> {
    try { return await redis.get(key); } catch { return null; }
  },

  async del(key: string): Promise<void> {
    try { await redis.del(key); } catch { /* Redis unavailable */ }
  },

  async exists(key: string): Promise<boolean> {
    try { return (await redis.exists(key)) === 1; } catch { return false; }
  },

  async incr(key: string): Promise<number> {
    try { return await redis.incr(key); } catch { return 0; }
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try { await redis.expire(key, ttlSeconds); } catch { /* Redis unavailable */ }
  },

  async ttl(key: string): Promise<number> {
    try { return await redis.ttl(key); } catch { return -1; }
  },
};
