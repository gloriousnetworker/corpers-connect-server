import { Request, Response, NextFunction } from 'express';
import { joinRequestsService } from './join-requests.service';
import { submitJoinRequestSchema, reviewJoinRequestSchema } from './join-requests.validation';
import { uploadToCloudinary } from '../../shared/middleware/upload.middleware';
import { ValidationError } from '../../shared/utils/errors';

export const joinRequestsController = {
  // ── Public: submit a join request ─────────────────────────────────────────

  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('NYSC posting letter document is required');
      }

      const dto = submitJoinRequestSchema.parse(req.body);

      // Upload document to Cloudinary (no resize — keep original quality for admin review)
      const documentUrl = await uploadToCloudinary(file.buffer, 'corpers_connect/join_docs', {
        quality: 'auto',
        format: 'auto',
      });

      const data = await joinRequestsService.submit(dto, documentUrl);

      res.status(201).json({
        success: true,
        data,
        message: 'Your request has been submitted. You will receive an email once reviewed.',
      });
    } catch (err) {
      next(err);
    }
  },

  // ── Public: check request status by email ─────────────────────────────────

  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const email = req.query.email as string;
      if (!email) {
        throw new ValidationError('Email is required');
      }

      const data = await joinRequestsService.getStatusByEmail(email);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: list join requests ─────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, cursor, limit } = req.query as Record<string, string>;
      const data = await joinRequestsService.list(
        status || undefined,
        cursor || undefined,
        limit ? parseInt(limit, 10) : undefined,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: approve ────────────────────────────────────────────────────────

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const { reviewNote } = reviewJoinRequestSchema.parse(req.body);
      const requestId = req.params.requestId as string;
      const data = await joinRequestsService.approve(requestId, req.user!.id, reviewNote);
      res.json({ success: true, data, message: 'Join request approved' });
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: reject ─────────────────────────────────────────────────────────

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const { reviewNote } = reviewJoinRequestSchema.parse(req.body);
      const requestId = req.params.requestId as string;
      const data = await joinRequestsService.reject(requestId, req.user!.id, reviewNote);
      res.json({ success: true, data, message: 'Join request rejected' });
    } catch (err) {
      next(err);
    }
  },
};
