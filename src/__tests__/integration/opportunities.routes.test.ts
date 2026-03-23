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
      email: `opp-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Opp',
      lastName: 'User',
      stateCode: `LA/24O/${id}`,
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
    {
      sub: userId,
      email: 'opp@example.com',
      role: 'USER',
      jti: `opp-test-${Date.now()}-${Math.random()}`,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

async function createOpportunity(authorId: string, overrides: Record<string, unknown> = {}) {
  return prisma.opportunity.create({
    data: {
      authorId,
      title: 'Software Engineer',
      description: 'A great engineering role at a top company',
      type: 'JOB',
      companyName: 'Acme Corp',
      location: 'Lagos',
      isRemote: false,
      ...overrides,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /api/v1/opportunities ────────────────────────────────────────────────

describe('POST /api/v1/opportunities', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/opportunities').send({});
    expect(res.status).toBe(401);
  });

  it('creates an opportunity', async () => {
    const author = await createUser();

    const res = await request(app)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({
        title: 'Backend Developer',
        description: 'Build APIs for millions of NYSC corpers',
        type: 'JOB',
        companyName: 'Tech Ltd',
        location: 'Abuja',
        isRemote: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Backend Developer');
    expect(res.body.data.type).toBe('JOB');
  });

  it('returns 422 for missing required fields', async () => {
    const author = await createUser();

    const res = await request(app)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ title: 'x' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/opportunities ─────────────────────────────────────────────────

describe('GET /api/v1/opportunities', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/opportunities');
    expect(res.status).toBe(401);
  });

  it('returns paginated opportunities', async () => {
    const author = await createUser();
    await createOpportunity(author.id);

    const res = await request(app)
      .get('/api/v1/opportunities')
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('filters by type', async () => {
    const author = await createUser();
    await createOpportunity(author.id, { type: 'INTERNSHIP' });

    const res = await request(app)
      .get('/api/v1/opportunities?type=INTERNSHIP')
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(200);
    const types = (res.body.data.items as { type: string }[]).map((o) => o.type);
    expect(types.every((t) => t === 'INTERNSHIP')).toBe(true);
  });
});

// ── GET /api/v1/opportunities/mine ────────────────────────────────────────────

describe('GET /api/v1/opportunities/mine', () => {
  it('returns only the logged-in user opportunities', async () => {
    const author = await createUser();
    const other = await createUser();
    await createOpportunity(author.id);
    await createOpportunity(other.id);

    const res = await request(app)
      .get('/api/v1/opportunities/mine')
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(200);
    const authorIds = (res.body.data.items as { author: { id: string } }[]).map(
      (o) => o.author.id,
    );
    expect(authorIds.every((id) => id === author.id)).toBe(true);
  });
});

// ── GET /api/v1/opportunities/:opportunityId ──────────────────────────────────

describe('GET /api/v1/opportunities/:opportunityId', () => {
  it('returns the opportunity', async () => {
    const author = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .get(`/api/v1/opportunities/${opp.id}`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(opp.id);
  });

  it('returns 404 for non-existent opportunity', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/v1/opportunities/nonexistent-id')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/opportunities/:opportunityId ────────────────────────────────

describe('PATCH /api/v1/opportunities/:opportunityId', () => {
  it('author can update their opportunity', async () => {
    const author = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .patch(`/api/v1/opportunities/${opp.id}`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  it('returns 403 for non-author', async () => {
    const author = await createUser();
    const outsider = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .patch(`/api/v1/opportunities/${opp.id}`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/v1/opportunities/:opportunityId ───────────────────────────────

describe('DELETE /api/v1/opportunities/:opportunityId', () => {
  it('author can delete their opportunity', async () => {
    const author = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .delete(`/api/v1/opportunities/${opp.id}`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(204);
  });

  it('returns 403 for non-author', async () => {
    const author = await createUser();
    const outsider = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .delete(`/api/v1/opportunities/${opp.id}`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`);

    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/opportunities/:opportunityId/save ────────────────────────────

describe('POST /api/v1/opportunities/:opportunityId/save', () => {
  it('saves an opportunity', async () => {
    const author = await createUser();
    const user = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .post(`/api/v1/opportunities/${opp.id}/save`)
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/v1/opportunities/:opportunityId/save ─────────────────────────

describe('DELETE /api/v1/opportunities/:opportunityId/save', () => {
  it('unsaves an opportunity', async () => {
    const author = await createUser();
    const user = await createUser();
    const opp = await createOpportunity(author.id);
    await prisma.savedOpportunity.create({ data: { userId: user.id, opportunityId: opp.id } });

    const res = await request(app)
      .delete(`/api/v1/opportunities/${opp.id}/save`)
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
  });
});

// ── GET /api/v1/opportunities/saved ──────────────────────────────────────────

describe('GET /api/v1/opportunities/saved', () => {
  it('returns saved opportunities', async () => {
    const author = await createUser();
    const user = await createUser();
    const opp = await createOpportunity(author.id);
    await prisma.savedOpportunity.create({ data: { userId: user.id, opportunityId: opp.id } });

    const res = await request(app)
      .get('/api/v1/opportunities/saved')
      .set('Authorization', `Bearer ${makeToken(user.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

// ── POST /api/v1/opportunities/:opportunityId/apply ───────────────────────────

describe('POST /api/v1/opportunities/:opportunityId/apply', () => {
  it('applies to an opportunity', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .post(`/api/v1/opportunities/${opp.id}/apply`)
      .set('Authorization', `Bearer ${makeToken(applicant.id)}`)
      .send({ coverLetter: 'I am a great candidate for this role.' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 400 when applying to own opportunity', async () => {
    const author = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .post(`/api/v1/opportunities/${opp.id}/apply`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ coverLetter: 'Self apply attempt' });

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate application', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);
    await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .post(`/api/v1/opportunities/${opp.id}/apply`)
      .set('Authorization', `Bearer ${makeToken(applicant.id)}`)
      .send({ coverLetter: 'Second attempt' });

    expect(res.status).toBe(409);
  });
});

// ── GET /api/v1/opportunities/:opportunityId/applications ─────────────────────

describe('GET /api/v1/opportunities/:opportunityId/applications', () => {
  it('author can view applications', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);
    await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .get(`/api/v1/opportunities/${opp.id}/applications`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('returns 403 for non-author', async () => {
    const author = await createUser();
    const outsider = await createUser();
    const opp = await createOpportunity(author.id);

    const res = await request(app)
      .get(`/api/v1/opportunities/${opp.id}/applications`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`);

    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/opportunities/applications/mine ───────────────────────────────

describe('GET /api/v1/opportunities/applications/mine', () => {
  it('returns applicant own applications', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);
    await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .get('/api/v1/opportunities/applications/mine')
      .set('Authorization', `Bearer ${makeToken(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

// ── PATCH /api/v1/opportunities/applications/:applicationId/status ─────────────

describe('PATCH /api/v1/opportunities/applications/:applicationId/status', () => {
  it('author can update application status', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);
    const application = await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .patch(`/api/v1/opportunities/applications/${application.id}/status`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ status: 'SHORTLISTED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SHORTLISTED');
  });

  it('returns 403 for non-author', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const outsider = await createUser();
    const opp = await createOpportunity(author.id);
    const application = await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .patch(`/api/v1/opportunities/applications/${application.id}/status`)
      .set('Authorization', `Bearer ${makeToken(outsider.id)}`)
      .send({ status: 'REVIEWED' });

    expect(res.status).toBe(403);
  });

  it('returns 422 for invalid status', async () => {
    const author = await createUser();
    const applicant = await createUser();
    const opp = await createOpportunity(author.id);
    const application = await prisma.opportunityApplication.create({
      data: { opportunityId: opp.id, applicantId: applicant.id },
    });

    const res = await request(app)
      .patch(`/api/v1/opportunities/applications/${application.id}/status`)
      .set('Authorization', `Bearer ${makeToken(author.id)}`)
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(422);
  });
});
