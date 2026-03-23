import { Request, Response, NextFunction } from 'express';
import { feedService } from './feed.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { paginationSchema } from '../posts/posts.validation';

export const feedController = {
  async getHomeFeed(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await feedService.getHomeFeed(req.user!.id, cursor, limit);
      sendSuccess(res, data, 'Feed retrieved');
    } catch (err) {
      next(err);
    }
  },
};
