import { Server as SocketServer } from 'socket.io';
import { prisma } from '../../config/prisma';
import { messagingService } from './messaging.service';
import type { AuthenticatedSocket } from '../../config/socket';
import { socketRateLimit } from '../../shared/utils/socketRateLimiter';

export function registerMessagingHandlers(io: SocketServer) {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    console.info(`🔌 Socket connected: userId=${userId} socketId=${socket.id}`);

    // Join personal room for notifications
    void socket.join(`user:${userId}`);

    // Mark user online in Redis
    try {
      await messagingService.setOnline(userId);
    } catch {
      // Non-fatal
    }

    // Auto-join all conversation rooms this user belongs to
    try {
      const participations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      for (const { conversationId } of participations) {
        void socket.join(`conversation:${conversationId}`);
      }
    } catch {
      // Non-fatal
    }

    // Broadcast online status to contacts
    socket.broadcast.emit('user:online', { userId });

    // ── Event Handlers ──────────────────────────────────────────────────────

    /** Join a conversation room (called after creating a new conversation) */
    socket.on('conversation:join', (conversationId: string) => {
      void socket.join(`conversation:${conversationId}`);
    });

    /** Leave a conversation room */
    socket.on('conversation:leave', (conversationId: string) => {
      void socket.leave(`conversation:${conversationId}`);
    });

    /** Typing indicators — max 20 events per 10 s to prevent indicator spam */
    socket.on('typing:start', async ({ conversationId }: { conversationId: string }) => {
      const rl = await socketRateLimit(userId, 'typing', 20, 10);
      if (!rl.allowed) return; // silently drop — no need to error the client for typing
      socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId });
    });

    socket.on('typing:stop', async ({ conversationId }: { conversationId: string }) => {
      const rl = await socketRateLimit(userId, 'typing', 20, 10);
      if (!rl.allowed) return;
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId });
    });

    /** Real-time message send — persists to DB and broadcasts to room */
    // Rate limit: 30 messages per minute per user.
    socket.on(
      'message:send',
      async (
        data: {
          conversationId: string;
          content?: string;
          type?: string;
          mediaUrl?: string;
          replyToId?: string;
        },
        ack?: (result: { success: boolean; message?: unknown; error?: string }) => void,
      ) => {
        const rl = await socketRateLimit(userId, 'message:send', 30, 60);
        if (!rl.allowed) {
          if (ack) ack({ success: false, error: `Rate limit exceeded. Retry in ${rl.retryAfter}s.` });
          socket.emit('rate_limited', { event: 'message:send', retryAfter: rl.retryAfter });
          return;
        }

        try {
          const message = await messagingService.sendMessage(userId, data.conversationId, {
            content: data.content,
            type: (data.type ?? 'TEXT') as never,
            mediaUrl: data.mediaUrl,
            replyToId: data.replyToId,
          });

          // Broadcast to all participants in the room
          io.to(`conversation:${data.conversationId}`).emit('message:new', message);

          if (ack) ack({ success: true, message });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to send message';
          if (ack) ack({ success: false, error });
        }
      },
    );

    /** Mark messages as read */
    socket.on(
      'message:read',
      async (data: { conversationId: string; messageIds: string[] }) => {
        try {
          await messagingService.markMessagesRead(userId, data.conversationId, data.messageIds);
          socket
            .to(`conversation:${data.conversationId}`)
            .emit('message:read', { conversationId: data.conversationId, userId, messageIds: data.messageIds });
        } catch {
          // Non-fatal
        }
      },
    );

    /** Keep-alive ping to refresh online TTL */
    socket.on('ping:online', async () => {
      try {
        await messagingService.refreshOnline(userId);
      } catch {
        // Non-fatal
      }
    });

    // ── Disconnect ──────────────────────────────────────────────────────────

    socket.on('disconnect', async (reason) => {
      console.info(`🔌 Socket disconnected: userId=${userId} reason=${reason}`);

      // If no other sockets for this user, mark offline
      const sockets = await io.fetchSockets();
      const stillConnected = sockets.some(
        (s) => (s as unknown as AuthenticatedSocket).data?.userId === userId,
      );

      if (!stillConnected) {
        try {
          await messagingService.setOffline(userId);
          io.emit('user:offline', { userId });
        } catch {
          // Non-fatal
        }
      }
    });
  });
}
