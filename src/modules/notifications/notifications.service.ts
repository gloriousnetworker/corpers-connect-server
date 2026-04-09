import { prisma } from '../../config/prisma';
import { fcm } from '../../config/firebase';
import { NotFoundError, ForbiddenError } from '../../shared/utils/errors';
import { NotificationType } from '@prisma/client';
import type { ListNotificationsDto } from './notifications.validation';

// Try to get the messaging namespace; may be null during tests / before init
function tryGetMessagingNs() {
  try {
    const { getMessagingNamespace } = require('../../config/socket');
    return getMessagingNamespace();
  } catch {
    return null;
  }
}

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
  content?: string;
}

export const notificationsService = {
  // ── Create (internal — called fire-and-forget from other services) ───────────

  async create(input: CreateNotificationInput) {
    // Do not notify yourself
    if (input.actorId && input.actorId === input.recipientId) return;

    const notification = await prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        actorId: input.actorId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        content: input.content,
      },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, profilePicture: true },
        },
      },
    });

    // Emit real-time event to recipient's personal room
    const io = tryGetMessagingNs();
    if (io) {
      io.to(`user:${input.recipientId}`).emit('notification:new', notification);
    }

    // Send FCM push notification
    void notificationsService.sendPush(input.recipientId, notification);

    return notification;
  },

  // ── FCM Push ──────────────────────────────────────────────────────────────────

  async sendPush(
    recipientId: string,
    notification: {
      type: NotificationType;
      content?: string | null;
      entityType?: string | null;
      entityId?: string | null;
      actorId?: string | null;
      actor?: { firstName: string; lastName: string } | null;
    },
  ) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { fcmTokens: true },
      });
      if (!user || user.fcmTokens.length === 0) return;

      const title = buildPushTitle(notification);
      const body = notification.content ?? title;
      const url = buildDeepLinkUrl(notification.entityType, notification.entityId);

      // Absolute URL for the deep link (needed by webpush.fcmOptions.link)
      const clientUrl = (process.env.CLIENT_URL ?? '').replace(/\/$/, '');
      const absoluteUrl = url.startsWith('http') ? url : `${clientUrl}${url}`;

      // Deduplication tag — collapses multiple notifications from same source
      const notifTag = notification.entityId
        ? `cc-${notification.type}-${notification.entityId}`
        : 'corpers-connect';

      const batchResponse = await fcm.sendEachForMulticast({
        tokens: user.fcmTokens,

        // Data-only payload — no root `notification` field.
        // This ensures onBackgroundMessage() in the service worker is the SOLE
        // notification renderer on every platform (iOS, Android, desktop Chrome).
        // Sending a notification payload causes the browser to auto-show AND
        // onBackgroundMessage to also fire, producing duplicates.
        data: {
          title,
          body,
          type:       notification.type,
          entityType: notification.entityType ?? '',
          entityId:   notification.entityId   ?? '',
          actorId:    notification.actorId    ?? '',
          url,
          tag:        notifTag,
          icon:       `${clientUrl}/icons/icon-192x192.png`,
          badge:      `${clientUrl}/icons/icon-72x72.png`,
        },

        webpush: {
          // No webpush.notification — keep it data-only so onBackgroundMessage fires
          fcmOptions: {
            link: absoluteUrl || clientUrl || '/',
          },
          headers: {
            Urgency: 'high',
          },
        },
      });

      // Prune tokens that FCM has invalidated (unregistered or expired)
      const staleTokens: string[] = [];
      batchResponse.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            staleTokens.push(user.fcmTokens[idx]);
          } else {
            console.warn('[FCM] sendPush error for token', idx, resp.error.code, resp.error.message);
          }
        }
      });

      if (staleTokens.length > 0) {
        const remaining = user.fcmTokens.filter((t) => !staleTokens.includes(t));
        await prisma.user.update({
          where: { id: recipientId },
          data: { fcmTokens: remaining },
        });
      }
    } catch (err) {
      console.error('[FCM] sendPush failed:', err);
    }
  },

  // ── List ─────────────────────────────────────────────────────────────────────

  async getNotifications(userId: string, dto: ListNotificationsDto) {
    const { cursor, limit, unreadOnly } = dto;

    const rows = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, profilePicture: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  // ── Unread count ─────────────────────────────────────────────────────────────

  async getUnreadCount(userId: string) {
    const count = await prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { count };
  },

  // ── Mark read ────────────────────────────────────────────────────────────────

  async markRead(userId: string, notificationIds: string[]) {
    // Verify ownership
    const owned = await prisma.notification.count({
      where: { id: { in: notificationIds }, recipientId: userId },
    });
    if (owned !== notificationIds.length) throw new ForbiddenError('Access denied');

    const { count } = await prisma.notification.updateMany({
      where: { id: { in: notificationIds }, recipientId: userId },
      data: { isRead: true },
    });
    return { updated: count };
  },

  async markAllRead(userId: string) {
    const { count } = await prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: count };
  },

  // ── Delete ───────────────────────────────────────────────────────────────────

  async deleteNotification(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif) throw new NotFoundError('Notification not found');
    if (notif.recipientId !== userId) throw new ForbiddenError('Access denied');
    await prisma.notification.delete({ where: { id: notificationId } });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDeepLinkUrl(entityType?: string | null, entityId?: string | null): string {
  if (entityType === 'Post' && entityId) return `/post/${entityId}`;
  if (entityType === 'Conversation' && entityId) return `/?conv=${entityId}`;
  if (entityType === 'MarketplaceConversation' && entityId) return `/?mkt-conv=${entityId}`;
  if (entityType === 'SellerProfile' || entityType === 'SellerApplication') return '/?tab=marketplace';
  if (entityType === 'MarketplaceListing' && entityId) return `/?listing=${entityId}`;
  return '/';
}

function buildPushTitle(notification: {
  type: NotificationType;
  actor?: { firstName: string; lastName: string } | null;
}): string {
  const name = notification.actor
    ? `${notification.actor.firstName} ${notification.actor.lastName}`
    : 'Someone';

  const map: Record<string, string> = {
    FOLLOW: `${name} followed you`,
    POST_LIKE: `${name} liked your post`,
    POST_COMMENT: `${name} commented on your post`,
    COMMENT_REPLY: `${name} replied to your comment`,
    MENTION: `${name} mentioned you`,
    DM_RECEIVED: `New message from ${name}`,
    CALL_MISSED: `Missed call from ${name}`,
    STORY_VIEW: `${name} viewed your story`,
    MARKET_INQUIRY: `New inquiry on your listing`,
    LISTING_APPROVED: 'Your listing has been approved',
    LISTING_REJECTED: 'Your listing was rejected',
    LEVEL_UP: 'Congratulations! You levelled up',
    SYSTEM: 'New system notification',
    BROADCAST: 'New announcement',
    SELLER_APPROVED: "You're now a Mami Marketer!",
    SELLER_REJECTED: 'Mami Marketer application update',
    SELLER_DEACTIVATED: 'Your Mami Market profile has been deactivated',
    LISTING_COMMENT: `${name} commented on your listing`,
    MARKETPLACE_MESSAGE: 'New marketplace message',
  };
  return map[notification.type] ?? 'New notification';
}
