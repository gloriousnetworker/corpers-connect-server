/**
 * Unit tests for messagingService — Prisma and Redis are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    messageRead: {
      createMany: jest.fn(),
    },
    messageReaction: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    connect: jest.fn(),
    quit: jest.fn(),
  },
  redisHelpers: {
    setex: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(false),
    del: jest.fn(),
  },
}));

import { messagingService } from '../../modules/messaging/messaging.service';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redis as jest.Mocked<typeof redis>;

// ── Test Data ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';
const CONV_ID = 'conv-1';
const MSG_ID = 'msg-1';

const mockParticipant = { conversationId: CONV_ID, userId: USER_A, role: 'ADMIN' };
const mockConversation = {
  id: CONV_ID,
  type: 'DM',
  name: null,
  participants: [],
  messages: [],
};
const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_A,
  content: 'Hello!',
  type: 'TEXT',
  isDeleted: false,
  sender: { id: USER_A, firstName: 'Test', lastName: 'User', profilePicture: null, isVerified: false },
  replyTo: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('messagingService.createOrGetDM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws BadRequestError when DMing yourself', async () => {
    await expect(messagingService.createOrGetDM(USER_A, USER_A)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot DM yourself',
    });
  });

  it('returns existing DM if found', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_B, isActive: true });
    (mockPrisma.conversation.findFirst as jest.Mock).mockResolvedValue(mockConversation);

    const result = await messagingService.createOrGetDM(USER_A, USER_B);
    expect(result).toEqual(mockConversation);
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it('creates a new DM if none exists', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_B, isActive: true });
    (mockPrisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.conversation.create as jest.Mock).mockResolvedValue(mockConversation);

    const result = await messagingService.createOrGetDM(USER_A, USER_B);
    expect(result).toEqual(mockConversation);
    expect(mockPrisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('throws 404 if target user not found', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(messagingService.createOrGetDM(USER_A, USER_B)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('messagingService.sendMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a text message successfully', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.create as jest.Mock).mockResolvedValue(mockMessage);
    (mockPrisma.conversation.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.conversationParticipant.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.conversationParticipant.findMany as jest.Mock).mockResolvedValue([]);

    const result = await messagingService.sendMessage(USER_A, CONV_ID, {
      content: 'Hello!',
      type: 'TEXT' as never,
    });
    expect(result.content).toBe('Hello!');
  });

  it('throws 403 if user is not a participant', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      messagingService.sendMessage(USER_A, CONV_ID, { content: 'Hi', type: 'TEXT' as never }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 if replyToId is invalid', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      messagingService.sendMessage(USER_A, CONV_ID, {
        content: 'Reply',
        type: 'TEXT' as never,
        replyToId: 'nonexistent',
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid replyToId' });
  });
});

describe('messagingService.editMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('edits a text message', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
    (mockPrisma.message.update as jest.Mock).mockResolvedValue({ ...mockMessage, content: 'Edited', isEdited: true });

    const result = await messagingService.editMessage(USER_A, CONV_ID, MSG_ID, 'Edited');
    expect(result.isEdited).toBe(true);
  });

  it('throws 403 if not sender', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, senderId: USER_B });

    await expect(
      messagingService.editMessage(USER_A, CONV_ID, MSG_ID, 'Hack'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 for non-text message', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, type: 'IMAGE' });

    await expect(
      messagingService.editMessage(USER_A, CONV_ID, MSG_ID, 'Edit image?'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('messagingService.deleteMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes for all when sender requests it', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
    (mockPrisma.message.update as jest.Mock).mockResolvedValue({});

    await messagingService.deleteMessage(USER_A, CONV_ID, MSG_ID, 'all');
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDeleted: true, content: null, mediaUrl: null } }),
    );
  });

  it('throws 403 when non-sender tries delete-for-all', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, senderId: USER_B });

    await expect(
      messagingService.deleteMessage(USER_A, CONV_ID, MSG_ID, 'all'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('delete-for-me adds userId to deletedFor array', async () => {
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
    (mockPrisma.message.update as jest.Mock).mockResolvedValue({});

    await messagingService.deleteMessage(USER_A, CONV_ID, MSG_ID, 'me');
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedFor: { push: USER_A } } }),
    );
  });
});

describe('messagingService online presence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('setOnline calls redis.setex', async () => {
    await messagingService.setOnline(USER_A);
    expect(mockRedis.setex).toHaveBeenCalledWith(`user:online:${USER_A}`, 60, '1');
  });

  it('setOffline calls redis.del', async () => {
    await messagingService.setOffline(USER_A);
    expect(mockRedis.del).toHaveBeenCalledWith(`user:online:${USER_A}`);
  });

  it('isOnline returns false when key absent', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValue(0);
    const result = await messagingService.isOnline(USER_A);
    expect(result).toBe(false);
  });

  it('isOnline returns true when key present', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    const result = await messagingService.isOnline(USER_A);
    expect(result).toBe(true);
  });
});

describe('messagingService.markMessagesRead', () => {
  it('creates read records and updates lastReadAt', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.messageRead.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.conversationParticipant.update as jest.Mock).mockResolvedValue({});

    const result = await messagingService.markMessagesRead(USER_A, CONV_ID, ['m1', 'm2']);
    expect(result).toEqual({ read: 2 });
    expect(mockPrisma.messageRead.createMany).toHaveBeenCalledTimes(1);
  });
});

// ── Reactions ─────────────────────────────────────────────────────────────────

describe('messagingService.reactToMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts a reaction and returns updated message', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockMessage)  // assertion check
      .mockResolvedValueOnce({ ...mockMessage, reactions: [{ id: 'r1', emoji: '👍', userId: USER_A }] }); // return value
    (mockPrisma.messageReaction.upsert as jest.Mock).mockResolvedValue({});

    const result = await messagingService.reactToMessage(USER_A, CONV_ID, MSG_ID, '👍');
    expect(mockPrisma.messageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ emoji: '👍', userId: USER_A }) }),
    );
    expect(result).toBeDefined();
  });

  it('throws 404 if message not in this conversation', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, conversationId: 'other-conv' });

    await expect(
      messagingService.reactToMessage(USER_A, CONV_ID, MSG_ID, '👍'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 if message is deleted', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, isDeleted: true });

    await expect(
      messagingService.reactToMessage(USER_A, CONV_ID, MSG_ID, '👍'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 403 if user is not a participant', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      messagingService.reactToMessage(USER_A, CONV_ID, MSG_ID, '👍'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('messagingService.removeMessageReaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the reaction and returns updated message', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.messageReaction.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, reactions: [] });

    const result = await messagingService.removeMessageReaction(USER_A, CONV_ID, MSG_ID, '👍');
    expect(mockPrisma.messageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: MSG_ID, userId: USER_A, emoji: '👍' },
    });
    expect(result).toBeDefined();
  });
});

// ── Pin Message ───────────────────────────────────────────────────────────────

describe('messagingService.pinMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets isPinned to true on a message', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
    (mockPrisma.message.update as jest.Mock).mockResolvedValue({ ...mockMessage, isPinned: true });

    const result = await messagingService.pinMessage(USER_A, CONV_ID, MSG_ID, true);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPinned: true } }),
    );
    expect(result).toMatchObject({ isPinned: true });
  });

  it('sets isPinned to false (unpin)', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, isPinned: true });
    (mockPrisma.message.update as jest.Mock).mockResolvedValue({ ...mockMessage, isPinned: false });

    const result = await messagingService.pinMessage(USER_A, CONV_ID, MSG_ID, false);
    expect(result).toMatchObject({ isPinned: false });
  });

  it('throws 404 if message is in a different conversation', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, conversationId: 'other' });

    await expect(
      messagingService.pinMessage(USER_A, CONV_ID, MSG_ID, true),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 if message is deleted', async () => {
    (mockPrisma.conversationParticipant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (mockPrisma.message.findUnique as jest.Mock).mockResolvedValue({ ...mockMessage, isDeleted: true });

    await expect(
      messagingService.pinMessage(USER_A, CONV_ID, MSG_ID, true),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
