import { prisma } from '../../config/prisma';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../shared/utils/errors';
import { addDays } from 'date-fns';
import { destroyCloudinaryAsset } from '../../shared/middleware/upload.middleware';
import { notificationsService } from '../notifications/notifications.service';
import { messagingService } from '../messaging/messaging.service';

const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  isVerified: true,
} as const;

export const storiesService = {
  async createStory(
    userId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    caption?: string,
  ) {
    return prisma.story.create({
      data: {
        authorId: userId,
        mediaUrl,
        mediaType,
        caption,
        expiresAt: addDays(new Date(), 1), // 24 hours
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
  },

  // Stories from followed users (grouped by author, active only)
  async getStories(userId: string) {
    const followedIds = await prisma.follow
      .findMany({ where: { followerId: userId }, select: { followingId: true } })
      .then((rows) => rows.map((r) => r.followingId));

    const blockedIds = await prisma.block
      .findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      .then((rows) => rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));

    // Include own stories too
    const authorIds = [...new Set([userId, ...followedIds])].filter(
      (id) => !blockedIds.includes(id),
    );

    const stories = await prisma.story.findMany({
      where: {
        authorId: { in: authorIds },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: AUTHOR_SELECT },
        views: { where: { viewerId: userId }, select: { viewerId: true } },
        reactions: { where: { userId }, select: { emoji: true } },
        _count: { select: { views: true, reactions: true } },
      },
    });

    // Group by author
    const grouped = new Map<string, typeof stories>();
    for (const story of stories) {
      const existing = grouped.get(story.authorId) ?? [];
      existing.push(story);
      grouped.set(story.authorId, existing);
    }

    return Array.from(grouped.entries()).map(([authorId, authorStories]) => ({
      author: authorStories[0].author,
      authorId,
      stories: authorStories.map((s) => ({
        ...s,
        viewed: s.views.length > 0,
        views: undefined,
        hasReacted: s.reactions.length > 0,
        reactionsCount: s._count.reactions,
        reactions: undefined,
      })),
      hasUnviewed: authorStories.some((s) => s.views.length === 0),
    }));
  },

  async viewStory(viewerId: string, storyId: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: { author: { select: AUTHOR_SELECT }, _count: { select: { views: true } } },
    });
    if (!story) throw new NotFoundError('Story not found');
    if (story.expiresAt < new Date()) throw new NotFoundError('Story has expired');

    // Log view (upsert — idempotent)
    await prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });

    // Notify story author (only on first view — idempotent handled by notification create)
    if (story.authorId !== viewerId) {
      void notificationsService.create({
        recipientId: story.authorId,
        actorId: viewerId,
        type: 'STORY_VIEW',
        entityType: 'Story',
        entityId: storyId,
      });
    }

    return story;
  },

  async deleteStory(userId: string, storyId: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundError('Story not found');
    if (story.authorId !== userId) throw new ForbiddenError('Not your story');
    await prisma.story.delete({ where: { id: storyId } });
    // Clean up story media from Cloudinary (fire-and-forget)
    void destroyCloudinaryAsset(story.mediaUrl);
  },

  async addHighlight(userId: string, storyId: string, title?: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundError('Story not found');
    if (story.authorId !== userId) throw new ForbiddenError('Not your story');

    await prisma.storyHighlight.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId, title },
      update: { title },
    });
  },

  async removeHighlight(userId: string, storyId: string) {
    await prisma.storyHighlight.deleteMany({ where: { userId, storyId } });
  },

  async getUserHighlights(targetUserId: string) {
    const highlights = await prisma.storyHighlight.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        story: {
          select: { id: true, mediaUrl: true, mediaType: true, caption: true, createdAt: true },
        },
      },
    });
    return highlights;
  },

  // ── React to story (toggle) ──────────────────────────────────────────────
  async reactToStory(userId: string, storyId: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundError('Story not found');
    if (story.expiresAt < new Date()) throw new NotFoundError('Story has expired');
    if (story.authorId === userId) throw new BadRequestError('Cannot react to your own story');

    // Toggle — delete if exists, create if not
    const existing = await prisma.storyReaction.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    if (existing) {
      await prisma.storyReaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }

    await prisma.storyReaction.create({
      data: { storyId, userId, emoji: '❤️' },
    });

    // Notify story author
    void notificationsService.create({
      recipientId: story.authorId,
      actorId: userId,
      type: 'STORY_VIEW', // reuse type — notification text differentiates
      entityType: 'Story',
      entityId: storyId,
      content: 'reacted ❤️ to your story',
    });

    return { reacted: true };
  },

  // ── Reply to story (sends as DM) ────────────────────────────────────────
  async replyToStory(userId: string, storyId: string, content: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (!story) throw new NotFoundError('Story not found');
    if (story.expiresAt < new Date()) throw new NotFoundError('Story has expired');
    if (story.authorId === userId) throw new BadRequestError('Cannot reply to your own story');
    if (!content.trim()) throw new BadRequestError('Reply cannot be empty');

    // Create or get DM conversation with story author
    const conversation = await messagingService.createOrGetDM(userId, story.authorId);

    // Send message with story context
    const message = await messagingService.sendMessage(userId, conversation.id, {
      content: content.trim(),
      type: 'TEXT',
    });

    return { conversationId: conversation.id, message };
  },

  // ── Get viewers + reactors (own stories only) ──────────────────────────
  async getStoryViewers(userId: string, storyId: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundError('Story not found');
    if (story.authorId !== userId) throw new ForbiddenError('Not your story');

    const [viewers, reactions] = await Promise.all([
      prisma.storyView.findMany({
        where: { storyId },
        orderBy: { viewedAt: 'desc' },
        include: {
          viewer: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        },
      }),
      prisma.storyReaction.findMany({
        where: { storyId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        },
      }),
    ]);

    const reactorIds = new Set(reactions.map((r) => r.userId));

    return {
      viewCount: viewers.length,
      reactionsCount: reactions.length,
      viewers: viewers.map((v) => ({
        ...v.viewer,
        viewedAt: v.viewedAt,
        hasReacted: reactorIds.has(v.viewerId),
      })),
    };
  },
};
