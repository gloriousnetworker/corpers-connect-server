import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import {
  adminLoginSchema,
  listUsersSchema,
  grantSubscriptionSchema,
  suspendUserSchema,
  listReportsSchema,
  reviewReportSchema,
  listSellerApplicationsSchema,
  reviewSellerApplicationSchema,
  upsertSettingSchema,
  createAdminSchema,
} from './admin.validation';
import { ValidationError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);
const ip = (req: Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;

export const adminController = {
  // ── Auth ─────────────────────────────────────────────────────────────────────

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = adminLoginSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await adminService.login(parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getDashboard();
      res.json({ status: 'success', data: stats });
    } catch (err) {
      next(err);
    }
  },

  // ── User Management ───────────────────────────────────────────────────────────

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listUsersSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await adminService.listUsers(parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await adminService.getUser(p(req.params.userId));
      res.json({ status: 'success', data: user });
    } catch (err) {
      next(err);
    }
  },

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = suspendUserSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      await adminService.suspendUser(p(req.params.userId), req.user!.id, parsed.data, ip(req));
      res.json({ status: 'success', data: null, message: 'User suspended' });
    } catch (err) {
      next(err);
    }
  },

  async reactivateUser(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.reactivateUser(p(req.params.userId), req.user!.id, ip(req));
      res.json({ status: 'success', data: null, message: 'User reactivated' });
    } catch (err) {
      next(err);
    }
  },

  async verifyUser(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.verifyUser(p(req.params.userId), req.user!.id, ip(req));
      res.json({ status: 'success', data: null, message: 'User verified' });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.deleteUser(p(req.params.userId), req.user!.id, ip(req));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async grantSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = grantSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const subscription = await adminService.grantSubscription(
        p(req.params.userId),
        req.user!.id,
        parsed.data,
        ip(req),
      );
      res.json({ status: 'success', data: subscription });
    } catch (err) {
      next(err);
    }
  },

  async revokeSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.revokeSubscription(p(req.params.userId), req.user!.id, ip(req));
      res.json({ status: 'success', data: null, message: 'Subscription revoked' });
    } catch (err) {
      next(err);
    }
  },

  // ── Reports ──────────────────────────────────────────────────────────────────

  async listReports(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listReportsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await adminService.listReports(parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await adminService.getReport(p(req.params.reportId));
      res.json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  },

  async reviewReport(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = reviewReportSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const report = await adminService.reviewReport(
        p(req.params.reportId),
        req.user!.id,
        parsed.data,
        ip(req),
      );
      res.json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  },

  // ── Seller Applications ───────────────────────────────────────────────────────

  async listSellerApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listSellerApplicationsSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await adminService.listSellerApplications(parsed.data);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async approveSellerApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = reviewSellerApplicationSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const app = await adminService.approveSellerApplication(
        p(req.params.appId),
        req.user!.id,
        parsed.data,
        ip(req),
      );
      res.json({ status: 'success', data: app });
    } catch (err) {
      next(err);
    }
  },

  async rejectSellerApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = reviewSellerApplicationSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const app = await adminService.rejectSellerApplication(
        p(req.params.appId),
        req.user!.id,
        parsed.data,
        ip(req),
      );
      res.json({ status: 'success', data: app });
    } catch (err) {
      next(err);
    }
  },

  // ── System Settings ───────────────────────────────────────────────────────────

  async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await adminService.getSettings();
      res.json({ status: 'success', data: settings });
    } catch (err) {
      next(err);
    }
  },

  async upsertSetting(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = upsertSettingSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const setting = await adminService.upsertSetting(
        p(req.params.key),
        parsed.data,
        req.user!.id,
        ip(req),
      );
      res.json({ status: 'success', data: setting });
    } catch (err) {
      next(err);
    }
  },

  // ── Audit Logs ────────────────────────────────────────────────────────────────

  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await adminService.getAuditLogs(cursor, limit);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Admin Management (SUPERADMIN) ─────────────────────────────────────────────

  async listAdmins(_req: Request, res: Response, next: NextFunction) {
    try {
      const admins = await adminService.listAdmins();
      res.json({ status: 'success', data: admins });
    } catch (err) {
      next(err);
    }
  },

  async createAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createAdminSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const admin = await adminService.createAdmin(parsed.data, req.user!.id, ip(req));
      res.status(201).json({ status: 'success', data: admin });
    } catch (err) {
      next(err);
    }
  },

  async deactivateAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.deactivateAdmin(p(req.params.adminId), req.user!.id, ip(req));
      res.json({ status: 'success', data: null, message: 'Admin deactivated' });
    } catch (err) {
      next(err);
    }
  },
};
