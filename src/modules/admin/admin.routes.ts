import { Router } from 'express';
import { authenticate, requireAdmin, requireSuperAdmin } from '../auth/auth.middleware';
import { adminController } from './admin.controller';

const router = Router();

// ── Public: Admin Login ───────────────────────────────────────────────────────
router.post('/auth/login', adminController.login);

// ── All remaining routes require admin JWT ────────────────────────────────────
router.use(authenticate, requireAdmin);

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

export default router;
