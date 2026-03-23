import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { notificationsController } from './notifications.controller';

const router = Router();

router.use(authenticate);

// GET    /api/v1/notifications            — list (cursor-paginated)
router.get('/', notificationsController.list);

// GET    /api/v1/notifications/unread-count
router.get('/unread-count', notificationsController.unreadCount);

// POST   /api/v1/notifications/read       — mark specific IDs as read
router.post('/read', notificationsController.markRead);

// POST   /api/v1/notifications/read-all   — mark all as read
router.post('/read-all', notificationsController.markAllRead);

// DELETE /api/v1/notifications/:notificationId
router.delete('/:notificationId', notificationsController.delete);

export default router;
