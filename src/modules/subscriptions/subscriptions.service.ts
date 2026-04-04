import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { paystackRequest } from '../../config/paystack';
import { env } from '../../config/env';
import { AppError } from '../../shared/utils/errors';
import { PLANS, InitializeSubscriptionDto, VerifyPaymentDto } from './subscriptions.validation';

// ── Paystack response shapes ───────────────────────────────────────────────────

interface PaystackInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface PaystackVerifyData {
  status: string; // 'success' | 'failed' | 'abandoned'
  reference: string;
  amount: number;
  metadata: { userId?: string; plan?: string };
  authorization?: { authorization_code: string; email: string };
}

// ── Level progression helper ───────────────────────────────────────────────────

/**
 * Compute which UserLevel a user should hold:
 *   CORPER  → has an ACTIVE subscription (premium)
 *   KOPA    → account is 30+ days old AND verified
 *   OTONDO  → default
 */
type PrismaClient = typeof prisma;

// Accepts either the global prisma client or a transaction client so it can
// be called safely inside prisma.$transaction() without breaking atomicity.
async function computeLevel(userId: string, db: PrismaClient = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, isVerified: true, subscriptionTier: true },
  });
  if (!user) return 'OTONDO' as const;

  const daysSince = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (user.subscriptionTier === 'PREMIUM') return 'CORPER' as const;
  if (daysSince >= 30 && user.isVerified) return 'KOPA' as const;
  return 'OTONDO' as const;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const subscriptionsService = {
  // ── Plans ───────────────────────────────────────────────────────────────────

  getPlans() {
    return Object.entries(PLANS).map(([key, plan]) => ({
      key,
      label: plan.label,
      amountKobo: plan.amountKobo,
      amountNaira: plan.amountKobo / 100,
      durationDays: plan.durationDays,
    }));
  },

  // ── Initialize Payment ──────────────────────────────────────────────────────

  async initializePayment(userId: string, dto: InitializeSubscriptionDto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscriptionTier: true },
    });
    if (!user) throw new AppError('User not found', 404);

    // Block double-subscribe (allow re-subscribe if expired/cancelled)
    const active = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (active) throw new AppError('You already have an active subscription', 409);

    const plan = PLANS[dto.plan];
    const reference = `cc-${userId.slice(-8)}-${Date.now()}`;

    const response = await paystackRequest<PaystackInitData>('POST', '/transaction/initialize', {
      email: user.email,
      amount: plan.amountKobo,
      reference,
      callback_url: dto.callbackUrl ?? env.CLIENT_URL,
      metadata: { userId, plan: dto.plan },
    });

    if (!response.status) throw new AppError('Payment initialization failed', 502);

    return {
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference: response.data.reference,
      plan: dto.plan,
      amountKobo: plan.amountKobo,
      amountNaira: plan.amountKobo / 100,
    };
  },

  // ── Verify Payment ──────────────────────────────────────────────────────────

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const response = await paystackRequest<PaystackVerifyData>(
      'GET',
      `/transaction/verify/${dto.reference}`,
    );

    if (!response.status || response.data.status !== 'success') {
      throw new AppError('Payment verification failed or payment was not successful', 400);
    }

    const meta = response.data.metadata;
    if (!meta.userId || !meta.plan) {
      throw new AppError('Invalid payment metadata', 400);
    }
    if (meta.userId !== userId) throw new AppError('Payment does not belong to this user', 403);

    return this._activateSubscription(
      userId,
      meta.plan as keyof typeof PLANS,
      dto.reference,
      response.data.amount,
      response.data.authorization?.authorization_code,
    );
  },

  // ── Webhook Handler ─────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    const expected = crypto
      .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) throw new AppError('Invalid webhook signature', 401);

    const payload = JSON.parse(rawBody.toString()) as {
      event: string;
      data: PaystackVerifyData;
    };

    if (payload.event !== 'charge.success') return { received: true };

    const { reference, amount, metadata } = payload.data;
    if (!metadata.userId || !metadata.plan) return { received: true };

    // Idempotency: skip if already processed
    const existing = await prisma.subscription.findFirst({
      where: { paystackRef: reference },
    });
    if (existing) return { received: true };

    await this._activateSubscription(
      metadata.userId,
      metadata.plan as keyof typeof PLANS,
      reference,
      amount,
      payload.data.authorization?.authorization_code,
    );

    return { received: true };
  },

  // ── Internal activation (shared by verify + webhook) ───────────────────────

  async _activateSubscription(
    userId: string,
    plan: keyof typeof PLANS,
    reference: string,
    amountKobo: number,
    paystackAuthCode?: string,
  ) {
    const planConfig = PLANS[plan];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);

    // All three writes are atomic: if the user.update fails the subscription
    // record is rolled back, leaving no orphaned ACTIVE subscription.
    return prisma.$transaction(async (tx) => {
      // Cancel any existing active subs for this user (edge case)
      await tx.subscription.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId,
          tier: 'PREMIUM',
          plan,
          amountKobo,
          startDate,
          endDate,
          paystackRef: reference,
          status: 'ACTIVE',
          ...(paystackAuthCode && { paystackAuthCode }),
        },
      });

      // Upgrade user tier and level
      await tx.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'PREMIUM', level: 'CORPER' },
      });

      return subscription;
    });
  },

  // ── Current Subscription ────────────────────────────────────────────────────

  async getCurrentSubscription(userId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-expire if past endDate — all three writes are atomic so a partial
    // failure can't leave the user with a FREE tier but a stale ACTIVE record.
    if (subscription && subscription.endDate < new Date()) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' },
        });
        await tx.user.update({
          where: { id: userId },
          data: { subscriptionTier: 'FREE' },
        });
        // Re-evaluate level after downgrade (reads the just-updated user row)
        const newLevel = await computeLevel(userId, tx as unknown as PrismaClient);
        await tx.user.update({ where: { id: userId }, data: { level: newLevel } });
      });
      return null;
    }

    return subscription;
  },

  // ── Subscription History ────────────────────────────────────────────────────

  async getHistory(userId: string) {
    return prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ── Cancel Subscription ─────────────────────────────────────────────────────

  async cancelSubscription(userId: string) {
    const active = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (!active) throw new AppError('No active subscription found', 404);

    // All three writes are atomic: if the user downgrade fails the subscription
    // status is rolled back, keeping the data consistent.
    return prisma.$transaction(async (tx) => {
      const cancelled = await tx.subscription.update({
        where: { id: active.id },
        data: { status: 'CANCELLED' },
      });

      // Downgrade user tier
      await tx.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'FREE' },
      });

      // Re-evaluate level after downgrade
      const newLevel = await computeLevel(userId, tx as unknown as PrismaClient);
      await tx.user.update({ where: { id: userId }, data: { level: newLevel } });

      return cancelled;
    });
  },

  // ── Level ───────────────────────────────────────────────────────────────────

  async getLevel(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, level: true, subscriptionTier: true, createdAt: true, isVerified: true },
    });
    if (!user) throw new AppError('User not found', 404);

    const daysSince = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const nextLevel =
      user.level === 'OTONDO'
        ? {
            level: 'KOPA',
            requirements: [
              { label: 'Account age 30+ days', met: daysSince >= 30, current: daysSince, target: 30 },
              { label: 'Verified account', met: user.isVerified },
            ],
          }
        : user.level === 'KOPA'
          ? {
              level: 'CORPER',
              requirements: [
                { label: 'Active Corper Plus subscription', met: user.subscriptionTier === 'PREMIUM' },
              ],
            }
          : null;

    return {
      currentLevel: user.level,
      subscriptionTier: user.subscriptionTier,
      accountAgeDays: daysSince,
      nextLevel,
    };
  },

  async checkAndUpdateLevel(userId: string) {
    const newLevel = await computeLevel(userId);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { level: newLevel },
      select: { id: true, level: true, subscriptionTier: true },
    });
    return user;
  },
};
