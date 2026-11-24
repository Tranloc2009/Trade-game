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
} from '../../../shared/contracts/money';
import type {
  Asset,
  Candle,
  MarketClass,
  Order,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderSide,
  OrderType,
  TimeInForce,
  Timeframe,
  Trade,
} from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import { LedgerService } from '../ledger/LedgerService';
import { CandleAggregator } from './CandleAggregator';

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
  idempotencyKey?: string;
}

export interface PlaceOrderResult {
  order: Order;
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

  constructor(ledger: LedgerService, candles: CandleAggregator, config: MatchingEngineConfig) {
    this.ledger = ledger;
    this.candles = candles;
    this.worldId = config.worldId;
    this.makerFeeBps = config.makerFeeBps ?? DEFAULT_MAKER_FEE_BPS;
    this.takerFeeBps = config.takerFeeBps ?? DEFAULT_TAKER_FEE_BPS;
    this.priceBandPct = config.priceBandPct ?? 0.25;
    this.enforcePriceBand = config.enforcePriceBand ?? true;
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
      if (order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED') count++;
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
      out.push(order);
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
    const nowIso = new Date().toISOString();
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
      if (resting.remainingQuantity <= 1e-9) {
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
        resting.status = 'FILLED';
        if (resting.side === 'BUY' && resting.lockedFundsMinor > 0) {
          if (isFx && asset.quoteCurrency) {
            this.ledger.unlockCurrency(resting.playerId, asset.quoteCurrency, resting.lockedFundsMinor);
          } else {
            this.ledger.unlockFunds(resting.playerId, resting.lockedFundsMinor);
          }
          resting.lockedFundsMinor = 0;
        }
      } else {
        resting.status = 'PARTIALLY_FILLED';
      }

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
      order.status = 'CANCELLED';
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

    this.bookSeq += 1;
    this.recomputeLiquidityScore(asset);

    return {
      order: { ...order },
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
    order.updatedAt = new Date().toISOString();

    this.bookSeq += 1;
    if (asset) this.recomputeLiquidityScore(asset);

    return {
      order: { ...order },
      orderBook: this.getOrderBook(order.symbol),
      refundedFundsMinor,
      refundedAssetQty,
    };
  }

  cancelAllPlayerOrdersForSymbol(playerId: string, symbol: string): void {
    const openOrders = this.listPlayerOrders(playerId, symbol).filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED',
    );
    for (const ord of openOrders) {
      this.cancelOrder(ord.id, playerId);
    }
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
