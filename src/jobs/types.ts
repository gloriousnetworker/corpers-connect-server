// ── Email Job ─────────────────────────────────────────────────────────────────

export type SendOtpJobData = {
  type: 'SEND_OTP';
  to: string;
  name: string;
  otp: string;
  purpose: 'registration' | 'forgot-password' | '2fa';
};

export type SendWelcomeJobData = {
  type: 'SEND_WELCOME';
  to: string;
  name: string;
  defaultPassword?: string;
};

export type EmailJobData = SendOtpJobData | SendWelcomeJobData;

// ── Subscription Job ──────────────────────────────────────────────────────────

export type SubscriptionJobData = {
  type: 'EXPIRE_SUBSCRIPTIONS';
};

// ── Level Job ─────────────────────────────────────────────────────────────────

export type LevelJobData = {
  type: 'CHECK_LEVEL_PROMOTIONS';
};

// ── Cleanup Job ───────────────────────────────────────────────────────────────

export type DeleteExpiredStoriesJobData = {
  type: 'DELETE_EXPIRED_STORIES';
};

export type DeleteOldNotificationsJobData = {
  type: 'DELETE_OLD_NOTIFICATIONS';
  daysOld?: number;
};

export type CleanupJobData = DeleteExpiredStoriesJobData | DeleteOldNotificationsJobData;

// ── Queue Names ───────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  EMAIL: 'email',
  SUBSCRIPTION: 'subscription-maintenance',
  LEVEL: 'level-check',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
