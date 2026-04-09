import { Request, Response, NextFunction } from 'express';
import { messagingService } from './messaging.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { getIO } from '../../config/socket';
import {
  createConversationSchema,
  updateConversationSchema,
  updateParticipantSettingsSchema,
  sendMessageSchema,
  editMessageSchema,
  addParticipantsSchema,
  messageReactionSchema,
  pinMessageSchema,
} from './messaging.validation';
import { paginationSchema } from '../posts/posts.validation';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const messagingController = {
  // ── Conversations ────────────────────────────────────────────────────────────

  async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = createConversationSchema.parse(req.body);
      let data;
      if (dto.type === 'DM') {
        data = await messagingService.createOrGetDM(req.user!.id, dto.participantId);
      } else {
        data = await messagingService.createGroup(req.user!.id, dto);
      }
      sendSuccess(res, data, 'Conversation ready', 201);
    } catch (err) {
      next(err);
    }
  },

  async listConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await messagingService.listConversations(req.user!.id);
      sendSuccess(res, data, 'Conversations retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await messagingService.getConversation(req.user!.id, p(req.params.conversationId));
      sendSuccess(res, data, 'Conversation retrieved');
    } catch (err) {
      next(err);
    }
  },

  async updateConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updateConversationSchema.parse(req.body);
      const data = await messagingService.updateConversation(
        req.user!.id,
        p(req.params.conversationId),
        dto,
      );
      sendSuccess(res, data, 'Conversation updated');
    } catch (err) {
      next(err);
    }
  },

  async updateMySettings(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updateParticipantSettingsSchema.parse(req.body);
      const data = await messagingService.updateParticipantSettings(
        req.user!.id,
        p(req.params.conversationId),
        dto,
      );
      sendSuccess(res, data, 'Settings updated');
    } catch (err) {
      next(err);
    }
  },

  async addParticipants(req: Request, res: Response, next: NextFunction) {
    try {
      const { userIds } = addParticipantsSchema.parse(req.body);
      await messagingService.addParticipants(req.user!.id, p(req.params.conversationId), userIds);
      sendSuccess(res, null, 'Participants added');
    } catch (err) {
      next(err);
    }
  },

  async removeParticipant(req: Request, res: Response, next: NextFunction) {
    try {
      await messagingService.removeParticipant(
        req.user!.id,
        p(req.params.conversationId),
        p(req.params.userId),
      );
      sendSuccess(res, null, 'Participant removed');
    } catch (err) {
      next(err);
    }
  },

  async leaveConversation(req: Request, res: Response, next: NextFunction) {
    try {
      await messagingService.removeParticipant(
        req.user!.id,
        p(req.params.conversationId),
        req.user!.id,
      );
      sendSuccess(res, null, 'Left conversation');
    } catch (err) {
      next(err);
    }
  },

  // ── Messages ─────────────────────────────────────────────────────────────────

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = sendMessageSchema.parse(req.body);
      const conversationId = p(req.params.conversationId);
      const data = await messagingService.sendMessage(req.user!.id, conversationId, dto);

      // Push to all participants in real-time (including the sender's other devices)
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:new', data);
      } catch {
        // Non-fatal — REST response already returned the message
      }

      sendSuccess(res, data, 'Message sent', 201);
    } catch (err) {
      next(err);
    }
  },

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await messagingService.getMessages(
        req.user!.id,
        p(req.params.conversationId),
        cursor,
        limit,
      );
      sendSuccess(res, data, 'Messages retrieved');
    } catch (err) {
      next(err);
    }
  },

  async searchMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 50) : 20;
      const data = await messagingService.searchMessages(
        req.user!.id,
        p(req.params.conversationId),
        q,
        cursor,
        limit,
      );
      sendSuccess(res, data, 'Messages found');
    } catch (err) {
      next(err);
    }
  },

  async editMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { content } = editMessageSchema.parse(req.body);
      const conversationId = p(req.params.conversationId);
      const data = await messagingService.editMessage(
        req.user!.id,
        conversationId,
        p(req.params.messageId),
        content,
      );
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:edited', data);
      } catch { /* non-fatal */ }
      sendSuccess(res, data, 'Message updated');
    } catch (err) {
      next(err);
    }
  },

  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const conversationId = p(req.params.conversationId);
      const messageId = p(req.params.messageId);
      const deleteFor = (req.query.for === 'all' ? 'all' : 'me') as 'me' | 'all';
      await messagingService.deleteMessage(req.user!.id, conversationId, messageId, deleteFor);
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:deleted', { messageId, deleteFor, conversationId });
      } catch { /* non-fatal */ }
      sendSuccess(res, null, 'Message deleted');
    } catch (err) {
      next(err);
    }
  },

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { messageIds } = req.body as { messageIds: string[] };
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ message: 'messageIds array is required' });
        return;
      }
      const data = await messagingService.markMessagesRead(
        req.user!.id,
        p(req.params.conversationId),
        messageIds,
      );
      sendSuccess(res, data, 'Messages marked as read');
    } catch (err) {
      next(err);
    }
  },

  async clearMessages(req: Request, res: Response, next: NextFunction) {
    try {
      await messagingService.clearConversationMessages(
        req.user!.id,
        p(req.params.conversationId),
      );
      sendSuccess(res, null, 'Chat cleared');
    } catch (err) {
      next(err);
    }
  },

  // ── Reactions ─────────────────────────────────────────────────────────────────

  async reactToMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { emoji } = messageReactionSchema.parse(req.body);
      const conversationId = p(req.params.conversationId);
      const messageId = p(req.params.messageId);
      const data = await messagingService.reactToMessage(req.user!.id, conversationId, messageId, emoji);
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:react', { messageId, conversationId, message: data });
      } catch { /* non-fatal */ }
      sendSuccess(res, data, 'Reaction added');
    } catch (err) {
      next(err);
    }
  },

  async removeMessageReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { emoji } = messageReactionSchema.parse(req.body);
      const conversationId = p(req.params.conversationId);
      const messageId = p(req.params.messageId);
      const data = await messagingService.removeMessageReaction(req.user!.id, conversationId, messageId, emoji);
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:react', { messageId, conversationId, message: data });
      } catch { /* non-fatal */ }
      sendSuccess(res, data, 'Reaction removed');
    } catch (err) {
      next(err);
    }
  },

  // ── Pin ───────────────────────────────────────────────────────────────────────

  async pinMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { isPinned } = pinMessageSchema.parse(req.body);
      const conversationId = p(req.params.conversationId);
      const messageId = p(req.params.messageId);
      const data = await messagingService.pinMessage(req.user!.id, conversationId, messageId, isPinned);
      try {
        getIO().to(`conversation:${conversationId}`).emit('message:pinned', { messageId, conversationId, isPinned, message: data });
      } catch { /* non-fatal */ }
      sendSuccess(res, data, isPinned ? 'Message pinned' : 'Message unpinned');
    } catch (err) {
      next(err);
    }
  },
};
