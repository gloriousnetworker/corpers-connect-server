import { Request, Response, NextFunction } from 'express';
import { discoverService } from './discover.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { paginationSchema, searchSchema } from '../users/users.validation';

export const discoverController = {
  async getCorpersInState(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await discoverService.getCorpersInState(req.user!.id, cursor, limit);
      sendSuccess(res, data, 'Corpers in your state retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit } = paginationSchema.parse(req.query);
      const data = await discoverService.getSuggestions(req.user!.id, limit);
      sendSuccess(res, data, 'Suggestions retrieved');
    } catch (err) {
      next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, cursor, limit } = searchSchema.parse(req.query);
      const data = await discoverService.search(req.user?.id, q, cursor, limit);
      sendSuccess(res, data, 'Search results retrieved');
    } catch (err) {
      next(err);
    }
  },
};
