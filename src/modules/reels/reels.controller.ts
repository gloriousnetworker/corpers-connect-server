import { Request, Response, NextFunction } from 'express';
import { reelsService } from './reels.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { paginationSchema } from '../posts/posts.validation';
import { uploadMediaToCloudinary } from '../../shared/middleware/upload.middleware';
import { PostVisibility } from '@prisma/client';
import { z } from 'zod';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

const createReelSchema = z.object({
  caption: z.string().max(2000).optional(),
  visibility: z.nativeEnum(PostVisibility).default(PostVisibility.PUBLIC),
});

export const reelsController = {
  async createReel(req: Request, res: Response, next: NextFunction) {
    try {
      const { caption, visibility } = createReelSchema.parse(req.body);
      if (!req.file) {
        res.status(400).json({ message: 'Media file is required' });
        return;
      }
      const { url, mediaType } = await uploadMediaToCloudinary(
        req.file.buffer,
        'corpers-connect/reels',
      );
      const reel = await reelsService.createReel(req.user!.id, url, mediaType, caption, visibility);
      sendSuccess(res, reel, 'Reel created', 201);
    } catch (err) {
      next(err);
    }
  },

  async getReelsFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await reelsService.getReelsFeed(req.user!.id, cursor, limit);
      sendSuccess(res, data, 'Reels feed retrieved');
    } catch (err) {
      next(err);
    }
  },

  async exploreReels(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await reelsService.exploreReels(req.user!.id, cursor, limit);
      sendSuccess(res, data, 'Explore reels retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getReel(req: Request, res: Response, next: NextFunction) {
    try {
      const reel = await reelsService.getReel(p(req.params.reelId));
      sendSuccess(res, reel, 'Reel retrieved');
    } catch (err) {
      next(err);
    }
  },
};
