import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import path from 'path';
import fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

let userCounter = Date.now();

async function createUser(overrides: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash('Test@1234', 10);
  const id = ++userCounter;
  return prisma.user.create({
    data: {
      email: `mkt-${id}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: hash,
      firstName: 'Mkt',
      lastName: 'User',
      stateCode: `LA/24A/MKT${id}`,
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
    { sub: userId, email: 'mkt@example.com', role: 'USER', jti: `mkt-test-${Date.now()}-${Math.random()}` },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

async function createApprovedSeller() {
  const user = await createUser();
  await prisma.sellerApplication.create({
    data: { userId: user.id, idDocUrl: 'https://cdn/doc.jpg', status: 'APPROVED' },
  });
  return { user, token: makeToken(user.id) };
}

async function createListing(sellerId: string) {
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { servingState: true } });
  return prisma.marketplaceListing.create({
    data: {
      sellerId,
      title: 'Test Listing',
      description: 'A test listing description for the marketplace',
      category: 'ELECTRONICS',
      price: 15000,
      listingType: 'FOR_SALE',
      images: ['https://cdn/img1.jpg'],
      servingState: seller!.servingState,
      status: 'ACTIVE',
    },
  });
}

// Tiny 1×1 pixel PNG as a Buffer (avoids needing a real file on disk)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Seller Application ────────────────────────────────────────────────────────

describe('POST /api/v1/marketplace/apply', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/marketplace/apply')
      .attach('idDoc', TINY_PNG, 'id.png');
    expect(res.status).toBe(401);
  });

  it('submits a seller application with ID document', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/marketplace/apply')
      .set('Authorization', `Bearer ${token}`)
      .attach('idDoc', TINY_PNG, { filename: 'id.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 400 when no ID document is attached', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/marketplace/apply')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 409 when application already pending', async () => {
    const user = await createUser();
    await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://cdn/doc.jpg', status: 'PENDING' },
    });
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/marketplace/apply')
      .set('Authorization', `Bearer ${token}`)
      .attach('idDoc', TINY_PNG, { filename: 'id.png', contentType: 'image/png' });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/marketplace/my-application', () => {
  it('returns own application status', async () => {
    const user = await createUser();
    await prisma.sellerApplication.create({
      data: { userId: user.id, idDocUrl: 'https://cdn/doc.jpg', status: 'PENDING' },
    });
    const token = makeToken(user.id);

    const res = await request(app)
      .get('/api/v1/marketplace/my-application')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 404 when no application exists', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .get('/api/v1/marketplace/my-application')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── Listings ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/marketplace/listings', () => {
  it('creates a listing for an approved seller', async () => {
    const { token } = await createApprovedSeller();

    const res = await request(app)
      .post('/api/v1/marketplace/listings')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Brand new phone')
      .field('description', 'A brand new iPhone for sale, barely used')
      .field('category', 'ELECTRONICS')
      .field('price', '80000')
      .field('listingType', 'FOR_SALE')
      .attach('images', TINY_PNG, { filename: 'phone.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Brand new phone');
    expect(res.body.data.images).toHaveLength(1);
  });

  it('returns 403 for non-approved seller', async () => {
    const user = await createUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/v1/marketplace/listings')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Brand new phone')
      .field('description', 'A brand new iPhone for sale, barely used')
      .field('category', 'ELECTRONICS')
      .attach('images', TINY_PNG, { filename: 'phone.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when no images attached', async () => {
    const { token } = await createApprovedSeller();

    const res = await request(app)
      .post('/api/v1/marketplace/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', description: 'Test description here', category: 'OTHERS' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/marketplace/listings', () => {
  it('returns paginated listings', async () => {
    const { user } = await createApprovedSeller();
    await createListing(user.id);

    const res = await request(app).get('/api/v1/marketplace/listings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('filters by category', async () => {
    const { user } = await createApprovedSeller();
    await createListing(user.id); // ELECTRONICS category

    const res = await request(app).get('/api/v1/marketplace/listings?category=HOUSING');
    expect(res.status).toBe(200);
    // All returned items should be HOUSING
    const items = res.body.data.items as { category: string }[];
    expect(items.every((i) => i.category === 'HOUSING')).toBe(true);
  });
});

describe('GET /api/v1/marketplace/listings/:listingId', () => {
  it('returns a single listing', async () => {
    const { user } = await createApprovedSeller();
    const listing = await createListing(user.id);

    const res = await request(app).get(`/api/v1/marketplace/listings/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(listing.id);
  });

  it('returns 404 for non-existent listing', async () => {
    const res = await request(app).get('/api/v1/marketplace/listings/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/marketplace/listings/:listingId', () => {
  it('updates own listing', async () => {
    const { user, token } = await createApprovedSeller();
    const listing = await createListing(user.id);

    const res = await request(app)
      .patch(`/api/v1/marketplace/listings/${listing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', status: 'SOLD' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.data.status).toBe('SOLD');
  });

  it('returns 403 when updating someone else\'s listing', async () => {
    const { user } = await createApprovedSeller();
    const listing = await createListing(user.id);

    const otherUser = await createUser();
    const otherToken = makeToken(otherUser.id);

    const res = await request(app)
      .patch(`/api/v1/marketplace/listings/${listing.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/marketplace/listings/:listingId', () => {
  it('deletes own listing', async () => {
    const { user, token } = await createApprovedSeller();
    const listing = await createListing(user.id);

    const res = await request(app)
      .delete(`/api/v1/marketplace/listings/${listing.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for non-owner', async () => {
    const { user } = await createApprovedSeller();
    const listing = await createListing(user.id);
    const outsider = await createUser();
    const outsiderToken = makeToken(outsider.id);

    const res = await request(app)
      .delete(`/api/v1/marketplace/listings/${listing.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/marketplace/my-listings', () => {
  it('returns own listings', async () => {
    const { user, token } = await createApprovedSeller();
    await createListing(user.id);

    const res = await request(app)
      .get('/api/v1/marketplace/my-listings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Inquiries ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/marketplace/listings/:listingId/inquire', () => {
  it('creates an inquiry', async () => {
    const { user: seller } = await createApprovedSeller();
    const listing = await createListing(seller.id);
    const buyer = await createUser();
    const buyerToken = makeToken(buyer.id);

    const res = await request(app)
      .post(`/api/v1/marketplace/listings/${listing.id}/inquire`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.inquiry.listingId).toBe(listing.id);
  });

  it('is idempotent — second inquiry returns same record', async () => {
    const { user: seller } = await createApprovedSeller();
    const listing = await createListing(seller.id);
    const buyer = await createUser();
    const buyerToken = makeToken(buyer.id);

    const res1 = await request(app)
      .post(`/api/v1/marketplace/listings/${listing.id}/inquire`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const res2 = await request(app)
      .post(`/api/v1/marketplace/listings/${listing.id}/inquire`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.inquiry.id).toBe(res2.body.data.inquiry.id);
  });

  it('returns 400 when seller inquires on own listing', async () => {
    const { user: seller, token: sellerToken } = await createApprovedSeller();
    const listing = await createListing(seller.id);

    const res = await request(app)
      .post(`/api/v1/marketplace/listings/${listing.id}/inquire`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/marketplace/listings/:listingId/inquiries', () => {
  it('returns inquiries for own listing', async () => {
    const { user: seller, token: sellerToken } = await createApprovedSeller();
    const listing = await createListing(seller.id);
    const buyer = await createUser();
    await prisma.listingInquiry.create({ data: { listingId: listing.id, buyerId: buyer.id } });

    const res = await request(app)
      .get(`/api/v1/marketplace/listings/${listing.id}/inquiries`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 403 for non-owner', async () => {
    const { user: seller } = await createApprovedSeller();
    const listing = await createListing(seller.id);
    const outsider = await createUser();
    const outsiderToken = makeToken(outsider.id);

    const res = await request(app)
      .get(`/api/v1/marketplace/listings/${listing.id}/inquiries`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});
