import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { PostVisibility } from '@prisma/client';

const DEFAULT_LIMIT = 20;

const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  level: true,
  isVerified: true,
  batch: true,
  servingState: true,
} as const;

export const feedService = {
  async getHomeFeed(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    // Fetch user profile, followed IDs, and blocked IDs in a single round-trip
    const [me, followedIds, blockedIds] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { servingState: true } }),
      prisma.follow
        .findMany({ where: { followerId: userId }, select: { followingId: true } })
        .then((rows) => rows.map((r) => r.followingId)),
      prisma.block
        .findMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
          select: { blockerId: true, blockedId: true },
        })
        .then((rows) => rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId))),
    ]);
    if (!me) throw new NotFoundError('User not found');

    const rows = await prisma.post.findMany({
      where: {
        isFlagged: false,
        author: { isActive: true, id: { notIn: blockedIds } },
        OR: [
          // Own posts (any visibility)
          { authorId: userId },
          // Followed users — PUBLIC, FRIENDS (I follow them), STATE (if same state)
          {
            authorId: { in: followedIds },
            visibility: PostVisibility.PUBLIC,
          },
          {
            authorId: { in: followedIds },
            visibility: PostVisibility.FRIENDS,
          },
          {
            authorId: { in: followedIds },
            visibility: PostVisibility.STATE,
            author: { servingState: me.servingState },
          },
          // Same-state users (not following) — PUBLIC
          {
            author: { servingState: me.servingState, isActive: true },
            visibility: PostVisibility.PUBLIC,
            authorId: { notIn: [userId, ...followedIds, ...blockedIds] },
          },
          // Same-state users (not following) — STATE
          {
            author: { servingState: me.servingState, isActive: true },
            visibility: PostVisibility.STATE,
            authorId: { notIn: [userId, ...followedIds, ...blockedIds] },
          },
        ],
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
        reactions: { where: { userId }, select: { reactionType: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((p) => {
        const { reactions, ...rest } = p;
        return { ...rest, myReaction: reactions[0]?.reactionType ?? null };
      }),
      nextCursor,
      hasMore,
    };
  },
};
