import { Request, Response, NextFunction } from 'express';
import { marketplaceService } from './marketplace.service';
import {
  createListingSchema,
  updateListingSchema,
  listListingsSchema,
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
        const idDocUrl = await uploadToCloudinary(
          req.file.buffer,
          'corpers_connect/id_docs',
          { quality: 'auto', format: 'webp' },
        );
        const data = await marketplaceService.applyAsSeller(req.user!.id, idDocUrl);
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
};
