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

// ── Hashtag helpers ───────────────────────────────────────────────────────────

function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#([a-zA-Z][a-zA-Z0-9_]{0,49})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

async function syncHashtags(postId: string, content: string | null | undefined): Promise<void> {
  const tags = extractHashtags(content);
  if (!tags.length) return;

  // Upsert each hashtag (increment counter)
  await Promise.all(
    tags.map((tag) =>
      prisma.hashtag.upsert({
        where: { tag },
        create: { tag, postCount: 1 },
        update: { postCount: { increment: 1 } },
      }),
    ),
  );

  const hashtags = await prisma.hashtag.findMany({
    where: { tag: { in: tags } },
    select: { id: true },
  });

  await prisma.postHashtag.createMany({
    data: hashtags.map((h) => ({ postId, hashtagId: h.id })),
    skipDuplicates: true,
  });
}

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

// Batch-fetch tagged users and attach to each post. Call on any list of posts
// that carry `taggedUserIds: string[]` so the client gets name+avatar+verified
// for each tag in one round-trip.
export async function enrichPostsWithTaggedUsers<
  T extends { taggedUserIds: string[] }
>(posts: T[]): Promise<(T & { taggedUsers: Array<{ id: string; firstName: string; lastName: string; profilePicture: string | null; isVerified: boolean }> })[]> {
  const allIds = Array.from(new Set(posts.flatMap((p) => p.taggedUserIds ?? [])));
  if (allIds.length === 0) {
    return posts.map((p) => ({ ...p, taggedUsers: [] }));
  }
  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));
  return posts.map((p) => ({
    ...p,
    taggedUsers: (p.taggedUserIds ?? [])
      .map((id) => map.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u),
  }));
}

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
    // De-dupe and drop self-tags — a user can't meaningfully tag themselves
    const taggedUserIds = Array.from(new Set(dto.taggedUserIds ?? [])).filter(
      (id) => id !== userId,
    );

    const post = await prisma.post.create({
      data: {
        authorId: userId,
        content: dto.content,
        mediaUrls: dto.mediaUrls ?? [],
        taggedUserIds,
        visibility: dto.visibility as PostVisibility,
        postType: dto.postType as 'REGULAR' | 'REEL' | 'OPPORTUNITY',
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    // Fire-and-forget hashtag extraction
    void syncHashtags(post.id, dto.content);

    // Fire-and-forget MENTION notifications for tagged users
    for (const taggedId of taggedUserIds) {
      void notificationsService.create({
        recipientId: taggedId,
        actorId: userId,
        type: 'MENTION',
        entityType: 'Post',
        entityId: post.id,
        content: 'tagged you in a post',
      });
    }

    const [enriched] = await enrichPostsWithTaggedUsers([post]);
    return enriched;
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
    const [enriched] = await enrichPostsWithTaggedUsers([{ ...rest, author: safeAuthor }]);
    return { ...enriched, myReaction };
  },

  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await prisma.post.findUnique({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundError('Post not found');
    if (post.authorId !== userId) throw new ForbiddenError('Not your post');

    const ageMs = Date.now() - post.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS)
      throw new BadRequestError('Post can only be edited within 15 minutes of creation');

    // Compute any newly-added tags so we can notify them
    const nextTagged = dto.taggedUserIds
      ? Array.from(new Set(dto.taggedUserIds)).filter((id) => id !== userId)
      : undefined;
    const newlyTagged = nextTagged
      ? nextTagged.filter((id) => !post.taggedUserIds.includes(id))
      : [];

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        ...dto,
        ...(nextTagged && { taggedUserIds: nextTagged }),
        visibility: dto.visibility as PostVisibility | undefined,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    for (const taggedId of newlyTagged) {
      void notificationsService.create({
        recipientId: taggedId,
        actorId: userId,
        type: 'MENTION',
        entityType: 'Post',
        entityId: postId,
        content: 'tagged you in a post',
      });
    }

    const [enriched] = await enrichPostsWithTaggedUsers([updated]);
    return enriched;
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
    const enrichedItems = await enrichPostsWithTaggedUsers(items);
    return { items: enrichedItems, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
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
    const posts = items.map((b) => b.post);
    const enrichedPosts = await enrichPostsWithTaggedUsers(posts);
    return {
      items: enrichedPosts,
      nextCursor: hasMore ? items[items.length - 1].postId : null,
      hasMore,
    };
  },

  // ── Hashtag feed ─────────────────────────────────────────────────────────────

  async getHashtagPosts(
    requesterId: string | undefined,
    tag: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    const normalised = tag.toLowerCase().replace(/^#/, '');
    const hashtag = await prisma.hashtag.findUnique({ where: { tag: normalised } });
    if (!hashtag) return { items: [], nextCursor: null, tag: normalised, postCount: 0 };

    const blockedIds = requesterId ? await getBlockedIds(requesterId) : [];

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        visibility: PostVisibility.PUBLIC,
        authorId: { notIn: blockedIds },
        hashtags: { some: { hashtagId: hashtag.id } },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
        ...(requesterId
          ? { reactions: { where: { userId: requesterId }, select: { reactionType: true } } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const pageItems = posts.slice(0, limit);

    const enriched = await enrichPostsWithTaggedUsers(pageItems);
    return {
      items: enriched.map((p) => {
        const myReaction =
          requesterId && (p as { reactions?: { reactionType: ReactionType }[] }).reactions?.[0]
            ? (p as { reactions: { reactionType: ReactionType }[] }).reactions[0].reactionType
            : null;
        const { reactions: _r, ...rest } = p as typeof p & { reactions?: unknown };
        return { ...rest, myReaction };
      }),
      nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null,
      tag: normalised,
      postCount: hashtag.postCount,
    };
  },

  // ── Trending ─────────────────────────────────────────────────────────────────

  async getTrendingPosts(requesterId: string | undefined, limit = 20) {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const blockedIds = requesterId ? await getBlockedIds(requesterId) : [];

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        visibility: PostVisibility.PUBLIC,
        createdAt: { gte: since },
        authorId: { notIn: blockedIds },
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { reactions: true, comments: true } },
        ...(requesterId
          ? { reactions: { where: { userId: requesterId }, select: { reactionType: true } } }
          : {}),
      },
      take: limit * 4, // fetch more, re-rank in memory
    });

    // Score: reactions×2 + comments + shares×3; secondary sort = newest
    posts.sort((a, b) => {
      const scoreA = a._count.reactions * 2 + a._count.comments + a.sharesCount * 3;
      const scoreB = b._count.reactions * 2 + b._count.comments + b.sharesCount * 3;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const enriched = await enrichPostsWithTaggedUsers(posts.slice(0, limit));
    return enriched.map((p) => {
      const myReaction =
        requesterId && (p as { reactions?: { reactionType: ReactionType }[] }).reactions?.[0]
          ? (p as { reactions: { reactionType: ReactionType }[] }).reactions[0].reactionType
          : null;
      const { reactions: _r, ...rest } = p as typeof p & { reactions?: unknown };
      return { ...rest, myReaction };
    });
  },

  async getTrendingHashtags(limit = 15) {
    return prisma.hashtag.findMany({
      where: { postCount: { gt: 0 } },
      orderBy: { postCount: 'desc' },
      take: limit,
      select: { id: true, tag: true, postCount: true },
    });
  },
};
