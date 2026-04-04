// ── Email Job ─────────────────────────────────────────────────────────────────

export type SendOtpJobData = {
  type: 'SEND_OTP';
  to: string;
  name: string;
  otp: string;
  purpose: 'registration' | 'forgot-password' | '2fa' | 'email-change';
};

export type SendWelcomeJobData = {
  type: 'SEND_WELCOME';
  to: string;
  name: string;
  defaultPassword?: string;
};

export type SendRenewalSuccessJobData = {
  type: 'SEND_RENEWAL_SUCCESS';
  to: string;
  name: string;
  endDate: string;
};

export type SendRenewalFailedJobData = {
  type: 'SEND_RENEWAL_FAILED';
  to: string;
  name: string;
};

export type EmailJobData = SendOtpJobData | SendWelcomeJobData | SendRenewalSuccessJobData | SendRenewalFailedJobData;

// ── Subscription Job ──────────────────────────────────────────────────────────

export type SubscriptionJobData =
  | { type: 'EXPIRE_SUBSCRIPTIONS' }
  | { type: 'RENEW_SUBSCRIPTIONS' };

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
