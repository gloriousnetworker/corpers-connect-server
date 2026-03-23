import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _userCounter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const id = ++_userCounter;
  const hash = await bcrypt.hash('Test@1234', 10);
  return prisma.user.create({
    data: {
      email: `calls-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Call',
      lastName: 'User',
      stateCode: `LA/24C/${id}`,
      servingState: 'Lagos',
      batch: 'Batch A',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

function makeToken(userId: string) {
  return jwt.sign(
    { sub: userId, email: 'calls@example.com', role: 'USER', jti: `calls-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

async function createCallLog(
  callerId: string,
  receiverId: string,
  status = 'RINGING',
  startedAt?: Date,
) {
  return prisma.callLog.create({
    data: {
      callerId,
      receiverId,
      type: 'VOICE',
      status: status as never,
      agoraChannelName: `call-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: startedAt ?? null,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /api/v1/calls — Initiate ─────────────────────────────────────────────

describe('POST /api/v1/calls', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/calls').send({ receiverId: 'x', type: 'VOICE' });
    expect(res.status).toBe(401);
  });

  it('initiates a call and returns tokens', async () => {
    const caller = await createUser();
    const receiver = await createUser();

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`)
      .send({ receiverId: receiver.id, type: 'VOICE' });

    expect(res.status).toBe(201);
    expect(res.body.data.callLog.status).toBe('RINGING');
    expect(res.body.data.callerToken).toBeTruthy();
    expect(res.body.data.receiverToken).toBeTruthy();
    expect(res.body.data.channelName).toBeTruthy();
  });

  it('initiates a VIDEO call', async () => {
    const caller = await createUser();
    const receiver = await createUser();

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`)
      .send({ receiverId: receiver.id, type: 'VIDEO' });

    expect(res.status).toBe(201);
    expect(res.body.data.callLog.type).toBe('VIDEO');
  });

  it('returns 400 when calling yourself', async () => {
    const caller = await createUser();

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`)
      .send({ receiverId: caller.id, type: 'VOICE' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent receiver', async () => {
    const caller = await createUser();

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`)
      .send({ receiverId: 'nonexistent-id', type: 'VOICE' });

    expect(res.status).toBe(404);
  });

  it('returns 422 for missing receiverId', async () => {
    const caller = await createUser();

    const res = await request(app)
      .post('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`)
      .send({ type: 'VOICE' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/calls — History ───────────────────────────────────────────────

describe('GET /api/v1/calls', () => {
  it('returns paginated call history', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .get('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('includes calls where user is the receiver', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .get('/api/v1/calls')
      .set('Authorization', `Bearer ${makeToken(receiver.id)}`);

    expect(res.status).toBe(200);
    const callIds = (res.body.data.items as { receiverId: string }[]).map((c) => c.receiverId);
    expect(callIds).toContain(receiver.id);
  });

  it('filters by type', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    await prisma.callLog.create({
      data: { callerId: caller.id, receiverId: receiver.id, type: 'VIDEO', status: 'ENDED', agoraChannelName: `ch-${Date.now()}` },
    });

    const res = await request(app)
      .get('/api/v1/calls?type=VOICE')
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    const types = (res.body.data.items as { type: string }[]).map((c) => c.type);
    expect(types.every((t) => t === 'VOICE')).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/calls');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/calls/:callId ─────────────────────────────────────────────────

describe('GET /api/v1/calls/:callId', () => {
  it('returns a call for a participant', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .get(`/api/v1/calls/${call.id}`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(call.id);
  });

  it('returns 403 for non-participant', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const outsider = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .get(`/api/v1/calls/${call.id}`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent call', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/v1/calls/nonexistent-call-id')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/calls/:callId/accept ───────────────────────────────────────

describe('PATCH /api/v1/calls/:callId/accept', () => {
  it('receiver can accept a ringing call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/accept`)
      .set('Authorization', `Bearer ${makeToken(receiver.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.callLog.status).toBe('ACTIVE');
    expect(res.body.data.token).toBeTruthy();
  });

  it('returns 403 when caller tries to accept', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/accept`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(403);
  });

  it('returns 400 when call is not RINGING', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ENDED');

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/accept`)
      .set('Authorization', `Bearer ${makeToken(receiver.id)}`);

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/calls/:callId/reject ───────────────────────────────────────

describe('PATCH /api/v1/calls/:callId/reject', () => {
  it('receiver can reject a ringing call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/reject`)
      .set('Authorization', `Bearer ${makeToken(receiver.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('returns 403 when caller tries to reject', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/reject`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/v1/calls/:callId/end ──────────────────────────────────────────

describe('PATCH /api/v1/calls/:callId/end', () => {
  it('caller can end an active call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ACTIVE', new Date(Date.now() - 5000));

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/end`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ENDED');
    expect(res.body.data.duration).toBeGreaterThanOrEqual(0);
  });

  it('receiver can also end the call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ACTIVE', new Date(Date.now() - 5000));

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/end`)
      .set('Authorization', `Bearer ${makeToken(receiver.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ENDED');
  });

  it('returns 400 for already-ended call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ENDED');

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/end`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/calls/:callId/miss ─────────────────────────────────────────

describe('PATCH /api/v1/calls/:callId/miss', () => {
  it('marks a ringing call as missed', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id);

    const res = await request(app)
      .patch(`/api/v1/calls/${call.id}/miss`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('MISSED');
  });
});

// ── GET /api/v1/calls/:callId/token ──────────────────────────────────────────

describe('GET /api/v1/calls/:callId/token', () => {
  it('returns a fresh token for an active call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ACTIVE', new Date());

    const res = await request(app)
      .get(`/api/v1/calls/${call.id}/token`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.channelName).toBeTruthy();
  });

  it('returns 400 for ended call', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ENDED');

    const res = await request(app)
      .get(`/api/v1/calls/${call.id}/token`)
      .set('Authorization', `Bearer ${makeToken(caller.id)}`);

    expect(res.status).toBe(400);
  });

  it('returns 403 for non-participant', async () => {
    const caller = await createUser();
    const receiver = await createUser();
    const outsider = await createUser();
    const call = await createCallLog(caller.id, receiver.id, 'ACTIVE', new Date());

    const res = await request(app)
      .get(`/api/v1/calls/${call.id}/token`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`);

    expect(res.status).toBe(403);
  });
});
