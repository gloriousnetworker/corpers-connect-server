import { prisma } from '../../config/prisma';

/**
 * Scan all OTONDO users who now qualify for KOPA (account ≥30 days + verified,
 * no active PREMIUM subscription) and promote them.
 *
 * Runs on a schedule (every 6 hours) so promotions happen automatically without
 * requiring the user to hit the /subscriptions/level/check endpoint.
 */
export async function checkLevelPromotions(): Promise<{ promoted: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const eligibleUsers = await prisma.user.findMany({
    where: {
      level: 'OTONDO',
      isVerified: true,
      createdAt: { lte: thirtyDaysAgo },
      subscriptionTier: 'FREE', // PREMIUM users are already CORPER
    },
    select: { id: true },
  });

  if (eligibleUsers.length === 0) return { promoted: 0 };

  const ids = eligibleUsers.map((u) => u.id);
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { level: 'KOPA' },
  });

  console.info(`[level.processor] Promoted ${eligibleUsers.length} user(s) to KOPA`);
  return { promoted: eligibleUsers.length };
}
