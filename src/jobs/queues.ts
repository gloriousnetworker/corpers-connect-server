import { Queue } from 'bullmq';
import { bullmqConnection } from '../config/bullmq';
import type { EmailJobData, SubscriptionJobData, LevelJobData, CleanupJobData } from './types';
import { QUEUE_NAMES } from './types';
import { processEmailJob } from './processors/email.processor';

// ── Queue singletons ──────────────────────────────────────────────────────────

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const subscriptionQueue = new Queue<SubscriptionJobData>(QUEUE_NAMES.SUBSCRIPTION, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 24 },
    removeOnFail: { count: 10 },
  },
});

export const levelQueue = new Queue<LevelJobData>(QUEUE_NAMES.LEVEL, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

export const cleanupQueue = new Queue<CleanupJobData>(QUEUE_NAMES.CLEANUP, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

// ── Typed add-job helpers ─────────────────────────────────────────────────────

export async function addEmailJob(data: EmailJobData) {
  try {
    return await emailQueue.add(data.type, data);
  } catch (err) {
    // BullMQ unavailable (Redis TLS misconfiguration, network issue, etc.)
    // Fall back to sending directly so OTPs/notifications are never silently lost.
    console.warn('[EMAIL] BullMQ queue unavailable, sending directly:', (err as Error).message);
    await processEmailJob(data);
  }
}

/** Manually trigger subscription expiry (useful for admin/testing). */
export async function addExpireSubscriptionsJob() {
  return subscriptionQueue.add('expire-subscriptions', { type: 'EXPIRE_SUBSCRIPTIONS' });
}

/** Manually trigger level promotion check. */
export async function addLevelCheckJob() {
  return levelQueue.add('check-level-promotions', { type: 'CHECK_LEVEL_PROMOTIONS' });
}

/** Manually trigger a cleanup job. */
export async function addCleanupJob(type: 'DELETE_EXPIRED_STORIES' | 'DELETE_OLD_NOTIFICATIONS', daysOld?: number) {
  return cleanupQueue.add(type, { type, ...(daysOld !== undefined ? { daysOld } : {}) } as CleanupJobData);
}
