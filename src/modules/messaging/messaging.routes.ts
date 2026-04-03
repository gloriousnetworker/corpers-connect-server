import { Router } from 'express';
import { messagingController } from './messaging.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

// All messaging routes require authentication
router.use(authenticate);

// ── Conversations ─────────────────────────────────────────────────────────────

/** POST /api/v1/conversations
 *  Create a DM (idempotent — returns existing if found) or GROUP conversation.
 *  Body: { type: 'DM', participantId } | { type: 'GROUP', name, participantIds[], description? }
 */
router.post('/', messagingController.createConversation);

/** GET /api/v1/conversations
 *  List authenticated user's conversations (excluding archived), ordered by latest activity.
 *  Each includes last message + unread count.
 */
router.get('/', messagingController.listConversations);

/** GET /api/v1/conversations/:conversationId
 *  Get a single conversation with participants and last message.
 */
router.get('/:conversationId', messagingController.getConversation);

/** PATCH /api/v1/conversations/:conversationId
 *  Update group name / description / picture. Admin only.
 *  Body: { name?, description?, picture? }
 */
router.patch('/:conversationId', messagingController.updateConversation);

/** PATCH /api/v1/conversations/:conversationId/settings
 *  Update my participation settings (archive, pin, mute).
 *  Body: { isArchived?, isPinned?, isMuted?, mutedUntil? }
 */
router.patch('/:conversationId/settings', messagingController.updateMySettings);

/** POST /api/v1/conversations/:conversationId/participants
 *  Add participants to a group. Admin only.
 *  Body: { userIds: string[] }
 */
router.post('/:conversationId/participants', messagingController.addParticipants);

/** DELETE /api/v1/conversations/:conversationId/participants/me
 *  Leave a group conversation.
 */
router.delete('/:conversationId/participants/me', messagingController.leaveConversation);

/** DELETE /api/v1/conversations/:conversationId/participants/:userId
 *  Remove a participant from a group. Admin only.
 */
router.delete('/:conversationId/participants/:userId', messagingController.removeParticipant);

// ── Messages ──────────────────────────────────────────────────────────────────

/** POST /api/v1/conversations/:conversationId/messages
 *  Send a message. Body: { content?, type?, mediaUrl?, replyToId? }
 */
router.post('/:conversationId/messages', messagingController.sendMessage);

/** GET /api/v1/conversations/:conversationId/messages/search
 *  Full-text search within a conversation. Query: ?q=&cursor=&limit=20
 */
router.get('/:conversationId/messages/search', messagingController.searchMessages);

/** GET /api/v1/conversations/:conversationId/messages
 *  Paginated message history (newest first). Query: ?cursor=&limit=30
 */
router.get('/:conversationId/messages', messagingController.getMessages);

/** PATCH /api/v1/conversations/:conversationId/messages/:messageId
 *  Edit a text message. Sender only. Body: { content }
 */
router.patch('/:conversationId/messages/:messageId', messagingController.editMessage);

/** DELETE /api/v1/conversations/:conversationId/messages/:messageId
 *  Delete a message. Query: ?for=me|all (default: me, 'all' requires being sender)
 */
router.delete('/:conversationId/messages/:messageId', messagingController.deleteMessage);

/** POST /api/v1/conversations/:conversationId/read
 *  Mark messages as read. Body: { messageIds: string[] }
 */
router.post('/:conversationId/read', messagingController.markRead);

/** POST /api/v1/conversations/:conversationId/messages/:messageId/reactions
 *  Add an emoji reaction to a message. Body: { emoji }
 */
router.post('/:conversationId/messages/:messageId/reactions', messagingController.reactToMessage);

/** DELETE /api/v1/conversations/:conversationId/messages/:messageId/reactions
 *  Remove an emoji reaction from a message. Body: { emoji }
 */
router.delete('/:conversationId/messages/:messageId/reactions', messagingController.removeMessageReaction);

/** PATCH /api/v1/conversations/:conversationId/messages/:messageId/pin
 *  Pin or unpin a message. Body: { isPinned: boolean }
 */
router.patch('/:conversationId/messages/:messageId/pin', messagingController.pinMessage);

export default router;
