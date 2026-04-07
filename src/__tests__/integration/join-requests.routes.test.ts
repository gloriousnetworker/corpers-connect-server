/**
 * Integration tests for join-requests routes — hits real DB (test env).
 */

import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import path from 'path';

// Mock email service to prevent real emails
jest.mock('../../shared/services/email.service', () => ({
  emailService: {
    sendOTP: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendRegistrationComplete: jest.fn().mockResolvedValue(undefined),
    sendJoinRequestReceived: jest.fn().mockResolvedValue(undefined),
    sendJoinRequestApproved: jest.fn().mockResolvedValue(undefined),
    sendJoinRequestRejected: jest.fn().mockResolvedValue(undefined),
    sendRenewalSuccess: jest.fn().mockResolvedValue(undefined),
    sendRenewalFailed: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock Cloudinary upload — provide multer middlewares and mock cloud uploads
jest.mock('../../shared/middleware/upload.middleware', () => {
  const multer = require('multer');

  const imageFilter = (_req: unknown, file: { mimetype: string }, cb: (err: Error | null, ok: boolean) => void) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images'), false);
    cb(null, true);
  };

  return {
    avatarUpload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter }).single('avatar'),
    mediaUpload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }).single('media'),
    uploadToCloudinary: jest.fn().mockResolvedValue('https://res.cloudinary.com/test/join_docs/test.jpg'),
    uploadMediaToCloudinary: jest.fn().mockResolvedValue({ url: 'https://res.cloudinary.com/test/media/test.jpg', type: 'image' }),
  };
});

const BASE = '/api/v1/join-requests';
let _counter = 10000; // Keep state codes short to match regex \d{3,5}

async function createAdminUser(role: 'ADMIN' | 'SUPERADMIN' = 'ADMIN') {
  const id = ++_counter;
  const hash = await bcrypt.hash('Admin@1234', 10);
  return prisma.adminUser.create({
    data: {
      email: `jradmin-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      role,
      isActive: true,
    },
  });
}

function makeAdminToken(adminId: string, role: 'ADMIN' | 'SUPERADMIN' = 'ADMIN') {
  return jwt.sign(
    { sub: adminId, email: 'admin@example.com', role, jti: `jr-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

// Cleanup
afterAll(async () => {
  // Clean up test data
  await prisma.joinRequest.deleteMany({
    where: { email: { startsWith: 'jrtest-' } },
  });
  await prisma.approvedCorper.deleteMany({
    where: { email: { startsWith: 'jrtest-' } },
  });
  await prisma.$disconnect();
});

// ── POST /api/v1/join-requests ─────────────────────────────────────────────

describe('POST /api/v1/join-requests (submit)', () => {
  it('returns 201 on valid submission', async () => {
    const id = ++_counter;
    const res = await request(app)
      .post(BASE)
      .field('firstName', 'TestJoin')
      .field('lastName', 'User')
      .field('email', `jrtest-${id}@example.com`)
      .field('stateCode', `KG/25C/${id}`)
      .field('servingState', 'Kogi State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake-pdf-content'), {
        filename: 'posting-letter.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 400 without document', async () => {
    const id = ++_counter;
    const res = await request(app)
      .post(BASE)
      .field('firstName', 'TestJoin')
      .field('lastName', 'User')
      .field('email', `jrtest-${id}@example.com`)
      .field('stateCode', `KG/25C/${id}`)
      .field('servingState', 'Kogi State')
      .field('batch', '2025C');

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/document/i);
  });

  it('returns 400 without required fields', async () => {
    const res = await request(app)
      .post(BASE)
      .field('firstName', 'Test')
      .attach('document', Buffer.from('fake'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(422);
  });

  it('returns 409 on duplicate pending request', async () => {
    const id = ++_counter;
    const email = `jrtest-${id}@example.com`;
    const stateCode = `AB/25C/${id}`;

    // First submission
    await request(app)
      .post(BASE)
      .field('firstName', 'First')
      .field('lastName', 'Try')
      .field('email', email)
      .field('stateCode', stateCode)
      .field('servingState', 'Abia State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    // Duplicate submission
    const res = await request(app)
      .post(BASE)
      .field('firstName', 'Second')
      .field('lastName', 'Try')
      .field('email', email)
      .field('stateCode', stateCode)
      .field('servingState', 'Abia State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pending/i);
  });
});

// ── GET /api/v1/join-requests/status ────────────────────────────────────────

describe('GET /api/v1/join-requests/status', () => {
  it('returns request status for known email', async () => {
    const id = ++_counter;
    const email = `jrtest-${id}@example.com`;

    // Create a request first
    await request(app)
      .post(BASE)
      .field('firstName', 'Status')
      .field('lastName', 'Check')
      .field('email', email)
      .field('stateCode', `CR/25C/${id}`)
      .field('servingState', 'Cross River State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    const res = await request(app).get(`${BASE}/status`).query({ email });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('status', 'PENDING');
  });

  it('returns 400 without email param', async () => {
    const res = await request(app).get(`${BASE}/status`);
    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/join-requests/admin ─────────────────────────────────────────

describe('GET /api/v1/join-requests/admin (list)', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`${BASE}/admin`);
    expect(res.status).toBe(401);
  });

  it('returns paginated list for admin', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');

    const res = await request(app)
      .get(`${BASE}/admin`)
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('filters by status', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');

    const res = await request(app)
      .get(`${BASE}/admin`)
      .set('Authorization', `Bearer ${token}`)
      .query({ status: 'PENDING' });

    expect(res.status).toBe(200);
    // All items should be pending
    for (const item of res.body.data.items) {
      expect(item.status).toBe('PENDING');
    }
  });
});

// ── PATCH /api/v1/join-requests/admin/:requestId/approve ────────────────────

describe('PATCH /api/v1/join-requests/admin/:requestId/approve', () => {
  it('approves a pending request and creates ApprovedCorper', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');
    const id = ++_counter;
    const email = `jrtest-${id}@example.com`;
    const stateCode = `DT/25C/${id}`;

    // Create join request
    const submitRes = await request(app)
      .post(BASE)
      .field('firstName', 'Approve')
      .field('lastName', 'Me')
      .field('email', email)
      .field('stateCode', stateCode)
      .field('servingState', 'Delta State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    const requestId = submitRes.body.data.id;

    // Approve it
    const res = await request(app)
      .patch(`${BASE}/admin/${requestId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewNote: 'All good' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    // Verify ApprovedCorper was created
    const approved = await prisma.approvedCorper.findUnique({ where: { stateCode } });
    expect(approved).not.toBeNull();
    expect(approved?.email).toBe(email);
  });

  it('returns 400 when trying to approve non-pending request', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');
    const id = ++_counter;
    const email = `jrtest-${id}@example.com`;

    // Create and approve
    const submitRes = await request(app)
      .post(BASE)
      .field('firstName', 'Double')
      .field('lastName', 'Approve')
      .field('email', email)
      .field('stateCode', `EB/25C/${id}`)
      .field('servingState', 'Ebonyi State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    const requestId = submitRes.body.data.id;

    // First approve
    await request(app)
      .patch(`${BASE}/admin/${requestId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Try approve again
    const res = await request(app)
      .patch(`${BASE}/admin/${requestId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already/i);
  });

  it('returns 401 without admin auth', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/fake-id/approve`)
      .send({});
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/join-requests/admin/:requestId/reject ─────────────────────

describe('PATCH /api/v1/join-requests/admin/:requestId/reject', () => {
  it('rejects a pending request', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');
    const id = ++_counter;

    const submitRes = await request(app)
      .post(BASE)
      .field('firstName', 'Reject')
      .field('lastName', 'Me')
      .field('email', `jrtest-${id}@example.com`)
      .field('stateCode', `EN/25C/${id}`)
      .field('servingState', 'Enugu State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    const requestId = submitRes.body.data.id;

    const res = await request(app)
      .patch(`${BASE}/admin/${requestId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewNote: 'Invalid document' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.reviewNote).toBe('Invalid document');
  });

  it('allows resubmission after rejection', async () => {
    const admin = await createAdminUser('ADMIN');
    const token = makeAdminToken(admin.id, 'ADMIN');
    const id = ++_counter;
    const email = `jrtest-${id}@example.com`;
    const stateCode = `FC/25C/${id}`;

    // Submit
    const submitRes = await request(app)
      .post(BASE)
      .field('firstName', 'Resubmit')
      .field('lastName', 'Test')
      .field('email', email)
      .field('stateCode', stateCode)
      .field('servingState', 'FCT State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    // Reject
    await request(app)
      .patch(`${BASE}/admin/${submitRes.body.data.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewNote: 'Bad document' });

    // Resubmit should succeed
    const resubmitRes = await request(app)
      .post(BASE)
      .field('firstName', 'Resubmit')
      .field('lastName', 'Test')
      .field('email', email)
      .field('stateCode', stateCode)
      .field('servingState', 'FCT State')
      .field('batch', '2025C')
      .attach('document', Buffer.from('new-fake'), { filename: 'doc2.pdf', contentType: 'application/pdf' });

    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.status).toBe('PENDING');
  });
});
