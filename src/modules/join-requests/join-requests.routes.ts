import { Router } from 'express';
import multer from 'multer';
import { joinRequestsController } from './join-requests.controller';
import { authenticate, requireAdmin } from '../auth/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Public routes (no auth) ─────────────────────────────────────────────────

/** POST /api/v1/join-requests
 *  Submit a join request. multipart/form-data, field: document (image/PDF).
 */
router.post('/', upload.single('document'), joinRequestsController.submit);

/** GET /api/v1/join-requests/status?email=...
 *  Check the status of a join request by email.
 */
router.get('/status', joinRequestsController.getStatus);

// ── Admin routes ────────────────────────────────────────────────────────────

/** GET /api/v1/join-requests/admin?status=PENDING&cursor=&limit=20
 *  List all join requests (admin only).
 */
router.get('/admin', authenticate, requireAdmin, joinRequestsController.list);

/** PATCH /api/v1/join-requests/admin/:requestId/approve
 *  Approve a join request (admin only).
 */
router.patch('/admin/:requestId/approve', authenticate, requireAdmin, joinRequestsController.approve);

/** PATCH /api/v1/join-requests/admin/:requestId/reject
 *  Reject a join request (admin only).
 */
router.patch('/admin/:requestId/reject', authenticate, requireAdmin, joinRequestsController.reject);

export default router;
