import { Request, Response, NextFunction } from 'express';
import { callsService } from './calls.service';
import { initiateCallSchema, callHistorySchema } from './calls.validation';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ValidationError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const callsController = {
  // ── Initiate Call (REST fallback — socket is primary) ────────────────────────

  async initiateCall(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = initiateCallSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await callsService.initiateCall(req.user!.id, parsed.data);
      res.status(201).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Call Actions ─────────────────────────────────────────────────────────────

  async acceptCall(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.acceptCall(p(req.params.callId), req.user!.id);
      sendSuccess(res, data, 'Call accepted');
    } catch (err) {
      next(err);
    }
  },

  async rejectCall(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.rejectCall(p(req.params.callId), req.user!.id);
      sendSuccess(res, data, 'Call rejected');
    } catch (err) {
      next(err);
    }
  },

  async endCall(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.endCall(p(req.params.callId), req.user!.id);
      sendSuccess(res, data, 'Call ended');
    } catch (err) {
      next(err);
    }
  },

  async missCall(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.missCall(p(req.params.callId));
      sendSuccess(res, data, 'Call marked as missed');
    } catch (err) {
      next(err);
    }
  },

  // ── Token Refresh ─────────────────────────────────────────────────────────────

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.refreshToken(p(req.params.callId), req.user!.id);
      sendSuccess(res, data, 'Token refreshed');
    } catch (err) {
      next(err);
    }
  },

  // ── History ──────────────────────────────────────────────────────────────────

  async getCallHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = callHistorySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const data = await callsService.getCallHistory(req.user!.id, parsed.data);
      sendSuccess(res, data, 'Call history retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getCall(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await callsService.getCall(p(req.params.callId), req.user!.id);
      sendSuccess(res, data, 'Call retrieved');
    } catch (err) {
      next(err);
    }
  },
};
