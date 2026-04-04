import { Worker } from 'bullmq';
import { bullmqConnection } from '../config/bullmq';
import { QUEUE_NAMES } from './types';
import { processEmailJob } from './processors/email.processor';
import { expireSubscriptions, renewSubscriptions } from './processors/subscription.processor';
import { checkLevelPromotions } from './processors/level.processor';
import { deleteExpiredStories, deleteOldNotifications } from './processors/cleanup.processor';

// ── Worker instances ──────────────────────────────────────────────────────────

let emailWorker: Worker;
let subscriptionWorker: Worker;
let levelWorker: Worker;
let cleanupWorker: Worker;

export function initWorkers(): void {
  // ── Email worker ────────────────────────────────────────────────────────────
  emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      return processEmailJob(job.data);
    },
    { connection: bullmqConnection, concurrency: 5 },
  );

  // ── Subscription maintenance worker ────────────────────────────────────────
  subscriptionWorker = new Worker(
    QUEUE_NAMES.SUBSCRIPTION,
    async (job) => {
      if (job.data?.type === 'RENEW_SUBSCRIPTIONS') return renewSubscriptions();
      return expireSubscriptions();
    },
    { connection: bullmqConnection, concurrency: 1 },
  );

  // ── Level check worker ──────────────────────────────────────────────────────
  levelWorker = new Worker(
    QUEUE_NAMES.LEVEL,
    async () => {
      return checkLevelPromotions();
    },
    { connection: bullmqConnection, concurrency: 1 },
  );

  // ── Cleanup worker ──────────────────────────────────────────────────────────
  cleanupWorker = new Worker(
    QUEUE_NAMES.CLEANUP,
    async (job) => {
      if (job.name === 'DELETE_EXPIRED_STORIES') return deleteExpiredStories();
      if (job.name === 'DELETE_OLD_NOTIFICATIONS') return deleteOldNotifications(job.data?.daysOld);
    },
    { connection: bullmqConnection, concurrency: 1 },
  );

  // ── Error / completion logging ──────────────────────────────────────────────
  const workers = [emailWorker, subscriptionWorker, levelWorker, cleanupWorker];

  for (const worker of workers) {
    worker.on('completed', (job) => {
      console.info(`[BullMQ] ✅ Job completed: ${job.name} (id=${job.id})`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[BullMQ] ❌ Job failed: ${job?.name} (id=${job?.id}): ${err.message}`);
    });
    worker.on('error', (err) => {
      console.error(`[BullMQ] Worker error:`, err.message);
    });
  }

  console.info('✅ BullMQ workers initialized');
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(
    [emailWorker, subscriptionWorker, levelWorker, cleanupWorker]
      .filter(Boolean)
      .map((w) => w.close()),
  );
}
