import { Request, Response, NextFunction, CookieOptions } from 'express';
import { adminService } from './admin.service';
import { env } from '../../config/env';
import { jwtService } from '../../shared/services/jwt.service';
import { UnauthorizedError } from '../../shared/utils/errors';
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
  deactivateSellerSchema,
  respondToAppealSchema,
  listSellersSchema,
} from './admin.validation';
import { ValidationError } from '../../shared/utils/errors';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);
const ip = (req: Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;

const ADMIN_SESSION_COOKIE = 'cc_admin_session';

function adminCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
}

export const adminController = {
  // ── Auth ─────────────────────────────────────────────────────────────────────

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = adminLoginSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      const result = await adminService.login(parsed.data);
      // When 2FA is required, return the challenge token without setting a
      // session cookie — the cookie is set only after TOTP verification.
      if (result.requires2FA) {
        return res.json({ status: 'success', data: result });
      }
      res.cookie(ADMIN_SESSION_COOKIE, result.accessToken, adminCookieOptions());
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      res.clearCookie(ADMIN_SESSION_COOKIE, { ...adminCookieOptions(), maxAge: 0 });
      res.json({ status: 'success', data: null, message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies[ADMIN_SESSION_COOKIE] as string | undefined;
      if (!token) throw new UnauthorizedError('No session cookie');

      // Verify the token and return admin user info so the frontend can hydrate
      // in-memory state after a page refresh without reading from localStorage.
      const payload = jwtService.verifyAccessToken(token);
      const role = (payload as { role?: string }).role;
      if (role !== 'ADMIN' && role !== 'SUPERADMIN') throw new UnauthorizedError('Not an admin');

      const admin = await adminService.getAdminById(payload.sub);
      res.json({ status: 'success', data: { token, admin } });
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

  async getSellerApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const app = await adminService.getSellerApplication(p(req.params.appId));
      res.json({ status: 'success', data: app });
    } catch (err) {
      next(err);
    }
  },

  async deactivateSeller(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = deactivateSellerSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

      await adminService.deactivateSeller(p(req.params.userId), req.user!.id, parsed.data, ip(req));
      res.json({ status: 'success', data: null, message: 'Seller deactivated' });
    } catch (err) {
      next(err);
    }
  },

  async reinstateSeller(req: Request, res: Response, next: NextFunction) {
    try {
      await adminService.reinstateSeller(p(req.params.userId), req.user!.id, ip(req));
      res.json({ status: 'success', data: null, message: 'Seller reinstated' });
    } catch (err) {
      next(err);
    }
  },

  async listSellers(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listSellersSchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      const { cursor, status, limit } = parsed.data;
      const data = await adminService.listSellers(cursor, status, limit);
      res.json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  },

  async getSellerAppeals(req: Request, res: Response, next: NextFunction) {
    try {
      const appeals = await adminService.getSellerAppeals(p(req.params.userId));
      res.json({ status: 'success', data: appeals });
    } catch (err) {
      next(err);
    }
  },

  async respondToAppeal(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = respondToAppealSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);
      await adminService.respondToAppeal(p(req.params.appealId), req.user!.id, parsed.data, ip(req));
      res.json({ status: 'success', data: null, message: 'Appeal response submitted' });
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

  // ── 2FA: complete challenge after password login ──────────────────────────────

  async complete2FAChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeToken, code } = req.body as { challengeToken?: string; code?: string };
      if (!challengeToken || !code) {
        return res.status(400).json({ status: 'error', message: 'challengeToken and code are required' });
      }
      const result = await adminService.complete2FAChallenge(challengeToken, code);
      res.cookie(ADMIN_SESSION_COOKIE, result.accessToken, adminCookieOptions());
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── 2FA: setup (initiate + confirm) — requires existing admin JWT ─────────────

  async initiate2FASetup(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminService.initiate2FASetup(req.user!.id);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async confirm2FASetup(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body as { code?: string };
      if (!code) return res.status(400).json({ status: 'error', message: 'code is required' });
      const result = await adminService.confirm2FASetup(req.user!.id, code);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  async disable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body as { code?: string };
      if (!code) return res.status(400).json({ status: 'error', message: 'code is required' });
      const result = await adminService.disable2FA(req.user!.id, code);
      res.json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  },

  // ── Cleanup: delete all join requests + approved corpers ───────────────────
  async cleanupJoinRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { prisma } = await import('../../config/prisma');
      const deletedJoinRequests = await prisma.joinRequest.deleteMany({});
      const deletedApproved = await prisma.approvedCorper.deleteMany({});
      res.json({
        status: 'success',
        data: {
          joinRequestsDeleted: deletedJoinRequests.count,
          approvedCorpersDeleted: deletedApproved.count,
        },
        message: 'All join requests and approved corper records have been cleared.',
      });
    } catch (err) {
      next(err);
    }
  },
};
