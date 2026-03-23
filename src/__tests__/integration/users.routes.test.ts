import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';

const BASE = '/api/v1';
const AUTH = `${BASE}/auth`;
const USERS = `${BASE}/users`;
const DISCOVER = `${BASE}/discover`;

// KG/25C/1358 — pre-seeded in DB with password Corper@1234
const USER1 = { stateCode: 'KG/25C/1358', password: 'Corper@1234' };
// KG/25C/1359 — in NYSC mock; may need registration
const USER2 = { stateCode: 'KG/25C/1359', password: 'Corper@5678' };

let token1: string;
let token2: string;
let userId1: string;
let userId2: string;

beforeAll(async () => {
  await prisma.$connect();
  await redis.connect();

  // ── Login user 1 (KG/25C/1358 already in DB from seed) ──────────────────
  const login1 = await request(app)
    .post(`${AUTH}/login`)
    .send({ identifier: USER1.stateCode, password: USER1.password });
  expect(login1.status).toBe(200);
  token1 = login1.body.data.accessToken;
  userId1 = login1.body.data.user.id;

  // ── Register user 2 if not already registered ────────────────────────────
  await prisma.user.deleteMany({ where: { stateCode: USER2.stateCode } });
  await prisma.session.deleteMany({ where: { user: { stateCode: USER2.stateCode } } });

  const initiate = await request(app)
    .post(`${AUTH}/register/initiate`)
    .send({ stateCode: USER2.stateCode, password: USER2.password, confirmPassword: USER2.password });
  expect(initiate.status).toBe(200);
  const otp = initiate.body.data.devOtp;

  const verify = await request(app)
    .post(`${AUTH}/register/verify`)
    .send({ stateCode: USER2.stateCode, otp });
  expect(verify.status).toBe(201);
  token2 = verify.body.data.accessToken;
  userId2 = verify.body.data.user.id;

  // Clean up any follow/block state from previous test runs
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: userId1 }, { followerId: userId2 }] } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: userId1 }, { blockerId: userId2 }] } });
});

afterAll(async () => {
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: userId1 }, { followerId: userId2 }] } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: userId1 }, { blockerId: userId2 }] } });
  await prisma.user.deleteMany({ where: { stateCode: USER2.stateCode } });
  await prisma.$disconnect();
  await redis.quit();
});

// ── GET /users/me ─────────────────────────────────────────────────────────────

describe('GET /users/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`${USERS}/me`);
    expect(res.status).toBe(401);
  });

  it('returns authenticated user profile', async () => {
    const res = await request(app)
      .get(`${USERS}/me`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stateCode).toBe(USER1.stateCode);
    expect(res.body.data.followersCount).toBeDefined();
    expect(res.body.data.followingCount).toBeDefined();
    // Sensitive fields must be absent
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.twoFactorSecret).toBeUndefined();
    expect(res.body.data.fcmTokens).toBeUndefined();
  });
});

// ── PATCH /users/me ───────────────────────────────────────────────────────────

describe('PATCH /users/me', () => {
  it('updates bio', async () => {
    const res = await request(app)
      .patch(`${USERS}/me`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ bio: 'Testing bio update' });

    expect(res.status).toBe(200);
    expect(res.body.data.bio).toBe('Testing bio update');
  });

  it('rejects bio longer than 160 chars', async () => {
    const res = await request(app)
      .patch(`${USERS}/me`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ bio: 'x'.repeat(161) });

    expect(res.status).toBe(422);
  });

  it('enables corperTag with a label', async () => {
    const res = await request(app)
      .patch(`${USERS}/me`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ corperTag: true, corperTagLabel: 'Dev Corper' });

    expect(res.status).toBe(200);
    expect(res.body.data.corperTag).toBe(true);
    expect(res.body.data.corperTagLabel).toBe('Dev Corper');
  });
});

// ── POST /users/me/onboard ────────────────────────────────────────────────────

describe('POST /users/me/onboard', () => {
  it('marks user as onboarded', async () => {
    const res = await request(app)
      .post(`${USERS}/me/onboard`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ bio: 'Onboarded corper' });

    expect(res.status).toBe(200);
    expect(res.body.data.isOnboarded).toBe(true);
    expect(res.body.data.isFirstLogin).toBe(false);
  });
});

// ── GET /users/:userId ────────────────────────────────────────────────────────

describe('GET /users/:userId', () => {
  it('returns public profile without auth', async () => {
    const res = await request(app).get(`${USERS}/${userId1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(userId1);
    expect(res.body.data.isFollowing).toBe(false);
    // Contact info hidden on public profile
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns isFollowing: false when authenticated but not following', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isFollowing).toBe(false);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app).get(`${USERS}/nonexistent-id-999`);
    expect(res.status).toBe(404);
  });
});

// ── Follow / Unfollow / Followers / Following ─────────────────────────────────

describe('Follow system', () => {
  it('POST /:userId/follow — follows user2', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId2}/follow`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });

  it('POST /:userId/follow — idempotent (re-follow returns 200)', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId2}/follow`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });

  it('GET /:userId/is-following — returns true after follow', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}/is-following`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isFollowing).toBe(true);
  });

  it('GET /:userId/followers — returns follower list', async () => {
    const res = await request(app).get(`${USERS}/${userId2}/followers`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.some((u: { id: string }) => u.id === userId1)).toBe(true);
  });

  it('GET /:userId/following — returns following list', async () => {
    const res = await request(app).get(`${USERS}/${userId1}/following`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((u: { id: string }) => u.id === userId2)).toBe(true);
  });

  it('GET /:userId — isFollowing: true when viewing followed user profile', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isFollowing).toBe(true);
    expect(res.body.data.followersCount).toBe(1);
  });

  it('POST /:userId/follow — returns 400 when following self', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId1}/follow`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(400);
  });

  it('DELETE /:userId/follow — unfollows user2', async () => {
    const res = await request(app)
      .delete(`${USERS}/${userId2}/follow`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });

  it('GET /:userId/is-following — returns false after unfollow', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}/is-following`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isFollowing).toBe(false);
  });
});

// ── Block / Unblock ───────────────────────────────────────────────────────────

describe('Block system', () => {
  beforeAll(async () => {
    // Make user1 follow user2 first so we can verify block removes the follow
    await request(app)
      .post(`${USERS}/${userId2}/follow`)
      .set('Authorization', `Bearer ${token1}`);
  });

  it('POST /:userId/block — blocks user2', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId2}/block`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });

  it('block removes follow relationship', async () => {
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId1, followingId: userId2 } },
    });
    expect(follow).toBeNull();
  });

  it('GET /users/me/blocked — lists blocked users', async () => {
    const res = await request(app)
      .get(`${USERS}/me/blocked`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((u: { id: string }) => u.id === userId2)).toBe(true);
  });

  it('GET /users/:userId — blocked user returns 404', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(404);
  });

  it('POST /:userId/follow — cannot follow blocked user', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId2}/follow`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(403);
  });

  it('POST /:userId/block — returns 400 when blocking self', async () => {
    const res = await request(app)
      .post(`${USERS}/${userId1}/block`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(400);
  });

  it('DELETE /:userId/block — unblocks user2', async () => {
    const res = await request(app)
      .delete(`${USERS}/${userId2}/block`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });

  it('GET /users/:userId — visible again after unblock', async () => {
    const res = await request(app)
      .get(`${USERS}/${userId2}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
  });
});

// ── Avatar upload ─────────────────────────────────────────────────────────────

describe('POST /users/me/avatar', () => {
  it('returns 400 when no file is provided', async () => {
    const res = await request(app)
      .post(`${USERS}/me/avatar`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when a non-image file is uploaded', async () => {
    const res = await request(app)
      .post(`${USERS}/me/avatar`)
      .set('Authorization', `Bearer ${token1}`)
      .attach('avatar', Buffer.from('not an image'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });
});

// ── Discover: Corpers in state ────────────────────────────────────────────────

describe('GET /discover/corpers', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`${DISCOVER}/corpers`);
    expect(res.status).toBe(401);
  });

  it('returns corpers in same state', async () => {
    const res = await request(app)
      .get(`${DISCOVER}/corpers`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.state).toBeDefined();
    // Self should not appear
    expect(res.body.data.items.every((u: { id: string }) => u.id !== userId1)).toBe(true);
  });

  it('respects limit query param', async () => {
    const res = await request(app)
      .get(`${DISCOVER}/corpers?limit=1`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(1);
  });
});

// ── Discover: Suggestions ────────────────────────────────────────────────────

describe('GET /discover/suggestions', () => {
  it('returns suggestions not including self', async () => {
    const res = await request(app)
      .get(`${DISCOVER}/suggestions`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every((u: { id: string }) => u.id !== userId1)).toBe(true);
  });
});

// ── Discover: Search ─────────────────────────────────────────────────────────

describe('GET /discover/search', () => {
  it('returns 422 when query is missing', async () => {
    const res = await request(app).get(`${DISCOVER}/search`);
    expect(res.status).toBe(422);
  });

  it('returns results matching first name', async () => {
    const res = await request(app).get(`${DISCOVER}/search?q=Iniubong`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.some((u: { firstName: string }) => u.firstName === 'Iniubong')).toBe(true);
  });

  it('returns results matching partial state code', async () => {
    const res = await request(app).get(`${DISCOVER}/search?q=KG/25C`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('returns empty array for no match', async () => {
    const res = await request(app).get(`${DISCOVER}/search?q=zzznomatch999`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(0);
  });

  it('returns results case-insensitively', async () => {
    const res = await request(app).get(`${DISCOVER}/search?q=iniubong`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((u: { firstName: string }) => u.firstName === 'Iniubong')).toBe(true);
  });
});
