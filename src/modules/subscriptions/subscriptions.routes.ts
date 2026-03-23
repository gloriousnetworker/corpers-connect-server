import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { subscriptionsController } from './subscriptions.controller';

const router = Router();

// ── Webhook — HMAC verified via req.rawBody set by global express.json verify ─
router.post('/webhook', subscriptionsController.handleWebhook);

// ── Public plans list ─────────────────────────────────────────────────────────
router.get('/plans', subscriptionsController.getPlans);

// ── All remaining routes require authentication ───────────────────────────────
router.use(authenticate);

router.post('/initialize', subscriptionsController.initializePayment);
router.get('/verify', subscriptionsController.verifyPayment);
router.get('/me', subscriptionsController.getCurrentSubscription);
router.get('/history', subscriptionsController.getHistory);
router.post('/cancel', subscriptionsController.cancelSubscription);
router.get('/level', subscriptionsController.getLevel);
router.post('/level/check', subscriptionsController.checkLevel);

export default router;
