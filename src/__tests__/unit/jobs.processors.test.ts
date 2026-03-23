/**
 * Unit tests for job processors — Prisma and emailService are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    subscription: { findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    story: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
  },
}));

jest.mock('../../shared/services/email.service', () => ({
  emailService: {
    sendOTP: jest.fn(),
    sendWelcome: jest.fn(),
  },
}));

import { prisma } from '../../config/prisma';
import { emailService } from '../../shared/services/email.service';

import { processEmailJob } from '../../jobs/processors/email.processor';
import { expireSubscriptions } from '../../jobs/processors/subscription.processor';
import { checkLevelPromotions } from '../../jobs/processors/level.processor';
import { deleteExpiredStories, deleteOldNotifications } from '../../jobs/processors/cleanup.processor';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── processEmailJob ───────────────────────────────────────────────────────────

describe('processEmailJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls sendOTP for SEND_OTP jobs', async () => {
    (emailService.sendOTP as jest.Mock).mockResolvedValue(undefined);

    await processEmailJob({
      type: 'SEND_OTP',
      to: 'user@example.com',
      name: 'Test',
      otp: '123456',
      purpose: 'registration',
    });

    expect(emailService.sendOTP).toHaveBeenCalledWith(
      'user@example.com',
      'Test',
      '123456',
      'registration',
    );
  });

  it('calls sendOTP with forgot-password purpose', async () => {
    (emailService.sendOTP as jest.Mock).mockResolvedValue(undefined);

    await processEmailJob({
      type: 'SEND_OTP',
      to: 'user@example.com',
      name: 'Test',
      otp: '654321',
      purpose: 'forgot-password',
    });

    expect(emailService.sendOTP).toHaveBeenCalledWith('user@example.com', 'Test', '654321', 'forgot-password');
  });

  it('calls sendWelcome for SEND_WELCOME jobs', async () => {
    (emailService.sendWelcome as jest.Mock).mockResolvedValue(undefined);

    await processEmailJob({
      type: 'SEND_WELCOME',
      to: 'new@example.com',
      name: 'New User',
      defaultPassword: 'TempPass@1',
    });

    expect(emailService.sendWelcome).toHaveBeenCalledWith('new@example.com', 'New User', 'TempPass@1');
  });

  it('calls sendWelcome with empty string when no defaultPassword provided', async () => {
    (emailService.sendWelcome as jest.Mock).mockResolvedValue(undefined);

    await processEmailJob({ type: 'SEND_WELCOME', to: 'new@example.com', name: 'New User' });

    expect(emailService.sendWelcome).toHaveBeenCalledWith('new@example.com', 'New User', '');
  });
});

// ── expireSubscriptions ───────────────────────────────────────────────────────

describe('expireSubscriptions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero when no subscriptions are expired', async () => {
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue([]);

    const result = await expireSubscriptions();

    expect(result).toEqual({ expired: 0 });
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it('expires subscriptions and downgrades users', async () => {
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue([
      { id: 'sub-1', userId: 'user-1' },
      { id: 'sub-2', userId: 'user-2' },
    ]);
    (mockPrisma.subscription.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      createdAt: new Date(),
      isVerified: false,
      subscriptionTier: 'FREE',
    });

    const result = await expireSubscriptions();

    expect(result).toEqual({ expired: 2 });
    expect(mockPrisma.subscription.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { subscriptionTier: 'FREE' } }),
    );
  });

  it('promotes user to KOPA after subscription expires if eligible', async () => {
    (mockPrisma.subscription.findMany as jest.Mock).mockResolvedValue([
      { id: 'sub-1', userId: 'user-1' },
    ]);
    (mockPrisma.subscription.update as jest.Mock).mockResolvedValue({});
    // User is 40 days old + verified → should become KOPA after downgrade
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      isVerified: true,
      subscriptionTier: 'FREE',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await expireSubscriptions();

    // First update: downgrade to FREE; second update: promote to KOPA (via _recomputeAndUpdateLevel)
    const calls = (mockPrisma.user.update as jest.Mock).mock.calls;
    expect(calls.some((c) => c[0].data.subscriptionTier === 'FREE')).toBe(true);
    expect(calls.some((c) => c[0].data.level === 'KOPA')).toBe(true);
  });
});

// ── checkLevelPromotions ──────────────────────────────────────────────────────

describe('checkLevelPromotions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero when no users need promotion', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const result = await checkLevelPromotions();

    expect(result).toEqual({ promoted: 0 });
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('promotes eligible OTONDO users to KOPA', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-1' },
      { id: 'user-2' },
    ]);
    (mockPrisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await checkLevelPromotions();

    expect(result).toEqual({ promoted: 2 });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-2'] } },
      data: { level: 'KOPA' },
    });
  });

  it('queries only OTONDO + verified + 30-day-old + FREE users', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await checkLevelPromotions();

    const callArg = (mockPrisma.user.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.level).toBe('OTONDO');
    expect(callArg.where.isVerified).toBe(true);
    expect(callArg.where.subscriptionTier).toBe('FREE');
    expect(callArg.where.createdAt).toBeDefined();
  });
});

// ── deleteExpiredStories ──────────────────────────────────────────────────────

describe('deleteExpiredStories', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero when no expired stories exist', async () => {
    (mockPrisma.story.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await deleteExpiredStories();

    expect(result).toEqual({ deleted: 0 });
  });

  it('deletes expired stories and returns count', async () => {
    (mockPrisma.story.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

    const result = await deleteExpiredStories();

    expect(result).toEqual({ deleted: 5 });
    expect(mockPrisma.story.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});

// ── deleteOldNotifications ────────────────────────────────────────────────────

describe('deleteOldNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero when no old notifications exist', async () => {
    (mockPrisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await deleteOldNotifications();

    expect(result).toEqual({ deleted: 0 });
  });

  it('deletes read notifications older than 30 days by default', async () => {
    (mockPrisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 12 });

    const result = await deleteOldNotifications();

    expect(result).toEqual({ deleted: 12 });
    const callArg = (mockPrisma.notification.deleteMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.isRead).toBe(true);
    expect(callArg.where.createdAt.lt).toBeDefined();
  });

  it('respects custom daysOld parameter', async () => {
    (mockPrisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

    await deleteOldNotifications(7);

    const callArg = (mockPrisma.notification.deleteMany as jest.Mock).mock.calls[0][0];
    const cutoff = callArg.where.createdAt.lt as Date;
    // Cutoff should be roughly 7 days ago (±5 seconds tolerance)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - sevenDaysAgo)).toBeLessThan(5000);
  });

  it('never deletes unread notifications', async () => {
    (mockPrisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    await deleteOldNotifications(1);

    const callArg = (mockPrisma.notification.deleteMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.isRead).toBe(true);
  });
});
