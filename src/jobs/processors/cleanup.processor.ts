import { prisma } from '../../config/prisma';
import { destroyCloudinaryAsset } from '../../shared/middleware/upload.middleware';

/**
 * Hard-delete stories whose expiresAt timestamp has passed.
 *
 * Stories are currently filtered on the read-side (getStories excludes expired),
 * but old records accumulate in the DB. This job removes them daily.
 * Cloudinary assets are cleaned up before deletion.
 */
export async function deleteExpiredStories(): Promise<{ deleted: number }> {
  const expired = await prisma.story.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, mediaUrl: true },
  });

  if (expired.length === 0) return { deleted: 0 };

  await prisma.story.deleteMany({
    where: { id: { in: expired.map((s) => s.id) } },
  });

  // Clean up Cloudinary assets (fire-and-forget, failures are non-fatal)
  for (const story of expired) {
    void destroyCloudinaryAsset(story.mediaUrl);
  }

  console.info(`[cleanup.processor] Deleted ${expired.length} expired story/stories`);
  return { deleted: expired.length };
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
