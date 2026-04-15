import { Request, Response, NextFunction } from 'express';
import { walletService } from './wallet.service';
import { sendSuccess } from '../../shared/utils/apiResponse';

export const walletController = {
  async getMine(req: Request, res: Response, next: NextFunction) {
    try {
      const wallet = await walletService.getMyWallet(req.user!.id);
      sendSuccess(res, wallet, 'Wallet retrieved');
    } catch (err) {
      next(err);
    }
  },

  async listTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const data = await walletService.listTransactions(
        req.user!.id,
        cursor,
        limit ? Number(limit) : 20,
      );
      sendSuccess(res, data, 'Transactions retrieved');
    } catch (err) {
      next(err);
    }
  },
};
