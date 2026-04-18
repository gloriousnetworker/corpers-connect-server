import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { PostVisibility } from '@prisma/client';
import { enrichPostsWithTaggedUsers } from '../posts/posts.service';

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
        isDeleted: false,
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

    const postIds = items.map((p) => p.id);
    const reactionGroups = await prisma.reaction.groupBy({
      by: ['postId', 'reactionType'],
      where: { postId: { in: postIds } },
      _count: { userId: true },
    });

    const byPost = new Map<string, Array<{ type: string; count: number }>>();
    for (const g of reactionGroups) {
      const arr = byPost.get(g.postId) ?? [];
      arr.push({ type: g.reactionType, count: g._count.userId });
      byPost.set(g.postId, arr);
    }

    const shaped = items.map((p) => {
      const { reactions, ...rest } = p;
      const types = byPost.get(p.id) ?? [];
      types.sort((a, b) => b.count - a.count);
      return {
        ...rest,
        myReaction: reactions[0]?.reactionType ?? null,
        topReactionTypes: types.slice(0, 3).map((r) => r.type),
      };
    });
    const enrichedItems = await enrichPostsWithTaggedUsers(shaped);

    return {
      items: enrichedItems,
      nextCursor,
      hasMore,
    };
  },
};
