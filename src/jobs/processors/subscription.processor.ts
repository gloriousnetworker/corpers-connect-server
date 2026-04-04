import { prisma } from '../../config/prisma';
import { paystackRequest } from '../../config/paystack';
import { PLANS } from '../../modules/subscriptions/subscriptions.validation';
import { emailQueue } from '../queues';

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

interface ChargeAuthData {
  status: string;
  reference: string;
  amount: number;
  authorization?: { authorization_code: string };
}

/**
 * Auto-renew subscriptions that expire within the next 24 hours and have a
 * stored Paystack authorization code.  A new subscription record is created on
 * success; on failure the expiry cycle continues normally.
 */
export async function renewSubscriptions(): Promise<{ renewed: number; failed: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const expiringSoon = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { lte: in24h },
      paystackAuthCode: { not: null },
    },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });

  let renewed = 0;
  let failed = 0;

  for (const sub of expiringSoon) {
    const planConfig = PLANS[sub.plan as keyof typeof PLANS];
    if (!planConfig || !sub.paystackAuthCode) continue;

    const newReference = `cc-renew-${sub.userId.slice(-8)}-${Date.now()}`;

    try {
      const response = await paystackRequest<ChargeAuthData>(
        'POST',
        '/transaction/charge_authorization',
        {
          email: sub.user.email,
          amount: planConfig.amountKobo,
          authorization_code: sub.paystackAuthCode,
          reference: newReference,
        },
      );

      if (!response.status || response.data.status !== 'success') {
        failed++;
        void emailQueue.add('SEND_RENEWAL_FAILED', {
          type: 'SEND_RENEWAL_FAILED' as const,
          to: sub.user.email,
          name: sub.user.firstName,
        });
        continue;
      }

      // Atomic: cancel old sub + create new one + keep user at PREMIUM
      const startDate = new Date(sub.endDate); // start where old one left off
      const endDate = new Date(startDate.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: 'CANCELLED' },
        });
        await tx.subscription.create({
          data: {
            userId: sub.userId,
            tier: 'PREMIUM',
            plan: sub.plan,
            amountKobo: planConfig.amountKobo,
            startDate,
            endDate,
            paystackRef: newReference,
            paystackAuthCode: sub.paystackAuthCode,
            status: 'ACTIVE',
          },
        });
        // User stays at PREMIUM / CORPER — no tier change needed
      });

      renewed++;
      void emailQueue.add('SEND_RENEWAL_SUCCESS', {
        type: 'SEND_RENEWAL_SUCCESS' as const,
        to: sub.user.email,
        name: sub.user.firstName,
        endDate: endDate.toISOString(),
      });
    } catch (err) {
      failed++;
      console.error(`[subscription.processor] Renewal failed for user ${sub.userId}:`, err);
    }
  }

  if (renewed || failed) {
    console.info(`[subscription.processor] Renewals: ${renewed} succeeded, ${failed} failed`);
  }
  return { renewed, failed };
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
