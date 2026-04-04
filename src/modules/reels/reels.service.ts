import { prisma } from '../../config/prisma';
import { PostVisibility } from '@prisma/client';
import { NotFoundError } from '../../shared/utils/errors';

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

export const reelsService = {
  /** Create a reel (Post with postType=REEL, must have mediaUrl) */
  async createReel(
    userId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    caption?: string,
    visibility: PostVisibility = PostVisibility.PUBLIC,
  ) {
    return prisma.post.create({
      data: {
        authorId: userId,
        content: caption ?? '',
        mediaUrls: [mediaUrl],
        postType: 'REEL',
        visibility,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });
  },

  /** Paginated reel feed — PUBLIC reels from followed users + own reels */
  async getReelsFeed(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const followedIds = await prisma.follow
      .findMany({ where: { followerId: userId }, select: { followingId: true } })
      .then((rows) => rows.map((r) => r.followingId));

    const blockedIds = await prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) => rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));

    const authorIds = [userId, ...followedIds].filter((id) => !blockedIds.includes(id));

    const rows = await prisma.post.findMany({
      where: {
        postType: 'REEL',
        isFlagged: false,
        isDeleted: false,
        OR: [
          { authorId: userId },
          {
            authorId: { in: authorIds.filter((id) => id !== userId) },
            visibility: { in: [PostVisibility.PUBLIC, PostVisibility.FRIENDS] },
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
    return {
      items: items.map(({ reactions, ...r }) => ({
        ...r,
        myReaction: reactions[0]?.reactionType ?? null,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  /** Global reels explore feed — PUBLIC reels from anyone (paginated) */
  async exploreReels(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const blockedIds = await prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) => rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));

    const rows = await prisma.post.findMany({
      where: {
        postType: 'REEL',
        visibility: PostVisibility.PUBLIC,
        isFlagged: false,
        isDeleted: false,
        authorId: { notIn: blockedIds },
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
    return {
      items: items.map(({ reactions, ...r }) => ({
        ...r,
        myReaction: reactions[0]?.reactionType ?? null,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  /** Get a single reel */
  async getReel(reelId: string) {
    const reel = await prisma.post.findUnique({
      where: { id: reelId, isDeleted: false },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });
    if (!reel || reel.postType !== 'REEL') throw new NotFoundError('Reel not found');
    return reel;
  },
};
