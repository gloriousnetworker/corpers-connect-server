import { prisma } from '../../config/prisma';

/**
 * Hard-delete stories whose expiresAt timestamp has passed.
 *
 * Stories are currently filtered on the read-side (getStories excludes expired),
 * but old records accumulate in the DB. This job removes them daily.
 */
export async function deleteExpiredStories(): Promise<{ deleted: number }> {
  const result = await prisma.story.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (result.count > 0) {
    console.info(`[cleanup.processor] Deleted ${result.count} expired story/stories`);
  }
  return { deleted: result.count };
}

/**
 * Hard-delete read notifications older than `daysOld` days (default 30).
 *
 * Keeps the notifications table lean — unread notifications are never touched.
 */
export async function deleteOldNotifications(daysOld = 30): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    console.info(`[cleanup.processor] Deleted ${result.count} old notification(s) (>${daysOld}d)`);
  }
  return { deleted: result.count };
}
