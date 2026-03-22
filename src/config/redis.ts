import Redis from 'ioredis';
import { env } from './env';

const createRedisClient = () => {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('connect', () => console.info('✅ Redis connected'));
  client.on('error', (err) => console.error('❌ Redis error:', err.message));
  client.on('close', () => console.warn('⚠️  Redis connection closed'));

  return client;
};

export const redis = createRedisClient();

// Typed helper wrappers
export const redisHelpers = {
  async set(key: string, value: string): Promise<void> {
    await redis.set(key, value);
  },

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await redis.setex(key, ttlSeconds, value);
  },

  async get(key: string): Promise<string | null> {
    return redis.get(key);
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  },

  async incr(key: string): Promise<number> {
    return redis.incr(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await redis.expire(key, ttlSeconds);
  },

  async ttl(key: string): Promise<number> {
    return redis.ttl(key);
  },
};
