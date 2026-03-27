import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ── Helpers ──────────────────────────────────────────────────────────────────

let userCounter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash('Test@1234', 10);
  const id = ++userCounter;
  return prisma.user.create({
    data: {
      email: `msg-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Msg',
      lastName: 'User',
      stateCode: `LA/24A/MSG${id}`,
      servingState: 'Lagos',
      batch: 'Batch A',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

function makeToken(userId: string, email = 'msg@example.com') {
  return jwt.sign(
    { sub: userId, email, role: 'USER', jti: `msg-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Create Conversation ───────────────────────────────────────────────────────

describe('POST /api/v1/conversations', () => {
  let userA: { id: string };
  let userB: { id: string };
  let tokenA: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createUser(), createUser()]);
    tokenA = makeToken(userA.id);
  });

  it('creates a DM conversation', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('DM');
    expect(res.body.data.participants).toHaveLength(2);
  });

  it('is idempotent — returns existing DM on second call', async () => {
    const res1 = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });

    const res2 = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });

    expect(res1.body.data.id).toBe(res2.body.data.id);
  });

  it('rejects DM with yourself', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userA.id });

    expect(res.status).toBe(400);
  });

  it('creates a GROUP conversation', async () => {
    const userC = await createUser();
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'GROUP',
        name: 'Test Group',
        participantIds: [userB.id, userC.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('GROUP');
    expect(res.body.data.participants.length).toBeGreaterThanOrEqual(3);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .send({ type: 'DM', participantId: userB.id });

    expect(res.status).toBe(401);
  });
});

// ── List Conversations ────────────────────────────────────────────────────────

describe('GET /api/v1/conversations', () => {
  it('returns list of conversations with unread count', async () => {
    const [userA, userB] = await Promise.all([createUser(), createUser()]);
    const tokenA = makeToken(userA.id);

    // Create a DM
    await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });

    const res = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].conversation).toHaveProperty('unreadCount');
  });
});

// ── Messages ──────────────────────────────────────────────────────────────────

describe('Messages in a conversation', () => {
  let userA: { id: string };
  let userB: { id: string };
  let tokenA: string;
  let tokenB: string;
  let conversationId: string;
  let messageId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createUser(), createUser()]);
    tokenA = makeToken(userA.id);
    tokenB = makeToken(userB.id);

    const convRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });

    conversationId = convRes.body.data.id;
  });

  it('sends a message', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Hello from A!', type: 'TEXT' });

    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('Hello from A!');
    messageId = res.body.data.id;
  });

  it('rejects message with no content and no mediaUrl', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'TEXT' });

    expect(res.status).toBe(422);
  });

  it('gets message history (paginated, newest first)', async () => {
    const res = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('forbids non-participant from fetching messages', async () => {
    const outsider = await createUser();
    const outsiderToken = makeToken(outsider.id);

    const res = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  it('sends a reply to a message', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'Reply from B!', type: 'TEXT', replyToId: messageId });

    expect(res.status).toBe(201);
    expect(res.body.data.replyTo.id).toBe(messageId);
  });

  it('edits a text message', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Edited message' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Edited message');
    expect(res.body.data.isEdited).toBe(true);
  });

  it('forbids editing another user\'s message', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'Hack edit' });

    expect(res.status).toBe(403);
  });

  it('marks messages as read', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ messageIds: [messageId] });

    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(1);
  });

  it('deletes message for me', async () => {
    const res = await request(app)
      .delete(`/api/v1/conversations/${conversationId}/messages/${messageId}?for=me`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
  });
});

// ── Group Conversation ────────────────────────────────────────────────────────

describe('Group conversation management', () => {
  let admin: { id: string };
  let member: { id: string };
  let adminToken: string;
  let memberToken: string;
  let groupId: string;

  beforeAll(async () => {
    [admin, member] = await Promise.all([createUser(), createUser()]);
    adminToken = makeToken(admin.id);
    memberToken = makeToken(member.id);

    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'GROUP', name: 'Corpers Unit', participantIds: [member.id] });

    groupId = res.body.data.id;
  });

  it('admin can update group name', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${groupId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Group Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Group Name');
  });

  it('member cannot update group name', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${groupId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Hack Name' });

    expect(res.status).toBe(403);
  });

  it('admin can add participants', async () => {
    const newUser = await createUser();
    const res = await request(app)
      .post(`/api/v1/conversations/${groupId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [newUser.id] });

    expect(res.status).toBe(200);
  });

  it('member can leave the group', async () => {
    const res = await request(app)
      .delete(`/api/v1/conversations/${groupId}/participants/me`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
  });

  it('admin can remove a participant', async () => {
    const newMember = await createUser();
    // First add them
    await request(app)
      .post(`/api/v1/conversations/${groupId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [newMember.id] });

    // Then remove
    const res = await request(app)
      .delete(`/api/v1/conversations/${groupId}/participants/${newMember.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

// ── Participant Settings ───────────────────────────────────────────────────────

describe('PATCH /conversations/:id/settings', () => {
  it('archives a conversation', async () => {
    const [userA, userB] = await Promise.all([createUser(), createUser()]);
    const token = makeToken(userA.id);

    const convRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DM', participantId: userB.id });

    const convId = convRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/conversations/${convId}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isArchived: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isArchived).toBe(true);
  });
});

// ── Message Reactions & Pin ───────────────────────────────────────────────────

describe('Message reactions and pin endpoints', () => {
  let userA: { id: string };
  let userB: { id: string };
  let tokenA: string;
  let convId: string;
  let msgId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createUser(), createUser()]);
    tokenA = makeToken(userA.id);

    // Create a DM conversation
    const convRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'DM', participantId: userB.id });
    convId = convRes.body.data.id;

    // Send a message
    const msgRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Hello!' });
    msgId = msgRes.body.data.id;
  });

  it('POST reactions — adds emoji reaction', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.data.reactions).toEqual(
      expect.arrayContaining([expect.objectContaining({ emoji: '👍' })]),
    );
  });

  it('POST reactions — idempotent (upsert same emoji twice)', async () => {
    await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emoji: '❤️' });

    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emoji: '❤️' });

    expect(res.status).toBe(200);
  });

  it('DELETE reactions — removes emoji reaction', async () => {
    // First add
    await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emoji: '😂' });

    // Then remove
    const res = await request(app)
      .delete(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emoji: '😂' });

    expect(res.status).toBe(200);
    const remaining = res.body.data.reactions ?? [];
    const removed = remaining.filter((r: { emoji: string; userId: string }) => r.emoji === '😂' && r.userId === userA.id);
    expect(removed).toHaveLength(0);
  });

  it('POST reactions — 401 without token', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .send({ emoji: '👍' });
    expect(res.status).toBe(401);
  });

  it('POST reactions — 400 without emoji', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('PATCH pin — pins a message', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msgId}/pin`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ isPinned: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isPinned).toBe(true);
  });

  it('PATCH pin — unpins a message', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msgId}/pin`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ isPinned: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isPinned).toBe(false);
  });

  it('PATCH pin — 400 without isPinned field', async () => {
    const res = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msgId}/pin`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST reactions — 403 when not a participant', async () => {
    const outsider = await createUser();
    const outsiderToken = makeToken(outsider.id);
    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msgId}/reactions`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ emoji: '👍' });
    expect(res.status).toBe(403);
  });
});
