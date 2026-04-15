import { Router } from 'express';
import { walletController } from './wallet.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

/** GET /api/v1/wallet/me — wallet balance + lifetime earnings + recent tx */
router.get('/me', authenticate, walletController.getMine);

/** GET /api/v1/wallet/transactions — paginated wallet transaction history */
router.get('/transactions', authenticate, walletController.listTransactions);

export default router;
