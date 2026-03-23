import { prisma } from '../../config/prisma';

/**
 * Find all ACTIVE subscriptions whose endDate has passed, mark them EXPIRED,
 * downgrade the user to FREE tier, and re-evaluate their level.
 *
 * Runs on a schedule (hourly) so subscriptions expire promptly even if the
 * user never triggers the read-side auto-expire in subscriptionsService.
 */
export async function expireSubscriptions(): Promise<{ expired: number }> {
  const now = new Date();

  const expiredSubs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', endDate: { lt: now } },
    select: { id: true, userId: true },
  });

  if (expiredSubs.length === 0) return { expired: 0 };

  for (const sub of expiredSubs) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED' },
    });

    await prisma.user.update({
      where: { id: sub.userId },
      data: { subscriptionTier: 'FREE' },
    });

    // Re-evaluate level after downgrade (may return to KOPA if eligible)
    await _recomputeAndUpdateLevel(sub.userId);
  }

  console.info(`[subscription.processor] Expired ${expiredSubs.length} subscription(s)`);
  return { expired: expiredSubs.length };
}

/**
 * Compute and persist the correct level for a user:
 *   CORPER  → active PREMIUM subscription
 *   KOPA    → account 30+ days old AND email verified
 *   OTONDO  → default
 */
async function _recomputeAndUpdateLevel(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, isVerified: true, subscriptionTier: true },
  });
  if (!user) return;

  const daysSince = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

  let level: 'OTONDO' | 'KOPA' | 'CORPER';
  if (user.subscriptionTier === 'PREMIUM') level = 'CORPER';
  else if (daysSince >= 30 && user.isVerified) level = 'KOPA';
  else level = 'OTONDO';

  await prisma.user.update({ where: { id: userId }, data: { level } });
}
