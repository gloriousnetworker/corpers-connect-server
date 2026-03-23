import { Request, Response, NextFunction } from 'express';
import { subscriptionsService } from './subscriptions.service';
import {
  initializeSubscriptionSchema,
  verifyPaymentSchema,
} from './subscriptions.validation';
import { ValidationError } from '../../shared/utils/errors';

export const subscriptionsController = {
  // ── GET /subscriptions/plans ───────────────────────────────────────────────

  getPlans(_req: Request, res: Response) {
    res.json({ status: 'success', data: subscriptionsService.getPlans() });
  },

  // ── POST /subscriptions/initialize ────────────────────────────────────────

  async initializePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = initializeSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await subscriptionsService.initializePayment(req.user!.id, parsed.data);
      res.status(201).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /subscriptions/verify?reference=xxx ────────────────────────────────

  async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = verifyPaymentSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const subscription = await subscriptionsService.verifyPayment(req.user!.id, parsed.data);
      res.json({ status: 'success', data: subscription });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /subscriptions/webhook ────────────────────────────────────────────

  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      if (!signature) {
        res.status(400).json({ status: 'error', message: 'Missing signature' });
        return;
      }
      const rawBody = req.rawBody;
      if (!rawBody) {
        res.status(400).json({ status: 'error', message: 'Missing raw body' });
        return;
      }
      const result = await subscriptionsService.handleWebhook(rawBody, signature);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // ── GET /subscriptions/me ─────────────────────────────────────────────────

  async getCurrentSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const subscription = await subscriptionsService.getCurrentSubscription(req.user!.id);
      res.json({ status: 'success', data: subscription });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /subscriptions/history ────────────────────────────────────────────

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await subscriptionsService.getHistory(req.user!.id);
      res.json({ status: 'success', data: history });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /subscriptions/cancel ────────────────────────────────────────────

  async cancelSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const subscription = await subscriptionsService.cancelSubscription(req.user!.id);
      res.json({ status: 'success', data: subscription });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /subscriptions/level ──────────────────────────────────────────────

  async getLevel(req: Request, res: Response, next: NextFunction) {
    try {
      const level = await subscriptionsService.getLevel(req.user!.id);
      res.json({ status: 'success', data: level });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /subscriptions/level/check ──────────────────────────────────────

  async checkLevel(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await subscriptionsService.checkAndUpdateLevel(req.user!.id);
      res.json({ status: 'success', data: user });
    } catch (err) {
      next(err);
    }
  },
};
