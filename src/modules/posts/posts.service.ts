import { prisma } from '../../config/prisma';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../shared/utils/errors';
import type { CreatePostDto, UpdatePostDto } from './posts.validation';
import { PostVisibility, ReactionType, ReportEntityType } from '@prisma/client';
import { destroyCloudinaryAsset } from '../../shared/middleware/upload.middleware';
import { notificationsService } from '../notifications/notifications.service';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
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

// Blocked IDs for a given user (both directions)
async function getBlockedIds(userId: string): Promise<string[]> {
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

// Check if viewer can see a post
function canViewPost(
  post: { authorId: string; visibility: string; author: { servingState: string } },
  viewerId: string | undefined,
  viewerState: string | undefined,
  followedIds: string[],
): boolean {
  if (!viewerId) return post.visibility === PostVisibility.PUBLIC;
  if (post.authorId === viewerId) return true;
  switch (post.visibility as PostVisibility) {
    case PostVisibility.PUBLIC:
      return true;
    case PostVisibility.STATE:
      return post.author.servingState === viewerState;
    case PostVisibility.FRIENDS:
      return followedIds.includes(post.authorId);
    case PostVisibility.ONLY_ME:
      return false;
  }
}

export const postsService = {
  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async createPost(userId: string, dto: CreatePostDto) {
    const post = await prisma.post.create({
      data: {
        authorId: userId,
        content: dto.content,
        mediaUrls: dto.mediaUrls ?? [],
        visibility: dto.visibility as PostVisibility,
        postType: dto.postType as 'REGULAR' | 'REEL' | 'OPPORTUNITY',
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });
    return post;
  },

  async getPost(requesterId: string | undefined, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, isDeleted: false },
      include: {
        author: { select: { ...AUTHOR_SELECT, isActive: true } },
        _count: { select: { reactions: true, comments: true } },
        ...(requesterId
          ? { reactions: { where: { userId: requesterId }, select: { reactionType: true } } }
          : {}),
      },
    });

    if (!post || !post.author.isActive) throw new NotFoundError('Post not found');

    // Block + visibility checks — all three lookups in a single round-trip
    let viewerState: string | undefined;
    let followedIds: string[] = [];
    if (requesterId) {
      const [blockedIds, viewer, followed] = await Promise.all([
        getBlockedIds(requesterId),
        prisma.user.findUnique({ where: { id: requesterId }, select: { servingState: true } }),
        prisma.follow
          .findMany({ where: { followerId: requesterId }, select: { followingId: true } })
          .then((rows) => rows.map((r) => r.followingId)),
      ]);
      if (blockedIds.includes(post.authorId)) throw new NotFoundError('Post not found');
      viewerState = viewer?.servingState;
      followedIds = followed;
    }

    const { isActive: _ia, ...safeAuthor } = post.author;
    const viewable = canViewPost(
      { ...post, author: safeAuthor },
      requesterId,
      viewerState,
      followedIds,
    );
    if (!viewable) throw new NotFoundError('Post not found');

    const myReaction =
      requesterId && (post as { reactions?: { reactionType: ReactionType }[] }).reactions?.[0]
        ? (post as { reactions: { reactionType: ReactionType }[] }).reactions[0].reactionType
        : null;

    const { reactions: _r, ...rest } = post as typeof post & { reactions?: unknown };
    return { ...rest, author: safeAuthor, myReaction };
  },

  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');
    if (post.authorId !== userId) throw new ForbiddenError('Not your post');

    const ageMs = Date.now() - post.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS)
      throw new BadRequestError('Post can only be edited within 15 minutes of creation');

    return prisma.post.update({
      where: { id: postId },
      data: {
        ...dto,
        visibility: dto.visibility as PostVisibility | undefined,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });
  },

  async deletePost(userId: string, postId: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');
    if (post.authorId !== userId) throw new ForbiddenError('Not your post');
    await prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    // Clean up post media from Cloudinary (fire-and-forget)
    for (const url of post.mediaUrls) void destroyCloudinaryAsset(url);
  },

  async getUserPosts(
    requesterId: string | undefined,
    targetUserId: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { isActive: true, servingState: true },
    });
    if (!target || !target.isActive) throw new NotFoundError('User not found');

    // Block + follow + viewer state — all lookups in a single round-trip
    let isFollowing = false;
    let isSameState = false;
    const isOwn = requesterId === targetUserId;

    if (requesterId && !isOwn) {
      const [blockedIds, viewer, followRow] = await Promise.all([
        getBlockedIds(requesterId),
        prisma.user.findUnique({ where: { id: requesterId }, select: { servingState: true } }),
        prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: requesterId, followingId: targetUserId } },
        }),
      ]);
      if (blockedIds.includes(targetUserId)) throw new NotFoundError('User not found');
      isSameState = viewer?.servingState === target.servingState;
      isFollowing = !!followRow;
    }

    const allowedVisibilities: PostVisibility[] = isOwn
      ? [PostVisibility.PUBLIC, PostVisibility.STATE, PostVisibility.FRIENDS, PostVisibility.ONLY_ME]
      : isFollowing && isSameState
        ? [PostVisibility.PUBLIC, PostVisibility.STATE, PostVisibility.FRIENDS]
        : isFollowing
          ? [PostVisibility.PUBLIC, PostVisibility.FRIENDS]
          : isSameState
            ? [PostVisibility.PUBLIC, PostVisibility.STATE]
            : [PostVisibility.PUBLIC];

    const rows = await prisma.post.findMany({
      where: {
        authorId: targetUserId,
        visibility: { in: allowedVisibilities },
        isFlagged: false,
        isDeleted: false,
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async sharePost(userId: string, postId: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    return prisma.post.update({
      where: { id: postId },
      data: { sharesCount: { increment: 1 } },
      select: { id: true, sharesCount: true },
    });
  },

  async reportPost(reporterId: string, postId: string, reason: string, details?: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');
    if (post.authorId === reporterId) throw new BadRequestError('Cannot report your own post');

    await prisma.report.create({
      data: {
        reporterId,
        entityType: ReportEntityType.POST,
        entityId: postId,
        reason,
        details,
      },
    });
  },

  // ── Reactions ────────────────────────────────────────────────────────────────

  async react(userId: string, postId: string, type: ReactionType) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    await prisma.postReaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, reactionType: type },
      update: { reactionType: type },
    });

    void notificationsService.create({
      recipientId: post.authorId,
      actorId: userId,
      type: 'POST_LIKE',
      entityType: 'Post',
      entityId: postId,
      content: 'liked your post',
    });
  },

  async unreact(userId: string, postId: string) {
    await prisma.postReaction.deleteMany({ where: { postId, userId } });
  },

  async getReactions(postId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    const rows = await prisma.postReaction.findMany({
      where: { postId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, profilePicture: true, level: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((r) => ({ ...r.user, reactionType: r.reactionType })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(userId: string, postId: string, content: string, parentId?: string, mediaIndex?: number) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.postId !== postId) throw new BadRequestError('Invalid parent comment');
      if (parent.parentId) throw new BadRequestError('Cannot reply to a reply (max 2 levels)');
    }

    const comment = await prisma.comment.create({
      data: { postId, authorId: userId, content, parentId, mediaIndex: mediaIndex ?? null },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        reactions: { select: { id: true, userId: true, emoji: true } },
        _count: { select: { replies: true } },
      },
    });

    if (parentId) {
      // Notify parent comment author of a reply
      const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { authorId: true } });
      if (parent) {
        void notificationsService.create({
          recipientId: parent.authorId,
          actorId: userId,
          type: 'COMMENT_REPLY',
          entityType: 'Post',
          entityId: postId,
          content: 'replied to your comment',
        });
      }
    } else {
      // Notify post author of a new comment
      void notificationsService.create({
        recipientId: post.authorId,
        actorId: userId,
        type: 'POST_COMMENT',
        entityType: 'Post',
        entityId: postId,
        content: 'commented on your post',
      });
    }

    return comment;
  },

  async deleteComment(userId: string, postId: string, commentId: string) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.postId !== postId) throw new NotFoundError('Comment not found');

    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    const isAuthor = comment.authorId === userId;
    const isPostOwner = post?.authorId === userId;
    if (!isAuthor && !isPostOwner) throw new ForbiddenError('Cannot delete this comment');

    await prisma.comment.delete({ where: { id: commentId } });
  },

  async getComments(postId: string, cursor?: string, limit = DEFAULT_LIMIT, mediaIndex?: number) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    const mediaFilter = mediaIndex !== undefined
      ? { mediaIndex }
      : { mediaIndex: null };

    const rows = await prisma.comment.findMany({
      where: { postId, parentId: null, ...mediaFilter },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        reactions: { select: { id: true, userId: true, emoji: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
            reactions: { select: { id: true, userId: true, emoji: true } },
          },
        },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  // ── Comment Reactions ─────────────────────────────────────────────────────────

  async reactToComment(userId: string, postId: string, commentId: string, emoji: string) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.postId !== postId) throw new NotFoundError('Comment not found');

    await prisma.commentReaction.upsert({
      where: { commentId_userId_emoji: { commentId, userId, emoji } },
      create: { commentId, userId, emoji },
      update: {},
    });

    return prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        reactions: { select: { id: true, userId: true, emoji: true } },
        _count: { select: { replies: true } },
      },
    });
  },

  async removeCommentReaction(userId: string, postId: string, commentId: string, emoji: string) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.postId !== postId) throw new NotFoundError('Comment not found');

    await prisma.commentReaction.deleteMany({ where: { commentId, userId, emoji } });

    return prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        reactions: { select: { id: true, userId: true, emoji: true } },
        _count: { select: { replies: true } },
      },
    });
  },

  // ── Bookmarks ────────────────────────────────────────────────────────────────

  async bookmark(userId: string, postId: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');

    await prisma.bookmark.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
  },

  async unbookmark(userId: string, postId: string) {
    await prisma.bookmark.deleteMany({ where: { userId, postId } });
  },

  async getBookmarks(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.bookmark.findMany({
      where: { userId, post: { isDeleted: false } },
      take: limit + 1,
      ...(cursor && { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            author: { select: AUTHOR_SELECT },
            _count: { select: { reactions: true, comments: true } },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((b) => b.post),
      nextCursor: hasMore ? items[items.length - 1].postId : null,
      hasMore,
    };
  },
};
