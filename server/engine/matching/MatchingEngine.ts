import crypto from 'node:crypto';
import {
  CR_SCALE,
  DEFAULT_MAKER_FEE_BPS,
  DEFAULT_TAKER_FEE_BPS,
  FOREX_MAKER_FEE_BPS,
  FOREX_TAKER_FEE_BPS,
  calcFeeMinor,
  calcFxQuoteMinor,
  calcNotionalMinor,
  formatRate,
  roundQty,
  toCurrencyMinor,
  toScaledInt,
  type CurrencyCode,
} from '../../../shared/contracts/money';
import type { OrderPreviewResponse } from '../../../shared/contracts/beginner';
import {
  ERROR_MESSAGES_VI,
  type Asset,
  type Candle,
  type ErrorCode,
  type MarketClass,
  type Order,
  type OrderBookLevel,
  type OrderBookSnapshot,
  type OrderSide,
  type OrderType,
  type TimeInForce,
  type Timeframe,
  type Trade,
} from '../../../shared/contracts/types';
import { isOrderOpen } from '../../../shared/contracts/orderLifecycle';
import { DomainError } from '../../domain/DomainError';
import { LedgerService } from '../ledger/LedgerService';
import { CandleAggregator } from './CandleAggregator';

export type OrderLifecycleEventKind = 'created' | 'partially_filled' | 'filled' | 'cancelled' | 'expired';

export interface MatchingEngineHooks {
  onOrderUpdated?: (order: Order, eventKind: OrderLifecycleEventKind) => void;
}

export interface PlaceOrderCommand {
  playerId: string;
  playerName: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  timeInForce?: TimeInForce;
  priceCR?: number; // Price in quote units (CR for stocks/crypto, quote currency rate for FX)
  quantity: number;
  maxSlippageBps?: number;
  expiresAt?: string | null;
  ttlSeconds?: number;
  idempotencyKey?: string;
}

export interface PlaceOrderResult {
  order: Order;
  affectedOrders: Order[];
  trades: Trade[];
  orderBook: OrderBookSnapshot;
  updatedCandles: Record<Timeframe, Candle> | null;
  deduplicated: boolean;
}

export interface CancelOrderResult {
  order: Order;
  orderBook: OrderBookSnapshot;
  refundedFundsMinor: number;
  refundedAssetQty: number;
}

export interface MatchingEngineConfig {
  worldId: string;
  makerFeeBps?: number;
  takerFeeBps?: number;
  priceBandPct?: number; // e.g., 0.25 = +/- 25% around reference price
  enforcePriceBand?: boolean;
}

/**
 * Central Authoritative Price-Time Priority Matching Engine for ECX (Crypto), ESE (Stocks), and EFX (Forex).
 *
 * Guarantees:
 * - Price-Time Priority: best price first, FIFO sequence on equal price.
 * - Resting-order execution pricing: maker price determines fill price.
 * - Exact integer minor-unit settlement via LedgerService (CR for Stocks/Crypto; Base & Quote currencies for Forex).
 * - Self-Trade Prevention: never matches two orders from the same playerId.
 * - Idempotency: duplicate idempotencyKey returns original order without double-fill.
 * - Double-Settlement Guard: each trade ID can settle at most once.
 * - No synthetic counterparty: Market orders match ONLY real resting liquidity.
 */
export class MatchingEngine {
  public readonly worldId: string;
  public readonly makerFeeBps: number;
  public readonly takerFeeBps: number;
  public readonly priceBandPct: number;
  public enforcePriceBand: boolean;

  private readonly ledger: LedgerService;
  public readonly candles: CandleAggregator;

  private assets = new Map<string, Asset>();
  private bids = new Map<string, Order[]>(); // Descending price, ascending createdSeq
  private asks = new Map<string, Order[]>(); // Ascending price, ascending createdSeq
  private ordersById = new Map<string, Order>();
  private idempotencyIndex = new Map<string, string>(); // `${playerId}:${key}` -> orderId
  private tradesBySymbol = new Map<string, Trade[]>();
  private allTrades: Trade[] = [];
  private settledTradeIds = new Set<string>();

  private orderSeq = 0;
  private bookSeq = 0;
  private hooks: MatchingEngineHooks = {};

  constructor(ledger: LedgerService, candles: CandleAggregator, config: MatchingEngineConfig) {
    this.ledger = ledger;
    this.candles = candles;
    this.worldId = config.worldId;
    this.makerFeeBps = config.makerFeeBps ?? DEFAULT_MAKER_FEE_BPS;
    this.takerFeeBps = config.takerFeeBps ?? DEFAULT_TAKER_FEE_BPS;
    this.priceBandPct = config.priceBandPct ?? 0.25;
    this.enforcePriceBand = config.enforcePriceBand ?? true;
  }

  setHooks(hooks: MatchingEngineHooks): void {
    this.hooks = hooks;
  }

  reset(): void {
    this.assets.clear();
    this.bids.clear();
    this.asks.clear();
    this.ordersById.clear();
    this.idempotencyIndex.clear();
    this.tradesBySymbol.clear();
    this.allTrades = [];
    this.settledTradeIds.clear();
    this.orderSeq = 0;
    this.bookSeq = 0;
    this.candles.clear();
  }

  private getPriceScale(asset: Asset): number {
    return asset.priceScale ?? CR_SCALE;
  }

  private getPriceDecimals(asset: Asset): number {
    return asset.priceDecimals ?? 2;
  }

  private isForex(asset: Asset): boolean {
    return asset.marketClass === 'FOREX' && Boolean(asset.baseCurrency && asset.quoteCurrency);
  }

  private getMakerFeeBps(asset: Asset): number {
    return this.isForex(asset) ? FOREX_MAKER_FEE_BPS : this.makerFeeBps;
  }

  private getTakerFeeBps(asset: Asset): number {
    return this.isForex(asset) ? FOREX_TAKER_FEE_BPS : this.takerFeeBps;
  }

  private calcQuoteGrossMinor(asset: Asset, priceInt: number, quantity: number): number {
    if (this.isForex(asset) && asset.quoteCurrency) {
      return calcFxQuoteMinor(priceInt, this.getPriceScale(asset), quantity, asset.quoteCurrency);
    }
    return calcNotionalMinor(priceInt, quantity);
  }

  registerAsset(asset: Asset, seedCandles = true): void {
    const scale = this.getPriceScale(asset);
    const decimals = this.getPriceDecimals(asset);
    this.assets.set(asset.symbol, { ...asset, priceScale: scale, priceDecimals: decimals });
    if (!this.bids.has(asset.symbol)) this.bids.set(asset.symbol, []);
    if (!this.asks.has(asset.symbol)) this.asks.set(asset.symbol, []);
    if (!this.tradesBySymbol.has(asset.symbol)) this.tradesBySymbol.set(asset.symbol, []);
    if (seedCandles) {
      const vol = asset.marketClass === 'CRYPTO' ? 0.018 : asset.marketClass === 'FOREX' ? 0.0028 : 0.01;
      this.candles.seedSymbol(asset.symbol, asset.lastPriceMinor, vol, Date.now(), scale, decimals);
    } else {
      this.candles.setSymbolPrecision(asset.symbol, scale, decimals);
    }
  }

  getAsset(symbol: string): Asset | undefined {
    return this.assets.get(symbol);
  }

  listAssets(marketClass?: MarketClass): Asset[] {
    const all = Array.from(this.assets.values());
    return marketClass ? all.filter((a) => a.marketClass === marketClass) : all;
  }

  setMarketStatusForClass(marketClass: MarketClass, status: 'OPEN' | 'CLOSED' | 'HALTED'): void {
    for (const asset of this.assets.values()) {
      if (asset.marketClass === marketClass) {
        asset.status = status;
      }
    }
  }

  setAssetStatus(symbol: string, status: 'OPEN' | 'CLOSED' | 'HALTED'): void {
    const asset = this.assets.get(symbol);
    if (asset) asset.status = status;
  }

  getTotalOrdersCount(): number {
    return this.ordersById.size;
  }

  getOpenOrdersCount(): number {
    let count = 0;
    for (const order of this.ordersById.values()) {
      if (isOrderOpen(order)) count++;
    }
    return count;
  }

  getTotalTradesCount(): number {
    return this.allTrades.length;
  }

  getOrderById(orderId: string): Order | undefined {
    return this.ordersById.get(orderId);
  }

  listPlayerOrders(playerId: string, symbol?: string): Order[] {
    const out: Order[] = [];
    for (const order of this.ordersById.values()) {
      if (order.playerId !== playerId) continue;
      if (symbol && order.symbol !== symbol) continue;
      out.push({ ...order });
    }
    return out.sort((a, b) => b.createdSeq - a.createdSeq);
  }

  listPlayerOpenOrders(playerId: string, symbol?: string): Order[] {
    const out: Order[] = [];
    for (const order of this.ordersById.values()) {
      if (order.playerId !== playerId) continue;
      if (symbol && order.symbol !== symbol) continue;
      if (!isOrderOpen(order)) continue;
      out.push({ ...order });
    }
    return out.sort((a, b) => b.createdSeq - a.createdSeq);
  }

  listTrades(symbol?: string, limit = 50): Trade[] {
    if (symbol) {
      return (this.tradesBySymbol.get(symbol) ?? []).slice(-limit).reverse();
    }
    return this.allTrades.slice(-limit).reverse();
  }

  listPlayerTrades(playerId: string, limit = 100): Trade[] {
    return this.allTrades
      .filter((t) => t.buyerId === playerId || t.sellerId === playerId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Builds aggregated L2 Order Book snapshot for a symbol.
   */
  getOrderBook(symbol: string, depth = 15): OrderBookSnapshot {
    const asset = this.assets.get(symbol);
    if (!asset) {
      throw new DomainError('ASSET_NOT_FOUND');
    }

    const bidOrders = this.bids.get(symbol) ?? [];
    const askOrders = this.asks.get(symbol) ?? [];

    const aggregate = (orders: Order[], descending: boolean): OrderBookLevel[] => {
      const levelMap = new Map<number, OrderBookLevel>();
      for (const ord of orders) {
        if (ord.remainingQuantity <= 0) continue;
        const existing = levelMap.get(ord.priceMinor);
        const levelTotal = this.calcQuoteGrossMinor(asset, ord.priceMinor, ord.remainingQuantity);
        if (existing) {
          existing.quantity = roundQty(existing.quantity + ord.remainingQuantity);
          existing.totalMinor += levelTotal;
          existing.orderCount += 1;
        } else {
          levelMap.set(ord.priceMinor, {
            priceMinor: ord.priceMinor,
            quantity: roundQty(ord.remainingQuantity),
            totalMinor: levelTotal,
            orderCount: 1,
          });
        }
      }
      return Array.from(levelMap.values())
        .sort((a, b) => (descending ? b.priceMinor - a.priceMinor : a.priceMinor - b.priceMinor))
        .slice(0, depth);
    };

    const bids = aggregate(bidOrders, true);
    const asks = aggregate(askOrders, false);
    const bestBidMinor = bids.length > 0 ? bids[0].priceMinor : null;
    const bestAskMinor = asks.length > 0 ? asks[0].priceMinor : null;
    const spreadMinor = bestBidMinor !== null && bestAskMinor !== null ? bestAskMinor - bestBidMinor : null;
    const spreadPct =
      spreadMinor !== null && bestAskMinor && bestAskMinor > 0
        ? Number(((spreadMinor / bestAskMinor) * 100).toFixed(4))
        : null;

    return {
      symbol,
      bids,
      asks,
      bestBidMinor,
      bestAskMinor,
      spreadMinor,
      spreadPct,
      lastPriceMinor: asset.lastPriceMinor,
      sequenceNumber: this.bookSeq,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Places and immediately matches an order synchronously within the single-threaded authoritative loop.
   */
  placeOrder(cmd: PlaceOrderCommand): PlaceOrderResult {
    // 1. Idempotency check
    if (cmd.idempotencyKey) {
      const idemComposite = `${cmd.playerId}:${cmd.idempotencyKey}`;
      const existingOrderId = this.idempotencyIndex.get(idemComposite);
      if (existingOrderId) {
        const existingOrder = this.ordersById.get(existingOrderId);
        if (existingOrder) {
          return {
            order: { ...existingOrder },
            affectedOrders: [],
            trades: [],
            orderBook: this.getOrderBook(existingOrder.symbol),
            updatedCandles: null,
            deduplicated: true,
          };
        }
      }
    }

    // 2. Validate asset & market status
    const asset = this.assets.get(cmd.symbol);
    if (!asset) {
      throw new DomainError('ASSET_NOT_FOUND');
    }
    if (asset.status === 'CLOSED') {
      throw new DomainError('MARKET_CLOSED');
    }
    if (asset.status === 'HALTED') {
      throw new DomainError('MARKET_HALTED');
    }

    const isFx = this.isForex(asset);
    const priceScale = this.getPriceScale(asset);
    const priceDecimals = this.getPriceDecimals(asset);
    const makerFeeBps = this.getMakerFeeBps(asset);
    const takerFeeBps = this.getTakerFeeBps(asset);
    const maxFeeBps = Math.max(makerFeeBps, takerFeeBps);

    // 3. Validate quantity & step
    const quantity = roundQty(cmd.quantity);
    if (!Number.isFinite(quantity) || quantity < asset.minQty || quantity > asset.maxOrderQty) {
      throw new DomainError(
        'INVALID_ORDER',
        `Khối lượng phải từ ${asset.minQty} đến ${asset.maxOrderQty} ${asset.baseCurrency ?? asset.symbol}.`,
      );
    }
    const stepRatio = quantity / asset.qtyStep;
    if (Math.abs(stepRatio - Math.round(stepRatio)) > 1e-6) {
      throw new DomainError('INVALID_ORDER', `Khối lượng phải là bội số của bước ${asset.qtyStep}.`);
    }

    // 4. Validate price for LIMIT orders
    let priceMinor = 0;
    const timeInForce: TimeInForce = cmd.type === 'MARKET' ? 'IOC' : (cmd.timeInForce ?? 'GTC');
    if (cmd.type === 'LIMIT') {
      if (cmd.priceCR === undefined || !Number.isFinite(cmd.priceCR) || cmd.priceCR <= 0) {
        throw new DomainError('INVALID_PRICE');
      }
      priceMinor = toScaledInt(cmd.priceCR, priceScale);
      if (priceMinor <= 0 || priceMinor % asset.priceTickMinor !== 0) {
        const tickLabel = (asset.priceTickMinor / priceScale).toFixed(priceDecimals);
        const unitLabel = asset.quoteCurrency ?? 'CR';
        throw new DomainError(
          'INVALID_PRICE',
          `Giá đặt phải là bội số của bước giá ${tickLabel} ${unitLabel}.`,
        );
      }

      if (this.enforcePriceBand) {
        const minAllowed = Math.max(asset.priceTickMinor, Math.floor(asset.referencePriceMinor * (1 - this.priceBandPct)));
        const maxAllowed = Math.ceil(asset.referencePriceMinor * (1 + this.priceBandPct));
        if (priceMinor < minAllowed || priceMinor > maxAllowed) {
          const unitLabel = asset.quoteCurrency ?? 'CR';
          throw new DomainError(
            'PRICE_BAND_EXCEEDED',
            `Giá nằm ngoài biên độ cho phép (${formatRate(minAllowed, priceScale, priceDecimals)} – ${formatRate(maxAllowed, priceScale, priceDecimals)} ${unitLabel}).`,
          );
        }
      }
    }

    // 5. Inspect counterparty liquidity & self-trade protection BEFORE locking
    const oppositeBook = cmd.side === 'BUY' ? this.asks.get(asset.symbol)! : this.bids.get(asset.symbol)!;

    if (cmd.type === 'MARKET') {
      const matchableOpposite = oppositeBook.filter((o) => o.remainingQuantity > 0 && o.playerId !== cmd.playerId);
      if (matchableOpposite.length === 0) {
        const ownOpposite = oppositeBook.some((o) => o.remainingQuantity > 0 && o.playerId === cmd.playerId);
        if (ownOpposite) {
          throw new DomainError('SELF_TRADE_FORBIDDEN');
        }
        throw new DomainError('INSUFFICIENT_LIQUIDITY');
      }
    }

    // 6. Self-trade check for crossing LIMIT orders
    if (cmd.type === 'LIMIT') {
      const crossingOwn = oppositeBook.some((o) => {
        if (o.remainingQuantity <= 0 || o.playerId !== cmd.playerId) return false;
        return cmd.side === 'BUY' ? o.priceMinor <= priceMinor : o.priceMinor >= priceMinor;
      });
      if (crossingOwn) {
        throw new DomainError('SELF_TRADE_FORBIDDEN');
      }
    }

    // 7. Lock required funds/currency/asset BEFORE matching (prevents concurrent double-spend)
    let initialLockedFundsMinor = 0; // In quoteCurrency minor units (CR for Stocks/Crypto, quoteCurrency for FX)
    let initialLockedAssetQty = 0; // Base units (shares/coins for Stocks/Crypto, baseCurrency major qty for FX)

    if (cmd.side === 'BUY') {
      if (cmd.type === 'LIMIT') {
        const gross = this.calcQuoteGrossMinor(asset, priceMinor, quantity);
        const maxFee = calcFeeMinor(gross, maxFeeBps, isFx);
        initialLockedFundsMinor = gross + maxFee;
        if (isFx && asset.quoteCurrency) {
          this.ledger.lockCurrency(cmd.playerId, asset.quoteCurrency, initialLockedFundsMinor);
        } else {
          this.ledger.lockFunds(cmd.playerId, initialLockedFundsMinor);
        }
      } else {
        const bestAsk = oppositeBook.find((o) => o.remainingQuantity > 0 && o.playerId !== cmd.playerId);
        if (!bestAsk) {
          throw new DomainError('INSUFFICIENT_LIQUIDITY');
        }
        const slippageBps = cmd.maxSlippageBps ?? 500;
        const maxPriceMinor = Math.ceil((bestAsk.priceMinor * (10_000 + slippageBps)) / 10_000);

        let estGross = 0;
        let rem = quantity;
        for (const ask of oppositeBook) {
          if (rem <= 0) break;
          if (ask.playerId === cmd.playerId || ask.remainingQuantity <= 0) continue;
          if (ask.priceMinor > maxPriceMinor) break;
          const fill = Math.min(rem, ask.remainingQuantity);
          estGross += this.calcQuoteGrossMinor(asset, ask.priceMinor, fill);
          rem = roundQty(rem - fill);
        }
        if (estGross <= 0) {
          throw new DomainError('SLIPPAGE_EXCEEDED');
        }
        const estFee = calcFeeMinor(estGross, takerFeeBps, isFx);
        const required = estGross + estFee;

        if (isFx && asset.quoteCurrency) {
          const quoteBal = this.ledger.getCurrencyBalance(cmd.playerId, asset.quoteCurrency);
          if (quoteBal.availableMinor < required) {
            throw new DomainError('INSUFFICIENT_FUNDS');
          }
          initialLockedFundsMinor = required;
          this.ledger.lockCurrency(cmd.playerId, asset.quoteCurrency, initialLockedFundsMinor);
        } else {
          const wallet = this.ledger.requireWallet(cmd.playerId);
          if (wallet.availableMinor < required) {
            throw new DomainError('INSUFFICIENT_FUNDS');
          }
          initialLockedFundsMinor = required;
          this.ledger.lockFunds(cmd.playerId, initialLockedFundsMinor);
        }
      }
    } else {
      // SELL (MARKET or LIMIT): lock exact asset quantity (or baseCurrency minor units for FX)
      initialLockedAssetQty = quantity;
      if (isFx && asset.baseCurrency) {
        const baseLockMinor = toCurrencyMinor(quantity, asset.baseCurrency);
        this.ledger.lockCurrency(cmd.playerId, asset.baseCurrency, baseLockMinor);
      } else {
        this.ledger.lockAsset(cmd.playerId, asset.symbol, quantity);
      }
    }

    // 8. Create authoritative Order record
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const resolvedExpiresAt =
      cmd.expiresAt ??
      (typeof cmd.ttlSeconds === 'number' && cmd.ttlSeconds > 0
        ? new Date(nowMs + cmd.ttlSeconds * 1000).toISOString()
        : null);
    this.orderSeq += 1;
    const order: Order = {
      id: `ord_${this.orderSeq}_${crypto.randomBytes(4).toString('hex')}`,
      worldId: this.worldId,
      playerId: cmd.playerId,
      playerName: cmd.playerName,
      symbol: asset.symbol,
      side: cmd.side,
      type: cmd.type,
      timeInForce,
      priceMinor,
      quantity,
      filledQuantity: 0,
      remainingQuantity: quantity,
      avgExecutionPriceMinor: 0,
      lockedFundsMinor: initialLockedFundsMinor,
      lockedAssetQty: initialLockedAssetQty,
      feesPaidMinor: 0,
      status: 'OPEN',
      idempotencyKey: cmd.idempotencyKey,
      maxSlippageBps: cmd.maxSlippageBps,
      expiresAt: resolvedExpiresAt,
      version: 1,
      createdSeq: this.orderSeq,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.ordersById.set(order.id, order);
    if (cmd.idempotencyKey) {
      this.idempotencyIndex.set(`${cmd.playerId}:${cmd.idempotencyKey}`, order.id);
    }

    // 9. Match against opposite book in strict Price-Time Priority
    const trades: Trade[] = [];
    const affectedRestingMap = new Map<string, Order>();
    let updatedCandles: Record<Timeframe, Candle> | null = null;
    let totalExecWeightedPrice = 0;

    const bestOpposite = oppositeBook.find((o) => o.remainingQuantity > 0 && o.playerId !== order.playerId);
    const maxSlippageBps = cmd.maxSlippageBps ?? 500;
    const marketSlippageLimitMinor =
      cmd.type === 'MARKET' && bestOpposite
        ? cmd.side === 'BUY'
          ? Math.ceil((bestOpposite.priceMinor * (10_000 + maxSlippageBps)) / 10_000)
          : Math.floor((bestOpposite.priceMinor * (10_000 - maxSlippageBps)) / 10_000)
        : null;

    let idx = 0;
    while (order.remainingQuantity > 1e-9 && idx < oppositeBook.length) {
      const resting = oppositeBook[idx];
      if (!isOrderOpen(resting)) {
        idx++;
        continue;
      }

      if (resting.playerId === order.playerId) {
        idx++;
        continue;
      }

      if (order.type === 'LIMIT') {
        const compatible =
          order.side === 'BUY' ? resting.priceMinor <= order.priceMinor : resting.priceMinor >= order.priceMinor;
        if (!compatible) break;
      } else if (marketSlippageLimitMinor !== null) {
        const withinSlippage =
          order.side === 'BUY'
            ? resting.priceMinor <= marketSlippageLimitMinor
            : resting.priceMinor >= marketSlippageLimitMinor;
        if (!withinSlippage) break;
      }

      const execQty = roundQty(Math.min(order.remainingQuantity, resting.remainingQuantity));
      if (execQty <= 0) break;

      // Resting-order pricing (maker sets execution price)
      const execPriceMinor = resting.priceMinor;
      const grossAmountMinor = this.calcQuoteGrossMinor(asset, execPriceMinor, execQty);

      const buyerOrder = order.side === 'BUY' ? order : resting;
      const sellerOrder = order.side === 'SELL' ? order : resting;
      const buyerFeeMinor = calcFeeMinor(
        grossAmountMinor,
        order.side === 'BUY' ? takerFeeBps : makerFeeBps,
        isFx,
      );
      const sellerFeeMinor = calcFeeMinor(
        grossAmountMinor,
        order.side === 'SELL' ? takerFeeBps : makerFeeBps,
        isFx,
      );

      const tradeTimestamp = new Date().toISOString();
      const tradeId = `trd_${this.allTrades.length + 1}_${crypto.randomBytes(4).toString('hex')}`;

      const trade: Trade = {
        id: tradeId,
        worldId: this.worldId,
        symbol: asset.symbol,
        buyOrderId: buyerOrder.id,
        sellOrderId: sellerOrder.id,
        buyerId: buyerOrder.playerId,
        buyerName: buyerOrder.playerName,
        sellerId: sellerOrder.playerId,
        sellerName: sellerOrder.playerName,
        priceMinor: execPriceMinor,
        quantity: execQty,
        grossAmountMinor,
        buyerFeeMinor,
        sellerFeeMinor,
        takerSide: order.side,
        timestamp: tradeTimestamp,
      };

      // Execute Settlement (guarded against duplicate trade ID)
      this.settleTrade(trade, asset);

      // Update buyer order accounting
      const buyerLockedUsed = grossAmountMinor + buyerFeeMinor;
      buyerOrder.filledQuantity = roundQty(buyerOrder.filledQuantity + execQty);
      buyerOrder.remainingQuantity = Math.max(0, roundQty(buyerOrder.quantity - buyerOrder.filledQuantity));
      buyerOrder.lockedFundsMinor = Math.max(0, buyerOrder.lockedFundsMinor - buyerLockedUsed);
      buyerOrder.feesPaidMinor += buyerFeeMinor;
      buyerOrder.updatedAt = tradeTimestamp;

      // Update seller order accounting
      sellerOrder.filledQuantity = roundQty(sellerOrder.filledQuantity + execQty);
      sellerOrder.remainingQuantity = Math.max(0, roundQty(sellerOrder.quantity - sellerOrder.filledQuantity));
      sellerOrder.lockedAssetQty = Math.max(0, roundQty(sellerOrder.lockedAssetQty - execQty));
      sellerOrder.feesPaidMinor += sellerFeeMinor;
      sellerOrder.updatedAt = tradeTimestamp;

      // Recompute average execution price in priceScale integer units
      totalExecWeightedPrice += execPriceMinor * execQty;
      order.avgExecutionPriceMinor = Math.round(totalExecWeightedPrice / order.filledQuantity);

      const prevRestingFilled = roundQty(resting.filledQuantity - execQty);
      resting.avgExecutionPriceMinor =
        resting.filledQuantity > 0
          ? Math.round((prevRestingFilled * resting.avgExecutionPriceMinor + execPriceMinor * execQty) / resting.filledQuantity)
          : execPriceMinor;

      // Update resting order status & refund excess locked funds on full fill
      if (resting.remainingQuantity <= 1e-9) {
        resting.remainingQuantity = 0;
        resting.status = 'FILLED';
        if (resting.side === 'BUY' && resting.lockedFundsMinor > 0) {
          if (isFx && asset.quoteCurrency) {
            this.ledger.unlockCurrency(resting.playerId, asset.quoteCurrency, resting.lockedFundsMinor);
          } else {
            this.ledger.unlockFunds(resting.playerId, resting.lockedFundsMinor);
          }
          resting.lockedFundsMinor = 0;
        }
        if (resting.side === 'SELL' && resting.lockedAssetQty > 0) {
          resting.lockedAssetQty = 0;
        }
      } else {
        resting.status = 'PARTIALLY_FILLED';
      }
      resting.version = (resting.version ?? 0) + 1;
      affectedRestingMap.set(resting.id, { ...resting });

      // Record trade & update market metrics + candles
      trades.push(trade);
      this.allTrades.push(trade);
      this.tradesBySymbol.get(asset.symbol)!.push(trade);
      if (this.tradesBySymbol.get(asset.symbol)!.length > 500) {
        this.tradesBySymbol.get(asset.symbol)!.shift();
      }
      if (this.allTrades.length > 5000) {
        this.allTrades.shift();
      }

      this.updateAssetStatsFromTrade(asset, trade);
      updatedCandles = this.candles.recordTrade(trade);

      idx++;
    }

    this.pruneFilledOrders(asset.symbol, cmd.side === 'BUY' ? 'SELL' : 'BUY');

    // 10. Finalize incoming order state & handle IOC/MARKET remainder or resting GTC placement
    const unlockOrderFunds = (amount: number) => {
      if (amount <= 0) return;
      if (isFx && asset.quoteCurrency) {
        this.ledger.unlockCurrency(order.playerId, asset.quoteCurrency, amount);
      } else {
        this.ledger.unlockFunds(order.playerId, amount);
      }
    };

    const unlockOrderAsset = (qty: number) => {
      if (qty <= 0) return;
      if (isFx && asset.baseCurrency) {
        this.ledger.unlockCurrency(order.playerId, asset.baseCurrency, toCurrencyMinor(qty, asset.baseCurrency));
      } else {
        this.ledger.unlockAsset(order.playerId, asset.symbol, qty);
      }
    };

    if (order.remainingQuantity <= 1e-9) {
      order.remainingQuantity = 0;
      order.status = 'FILLED';
      if (order.side === 'BUY' && order.lockedFundsMinor > 0) {
        unlockOrderFunds(order.lockedFundsMinor);
        order.lockedFundsMinor = 0;
      }
      if (order.side === 'SELL' && order.lockedAssetQty > 0) {
        unlockOrderAsset(order.lockedAssetQty);
        order.lockedAssetQty = 0;
      }
    } else if (order.type === 'MARKET' || order.timeInForce === 'IOC') {
      order.remainingQuantity = 0;
      order.status = 'CANCELLED';
      if (order.side === 'BUY' && order.lockedFundsMinor > 0) {
        unlockOrderFunds(order.lockedFundsMinor);
        order.lockedFundsMinor = 0;
      }
      if (order.side === 'SELL' && order.lockedAssetQty > 0) {
        unlockOrderAsset(order.lockedAssetQty);
        order.lockedAssetQty = 0;
      }
    } else if (order.expiresAt && Date.parse(order.expiresAt) <= Date.now()) {
      order.remainingQuantity = 0;
      order.status = 'EXPIRED';
      if (order.side === 'BUY' && order.lockedFundsMinor > 0) {
        unlockOrderFunds(order.lockedFundsMinor);
        order.lockedFundsMinor = 0;
      }
      if (order.side === 'SELL' && order.lockedAssetQty > 0) {
        unlockOrderAsset(order.lockedAssetQty);
        order.lockedAssetQty = 0;
      }
    } else {
      order.status = order.filledQuantity > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
      if (order.side === 'BUY') {
        const neededGross = this.calcQuoteGrossMinor(asset, order.priceMinor, order.remainingQuantity);
        const neededFee = calcFeeMinor(neededGross, maxFeeBps, isFx);
        const neededLock = neededGross + neededFee;
        if (order.lockedFundsMinor > neededLock) {
          const surplus = order.lockedFundsMinor - neededLock;
          unlockOrderFunds(surplus);
          order.lockedFundsMinor = neededLock;
        }
      }
      this.insertRestingOrder(order);
    }

    order.version = (order.version ?? 0) + 1;
    order.updatedAt = new Date().toISOString();

    this.bookSeq += 1;
    this.recomputeLiquidityScore(asset);

    const finalOrderSnap = { ...order };
    const affectedOrders = Array.from(affectedRestingMap.values());

    // Emit authoritative order lifecycle notifications for resting counterparties & incoming order
    for (const affected of affectedOrders) {
      this.hooks.onOrderUpdated?.(
        affected,
        affected.status === 'FILLED' ? 'filled' : 'partially_filled',
      );
    }
    const incomingKind: OrderLifecycleEventKind =
      finalOrderSnap.status === 'FILLED'
        ? 'filled'
        : finalOrderSnap.status === 'PARTIALLY_FILLED'
          ? 'partially_filled'
          : finalOrderSnap.status === 'CANCELLED'
            ? 'cancelled'
            : finalOrderSnap.status === 'EXPIRED'
              ? 'expired'
              : 'created';
    this.hooks.onOrderUpdated?.(finalOrderSnap, incomingKind);

    return {
      order: finalOrderSnap,
      affectedOrders,
      trades,
      orderBook: this.getOrderBook(asset.symbol),
      updatedCandles,
      deduplicated: false,
    };
  }

  /**
   * Publicly testable atomic trade settlement with strict double-settlement prevention (TEST 12).
   */
  public settleTrade(trade: Trade, asset?: Asset): void {
    if (this.settledTradeIds.has(trade.id)) {
      throw new DomainError('INVALID_ORDER', `Giao dịch ${trade.id} đã được thanh toán trước đó.`);
    }
    const targetAsset = asset ?? this.assets.get(trade.symbol);
    if (!targetAsset) {
      throw new DomainError('ASSET_NOT_FOUND');
    }

    this.settledTradeIds.add(trade.id);

    if (this.isForex(targetAsset) && targetAsset.baseCurrency && targetAsset.quoteCurrency) {
      const baseAmountMinor = toCurrencyMinor(trade.quantity, targetAsset.baseCurrency);
      const rateLabel = formatRate(
        trade.priceMinor,
        this.getPriceScale(targetAsset),
        this.getPriceDecimals(targetAsset),
      );
      this.ledger.settleFxTrade({
        tradeId: trade.id,
        symbol: trade.symbol,
        baseCurrency: targetAsset.baseCurrency,
        quoteCurrency: targetAsset.quoteCurrency,
        buyerId: trade.buyerId,
        sellerId: trade.sellerId,
        baseAmountMinor,
        quoteGrossMinor: trade.grossAmountMinor,
        buyerFeeQuoteMinor: trade.buyerFeeMinor,
        sellerFeeQuoteMinor: trade.sellerFeeMinor,
        rateLabel,
        baseQtyDisplay: trade.quantity,
        timestamp: trade.timestamp,
      });
      return;
    }

    // Standard Stock / Crypto settlement in CR + asset holding
    this.ledger.settleTradeCash({
      tradeId: trade.id,
      symbol: trade.symbol,
      buyerId: trade.buyerId,
      sellerId: trade.sellerId,
      grossAmountMinor: trade.grossAmountMinor,
      buyerFeeMinor: trade.buyerFeeMinor,
      sellerFeeMinor: trade.sellerFeeMinor,
      quantity: trade.quantity,
      priceMinor: trade.priceMinor,
      timestamp: trade.timestamp,
    });

    this.ledger.settleTradeAsset({
      buyerId: trade.buyerId,
      sellerId: trade.sellerId,
      symbol: trade.symbol,
      marketClass: targetAsset.marketClass,
      quantity: trade.quantity,
      priceMinor: trade.priceMinor,
      sellerFeeMinor: trade.sellerFeeMinor,
    });
  }

  /**
   * Cancels an open/partially-filled order and immediately releases remaining locked currency or asset.
   */
  cancelOrder(orderId: string, requesterPlayerId: string): CancelOrderResult {
    const order = this.ordersById.get(orderId);
    if (!order || order.playerId !== requesterPlayerId) {
      throw new DomainError('ORDER_NOT_FOUND');
    }
    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new DomainError('ORDER_ALREADY_FILLED');
    }

    const asset = this.assets.get(order.symbol);
    const isFx = asset ? this.isForex(asset) : false;

    const book = order.side === 'BUY' ? this.bids.get(order.symbol)! : this.asks.get(order.symbol)!;
    const idx = book.findIndex((o) => o.id === order.id);
    if (idx !== -1) {
      book.splice(idx, 1);
    }

    let refundedFundsMinor = 0;
    let refundedAssetQty = 0;

    if (order.side === 'BUY' && order.lockedFundsMinor > 0) {
      refundedFundsMinor = order.lockedFundsMinor;
      if (isFx && asset?.quoteCurrency) {
        this.ledger.unlockCurrency(order.playerId, asset.quoteCurrency, refundedFundsMinor);
      } else {
        this.ledger.unlockFunds(order.playerId, refundedFundsMinor);
      }
      order.lockedFundsMinor = 0;
    }

    if (order.side === 'SELL' && order.lockedAssetQty > 0) {
      refundedAssetQty = order.lockedAssetQty;
      if (isFx && asset?.baseCurrency) {
        this.ledger.unlockCurrency(order.playerId, asset.baseCurrency, toCurrencyMinor(refundedAssetQty, asset.baseCurrency));
      } else {
        this.ledger.unlockAsset(order.playerId, order.symbol, refundedAssetQty);
      }
      order.lockedAssetQty = 0;
    }

    order.remainingQuantity = 0;
    order.status = 'CANCELLED';
    order.version = (order.version ?? 0) + 1;
    order.updatedAt = new Date().toISOString();

    this.bookSeq += 1;
    if (asset) this.recomputeLiquidityScore(asset);

    const cancelledSnap = { ...order };
    this.hooks.onOrderUpdated?.(cancelledSnap, 'cancelled');

    return {
      order: cancelledSnap,
      orderBook: this.getOrderBook(order.symbol),
      refundedFundsMinor,
      refundedAssetQty,
    };
  }

  /**
   * Expires all resting orders whose `expiresAt` timestamp has elapsed,
   * removes them from the book, releases all remaining locked funds/assets,
   * sets remainingQuantity = 0 and status = 'EXPIRED', and emits `order.expired`.
   */
  expireOrders(nowMs = Date.now()): Order[] {
    const expired: Order[] = [];
    const affectedSymbols = new Set<string>();
    const nowIso = new Date(nowMs).toISOString();

    for (const order of this.ordersById.values()) {
      if (!isOrderOpen(order)) continue;
      if (!order.expiresAt) continue;
      const expMs = Date.parse(order.expiresAt);
      if (!Number.isFinite(expMs) || expMs > nowMs) continue;

      const asset = this.assets.get(order.symbol);
      const isFx = asset ? this.isForex(asset) : false;
      const book = order.side === 'BUY' ? this.bids.get(order.symbol) : this.asks.get(order.symbol);
      if (book) {
        const idx = book.findIndex((o) => o.id === order.id);
        if (idx !== -1) book.splice(idx, 1);
      }

      if (order.side === 'BUY' && order.lockedFundsMinor > 0) {
        if (isFx && asset?.quoteCurrency) {
          this.ledger.unlockCurrency(order.playerId, asset.quoteCurrency, order.lockedFundsMinor);
        } else {
          this.ledger.unlockFunds(order.playerId, order.lockedFundsMinor);
        }
        order.lockedFundsMinor = 0;
      }

      if (order.side === 'SELL' && order.lockedAssetQty > 0) {
        if (isFx && asset?.baseCurrency) {
          this.ledger.unlockCurrency(
            order.playerId,
            asset.baseCurrency,
            toCurrencyMinor(order.lockedAssetQty, asset.baseCurrency),
          );
        } else {
          this.ledger.unlockAsset(order.playerId, order.symbol, order.lockedAssetQty);
        }
        order.lockedAssetQty = 0;
      }

      order.remainingQuantity = 0;
      order.status = 'EXPIRED';
      order.version = (order.version ?? 0) + 1;
      order.updatedAt = nowIso;
      affectedSymbols.add(order.symbol);

      const snap = { ...order };
      expired.push(snap);
      this.hooks.onOrderUpdated?.(snap, 'expired');
    }

    if (affectedSymbols.size > 0) {
      this.bookSeq += 1;
      for (const sym of affectedSymbols) {
        const asset = this.assets.get(sym);
        if (asset) this.recomputeLiquidityScore(asset);
      }
    }

    return expired;
  }

  cancelAllPlayerOrdersForSymbol(playerId: string, symbol: string): void {
    const openOrders = this.listPlayerOpenOrders(playerId, symbol);
    for (const ord of openOrders) {
      this.cancelOrder(ord.id, playerId);
    }
  }

  cancelAllPlayerOrders(playerId: string): void {
    const openOrders = this.listPlayerOpenOrders(playerId);
    for (const ord of openOrders) {
      this.cancelOrder(ord.id, playerId);
    }
  }

  /**
   * Side-effect-free authoritative order preview supporting BOTH `quantity` and `amountQuote` (e.g. CR budget).
   * Walks the live resting order book using exact integer settlement & fee math without locking funds.
   */
  previewOrder(params: {
    playerId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    priceCR?: number;
    quantity?: number;
    amountQuote?: number;
    maxSlippageBps?: number;
  }): OrderPreviewResponse {
    const asset = this.assets.get(params.symbol);
    if (!asset) {
      throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
    }

    const isFx = this.isForex(asset);
    const quoteCurrency: CurrencyCode = isFx && asset.quoteCurrency ? asset.quoteCurrency : 'CR';
    const baseUnitLabel = isFx && asset.baseCurrency ? asset.baseCurrency : asset.symbol;
    const priceScale = this.getPriceScale(asset);
    const priceDecimals = this.getPriceDecimals(asset);
    const makerFeeBps = this.getMakerFeeBps(asset);
    const takerFeeBps = this.getTakerFeeBps(asset);
    const feeRateBps = params.type === 'MARKET' ? takerFeeBps : Math.max(makerFeeBps, takerFeeBps);

    const book = this.getOrderBook(asset.symbol, 25);
    const oppositeBook = (params.side === 'BUY' ? this.asks.get(asset.symbol) : this.bids.get(asset.symbol)) ?? [];
    const matchableOpposite = oppositeBook.filter((o) => isOrderOpen(o) && o.playerId !== params.playerId);

    const bestPriceMinor = params.side === 'BUY' ? book.bestAskMinor : book.bestBidMinor;
    const referencePriceMinor = bestPriceMinor ?? asset.lastPriceMinor;

    const wallet = this.ledger.requireWallet(params.playerId);
    const availableBeforeMinor =
      isFx && asset.quoteCurrency
        ? this.ledger.getCurrencyBalance(params.playerId, asset.quoteCurrency).availableMinor
        : wallet.availableMinor;

    const availableAssetQty =
      isFx && asset.baseCurrency
        ? Number(
            (
              this.ledger.getCurrencyBalance(params.playerId, asset.baseCurrency).availableMinor /
              (asset.baseCurrency === 'JPY-SIM' ? 100 : 100)
            ).toFixed(6),
          )
        : (this.ledger.wallets.getHolding(params.playerId, asset.symbol)?.availableQty ?? 0);

    let blockingCode: ErrorCode | null = null;
    let blockingMessage: string | null = null;

    if (asset.status === 'CLOSED') {
      blockingCode = 'MARKET_CLOSED';
      blockingMessage = ERROR_MESSAGES_VI.MARKET_CLOSED;
    } else if (asset.status === 'HALTED') {
      blockingCode = 'MARKET_HALTED';
      blockingMessage = ERROR_MESSAGES_VI.MARKET_HALTED;
    }

    // Determine effective price for LIMIT orders
    let limitPriceMinor = 0;
    if (params.type === 'LIMIT') {
      if (params.priceCR === undefined || !Number.isFinite(params.priceCR) || params.priceCR <= 0) {
        blockingCode = blockingCode ?? 'INVALID_PRICE';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INVALID_PRICE;
      } else {
        limitPriceMinor = toScaledInt(params.priceCR, priceScale);
        if (limitPriceMinor <= 0 || limitPriceMinor % asset.priceTickMinor !== 0) {
          blockingCode = blockingCode ?? 'INVALID_PRICE';
          blockingMessage =
            blockingMessage ??
            `Giá đặt phải là bội số của bước giá ${(asset.priceTickMinor / priceScale).toFixed(priceDecimals)} ${quoteCurrency}.`;
        } else if (this.enforcePriceBand) {
          const minAllowed = Math.max(asset.priceTickMinor, Math.floor(asset.referencePriceMinor * (1 - this.priceBandPct)));
          const maxAllowed = Math.ceil(asset.referencePriceMinor * (1 + this.priceBandPct));
          if (limitPriceMinor < minAllowed || limitPriceMinor > maxAllowed) {
            blockingCode = blockingCode ?? 'PRICE_BAND_EXCEEDED';
            blockingMessage =
              blockingMessage ??
              `Giá nằm ngoài biên độ cho phép (${formatRate(minAllowed, priceScale, priceDecimals)} – ${formatRate(maxAllowed, priceScale, priceDecimals)} ${quoteCurrency}).`;
          }
        }
      }
    }

    const snapDownToStep = (rawQty: number): number => {
      if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
      const steps = Math.floor(rawQty / asset.qtyStep + 1e-9);
      return roundQty(steps * asset.qtyStep);
    };

    const maxSlippageBps = params.maxSlippageBps ?? 500;
    const marketSlippageLimitMinor =
      params.type === 'MARKET' && matchableOpposite.length > 0
        ? params.side === 'BUY'
          ? Math.ceil((matchableOpposite[0].priceMinor * (10_000 + maxSlippageBps)) / 10_000)
          : Math.floor((matchableOpposite[0].priceMinor * (10_000 - maxSlippageBps)) / 10_000)
        : null;

    // Resolve target quantity from either explicit `quantity` or quote budget `amountQuote`
    let targetQty = 0;
    if (params.quantity !== undefined && Number.isFinite(params.quantity) && params.quantity > 0) {
      targetQty = roundQty(params.quantity);
    } else if (params.amountQuote !== undefined && Number.isFinite(params.amountQuote) && params.amountQuote > 0) {
      const budgetMinor = toCurrencyMinor(params.amountQuote, quoteCurrency);
      const refPrice = params.type === 'LIMIT' && limitPriceMinor > 0 ? limitPriceMinor : referencePriceMinor;
      if (refPrice > 0) {
        if (params.side === 'BUY') {
          // Conservative initial guess accounting for fee, then refine against real book / limit price
          const feeFactor = 1 + feeRateBps / 10_000;
          const unitCostMinor = this.calcQuoteGrossMinor(asset, refPrice, asset.qtyStep);
          let candidateQty =
            unitCostMinor > 0
              ? snapDownToStep((budgetMinor / (unitCostMinor * feeFactor)) * asset.qtyStep)
              : snapDownToStep((params.amountQuote / (refPrice / priceScale)) / feeFactor);

          // Ensure gross + fee NEVER exceeds budgetMinor
          const evalCost = (q: number): number => {
            if (q <= 0) return 0;
            if (params.type === 'LIMIT' && limitPriceMinor > 0) {
              const g = this.calcQuoteGrossMinor(asset, limitPriceMinor, q);
              return g + calcFeeMinor(g, feeRateBps, isFx);
            }
            let rem = q;
            let g = 0;
            for (const o of matchableOpposite) {
              if (rem <= 1e-9) break;
              if (marketSlippageLimitMinor !== null && o.priceMinor > marketSlippageLimitMinor) break;
              const f = Math.min(rem, o.remainingQuantity);
              g += this.calcQuoteGrossMinor(asset, o.priceMinor, f);
              rem = roundQty(rem - f);
            }
            if (rem > 1e-9) {
              g += this.calcQuoteGrossMinor(asset, refPrice, rem);
            }
            return g + calcFeeMinor(g, takerFeeBps, isFx);
          };

          // Step up if room remains, step down if over budget
          let guard = 0;
          while (candidateQty > 0 && evalCost(candidateQty) > budgetMinor && guard < 200) {
            candidateQty = roundQty(candidateQty - asset.qtyStep);
            guard++;
          }
          guard = 0;
          while (
            candidateQty + asset.qtyStep <= asset.maxOrderQty &&
            evalCost(roundQty(candidateQty + asset.qtyStep)) <= budgetMinor &&
            guard < 50
          ) {
            candidateQty = roundQty(candidateQty + asset.qtyStep);
            guard++;
          }
          targetQty = Math.max(0, candidateQty);
        } else {
          // SELL by quote value -> snap down to step and clamp to availableAssetQty if needed
          const rawQty = params.amountQuote / (refPrice / priceScale);
          targetQty = snapDownToStep(rawQty);
        }
      }
    }

    // Validate quantity bounds
    if (targetQty < asset.minQty) {
      blockingCode = blockingCode ?? 'INVALID_ORDER';
      blockingMessage =
        blockingMessage ??
        `Số tiền/khối lượng chưa đạt mức tối thiểu ${asset.minQty} ${baseUnitLabel} cho mã ${asset.symbol}.`;
    } else if (targetQty > asset.maxOrderQty) {
      blockingCode = blockingCode ?? 'INVALID_ORDER';
      blockingMessage =
        blockingMessage ?? `Khối lượng vượt giới hạn tối đa ${asset.maxOrderQty} ${baseUnitLabel} mỗi lệnh.`;
    } else {
      const stepRatio = targetQty / asset.qtyStep;
      if (Math.abs(stepRatio - Math.round(stepRatio)) > 1e-6) {
        blockingCode = blockingCode ?? 'INVALID_ORDER';
        blockingMessage = blockingMessage ?? `Khối lượng phải là bội số của bước ${asset.qtyStep}.`;
      }
    }

    // Walk opposite book to compute realistic fill price, slippage, and liquidity coverage
    let fillableQty = 0;
    let matchedGrossMinor = 0;
    let weightedPriceSum = 0;

    if (params.type === 'MARKET') {
      if (matchableOpposite.length === 0) {
        const ownOpp = oppositeBook.some((o) => isOrderOpen(o) && o.playerId === params.playerId);
        blockingCode = blockingCode ?? (ownOpp ? 'SELF_TRADE_FORBIDDEN' : 'INSUFFICIENT_LIQUIDITY');
        blockingMessage =
          blockingMessage ??
          (ownOpp ? ERROR_MESSAGES_VI.SELF_TRADE_FORBIDDEN : ERROR_MESSAGES_VI.INSUFFICIENT_LIQUIDITY);
      } else {
        let rem = targetQty;
        for (const opp of matchableOpposite) {
          if (rem <= 1e-9) break;
          if (marketSlippageLimitMinor !== null) {
            const within =
              params.side === 'BUY'
                ? opp.priceMinor <= marketSlippageLimitMinor
                : opp.priceMinor >= marketSlippageLimitMinor;
            if (!within) break;
          }
          const fill = roundQty(Math.min(rem, opp.remainingQuantity));
          if (fill <= 0) break;
          fillableQty = roundQty(fillableQty + fill);
          matchedGrossMinor += this.calcQuoteGrossMinor(asset, opp.priceMinor, fill);
          weightedPriceSum += opp.priceMinor * fill;
          rem = roundQty(rem - fill);
        }
        if (targetQty > 0 && fillableQty <= 0) {
          blockingCode = blockingCode ?? 'SLIPPAGE_EXCEEDED';
          blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.SLIPPAGE_EXCEEDED;
        }
      }
    } else if (limitPriceMinor > 0) {
      // Self-trade check for crossing LIMIT
      const crossingOwn = oppositeBook.some((o) => {
        if (!isOrderOpen(o) || o.playerId !== params.playerId) return false;
        return params.side === 'BUY' ? o.priceMinor <= limitPriceMinor : o.priceMinor >= limitPriceMinor;
      });
      if (crossingOwn) {
        blockingCode = blockingCode ?? 'SELF_TRADE_FORBIDDEN';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.SELF_TRADE_FORBIDDEN;
      }
      fillableQty = targetQty;
      matchedGrossMinor = this.calcQuoteGrossMinor(asset, limitPriceMinor, targetQty);
      weightedPriceSum = limitPriceMinor * targetQty;
    }

    const effectiveQty = params.type === 'MARKET' ? (fillableQty > 0 ? fillableQty : targetQty) : targetQty;
    const estimatedAvgPriceMinor =
      params.type === 'LIMIT' && limitPriceMinor > 0
        ? limitPriceMinor
        : fillableQty > 0
          ? Math.round(weightedPriceSum / fillableQty)
          : referencePriceMinor;

    const estimatedNotionalMinor =
      params.type === 'MARKET' && fillableQty > 0
        ? matchedGrossMinor
        : this.calcQuoteGrossMinor(asset, estimatedAvgPriceMinor, effectiveQty);

    const estimatedFeeMinor = calcFeeMinor(estimatedNotionalMinor, feeRateBps, isFx);
    const estimatedTotalMinor =
      params.side === 'BUY'
        ? estimatedNotionalMinor + estimatedFeeMinor
        : Math.max(0, estimatedNotionalMinor - estimatedFeeMinor);

    // Balance & asset sufficiency validation
    if (params.side === 'BUY') {
      if (availableBeforeMinor < estimatedTotalMinor) {
        blockingCode = blockingCode ?? 'INSUFFICIENT_FUNDS';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INSUFFICIENT_FUNDS;
      }
    } else {
      if (availableAssetQty + 1e-9 < targetQty) {
        blockingCode = blockingCode ?? 'INSUFFICIENT_ASSET_BALANCE';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INSUFFICIENT_ASSET_BALANCE;
      }
    }

    const remainingAvailableMinor =
      params.side === 'BUY'
        ? Math.max(0, availableBeforeMinor - estimatedTotalMinor)
        : availableBeforeMinor + estimatedTotalMinor;

    const remainingAssetQty =
      params.side === 'BUY'
        ? roundQty(availableAssetQty + effectiveQty)
        : Math.max(0, roundQty(availableAssetQty - targetQty));

    const estimatedSlippageBps =
      params.type === 'MARKET' && bestPriceMinor && bestPriceMinor > 0 && estimatedAvgPriceMinor > 0
        ? Math.max(0, Math.round((Math.abs(estimatedAvgPriceMinor - bestPriceMinor) / bestPriceMinor) * 10_000))
        : 0;

    const partialFillWarning = params.type === 'MARKET' && targetQty > 0 && fillableQty > 0 && fillableQty + 1e-9 < targetQty;
    const lowLiquidityWarning =
      partialFillWarning ||
      estimatedSlippageBps >= 80 ||
      asset.liquidityScore < 65 ||
      (book.spreadPct !== null && book.spreadPct >= 1.5);

    const priceEstimateNote =
      params.type === 'MARKET'
        ? 'Giá khớp dự kiến là mức ước tính theo sổ lệnh hiện tại, không cam kết cố định khi thị trường biến động.'
        : 'Lệnh Đặt giá mong muốn sẽ khớp ở giá bạn đặt hoặc tốt hơn khi có lệnh đối ứng phù hợp.';

    return {
      symbol: asset.symbol,
      assetName: asset.name,
      marketClass: asset.marketClass,
      side: params.side,
      type: params.type,
      quoteCurrency,
      baseUnitLabel,
      priceScale,
      priceDecimals,
      estimatedQuantity: targetQty,
      fillableQuantity: fillableQty,
      estimatedAvgPriceMinor,
      bestPriceMinor,
      referencePriceMinor,
      estimatedNotionalMinor,
      estimatedFeeMinor,
      feeRateBps,
      estimatedTotalMinor,
      availableBeforeMinor,
      remainingAvailableMinor,
      availableAssetQty,
      remainingAssetQty,
      spreadMinor: book.spreadMinor,
      spreadPct: book.spreadPct,
      estimatedSlippageBps,
      lowLiquidityWarning,
      partialFillWarning,
      marketStatus: asset.status,
      canExecute: blockingCode === null && targetQty >= asset.minQty && (params.type === 'LIMIT' || fillableQty > 0),
      blockingCode,
      blockingMessage,
      priceEstimateNote,
    };
  }

  private insertRestingOrder(order: Order): void {
    const book = order.side === 'BUY' ? this.bids.get(order.symbol)! : this.asks.get(order.symbol)!;
    book.push(order);
    if (order.side === 'BUY') {
      book.sort((a, b) => b.priceMinor - a.priceMinor || a.createdSeq - b.createdSeq);
    } else {
      book.sort((a, b) => a.priceMinor - b.priceMinor || a.createdSeq - b.createdSeq);
    }
  }

  private pruneFilledOrders(symbol: string, side: OrderSide): void {
    const map = side === 'BUY' ? this.bids : this.asks;
    const existing = map.get(symbol);
    if (!existing) return;
    map.set(
      symbol,
      existing.filter((o) => o.remainingQuantity > 1e-9 && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')),
    );
  }

  private updateAssetStatsFromTrade(asset: Asset, trade: Trade): void {
    asset.lastPriceMinor = trade.priceMinor;
    asset.high24hMinor = Math.max(asset.high24hMinor, trade.priceMinor);
    asset.low24hMinor = Math.min(asset.low24hMinor, trade.priceMinor);
    asset.volume24h = roundQty(asset.volume24h + trade.quantity);
    asset.turnover24hMinor += trade.grossAmountMinor;
    asset.priceChange24hMinor = asset.lastPriceMinor - asset.open24hMinor;
    asset.priceChange24hPct =
      asset.open24hMinor > 0 ? Number(((asset.priceChange24hMinor / asset.open24hMinor) * 100).toFixed(3)) : 0;
    if (!this.isForex(asset)) {
      asset.marketCapMinor = Math.round(asset.lastPriceMinor * asset.circulatingSupply);
    }
    const delta = trade.takerSide === 'BUY' ? 1.5 : -1.5;
    asset.sentimentScore = Math.max(-100, Math.min(100, Number((asset.sentimentScore + delta).toFixed(1))));
  }

  private recomputeLiquidityScore(asset: Asset): void {
    const bidDepth = (this.bids.get(asset.symbol) ?? []).reduce(
      (sum, o) => sum + this.calcQuoteGrossMinor(asset, o.priceMinor, o.remainingQuantity),
      0,
    );
    const askDepth = (this.asks.get(asset.symbol) ?? []).reduce(
      (sum, o) => sum + this.calcQuoteGrossMinor(asset, o.priceMinor, o.remainingQuantity),
      0,
    );
    const totalDepthMajor = (bidDepth + askDepth) / (asset.quoteCurrency === 'JPY-SIM' ? 100 : 100);
    const score = totalDepthMajor <= 0 ? 0 : Math.min(100, Math.round((Math.log10(totalDepthMajor + 1) / 6.0) * 100));
    asset.liquidityScore = score;
  }
}
