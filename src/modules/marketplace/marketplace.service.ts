import { prisma } from '../../config/prisma';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../shared/utils/errors';
import { ListingCategory, ListingType, ListingStatus, ConversationType } from '@prisma/client';
import type {
  ApplySellerDto,
  CreateListingDto,
  UpdateListingDto,
  ListListingsDto,
  CreateReviewDto,
  ListReviewsDto,
  CreateListingCommentDto,
  UpdateListingCommentDto,
} from './marketplace.validation';
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

async function assertActiveSeller(userId: string) {
  const app = await prisma.sellerApplication.findUnique({ where: { userId } });
  if (!app || app.status !== 'APPROVED') {
    throw new ForbiddenError('You must be an approved seller to perform this action');
  }
  const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!profile || profile.sellerStatus !== 'ACTIVE') {
    throw new ForbiddenError('Your seller profile is not active');
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
  async applyAsSeller(userId: string, idDocUrl: string, dto: ApplySellerDto) {
    const existing = await prisma.sellerApplication.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === 'APPROVED') throw new ConflictError('Already an approved seller');
      if (existing.status === 'PENDING') throw new ConflictError('Application already pending review');
      // REJECTED — allow re-application by updating
      const updated = await prisma.sellerApplication.update({
        where: { userId },
        data: {
          idDocUrl,
          businessName: dto.businessName,
          businessDescription: dto.businessDescription,
          whatTheySell: dto.whatTheySell,
          status: 'PENDING',
          reviewNote: null,
          reviewedAt: null,
        },
      });

      void notificationsService.create({
        recipientId: userId,
        type: 'SYSTEM',
        content: 'Your request to become a Mami Marketer is in review. We will get back to you shortly.',
      });

      return updated;
    }

    const application = await prisma.sellerApplication.create({
      data: {
        userId,
        idDocUrl,
        businessName: dto.businessName,
        businessDescription: dto.businessDescription,
        whatTheySell: dto.whatTheySell,
      },
    });

    void notificationsService.create({
      recipientId: userId,
      type: 'SYSTEM',
      content: 'Your request to become a Mami Marketer is in review. We will get back to you shortly.',
    });

    return application;
  },

  async getMyApplication(userId: string) {
    const app = await prisma.sellerApplication.findUnique({ where: { userId } });
    if (!app) throw new NotFoundError('No seller application found');
    return app;
  },

  // ── Seller Profile ──────────────────────────────────────────────────────────

  async getSellerProfile(userId: string) {
    const profile = await prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profilePicture: true,
            isVerified: true,
            servingState: true,
            stateCode: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundError('Seller profile not found');

    // Aggregate rating from all seller's listings
    const ratingAgg = await prisma.listingReview.aggregate({
      where: {
        listing: { sellerId: userId },
      },
      _avg: { rating: true },
      _count: { id: true },
    });

    // Count active listings
    const activeListingCount = await prisma.marketplaceListing.count({
      where: { sellerId: userId, status: ListingStatus.ACTIVE, isFlagged: false },
    });

    return {
      ...profile,
      averageRating: ratingAgg._avg.rating ?? 0,
      totalReviews: ratingAgg._count.id,
      activeListingCount,
    };
  },

  async getMySellerProfile(userId: string) {
    return this.getSellerProfile(userId);
  },

  async getSellerListings(sellerId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        sellerId,
        status: ListingStatus.ACTIVE,
        isFlagged: false,
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: SELLER_SELECT } },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  // ── Listings ─────────────────────────────────────────────────────────────────

  async createListing(userId: string, dto: CreateListingDto, imageUrls: string[]) {
    await assertActiveSeller(userId);

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

  // ── Listing Comments (Bidding) ──────────────────────────────────────────────

  async createListingComment(userId: string, listingId: string, dto: CreateListingCommentDto) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.status !== ListingStatus.ACTIVE) throw new BadRequestError('Listing is no longer active');

    // Validate parent comment if provided
    if (dto.parentId) {
      const parent = await prisma.listingComment.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundError('Parent comment not found');
      if (parent.listingId !== listingId) throw new BadRequestError('Parent comment does not belong to this listing');
    }

    const comment = await prisma.listingComment.create({
      data: {
        listingId,
        authorId: userId,
        content: dto.content,
        bidAmount: dto.bidAmount,
        parentId: dto.parentId,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
      },
    });

    // Notify listing owner
    if (listing.sellerId !== userId) {
      void notificationsService.create({
        recipientId: listing.sellerId,
        actorId: userId,
        type: 'LISTING_COMMENT',
        entityType: 'MarketplaceListing',
        entityId: listingId,
        content: dto.bidAmount
          ? `New bid of ${dto.bidAmount} on your listing: ${listing.title}`
          : `New comment on your listing: ${listing.title}`,
      });
    }

    return comment;
  },

  async getListingComments(listingId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');

    const rows = await prisma.listingComment.findMany({
      where: {
        listingId,
        parentId: null,
        isDeleted: false,
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async updateListingComment(userId: string, commentId: string, dto: UpdateListingCommentDto) {
    const comment = await prisma.listingComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundError('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenError('Not your comment');
    if (comment.isDeleted) throw new NotFoundError('Comment not found');

    return prisma.listingComment.update({
      where: { id: commentId },
      data: {
        content: dto.content,
        bidAmount: dto.bidAmount,
        isEdited: true,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
      },
    });
  },

  async deleteListingComment(userId: string, commentId: string, listingOwnerId?: string) {
    const comment = await prisma.listingComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundError('Comment not found');
    if (comment.isDeleted) throw new NotFoundError('Comment not found');

    // Author can delete own comment. Listing seller can also delete any comment on their listing.
    const isAuthor = comment.authorId === userId;
    let isListingOwner = false;
    if (listingOwnerId) {
      isListingOwner = listingOwnerId === userId;
    } else {
      const listing = await prisma.marketplaceListing.findUnique({ where: { id: comment.listingId } });
      isListingOwner = listing?.sellerId === userId;
    }

    if (!isAuthor && !isListingOwner) {
      throw new ForbiddenError('You cannot delete this comment');
    }

    // Soft delete
    await prisma.listingComment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });
  },

  // ── Marketplace Conversations ───────────────────────────────────────────────

  async startMarketplaceChat(buyerId: string, listingId: string) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { seller: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.status !== ListingStatus.ACTIVE) throw new BadRequestError('Listing is no longer active');
    if (listing.sellerId === buyerId) throw new BadRequestError('You cannot start a chat on your own listing');

    // Check for existing conversation (idempotent)
    const existing = await prisma.marketplaceConversation.findUnique({
      where: { listingId_buyerId: { listingId, buyerId } },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
              },
            },
          },
        },
        listing: { select: { id: true, title: true, images: true, price: true, status: true } },
        buyer: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        seller: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });
    if (existing) return existing;

    // Create conversation, participants, and marketplace conversation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.MARKETPLACE,
        },
      });

      await tx.conversationParticipant.createMany({
        data: [
          { conversationId: conversation.id, userId: buyerId },
          { conversationId: conversation.id, userId: listing.sellerId },
        ],
      });

      const marketplaceConv = await tx.marketplaceConversation.create({
        data: {
          conversationId: conversation.id,
          listingId,
          buyerId,
          sellerId: listing.sellerId,
        },
        include: {
          conversation: {
            include: {
              participants: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
                },
              },
            },
          },
          listing: { select: { id: true, title: true, images: true, price: true, status: true } },
          buyer: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
          seller: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        },
      });

      return marketplaceConv;
    });

    // Notify seller
    void notificationsService.create({
      recipientId: listing.sellerId,
      actorId: buyerId,
      type: 'MARKETPLACE_MESSAGE',
      entityType: 'MarketplaceListing',
      entityId: listingId,
      content: `New marketplace chat about your listing: ${listing.title}`,
    });

    return result;
  },

  async getMarketplaceConversations(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const rows = await prisma.marketplaceConversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { conversation: { updatedAt: 'desc' } },
      include: {
        listing: { select: { id: true, title: true, images: true, price: true, status: true } },
        conversation: {
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { id: true, content: true, senderId: true, createdAt: true, type: true },
            },
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
              },
            },
          },
        },
        buyer: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        seller: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  async getMarketplaceConversation(userId: string, conversationId: string) {
    const marketplaceConv = await prisma.marketplaceConversation.findUnique({
      where: { conversationId },
      include: {
        listing: true,
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, profilePicture: true, isVerified: true } },
              },
            },
          },
        },
        buyer: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        seller: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });

    if (!marketplaceConv) throw new NotFoundError('Marketplace conversation not found');
    if (marketplaceConv.buyerId !== userId && marketplaceConv.sellerId !== userId) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    return marketplaceConv;
  },
};
