/**
 * Phase 11 — Background Jobs (BullMQ)
 *
 * Exports:
 *   - Queue add-job helpers  (addEmailJob, addExpireSubscriptionsJob, …)
 *   - initWorkers()          — start all BullMQ workers
 *   - initSchedulers()       — register cron repeat jobs
 *   - closeWorkers()         — graceful shutdown
 *   - Processor functions    — pure async functions; used by workers + tests
 */

// Queue helpers
export {
  emailQueue,
  subscriptionQueue,
  levelQueue,
  cleanupQueue,
  addEmailJob,
  addExpireSubscriptionsJob,
  addLevelCheckJob,
  addCleanupJob,
} from './queues';

// Worker lifecycle
export { initWorkers, closeWorkers } from './workers';

// Scheduler lifecycle
export { initSchedulers } from './schedulers';

// Processor functions (importable for direct invocation in tests / admin routes)
export { processEmailJob } from './processors/email.processor';
export { expireSubscriptions } from './processors/subscription.processor';
export { checkLevelPromotions } from './processors/level.processor';
export { deleteExpiredStories, deleteOldNotifications } from './processors/cleanup.processor';
