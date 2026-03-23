/**
 * Unit tests for subscriptionsService — Prisma and Paystack are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    subscription: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../config/paystack', () => ({
  paystackRequest: jest.fn(),
}));

import { subscriptionsService } from '../../modules/subscriptions/subscriptions.service';
import { prisma } from '../../config/prisma';
import { paystackRequest } from '../../config/paystack';
import crypto from 'crypto';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockPaystack = paystackRequest as jest.MockedFunction<typeof paystackRequest>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const REFERENCE = 'cc-test-ref-123';

const mockUser = {
  id: USER_ID,
  email: 'test@example.com',
  subscriptionTier: 'FREE' as const,
  createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
  isVerified: true,
  level: 'KOPA' as const,
};

const mockSubscription = {
  id: 'sub-1',
  userId: USER_ID,
  tier: 'PREMIUM' as const,
  plan: 'MONTHLY',
  amountKobo: 150_000,
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  paystackRef: REFERENCE,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── getPlans ──────────────────────────────────────────────────────────────────

describe('subscriptionsService.getPlans', () => {
  it('returns MONTHLY and ANNUAL plans', () => {
    const plans = subscriptionsService.getPlans();
    expect(plans).toHaveLength(2);
    const keys = plans.map((p) => p.key);
    expect(keys).toContain('MONTHLY');
    expect(keys).toContain('ANNUAL');
  });

  it('MONTHLY costs ₦1,500 (150,000 kobo)', () => {
    const plans = subscriptionsService.getPlans();
    const monthly = plans.find((p) => p.key === 'MONTHLY')!;
    expect(monthly.amountKobo).toBe(150_000);
    expect(monthly.amountNaira).toBe(1_500);
  });

  it('ANNUAL costs ₦14,000 (1,400,000 kobo)', () => {
    const plans = subscriptionsService.getPlans();
    const annual = plans.find((p) => p.key === 'ANNUAL')!;
    expect(annual.amountKobo).toBe(1_400_000);
    expect(annual.amountNaira).toBe(14_000);
  });
});

// ── initializePayment ─────────────────────────────────────────────────────────

describe('subscriptionsService.initializePayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns authorization_url and reference', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/test',
        access_code: 'ac_test',
        reference: REFERENCE,
      },
    });

    const result = await subscriptionsService.initializePayment(USER_ID, { plan: 'MONTHLY' });
    expect(result.authorizationUrl).toBeTruthy();
    expect(result.reference).toBe(REFERENCE);
    expect(result.amountKobo).toBe(150_000);
  });

  it('throws 409 if user already has active subscription', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(mockSubscription);

    await expect(
      subscriptionsService.initializePayment(USER_ID, { plan: 'MONTHLY' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 502 when Paystack returns error', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    mockPaystack.mockResolvedValue({ status: false, message: 'Error', data: {} as never });

    await expect(
      subscriptionsService.initializePayment(USER_ID, { plan: 'MONTHLY' }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

// ── verifyPayment ─────────────────────────────────────────────────────────────

describe('subscriptionsService.verifyPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates subscription on successful payment', async () => {
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        status: 'success',
        reference: REFERENCE,
        amount: 150_000,
        metadata: { userId: USER_ID, plan: 'MONTHLY' },
      },
    });
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.subscription.create as jest.Mock).mockResolvedValue(mockSubscription);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, subscriptionTier: 'PREMIUM', level: 'CORPER' });

    const result = await subscriptionsService.verifyPayment(USER_ID, { reference: REFERENCE });
    expect(result.status).toBe('ACTIVE');
    expect(result.tier).toBe('PREMIUM');
  });

  it('throws 400 for failed payment', async () => {
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        status: 'failed',
        reference: REFERENCE,
        amount: 150_000,
        metadata: { userId: USER_ID, plan: 'MONTHLY' },
      },
    });

    await expect(
      subscriptionsService.verifyPayment(USER_ID, { reference: REFERENCE }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 403 when payment belongs to a different user', async () => {
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        status: 'success',
        reference: REFERENCE,
        amount: 150_000,
        metadata: { userId: 'other-user', plan: 'MONTHLY' },
      },
    });

    await expect(
      subscriptionsService.verifyPayment(USER_ID, { reference: REFERENCE }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── handleWebhook ─────────────────────────────────────────────────────────────

describe('subscriptionsService.handleWebhook', () => {
  beforeEach(() => jest.clearAllMocks());

  const payload = {
    event: 'charge.success',
    data: {
      status: 'success',
      reference: REFERENCE,
      amount: 150_000,
      metadata: { userId: USER_ID, plan: 'MONTHLY' },
    },
  };

  function makeSignature(body: string) {
    return crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY ?? 'test-secret')
      .update(body)
      .digest('hex');
  }

  it('processes charge.success and activates subscription', async () => {
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.subscription.create as jest.Mock).mockResolvedValue(mockSubscription);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await subscriptionsService.handleWebhook(Buffer.from(body), sig);
    expect(result).toEqual({ received: true });
    expect(mockPrisma.subscription.create).toHaveBeenCalledTimes(1);
  });

  it('throws 401 for invalid signature', async () => {
    const body = JSON.stringify(payload);
    await expect(
      subscriptionsService.handleWebhook(Buffer.from(body), 'bad-signature'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('skips processing if reference already exists (idempotency)', async () => {
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(mockSubscription);

    const result = await subscriptionsService.handleWebhook(Buffer.from(body), sig);
    expect(result).toEqual({ received: true });
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
  });

  it('returns {received: true} for non-charge events', async () => {
    const body = JSON.stringify({ event: 'transfer.success', data: {} });
    const sig = makeSignature(body);

    const result = await subscriptionsService.handleWebhook(Buffer.from(body), sig);
    expect(result).toEqual({ received: true });
  });
});

// ── getCurrentSubscription ────────────────────────────────────────────────────

describe('subscriptionsService.getCurrentSubscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns active subscription', async () => {
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(mockSubscription);
    const result = await subscriptionsService.getCurrentSubscription(USER_ID);
    expect(result?.status).toBe('ACTIVE');
  });

  it('returns null when no subscription', async () => {
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await subscriptionsService.getCurrentSubscription(USER_ID);
    expect(result).toBeNull();
  });

  it('auto-expires and returns null when endDate is past', async () => {
    const expired = { ...mockSubscription, endDate: new Date(Date.now() - 1000) };
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValueOnce(expired);
    (mockPrisma.subscription.update as jest.Mock).mockResolvedValue({ ...expired, status: 'EXPIRED' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      subscriptionTier: 'FREE',
    });

    const result = await subscriptionsService.getCurrentSubscription(USER_ID);
    expect(result).toBeNull();
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });
});

// ── cancelSubscription ────────────────────────────────────────────────────────

describe('subscriptionsService.cancelSubscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels active subscription', async () => {
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(mockSubscription);
    (mockPrisma.subscription.update as jest.Mock).mockResolvedValue({
      ...mockSubscription,
      status: 'CANCELLED',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const result = await subscriptionsService.cancelSubscription(USER_ID);
    expect(result.status).toBe('CANCELLED');
  });

  it('throws 404 when no active subscription', async () => {
    (mockPrisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(subscriptionsService.cancelSubscription(USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── getLevel ──────────────────────────────────────────────────────────────────

describe('subscriptionsService.getLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns CORPER for PREMIUM user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      subscriptionTier: 'PREMIUM',
      level: 'CORPER',
    });
    const result = await subscriptionsService.getLevel(USER_ID);
    expect(result.currentLevel).toBe('CORPER');
    expect(result.nextLevel).toBeNull();
  });

  it('returns KOPA for 30+ day verified free user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      level: 'KOPA',
      subscriptionTier: 'FREE',
    });
    const result = await subscriptionsService.getLevel(USER_ID);
    expect(result.currentLevel).toBe('KOPA');
    expect(result.nextLevel?.level).toBe('CORPER');
  });

  it('returns OTONDO for new user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      createdAt: new Date(), // just created
      level: 'OTONDO',
      subscriptionTier: 'FREE',
    });
    const result = await subscriptionsService.getLevel(USER_ID);
    expect(result.currentLevel).toBe('OTONDO');
    expect(result.nextLevel?.level).toBe('KOPA');
  });
});

// ── checkAndUpdateLevel ───────────────────────────────────────────────────────

describe('subscriptionsService.checkAndUpdateLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upgrades to KOPA when eligible', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser); // 60 days, verified, FREE
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, level: 'KOPA' });

    const result = await subscriptionsService.checkAndUpdateLevel(USER_ID);
    expect(result.level).toBe('KOPA');
  });
});
