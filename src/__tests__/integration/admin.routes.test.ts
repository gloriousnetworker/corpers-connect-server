/**
 * Integration tests for admin routes — hits real DB (test env).
 * AdminUser rows are created directly via Prisma; JWTs are signed with the real secret.
 */

import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = Date.now();

async function createAdminUser(role: 'ADMIN' | 'SUPERADMIN' = 'ADMIN') {
  const id = ++_counter;
  const hash = await bcrypt.hash('Admin@1234', 10);
  return prisma.adminUser.create({
    data: {
      email: `admin-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      role,
      isActive: true,
    },
  });
}

async function createRegularUser(overrides: Record<string, unknown> = {}) {
  const id = ++_counter;
  const hash = await bcrypt.hash('User@1234', 10);
  return prisma.user.create({
    data: {
      email: `user-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Regular',
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

function makeAdminToken(adminId: string, role: 'ADMIN' | 'SUPERADMIN' = 'ADMIN') {
  return jwt.sign(
    { sub: adminId, email: 'admin@example.com', role, jti: `admin-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

function makeUserToken(userId: string) {
  return jwt.sign(
    { sub: userId, email: 'user@example.com', role: 'USER', jti: `user-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /api/v1/admin/auth/login ─────────────────────────────────────────────

describe('POST /api/v1/admin/auth/login', () => {
  it('returns access token with valid credentials', async () => {
    const admin = await createAdminUser('SUPERADMIN');
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: admin.email, password: 'Admin@1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.admin.role).toBe('SUPERADMIN');
  });

  it('returns 401 for wrong password', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: admin.email, password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'ghost@example.com', password: 'Admin@1234' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for inactive admin', async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: `inactive-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash('Admin@1234', 10),
        firstName: 'Inactive',
        lastName: 'Admin',
        role: 'ADMIN',
        isActive: false,
      },
    });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: admin.email, password: 'Admin@1234' });

    expect(res.status).toBe(401);
  });

  it('returns 422 for missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@example.com' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/admin/dashboard ───────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard', () => {
  it('returns dashboard stats for admin', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.totalUsers).toBe('number');
    expect(typeof res.body.data.activeUsers).toBe('number');
    expect(typeof res.body.data.totalPosts).toBe('number');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular user token', async () => {
    const user = await createRegularUser();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${makeUserToken(user.id)}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/admin/users ───────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('returns paginated user list', async () => {
    const admin = await createAdminUser();
    await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(typeof res.body.data.hasMore).toBe('boolean');
  });

  it('filters by servingState', async () => {
    const admin = await createAdminUser();
    await createRegularUser({ servingState: 'Kano' });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/users?servingState=Kano')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.items as { servingState: string }[];
    expect(items.every((u) => u.servingState === 'Kano')).toBe(true);
  });

  it('respects limit parameter', async () => {
    const admin = await createAdminUser();
    // Create 3 users then request limit=2
    await Promise.all([createRegularUser(), createRegularUser(), createRegularUser()]);
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/users?limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(2);
  });
});

// ── GET /api/v1/admin/users/:userId ───────────────────────────────────────────

describe('GET /api/v1/admin/users/:userId', () => {
  it('returns user details', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get(`/api/v1/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.id);
    expect(res.body.data.email).toBe(user.email);
  });

  it('returns 404 for non-existent user', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/users/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/admin/users/:userId/suspend ─────────────────────────────────

describe('PATCH /api/v1/admin/users/:userId/suspend', () => {
  it('suspends an active user', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser({ isActive: true });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.isActive).toBe(false);
  });

  it('returns 400 if user already suspended', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser({ isActive: false });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/admin/users/:userId/reactivate ─────────────────────────────

describe('PATCH /api/v1/admin/users/:userId/reactivate', () => {
  it('reactivates a suspended user', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser({ isActive: false });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.isActive).toBe(true);
  });

  it('returns 400 if user already active', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser({ isActive: true });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/admin/users/:userId/verify ─────────────────────────────────

describe('PATCH /api/v1/admin/users/:userId/verify', () => {
  it('verifies a user', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser({ isVerified: false });
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/verify`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.isVerified).toBe(true);
  });
});

// ── POST /api/v1/admin/users/:userId/subscription ─────────────────────────────

describe('POST /api/v1/admin/users/:userId/subscription', () => {
  it('grants MONTHLY subscription to user', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/subscription`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'MONTHLY' });

    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('PREMIUM');
    expect(res.body.data.plan).toBe('MONTHLY');
    expect(res.body.data.status).toBe('ACTIVE');

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionTier).toBe('PREMIUM');
  });

  it('grants ANNUAL subscription to user', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/subscription`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'ANNUAL' });

    expect(res.status).toBe(200);
    expect(res.body.data.plan).toBe('ANNUAL');
  });

  it('returns 422 for invalid plan', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/subscription`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'INVALID' });

    expect(res.status).toBe(422);
  });
});

// ── DELETE /api/v1/admin/users/:userId/subscription ──────────────────────────

describe('DELETE /api/v1/admin/users/:userId/subscription', () => {
  it('revokes active subscription', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    // Grant first
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'PREMIUM',
        plan: 'MONTHLY',
        amountKobo: 0,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: 'PREMIUM' } });

    const res = await request(app)
      .delete(`/api/v1/admin/users/${user.id}/subscription`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionTier).toBe('FREE');
  });

  it('returns 404 if no active subscription', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .delete(`/api/v1/admin/users/${user.id}/subscription`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/admin/users/:userId ────────────────────────────────────────

describe('DELETE /api/v1/admin/users/:userId', () => {
  it('deletes a user and returns 204', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .delete(`/api/v1/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const deleted = await prisma.user.findUnique({ where: { id: user.id } });
    expect(deleted).toBeNull();
  });

  it('returns 404 for non-existent user', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .delete('/api/v1/admin/users/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/admin/reports ─────────────────────────────────────────────────

describe('GET /api/v1/admin/reports', () => {
  it('returns paginated report list', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    // Create a report
    await prisma.report.create({
      data: {
        reporterId: user.id,
        entityType: 'POST',
        entityId: 'post-test-1',
        reason: 'Spam',
        status: 'PENDING',
      },
    });

    const res = await request(app)
      .get('/api/v1/admin/reports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('filters by status', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/reports?status=PENDING')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.items as { status: string }[];
    expect(items.every((r) => r.status === 'PENDING')).toBe(true);
  });
});

// ── GET /api/v1/admin/reports/:reportId ───────────────────────────────────────

describe('GET /api/v1/admin/reports/:reportId', () => {
  it('returns a single report', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        entityType: 'USER',
        entityId: user.id,
        reason: 'Harassment',
        status: 'PENDING',
      },
    });

    const res = await request(app)
      .get(`/api/v1/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(report.id);
  });

  it('returns 404 for non-existent report', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/reports/non-existent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/admin/reports/:reportId ─────────────────────────────────────

describe('PATCH /api/v1/admin/reports/:reportId', () => {
  it('updates report status to ACTIONED', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        entityType: 'POST',
        entityId: 'post-action-1',
        reason: 'Spam',
        status: 'PENDING',
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIONED', reviewNote: 'Content removed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIONED');
  });

  it('returns 422 for invalid status', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        entityType: 'POST',
        entityId: 'post-invalid-1',
        reason: 'Spam',
        status: 'PENDING',
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/admin/seller-applications ────────────────────────────────────

describe('GET /api/v1/admin/seller-applications', () => {
  it('returns paginated seller applications', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://example.com/doc.pdf', status: 'PENDING' },
    });

    const res = await request(app)
      .get('/api/v1/admin/seller-applications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

// ── PATCH /api/v1/admin/seller-applications/:appId/approve ───────────────────

describe('PATCH /api/v1/admin/seller-applications/:appId/approve', () => {
  it('approves a pending application', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const app_ = await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://example.com/doc.pdf', status: 'PENDING' },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/seller-applications/${app_.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 400 if application not pending', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const app_ = await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://example.com/doc2.pdf', status: 'APPROVED' },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/seller-applications/${app_.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/admin/seller-applications/:appId/reject ────────────────────

describe('PATCH /api/v1/admin/seller-applications/:appId/reject', () => {
  it('rejects a pending application', async () => {
    const admin = await createAdminUser();
    const user = await createRegularUser();
    const token = makeAdminToken(admin.id);

    const app_ = await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://example.com/doc3.pdf', status: 'PENDING' },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/seller-applications/${app_.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewNote: 'Document unclear' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });
});

// ── GET /api/v1/admin/settings ────────────────────────────────────────────────

describe('GET /api/v1/admin/settings', () => {
  it('returns system settings list', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── PUT /api/v1/admin/settings/:key ──────────────────────────────────────────

describe('PUT /api/v1/admin/settings/:key', () => {
  it('creates/updates a system setting', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .put('/api/v1/admin/settings/maintenance_mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: true });

    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('maintenance_mode');
  });

  it('updates an existing setting with a new value', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    // Set initial value
    await request(app)
      .put('/api/v1/admin/settings/max_posts_per_day')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 10 });

    // Update value
    const res = await request(app)
      .put('/api/v1/admin/settings/max_posts_per_day')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe(20);
  });

  it('returns 422 when value is missing', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .put('/api/v1/admin/settings/some_key')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────

describe('GET /api/v1/admin/audit-logs', () => {
  it('returns audit log list', async () => {
    const admin = await createAdminUser();
    const token = makeAdminToken(admin.id);

    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

// ── GET /api/v1/admin/admins (SUPERADMIN only) ────────────────────────────────

describe('GET /api/v1/admin/admins', () => {
  it('returns admin list for superadmin', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');

    const res = await request(app)
      .get('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 403 for regular admin', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');

    const res = await request(app)
      .get('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/admin/admins (SUPERADMIN only) ───────────────────────────────

describe('POST /api/v1/admin/admins', () => {
  it('creates a new admin', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');
    const id = ++_counter;

    const res = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `newadmin-${id}@example.com`,
        password: 'Admin@1234',
        firstName: 'New',
        lastName: 'Admin',
        role: 'ADMIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('returns 409 for duplicate email', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');

    const res = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: superAdmin.email, // already exists
        password: 'Admin@1234',
        firstName: 'Dup',
        lastName: 'Admin',
        role: 'ADMIN',
      });

    expect(res.status).toBe(409);
  });

  it('returns 403 for regular admin', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');
    const id = ++_counter;

    const res = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `another-${id}@example.com`,
        password: 'Admin@1234',
        firstName: 'Another',
        lastName: 'Admin',
        role: 'ADMIN',
      });

    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/v1/admin/admins/:adminId/deactivate (SUPERADMIN only) ──────────

describe('PATCH /api/v1/admin/admins/:adminId/deactivate', () => {
  it('deactivates another admin', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const otherAdmin = await createAdminUser('ADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');

    const res = await request(app)
      .patch(`/api/v1/admin/admins/${otherAdmin.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await prisma.adminUser.findUnique({ where: { id: otherAdmin.id } });
    expect(updated?.isActive).toBe(false);
  });

  it('returns 400 when trying to deactivate yourself', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');

    const res = await request(app)
      .patch(`/api/v1/admin/admins/${superAdmin.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when trying to deactivate already inactive admin', async () => {
    const superAdmin = await createAdminUser('SUPERADMIN');
    const token = makeAdminToken(superAdmin.id, 'SUPERADMIN');

    const inactiveAdmin = await prisma.adminUser.create({
      data: {
        email: `deactivated-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash('Admin@1234', 10),
        firstName: 'Already',
        lastName: 'Inactive',
        role: 'ADMIN',
        isActive: false,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/admins/${inactiveAdmin.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 403 for regular admin', async () => {
    const admin = await createAdminUser('ADMIN');
    const otherAdmin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');

    const res = await request(app)
      .patch(`/api/v1/admin/admins/${otherAdmin.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
