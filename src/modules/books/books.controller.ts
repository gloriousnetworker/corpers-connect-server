import { Request, Response, NextFunction } from 'express';
import { booksService } from './books.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import {
  createBookSchema,
  updateBookSchema,
  bookListSchema,
  initiatePurchaseSchema,
  createReviewSchema,
  updateProgressSchema,
  addHighlightSchema,
} from './books.validation';
import {
  uploadToCloudinary,
  uploadDocumentToCloudinary,
} from '../../shared/middleware/upload.middleware';
import { AppError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const booksController = {
  /**
   * POST /api/v1/books
   * multipart: cover (image), pdf (PDF), backCover? (image), body fields (metadata)
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as
        | {
            cover?: Express.Multer.File[];
            pdf?: Express.Multer.File[];
            backCover?: Express.Multer.File[];
          }
        | undefined;

      if (!files?.cover?.[0]) throw new AppError('Cover image is required', 400);
      if (!files?.pdf?.[0]) throw new AppError('PDF file is required', 400);

      const dto = createBookSchema.parse({
        ...req.body,
        tags: req.body.tags
          ? typeof req.body.tags === 'string'
            ? JSON.parse(req.body.tags)
            : req.body.tags
          : [],
      });

      const [coverImageUrl, pdfUrl, backCoverImageUrl] = await Promise.all([
        uploadToCloudinary(files.cover[0].buffer, 'corpers-connect/books/covers', {
          width: 800,
          quality: 'auto',
          crop: 'limit',
        }),
        uploadDocumentToCloudinary(files.pdf[0].buffer, 'corpers-connect/books/pdfs'),
        files.backCover?.[0]
          ? uploadToCloudinary(files.backCover[0].buffer, 'corpers-connect/books/covers', {
              width: 800,
              quality: 'auto',
              crop: 'limit',
            })
          : Promise.resolve(undefined),
      ]);

      const book = await booksService.createBook(req.user!.id, dto, {
        coverImageUrl,
        pdfUrl,
        backCoverImageUrl,
      });
      sendSuccess(res, book, 'Book published', 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updateBookSchema.parse(req.body);
      const book = await booksService.updateBook(req.user!.id, p(req.params.bookId), dto);
      sendSuccess(res, book, 'Book updated');
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await booksService.deleteBook(req.user!.id, p(req.params.bookId));
      sendSuccess(res, result, 'Book deleted');
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = bookListSchema.parse(req.query);
      const data = await booksService.listBooks(req.user?.id, dto);
      sendSuccess(res, data, 'Books retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const book = await booksService.getBook(req.user?.id, p(req.params.bookId));
      sendSuccess(res, book, 'Book retrieved');
    } catch (err) {
      next(err);
    }
  },

  /** GET /books/:bookId/read — returns { url, fullAccess, previewPages } */
  async getReadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await booksService.getReadUrl(req.user?.id, p(req.params.bookId));
      sendSuccess(res, data, 'Read URL retrieved');
    } catch (err) {
      next(err);
    }
  },

  /** POST /books/:bookId/purchase — initialize Paystack transaction */
  async initiatePurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = initiatePurchaseSchema.parse(req.body);
      const data = await booksService.initiatePurchase(
        req.user!.id,
        p(req.params.bookId),
        dto.callbackUrl,
      );
      sendSuccess(res, data, 'Purchase initiated');
    } catch (err) {
      next(err);
    }
  },

  async myLibrary(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const data = await booksService.listPurchasedBooks(
        req.user!.id,
        cursor,
        limit ? Number(limit) : 20,
      );
      sendSuccess(res, data, 'Library retrieved');
    } catch (err) {
      next(err);
    }
  },

  async myPublished(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await booksService.listMyBooks(req.user!.id);
      sendSuccess(res, data, 'Published books retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Reviews ────────────────────────────────────────────────────────────────

  async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = createReviewSchema.parse(req.body);
      const review = await booksService.createReview(req.user!.id, p(req.params.bookId), dto);
      sendSuccess(res, review, 'Review saved');
    } catch (err) {
      next(err);
    }
  },

  async listReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const data = await booksService.listReviews(
        p(req.params.bookId),
        cursor,
        limit ? Number(limit) : 20,
      );
      sendSuccess(res, data, 'Reviews retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Progress + highlights ──────────────────────────────────────────────────

  async updateProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updateProgressSchema.parse(req.body);
      const progress = await booksService.updateProgress(
        req.user!.id,
        p(req.params.bookId),
        dto.lastPage,
      );
      sendSuccess(res, progress, 'Progress saved');
    } catch (err) {
      next(err);
    }
  },

  async getProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const progress = await booksService.getProgress(req.user!.id, p(req.params.bookId));
      sendSuccess(res, progress, 'Progress retrieved');
    } catch (err) {
      next(err);
    }
  },

  async addHighlight(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = addHighlightSchema.parse(req.body);
      const progress = await booksService.addHighlight(
        req.user!.id,
        p(req.params.bookId),
        dto.highlight,
      );
      sendSuccess(res, progress, 'Highlight added');
    } catch (err) {
      next(err);
    }
  },
};
