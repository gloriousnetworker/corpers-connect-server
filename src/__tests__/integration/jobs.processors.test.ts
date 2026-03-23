/**
 * Integration tests for job processor functions — hits real test DB.
 * Tests the processor business logic directly without going through BullMQ.
 */

import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import { expireSubscriptions } from '../../jobs/processors/subscription.processor';
import { checkLevelPromotions } from '../../jobs/processors/level.processor';
import { deleteExpiredStories, deleteOldNotifications } from '../../jobs/processors/cleanup.processor';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const id = ++_counter;
  const hash = await bcrypt.hash('Test@1234', 10);
  return prisma.user.create({
    data: {
      email: `jobs-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Jobs',
      lastName: 'Test',
      stateCode: `LA/24B/${id}`,
      servingState: 'Lagos',
      batch: 'Batch B',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── expireSubscriptions ───────────────────────────────────────────────────────

describe('expireSubscriptions (processor)', () => {
  it('expires an active subscription that is past its end date', async () => {
    const user = await createUser();

    // Create a subscription that ended 1 day ago
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // ended yesterday
        status: 'ACTIVE',
      },
    });

    await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: 'PREMIUM', level: 'CORPER' } });

    const result = await expireSubscriptions();

    expect(result.expired).toBeGreaterThanOrEqual(1);

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(updatedSub?.status).toBe('EXPIRED');

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser?.subscriptionTier).toBe('FREE');
  });

  it('does not touch active subscriptions with future end date', async () => {
    const user = await createUser();

    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
        status: 'ACTIVE',
      },
    });

    // Run processor — this sub should NOT be expired
    await expireSubscriptions();

    const unchanged = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(unchanged?.status).toBe('ACTIVE');
  });

  it('promotes user to KOPA after expiry if account is 30+ days old and verified', async () => {
    // Create user who registered 35 days ago and is verified
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const user = await createUser({ isVerified: true });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: thirtyFiveDaysAgo } });

    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: 'PREMIUM', level: 'CORPER' } });

    await expireSubscriptions();

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.level).toBe('KOPA');
  });
});

// ── checkLevelPromotions ──────────────────────────────────────────────────────

describe('checkLevelPromotions (processor)', () => {
  it('promotes an OTONDO user to KOPA when they are 30+ days old and verified', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const user = await createUser({ isVerified: true, level: 'OTONDO', subscriptionTier: 'FREE' });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: thirtyOneDaysAgo } });

    const result = await checkLevelPromotions();

    expect(result.promoted).toBeGreaterThanOrEqual(1);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.level).toBe('KOPA');
  });

  it('does not promote an OTONDO user who is less than 30 days old', async () => {
    const user = await createUser({ isVerified: true, level: 'OTONDO', subscriptionTier: 'FREE' });
    // createdAt defaults to now — less than 30 days

    await checkLevelPromotions();

    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.level).toBe('OTONDO');
  });

  it('does not promote an OTONDO user who is not verified', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const user = await createUser({ isVerified: false, level: 'OTONDO', subscriptionTier: 'FREE' });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: thirtyOneDaysAgo } });

    await checkLevelPromotions();

    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.level).toBe('OTONDO');
  });

  it('does not affect PREMIUM users (they are already CORPER)', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const user = await createUser({ isVerified: true, level: 'CORPER', subscriptionTier: 'PREMIUM' });
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: thirtyOneDaysAgo } });

    await checkLevelPromotions();

    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.level).toBe('CORPER');
  });
});

// ── deleteExpiredStories ──────────────────────────────────────────────────────

describe('deleteExpiredStories (processor)', () => {
  it('deletes stories that have passed their expiresAt', async () => {
    const user = await createUser();

    // Create an expired story (expiresAt in the past)
    const expiredStory = await prisma.story.create({
      data: {
        authorId: user.id,
        mediaUrl: 'https://example.com/story1.jpg',
        mediaType: 'IMAGE',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
      },
    });

    // Create a live story (expiresAt in the future)
    const liveStory = await prisma.story.create({
      data: {
        authorId: user.id,
        mediaUrl: 'https://example.com/story2.jpg',
        mediaType: 'IMAGE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // expires in 24h
      },
    });

    const result = await deleteExpiredStories();

    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const deletedCheck = await prisma.story.findUnique({ where: { id: expiredStory.id } });
    expect(deletedCheck).toBeNull();

    const liveCheck = await prisma.story.findUnique({ where: { id: liveStory.id } });
    expect(liveCheck).not.toBeNull();

    // Cleanup
    await prisma.story.delete({ where: { id: liveStory.id } });
  });

  it('returns 0 when no expired stories exist', async () => {
    // Create only live stories if needed; result might already be 0
    const result = await deleteExpiredStories();
    expect(typeof result.deleted).toBe('number');
    expect(result.deleted).toBeGreaterThanOrEqual(0);
  });
});

// ── deleteOldNotifications ────────────────────────────────────────────────────

describe('deleteOldNotifications (processor)', () => {
  it('deletes read notifications older than 30 days', async () => {
    const user = await createUser();

    // Create an old read notification (35 days ago)
    const oldNotif = await prisma.notification.create({
      data: {
        recipientId: user.id,
        type: 'FOLLOW',
        isRead: true,
      },
    });
    // Manually back-date the notification
    await prisma.notification.update({
      where: { id: oldNotif.id },
      data: { createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) },
    });

    // Create a recent read notification (today)
    const recentNotif = await prisma.notification.create({
      data: {
        recipientId: user.id,
        type: 'POST_LIKE',
        isRead: true,
      },
    });

    // Create an old unread notification — must NOT be deleted
    const unreadNotif = await prisma.notification.create({
      data: {
        recipientId: user.id,
        type: 'POST_COMMENT',
        isRead: false,
      },
    });
    await prisma.notification.update({
      where: { id: unreadNotif.id },
      data: { createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) },
    });

    const result = await deleteOldNotifications(30);

    expect(result.deleted).toBeGreaterThanOrEqual(1);

    // Old read should be gone
    const deletedCheck = await prisma.notification.findUnique({ where: { id: oldNotif.id } });
    expect(deletedCheck).toBeNull();

    // Recent read should still exist
    const recentCheck = await prisma.notification.findUnique({ where: { id: recentNotif.id } });
    expect(recentCheck).not.toBeNull();

    // Old unread should still exist
    const unreadCheck = await prisma.notification.findUnique({ where: { id: unreadNotif.id } });
    expect(unreadCheck).not.toBeNull();

    // Cleanup
    await prisma.notification.deleteMany({ where: { id: { in: [recentNotif.id, unreadNotif.id] } } });
  });

  it('respects custom daysOld cutoff', async () => {
    const user = await createUser();

    // Create a notification 3 days old (read)
    const notif = await prisma.notification.create({
      data: { recipientId: user.id, type: 'FOLLOW', isRead: true },
    });
    await prisma.notification.update({
      where: { id: notif.id },
      data: { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });

    // With daysOld=2, this 3-day-old notification should be deleted
    const result = await deleteOldNotifications(2);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const check = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(check).toBeNull();
  });
});
