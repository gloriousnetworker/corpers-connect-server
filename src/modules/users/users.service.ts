import { prisma } from '../../config/prisma';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../shared/utils/errors';
import type { UpdateMeDto, OnboardDto } from './users.validation';
import { notificationsService } from '../notifications/notifications.service';

const DEFAULT_LIMIT = 20;

// Fields visible only to the account owner
function sanitiseOwnProfile(user: Record<string, unknown>) {
  const {
    passwordHash: _ph,
    twoFactorSecret: _tfs,
    fcmTokens: _fcm,
    isActive: _ia,
    ...safe
  } = user;
  return safe;
}

// Fields visible on a public profile (hides contact info + internal flags)
function sanitisePublicProfile(user: Record<string, unknown>) {
  const {
    passwordHash: _ph,
    twoFactorSecret: _tfs,
    fcmTokens: _fcm,
    isActive: _ia,
    email: _email,
    phone: _phone,
    isFirstLogin: _fl,
    isOnboarded: _ob,
    twoFactorEnabled: _tfe,
    ...safe
  } = user;
  return safe;
}

// Check if either user has blocked the other; throws 404 if so (no enumeration)
async function assertNotBlocked(viewerId: string, targetId: string) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: targetId },
        { blockerId: targetId, blockedId: viewerId },
      ],
    },
  });
  if (block) throw new NotFoundError('User not found');
}

export const usersService = {
  // ── Own Profile ─────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const [followersCount, followingCount, postsCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.post.count({ where: { authorId: userId } }),
    ]);

    return {
      ...sanitiseOwnProfile(user as unknown as Record<string, unknown>),
      followersCount,
      followingCount,
      postsCount,
    };
  },

  async updateMe(userId: string, data: UpdateMeDto) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return sanitiseOwnProfile(updated as unknown as Record<string, unknown>);
  },

  async onboard(userId: string, data: OnboardDto) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { ...data, isOnboarded: true, isFirstLogin: false },
    });
    return sanitiseOwnProfile(updated as unknown as Record<string, unknown>);
  },

  async updateAvatar(userId: string, imageUrl: string) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { profilePicture: imageUrl },
    });
    return sanitiseOwnProfile(updated as unknown as Record<string, unknown>);
  },

  // ── Public Profile ───────────────────────────────────────────────────────────

  async getProfile(requesterId: string | undefined, targetId: string) {
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user || !user.isActive) throw new NotFoundError('User not found');

    if (requesterId) await assertNotBlocked(requesterId, targetId);

    const [followersCount, followingCount, isFollowing, followsYou, postsCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: targetId } }),
      prisma.follow.count({ where: { followerId: targetId } }),
      requesterId
        ? prisma.follow
            .findUnique({
              where: {
                followerId_followingId: { followerId: requesterId, followingId: targetId },
              },
            })
            .then((r) => !!r)
        : Promise.resolve(false),
      // Does targetId follow the requester back?
      requesterId
        ? prisma.follow
            .findUnique({
              where: {
                followerId_followingId: { followerId: targetId, followingId: requesterId },
              },
            })
            .then((r) => !!r)
        : Promise.resolve(false),
      prisma.post.count({ where: { authorId: targetId } }),
    ]);

    return {
      ...sanitisePublicProfile(user as unknown as Record<string, unknown>),
      followersCount,
      followingCount,
      isFollowing,
      followsYou,
      postsCount,
    };
  },

  // ── Follow ───────────────────────────────────────────────────────────────────

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new BadRequestError('Cannot follow yourself');

    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target || !target.isActive) throw new NotFoundError('User not found');

    // Cannot follow a user who has blocked you or whom you have blocked
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: followingId },
          { blockerId: followingId, blockedId: followerId },
        ],
      },
    });
    if (block) throw new ForbiddenError('Cannot follow this user');

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });

    void notificationsService.create({
      recipientId: followingId,
      actorId: followerId,
      type: 'FOLLOW',
      entityType: 'User',
      entityId: followerId,
    });
  },

  async unfollow(followerId: string, followingId: string) {
    await prisma.follow.deleteMany({ where: { followerId, followingId } });
  },

  async getFollowers(userId: string, requesterId?: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.follow.findMany({
      where: { followingId: userId },
      take: limit + 1,
      ...(cursor && {
        cursor: { followerId_followingId: { followerId: cursor, followingId: userId } },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        follower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
            level: true,
            isVerified: true,
            servingState: true,
            batch: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].followerId : null;
    const users = items.map((r) => r.follower);

    const followingSet = requesterId
      ? await prisma.follow
          .findMany({
            where: { followerId: requesterId, followingId: { in: users.map((u) => u.id) } },
            select: { followingId: true },
          })
          .then((rs) => new Set(rs.map((r) => r.followingId)))
      : new Set<string>();

    return {
      items: users.map((u) => ({ ...u, isFollowing: followingSet.has(u.id) })),
      nextCursor,
      hasMore,
    };
  },

  async getFollowing(userId: string, requesterId?: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      take: limit + 1,
      ...(cursor && {
        cursor: { followerId_followingId: { followerId: userId, followingId: cursor } },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        following: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
            level: true,
            isVerified: true,
            servingState: true,
            batch: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].followingId : null;
    const users = items.map((r) => r.following);

    const followingSet = requesterId
      ? await prisma.follow
          .findMany({
            where: { followerId: requesterId, followingId: { in: users.map((u) => u.id) } },
            select: { followingId: true },
          })
          .then((rs) => new Set(rs.map((r) => r.followingId)))
      : new Set<string>();

    return {
      items: users.map((u) => ({ ...u, isFollowing: followingSet.has(u.id) })),
      nextCursor,
      hasMore,
    };
  },

  async isFollowing(followerId: string, followingId: string) {
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return { isFollowing: !!follow };
  },

  // ── Block ────────────────────────────────────────────────────────────────────

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestError('Cannot block yourself');

    const target = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!target) throw new NotFoundError('User not found');

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    // Remove follow relationships in both directions
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });
  },

  async unblockUser(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  },

  async getBlockedUsers(userId: string) {
    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          },
        },
      },
    });
    return blocks.map((b) => b.blocked);
  },

  // ── FCM Tokens ───────────────────────────────────────────────────────────────

  async addFcmToken(userId: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmTokens: true } });
    if (!user) throw new NotFoundError('User not found');
    if (user.fcmTokens.includes(token)) return; // idempotent
    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: { push: token } },
    });
  },

  async removeFcmToken(userId: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmTokens: true } });
    if (!user) throw new NotFoundError('User not found');
    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: user.fcmTokens.filter((t) => t !== token) },
    });
  },
};
