import { Router } from 'express';
import { authenticate, requireAdmin, requireSuperAdmin } from '../auth/auth.middleware';
import { adminController } from './admin.controller';

const router = Router();

// ── Public: Admin Auth ────────────────────────────────────────────────────────
router.post('/auth/login', adminController.login);
router.post('/auth/logout', adminController.logout);
router.get('/auth/me', adminController.me);
// 2FA challenge is public (called before admin JWT is issued)
router.post('/auth/2fa/challenge', adminController.complete2FAChallenge);

// ── All remaining routes require admin JWT ────────────────────────────────────
router.use(authenticate, requireAdmin);

// ── 2FA setup & management (requires existing admin JWT) ─────────────────────
router.post('/auth/2fa/initiate', adminController.initiate2FASetup);
router.post('/auth/2fa/confirm', adminController.confirm2FASetup);
router.delete('/auth/2fa', adminController.disable2FA);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ── User Management ───────────────────────────────────────────────────────────
router.get('/users', adminController.listUsers);
router.get('/users/:userId', adminController.getUser);
router.patch('/users/:userId/suspend', adminController.suspendUser);
router.patch('/users/:userId/reactivate', adminController.reactivateUser);
router.patch('/users/:userId/verify', adminController.verifyUser);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/users/:userId/subscription', adminController.grantSubscription);
router.delete('/users/:userId/subscription', adminController.revokeSubscription);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', adminController.listReports);
router.get('/reports/:reportId', adminController.getReport);
router.patch('/reports/:reportId', adminController.reviewReport);

// ── Seller Applications ───────────────────────────────────────────────────────
router.get('/seller-applications', adminController.listSellerApplications);
router.patch('/seller-applications/:appId/approve', adminController.approveSellerApplication);
router.patch('/seller-applications/:appId/reject', adminController.rejectSellerApplication);

// ── System Settings ───────────────────────────────────────────────────────────
router.get('/settings', adminController.getSettings);
router.put('/settings/:key', adminController.upsertSetting);

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', adminController.getAuditLogs);

// ── Admin Management (SUPERADMIN only) ────────────────────────────────────────
router.get('/admins', requireSuperAdmin, adminController.listAdmins);
router.post('/admins', requireSuperAdmin, adminController.createAdmin);
router.patch('/admins/:adminId/deactivate', requireSuperAdmin, adminController.deactivateAdmin);

// ── Cleanup: delete all join requests + approved corpers (SUPERADMIN only) ───
router.delete('/cleanup/join-requests', requireSuperAdmin, adminController.cleanupJoinRequests);

export default router;
