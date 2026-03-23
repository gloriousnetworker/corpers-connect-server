import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../../config/env';

// ── Mock Paystack — never hit real API in tests ───────────────────────────────

jest.mock('../../config/paystack', () => ({
  paystackRequest: jest.fn(),
}));

import { paystackRequest } from '../../config/paystack';
const mockPaystack = paystackRequest as jest.MockedFunction<typeof paystackRequest>;

// ── Helpers ───────────────────────────────────────────────────────────────────

let _userCounter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const id = ++_userCounter;
  const hash = await bcrypt.hash('Test@1234', 10);
  return prisma.user.create({
    data: {
      email: `sub-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Sub',
      lastName: 'User',
      stateCode: `LA/24B/${id}`,
      servingState: 'Lagos',
      batch: 'Batch B',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

function makeToken(userId: string) {
  return jwt.sign(
    { sub: userId, email: 'sub@example.com', role: 'USER', jti: `sub-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

function makeWebhookSignature(body: string) {
  return crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(body)
    .digest('hex');
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── GET /api/v1/subscriptions/plans ───────────────────────────────────────────

describe('GET /api/v1/subscriptions/plans', () => {
  it('returns plans without authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    const keys = (res.body.data as { key: string }[]).map((p) => p.key);
    expect(keys).toContain('MONTHLY');
    expect(keys).toContain('ANNUAL');
  });

  it('MONTHLY plan costs 1500 naira', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    const monthly = (res.body.data as { key: string; amountNaira: number }[]).find(
      (p) => p.key === 'MONTHLY',
    );
    expect(monthly?.amountNaira).toBe(1500);
  });
});

// ── POST /api/v1/subscriptions/initialize ─────────────────────────────────────

describe('POST /api/v1/subscriptions/initialize', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/subscriptions/initialize')
      .send({ plan: 'MONTHLY' });
    expect(res.status).toBe(401);
  });

  it('returns authorization URL for MONTHLY plan', async () => {
    const user = await createUser();
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/test',
        access_code: 'ac_test',
        reference: `cc-ref-${Date.now()}`,
      },
    });

    const res = await request(app)
      .post('/api/v1/subscriptions/initialize')
      .set('Authorization', `Bearer ${makeToken(user.id)}`)
      .send({ plan: 'MONTHLY' });

    expect(res.status).toBe(201);
    expect(res.body.data.authorizationUrl).toBeTruthy();
    expect(res.body.data.amountKobo).toBe(150_000);
  });

  it('returns authorization URL for ANNUAL plan', async () => {
    const user = await createUser();
    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/test2',
        access_code: 'ac_test2',
        reference: `cc-ref-annual-${Date.now()}`,
      },
    });

    const res = await request(app)
      .post('/api/v1/subscriptions/initialize')
      .set('Authorization', `Bearer ${makeToken(user.id)}`)
      .send({ plan: 'ANNUAL' });

    expect(res.status).toBe(201);
    expect(res.body.data.amountKobo).toBe(1_400_000);
  });

  it('returns 409 if user already has active subscription', async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });

    const res = await request(app)
      .post('/api/v1/subscriptions/initialize')
      .set('Authorization', `Bearer ${makeToken(user.id)}`)
      .send({ plan: 'MONTHLY' });

    expect(res.status).toBe(409);
  });

  it('returns 422 for invalid plan', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/initialize')
      .set('Authorization', `Bearer ${makeToken(user.id)}`)
      .send({ plan: 'WEEKLY' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/subscriptions/verify ─────────────────────────────────────────

describe('GET /api/v1/subscriptions/verify', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/verify?reference=ref123');
    expect(res.status).toBe(401);
  });

  it('activates subscription on successful payment', async () => {
    const user = await createUser();
    const reference = `cc-verify-${Date.now()}`;

    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        status: 'success',
        reference,
        amount: 150_000,
        metadata: { userId: user.id, plan: 'MONTHLY' },
      },
    });

    const res = await request(app)
      .get(`/api/v1/subscriptions/verify?reference=${reference}`)
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.tier).toBe('PREMIUM');

    // Verify user was upgraded
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionTier).toBe('PREMIUM');
    expect(updated?.level).toBe('CORPER');
  });

  it('returns 400 for failed payment', async () => {
    const user = await createUser();

    mockPaystack.mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        status: 'failed',
        reference: 'ref-failed',
        amount: 150_000,
        metadata: { userId: user.id, plan: 'MONTHLY' },
      },
    });

    const res = await request(app)
      .get('/api/v1/subscriptions/verify?reference=ref-failed')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(400);
  });

  it('returns 422 for missing reference', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/v1/subscriptions/verify')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(422);
  });
});

// ── POST /api/v1/subscriptions/webhook ────────────────────────────────────────

describe('POST /api/v1/subscriptions/webhook', () => {
  beforeEach(() => jest.clearAllMocks());

  it('processes charge.success and activates subscription', async () => {
    const user = await createUser();
    const reference = `wh-${Date.now()}`;
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        status: 'success',
        reference,
        amount: 150_000,
        metadata: { userId: user.id, plan: 'MONTHLY' },
      },
    });
    const sig = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const sub = await prisma.subscription.findFirst({ where: { paystackRef: reference } });
    expect(sub?.status).toBe('ACTIVE');
    expect(sub?.tier).toBe('PREMIUM');
  });

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: {} });

    const res = await request(app)
      .post('/api/v1/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'invalid-sig')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('returns 400 when signature header is missing', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: {} });

    const res = await request(app)
      .post('/api/v1/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
  });

  it('ignores non-charge events', async () => {
    const body = JSON.stringify({ event: 'transfer.success', data: {} });
    const sig = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});

// ── GET /api/v1/subscriptions/me ─────────────────────────────────────────────

describe('GET /api/v1/subscriptions/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/me');
    expect(res.status).toBe(401);
  });

  it('returns null when no active subscription', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('returns active subscription', async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });

    const res = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.tier).toBe('PREMIUM');
  });
});

// ── GET /api/v1/subscriptions/history ────────────────────────────────────────

describe('GET /api/v1/subscriptions/history', () => {
  it('returns subscription history', async () => {
    const user = await createUser();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        status: 'EXPIRED',
      },
    });

    const res = await request(app)
      .get('/api/v1/subscriptions/history')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ── POST /api/v1/subscriptions/cancel ────────────────────────────────────────

describe('POST /api/v1/subscriptions/cancel', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/subscriptions/cancel');
    expect(res.status).toBe(401);
  });

  it('cancels an active subscription', async () => {
    const user = await createUser({ subscriptionTier: 'PREMIUM', level: 'CORPER' });
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 150_000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });

    const res = await request(app)
      .post('/api/v1/subscriptions/cancel')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');

    // Verify user was downgraded
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionTier).toBe('FREE');
  });

  it('returns 404 when no active subscription to cancel', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/cancel')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/subscriptions/level ──────────────────────────────────────────

describe('GET /api/v1/subscriptions/level', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/level');
    expect(res.status).toBe(401);
  });

  it('returns OTONDO for new unverified user', async () => {
    const user = await createUser({ isVerified: false });

    const res = await request(app)
      .get('/api/v1/subscriptions/level')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.currentLevel).toBe('OTONDO');
    expect(res.body.data.nextLevel.level).toBe('KOPA');
  });

  it('returns CORPER for PREMIUM subscriber', async () => {
    const user = await createUser({ subscriptionTier: 'PREMIUM', level: 'CORPER' });

    const res = await request(app)
      .get('/api/v1/subscriptions/level')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.currentLevel).toBe('CORPER');
    expect(res.body.data.nextLevel).toBeNull();
  });
});

// ── POST /api/v1/subscriptions/level/check ────────────────────────────────────

describe('POST /api/v1/subscriptions/level/check', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/subscriptions/level/check');
    expect(res.status).toBe(401);
  });

  it('returns updated level', async () => {
    const user = await createUser({ isVerified: true, level: 'OTONDO' });

    const res = await request(app)
      .post('/api/v1/subscriptions/level/check')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBeDefined();
  });

  it('upgrades fresh verified user to KOPA after 30+ days', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const user = await createUser({ isVerified: true, level: 'OTONDO', createdAt: thirtyOneDaysAgo });

    const res = await request(app)
      .post('/api/v1/subscriptions/level/check')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe('KOPA');
  });
});
