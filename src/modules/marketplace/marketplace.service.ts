import { prisma } from '../../config/prisma';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../shared/utils/errors';
import { ListingCategory, ListingType, ListingStatus } from '@prisma/client';
import type { CreateListingDto, UpdateListingDto, ListListingsDto, CreateReviewDto, ListReviewsDto } from './marketplace.validation';
import { destroyCloudinaryAsset } from '../../shared/middleware/upload.middleware';
import { notificationsService } from '../notifications/notifications.service';

const DEFAULT_LIMIT = 20;

const SELLER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  isVerified: true,
  servingState: true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertApprovedSeller(userId: string) {
  const app = await prisma.sellerApplication.findUnique({ where: { userId } });
  if (!app || app.status !== 'APPROVED') {
    throw new ForbiddenError('You must be an approved seller to perform this action');
  }
}

async function assertListingOwner(userId: string, listingId: string) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.sellerId !== userId) throw new ForbiddenError('Not your listing');
  return listing;
}

// ── Seller Application ────────────────────────────────────────────────────────

export const marketplaceService = {
  async applyAsSeller(userId: string, idDocUrl: string) {
    const existing = await prisma.sellerApplication.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === 'APPROVED') throw new ConflictError('Already an approved seller');
      if (existing.status === 'PENDING') throw new ConflictError('Application already pending review');
      // REJECTED — allow re-application by updating
      return prisma.sellerApplication.update({
        where: { userId },
        data: { idDocUrl, status: 'PENDING', reviewNote: null, reviewedAt: null },
      });
    }

    return prisma.sellerApplication.create({
      data: { userId, idDocUrl },
    });
  },

  async getMyApplication(userId: string) {
    const app = await prisma.sellerApplication.findUnique({ where: { userId } });
    if (!app) throw new NotFoundError('No seller application found');
    return app;
  },

  // ── Listings ─────────────────────────────────────────────────────────────────

  async createListing(userId: string, dto: CreateListingDto, imageUrls: string[]) {
    await assertApprovedSeller(userId);

    if (imageUrls.length === 0) throw new BadRequestError('At least one listing image is required');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { servingState: true },
    });
    if (!user) throw new NotFoundError('User not found');

    return prisma.marketplaceListing.create({
      data: {
        sellerId: userId,
        title: dto.title,
        description: dto.description,
        category: dto.category as ListingCategory,
        price: dto.price,
        listingType: dto.listingType as ListingType,
        location: dto.location,
        images: imageUrls,
        servingState: user.servingState,
      },
      include: { seller: { select: SELLER_SELECT } },
    });
  },

  async getListings(userId: string | undefined, dto: ListListingsDto) {
    const { cursor, limit, category, listingType, state, search, minPrice, maxPrice } = dto;

    const where: Record<string, unknown> = {
      status: ListingStatus.ACTIVE,
      isFlagged: false,
      ...(category && { category: category as ListingCategory }),
      ...(listingType && { listingType: listingType as ListingType }),
      ...(state && { servingState: state }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
    };

    // Exclude blocked users' listings
    if (userId) {
      const blocks = await prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      });
      const blockedIds = blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
      if (blockedIds.length > 0) {
        where.sellerId = { notIn: blockedIds };
      }
    }

    const rows = await prisma.marketplaceListing.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: [{ isBoost: 'desc' }, { createdAt: 'desc' }],
      include: { seller: { select: SELLER_SELECT } },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async getListing(userId: string | undefined, listingId: string) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        seller: { select: { ...SELLER_SELECT, isActive: true } },
        _count: { select: { inquiries: true } },
      },
    });

    if (!listing || !listing.seller.isActive) throw new NotFoundError('Listing not found');
    if (listing.isFlagged) throw new NotFoundError('Listing not found');

    // Block check
    if (userId && userId !== listing.sellerId) {
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: listing.sellerId },
            { blockerId: listing.sellerId, blockedId: userId },
          ],
        },
      });
      if (block) throw new NotFoundError('Listing not found');
    }

    // Bump view count (fire and forget)
    void prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    });

    const { isActive: _ia, ...safeSeller } = listing.seller;
    return { ...listing, seller: safeSeller };
  },

  async getMyListings(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.marketplaceListing.findMany({
      where: { sellerId: userId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: SELLER_SELECT },
        _count: { select: { inquiries: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async updateListing(userId: string, listingId: string, dto: UpdateListingDto) {
    await assertListingOwner(userId, listingId);

    return prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        ...dto,
        category: dto.category as ListingCategory | undefined,
        listingType: dto.listingType as ListingType | undefined,
        status: dto.status as ListingStatus | undefined,
      },
      include: { seller: { select: SELLER_SELECT } },
    });
  },

  async deleteListing(userId: string, listingId: string) {
    const listing = await assertListingOwner(userId, listingId);
    await prisma.marketplaceListing.delete({ where: { id: listingId } });
    // Clean up all listing images from Cloudinary (fire-and-forget)
    for (const url of listing.images) void destroyCloudinaryAsset(url);
  },

  // ── Inquiries ─────────────────────────────────────────────────────────────────

  async inquire(buyerId: string, listingId: string) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { seller: { select: { id: true, isActive: true } } },
    });

    if (!listing || !listing.seller.isActive) throw new NotFoundError('Listing not found');
    if (listing.sellerId === buyerId) throw new BadRequestError('Cannot inquire on your own listing');
    if (listing.status !== ListingStatus.ACTIVE) throw new BadRequestError('Listing is no longer active');

    // Upsert inquiry record (idempotent)
    const inquiry = await prisma.listingInquiry.upsert({
      where: { listingId_buyerId: { listingId, buyerId } },
      create: { listingId, buyerId },
      update: {},
    });

    // Notify the seller
    void notificationsService.create({
      recipientId: listing.sellerId,
      actorId: buyerId,
      type: 'MARKET_INQUIRY',
      entityType: 'MarketplaceListing',
      entityId: listingId,
      content: `New inquiry on your listing: ${listing.title}`,
    });

    return { inquiry, listingTitle: listing.title, sellerId: listing.sellerId };
  },

  async getListingInquiries(userId: string, listingId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    // Confirm listing belongs to user
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId !== userId) throw new ForbiddenError('Not your listing');

    const rows = await prisma.listingInquiry.findMany({
      where: { listingId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: {
          select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  // ── Reviews ───────────────────────────────────────────────────────────────────

  async createReview(userId: string, listingId: string, dto: CreateReviewDto) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId === userId) throw new BadRequestError('You cannot review your own listing');

    const existing = await prisma.listingReview.findUnique({
      where: { listingId_authorId: { listingId, authorId: userId } },
    });
    if (existing) throw new ConflictError('You have already reviewed this listing');

    return prisma.listingReview.create({
      data: { listingId, authorId: userId, rating: dto.rating, comment: dto.comment },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
      },
    });
  },

  async getListingReviews(listingId: string, dto: ListReviewsDto) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');

    const limit = dto.limit ?? 20;
    const rows = await prisma.listingReview.findMany({
      where: { listingId },
      take: limit + 1,
      ...(dto.cursor && { cursor: { id: dto.cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const agg = await prisma.listingReview.aggregate({
      where: { listingId },
      _avg: { rating: true },
      _count: { id: true },
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
      averageRating: agg._avg.rating ?? 0,
      totalReviews: agg._count.id,
    };
  },

  async deleteReview(userId: string, reviewId: string) {
    const review = await prisma.listingReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundError('Review not found');
    if (review.authorId !== userId) throw new ForbiddenError('Not your review');
    await prisma.listingReview.delete({ where: { id: reviewId } });
  },
};
