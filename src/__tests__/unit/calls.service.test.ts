/**
 * Unit tests for callsService — Prisma, agora-access-token, and notifications are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    callLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    block: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('agora-access-token', () => ({
  RtcTokenBuilder: {
    buildTokenWithUid: jest.fn(() => 'mock-agora-token'),
  },
  RtcRole: { PUBLISHER: 1 },
}));

jest.mock('../../modules/notifications/notifications.service', () => ({
  notificationsService: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

import { callsService } from '../../modules/calls/calls.service';
import { prisma } from '../../config/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Test Data ─────────────────────────────────────────────────────────────────

const CALLER_ID = 'user-caller';
const RECEIVER_ID = 'user-receiver';
const CALL_ID = 'call-1';
const CHANNEL = 'call-abc123';

const mockCall = {
  id: CALL_ID,
  callerId: CALLER_ID,
  receiverId: RECEIVER_ID,
  type: 'VOICE',
  status: 'RINGING',
  agoraChannelName: CHANNEL,
  startedAt: null,
  endedAt: null,
  duration: null,
  createdAt: new Date(),
  caller: { id: CALLER_ID, firstName: 'Test', lastName: 'Caller', profilePicture: null, isVerified: false },
  receiver: { id: RECEIVER_ID, firstName: 'Test', lastName: 'Receiver', profilePicture: null, isVerified: false },
};

// ── initiateCall ──────────────────────────────────────────────────────────────

describe('callsService.initiateCall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a call log and returns tokens', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: RECEIVER_ID, isActive: true });
    (mockPrisma.block.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.callLog.create as jest.Mock).mockResolvedValue(mockCall);

    const result = await callsService.initiateCall(CALLER_ID, { receiverId: RECEIVER_ID, type: 'VOICE' });

    expect(result.callLog.id).toBe(CALL_ID);
    expect(result.callerToken).toBeTruthy();
    expect(result.receiverToken).toBeTruthy();
    expect(result.channelName).toBe(CHANNEL);
    expect(mockPrisma.callLog.create).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when calling yourself', async () => {
    await expect(
      callsService.initiateCall(CALLER_ID, { receiverId: CALLER_ID, type: 'VOICE' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when receiver does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      callsService.initiateCall(CALLER_ID, { receiverId: RECEIVER_ID, type: 'VOICE' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when blocked', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: RECEIVER_ID, isActive: true });
    (mockPrisma.block.findFirst as jest.Mock).mockResolvedValue({ blockerId: CALLER_ID, blockedId: RECEIVER_ID });

    await expect(
      callsService.initiateCall(CALLER_ID, { receiverId: RECEIVER_ID, type: 'VOICE' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── acceptCall ────────────────────────────────────────────────────────────────

describe('callsService.acceptCall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('transitions RINGING → ACTIVE and returns a token', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);
    (mockPrisma.callLog.update as jest.Mock).mockResolvedValue({
      ...mockCall,
      status: 'ACTIVE',
      startedAt: new Date(),
    });

    const result = await callsService.acceptCall(CALL_ID, RECEIVER_ID);
    expect(result.callLog.status).toBe('ACTIVE');
    expect(result.token).toBeTruthy();
  });

  it('throws 403 when not the receiver', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);

    await expect(callsService.acceptCall(CALL_ID, CALLER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when call is not RINGING', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue({ ...mockCall, status: 'ENDED' });

    await expect(callsService.acceptCall(CALL_ID, RECEIVER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── rejectCall ────────────────────────────────────────────────────────────────

describe('callsService.rejectCall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('transitions RINGING → REJECTED', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);
    (mockPrisma.callLog.update as jest.Mock).mockResolvedValue({ ...mockCall, status: 'REJECTED' });

    const result = await callsService.rejectCall(CALL_ID, RECEIVER_ID);
    expect(result.status).toBe('REJECTED');
  });

  it('throws 403 when not the receiver', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);

    await expect(callsService.rejectCall(CALL_ID, CALLER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── endCall ───────────────────────────────────────────────────────────────────

describe('callsService.endCall', () => {
  beforeEach(() => jest.clearAllMocks());

  const activeCall = { ...mockCall, status: 'ACTIVE', startedAt: new Date(Date.now() - 30000) };

  it('either party can end the call and duration is computed', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(activeCall);
    (mockPrisma.callLog.update as jest.Mock).mockImplementation((args) =>
      Promise.resolve({ ...activeCall, status: 'ENDED', endedAt: new Date(), duration: args.data.duration }),
    );

    const result = await callsService.endCall(CALL_ID, CALLER_ID);
    expect(result.status).toBe('ENDED');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('throws 403 for non-participant', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(activeCall);

    await expect(callsService.endCall(CALL_ID, 'stranger-id')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when already ended', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue({ ...mockCall, status: 'ENDED' });

    await expect(callsService.endCall(CALL_ID, CALLER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── missCall ──────────────────────────────────────────────────────────────────

describe('callsService.missCall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('transitions RINGING → MISSED and fires notification', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);
    (mockPrisma.callLog.update as jest.Mock).mockResolvedValue({ ...mockCall, status: 'MISSED' });

    const result = await callsService.missCall(CALL_ID);
    expect(result.status).toBe('MISSED');
  });

  it('returns the call unchanged if already resolved', async () => {
    const endedCall = { ...mockCall, status: 'ENDED' };
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(endedCall);

    const result = await callsService.missCall(CALL_ID);
    expect(result.status).toBe('ENDED'); // unchanged
    expect(mockPrisma.callLog.update).not.toHaveBeenCalled();
  });
});

// ── getCallHistory ────────────────────────────────────────────────────────────

describe('callsService.getCallHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated call history', async () => {
    (mockPrisma.callLog.findMany as jest.Mock).mockResolvedValue([mockCall]);

    const result = await callsService.getCallHistory(CALLER_ID, { limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items[0].id).toBe(CALL_ID);
    expect(result.hasMore).toBe(false);
  });

  it('detects hasMore when rows exceed limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...mockCall, id: `call-${i}` }));
    (mockPrisma.callLog.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await callsService.getCallHistory(CALLER_ID, { limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});

// ── getCall ───────────────────────────────────────────────────────────────────

describe('callsService.getCall', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the call for a participant', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);

    const result = await callsService.getCall(CALL_ID, CALLER_ID);
    expect(result.id).toBe(CALL_ID);
  });

  it('throws 403 for non-participant', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(mockCall);

    await expect(callsService.getCall(CALL_ID, 'outsider')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 for non-existent call', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(callsService.getCall(CALL_ID, CALLER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── refreshToken ──────────────────────────────────────────────────────────────

describe('callsService.refreshToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns fresh token for active call participant', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue({ ...mockCall, status: 'ACTIVE' });

    const result = await callsService.refreshToken(CALL_ID, CALLER_ID);
    expect(result.token).toBeTruthy();
    expect(result.channelName).toBe(CHANNEL);
  });

  it('throws 400 for ended call', async () => {
    (mockPrisma.callLog.findUnique as jest.Mock).mockResolvedValue({ ...mockCall, status: 'ENDED' });

    await expect(callsService.refreshToken(CALL_ID, CALLER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});
