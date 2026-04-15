import { Request, Response, NextFunction } from 'express';
import { campExperienceService } from './camp-experience.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { upsertCampDaySchema } from './camp-experience.validation';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const campExperienceController = {
  async upsertDay(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = upsertCampDaySchema.parse(req.body);
      const entry = await campExperienceService.upsertDay(req.user!.id, dto);
      sendSuccess(res, entry, 'Camp day saved');
    } catch (err) {
      next(err);
    }
  },

  async getMyDays(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await campExperienceService.getUserDays(req.user!.id, req.user!.id);
      sendSuccess(res, data, 'Camp experience retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getUserDays(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await campExperienceService.getUserDays(req.user?.id, p(req.params.userId));
      sendSuccess(res, data, 'Camp experience retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getDay(req: Request, res: Response, next: NextFunction) {
    try {
      const day = Number(p(req.params.dayNumber));
      const entry = await campExperienceService.getDay(req.user?.id, p(req.params.userId), day);
      sendSuccess(res, entry, 'Camp day retrieved');
    } catch (err) {
      next(err);
    }
  },

  async deleteDay(req: Request, res: Response, next: NextFunction) {
    try {
      const day = Number(p(req.params.dayNumber));
      await campExperienceService.deleteDay(req.user!.id, day);
      sendSuccess(res, null, 'Camp day deleted');
    } catch (err) {
      next(err);
    }
  },
};
