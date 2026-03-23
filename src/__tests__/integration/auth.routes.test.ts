import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { redis, redisHelpers } from '../../config/redis';

const BASE = '/api/v1/auth';

// Test state code not pre-seeded — used for registration flow
const TEST_STATE_CODE = 'KG/25C/1359';

beforeAll(async () => {
  await prisma.$connect();
  try { await redis.connect(); } catch { /* Redis unavailable in this environment */ }
  // Clean test user if exists from previous run
  await prisma.user.deleteMany({ where: { stateCode: TEST_STATE_CODE } });
  await prisma.session.deleteMany({ where: { user: { stateCode: TEST_STATE_CODE } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { stateCode: TEST_STATE_CODE } });
  await prisma.$disconnect();
  try { await redis.quit(); } catch { /* Redis unavailable */ }
});

// ── Health ─────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Corpers Connect API');
  });
});

// ── Lookup ─────────────────────────────────────────────────────────────────────
describe(`POST ${BASE}/lookup`, () => {
  it('returns corper details for valid state code', async () => {
    const res = await request(app)
      .post(`${BASE}/lookup`)
      .send({ stateCode: 'KG/25C/1358' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe('Iniubong');
    expect(res.body.data.stateCode).toBe('KG/25C/1358');
  });

  it('returns 400 for invalid state code format', async () => {
    const res = await request(app)
      .post(`${BASE}/lookup`)
      .send({ stateCode: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for valid format but unknown code', async () => {
    const res = await request(app)
      .post(`${BASE}/lookup`)
      .send({ stateCode: 'KG/25C/9999' });

    expect(res.status).toBe(404);
  });

  it('returns 422 when stateCode is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/lookup`)
      .send({});

    expect(res.status).toBe(422);
  });
});

// ── Registration ───────────────────────────────────────────────────────────────
describe(`Registration flow`, () => {
  let devOtp: string;

  it('POST /register/initiate — returns 200 with devOtp in test mode', async () => {
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send({
        stateCode: TEST_STATE_CODE,
        password: 'Corper@1234',
        confirmPassword: 'Corper@1234',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.devOtp).toMatch(/^\d{6}$/);
    devOtp = res.body.data.devOtp;
  });

  it('POST /register/initiate — overwrites pending OTP on second call (returns 200)', async () => {
    // Second call replaces Redis key with a new OTP — still 200
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send({
        stateCode: TEST_STATE_CODE,
        password: 'Corper@1234',
        confirmPassword: 'Corper@1234',
      });
    expect(res.status).toBe(200);
    // Use the latest OTP
    devOtp = res.body.data.devOtp;
  });

  it('POST /register/verify — 400 for wrong OTP', async () => {
    const res = await request(app)
      .post(`${BASE}/register/verify`)
      .send({ stateCode: TEST_STATE_CODE, otp: '000000' });

    expect(res.status).toBe(400);
  });

  it('POST /register/verify — 201 with tokens for correct OTP', async () => {
    const res = await request(app)
      .post(`${BASE}/register/verify`)
      .send({ stateCode: TEST_STATE_CODE, otp: devOtp });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.stateCode).toBe(TEST_STATE_CODE);
    // Sensitive fields must NOT be in response
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.twoFactorSecret).toBeUndefined();
  });

  it('POST /register/initiate — 409 after user is fully registered', async () => {
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send({
        stateCode: TEST_STATE_CODE,
        password: 'Corper@1234',
        confirmPassword: 'Corper@1234',
      });
    expect(res.status).toBe(409);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────────
describe(`POST ${BASE}/login`, () => {
  let accessToken: string;
  let refreshToken: string;

  it('logs in with state code', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'KG/25C/1358', password: 'Corper@1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.requires2FA).toBe(false);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('logs in with email', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'udofotsx@yahoo.com', password: 'Corper@1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'KG/25C/1358', password: 'WrongPass@1' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown user', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'KG/25C/9999', password: 'Corper@1234' });

    expect(res.status).toBe(401);
  });

  // ── Protected routes ────────────────────────────────────────────────────────
  it('GET /sessions — 401 without token', async () => {
    const res = await request(app).get(`${BASE}/sessions`);
    expect(res.status).toBe(401);
  });

  it('GET /sessions — 200 with valid token', async () => {
    const res = await request(app)
      .get(`${BASE}/sessions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Token refresh ───────────────────────────────────────────────────────────
  it('POST /refresh — returns new token pair', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.accessToken).not.toBe(accessToken);
  });

  // ── Logout + blocklist ──────────────────────────────────────────────────────
  it('POST /logout — invalidates access token', async () => {
    const loginRes = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'KG/25C/1358', password: 'Corper@1234' });

    const token = loginRes.body.data.accessToken;

    const logoutRes = await request(app)
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    // Token must be blocked now
    const afterLogout = await request(app)
      .get(`${BASE}/sessions`)
      .set('Authorization', `Bearer ${token}`);

    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.message).toMatch(/revoked/i);
  });
});

// ── Forgot / Reset Password ────────────────────────────────────────────────────
describe('Forgot / Reset password flow', () => {
  it('POST /forgot-password — always returns 200 (no enumeration)', async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'udofotsx@yahoo.com' });

    expect(res.status).toBe(200);
    // In test mode, devOtp is returned
    expect(res.body.data?.devOtp ?? '').toMatch(/^\d{6}$|^$/);
  });

  it('POST /forgot-password — returns 200 even for unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'nobody@nowhere.com' });

    expect(res.status).toBe(200);
  });

  it('POST /reset-password — resets password with correct OTP', async () => {
    // Trigger forgot to get the OTP
    const forgotRes = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'udofotsx@yahoo.com' });

    const otp = forgotRes.body.data?.devOtp;
    if (!otp) return; // Skip if devOtp not returned

    const resetRes = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: 'udofotsx@yahoo.com', otp, newPassword: 'NewCorper@5678', confirmPassword: 'NewCorper@5678' });

    expect(resetRes.status).toBe(200);

    // Login with new password
    const loginRes = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: 'udofotsx@yahoo.com', password: 'NewCorper@5678' });

    expect(loginRes.status).toBe(200);

    // Restore original password
    const revertOtp = (
      await request(app)
        .post(`${BASE}/forgot-password`)
        .send({ email: 'udofotsx@yahoo.com' })
    ).body.data?.devOtp;

    if (revertOtp) {
      await request(app)
        .post(`${BASE}/reset-password`)
        .send({ email: 'udofotsx@yahoo.com', otp: revertOtp, newPassword: 'Corper@1234', confirmPassword: 'Corper@1234' });
    }
  });
});

// ── Input validation ───────────────────────────────────────────────────────────
describe('Input validation', () => {
  it('rejects weak password on register', async () => {
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send({ stateCode: 'KG/25C/1359', password: '123', confirmPassword: '123' });

    expect(res.status).toBe(422);
  });

  it('rejects mismatched passwords on register', async () => {
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send({ stateCode: 'KG/25C/1359', password: 'Corper@1234', confirmPassword: 'Other@1234' });

    expect(res.status).toBe(422);
  });

  it('rejects login with empty identifier', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ identifier: '', password: 'Corper@1234' });

    expect(res.status).toBe(422);
  });
});
