import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(overrides: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash('Test@1234', 10);
  return prisma.user.create({
    data: {
      email: `story-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Story',
      lastName: 'Tester',
      stateCode: `LA/24A/${Math.floor(Math.random() * 9000 + 1000)}`,
      servingState: 'Lagos',
      batch: 'Batch A',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

function makeToken(userId: string, email = 'story@example.com') {
  return jwt.sign(
    { sub: userId, email, role: 'USER', jti: `test-${Date.now()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

async function seedStory(userId: string) {
  return prisma.story.create({
    data: {
      authorId: userId,
      mediaUrl: 'https://res.cloudinary.com/test/image/upload/test.jpg',
      mediaType: 'image',
      caption: 'Test story',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── GET /api/v1/stories ────────────────────────────────────────────────────────

describe('GET /api/v1/stories', () => {
  it('returns stories grouped by author for authenticated user', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    // Seed a story for the user
    await seedStory(user.id);

    const res = await request(app)
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ownGroup = res.body.data.find((g: { authorId: string }) => g.authorId === user.id);
    expect(ownGroup).toBeDefined();
    expect(ownGroup.stories.length).toBeGreaterThan(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/stories');
    expect(res.status).toBe(401);
  });

  it('includes hasUnviewed flag on each author group', async () => {
    const user = await createUser();
    const token = makeToken(user.id);
    await seedStory(user.id);

    const res = await request(app)
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${token}`);

    const group = res.body.data.find((g: { authorId: string }) => g.authorId === user.id);
    expect(group).toHaveProperty('hasUnviewed');
    expect(typeof group.hasUnviewed).toBe('boolean');
  });
});

// ── POST /api/v1/stories/:storyId/view ────────────────────────────────────────

describe('POST /api/v1/stories/:storyId/view', () => {
  it('marks a story as viewed', async () => {
    const [author, viewer] = await Promise.all([createUser(), createUser()]);
    const story = await seedStory(author.id);
    const viewerToken = makeToken(viewer.id);

    const res = await request(app)
      .post(`/api/v1/stories/${story.id}/view`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
  });

  it('is idempotent — viewing twice returns 200', async () => {
    const [author, viewer] = await Promise.all([createUser(), createUser()]);
    const story = await seedStory(author.id);
    const viewerToken = makeToken(viewer.id);

    await request(app)
      .post(`/api/v1/stories/${story.id}/view`)
      .set('Authorization', `Bearer ${viewerToken}`);

    const res = await request(app)
      .post(`/api/v1/stories/${story.id}/view`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for expired story', async () => {
    const author = await createUser();
    const expired = await prisma.story.create({
      data: {
        authorId: author.id,
        mediaUrl: 'https://test.com/old.jpg',
        mediaType: 'image',
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    const viewer = await createUser();
    const token = makeToken(viewer.id);

    const res = await request(app)
      .post(`/api/v1/stories/${expired.id}/view`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/stories/:storyId ───────────────────────────────────────────

describe('DELETE /api/v1/stories/:storyId', () => {
  it('author can delete own story', async () => {
    const user = await createUser();
    const story = await seedStory(user.id);
    const token = makeToken(user.id);

    const res = await request(app)
      .delete(`/api/v1/stories/${story.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('non-author cannot delete a story', async () => {
    const [author, other] = await Promise.all([createUser(), createUser()]);
    const story = await seedStory(author.id);
    const otherToken = makeToken(other.id);

    const res = await request(app)
      .delete(`/api/v1/stories/${story.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

// ── Highlights ─────────────────────────────────────────────────────────────────

describe('Story Highlights', () => {
  it('adds a story to highlights', async () => {
    const user = await createUser();
    const story = await seedStory(user.id);
    const token = makeToken(user.id);

    const res = await request(app)
      .post(`/api/v1/stories/${story.id}/highlight`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'NYSC Life' });

    expect(res.status).toBe(200);
  });

  it('returns user highlights', async () => {
    const user = await createUser();
    const story = await seedStory(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/v1/stories/${story.id}/highlight`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Memories' });

    const res = await request(app).get(`/api/v1/stories/users/${user.id}/highlights`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('removes a highlight', async () => {
    const user = await createUser();
    const story = await seedStory(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/v1/stories/${story.id}/highlight`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/v1/stories/${story.id}/highlight`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── User highlights via users route ───────────────────────────────────────────

describe('GET /api/v1/users/:userId/highlights', () => {
  it('returns highlights for a user', async () => {
    const user = await createUser();
    const story = await seedStory(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/v1/stories/${story.id}/highlight`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Moments' });

    const res = await request(app).get(`/api/v1/users/${user.id}/highlights`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
