import { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import { markReadSchema, listNotificationsSchema } from './notifications.validation';
import { ValidationError } from '../../shared/utils/errors';

export const notificationsController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listNotificationsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const data = await notificationsService.getNotifications(req.user!.id, parsed.data);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  unreadCount: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await notificationsService.getUnreadCount(req.user!.id);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  markRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = markReadSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const data = await notificationsService.markRead(req.user!.id, parsed.data.notificationIds);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  markAllRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await notificationsService.markAllRead(req.user!.id);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = Array.isArray(req.params.notificationId)
        ? req.params.notificationId[0]
        : req.params.notificationId;
      await notificationsService.deleteNotification(req.user!.id, notificationId);
      res.json({ status: 'success', data: null });
    } catch (err) {
      next(err);
    }
  },
};
