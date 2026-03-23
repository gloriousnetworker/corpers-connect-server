import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';

const DEFAULT_LIMIT = 20;

const PUBLIC_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  bio: true,
  level: true,
  isVerified: true,
  subscriptionTier: true,
  servingState: true,
  lga: true,
  ppa: true,
  batch: true,
  corperTag: true,
  corperTagLabel: true,
  createdAt: true,
} as const;

export const discoverService = {
  // ── Corpers in same state as the requesting user ──────────────────────────

  async getCorpersInState(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { servingState: true },
    });
    if (!me) throw new NotFoundError('User not found');

    // IDs the user has blocked or been blocked by
    const blockIds = await prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) =>
        rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)),
      );

    const rows = await prisma.user.findMany({
      where: {
        servingState: me.servingState,
        isActive: true,
        id: { not: userId, notIn: blockIds },
      },
      select: PUBLIC_SELECT,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore, state: me.servingState };
  },

  // ── Follow suggestions ─────────────────────────────────────────────────────

  async getSuggestions(userId: string, limit = DEFAULT_LIMIT) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { servingState: true },
    });
    if (!me) throw new NotFoundError('User not found');

    // People already followed
    const alreadyFollowing = await prisma.follow
      .findMany({ where: { followerId: userId }, select: { followingId: true } })
      .then((rows) => rows.map((r) => r.followingId));

    // Blocked/blocking
    const blockIds = await prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) =>
        rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)),
      );

    const exclude = [...alreadyFollowing, ...blockIds, userId];

    // Priority 1: same state, not yet following
    const suggestions = await prisma.user.findMany({
      where: {
        servingState: me.servingState,
        isActive: true,
        id: { notIn: exclude },
      },
      select: PUBLIC_SELECT,
      take: limit,
      orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
    });

    // If we didn't fill the limit, pad with users from any state
    if (suggestions.length < limit) {
      const padIds = [...exclude, ...suggestions.map((u) => u.id)];
      const pad = await prisma.user.findMany({
        where: { isActive: true, id: { notIn: padIds } },
        select: PUBLIC_SELECT,
        take: limit - suggestions.length,
        orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
      });
      suggestions.push(...pad);
    }

    return suggestions;
  },

  // ── Search (name or state code) ────────────────────────────────────────────

  async search(
    requesterId: string | undefined,
    q: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    const blockIds = requesterId
      ? await prisma.block
          .findMany({
            where: { OR: [{ blockerId: requesterId }, { blockedId: requesterId }] },
            select: { blockerId: true, blockedId: true },
          })
          .then((rows) =>
            rows.map((r) => (r.blockerId === requesterId ? r.blockedId : r.blockerId)),
          )
      : [];

    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { notIn: [...blockIds, ...(requesterId ? [requesterId] : [])] },
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { stateCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_SELECT,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: [{ isVerified: 'desc' }, { firstName: 'asc' }],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  },
};
