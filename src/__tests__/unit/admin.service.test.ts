/**
 * Unit tests for adminService — Prisma, bcrypt, and jwtService are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    adminUser: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    post: { count: jest.fn() },
    report: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    subscription: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    sellerApplication: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    systemSetting: { findMany: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('../../shared/services/jwt.service', () => ({
  jwtService: { signAccessToken: jest.fn(() => 'mock-admin-token') },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(() => Promise.resolve('hashed-password')),
}));

import { adminService } from '../../modules/admin/admin.service';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-1';
const USER_ID = 'user-1';

const mockAdmin = {
  id: ADMIN_ID,
  email: 'admin@example.com',
  passwordHash: 'hashed',
  firstName: 'Super',
  lastName: 'Admin',
  role: 'SUPERADMIN' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser = {
  id: USER_ID,
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  stateCode: 'LA/25C/001',
  servingState: 'Lagos',
  level: 'OTONDO' as const,
  subscriptionTier: 'FREE' as const,
  isActive: true,
  isVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockReport = {
  id: 'report-1',
  reporterId: USER_ID,
  entityType: 'POST' as const,
  entityId: 'post-1',
  reason: 'Spam',
  details: null,
  status: 'PENDING' as const,
  reviewedBy: null,
  reviewNote: null,
  reviewedAt: null,
  createdAt: new Date(),
  reporter: { id: USER_ID, firstName: 'Test', lastName: 'User', email: 'user@example.com' },
};

// ── login ─────────────────────────────────────────────────────────────────────

describe('adminService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns access token on valid credentials', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await adminService.login({ email: 'admin@example.com', password: 'password' });
    expect(result.accessToken).toBe('mock-admin-token');
    expect(result.admin.role).toBe('SUPERADMIN');
  });

  it('throws 401 for wrong password', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(adminService.login({ email: 'admin@example.com', password: 'wrong' })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for non-existent admin', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(adminService.login({ email: 'x@x.com', password: 'pw' })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for inactive admin', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ ...mockAdmin, isActive: false });
    await expect(adminService.login({ email: 'admin@example.com', password: 'pw' })).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── getDashboard ──────────────────────────────────────────────────────────────

describe('adminService.getDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all dashboard stats', async () => {
    (mockPrisma.user.count as jest.Mock)
      .mockResolvedValueOnce(100) // totalUsers
      .mockResolvedValueOnce(95)  // activeUsers
      .mockResolvedValueOnce(20); // premiumUsers
    (mockPrisma.post.count as jest.Mock).mockResolvedValue(50);
    (mockPrisma.report.count as jest.Mock).mockResolvedValue(5);
    (mockPrisma.sellerApplication.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.subscription.count as jest.Mock).mockResolvedValue(20);

    const result = await adminService.getDashboard();
    expect(result.totalUsers).toBe(100);
    expect(result.activeUsers).toBe(95);
    expect(result.premiumUsers).toBe(20);
    expect(result.totalPosts).toBe(50);
    expect(result.pendingReports).toBe(5);
    expect(result.pendingSellerApps).toBe(3);
    expect(result.activeSubscriptions).toBe(20);
  });
});

// ── listUsers ─────────────────────────────────────────────────────────────────

describe('adminService.listUsers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated user list', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([mockUser]);
    const result = await adminService.listUsers({ limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('detects hasMore', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([mockUser, mockUser, mockUser]);
    const result = await adminService.listUsers({ limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});

// ── getUser ───────────────────────────────────────────────────────────────────

describe('adminService.getUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    const result = await adminService.getUser(USER_ID);
    expect(result.id).toBe(USER_ID);
  });

  it('throws 404 for non-existent user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(adminService.getUser('bad-id')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── suspendUser ───────────────────────────────────────────────────────────────

describe('adminService.suspendUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('suspends an active user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID, isActive: true });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    await adminService.suspendUser(USER_ID, ADMIN_ID, {});
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { isActive: false } });
  });

  it('throws 400 if user already suspended', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID, isActive: false });
    await expect(adminService.suspendUser(USER_ID, ADMIN_ID, {})).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── reactivateUser ────────────────────────────────────────────────────────────

describe('adminService.reactivateUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reactivates a suspended user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID, isActive: false });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    await adminService.reactivateUser(USER_ID, ADMIN_ID);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { isActive: true } });
  });

  it('throws 400 if user already active', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID, isActive: true });
    await expect(adminService.reactivateUser(USER_ID, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── grantSubscription ─────────────────────────────────────────────────────────

describe('adminService.grantSubscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('grants MONTHLY subscription to user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID });
    (mockPrisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.subscription.create as jest.Mock).mockResolvedValue({
      id: 'sub-1', userId: USER_ID, tier: 'PREMIUM', plan: 'MONTHLY', status: 'ACTIVE',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await adminService.grantSubscription(USER_ID, ADMIN_ID, { plan: 'MONTHLY' });
    expect(result.tier).toBe('PREMIUM');
  });
});

// ── listReports ───────────────────────────────────────────────────────────────

describe('adminService.listReports', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated reports', async () => {
    (mockPrisma.report.findMany as jest.Mock).mockResolvedValue([mockReport]);
    const result = await adminService.listReports({ limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
  });
});

// ── reviewReport ──────────────────────────────────────────────────────────────

describe('adminService.reviewReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates report status', async () => {
    (mockPrisma.report.findUnique as jest.Mock).mockResolvedValue({ id: 'report-1' });
    (mockPrisma.report.update as jest.Mock).mockResolvedValue({ ...mockReport, status: 'ACTIONED' });
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await adminService.reviewReport('report-1', ADMIN_ID, { status: 'ACTIONED' });
    expect(result.status).toBe('ACTIONED');
  });

  it('throws 404 for non-existent report', async () => {
    (mockPrisma.report.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(adminService.reviewReport('bad', ADMIN_ID, { status: 'DISMISSED' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── approveSellerApplication ──────────────────────────────────────────────────

describe('adminService.approveSellerApplication', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockApp = { id: 'app-1', userId: USER_ID, idDocUrl: 'url', status: 'PENDING' as const, createdAt: new Date(), updatedAt: new Date(), reviewNote: null, reviewedAt: null };

  it('approves a pending application', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockApp);
    (mockPrisma.sellerApplication.update as jest.Mock).mockResolvedValue({ ...mockApp, status: 'APPROVED' });
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await adminService.approveSellerApplication('app-1', ADMIN_ID, {});
    expect(result.status).toBe('APPROVED');
  });

  it('throws 400 if application is not pending', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue({ ...mockApp, status: 'APPROVED' });
    await expect(adminService.approveSellerApplication('app-1', ADMIN_ID, {})).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── upsertSetting ─────────────────────────────────────────────────────────────

describe('adminService.upsertSetting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates/updates a system setting', async () => {
    (mockPrisma.systemSetting.upsert as jest.Mock).mockResolvedValue({ key: 'maintenance_mode', value: true, updatedAt: new Date() });
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await adminService.upsertSetting('maintenance_mode', { value: true }, ADMIN_ID);
    expect(result.key).toBe('maintenance_mode');
  });
});

// ── createAdmin ───────────────────────────────────────────────────────────────

describe('adminService.createAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new admin', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.adminUser.create as jest.Mock).mockResolvedValue({
      id: 'admin-2', email: 'new@example.com', firstName: 'New', lastName: 'Admin', role: 'ADMIN', createdAt: new Date(),
    });
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await adminService.createAdmin({
      email: 'new@example.com', password: 'Password@1', firstName: 'New', lastName: 'Admin', role: 'ADMIN',
    }, ADMIN_ID);
    expect(result.email).toBe('new@example.com');
  });

  it('throws 409 for duplicate email', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
    await expect(
      adminService.createAdmin({ email: 'admin@example.com', password: 'pw', firstName: 'A', lastName: 'B', role: 'ADMIN' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── deactivateAdmin ───────────────────────────────────────────────────────────

describe('adminService.deactivateAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deactivates a different admin', async () => {
    (mockPrisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-2', isActive: true });
    (mockPrisma.adminUser.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    await adminService.deactivateAdmin('admin-2', ADMIN_ID);
    expect(mockPrisma.adminUser.update).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when trying to deactivate yourself', async () => {
    await expect(adminService.deactivateAdmin(ADMIN_ID, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});
