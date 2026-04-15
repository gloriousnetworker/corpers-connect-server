import { prisma } from '../../config/prisma';
import { paystackRequest } from '../../config/paystack';
import { env } from '../../config/env';
import { AppError, NotFoundError, ForbiddenError, BadRequestError } from '../../shared/utils/errors';
import { destroyCloudinaryAsset } from '../../shared/middleware/upload.middleware';
import { notificationsService } from '../notifications/notifications.service';
import type {
  CreateBookDto,
  UpdateBookDto,
  BookListDto,
  CreateReviewDto,
} from './books.validation';
import { BookStatus, BookGenre, WalletTxType } from '@prisma/client';

const PLATFORM_FEE_PCT = 15; // 15% to platform, 85% to author

const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  level: true,
  isVerified: true,
} as const;

interface PaystackInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** Compute 15% platform fee + 85% author payout (in kobo). */
export function splitPurchaseAmount(totalKobo: number) {
  const platformFeeKobo = Math.floor((totalKobo * PLATFORM_FEE_PCT) / 100);
  const authorPayoutKobo = totalKobo - platformFeeKobo;
  return { platformFeeKobo, authorPayoutKobo };
}

export const booksService = {
  // ── Publish / CRUD ──────────────────────────────────────────────────────────

  async createBook(
    authorId: string,
    dto: CreateBookDto,
    urls: { coverImageUrl: string; pdfUrl: string; backCoverImageUrl?: string },
  ) {
    const book = await prisma.book.create({
      data: {
        authorId,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        aboutTheAuthor: dto.aboutTheAuthor,
        coverImageUrl: urls.coverImageUrl,
        backCoverImageUrl: urls.backCoverImageUrl,
        pdfUrl: urls.pdfUrl,
        genre: dto.genre as BookGenre,
        tags: dto.tags ?? [],
        language: dto.language ?? 'English',
        priceKobo: dto.priceKobo,
        previewPages: dto.previewPages ?? 10,
        status: dto.status as BookStatus,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return this._publicShape(book);
  },

  async updateBook(authorId: string, bookId: string, dto: UpdateBookDto) {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundError('Book not found');
    if (book.authorId !== authorId) throw new ForbiddenError('Not your book');

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: {
        ...dto,
        genre: dto.genre as BookGenre | undefined,
        status: dto.status as BookStatus | undefined,
        publishedAt:
          dto.status === 'PUBLISHED' && !book.publishedAt ? new Date() : book.publishedAt,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return this._publicShape(updated);
  },

  async deleteBook(authorId: string, bookId: string) {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundError('Book not found');
    if (book.authorId !== authorId) throw new ForbiddenError('Not your book');

    // Soft-protection: if any purchases exist, mark UNLISTED instead of hard delete
    const purchaseCount = await prisma.bookPurchase.count({ where: { bookId } });
    if (purchaseCount > 0) {
      await prisma.book.update({
        where: { id: bookId },
        data: { status: 'UNLISTED' },
      });
      return { softDeleted: true };
    }

    await prisma.book.delete({ where: { id: bookId } });
    void destroyCloudinaryAsset(book.coverImageUrl);
    if (book.backCoverImageUrl) void destroyCloudinaryAsset(book.backCoverImageUrl);
    void destroyCloudinaryAsset(book.pdfUrl);
    return { softDeleted: false };
  },

  // ── Browse / detail ─────────────────────────────────────────────────────────

  async listBooks(requesterId: string | undefined, dto: BookListDto) {
    const where: Parameters<typeof prisma.book.findMany>[0] extends infer X
      ? X extends { where?: infer W }
        ? W
        : never
      : never = {
      status: 'PUBLISHED',
      ...(dto.genre && { genre: dto.genre as BookGenre }),
      ...(dto.authorId && { authorId: dto.authorId }),
      ...(dto.q && {
        OR: [
          { title: { contains: dto.q, mode: 'insensitive' as const } },
          { description: { contains: dto.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const orderBy =
      dto.sort === 'trending'
        ? [{ totalSales: 'desc' as const }, { createdAt: 'desc' as const }]
        : dto.sort === 'bestseller'
          ? { totalSales: 'desc' as const }
          : { createdAt: 'desc' as const };

    const rows = await prisma.book.findMany({
      where,
      take: dto.limit + 1,
      ...(dto.cursor && { cursor: { id: dto.cursor }, skip: 1 }),
      orderBy,
      include: { author: { select: AUTHOR_SELECT } },
    });

    const hasMore = rows.length > dto.limit;
    const items = hasMore ? rows.slice(0, dto.limit) : rows;

    // Mark which ones the caller has already bought, so UI can show "Read" vs "Buy"
    const ownedIds = requesterId
      ? new Set(
          (
            await prisma.bookPurchase.findMany({
              where: { userId: requesterId, bookId: { in: items.map((b) => b.id) } },
              select: { bookId: true },
            })
          ).map((p) => p.bookId),
        )
      : new Set<string>();

    return {
      items: items.map((b) => this._publicShape(b, ownedIds.has(b.id))),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  async getBook(requesterId: string | undefined, bookId: string) {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (!book) throw new NotFoundError('Book not found');

    const isOwner = requesterId === book.authorId;
    if (book.status === 'DRAFT' && !isOwner) throw new NotFoundError('Book not found');

    const owned = requesterId
      ? !!(await prisma.bookPurchase.findUnique({
          where: { userId_bookId: { userId: requesterId, bookId } },
        }))
      : false;

    return this._publicShape(book, owned);
  },

  // Never exposes pdfUrl to non-owners.
  _publicShape(
    book: {
      id: string;
      authorId: string;
      title: string;
      subtitle: string | null;
      description: string;
      aboutTheAuthor: string | null;
      coverImageUrl: string;
      backCoverImageUrl: string | null;
      pdfUrl: string;
      pageCount: number | null;
      language: string;
      genre: BookGenre;
      tags: string[];
      priceKobo: number;
      previewPages: number;
      status: BookStatus;
      totalSales: number;
      avgRating: number;
      reviewCount: number;
      publishedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      author?: {
        id: string;
        firstName: string;
        lastName: string;
        profilePicture: string | null;
        level: string;
        isVerified: boolean;
      };
    },
    isOwned: boolean = false,
  ) {
    const { pdfUrl, ...rest } = book;
    return {
      ...rest,
      // Only the owner / buyer sees the pdfUrl here; everyone else gets nothing
      pdfUrl: isOwned || book.authorId === (book as { _viewerId?: string })._viewerId ? pdfUrl : undefined,
      isOwned,
    };
  },

  // ── Read-access gate ────────────────────────────────────────────────────────
  // Returns either the full PDF URL (purchased / owner) or a preview payload
  // so the frontend knows to render only pages 1..previewPages.

  async getReadUrl(userId: string | undefined, bookId: string) {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        authorId: true,
        pdfUrl: true,
        priceKobo: true,
        previewPages: true,
        status: true,
      },
    });
    if (!book) throw new NotFoundError('Book not found');
    if (book.status === 'DRAFT' && book.authorId !== userId) {
      throw new NotFoundError('Book not found');
    }

    const isAuthor = book.authorId === userId;
    const hasPurchased = userId
      ? !!(await prisma.bookPurchase.findUnique({
          where: { userId_bookId: { userId, bookId } },
        }))
      : false;
    const isFree = book.priceKobo === 0;

    const fullAccess = isAuthor || hasPurchased || isFree;

    return {
      url: book.pdfUrl,
      fullAccess,
      previewPages: fullAccess ? null : book.previewPages,
    };
  },

  // ── Purchase flow ───────────────────────────────────────────────────────────

  async initiatePurchase(userId: string, bookId: string, callbackUrl?: string) {
    const [user, book] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.book.findUnique({ where: { id: bookId } }),
    ]);
    if (!user) throw new NotFoundError('User not found');
    if (!book || book.status !== 'PUBLISHED') throw new NotFoundError('Book not available');
    if (book.authorId === userId) throw new BadRequestError('Cannot purchase your own book');
    if (book.priceKobo === 0) throw new BadRequestError('This book is free — open it directly');

    // Block duplicate purchase
    const existing = await prisma.bookPurchase.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    if (existing) throw new BadRequestError('You already own this book');

    const reference = `bk-${userId.slice(-6)}-${bookId.slice(-6)}-${Date.now()}`;

    const response = await paystackRequest<PaystackInitData>('POST', '/transaction/initialize', {
      email: user.email,
      amount: book.priceKobo,
      reference,
      callback_url: callbackUrl ?? env.CLIENT_URL,
      metadata: {
        type: 'BOOK_PURCHASE',
        userId,
        bookId,
      },
    });

    if (!response.status) throw new AppError('Payment initialization failed', 502);

    return {
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference: response.data.reference,
      amountKobo: book.priceKobo,
    };
  },

  /**
   * Complete a book purchase (called from the Paystack webhook when metadata.type
   * === 'BOOK_PURCHASE'). Idempotent on paystackRef.
   *
   * On success:
   *   - Creates BookPurchase
   *   - Credits the author's wallet with 85% of the sale
   *   - Records a WalletTx
   *   - Increments Book.totalSales
   *   - Sends the author an in-app notification
   */
  async completePurchase(params: {
    userId: string;
    bookId: string;
    reference: string;
    amountKobo: number;
  }) {
    const { userId, bookId, reference, amountKobo } = params;

    // Idempotency check
    const existing = await prisma.bookPurchase.findUnique({ where: { paystackRef: reference } });
    if (existing) return existing;

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundError('Book not found');

    const { platformFeeKobo, authorPayoutKobo } = splitPurchaseAmount(amountKobo);

    const purchase = await prisma.$transaction(async (tx) => {
      // Ensure the author has a wallet
      const wallet = await tx.wallet.upsert({
        where: { userId: book.authorId },
        create: { userId: book.authorId, balanceKobo: authorPayoutKobo, lifetimeEarningsKobo: authorPayoutKobo },
        update: {
          balanceKobo: { increment: authorPayoutKobo },
          lifetimeEarningsKobo: { increment: authorPayoutKobo },
        },
      });

      const bp = await tx.bookPurchase.create({
        data: {
          userId,
          bookId,
          amountKobo,
          platformFeeKobo,
          authorPayoutKobo,
          paystackRef: reference,
        },
      });

      await tx.walletTx.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.CREDIT_SALE,
          amountKobo: authorPayoutKobo,
          description: `Sale: "${book.title}"`,
          reference: bp.id,
        },
      });

      await tx.book.update({
        where: { id: bookId },
        data: { totalSales: { increment: 1 } },
      });

      return bp;
    });

    // Fire-and-forget: let the author know they made a sale
    void notificationsService.create({
      recipientId: book.authorId,
      actorId: userId,
      type: 'SYSTEM',
      entityType: 'Book',
      entityId: bookId,
      content: `bought your book "${book.title}" — ₦${(authorPayoutKobo / 100).toLocaleString()} credited`,
    });

    return purchase;
  },

  async listPurchasedBooks(userId: string, cursor?: string, limit = 20) {
    const rows = await prisma.bookPurchase.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        book: { include: { author: { select: AUTHOR_SELECT } } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((r) => ({ ...this._publicShape(r.book, true), purchasedAt: r.createdAt })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  },

  async listMyBooks(authorId: string) {
    const rows = await prisma.book.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: AUTHOR_SELECT } },
    });
    // Author always sees their own pdfUrl
    return rows.map((b) => ({ ...this._publicShape(b, true) }));
  },

  // ── Reviews ─────────────────────────────────────────────────────────────────

  async createReview(userId: string, bookId: string, dto: CreateReviewDto) {
    const purchased = await prisma.bookPurchase.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    if (!purchased) throw new ForbiddenError('Only buyers can review this book');

    const review = await prisma.bookReview.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: { userId, bookId, rating: dto.rating, content: dto.content },
      update: { rating: dto.rating, content: dto.content },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });

    // Recompute avgRating on the book row
    const agg = await prisma.bookReview.aggregate({
      where: { bookId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.book.update({
      where: { id: bookId },
      data: {
        avgRating: agg._avg.rating ?? 0,
        reviewCount: agg._count._all,
      },
    });

    return review;
  },

  async listReviews(bookId: string, cursor?: string, limit = 20) {
    const rows = await prisma.bookReview.findMany({
      where: { bookId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  // ── Reading progress ────────────────────────────────────────────────────────

  async updateProgress(userId: string, bookId: string, lastPage: number) {
    // Only track progress for owners / purchasers
    const access = await this.getReadUrl(userId, bookId);
    if (!access.fullAccess) return null;

    return prisma.bookProgress.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: { userId, bookId, lastPage, lastReadAt: new Date() },
      update: { lastPage, lastReadAt: new Date() },
    });
  },

  async getProgress(userId: string, bookId: string) {
    return prisma.bookProgress.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
  },

  async addHighlight(userId: string, bookId: string, highlight: string) {
    const existing = await prisma.bookProgress.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    const next = [...(existing?.highlights ?? []), highlight];

    return prisma.bookProgress.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: { userId, bookId, highlights: next, lastReadAt: new Date() },
      update: { highlights: next, lastReadAt: new Date() },
    });
  },
};
