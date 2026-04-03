import { redis } from '../../config/redis';

/**
 * Redis-backed rate limiter for Socket.IO event handlers.
 *
 * Uses the INCR + EXPIRE pattern:
 *   - First call in the window: INCR creates the key at 1, EXPIRE sets the TTL.
 *   - Subsequent calls: INCR increments. When count exceeds max, the call is rejected.
 *   - After the window expires Redis deletes the key automatically — no cleanup needed.
 *
 * This is safe under concurrent sockets because INCR is atomic in Redis.
 *
 * @param userId     - The authenticated user's ID (rate limit is per-user per-event).
 * @param event      - Socket event name, used as part of the Redis key.
 * @param max        - Maximum number of allowed calls within the window.
 * @param windowSecs - Length of the sliding window in seconds.
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfter: number }`.
 */
export async function socketRateLimit(
  userId: string,
  event: string,
  max: number,
  windowSecs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `socket_rl:${userId}:${event}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      // First call — set the expiry. If this fails the key will persist until
      // the next server restart, which is an acceptable edge case.
      await redis.expire(key, windowSecs);
    }

    if (count > max) {
      // TTL of the existing key is the remaining window time.
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSecs };
    }

    return { allowed: true };
  } catch {
    // If Redis is temporarily unavailable, fail open rather than dropping
    // all socket traffic. Log so the ops team can investigate.
    console.warn(`[socketRateLimit] Redis error for key ${key} — failing open`);
    return { allowed: true };
  }
}
