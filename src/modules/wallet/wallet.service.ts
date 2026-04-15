import { prisma } from '../../config/prisma';

export const walletService = {
  /**
   * Get (or lazily create) the caller's wallet with recent transactions.
   * Creating on-read means authors always have a wallet waiting when their
   * first sale lands; no race condition where a credit has nowhere to go.
   */
  async getMyWallet(userId: string) {
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const transactions = await prisma.walletTx.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      id: wallet.id,
      balanceKobo: wallet.balanceKobo,
      lifetimeEarningsKobo: wallet.lifetimeEarningsKobo,
      bankName: wallet.bankName,
      bankCode: wallet.bankCode,
      accountNumber: wallet.accountNumber,
      accountName: wallet.accountName,
      hasBank: !!wallet.accountNumber,
      transactions,
    };
  },

  async listTransactions(userId: string, cursor?: string, limit = 20) {
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const rows = await prisma.walletTx.findMany({
      where: { walletId: wallet.id },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },
};
