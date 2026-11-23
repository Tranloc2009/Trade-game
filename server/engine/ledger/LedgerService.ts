import crypto from 'node:crypto';
import type { ILedgerRepository, IWalletRepository } from '../../../shared/contracts/interfaces';
import type { Holding, LedgerEntry, MarketClass, Wallet } from '../../../shared/contracts/types';
import { roundQty } from '../../../shared/contracts/money';
import { DomainError } from '../../domain/DomainError';

export const SYSTEM_ACCOUNTS = {
  TREASURY_ISSUANCE: 'SYS_TREASURY_ISSUANCE',
  FEE_REVENUE: 'SYS_FEE_REVENUE',
  BANK_RESERVE: 'SYS_BANK_RESERVE',
  NPC_TENANT_BUDGET: 'SYS_NPC_TENANT_BUDGET',
  ESCROW_AUCTION: 'SYS_ESCROW_AUCTION',
  CORPORATE_TREASURY_PREFIX: 'CORP_TREASURY_',
} as const;

export class InMemoryLedgerRepository implements ILedgerRepository {
  private entries: LedgerEntry[] = [];

  append(newEntries: LedgerEntry[]): void {
    this.entries.push(...newEntries);
  }

  listByAccount(accountId: string, limit = 100, offset = 0): LedgerEntry[] {
    const matched = this.entries
      .filter((e) => e.debitAccount === accountId || e.creditAccount === accountId)
      .slice()
      .reverse();
    return matched.slice(offset, offset + limit);
  }

  listAll(limit = 200, offset = 0): LedgerEntry[] {
    return this.entries.slice().reverse().slice(offset, offset + limit);
  }

  count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

export class InMemoryWalletRepository implements IWalletRepository {
  private wallets = new Map<string, Wallet>();
  private holdings = new Map<string, Map<string, Holding>>();

  getWallet(playerId: string): Wallet | undefined {
    return this.wallets.get(playerId);
  }

  saveWallet(wallet: Wallet): void {
    this.wallets.set(wallet.playerId, wallet);
  }

  getHolding(playerId: string, symbol: string): Holding | undefined {
    return this.holdings.get(playerId)?.get(symbol);
  }

  listHoldings(playerId: string): Holding[] {
    const map = this.holdings.get(playerId);
    if (!map) return [];
    return Array.from(map.values()).filter((h) => h.availableQty > 0 || h.lockedQty > 0);
  }

  saveHolding(playerId: string, holding: Holding): void {
    let map = this.holdings.get(playerId);
    if (!map) {
      map = new Map();
      this.holdings.set(playerId, map);
    }
    map.set(holding.symbol, holding);
  }

  listAllWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }

  clear(): void {
    this.wallets.clear();
    this.holdings.clear();
  }
}

/**
 * Authoritative Double-Entry Ledger & Wallet Coordinator.
 * Guarantees:
 * - INVARIANT 1: No negative available CR
 * - INVARIANT 2: No negative available asset quantity
 * - INVARIANT 3: Peer-to-peer transfers conserve CR exactly (debits === credits)
 * - INVARIANT 12: Every CR issuance / fee / transfer creates an auditable ledger record
 */
export class LedgerService {
  public readonly worldId: string;
  public readonly wallets: InMemoryWalletRepository;
  public readonly ledger: InMemoryLedgerRepository;
  private systemBalances = new Map<string, number>();

  constructor(worldId: string) {
    this.worldId = worldId;
    this.wallets = new InMemoryWalletRepository();
    this.ledger = new InMemoryLedgerRepository();
    this.initSystemAccounts();
  }

  private initSystemAccounts(): void {
    this.systemBalances.clear();
    // Explicit finite reserves for economic transparency
    this.systemBalances.set(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE, 0); // Contra-account (tracks total issued CR)
    this.systemBalances.set(SYSTEM_ACCOUNTS.FEE_REVENUE, 0);
    this.systemBalances.set(SYSTEM_ACCOUNTS.BANK_RESERVE, 500_000_000_00); // 500M CR bank reserve
    this.systemBalances.set(SYSTEM_ACCOUNTS.NPC_TENANT_BUDGET, 200_000_000_00); // 200M CR NPC tenant pool
    this.systemBalances.set(SYSTEM_ACCOUNTS.ESCROW_AUCTION, 0);
  }

  reset(): void {
    this.wallets.clear();
    this.ledger.clear();
    this.initSystemAccounts();
  }

  getSystemBalance(accountId: string): number {
    return this.systemBalances.get(accountId) ?? 0;
  }

  getTotalMoneySupplyMinor(): number {
    // Net CR issued from treasury into circulation
    return Math.abs(this.systemBalances.get(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE) ?? 0);
  }

  getTotalFeeRevenueMinor(): number {
    return this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0;
  }

  createWallet(playerId: string, initialCRMinor: number, description: string): Wallet {
    const wallet: Wallet = {
      playerId,
      availableMinor: 0,
      lockedMinor: 0,
      savingsMinor: 0,
      termDepositMinor: 0,
      termDepositMaturityGameDay: null,
      entertainmentChips: 1_000, // Free non-convertible entertainment chips
    };
    this.wallets.saveWallet(wallet);

    if (initialCRMinor > 0) {
      this.issueFunds(playerId, initialCRMinor, 'SYSTEM_ISSUANCE', `INIT-${playerId}`, description);
    }
    return wallet;
  }

  requireWallet(playerId: string): Wallet {
    const wallet = this.wallets.getWallet(playerId);
    if (!wallet) {
      throw new DomainError('UNAUTHORIZED', 'Không tìm thấy ví tài khoản.');
    }
    return wallet;
  }

  recordEntry(params: {
    transactionId: string;
    debitAccount: string;
    creditAccount: string;
    amountMinor: number;
    category: LedgerEntry['category'];
    referenceId: string;
    description: string;
    timestamp?: string;
  }): LedgerEntry {
    if (!Number.isInteger(params.amountMinor) || params.amountMinor < 0) {
      throw new DomainError('SERVER_ERROR', 'Số tiền ghi sổ cái phải là số nguyên không âm.');
    }
    const entry: LedgerEntry = {
      id: `ldg_${crypto.randomBytes(6).toString('hex')}`,
      worldId: this.worldId,
      transactionId: params.transactionId,
      debitAccount: params.debitAccount,
      creditAccount: params.creditAccount,
      amountMinor: params.amountMinor,
      category: params.category,
      referenceId: params.referenceId,
      description: params.description,
      timestamp: params.timestamp ?? new Date().toISOString(),
    };
    this.ledger.append([entry]);
    return entry;
  }

  /**
   * Explicitly issues CR from SYS_TREASURY_ISSUANCE to an account (e.g., 100,000 CR starting capital or NPC boot capital).
   */
  issueFunds(
    playerId: string,
    amountMinor: number,
    category: LedgerEntry['category'],
    referenceId: string,
    description: string,
  ): LedgerEntry {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new DomainError('INVALID_ORDER', 'Số tiền phát hành không hợp lệ.');
    }
    const wallet = this.requireWallet(playerId);
    wallet.availableMinor += amountMinor;
    this.systemBalances.set(
      SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
      (this.systemBalances.get(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE) ?? 0) - amountMinor,
    );
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      debitAccount: SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
      creditAccount: playerId,
      amountMinor,
      category,
      referenceId,
      description,
    });
  }

  /**
   * Transfers CR from a finite system reserve (e.g., bank interest or NPC tenant rent) to a player.
   */
  payFromSystemReserve(
    reserveAccount: string,
    playerId: string,
    amountMinor: number,
    category: LedgerEntry['category'],
    referenceId: string,
    description: string,
  ): LedgerEntry | null {
    if (amountMinor <= 0) return null;
    const currentReserve = this.systemBalances.get(reserveAccount) ?? 0;
    if (currentReserve < amountMinor) {
      return null; // Never print CR if reserve is depleted
    }
    const wallet = this.requireWallet(playerId);
    this.systemBalances.set(reserveAccount, currentReserve - amountMinor);
    wallet.availableMinor += amountMinor;
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      debitAccount: reserveAccount,
      creditAccount: playerId,
      amountMinor,
      category,
      referenceId,
      description,
    });
  }

  /**
   * Locks available CR for an open buy order or auction bid.
   */
  lockFunds(playerId: string, amountMinor: number): void {
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new DomainError('INVALID_ORDER');
    }
    const wallet = this.requireWallet(playerId);
    if (wallet.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }
    wallet.availableMinor -= amountMinor;
    wallet.lockedMinor += amountMinor;
  }

  /**
   * Unlocks CR back to available balance (e.g., order cancellation, price improvement refund, outbid refund).
   */
  unlockFunds(playerId: string, amountMinor: number): void {
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new DomainError('SERVER_ERROR', 'Invalid unlock amount');
    }
    if (amountMinor === 0) return;
    const wallet = this.requireWallet(playerId);
    const actualUnlock = Math.min(amountMinor, wallet.lockedMinor);
    wallet.lockedMinor -= actualUnlock;
    wallet.availableMinor += actualUnlock;
  }

  /**
   * Transfers CR directly between two available wallets (e.g., property purchase or company capital).
   */
  transferAvailable(params: {
    fromAccount: string;
    toAccount: string;
    amountMinor: number;
    category: LedgerEntry['category'];
    referenceId: string;
    description: string;
    transactionId?: string;
  }): LedgerEntry {
    if (!Number.isInteger(params.amountMinor) || params.amountMinor <= 0) {
      throw new DomainError('INVALID_ORDER', 'Số tiền chuyển phải lớn hơn 0.');
    }
    const txId = params.transactionId ?? `tx_${crypto.randomBytes(6).toString('hex')}`;

    const fromWallet = this.wallets.getWallet(params.fromAccount);
    if (fromWallet) {
      if (fromWallet.availableMinor < params.amountMinor) {
        throw new DomainError('INSUFFICIENT_FUNDS');
      }
      fromWallet.availableMinor -= params.amountMinor;
    } else {
      const sysBal = this.systemBalances.get(params.fromAccount) ?? 0;
      if (sysBal < params.amountMinor) {
        throw new DomainError('INSUFFICIENT_FUNDS', 'Tài khoản nguồn không đủ thanh khoản.');
      }
      this.systemBalances.set(params.fromAccount, sysBal - params.amountMinor);
    }

    const toWallet = this.wallets.getWallet(params.toAccount);
    if (toWallet) {
      toWallet.availableMinor += params.amountMinor;
    } else {
      const sysBal = this.systemBalances.get(params.toAccount) ?? 0;
      this.systemBalances.set(params.toAccount, sysBal + params.amountMinor);
    }

    return this.recordEntry({
      transactionId: txId,
      debitAccount: params.fromAccount,
      creditAccount: params.toAccount,
      amountMinor: params.amountMinor,
      category: params.category,
      referenceId: params.referenceId,
      description: params.description,
    });
  }

  /**
   * Settles cash leg of a matched trade atomically from buyer's locked CR to seller's available CR + fee revenue.
   * Zero CR created or destroyed: buyer pays (gross + buyerFee), seller receives (gross - sellerFee),
   * SYS_FEE_REVENUE receives (buyerFee + sellerFee).
   */
  settleTradeCash(params: {
    tradeId: string;
    symbol: string;
    buyerId: string;
    sellerId: string;
    grossAmountMinor: number;
    buyerFeeMinor: number;
    sellerFeeMinor: number;
    quantity: number;
    priceMinor: number;
    timestamp: string;
  }): LedgerEntry[] {
    const buyerWallet = this.requireWallet(params.buyerId);
    const sellerWallet = this.requireWallet(params.sellerId);

    const totalBuyerDebit = params.grossAmountMinor + params.buyerFeeMinor;
    if (buyerWallet.lockedMinor < totalBuyerDebit) {
      // Fallback: check if available balance can cover tiny rounding gap, otherwise fail safely
      const deficit = totalBuyerDebit - buyerWallet.lockedMinor;
      if (buyerWallet.availableMinor < deficit) {
        throw new DomainError('INSUFFICIENT_FUNDS', 'Số tiền phong tỏa không đủ để thanh toán khớp lệnh.');
      }
      buyerWallet.availableMinor -= deficit;
      buyerWallet.lockedMinor += deficit;
    }

    buyerWallet.lockedMinor -= totalBuyerDebit;

    const sellerNetCredit = params.grossAmountMinor - params.sellerFeeMinor;
    sellerWallet.availableMinor += sellerNetCredit;

    const totalFees = params.buyerFeeMinor + params.sellerFeeMinor;
    this.systemBalances.set(
      SYSTEM_ACCOUNTS.FEE_REVENUE,
      (this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0) + totalFees,
    );

    const txId = `tx_trade_${params.tradeId}`;
    const entries: LedgerEntry[] = [];

    // 1. Buyer -> Seller gross settlement (seller fee is debited separately in entry #3 so net = gross - sellerFee)
    entries.push(
      this.recordEntry({
        transactionId: txId,
        debitAccount: params.buyerId,
        creditAccount: params.sellerId,
        amountMinor: params.grossAmountMinor,
        category: 'TRADE_SETTLEMENT',
        referenceId: params.tradeId,
        description: `Khớp lệnh ${params.quantity} ${params.symbol} @ ${(params.priceMinor / 100).toFixed(2)} CR`,
        timestamp: params.timestamp,
      }),
    );

    // 2. Buyer fee -> System Fee Revenue
    if (params.buyerFeeMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          debitAccount: params.buyerId,
          creditAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
          amountMinor: params.buyerFeeMinor,
          category: 'TRADING_FEE',
          referenceId: params.tradeId,
          description: `Phí giao dịch mua ${params.symbol}`,
          timestamp: params.timestamp,
        }),
      );
    }

    // 3. Seller fee -> System Fee Revenue (deducted from gross proceeds)
    if (params.sellerFeeMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          debitAccount: params.sellerId,
          creditAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
          amountMinor: params.sellerFeeMinor,
          category: 'TRADING_FEE',
          referenceId: params.tradeId,
          description: `Phí giao dịch bán ${params.symbol}`,
          timestamp: params.timestamp,
        }),
      );
    }

    return entries;
  }

  /**
   * Asset holdings management (INVARIANT 2 & 4).
   */
  grantInitialAsset(playerId: string, symbol: string, marketClass: MarketClass, qty: number, avgCostMinor: number): void {
    const existing = this.wallets.getHolding(playerId, symbol);
    if (!existing) {
      this.wallets.saveHolding(playerId, {
        symbol,
        marketClass,
        availableQty: roundQty(qty),
        lockedQty: 0,
        avgCostMinor,
        realizedPnlMinor: 0,
      });
    } else {
      const totalExisting = existing.availableQty + existing.lockedQty;
      const newTotal = roundQty(totalExisting + qty);
      const weightedCost =
        newTotal > 0
          ? Math.round((totalExisting * existing.avgCostMinor + qty * avgCostMinor) / newTotal)
          : avgCostMinor;
      existing.availableQty = roundQty(existing.availableQty + qty);
      existing.avgCostMinor = weightedCost;
      this.wallets.saveHolding(playerId, existing);
    }
  }

  lockAsset(playerId: string, symbol: string, qty: number): void {
    const holding = this.wallets.getHolding(playerId, symbol);
    if (!holding || holding.availableQty + 1e-9 < qty) {
      throw new DomainError('INSUFFICIENT_ASSET_BALANCE');
    }
    holding.availableQty = Math.max(0, roundQty(holding.availableQty - qty));
    holding.lockedQty = roundQty(holding.lockedQty + qty);
    this.wallets.saveHolding(playerId, holding);
  }

  unlockAsset(playerId: string, symbol: string, qty: number): void {
    if (qty <= 0) return;
    const holding = this.wallets.getHolding(playerId, symbol);
    if (!holding) return;
    const actual = Math.min(qty, holding.lockedQty);
    holding.lockedQty = Math.max(0, roundQty(holding.lockedQty - actual));
    holding.availableQty = roundQty(holding.availableQty + actual);
    this.wallets.saveHolding(playerId, holding);
  }

  /**
   * Transfers exact quantity of an asset from seller's lockedQty to buyer's availableQty.
   * Updates weighted average cost for buyer and realized PnL for seller.
   */
  settleTradeAsset(params: {
    buyerId: string;
    sellerId: string;
    symbol: string;
    marketClass: MarketClass;
    quantity: number;
    priceMinor: number;
    sellerFeeMinor: number;
  }): number {
    const sellerHolding = this.wallets.getHolding(params.sellerId, params.symbol);
    if (!sellerHolding || sellerHolding.lockedQty + 1e-9 < params.quantity) {
      throw new DomainError('INSUFFICIENT_ASSET_BALANCE', 'Số lượng tài sản phong tỏa của người bán không đủ.');
    }

    // Deduct from seller lockedQty & compute realized P&L
    sellerHolding.lockedQty = Math.max(0, roundQty(sellerHolding.lockedQty - params.quantity));
    const realizedPnl = Math.round((params.priceMinor - sellerHolding.avgCostMinor) * params.quantity) - params.sellerFeeMinor;
    sellerHolding.realizedPnlMinor += realizedPnl;
    this.wallets.saveHolding(params.sellerId, sellerHolding);

    // Credit buyer availableQty & recompute weighted average cost
    const buyerHolding = this.wallets.getHolding(params.buyerId, params.symbol);
    if (!buyerHolding) {
      this.wallets.saveHolding(params.buyerId, {
        symbol: params.symbol,
        marketClass: params.marketClass,
        availableQty: roundQty(params.quantity),
        lockedQty: 0,
        avgCostMinor: params.priceMinor,
        realizedPnlMinor: 0,
      });
    } else {
      const prevTotal = buyerHolding.availableQty + buyerHolding.lockedQty;
      const newTotal = roundQty(prevTotal + params.quantity);
      const newAvg =
        newTotal > 0
          ? Math.round((prevTotal * buyerHolding.avgCostMinor + params.quantity * params.priceMinor) / newTotal)
          : params.priceMinor;
      buyerHolding.availableQty = roundQty(buyerHolding.availableQty + params.quantity);
      buyerHolding.avgCostMinor = newAvg;
      this.wallets.saveHolding(params.buyerId, buyerHolding);
    }

    return realizedPnl;
  }

  /**
   * Bank Savings & Term Deposit operations (INVARIANT 27: no double counting).
   */
  depositToSavings(playerId: string, amountMinor: number): LedgerEntry {
    const wallet = this.requireWallet(playerId);
    if (wallet.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }
    wallet.availableMinor -= amountMinor;
    wallet.savingsMinor += amountMinor;
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      debitAccount: playerId,
      creditAccount: `SAVINGS_${playerId}`,
      amountMinor,
      category: 'BANK_DEPOSIT',
      referenceId: `SAV-DEP-${Date.now()}`,
      description: 'Gửi CR vào tài khoản tiết kiệm Empire Bank',
    });
  }

  withdrawFromSavings(playerId: string, amountMinor: number): LedgerEntry {
    const wallet = this.requireWallet(playerId);
    if (wallet.savingsMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Số dư tiết kiệm không đủ để rút.');
    }
    wallet.savingsMinor -= amountMinor;
    wallet.availableMinor += amountMinor;
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      debitAccount: `SAVINGS_${playerId}`,
      creditAccount: playerId,
      amountMinor,
      category: 'BANK_WITHDRAW',
      referenceId: `SAV-WDR-${Date.now()}`,
      description: 'Rút CR từ tài khoản tiết kiệm về ví khả dụng',
    });
  }

  createTermDeposit(playerId: string, amountMinor: number, maturityGameDay: number): LedgerEntry {
    const wallet = this.requireWallet(playerId);
    if (wallet.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }
    wallet.availableMinor -= amountMinor;
    wallet.termDepositMinor += amountMinor;
    wallet.termDepositMaturityGameDay = maturityGameDay;
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      debitAccount: playerId,
      creditAccount: `TERM_${playerId}`,
      amountMinor,
      category: 'BANK_DEPOSIT',
      referenceId: `TERM-${Date.now()}`,
      description: `Gửi tiết kiệm kỳ hạn đến Ngày ${maturityGameDay}`,
    });
  }
}
