/**
 * Unit tests for marketplaceService — Prisma and notifications are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    sellerApplication: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    marketplaceListing: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    listingInquiry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    sellerProfile: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    block: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../modules/notifications/notifications.service', () => ({
  notificationsService: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

import { marketplaceService } from '../../modules/marketplace/marketplace.service';
import { prisma } from '../../config/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Test Data ─────────────────────────────────────────────────────────────────

const SELLER_ID = 'user-seller';
const BUYER_ID = 'user-buyer';
const LISTING_ID = 'listing-1';

const mockApprovedApp = { userId: SELLER_ID, status: 'APPROVED', idDocUrl: 'https://cdn/doc.jpg' };
const mockPendingApp = { userId: SELLER_ID, status: 'PENDING', idDocUrl: 'https://cdn/doc.jpg' };
const mockSellerDto = { businessName: 'Test Biz', businessDescription: 'We sell great stuff here', whatTheySell: 'Electronics' };
const mockActiveProfile = { userId: SELLER_ID, sellerStatus: 'ACTIVE' };

const mockListing = {
  id: LISTING_ID,
  sellerId: SELLER_ID,
  title: 'Used Laptop',
  description: 'A well maintained laptop for sale',
  category: 'ELECTRONICS',
  price: 50000,
  listingType: 'FOR_SALE',
  status: 'ACTIVE',
  images: ['https://cdn/img1.jpg'],
  servingState: 'Lagos',
  isFlagged: false,
  viewCount: 0,
  isBoost: false,
  boostExpiresAt: null,
  location: 'Lagos Island',
  createdAt: new Date(),
  updatedAt: new Date(),
  seller: { id: SELLER_ID, firstName: 'Test', lastName: 'Seller', profilePicture: null, isVerified: true, servingState: 'Lagos', isActive: true },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('marketplaceService.applyAsSeller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new application', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.sellerApplication.create as jest.Mock).mockResolvedValue(mockPendingApp);

    const result = await marketplaceService.applyAsSeller(SELLER_ID, 'https://cdn/doc.jpg', mockSellerDto);
    expect(result.status).toBe('PENDING');
    expect(mockPrisma.sellerApplication.create).toHaveBeenCalledTimes(1);
  });

  it('throws 409 if already approved', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockApprovedApp);

    await expect(
      marketplaceService.applyAsSeller(SELLER_ID, 'https://cdn/doc.jpg', mockSellerDto),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 if already pending', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockPendingApp);

    await expect(
      marketplaceService.applyAsSeller(SELLER_ID, 'https://cdn/doc.jpg', mockSellerDto),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows re-application after rejection', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue({ ...mockPendingApp, status: 'REJECTED' });
    (mockPrisma.sellerApplication.update as jest.Mock).mockResolvedValue(mockPendingApp);

    await marketplaceService.applyAsSeller(SELLER_ID, 'https://cdn/doc.jpg', mockSellerDto);
    expect(mockPrisma.sellerApplication.update).toHaveBeenCalledTimes(1);
  });
});

describe('marketplaceService.createListing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a listing for approved seller', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockApprovedApp);
    (mockPrisma.sellerProfile.findUnique as jest.Mock).mockResolvedValue(mockActiveProfile);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ servingState: 'Lagos' });
    (mockPrisma.marketplaceListing.create as jest.Mock).mockResolvedValue(mockListing);

    const result = await marketplaceService.createListing(
      SELLER_ID,
      { title: 'Used Laptop', description: 'A well maintained laptop', category: 'ELECTRONICS', listingType: 'FOR_SALE' },
      ['https://cdn/img1.jpg'],
    );
    expect(result.title).toBe('Used Laptop');
  });

  it('throws 403 if not an approved seller', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockPendingApp);

    await expect(
      marketplaceService.createListing(SELLER_ID, { title: 'T', description: 'D', category: 'OTHERS', listingType: 'FOR_SALE' }, ['url']),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 if no images provided', async () => {
    (mockPrisma.sellerApplication.findUnique as jest.Mock).mockResolvedValue(mockApprovedApp);
    (mockPrisma.sellerProfile.findUnique as jest.Mock).mockResolvedValue(mockActiveProfile);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ servingState: 'Lagos' });

    await expect(
      marketplaceService.createListing(SELLER_ID, { title: 'T', description: 'D', category: 'OTHERS', listingType: 'FOR_SALE' }, []),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('marketplaceService.getListing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns listing and bumps view count', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);
    (mockPrisma.marketplaceListing.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.block.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await marketplaceService.getListing(BUYER_ID, LISTING_ID);
    expect(result.id).toBe(LISTING_ID);
    expect(mockPrisma.marketplaceListing.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { viewCount: { increment: 1 } } }),
    );
  });

  it('throws 404 for flagged listing', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({ ...mockListing, isFlagged: true });

    await expect(marketplaceService.getListing(BUYER_ID, LISTING_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 if blocked', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);
    (mockPrisma.block.findFirst as jest.Mock).mockResolvedValue({ blockerId: BUYER_ID, blockedId: SELLER_ID });

    await expect(marketplaceService.getListing(BUYER_ID, LISTING_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('marketplaceService.updateListing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates own listing', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);
    (mockPrisma.marketplaceListing.update as jest.Mock).mockResolvedValue({ ...mockListing, title: 'Updated' });

    const result = await marketplaceService.updateListing(SELLER_ID, LISTING_ID, { title: 'Updated' });
    expect(result.title).toBe('Updated');
  });

  it('throws 403 for non-owner', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({ ...mockListing, sellerId: 'someone-else' });

    await expect(
      marketplaceService.updateListing(SELLER_ID, LISTING_ID, { title: 'Hack' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('marketplaceService.deleteListing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes own listing', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);
    (mockPrisma.marketplaceListing.delete as jest.Mock).mockResolvedValue({});

    await marketplaceService.deleteListing(SELLER_ID, LISTING_ID);
    expect(mockPrisma.marketplaceListing.delete).toHaveBeenCalledTimes(1);
  });

  it('throws 403 for non-owner', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({ ...mockListing, sellerId: 'someone-else' });

    await expect(marketplaceService.deleteListing(SELLER_ID, LISTING_ID)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('marketplaceService.inquire', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an inquiry record', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);
    (mockPrisma.listingInquiry.upsert as jest.Mock).mockResolvedValue({ id: 'inq-1', listingId: LISTING_ID, buyerId: BUYER_ID });

    const result = await marketplaceService.inquire(BUYER_ID, LISTING_ID);
    expect(result.inquiry.listingId).toBe(LISTING_ID);
  });

  it('throws 400 when seller tries to inquire on own listing', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue(mockListing);

    await expect(marketplaceService.inquire(SELLER_ID, LISTING_ID)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for inactive listing', async () => {
    (mockPrisma.marketplaceListing.findUnique as jest.Mock).mockResolvedValue({ ...mockListing, status: 'SOLD' });

    await expect(marketplaceService.inquire(BUYER_ID, LISTING_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});
