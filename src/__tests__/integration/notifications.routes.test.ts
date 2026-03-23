import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ── Helpers ───────────────────────────────────────────────────────────────────

let userCounter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash('Test@1234', 10);
  const id = ++userCounter;
  return prisma.user.create({
    data: {
      email: `notif-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Notif',
      lastName: 'User',
      stateCode: `LA/24A/NOTIF${id}`,
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
    { sub: userId, email: 'notif@example.com', role: 'USER', jti: `notif-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

async function createNotification(recipientId: string, actorId: string) {
  return prisma.notification.create({
    data: {
      recipientId,
      actorId,
      type: 'FOLLOW',
      entityType: 'User',
      entityId: actorId,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── GET /api/v1/notifications ─────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns list of notifications', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    await createNotification(recipient.id, actor.id);
    const token = makeToken(recipient.id);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('filters unread only', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    const notif = await createNotification(recipient.id, actor.id);
    await prisma.notification.update({ where: { id: notif.id }, data: { isRead: true } });
    await createNotification(recipient.id, actor.id); // unread
    const token = makeToken(recipient.id);

    const res = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((n: { isRead: boolean }) => !n.isRead)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/notifications/unread-count ────────────────────────────────────

describe('GET /api/v1/notifications/unread-count', () => {
  it('returns unread count', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    await createNotification(recipient.id, actor.id);
    const token = makeToken(recipient.id);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
  });
});

// ── POST /api/v1/notifications/read ──────────────────────────────────────────

describe('POST /api/v1/notifications/read', () => {
  it('marks specified notifications as read', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    const notif = await createNotification(recipient.id, actor.id);
    const token = makeToken(recipient.id);

    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${token}`)
      .send({ notificationIds: [notif.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
  });

  it('returns 403 when trying to mark someone else\'s notification', async () => {
    const [recipient, actor, outsider] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    const notif = await createNotification(recipient.id, actor.id);
    const outsiderToken = makeToken(outsider.id);

    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ notificationIds: [notif.id] });

    expect(res.status).toBe(403);
  });

  it('returns 422 for missing notificationIds', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
  });
});

// ── POST /api/v1/notifications/read-all ──────────────────────────────────────

describe('POST /api/v1/notifications/read-all', () => {
  it('marks all unread notifications as read', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    await Promise.all([
      createNotification(recipient.id, actor.id),
      createNotification(recipient.id, actor.id),
    ]);
    const token = makeToken(recipient.id);

    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(2);
  });
});

// ── DELETE /api/v1/notifications/:id ─────────────────────────────────────────

describe('DELETE /api/v1/notifications/:notificationId', () => {
  it('deletes own notification', async () => {
    const [recipient, actor] = await Promise.all([createUser(), createUser()]);
    const notif = await createNotification(recipient.id, actor.id);
    const token = makeToken(recipient.id);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notif.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 when deleting someone else\'s notification', async () => {
    const [recipient, actor, outsider] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    const notif = await createNotification(recipient.id, actor.id);
    const outsiderToken = makeToken(outsider.id);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notif.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent notification', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .delete('/api/v1/notifications/nonexistentid123456789')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
