import { subscriptionQueue, levelQueue, cleanupQueue } from './queues';

/**
 * Register repeating (cron) jobs in their respective queues.
 *
 * BullMQ deduplicates repeat jobs by `jobId`, so calling this on every
 * startup is safe — it will not create duplicate schedules.
 *
 * Schedules:
 *   expire-subscriptions      → every hour          (0 * * * *)
 *   renew-subscriptions       → daily at 03:00       (0 3 * * *)
 *   check-level-promotions    → every 6 hours        (0 *\/6 * * *)
 *   delete-expired-stories    → daily at 02:00       (0 2 * * *)
 *   delete-old-notifications  → daily at 02:15       (15 2 * * *)
 */
export async function initSchedulers(): Promise<void> {
  // ── Subscription expiry (hourly) ────────────────────────────────────────────
  await subscriptionQueue.add(
    'expire-subscriptions',
    { type: 'EXPIRE_SUBSCRIPTIONS' },
    {
      repeat: { pattern: '0 * * * *' },
      jobId: 'expire-subscriptions-cron',
    },
  );

  // ── Subscription auto-renewal (daily at 03:00) ────────────────────────────
  await subscriptionQueue.add(
    'renew-subscriptions',
    { type: 'RENEW_SUBSCRIPTIONS' },
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'renew-subscriptions-cron',
    },
  );

  // ── Level promotion check (every 6 hours) ──────────────────────────────────
  await levelQueue.add(
    'check-level-promotions',
    { type: 'CHECK_LEVEL_PROMOTIONS' },
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'check-level-promotions-cron',
    },
  );

  // ── Story cleanup (daily at 02:00) ─────────────────────────────────────────
  await cleanupQueue.add(
    'DELETE_EXPIRED_STORIES',
    { type: 'DELETE_EXPIRED_STORIES' },
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: 'delete-expired-stories-cron',
    },
  );

  // ── Notification cleanup (daily at 02:15) ──────────────────────────────────
  await cleanupQueue.add(
    'DELETE_OLD_NOTIFICATIONS',
    { type: 'DELETE_OLD_NOTIFICATIONS', daysOld: 30 },
    {
      repeat: { pattern: '15 2 * * *' },
      jobId: 'delete-old-notifications-cron',
    },
  );

  console.info('✅ BullMQ schedulers initialized');
}
