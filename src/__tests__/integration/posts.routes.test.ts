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
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'User',
      stateCode: `LA/24A/${Date.now()}${Math.floor(Math.random() * 9999)}`,
      servingState: 'Lagos',
      batch: 'Batch A',
      isActive: true,
      isVerified: true,
      ...overrides,
    },
  });
}

function makeToken(userId: string, email = 'test@example.com') {
  return jwt.sign(
    { sub: userId, email, role: 'USER', jti: `test-${Date.now()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Posts CRUD ────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts', () => {
  let token: string;

  beforeAll(async () => {
    const user = await createUser();
    token = makeToken(user.id);
  });

  it('creates a post successfully', async () => {
    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello corpers!', visibility: 'PUBLIC' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ content: 'Hello corpers!' });
  });

  it('rejects post with no content and no mediaUrls', async () => {
    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ visibility: 'PUBLIC' });

    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/posts')
      .send({ content: 'No auth' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/posts/:postId', () => {
  let authorToken: string;
  let postId: string;

  beforeAll(async () => {
    const author = await createUser();
    authorToken = makeToken(author.id);

    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: 'Public post', visibility: 'PUBLIC' });

    postId = res.body.data.id;
  });

  it('returns a public post without auth', async () => {
    const res = await request(app).get(`/api/v1/posts/${postId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(postId);
  });

  it('returns 404 for non-existent post', async () => {
    const res = await request(app).get('/api/v1/posts/non-existent-id');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/posts/:postId', () => {
  let token: string;
  let postId: string;

  beforeAll(async () => {
    const user = await createUser();
    token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Original content', visibility: 'PUBLIC' });

    postId = res.body.data.id;
  });

  it('updates post within edit window', async () => {
    const res = await request(app)
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Updated content' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Updated content');
    expect(res.body.data.isEdited).toBe(true);
  });

  it('forbids editing another user\'s post', async () => {
    const other = await createUser();
    const otherToken = makeToken(other.id);

    const res = await request(app)
      .patch(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ content: 'Hack attempt' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/posts/:postId', () => {
  let token: string;

  it('deletes own post', async () => {
    const user = await createUser();
    token = makeToken(user.id);

    const createRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Delete me', visibility: 'PUBLIC' });

    const postId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── Reactions ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:postId/react', () => {
  let token: string;
  let postId: string;

  beforeAll(async () => {
    const [author, reactor] = await Promise.all([createUser(), createUser()]);
    token = makeToken(reactor.id);

    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ content: 'React to this', visibility: 'PUBLIC' });

    postId = res.body.data.id;
  });

  it('adds a reaction', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'LIKE' });

    expect(res.status).toBe(200);
  });

  it('changes reaction type (upsert)', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'LOVE' });

    expect(res.status).toBe(200);
  });

  it('removes a reaction', async () => {
    const res = await request(app)
      .delete(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── Comments ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:postId/comments', () => {
  let token: string;
  let postId: string;
  let commentId: string;

  beforeAll(async () => {
    const user = await createUser();
    token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Comment on me', visibility: 'PUBLIC' });

    postId = res.body.data.id;
  });

  it('adds a top-level comment', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Great post!' });

    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('Great post!');
    commentId = res.body.data.id;
  });

  it('adds a reply to a comment', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Thanks!', parentId: commentId });

    expect(res.status).toBe(201);
  });

  it('rejects reply-to-reply (max 2 levels)', async () => {
    // Get the reply ID
    const getRes = await request(app).get(`/api/v1/posts/${postId}/comments`);
    const comment = getRes.body.data.items[0];
    const replyId = comment.replies[0].id;

    const res = await request(app)
      .post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Nested too deep', parentId: replyId });

    expect(res.status).toBe(400);
  });

  it('lists comments with replies', async () => {
    const res = await request(app).get(`/api/v1/posts/${postId}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0]).toHaveProperty('replies');
  });
});

// ── Bookmarks ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:postId/bookmark', () => {
  let token: string;
  let userId: string;
  let postId: string;

  beforeAll(async () => {
    const user = await createUser();
    token = makeToken(user.id);
    userId = user.id;

    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Bookmark this', visibility: 'PUBLIC' });

    postId = res.body.data.id;
  });

  it('bookmarks a post', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/bookmark`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('is idempotent (bookmark twice = no error)', async () => {
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/bookmark`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns bookmarks via users/me/bookmarks', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/bookmarks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((p: { id: string }) => p.id === postId)).toBe(true);
  });

  it('removes bookmark', async () => {
    const res = await request(app)
      .delete(`/api/v1/posts/${postId}/bookmark`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── Report ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:postId/report', () => {
  it('reports a post', async () => {
    const [author, reporter] = await Promise.all([createUser(), createUser()]);
    const authorToken = makeToken(author.id);
    const reporterToken = makeToken(reporter.id);

    const createRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: 'Reportable post', visibility: 'PUBLIC' });

    const postId = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ reason: 'This post contains spam content' });

    expect(res.status).toBe(200);
  });

  it('cannot report own post', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const createRes = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'My own post', visibility: 'PUBLIC' });

    const postId = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/posts/${postId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'This post contains spam content' });

    expect(res.status).toBe(400);
  });
});

// ── Feed ───────────────────────────────────────────────────────────────────────

describe('GET /api/v1/feed', () => {
  it('returns the home feed for authenticated user', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    // Create a post
    await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Feed test post', visibility: 'PUBLIC' });

    const res = await request(app)
      .get('/api/v1/feed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/feed');
    expect(res.status).toBe(401);
  });
});

// ── User Posts ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/:userId/posts', () => {
  it('returns user posts with correct visibility filtering', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Public user post', visibility: 'PUBLIC' });

    await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Private post', visibility: 'ONLY_ME' });

    // Unauthenticated should only see PUBLIC
    const res = await request(app).get(`/api/v1/users/${user.id}/posts`);
    expect(res.status).toBe(200);
    // All returned posts should be PUBLIC
    for (const post of res.body.data.items) {
      expect(post.visibility).toBe('PUBLIC');
    }
  });
});
