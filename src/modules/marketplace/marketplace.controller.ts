import { Request, Response, NextFunction } from 'express';
import { marketplaceService } from './marketplace.service';
import { adminService } from '../admin/admin.service';
import {
  applySellerSchema,
  createListingSchema,
  updateListingSchema,
  listListingsSchema,
  createReviewSchema,
  listReviewsSchema,
  createListingCommentSchema,
  updateListingCommentSchema,
  listListingCommentsSchema,
} from './marketplace.validation';
import {
  idDocUpload,
  listingImagesUpload,
  uploadToCloudinary,
} from '../../shared/middleware/upload.middleware';
import { AppError, ValidationError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const marketplaceController = {
  // ── Seller Application ──────────────────────────────────────────────────────

  applyAsSeller(req: Request, res: Response, next: NextFunction) {
    idDocUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        if (!req.file) throw new AppError('ID document image is required', 400);

        const parsed = applySellerSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

        const idDocUrl = await uploadToCloudinary(
          req.file.buffer,
          'corpers_connect/id_docs',
          { quality: 'auto', format: 'webp' },
        );
        const data = await marketplaceService.applyAsSeller(req.user!.id, idDocUrl, parsed.data);
        res.status(201).json({ status: 'success', data });
      } catch (e) {
        next(e);
      }
    });
  },

  async getMyApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.getMyApplication(req.user!.id);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  // ── Seller Profile ─────────────────────────────────────────────────────────

  async getSellerProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.getSellerProfile(p(req.params.userId));
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getMySellerProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.getMySellerProfile(req.user!.id);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getSellerListings(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const data = await marketplaceService.getSellerListings(p(req.params.userId), cursor, limit);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  // ── Listings ────────────────────────────────────────────────────────────────

  createListing(req: Request, res: Response, next: NextFunction) {
    listingImagesUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        const parsed = createListingSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) throw new AppError('At least one image is required', 400);

        const imageUrls = await Promise.all(
          files.map((f) =>
            uploadToCloudinary(f.buffer, 'corpers_connect/listings', {
              width: 800,
              height: 800,
              crop: 'limit',
              quality: 'auto',
              format: 'webp',
            }),
          ),
        );

        const data = await marketplaceService.createListing(req.user!.id, parsed.data, imageUrls);
        res.status(201).json({ status: 'success', data });
      } catch (e) {
        next(e);
      }
    });
  },

  async listListings(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listListingsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await marketplaceService.getListings(req.user?.id, parsed.data);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getListing(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.getListing(req.user?.id, p(req.params.listingId));
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getMyListings(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const data = await marketplaceService.getMyListings(req.user!.id, cursor, limit);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async updateListing(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateListingSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await marketplaceService.updateListing(req.user!.id, p(req.params.listingId), parsed.data);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async deleteListing(req: Request, res: Response, next: NextFunction) {
    try {
      await marketplaceService.deleteListing(req.user!.id, p(req.params.listingId));
      res.json({ status: 'success', data: null });
    } catch (err) {
      next(err);
    }
  },

  // ── Inquiries ────────────────────────────────────────────────────────────────

  async inquire(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.inquire(req.user!.id, p(req.params.listingId));
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getListingInquiries(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const data = await marketplaceService.getListingInquiries(
        req.user!.id,
        p(req.params.listingId),
        cursor,
        limit,
      );
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  // ── Reviews ──────────────────────────────────────────────────────────────────

  async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createReviewSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.errors[0].message));
      const data = await marketplaceService.createReview(req.user!.id, p(req.params.listingId), parsed.data);
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getListingReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listReviewsSchema.safeParse(req.query);
      if (!parsed.success) return next(new ValidationError(parsed.error.errors[0].message));
      const data = await marketplaceService.getListingReviews(p(req.params.listingId), parsed.data);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async deleteReview(req: Request, res: Response, next: NextFunction) {
    try {
      await marketplaceService.deleteReview(req.user!.id, p(req.params.reviewId));
      res.json({ status: 'success', data: null });
    } catch (err) {
      next(err);
    }
  },

  // ── Listing Comments (Bidding) ──────────────────────────────────────────────

  async createListingComment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createListingCommentSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await marketplaceService.createListingComment(
        req.user!.id,
        p(req.params.listingId),
        parsed.data,
      );
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getListingComments(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listListingCommentsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await marketplaceService.getListingComments(
        p(req.params.listingId),
        parsed.data.cursor,
        parsed.data.limit,
      );
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async updateListingComment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateListingCommentSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await marketplaceService.updateListingComment(
        req.user!.id,
        p(req.params.commentId),
        parsed.data,
      );
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async deleteListingComment(req: Request, res: Response, next: NextFunction) {
    try {
      await marketplaceService.deleteListingComment(req.user!.id, p(req.params.commentId));
      res.json({ status: 'success', data: null });
    } catch (err) {
      next(err);
    }
  },

  // ── Marketplace Conversations ───────────────────────────────────────────────

  async startMarketplaceChat(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.startMarketplaceChat(req.user!.id, p(req.params.listingId));
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getMarketplaceConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const data = await marketplaceService.getMarketplaceConversations(req.user!.id, cursor, limit);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getMarketplaceConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await marketplaceService.getMarketplaceConversation(
        req.user!.id,
        p(req.params.conversationId),
      );
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async submitAppeal(req: Request, res: Response, next: NextFunction) {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length < 10) {
        res.status(400).json({ status: 'error', message: 'Appeal message must be at least 10 characters' });
        return;
      }
      const appeal = await marketplaceService.submitAppeal(req.user!.id, message.trim());
      res.status(201).json({ status: 'success', data: appeal, message: 'Appeal submitted successfully' });
    } catch (err) {
      next(err);
    }
  },

  async getMyAppeals(req: Request, res: Response, next: NextFunction) {
    try {
      const appeals = await marketplaceService.getMyAppeals(req.user!.id);
      res.json({ status: 'success', data: appeals });
    } catch (err) {
      next(err);
    }
  },

  async getAppealMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const messages = await marketplaceService.getAppealMessages(p(req.params.appealId), req.user!.id);
      res.json({ status: 'success', data: messages });
    } catch (err) {
      next(err);
    }
  },

  async replyToAppeal(req: Request, res: Response, next: NextFunction) {
    try {
      const { content } = req.body as { content?: string };
      if (!content || typeof content !== 'string' || content.trim().length < 1) {
        res.status(400).json({ status: 'error', message: 'Reply cannot be empty' });
        return;
      }
      const data = await adminService.sellerReplyToAppeal(p(req.params.appealId), req.user!.id, content.trim());
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },
};
