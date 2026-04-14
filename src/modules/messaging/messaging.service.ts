import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../shared/utils/errors';
import type { CreateConversationDto, SendMessageDto } from './messaging.validation';
import { MessageType, ParticipantRole } from '@prisma/client';
import { notificationsService } from '../notifications/notifications.service';

const DEFAULT_LIMIT = 30;
const ONLINE_PREFIX = 'user:online:';
const ONLINE_TTL = 60; // seconds

const SENDER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  isVerified: true,
  lastSeen: true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertParticipant(conversationId: string, userId: string) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!p) throw new ForbiddenError('You are not a member of this conversation');
  return p;
}

async function assertAdmin(conversationId: string, userId: string) {
  const p = await assertParticipant(conversationId, userId);
  if (p.role !== ParticipantRole.ADMIN) throw new ForbiddenError('Admin access required');
  return p;
}

// ── Conversations ──────────────────────────────────────────────────────────────

export const messagingService = {
  async createOrGetDM(userId: string, participantId: string) {
    if (userId === participantId) throw new BadRequestError('Cannot DM yourself');

    const other = await prisma.user.findUnique({ where: { id: participantId } });
    if (!other || !other.isActive) throw new NotFoundError('User not found');

    // Shared include shape — used for both the existing-DM lookup and the new create
    // so the response shape is always identical.
    const DM_INCLUDE = {
      participants: { include: { user: { select: SENDER_SELECT } } },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' } as const,
        include: { sender: { select: SENDER_SELECT } },
      },
    } as const;

    // Check for existing DM conversation between these two users.
    // Use AND [some, some] instead of every:{in:[...]} — more semantically correct
    // and avoids the Prisma vacuous-truth edge case on empty participant sets.
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DM',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: participantId } } },
        ],
      },
      include: DM_INCLUDE,
    });

    if (existing) return existing;

    return prisma.conversation.create({
      data: {
        type: 'DM',
        participants: {
          create: [
            { userId, role: ParticipantRole.ADMIN },
            { userId: participantId, role: ParticipantRole.ADMIN },
          ],
        },
      },
      include: DM_INCLUDE,
    });
  },

  async createGroup(userId: string, dto: Extract<CreateConversationDto, { type: 'GROUP' }>) {
    const participantIds = [...new Set([userId, ...dto.participantIds])];

    const users = await prisma.user.findMany({
      where: { id: { in: participantIds }, isActive: true },
      select: { id: true },
    });
    if (users.length !== participantIds.length) throw new NotFoundError('One or more users not found');

    return prisma.conversation.create({
      data: {
        type: 'GROUP',
        name: dto.name,
        description: dto.description,
        participants: {
          create: participantIds.map((id) => ({
            userId: id,
            role: id === userId ? ParticipantRole.ADMIN : ParticipantRole.MEMBER,
          })),
        },
      },
      include: {
        participants: { include: { user: { select: SENDER_SELECT } } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  },

  async listConversations(userId: string) {
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, isArchived: false, conversation: { type: { not: 'MARKETPLACE' } } },
      orderBy: { conversation: { updatedAt: 'desc' } },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: SENDER_SELECT } },
            },
            messages: {
              where: { isDeleted: false },
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: { select: SENDER_SELECT } },
            },
          },
        },
      },
    });

    return Promise.all(
      participations.map(async (p) => {
        const { conversation } = p;
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            isDeleted: false,
            createdAt: { gt: p.lastReadAt ?? new Date(0) },
            senderId: { not: userId },
          },
        });
        return {
          ...p,
          conversation: { ...conversation, unreadCount },
        };
      }),
    );
  },

  async getConversation(userId: string, conversationId: string) {
    await assertParticipant(conversationId, userId);

    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: SENDER_SELECT } },
        },
        messages: {
          where: { isDeleted: false },
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: SENDER_SELECT } },
        },
      },
    });
  },

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: { name?: string; description?: string; picture?: string },
  ) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'GROUP') throw new BadRequestError('Can only update group conversations');
    await assertAdmin(conversationId, userId);

    return prisma.conversation.update({
      where: { id: conversationId },
      data: dto,
      include: { participants: { include: { user: { select: SENDER_SELECT } } } },
    });
  },

  async updateParticipantSettings(
    userId: string,
    conversationId: string,
    settings: { isArchived?: boolean; isPinned?: boolean; isMuted?: boolean; mutedUntil?: string; markAsUnread?: boolean },
  ) {
    await assertParticipant(conversationId, userId);

    const { markAsUnread, ...rest } = settings;

    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: {
        ...rest,
        mutedUntil: rest.mutedUntil ? new Date(rest.mutedUntil) : undefined,
        // markAsUnread=true resets lastReadAt to null so all messages appear unread
        ...(markAsUnread === true && { lastReadAt: null }),
      },
    });
  },

  async clearConversationMessages(userId: string, conversationId: string) {
    await assertParticipant(conversationId, userId);

    // Soft-delete all messages for this user by pushing their userId into deletedFor
    // Prisma updateMany with array push on Postgres arrays
    await prisma.$executeRaw`
      UPDATE "Message"
      SET "deletedFor" = array_append("deletedFor", ${userId}::text)
      WHERE "conversationId" = ${conversationId}
        AND NOT (${userId}::text = ANY("deletedFor"))
    `;

    // Update lastReadAt so unread count resets to 0
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  },

  async addParticipants(userId: string, conversationId: string, userIds: string[]) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'GROUP') throw new BadRequestError('Can only add participants to groups');
    await assertAdmin(conversationId, userId);

    const existing = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { in: userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((p) => p.userId));
    const newIds = userIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) throw new ConflictError('All users are already participants');

    await prisma.conversationParticipant.createMany({
      data: newIds.map((uid) => ({ conversationId, userId: uid })),
    });
  },

  async removeParticipant(userId: string, conversationId: string, targetUserId: string) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'GROUP') throw new BadRequestError('Can only remove from groups');

    if (userId !== targetUserId) {
      // Only admins can remove others
      await assertAdmin(conversationId, userId);
    }

    await prisma.conversationParticipant.deleteMany({
      where: { conversationId, userId: targetUserId },
    });
  },

  // ── Messages ─────────────────────────────────────────────────────────────────

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    await assertParticipant(conversationId, userId);

    if (dto.replyToId) {
      const parent = await prisma.message.findUnique({ where: { id: dto.replyToId } });
      if (!parent || parent.conversationId !== conversationId) {
        throw new BadRequestError('Invalid replyToId');
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: dto.content,
        type: dto.type as MessageType,
        mediaUrl: dto.mediaUrl,
        replyToId: dto.replyToId,
        storyId: dto.storyId,
      },
      include: {
        sender: { select: SENDER_SELECT },
        replyTo: {
          select: { id: true, content: true, sender: { select: SENDER_SELECT } },
        },
      },
    });

    // Bump conversation updatedAt for ordering
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Mark as read for sender
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    // Notify other participants of DM
    const otherParticipants = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const dmContent = dto.content
      ? (dto.content.length > 60 ? dto.content.slice(0, 60) + '…' : dto.content)
      : 'sent you a message';
    for (const p of otherParticipants) {
      void notificationsService.create({
        recipientId: p.userId,
        actorId: userId,
        type: 'DM_RECEIVED',
        entityType: 'Conversation',
        entityId: conversationId,
        content: dmContent,
      });
    }

    return message;
  },

  async listArchivedConversations(userId: string) {
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, isArchived: true, conversation: { type: { not: 'MARKETPLACE' } } },
      orderBy: { conversation: { updatedAt: 'desc' } },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: SENDER_SELECT } },
            },
            messages: {
              where: { isDeleted: false },
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: { select: SENDER_SELECT } },
            },
          },
        },
      },
    });

    return Promise.all(
      participations.map(async (p) => {
        const { conversation } = p;
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            isDeleted: false,
            createdAt: { gt: p.lastReadAt ?? new Date(0) },
            senderId: { not: userId },
          },
        });
        return { ...p, conversation: { ...conversation, unreadCount } };
      }),
    );
  },

  async lockMessage(userId: string, conversationId: string, messageId: string) {
    await assertParticipant(conversationId, userId);
    const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, senderId: true, isDeleted: true, lockedFor: true } });
    if (!message || message.conversationId !== conversationId) throw new NotFoundError('Message not found');
    if (message.senderId === userId) throw new BadRequestError('Cannot lock your own message');
    if (message.isDeleted) throw new BadRequestError('Cannot lock a message that has already been deleted');
    if (message.lockedFor.includes(userId)) return; // already locked

    return prisma.message.update({
      where: { id: messageId },
      data: { lockedFor: { push: userId } },
      select: { id: true, lockedFor: true },
    });
  },

  async unlockMessage(userId: string, conversationId: string, messageId: string) {
    await assertParticipant(conversationId, userId);
    const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, lockedFor: true } });
    if (!message || message.conversationId !== conversationId) throw new NotFoundError('Message not found');

    await prisma.message.update({
      where: { id: messageId },
      data: { lockedFor: message.lockedFor.filter((id) => id !== userId) },
    });
  },

  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    await assertParticipant(conversationId, userId);

    const rows = await prisma.message.findMany({
      where: {
        conversationId,
        // Show non-deleted messages OR deleted messages the viewer has locked in
        OR: [
          { isDeleted: false },
          { isDeleted: true, lockedFor: { has: userId } },
        ],
        NOT: { deletedFor: { has: userId } },
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: SENDER_SELECT },
        replyTo: {
          select: { id: true, content: true, sender: { select: SENDER_SELECT } },
        },
        reads: { select: { userId: true, readAt: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async searchMessages(
    userId: string,
    conversationId: string,
    q: string,
    cursor?: string,
    limit = 20,
  ) {
    await assertParticipant(conversationId, userId);
    if (!q.trim()) return { items: [], nextCursor: null, hasMore: false };

    const rows = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { isDeleted: false },
          { isDeleted: true, lockedFor: { has: userId } },
        ],
        NOT: { deletedFor: { has: userId } },
        content: { contains: q.trim(), mode: 'insensitive' },
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: SENDER_SELECT } },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async editMessage(userId: string, conversationId: string, messageId: string, content: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError('Message not found');
    }
    if (message.senderId !== userId) throw new ForbiddenError('Cannot edit this message');
    if (message.isDeleted) throw new BadRequestError('Cannot edit a deleted message');
    if (message.type !== MessageType.TEXT) throw new BadRequestError('Can only edit text messages');

    return prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: { sender: { select: SENDER_SELECT } },
    });
  },

  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    deleteFor: 'me' | 'all',
  ): Promise<{ lockedFor: string[] }> {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError('Message not found');
    }

    if (deleteFor === 'all') {
      if (message.senderId !== userId) throw new ForbiddenError('Cannot delete this message for everyone');

      // 24-hour window: delete-for-everyone only allowed within 24 hrs of sending
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (message.createdAt < cutoff) {
        throw new ForbiddenError('You can only delete for everyone within 24 hours of sending');
      }

      // Set isDeleted but DO NOT null content/mediaUrl — users who locked the message
      // still need to see the original content.
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { isDeleted: true },
        select: { lockedFor: true },
      });
      return { lockedFor: updated.lockedFor };
    } else {
      // Delete for me only — add userId to deletedFor array
      await prisma.message.update({
        where: { id: messageId },
        data: { deletedFor: { push: userId } },
      });
      return { lockedFor: [] };
    }
  },

  async markMessagesRead(userId: string, conversationId: string, messageIds: string[]) {
    await assertParticipant(conversationId, userId);

    await prisma.messageRead.createMany({
      data: messageIds.map((messageId) => ({ messageId, userId })),
      skipDuplicates: true,
    });

    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    return { read: messageIds.length };
  },

  // ── Reactions ─────────────────────────────────────────────────────────────────

  async reactToMessage(userId: string, conversationId: string, messageId: string, emoji: string) {
    await assertParticipant(conversationId, userId);

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) throw new NotFoundError('Message not found');
    if (message.isDeleted) throw new BadRequestError('Cannot react to a deleted message');

    await prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });

    return prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: SENDER_SELECT },
        reactions: { include: { user: { select: SENDER_SELECT } } },
      },
    });
  },

  async removeMessageReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
    await assertParticipant(conversationId, userId);

    await prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    return prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: SENDER_SELECT },
        reactions: { include: { user: { select: SENDER_SELECT } } },
      },
    });
  },

  // ── Pin Message ───────────────────────────────────────────────────────────────

  async pinMessage(userId: string, conversationId: string, messageId: string, isPinned: boolean) {
    await assertParticipant(conversationId, userId);

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) throw new NotFoundError('Message not found');
    if (message.isDeleted) throw new BadRequestError('Cannot pin a deleted message');

    return prisma.message.update({
      where: { id: messageId },
      data: { isPinned },
      include: {
        sender: { select: SENDER_SELECT },
        reactions: { include: { user: { select: SENDER_SELECT } } },
      },
    });
  },

  // ── Online Presence ───────────────────────────────────────────────────────────

  async setOnline(userId: string) {
    await redis.setex(`${ONLINE_PREFIX}${userId}`, ONLINE_TTL, '1');
  },

  async setOffline(userId: string) {
    await redis.del(`${ONLINE_PREFIX}${userId}`);
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    });
  },

  async isOnline(userId: string): Promise<boolean> {
    const result = await redis.exists(`${ONLINE_PREFIX}${userId}`);
    return result === 1;
  },

  async refreshOnline(userId: string) {
    await redis.expire(`${ONLINE_PREFIX}${userId}`, ONLINE_TTL);
  },
};
