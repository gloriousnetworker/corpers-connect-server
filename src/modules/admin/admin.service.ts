import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
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
  DeactivateSellerDto,
  ListMarketerApplicationsDto,
  RejectMarketerDto,
} from './admin.validation';

import { PLANS } from '../subscriptions/subscriptions.validation';
import { emailService } from '../../shared/services/email.service';
import { notificationsService } from '../notifications/notifications.service';

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

    // If 2FA is enabled, issue a short-lived challenge token instead of a full JWT
    if (admin.twoFactorEnabled) {
      const challengeToken = uuidv4();
      const { redisHelpers } = await import('../../config/redis');
      await redisHelpers.setex(`admin_2fa_challenge:${challengeToken}`, 300, admin.id);
      return { requires2FA: true, challengeToken };
    }

    const accessToken = jwtService.signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role as 'ADMIN' | 'SUPERADMIN',
    });

    return {
      requires2FA: false,
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

  // ── Admin 2FA: challenge step (called after password login) ───────────────────

  async complete2FAChallenge(challengeToken: string, code: string) {
    const { redisHelpers, redis } = await import('../../config/redis');
    const attemptsKey = `admin_2fa_attempts:${challengeToken}`;
    const MAX_ATTEMPTS = 5;

    const adminId = await redisHelpers.get(`admin_2fa_challenge:${challengeToken}`);
    if (!adminId) throw new AppError('2FA challenge expired. Please login again.', 400);

    const attempts = parseInt((await redisHelpers.get(attemptsKey)) ?? '0', 10);
    if (attempts >= MAX_ATTEMPTS) {
      await redisHelpers.del(`admin_2fa_challenge:${challengeToken}`);
      await redisHelpers.del(attemptsKey);
      throw new AppError('Too many incorrect attempts. Please login again.', 429);
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || !admin.twoFactorSecret) throw new AppError('Invalid challenge', 401);

    const valid = authenticator.verify({ token: code, secret: admin.twoFactorSecret });
    if (!valid) {
      await redis.set(attemptsKey, attempts + 1, 'EX', 300);
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      throw new AppError(
        remaining > 0
          ? `Invalid 2FA code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid 2FA code.',
        401,
      );
    }

    await redisHelpers.del(`admin_2fa_challenge:${challengeToken}`);
    await redisHelpers.del(attemptsKey);

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

  // ── Admin 2FA: setup & management ─────────────────────────────────────────────

  async initiate2FASetup(adminId: string) {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (admin.twoFactorEnabled) throw new AppError('2FA is already enabled', 409);

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(admin.email, 'Corpers Connect Admin', secret);
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    const { redisHelpers } = await import('../../config/redis');
    await redisHelpers.setex(`admin_2fa_setup:${adminId}`, 300, secret);

    return { secret, qrCode };
  },

  async confirm2FASetup(adminId: string, code: string) {
    const { redisHelpers } = await import('../../config/redis');
    const secret = await redisHelpers.get(`admin_2fa_setup:${adminId}`);
    if (!secret) throw new AppError('2FA setup expired. Please try again.', 400);

    const valid = authenticator.verify({ token: code, secret });
    if (!valid) throw new AppError('Invalid code. Please try again.', 400);

    await prisma.adminUser.update({
      where: { id: adminId },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    });

    await redisHelpers.del(`admin_2fa_setup:${adminId}`);
    return { message: '2FA enabled successfully' };
  },

  async disable2FA(adminId: string, code: string) {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.twoFactorEnabled) throw new AppError('2FA is not enabled', 400);
    if (!admin.twoFactorSecret) throw new AppError('2FA setup is incomplete', 400);

    const valid = authenticator.verify({ token: code, secret: admin.twoFactorSecret });
    if (!valid) throw new AppError('Invalid 2FA code', 401);

    await prisma.adminUser.update({
      where: { id: adminId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: '2FA disabled successfully' };
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

  async getSellerApplication(appId: string) {
    const app = await prisma.sellerApplication.findUnique({
      where: { id: appId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            stateCode: true,
            profilePicture: true,
            servingState: true,
          },
        },
      },
    });
    if (!app) throw new AppError('Seller application not found', 404);
    return app;
  },

  async approveSellerApplication(appId: string, adminId: string, dto: ReviewSellerApplicationDto, ipAddress?: string) {
    const app = await prisma.sellerApplication.findUnique({ where: { id: appId } });
    if (!app) throw new AppError('Application not found', 404);
    if (app.status !== 'PENDING') throw new AppError('Application is not pending', 400);

    const updated = await prisma.sellerApplication.update({
      where: { id: appId },
      data: { status: 'APPROVED', reviewNote: dto.reviewNote, reviewedAt: new Date() },
    });

    // Auto-create seller profile
    await prisma.sellerProfile.create({
      data: {
        userId: app.userId,
        businessName: app.businessName,
        businessDescription: app.businessDescription,
        whatTheySell: app.whatTheySell,
      },
    });

    // Send approval email
    const user = await prisma.user.findUnique({
      where: { id: app.userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      void emailService.sendSellerApproved(user.email, user.firstName);
    }

    // Create in-app notification
    void notificationsService.create({
      recipientId: app.userId,
      type: 'SELLER_APPROVED' as never,
      entityType: 'SellerApplication',
      entityId: appId,
      content: "Your Mami Market seller application has been approved! You can start selling now.",
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

    // Send rejection email
    const user = await prisma.user.findUnique({
      where: { id: app.userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      void emailService.sendSellerRejected(user.email, user.firstName, dto.reviewNote || 'No reason provided');
    }

    // Create in-app notification
    void notificationsService.create({
      recipientId: app.userId,
      type: 'SELLER_REJECTED' as never,
      entityType: 'SellerApplication',
      entityId: appId,
      content: dto.reviewNote || 'Your Mami Market seller application was not approved.',
    });

    await audit(adminId, 'SELLER_REJECTED', { entityType: 'SellerApplication', entityId: appId, ipAddress });
    return updated;
  },

  async deactivateSeller(userId: string, adminId: string, dto: DeactivateSellerDto, ipAddress?: string) {
    const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('Seller profile not found', 404);
    if (profile.sellerStatus === 'DEACTIVATED') throw new AppError('Seller is already deactivated', 400);

    await prisma.sellerProfile.update({
      where: { userId },
      data: {
        sellerStatus: 'DEACTIVATED',
        deactivationReason: dto.reason,
        deactivatedAt: new Date(),
      },
    });

    // Deactivate all active listings
    await prisma.marketplaceListing.updateMany({
      where: { sellerId: userId, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });

    // Send deactivation email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      void emailService.sendSellerDeactivated(user.email, user.firstName, dto.reason);
    }

    // Create in-app notification
    void notificationsService.create({
      recipientId: userId,
      type: 'SELLER_DEACTIVATED' as never,
      entityType: 'SellerProfile',
      entityId: userId,
      content: `Your Mami Market seller profile has been deactivated. Reason: ${dto.reason}`,
    });

    await audit(adminId, 'SELLER_DEACTIVATED', {
      entityType: 'SellerProfile',
      entityId: userId,
      details: { reason: dto.reason },
      ipAddress,
    });
  },

  async reinstateSeller(userId: string, adminId: string, ipAddress?: string) {
    const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('Seller profile not found', 404);
    if (profile.sellerStatus !== 'DEACTIVATED') throw new AppError('Seller is not deactivated', 400);

    await prisma.sellerProfile.update({
      where: { userId },
      data: {
        sellerStatus: 'ACTIVE',
        deactivationReason: null,
        deactivatedAt: null,
      },
    });

    // Send reinstatement email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      void emailService.sendSellerReinstated(user.email, user.firstName);
    }

    // Create in-app notification (reuse SELLER_APPROVED type)
    void notificationsService.create({
      recipientId: userId,
      type: 'SELLER_APPROVED' as never,
      entityType: 'SellerProfile',
      entityId: userId,
      content: 'Your Mami Market seller profile has been reinstated. You can start selling again!',
    });

    await audit(adminId, 'SELLER_REINSTATED', {
      entityType: 'SellerProfile',
      entityId: userId,
      ipAddress,
    });
  },

  // ── Sellers List ─────────────────────────────────────────────────────────────

  async listSellers(cursor?: string, status?: string, limit = 20) {
    const where: Record<string, unknown> = {};
    if (status === 'ACTIVE') where.sellerStatus = 'ACTIVE';
    else if (status === 'DEACTIVATED') where.sellerStatus = 'DEACTIVATED';

    const items = await prisma.sellerProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, profilePicture: true, stateCode: true } },
      },
    });

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;

    // Fetch listing counts and rating separately
    const enriched = await Promise.all(
      slice.map(async (p) => {
        const [listingCount, reviewAgg] = await Promise.all([
          prisma.marketplaceListing.count({ where: { sellerId: p.userId } }),
          prisma.listingReview.aggregate({
            where: { listing: { sellerId: p.userId } },
            _avg: { rating: true },
            _count: { rating: true },
          }),
        ]);
        return {
          ...p,
          listingCount,
          averageRating: reviewAgg._avg.rating ?? null,
          reviewCount: reviewAgg._count.rating,
        };
      }),
    );

    return { items: enriched, hasMore };
  },

  // ── Seller Appeals ────────────────────────────────────────────────────────────

  async getSellerAppeals(userId: string) {
    return prisma.sellerAppeal.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        seller:    { select: { id: true, firstName: true, lastName: true, email: true } },
        admin:     { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } },
        claimedBy: { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { admin: { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } } },
        },
      },
    });
  },

  async respondToAppeal(
    appealId: string,
    adminId: string,
    dto: { action: 'ACCEPT' | 'REJECT'; adminResponse: string },
    ipAddress?: string,
  ) {
    const appeal = await prisma.sellerAppeal.findUnique({
      where: { id: appealId },
      include: { seller: { select: { email: true, firstName: true } } },
    });
    if (!appeal) throw new AppError('Appeal not found', 404);
    if (appeal.status !== 'PENDING') throw new AppError('Appeal already responded to', 400);

    await prisma.sellerAppeal.update({
      where: { id: appealId },
      data: {
        status: dto.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        adminId,
        adminResponse: dto.adminResponse,
        respondedAt: new Date(),
        claimedByAdminId: null, // release claim on resolution
        claimedAt: null,
      },
    });

    if (dto.action === 'ACCEPT') {
      // Reinstate seller
      await prisma.sellerProfile.update({
        where: { userId: appeal.sellerId },
        data: { sellerStatus: 'ACTIVE', deactivationReason: null, deactivatedAt: null },
      });
      void emailService.sendAppealAccepted(appeal.seller.email, appeal.seller.firstName);
      void notificationsService.create({
        recipientId: appeal.sellerId,
        type: 'SELLER_APPROVED' as never,
        entityType: 'SellerProfile',
        entityId: appeal.sellerId,
        content: 'Your appeal was accepted! Your Mami Market seller account has been reinstated.',
      });
      await audit(adminId, 'SELLER_REINSTATED_VIA_APPEAL', { entityType: 'SellerProfile', entityId: appeal.sellerId, ipAddress });
    } else {
      void emailService.sendAppealRejected(appeal.seller.email, appeal.seller.firstName, dto.adminResponse);
      void notificationsService.create({
        recipientId: appeal.sellerId,
        type: 'SELLER_DEACTIVATED' as never,
        entityType: 'SellerProfile',
        entityId: appeal.sellerId,
        content: `Your appeal was not accepted. Admin response: ${dto.adminResponse}`,
      });
      await audit(adminId, 'SELLER_APPEAL_REJECTED', { entityType: 'SellerProfile', entityId: appeal.sellerId, ipAddress });
    }
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
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, department: true, profilePicture: true, bio: true,
        isActive: true, createdAt: true,
      },
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

  // ── Department Management (SUPERADMIN only) ──────────────────────────────────

  async listDepartments() {
    return prisma.adminDepartment.findMany({
      orderBy: { name: 'asc' },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  },

  async createDepartment(name: string, superAdminId: string) {
    const existing = await prisma.adminDepartment.findUnique({ where: { name } });
    if (existing) throw new AppError('Department already exists', 409);
    return prisma.adminDepartment.create({
      data: { name, createdById: superAdminId },
    });
  },

  async deleteDepartment(id: string, superAdminId: string) {
    const dept = await prisma.adminDepartment.findUnique({ where: { id } });
    if (!dept) throw new AppError('Department not found', 404);
    await prisma.adminDepartment.delete({ where: { id } });
  },

  // ── Admin Profile ─────────────────────────────────────────────────────────────

  async getAdminProfile(adminId: string) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, department: true, profilePicture: true, bio: true,
        isActive: true, createdAt: true,
      },
    });
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  },

  async updateAdminProfile(
    adminId: string,
    dto: import('./admin.validation').UpdateAdminProfileDto,
    profilePictureUrl?: string,
  ) {
    return prisma.adminUser.update({
      where: { id: adminId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName  !== undefined && { lastName:  dto.lastName  }),
        ...(dto.department !== undefined && { department: dto.department as never }),
        ...(dto.bio       !== undefined && { bio:       dto.bio       }),
        ...(profilePictureUrl && { profilePicture: profilePictureUrl }),
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, department: true, profilePicture: true, bio: true,
      },
    });
  },

  // ── Appeal Message Thread ─────────────────────────────────────────────────────

  async getAppealThread(appealId: string, requestingAdminId: string) {
    const appeal = await prisma.sellerAppeal.findUnique({
      where: { id: appealId },
      include: {
        seller:    { select: { id: true, firstName: true, lastName: true, email: true } },
        admin:     { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } },
        claimedBy: { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { admin: { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } } },
        },
      },
    });
    if (!appeal) throw new AppError('Appeal not found', 404);
    return appeal;
  },

  async sendAppealMessage(appealId: string, adminId: string, content: string) {
    const appeal = await prisma.sellerAppeal.findUnique({
      where: { id: appealId },
      include: {
        seller:    { select: { email: true, firstName: true } },
        claimedBy: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
    });
    if (!appeal) throw new AppError('Appeal not found', 404);
    if (appeal.status !== 'PENDING') throw new AppError('This appeal is already closed', 400);

    // Enforce claim lock — if another admin has already claimed this appeal, block
    if (appeal.claimedByAdminId && appeal.claimedByAdminId !== adminId) {
      const claimer = appeal.claimedBy!;
      throw new AppError(
        `This appeal is being handled by ${claimer.firstName} ${claimer.lastName} (${claimer.department ?? 'Admin'}).`,
        403,
      );
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { firstName: true, lastName: true, department: true },
    });
    if (!admin) throw new AppError('Admin not found', 404);

    // Auto-claim on first admin message
    const [message] = await prisma.$transaction([
      prisma.appealMessage.create({
        data: { appealId, content, senderType: 'ADMIN', adminId },
        include: { admin: { select: { id: true, firstName: true, lastName: true, department: true, profilePicture: true } } },
      }),
      ...(!appeal.claimedByAdminId
        ? [prisma.sellerAppeal.update({
            where: { id: appealId },
            data: { claimedByAdminId: adminId, claimedAt: new Date() },
          })]
        : []),
    ]);

    // Email the seller
    void emailService.sendAppealMessageToSeller(
      appeal.seller.email,
      appeal.seller.firstName,
      `${admin.firstName} ${admin.lastName}`,
      admin.department,
      content,
      appealId,
    );

    return message;
  },

  // ── Seller Reply to Admin (appeal thread) ─────────────────────────────────────

  async sellerReplyToAppeal(
    appealId: string,
    sellerId: string,
    content: string,
    attachmentUrl?: string,
    attachmentName?: string,
  ) {
    const appeal = await prisma.sellerAppeal.findUnique({
      where: { id: appealId },
      include: { seller: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!appeal) throw new AppError('Appeal not found', 404);
    if (appeal.sellerId !== sellerId) throw new AppError('Not your appeal', 403);
    if (appeal.status !== 'PENDING') throw new AppError('This appeal is already closed', 400);

    const message = await prisma.appealMessage.create({
      data: {
        appealId,
        content,
        senderType: 'SELLER',
        ...(attachmentUrl  ? { attachmentUrl }  : {}),
        ...(attachmentName ? { attachmentName } : {}),
      },
    });

    // Email all active admins
    const admins = await prisma.adminUser.findMany({
      where: { isActive: true },
      select: { email: true, firstName: true },
    });
    const sellerName = `${appeal.seller.firstName} ${appeal.seller.lastName}`;
    const emailContent = attachmentUrl
      ? `${content}\n\n[Attachment: ${attachmentName ?? 'file'}]`
      : content;
    for (const a of admins) {
      void emailService.sendAppealReplyToAdmin(a.email, a.firstName, sellerName, emailContent, appealId);
    }

    return message;
  },

  // ── Marketer (NIN) Applications ──────────────────────────────────────────────

  async listMarketerApplications(dto: ListMarketerApplicationsDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.user.findMany({
      where: {
        accountType: 'MARKETER',
        ...(dto.status ? { marketerStatus: dto.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        nin: true,
        ninDocumentUrl: true,
        marketerStatus: true,
        marketerReviewedAt: true,
        marketerRejectionReason: true,
        createdAt: true,
        profilePicture: true,
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  async approveMarketer(userId: string, adminId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.accountType !== 'MARKETER') throw new AppError('Not a marketer account', 400);
    if (user.marketerStatus !== 'PENDING') throw new AppError('Application is not pending', 400);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        marketerStatus: 'APPROVED',
        marketerReviewedAt: new Date(),
        marketerReviewedById: adminId,
        marketerRejectionReason: null,
        isVerified: true,
      },
    });

    // Marketers don't go through SellerApplication — their NIN review is the
    // only vetting step. Auto-create a SellerProfile with placeholder business
    // info so they can list immediately; they edit it from their profile.
    const existingProfile = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!existingProfile) {
      await prisma.sellerProfile.create({
        data: {
          userId,
          businessName: `${user.firstName}'s Shop`,
          businessDescription: 'New Mami Marketer on Corpers Connect — edit this from your profile.',
          whatTheySell: 'Various products',
        },
      });
    }

    void emailService.sendMarketerApproved(user.email, user.firstName);

    void notificationsService.create({
      recipientId: user.id,
      type: 'MARKETER_APPROVED' as never,
      entityType: 'User',
      entityId: user.id,
      content: 'Your Mami Marketer account is approved! You can now create listings.',
    });

    await audit(adminId, 'MARKETER_APPROVED', { entityType: 'User', entityId: user.id, ipAddress });
    return updated;
  },

  async rejectMarketer(
    userId: string,
    adminId: string,
    dto: RejectMarketerDto,
    ipAddress?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.accountType !== 'MARKETER') throw new AppError('Not a marketer account', 400);
    if (user.marketerStatus !== 'PENDING') throw new AppError('Application is not pending', 400);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        marketerStatus: 'REJECTED',
        marketerReviewedAt: new Date(),
        marketerReviewedById: adminId,
        marketerRejectionReason: dto.reason,
      },
    });

    void emailService.sendMarketerRejected(user.email, user.firstName, dto.reason);

    void notificationsService.create({
      recipientId: user.id,
      type: 'MARKETER_REJECTED' as never,
      entityType: 'User',
      entityId: user.id,
      content: dto.reason || 'Your Mami Marketer application was not approved.',
    });

    await audit(adminId, 'MARKETER_REJECTED', { entityType: 'User', entityId: user.id, details: { reason: dto.reason }, ipAddress });
    return updated;
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
