/**
 * Unit tests for notificationsService — Prisma and Firebase are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../config/firebase', () => ({
  fcm: {
    sendEachForMulticast: jest.fn().mockResolvedValue({ responses: [] }),
  },
}));

// Mock socket.io — getIO throws during unit tests (server not running)
jest.mock('../../config/socket', () => ({
  getIO: jest.fn().mockImplementation(() => {
    throw new Error('Socket not initialised');
  }),
}));

import { notificationsService } from '../../modules/notifications/notifications.service';
import { prisma } from '../../config/prisma';
import { fcm } from '../../config/firebase';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFcm = fcm as jest.Mocked<typeof fcm>;

// ── Test Data ─────────────────────────────────────────────────────────────────

const RECIPIENT = 'user-recipient';
const ACTOR = 'user-actor';
const NOTIF_ID = 'notif-1';

const mockNotification = {
  id: NOTIF_ID,
  recipientId: RECIPIENT,
  actorId: ACTOR,
  type: 'FOLLOW' as const,
  entityType: 'User',
  entityId: ACTOR,
  content: null,
  isRead: false,
  createdAt: new Date(),
  actor: { id: ACTOR, firstName: 'Test', lastName: 'Actor', profilePicture: null },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('notificationsService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a notification and attempts push', async () => {
    (mockPrisma.notification.create as jest.Mock).mockResolvedValue(mockNotification);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ fcmTokens: [] });

    await notificationsService.create({
      recipientId: RECIPIENT,
      actorId: ACTOR,
      type: 'FOLLOW',
      entityType: 'User',
      entityId: ACTOR,
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('does not create notification when actor === recipient', async () => {
    await notificationsService.create({
      recipientId: ACTOR,
      actorId: ACTOR,
      type: 'POST_LIKE',
    });

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('notificationsService.sendPush', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends multicast push when user has FCM tokens', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ fcmTokens: ['token-abc'] });
    (mockFcm.sendEachForMulticast as jest.Mock).mockResolvedValue({ responses: [{ success: true }] });

    await notificationsService.sendPush(RECIPIENT, mockNotification);

    expect(mockFcm.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['token-abc'] }),
    );
  });

  it('skips push when user has no FCM tokens', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ fcmTokens: [] });

    await notificationsService.sendPush(RECIPIENT, mockNotification);

    expect(mockFcm.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('does not throw on FCM error', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ fcmTokens: ['tok'] });
    (mockFcm.sendEachForMulticast as jest.Mock).mockRejectedValue(new Error('FCM error'));

    await expect(notificationsService.sendPush(RECIPIENT, mockNotification)).resolves.not.toThrow();
  });
});

describe('notificationsService.getNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated notifications', async () => {
    (mockPrisma.notification.findMany as jest.Mock).mockResolvedValue([mockNotification]);

    const result = await notificationsService.getNotifications(RECIPIENT, {
      limit: 20,
      unreadOnly: false,
    });

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('filters by unreadOnly', async () => {
    (mockPrisma.notification.findMany as jest.Mock).mockResolvedValue([]);

    const result = await notificationsService.getNotifications(RECIPIENT, {
      limit: 20,
      unreadOnly: true,
    });

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isRead: false }),
      }),
    );
    expect(result.items).toHaveLength(0);
  });
});

describe('notificationsService.getUnreadCount', () => {
  it('returns count of unread notifications', async () => {
    (mockPrisma.notification.count as jest.Mock).mockResolvedValue(5);

    const result = await notificationsService.getUnreadCount(RECIPIENT);
    expect(result).toEqual({ count: 5 });
  });
});

describe('notificationsService.markRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks notifications as read', async () => {
    (mockPrisma.notification.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await notificationsService.markRead(RECIPIENT, [NOTIF_ID, 'notif-2']);
    expect(result).toEqual({ updated: 2 });
  });

  it('throws 403 if notif does not belong to user', async () => {
    // Count returns fewer than requested → ownership check fails
    (mockPrisma.notification.count as jest.Mock).mockResolvedValue(0);

    await expect(notificationsService.markRead(RECIPIENT, [NOTIF_ID])).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('notificationsService.markAllRead', () => {
  it('marks all unread as read', async () => {
    (mockPrisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const result = await notificationsService.markAllRead(RECIPIENT);
    expect(result).toEqual({ updated: 3 });
  });
});

describe('notificationsService.deleteNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes a notification owned by user', async () => {
    (mockPrisma.notification.findUnique as jest.Mock).mockResolvedValue({
      id: NOTIF_ID,
      recipientId: RECIPIENT,
    });
    (mockPrisma.notification.delete as jest.Mock).mockResolvedValue({});

    await notificationsService.deleteNotification(RECIPIENT, NOTIF_ID);
    expect(mockPrisma.notification.delete).toHaveBeenCalledTimes(1);
  });

  it('throws 404 if notification does not exist', async () => {
    (mockPrisma.notification.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      notificationsService.deleteNotification(RECIPIENT, NOTIF_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 if notification belongs to different user', async () => {
    (mockPrisma.notification.findUnique as jest.Mock).mockResolvedValue({
      id: NOTIF_ID,
      recipientId: 'someone-else',
    });

    await expect(
      notificationsService.deleteNotification(RECIPIENT, NOTIF_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
