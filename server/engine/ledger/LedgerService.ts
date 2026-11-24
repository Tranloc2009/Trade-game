import crypto from 'node:crypto';
import type { ILedgerRepository, IWalletRepository } from '../../../shared/contracts/interfaces';
import type { CurrencyBalance, Holding, LedgerEntry, MarketClass, Wallet } from '../../../shared/contracts/types';
import { ALL_CURRENCIES, type CurrencyCode, formatCurrencyAmount, roundQty } from '../../../shared/contracts/money';
import { DomainError } from '../../domain/DomainError';

export const SYSTEM_ACCOUNTS = {
  TREASURY_ISSUANCE: 'SYS_TREASURY_ISSUANCE',
  FEE_REVENUE: 'SYS_FEE_REVENUE',
  BANK_RESERVE: 'SYS_BANK_RESERVE',
  NPC_TENANT_BUDGET: 'SYS_NPC_TENANT_BUDGET',
  ESCROW_AUCTION: 'SYS_ESCROW_AUCTION',
  CORPORATE_TREASURY_PREFIX: 'CORP_TREASURY_',
  FX_ISSUANCE_PREFIX: 'SYS_FX_ISSUANCE_',
  FX_FEE_REVENUE_PREFIX: 'SYS_FX_FEE_',
  FUTURES_MARGIN_POOL: 'SYS_FUTURES_MARGIN_POOL',
  FUTURES_INSURANCE_FUND: 'SYS_FUTURES_INSURANCE_FUND',
  FUTURES_FEE_REVENUE: 'SYS_FUTURES_FEE_REVENUE',
} as const;

export const INITIAL_FUTURES_INSURANCE_RESERVE_MINOR = 5_000_000_00; // Finite 5,000,000 CR Insurance Fund reserve

export function createEmptyCurrencyBalances(): Record<CurrencyCode, CurrencyBalance> {
  const balances = {} as Record<CurrencyCode, CurrencyBalance>;
  for (const c of ALL_CURRENCIES) {
    balances[c] = { currency: c, availableMinor: 0, lockedMinor: 0 };
  }
  return balances;
}

export function cloneWallet(wallet: Wallet): Wallet {
  const currencyBalances = {} as Record<CurrencyCode, CurrencyBalance>;
  for (const c of ALL_CURRENCIES) {
    const b = wallet.currencyBalances[c] ?? { currency: c, availableMinor: 0, lockedMinor: 0 };
    currencyBalances[c] = {
      currency: c,
      availableMinor: c === 'CR' ? wallet.availableMinor : b.availableMinor,
      lockedMinor: c === 'CR' ? wallet.lockedMinor : b.lockedMinor,
    };
  }
  return {
    ...wallet,
    currencyBalances,
  };
}

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

  listAllEntriesRaw(): LedgerEntry[] {
    return this.entries;
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
 * Authoritative Multi-Currency Double-Entry Ledger & Wallet Coordinator.
 * Guarantees:
 * - INVARIANT 1: No negative available balance in CR or any simulated foreign currency.
 * - INVARIANT 2: No negative available asset quantity.
 * - INVARIANT 3: Peer-to-peer trades and FX conversions conserve every currency exactly (debits === credits per currency).
 * - INVARIANT 12: Every currency issuance, fee, and settlement creates an auditable double-entry ledger record.
 */
export class LedgerService {
  public readonly worldId: string;
  public readonly wallets: InMemoryWalletRepository;
  public readonly ledger: InMemoryLedgerRepository;
  private systemBalances = new Map<string, number>(); // CR system accounts
  private fxSystemBalances = new Map<string, number>(); // Keyed by `${currency}:${accountId}`

  constructor(worldId: string) {
    this.worldId = worldId;
    this.wallets = new InMemoryWalletRepository();
    this.ledger = new InMemoryLedgerRepository();
    this.initSystemAccounts();
  }

  private initSystemAccounts(): void {
    this.systemBalances.clear();
    this.fxSystemBalances.clear();
    // Explicit finite reserves for economic transparency
    this.systemBalances.set(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE, 0); // Contra-account (tracks total issued CR)
    this.systemBalances.set(SYSTEM_ACCOUNTS.FEE_REVENUE, 0);
    this.systemBalances.set(SYSTEM_ACCOUNTS.BANK_RESERVE, 500_000_000_00); // 500M CR bank reserve
    this.systemBalances.set(SYSTEM_ACCOUNTS.NPC_TENANT_BUDGET, 200_000_000_00); // 200M CR NPC tenant pool
    this.systemBalances.set(SYSTEM_ACCOUNTS.ESCROW_AUCTION, 0);
    this.systemBalances.set(SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL, 0);
    this.systemBalances.set(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND, INITIAL_FUTURES_INSURANCE_RESERVE_MINOR);
    this.systemBalances.set(SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE, 0);

    for (const c of ALL_CURRENCIES) {
      this.fxSystemBalances.set(`${c}:${SYSTEM_ACCOUNTS.FX_ISSUANCE_PREFIX}${c}`, 0);
      this.fxSystemBalances.set(`${c}:${SYSTEM_ACCOUNTS.FX_FEE_REVENUE_PREFIX}${c}`, 0);
    }
  }

  reset(): void {
    this.wallets.clear();
    this.ledger.clear();
    this.initSystemAccounts();
  }

  getSystemBalance(accountId: string): number {
    return this.systemBalances.get(accountId) ?? 0;
  }

  getCurrencySystemBalance(currency: CurrencyCode, accountId: string): number {
    if (currency === 'CR' && this.systemBalances.has(accountId)) {
      return this.systemBalances.get(accountId) ?? 0;
    }
    return this.fxSystemBalances.get(`${currency}:${accountId}`) ?? 0;
  }

  getTotalMoneySupplyMinor(): number {
    return Math.abs(this.systemBalances.get(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE) ?? 0);
  }

  getTotalCurrencySupplyMinor(currency: CurrencyCode): number {
    if (currency === 'CR') return this.getTotalMoneySupplyMinor();
    return Math.abs(this.fxSystemBalances.get(`${currency}:${SYSTEM_ACCOUNTS.FX_ISSUANCE_PREFIX}${currency}`) ?? 0);
  }

  getTotalFeeRevenueMinor(): number {
    return this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0;
  }

  getCurrencyFeeRevenueMinor(currency: CurrencyCode): number {
    if (currency === 'CR') {
      return (
        (this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0) +
        (this.systemBalances.get(SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE) ?? 0) +
        (this.fxSystemBalances.get(`CR:${SYSTEM_ACCOUNTS.FX_FEE_REVENUE_PREFIX}CR`) ?? 0)
      );
    }
    return this.fxSystemBalances.get(`${currency}:${SYSTEM_ACCOUNTS.FX_FEE_REVENUE_PREFIX}${currency}`) ?? 0;
  }

  private syncCRMirror(wallet: Wallet): void {
    if (!wallet.currencyBalances) {
      wallet.currencyBalances = createEmptyCurrencyBalances();
    }
    wallet.currencyBalances.CR = {
      currency: 'CR',
      availableMinor: wallet.availableMinor,
      lockedMinor: wallet.lockedMinor,
    };
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
      currencyBalances: createEmptyCurrencyBalances(),
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
    this.syncCRMirror(wallet);
    return wallet;
  }

  getCurrencyBalance(playerId: string, currency: CurrencyCode): CurrencyBalance {
    const wallet = this.requireWallet(playerId);
    if (currency === 'CR') {
      return { currency: 'CR', availableMinor: wallet.availableMinor, lockedMinor: wallet.lockedMinor };
    }
    const existing = wallet.currencyBalances[currency];
    if (!existing) {
      const fresh: CurrencyBalance = { currency, availableMinor: 0, lockedMinor: 0 };
      wallet.currencyBalances[currency] = fresh;
      return { ...fresh };
    }
    return { ...existing };
  }

  recordEntry(params: {
    transactionId: string;
    currency?: CurrencyCode;
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
      currency: params.currency ?? 'CR',
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
   * Explicitly issues CR from SYS_TREASURY_ISSUANCE to an account.
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
    this.syncCRMirror(wallet);
    this.systemBalances.set(
      SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
      (this.systemBalances.get(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE) ?? 0) - amountMinor,
    );
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      currency: 'CR',
      debitAccount: SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
      creditAccount: playerId,
      amountMinor,
      category,
      referenceId,
      description,
    });
  }

  /**
   * Explicitly issues simulated foreign currency from the currency's central issuance contra-account.
   * Recorded strictly in the double-entry ledger for that currency.
   */
  issueCurrency(
    playerId: string,
    currency: CurrencyCode,
    amountMinor: number,
    referenceId: string,
    description: string,
  ): LedgerEntry {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new DomainError('INVALID_ORDER', 'Số tiền ngoại tệ phát hành không hợp lệ.');
    }
    if (currency === 'CR') {
      return this.issueFunds(playerId, amountMinor, 'SYSTEM_ISSUANCE', referenceId, description);
    }

    const wallet = this.requireWallet(playerId);
    const bal = wallet.currencyBalances[currency] ?? { currency, availableMinor: 0, lockedMinor: 0 };
    bal.availableMinor += amountMinor;
    wallet.currencyBalances[currency] = bal;

    const issuanceAcc = `${SYSTEM_ACCOUNTS.FX_ISSUANCE_PREFIX}${currency}`;
    const key = `${currency}:${issuanceAcc}`;
    this.fxSystemBalances.set(key, (this.fxSystemBalances.get(key) ?? 0) - amountMinor);

    return this.recordEntry({
      transactionId: `tx_fx_init_${crypto.randomBytes(5).toString('hex')}`,
      currency,
      debitAccount: issuanceAcc,
      creditAccount: playerId,
      amountMinor,
      category: 'SYSTEM_ISSUANCE',
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
      return null;
    }
    const wallet = this.requireWallet(playerId);
    this.systemBalances.set(reserveAccount, currentReserve - amountMinor);
    wallet.availableMinor += amountMinor;
    this.syncCRMirror(wallet);
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      currency: 'CR',
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
    this.lockCurrency(playerId, 'CR', amountMinor);
  }

  /**
   * Unlocks CR back to available balance.
   */
  unlockFunds(playerId: string, amountMinor: number): void {
    this.unlockCurrency(playerId, 'CR', amountMinor);
  }

  /**
   * Locks available minor units in ANY simulated currency (CR, USD-SIM, EUR-SIM, GBP-SIM, JPY-SIM, AUD-SIM).
   * Strictly enforces non-negative balances (INVARIANT 1).
   */
  lockCurrency(playerId: string, currency: CurrencyCode, amountMinor: number): void {
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new DomainError('INVALID_ORDER');
    }
    const wallet = this.requireWallet(playerId);
    if (currency === 'CR') {
      if (wallet.availableMinor < amountMinor) {
        throw new DomainError('INSUFFICIENT_FUNDS');
      }
      wallet.availableMinor -= amountMinor;
      wallet.lockedMinor += amountMinor;
      this.syncCRMirror(wallet);
      return;
    }
    const bal = wallet.currencyBalances[currency] ?? { currency, availableMinor: 0, lockedMinor: 0 };
    if (bal.availableMinor < amountMinor) {
      throw new DomainError(
        'INSUFFICIENT_FUNDS',
        `Số dư ${currency} khả dụng (${formatCurrencyAmount(bal.availableMinor, currency)}) không đủ để thực hiện lệnh này.`,
      );
    }
    bal.availableMinor -= amountMinor;
    bal.lockedMinor += amountMinor;
    wallet.currencyBalances[currency] = bal;
  }

  /**
   * Unlocks locked minor units in ANY simulated currency back to available balance.
   */
  unlockCurrency(playerId: string, currency: CurrencyCode, amountMinor: number): void {
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new DomainError('SERVER_ERROR', 'Invalid unlock amount');
    }
    if (amountMinor === 0) return;
    const wallet = this.requireWallet(playerId);
    if (currency === 'CR') {
      const actualUnlock = Math.min(amountMinor, wallet.lockedMinor);
      wallet.lockedMinor -= actualUnlock;
      wallet.availableMinor += actualUnlock;
      this.syncCRMirror(wallet);
      return;
    }
    const bal = wallet.currencyBalances[currency];
    if (!bal) return;
    const actualUnlock = Math.min(amountMinor, bal.lockedMinor);
    bal.lockedMinor -= actualUnlock;
    bal.availableMinor += actualUnlock;
  }

  /**
   * Transfers CR directly between two available wallets.
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
      this.syncCRMirror(fromWallet);
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
      this.syncCRMirror(toWallet);
    } else {
      const sysBal = this.systemBalances.get(params.toAccount) ?? 0;
      this.systemBalances.set(params.toAccount, sysBal + params.amountMinor);
    }

    return this.recordEntry({
      transactionId: txId,
      currency: 'CR',
      debitAccount: params.fromAccount,
      creditAccount: params.toAccount,
      amountMinor: params.amountMinor,
      category: params.category,
      referenceId: params.referenceId,
      description: params.description,
    });
  }

  /**
   * Settles cash leg of a matched Stock/Crypto trade atomically in CR.
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
      const deficit = totalBuyerDebit - buyerWallet.lockedMinor;
      if (buyerWallet.availableMinor < deficit) {
        throw new DomainError('INSUFFICIENT_FUNDS', 'Số tiền phong tỏa không đủ để thanh toán khớp lệnh.');
      }
      buyerWallet.availableMinor -= deficit;
      buyerWallet.lockedMinor += deficit;
    }

    buyerWallet.lockedMinor -= totalBuyerDebit;
    this.syncCRMirror(buyerWallet);

    const sellerNetCredit = params.grossAmountMinor - params.sellerFeeMinor;
    sellerWallet.availableMinor += sellerNetCredit;
    this.syncCRMirror(sellerWallet);

    const totalFees = params.buyerFeeMinor + params.sellerFeeMinor;
    this.systemBalances.set(
      SYSTEM_ACCOUNTS.FEE_REVENUE,
      (this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0) + totalFees,
    );

    const txId = `tx_trade_${params.tradeId}`;
    const entries: LedgerEntry[] = [];

    entries.push(
      this.recordEntry({
        transactionId: txId,
        currency: 'CR',
        debitAccount: params.buyerId,
        creditAccount: params.sellerId,
        amountMinor: params.grossAmountMinor,
        category: 'TRADE_SETTLEMENT',
        referenceId: params.tradeId,
        description: `Khớp lệnh ${params.quantity} ${params.symbol} @ ${(params.priceMinor / 100).toFixed(2)} CR`,
        timestamp: params.timestamp,
      }),
    );

    if (params.buyerFeeMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          currency: 'CR',
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

    if (params.sellerFeeMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          currency: 'CR',
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
   * Atomically settles a dual-currency Forex spot trade with exact per-currency conservation:
   * - Quote leg (`quoteCurrency`):
   *     Buyer lockedMinor -= (quoteGrossMinor + buyerFeeQuoteMinor)
   *     Seller availableMinor += (quoteGrossMinor - sellerFeeQuoteMinor)
   *     Fee account += (buyerFeeQuoteMinor + sellerFeeQuoteMinor)
   * - Base leg (`baseCurrency`):
   *     Seller lockedMinor -= baseAmountMinor
   *     Buyer availableMinor += baseAmountMinor
   * Zero units created or destroyed in either currency!
   */
  settleFxTrade(params: {
    tradeId: string;
    symbol: string;
    baseCurrency: CurrencyCode;
    quoteCurrency: CurrencyCode;
    buyerId: string;
    sellerId: string;
    baseAmountMinor: number;
    quoteGrossMinor: number;
    buyerFeeQuoteMinor: number;
    sellerFeeQuoteMinor: number;
    rateLabel: string;
    baseQtyDisplay: number;
    timestamp: string;
  }): LedgerEntry[] {
    if (
      !Number.isInteger(params.baseAmountMinor) ||
      params.baseAmountMinor <= 0 ||
      !Number.isInteger(params.quoteGrossMinor) ||
      params.quoteGrossMinor <= 0
    ) {
      throw new DomainError('INVALID_ORDER', 'Giá trị thanh toán ngoại hối không hợp lệ.');
    }

    const buyerWallet = this.requireWallet(params.buyerId);
    const sellerWallet = this.requireWallet(params.sellerId);

    // 1. Validate both legs BEFORE mutating either wallet (atomic rollback safety)
    const totalBuyerQuoteDebit = params.quoteGrossMinor + params.buyerFeeQuoteMinor;
    const buyerQuote =
      params.quoteCurrency === 'CR'
        ? { availableMinor: buyerWallet.availableMinor, lockedMinor: buyerWallet.lockedMinor }
        : buyerWallet.currencyBalances[params.quoteCurrency];

    if (!buyerQuote || buyerQuote.lockedMinor + buyerQuote.availableMinor < totalBuyerQuoteDebit) {
      throw new DomainError('INSUFFICIENT_FUNDS', `Số dư ${params.quoteCurrency} của người mua không đủ thanh toán.`);
    }

    const sellerBase =
      params.baseCurrency === 'CR'
        ? { availableMinor: sellerWallet.availableMinor, lockedMinor: sellerWallet.lockedMinor }
        : sellerWallet.currencyBalances[params.baseCurrency];

    if (!sellerBase || sellerBase.lockedMinor < params.baseAmountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', `Số dư phong tỏa ${params.baseCurrency} của người bán không đủ.`);
    }

    // 2. Execute Quote Currency Leg
    if (params.quoteCurrency === 'CR') {
      if (buyerWallet.lockedMinor < totalBuyerQuoteDebit) {
        const deficit = totalBuyerQuoteDebit - buyerWallet.lockedMinor;
        buyerWallet.availableMinor -= deficit;
        buyerWallet.lockedMinor += deficit;
      }
      buyerWallet.lockedMinor -= totalBuyerQuoteDebit;
      sellerWallet.availableMinor += params.quoteGrossMinor - params.sellerFeeQuoteMinor;
      this.syncCRMirror(buyerWallet);
      this.syncCRMirror(sellerWallet);
      this.systemBalances.set(
        SYSTEM_ACCOUNTS.FEE_REVENUE,
        (this.systemBalances.get(SYSTEM_ACCOUNTS.FEE_REVENUE) ?? 0) +
          params.buyerFeeQuoteMinor +
          params.sellerFeeQuoteMinor,
      );
    } else {
      const bq = buyerWallet.currencyBalances[params.quoteCurrency];
      const sq = sellerWallet.currencyBalances[params.quoteCurrency] ?? {
        currency: params.quoteCurrency,
        availableMinor: 0,
        lockedMinor: 0,
      };
      if (bq.lockedMinor < totalBuyerQuoteDebit) {
        const deficit = totalBuyerQuoteDebit - bq.lockedMinor;
        bq.availableMinor -= deficit;
        bq.lockedMinor += deficit;
      }
      bq.lockedMinor -= totalBuyerQuoteDebit;
      sq.availableMinor += params.quoteGrossMinor - params.sellerFeeQuoteMinor;
      sellerWallet.currencyBalances[params.quoteCurrency] = sq;

      const feeAcc = `${SYSTEM_ACCOUNTS.FX_FEE_REVENUE_PREFIX}${params.quoteCurrency}`;
      const feeKey = `${params.quoteCurrency}:${feeAcc}`;
      this.fxSystemBalances.set(
        feeKey,
        (this.fxSystemBalances.get(feeKey) ?? 0) + params.buyerFeeQuoteMinor + params.sellerFeeQuoteMinor,
      );
    }

    // 3. Execute Base Currency Leg
    if (params.baseCurrency === 'CR') {
      sellerWallet.lockedMinor -= params.baseAmountMinor;
      buyerWallet.availableMinor += params.baseAmountMinor;
      this.syncCRMirror(sellerWallet);
      this.syncCRMirror(buyerWallet);
    } else {
      const sb = sellerWallet.currencyBalances[params.baseCurrency];
      const bb = buyerWallet.currencyBalances[params.baseCurrency] ?? {
        currency: params.baseCurrency,
        availableMinor: 0,
        lockedMinor: 0,
      };
      sb.lockedMinor -= params.baseAmountMinor;
      bb.availableMinor += params.baseAmountMinor;
      buyerWallet.currencyBalances[params.baseCurrency] = bb;
    }

    // 4. Write Double-Entry Ledger records for both currencies
    const txId = `tx_fx_${params.tradeId}`;
    const feeAccount =
      params.quoteCurrency === 'CR'
        ? SYSTEM_ACCOUNTS.FEE_REVENUE
        : `${SYSTEM_ACCOUNTS.FX_FEE_REVENUE_PREFIX}${params.quoteCurrency}`;

    const entries: LedgerEntry[] = [];

    // Quote transfer: Buyer -> Seller
    entries.push(
      this.recordEntry({
        transactionId: txId,
        currency: params.quoteCurrency,
        debitAccount: params.buyerId,
        creditAccount: params.sellerId,
        amountMinor: params.quoteGrossMinor,
        category: 'FX_SETTLEMENT',
        referenceId: params.tradeId,
        description: `FX ${params.symbol}: thanh toán ${formatCurrencyAmount(params.quoteGrossMinor, params.quoteCurrency)} ${params.quoteCurrency} @ ${params.rateLabel}`,
        timestamp: params.timestamp,
      }),
    );

    // Base delivery: Seller -> Buyer
    entries.push(
      this.recordEntry({
        transactionId: txId,
        currency: params.baseCurrency,
        debitAccount: params.sellerId,
        creditAccount: params.buyerId,
        amountMinor: params.baseAmountMinor,
        category: 'FX_SETTLEMENT',
        referenceId: params.tradeId,
        description: `FX ${params.symbol}: giao nhận ${formatCurrencyAmount(params.baseAmountMinor, params.baseCurrency)} ${params.baseCurrency} @ ${params.rateLabel}`,
        timestamp: params.timestamp,
      }),
    );

    if (params.buyerFeeQuoteMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          currency: params.quoteCurrency,
          debitAccount: params.buyerId,
          creditAccount: feeAccount,
          amountMinor: params.buyerFeeQuoteMinor,
          category: 'FX_FEE',
          referenceId: params.tradeId,
          description: `Phí giao dịch FX mua ${params.symbol}`,
          timestamp: params.timestamp,
        }),
      );
    }

    if (params.sellerFeeQuoteMinor > 0) {
      entries.push(
        this.recordEntry({
          transactionId: txId,
          currency: params.quoteCurrency,
          debitAccount: params.sellerId,
          creditAccount: feeAccount,
          amountMinor: params.sellerFeeQuoteMinor,
          category: 'FX_FEE',
          referenceId: params.tradeId,
          description: `Phí giao dịch FX bán ${params.symbol}`,
          timestamp: params.timestamp,
        }),
      );
    }

    return entries;
  }

  /**
   * Audits total conservation for a given currency across all wallets + fee account vs total issued supply.
   * Returns exact discrepancy (must always equal 0 for pure FX currencies!).
   */
  auditCurrencyConservation(currency: CurrencyCode): {
    currency: CurrencyCode;
    totalWalletMinor: number;
    feeRevenueMinor: number;
    issuedMinor: number;
    discrepancyMinor: number;
  } {
    let totalWalletMinor = 0;
    for (const w of this.wallets.listAllWallets()) {
      if (currency === 'CR') {
        totalWalletMinor += w.availableMinor + w.lockedMinor + w.savingsMinor + w.termDepositMinor;
      } else {
        const b = w.currencyBalances?.[currency];
        if (b) {
          totalWalletMinor += b.availableMinor + b.lockedMinor;
        }
      }
    }
    const feeRevenueMinor = this.getCurrencyFeeRevenueMinor(currency);
    const issuedMinor = this.getTotalCurrencySupplyMinor(currency);
    const futuresPoolMinor =
      currency === 'CR' ? (this.systemBalances.get(SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL) ?? 0) : 0;
    const insuranceDeltaMinor =
      currency === 'CR'
        ? (this.systemBalances.get(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND) ?? 0) -
          INITIAL_FUTURES_INSURANCE_RESERVE_MINOR
        : 0;
    const discrepancyMinor =
      totalWalletMinor + feeRevenueMinor + futuresPoolMinor + insuranceDeltaMinor - issuedMinor;
    return {
      currency,
      totalWalletMinor,
      feeRevenueMinor,
      issuedMinor,
      discrepancyMinor,
    };
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

    sellerHolding.lockedQty = Math.max(0, roundQty(sellerHolding.lockedQty - params.quantity));
    const realizedPnl = Math.round((params.priceMinor - sellerHolding.avgCostMinor) * params.quantity) - params.sellerFeeMinor;
    sellerHolding.realizedPnlMinor += realizedPnl;
    this.wallets.saveHolding(params.sellerId, sellerHolding);

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
    this.syncCRMirror(wallet);
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      currency: 'CR',
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
    this.syncCRMirror(wallet);
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      currency: 'CR',
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
    this.syncCRMirror(wallet);
    return this.recordEntry({
      transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
      currency: 'CR',
      debitAccount: playerId,
      creditAccount: `TERM_${playerId}`,
      amountMinor,
      category: 'BANK_DEPOSIT',
      referenceId: `TERM-${Date.now()}`,
      description: `Gửi tiết kiệm kỳ hạn đến Ngày ${maturityGameDay}`,
    });
  }

  /**
   * Resets a player's balances and holdings back to clean starting capital STRICTLY inside WORLD-PRACTICE.
   * Preserves exact double-entry conservation across CR and all simulated currencies.
   */
  resetPracticePlayerBalances(playerId: string, targetCRMinor: number): Wallet {
    if (this.worldId !== 'WORLD-PRACTICE') {
      throw new DomainError('FORBIDDEN_IN_PRODUCTION', 'Chỉ hỗ trợ đặt lại tài khoản trong Phòng Luyện Tập.', 403);
    }
    const wallet = this.requireWallet(playerId);

    // 1. Return any savings & term deposits back to available CR
    if (wallet.savingsMinor > 0) {
      this.withdrawFromSavings(playerId, wallet.savingsMinor);
    }
    if (wallet.termDepositMinor > 0) {
      const amt = wallet.termDepositMinor;
      wallet.termDepositMinor = 0;
      wallet.termDepositMaturityGameDay = null;
      wallet.availableMinor += amt;
      this.syncCRMirror(wallet);
      this.recordEntry({
        transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
        currency: 'CR',
        debitAccount: `TERM_${playerId}`,
        creditAccount: playerId,
        amountMinor: amt,
        category: 'BANK_WITHDRAW',
        referenceId: `PRACTICE-RESET-${Date.now()}`,
        description: 'Giải phóng tiền gửi kỳ hạn khi đặt lại tài khoản Luyện tập',
      });
    }

    // 2. Release any residual locked funds (caller must have already cancelled open orders)
    if (wallet.lockedMinor > 0) {
      wallet.availableMinor += wallet.lockedMinor;
      wallet.lockedMinor = 0;
      this.syncCRMirror(wallet);
    }

    // 3. Zero non-CR currency balances back to FX issuance contra-account
    for (const c of ALL_CURRENCIES) {
      if (c === 'CR') continue;
      const bal = wallet.currencyBalances[c];
      if (!bal) continue;
      const totalForeign = bal.availableMinor + bal.lockedMinor;
      if (totalForeign > 0) {
        bal.availableMinor = 0;
        bal.lockedMinor = 0;
        const fxIssuance = `${SYSTEM_ACCOUNTS.FX_ISSUANCE_PREFIX}${c}`;
        const prev = this.fxSystemBalances.get(`${c}:${fxIssuance}`) ?? 0;
        this.fxSystemBalances.set(`${c}:${fxIssuance}`, prev + totalForeign);
        this.recordEntry({
          transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
          currency: c,
          debitAccount: playerId,
          creditAccount: fxIssuance,
          amountMinor: totalForeign,
          category: 'SYSTEM_ISSUANCE',
          referenceId: `PRACTICE-RESET-${c}-${Date.now()}`,
          description: `Thu hồi ${c} khi đặt lại tài khoản Phòng Luyện Tập`,
        });
      }
    }

    // 4. Clear spot/crypto holdings for this practice player
    const holdings = this.wallets.listHoldings(playerId);
    for (const h of holdings) {
      this.wallets.saveHolding(playerId, {
        ...h,
        availableQty: 0,
        lockedQty: 0,
        avgCostMinor: 0,
        realizedPnlMinor: 0,
      });
    }

    // 5. Reconcile CR balance to exact targetCRMinor (100,000 CR) via TREASURY_ISSUANCE
    const delta = targetCRMinor - wallet.availableMinor;
    if (delta > 0) {
      this.issueFunds(
        playerId,
        delta,
        'SYSTEM_ISSUANCE',
        `PRACTICE-TOPUP-${Date.now()}`,
        'Bổ sung vốn luyện tập về mốc 100,000 CR',
      );
    } else if (delta < 0) {
      const burn = Math.abs(delta);
      wallet.availableMinor -= burn;
      this.syncCRMirror(wallet);
      const prevIssuance = this.systemBalances.get(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE) ?? 0;
      this.systemBalances.set(SYSTEM_ACCOUNTS.TREASURY_ISSUANCE, prevIssuance + burn);
      this.recordEntry({
        transactionId: `tx_${crypto.randomBytes(6).toString('hex')}`,
        currency: 'CR',
        debitAccount: playerId,
        creditAccount: SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
        amountMinor: burn,
        category: 'SYSTEM_ISSUANCE',
        referenceId: `PRACTICE-BURN-${Date.now()}`,
        description: 'Điều chỉnh vốn luyện tập về mốc 100,000 CR',
      });
    }

    return cloneWallet(wallet);
  }
}

