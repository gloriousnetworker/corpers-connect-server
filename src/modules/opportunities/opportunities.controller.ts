import { Request, Response, NextFunction } from 'express';
import { opportunitiesService } from './opportunities.service';
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  listOpportunitiesSchema,
  applyToOpportunitySchema,
  updateApplicationStatusSchema,
  listApplicationsSchema,
} from './opportunities.validation';
import { uploadDocumentToCloudinary, cvUpload } from '../../shared/middleware/upload.middleware';
import { AppError, ValidationError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const opportunitiesController = {
  // ── Create Opportunity ────────────────────────────────────────────────────

  async createOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createOpportunitySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const opportunity = await opportunitiesService.createOpportunity(req.user!.id, parsed.data);
      res.status(201).json({ status: 'success', data: opportunity });
    } catch (err) {
      next(err);
    }
  },

  // ── List Opportunities ────────────────────────────────────────────────────

  async getOpportunities(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listOpportunitiesSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await opportunitiesService.getOpportunities(parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Get Single Opportunity ────────────────────────────────────────────────

  async getOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      const opportunity = await opportunitiesService.getOpportunity(p(req.params.opportunityId));
      res.json({ status: 'success', data: opportunity });
    } catch (err) {
      next(err);
    }
  },

  // ── My Posted Opportunities ───────────────────────────────────────────────

  async getMyOpportunities(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listOpportunitiesSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await opportunitiesService.getMyOpportunities(req.user!.id, parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Update Opportunity ────────────────────────────────────────────────────

  async updateOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateOpportunitySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const opportunity = await opportunitiesService.updateOpportunity(
        p(req.params.opportunityId),
        req.user!.id,
        parsed.data,
      );
      res.json({ status: 'success', data: opportunity });
    } catch (err) {
      next(err);
    }
  },

  // ── Delete Opportunity ────────────────────────────────────────────────────

  async deleteOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      await opportunitiesService.deleteOpportunity(p(req.params.opportunityId), req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Save Opportunity ──────────────────────────────────────────────────────

  async saveOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      await opportunitiesService.saveOpportunity(req.user!.id, p(req.params.opportunityId));
      res.json({ status: 'success', data: null, message: 'Opportunity saved' });
    } catch (err) {
      next(err);
    }
  },

  // ── Unsave Opportunity ────────────────────────────────────────────────────

  async unsaveOpportunity(req: Request, res: Response, next: NextFunction) {
    try {
      await opportunitiesService.unsaveOpportunity(req.user!.id, p(req.params.opportunityId));
      res.json({ status: 'success', data: null, message: 'Opportunity unsaved' });
    } catch (err) {
      next(err);
    }
  },

  // ── Saved Opportunities ───────────────────────────────────────────────────

  async getSavedOpportunities(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listOpportunitiesSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await opportunitiesService.getSavedOpportunities(req.user!.id, parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Apply to Opportunity ──────────────────────────────────────────────────

  applyToOpportunity(req: Request, res: Response, next: NextFunction) {
    cvUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        const parsed = applyToOpportunitySchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

        let cvUrl: string | undefined;
        if (req.file) {
          cvUrl = await uploadDocumentToCloudinary(req.file.buffer, 'corpers-connect/cvs');
        }

        const application = await opportunitiesService.applyToOpportunity(
          p(req.params.opportunityId),
          req.user!.id,
          parsed.data,
          cvUrl,
        );
        res.status(201).json({ status: 'success', data: application });
      } catch (applyErr) {
        next(applyErr);
      }
    });
  },

  // ── Applications for an Opportunity (author view) ─────────────────────────

  async getApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listApplicationsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await opportunitiesService.getApplications(
        p(req.params.opportunityId),
        req.user!.id,
        parsed.data,
      );
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── My Applications (applicant view) ─────────────────────────────────────

  async getMyApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listApplicationsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await opportunitiesService.getMyApplications(req.user!.id, parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Update Application Status (author view) ───────────────────────────────

  async updateApplicationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateApplicationStatusSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const application = await opportunitiesService.updateApplicationStatus(
        p(req.params.applicationId),
        req.user!.id,
        parsed.data,
      );
      res.json({ status: 'success', data: application });
    } catch (err) {
      next(err);
    }
  },
};
