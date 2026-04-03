import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { jwtService } from '../../shared/services/jwt.service';
import { AppError } from '../../shared/utils/errors';
import { env } from '../../config/env';
import {
  AdminLoginDto,
  ListUsersDto,
  GrantSubscriptionDto,
  SuspendUserDto,
  ListReportsDto,
  ReviewReportDto,
  ListSellerApplicationsDto,
  ReviewSellerApplicationDto,
  UpsertSettingDto,
  CreateAdminDto,
} from './admin.validation';
import { PLANS } from '../subscriptions/subscriptions.validation';

// ── Internal audit helper ──────────────────────────────────────────────────────

async function audit(
  adminId: string,
  action: string,
  opts?: { entityType?: string; entityId?: string; details?: object; ipAddress?: string },
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action: action as never,
      entityType: opts?.entityType,
      entityId: opts?.entityId,
      details: opts?.details as never,
      ipAddress: opts?.ipAddress,
    },
  });
}

// ── Service ────────────────────────────────────────────────────────────────────

export const adminService = {
  // ── Auth ─────────────────────────────────────────────────────────────────────

  async login(dto: AdminLoginDto) {
    const admin = await prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (!admin || !admin.isActive) throw new AppError('Invalid credentials', 401);

    const match = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!match) throw new AppError('Invalid credentials', 401);

    const accessToken = jwtService.signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role as 'ADMIN' | 'SUPERADMIN',
    });

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  },

  async getAdminById(id: string) {
    const admin = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
    if (!admin || !admin.isActive) throw new AppError('Admin not found', 404);
    return admin;
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const days30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const days7ago  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
    const days14ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const days60ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      premiumUsers,
      totalPosts,
      pendingReports,
      pendingSellerApps,
      activeSubscriptions,
      newUsersThisWeek,
      newUsersPrevWeek,
      // Time-series data (last 30 days)
      newUsers30d,
      subscriptions30d,
      subscriptionsPrev30d,
      posts30d,
      stories30d,
      // Recent activity
      recentReports,
      recentRegistrations,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { subscriptionTier: 'PREMIUM' } }),
      prisma.post.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.sellerApplication.count({ where: { status: 'PENDING' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { createdAt: { gte: days7ago } } }),
      prisma.user.count({ where: { createdAt: { gte: days14ago, lt: days7ago } } }),
      // Raw records for grouping — only select createdAt to minimise payload
      prisma.user.findMany({
        where: { createdAt: { gte: days30ago } },
        select: { createdAt: true },
      }),
      prisma.subscription.findMany({
        where: { createdAt: { gte: days30ago } },
        select: { createdAt: true, amountKobo: true },
      }),
      prisma.subscription.findMany({
        where: { createdAt: { gte: days60ago, lt: days30ago } },
        select: { amountKobo: true },
      }),
      prisma.post.findMany({
        where: { createdAt: { gte: days30ago } },
        select: { createdAt: true },
      }),
      prisma.story.findMany({
        where: { createdAt: { gte: days30ago } },
        select: { createdAt: true },
      }),
      prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, entityType: true, reason: true, status: true, createdAt: true },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, firstName: true, lastName: true, stateCode: true, servingState: true, level: true, createdAt: true },
      }),
    ]);

    // ── Build 30-day date buckets ─────────────────────────────────────────────
    const dateBuckets = buildDateBuckets(30);

    // User growth
    const userGrowthMap = new Map(dateBuckets.map((d) => [d, 0]));
    for (const u of newUsers30d) {
      const key = toDateStr(u.createdAt);
      if (userGrowthMap.has(key)) userGrowthMap.set(key, userGrowthMap.get(key)! + 1);
    }
    const userGrowth = dateBuckets.map((date) => ({ date, count: userGrowthMap.get(date)! }));

    // Revenue per day (kobo → naira)
    const revenueMap = new Map(dateBuckets.map((d) => [d, 0]));
    for (const s of subscriptions30d) {
      const key = toDateStr(s.createdAt);
      if (revenueMap.has(key)) revenueMap.set(key, revenueMap.get(key)! + s.amountKobo);
    }
    const revenue = dateBuckets.map((date) => ({
      date,
      amount: Math.round(revenueMap.get(date)! / 100),
    }));

    // Content activity (posts + stories per day; reels = 0 until model exists)
    const postMap    = new Map(dateBuckets.map((d) => [d, 0]));
    const storyMap   = new Map(dateBuckets.map((d) => [d, 0]));
    for (const p of posts30d)   { const k = toDateStr(p.createdAt); if (postMap.has(k))  postMap.set(k,  postMap.get(k)!  + 1); }
    for (const s of stories30d) { const k = toDateStr(s.createdAt); if (storyMap.has(k)) storyMap.set(k, storyMap.get(k)! + 1); }
    const contentActivity = dateBuckets.map((date) => ({
      date,
      posts:   postMap.get(date)!,
      stories: storyMap.get(date)!,
      reels:   0,
    }));

    // ── Revenue summary ───────────────────────────────────────────────────────
    const revenue30dKobo   = subscriptions30d.reduce((s, x) => s + x.amountKobo, 0);
    const revenuePrev30dKobo = subscriptionsPrev30d.reduce((s, x) => s + x.amountKobo, 0);
    const revenueChange = revenuePrev30dKobo === 0
      ? 0
      : Math.round(((revenue30dKobo - revenuePrev30dKobo) / revenuePrev30dKobo) * 100);

    const newThisWeekChange = newUsersPrevWeek === 0
      ? 0
      : Math.round(((newUsersThisWeek - newUsersPrevWeek) / newUsersPrevWeek) * 100);

    return {
      totalUsers,
      activeUsers,
      premiumUsers,
      totalPosts,
      pendingReports,
      pendingSellerApps,
      activeSubscriptions,
      newUsersThisWeek,
      newThisWeekChange,
      revenue30d: Math.round(revenue30dKobo / 100),
      revenueChange,
      charts: { userGrowth, revenue, contentActivity },
      recentReports: recentReports.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      recentRegistrations: recentRegistrations.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  },

  // ── User Management ───────────────────────────────────────────────────────────

  async listUsers(dto: ListUsersDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.user.findMany({
      where: {
        ...(dto.search
          ? {
              OR: [
                { firstName: { contains: dto.search, mode: 'insensitive' } },
                { lastName: { contains: dto.search, mode: 'insensitive' } },
                { email: { contains: dto.search, mode: 'insensitive' } },
                { stateCode: { contains: dto.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(dto.servingState ? { servingState: dto.servingState } : {}),
        ...(dto.level ? { level: dto.level } : {}),
        ...(dto.subscriptionTier ? { subscriptionTier: dto.subscriptionTier } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isVerified !== undefined ? { isVerified: dto.isVerified } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        stateCode: true,
        servingState: true,
        level: true,
        subscriptionTier: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        _count: { select: { posts: true, followers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  async getUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        stateCode: true,
        servingState: true,
        batch: true,
        lga: true,
        ppa: true,
        bio: true,
        profilePicture: true,
        level: true,
        subscriptionTier: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { posts: true, followers: true, following: true, subscriptions: true },
        },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async suspendUser(userId: string, adminId: string, dto: SuspendUserDto, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.isActive) throw new AppError('User is already suspended', 400);

    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await audit(adminId, 'USER_SUSPENDED', {
      entityType: 'User',
      entityId: userId,
      details: { reason: dto.reason },
      ipAddress,
    });
  },

  async reactivateUser(userId: string, adminId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!user) throw new AppError('User not found', 404);
    if (user.isActive) throw new AppError('User is already active', 400);

    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await audit(adminId, 'USER_REACTIVATED', { entityType: 'User', entityId: userId, ipAddress });
  },

  async verifyUser(userId: string, adminId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AppError('User not found', 404);

    await prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    await audit(adminId, 'USER_VERIFIED', { entityType: 'User', entityId: userId, ipAddress });
  },

  async deleteUser(userId: string, adminId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AppError('User not found', 404);

    await prisma.user.delete({ where: { id: userId } });
    await audit(adminId, 'USER_DELETED', { entityType: 'User', entityId: userId, ipAddress });
  },

  async grantSubscription(userId: string, adminId: string, dto: GrantSubscriptionDto, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AppError('User not found', 404);

    const plan = PLANS[dto.plan];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // Cancel existing active subs
    await prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        tier: 'PREMIUM',
        plan: dto.plan,
        amountKobo: 0, // admin grant = no charge
        startDate,
        endDate,
        status: 'ACTIVE',
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: 'PREMIUM', level: 'CORPER' },
    });

    await audit(adminId, 'SUBSCRIPTION_GRANTED', {
      entityType: 'User',
      entityId: userId,
      details: { plan: dto.plan },
      ipAddress,
    });

    return subscription;
  },

  async revokeSubscription(userId: string, adminId: string, ipAddress?: string) {
    const active = await prisma.subscription.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (!active) throw new AppError('No active subscription found', 404);

    await prisma.subscription.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
    await prisma.user.update({ where: { id: userId }, data: { subscriptionTier: 'FREE' } });

    await audit(adminId, 'SUBSCRIPTION_REVOKED', {
      entityType: 'User',
      entityId: userId,
      ipAddress,
    });
  },

  // ── Reports ──────────────────────────────────────────────────────────────────

  async listReports(dto: ListReportsDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.report.findMany({
      where: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.entityType ? { entityType: dto.entityType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  async getReport(reportId: string) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!report) throw new AppError('Report not found', 404);
    return report;
  },

  async reviewReport(reportId: string, adminId: string, dto: ReviewReportDto, ipAddress?: string) {
    const report = await prisma.report.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!report) throw new AppError('Report not found', 404);

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        reviewedBy: adminId,
        reviewNote: dto.reviewNote,
        reviewedAt: new Date(),
      },
    });

    await audit(adminId, 'POST_REMOVED', {
      entityType: 'Report',
      entityId: reportId,
      details: { status: dto.status },
      ipAddress,
    });

    return updated;
  },

  // ── Seller Applications ───────────────────────────────────────────────────────

  async listSellerApplications(dto: ListSellerApplicationsDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.sellerApplication.findMany({
      where: { ...(dto.status ? { status: dto.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, stateCode: true } },
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  async approveSellerApplication(appId: string, adminId: string, dto: ReviewSellerApplicationDto, ipAddress?: string) {
    const app = await prisma.sellerApplication.findUnique({ where: { id: appId } });
    if (!app) throw new AppError('Application not found', 404);
    if (app.status !== 'PENDING') throw new AppError('Application is not pending', 400);

    const updated = await prisma.sellerApplication.update({
      where: { id: appId },
      data: { status: 'APPROVED', reviewNote: dto.reviewNote, reviewedAt: new Date() },
    });

    await audit(adminId, 'SELLER_APPROVED', { entityType: 'SellerApplication', entityId: appId, ipAddress });
    return updated;
  },

  async rejectSellerApplication(appId: string, adminId: string, dto: ReviewSellerApplicationDto, ipAddress?: string) {
    const app = await prisma.sellerApplication.findUnique({ where: { id: appId } });
    if (!app) throw new AppError('Application not found', 404);
    if (app.status !== 'PENDING') throw new AppError('Application is not pending', 400);

    const updated = await prisma.sellerApplication.update({
      where: { id: appId },
      data: { status: 'REJECTED', reviewNote: dto.reviewNote, reviewedAt: new Date() },
    });

    await audit(adminId, 'SELLER_REJECTED', { entityType: 'SellerApplication', entityId: appId, ipAddress });
    return updated;
  },

  // ── System Settings ───────────────────────────────────────────────────────────

  async getSettings() {
    return prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  },

  async upsertSetting(key: string, dto: UpsertSettingDto, adminId: string, ipAddress?: string) {
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: dto.value as never },
      update: { value: dto.value as never },
    });

    await audit(adminId, 'SETTINGS_UPDATED', { entityType: 'SystemSetting', entityId: key, ipAddress });
    return setting;
  },

  // ── Audit Logs ────────────────────────────────────────────────────────────────

  async getAuditLogs(cursor?: string, limit = 20) {
    const items = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  // ── Admin Management (SUPERADMIN only) ────────────────────────────────────────

  async listAdmins() {
    return prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    });
  },

  async createAdmin(dto: CreateAdminDto, superAdminId: string, ipAddress?: string) {
    const existing = await prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError('Email already in use', 409);

    const hash = await bcrypt.hash(dto.password, env.BCRYPT_SALT_ROUNDS);
    const admin = await prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    await audit(superAdminId, 'ADMIN_CREATED', { entityId: admin.id, ipAddress });
    return admin;
  },

  async deactivateAdmin(adminId: string, superAdminId: string, ipAddress?: string) {
    if (adminId === superAdminId) throw new AppError('Cannot deactivate yourself', 400);
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { id: true, isActive: true } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.isActive) throw new AppError('Admin is already inactive', 400);

    await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
    await audit(superAdminId, 'ADMIN_DEACTIVATED', { entityId: adminId, ipAddress });
  },
};

// ── Dashboard helpers ──────────────────────────────────────────────────────────

/** Returns an array of YYYY-MM-DD strings for the last `days` days (oldest first). */
function buildDateBuckets(days: number): string[] {
  const buckets: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push(toDateStr(d));
  }
  return buckets;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}
