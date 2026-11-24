import crypto from 'node:crypto';
import {
  FUTURES_ALLOWED_LEVERAGES,
  FUTURES_LIQUIDATION_FEE_BPS,
  FUTURES_QTY_SCALE,
  FUTURES_RISK_TIERS,
  calcFuturesFeeMinor,
  calcFuturesNotionalMinor,
  calcFuturesPnlMinor,
  calcInitialMarginMinor,
  calcIsolatedLiquidationPrices,
  calcMaintenanceMarginMinor,
  calcPositionRiskMetrics,
  fromQtyInt,
  resolveRiskTier,
  toPriceInt,
  toQtyInt,
  type FuturesAccountSummary,
  type FuturesContract,
  type FuturesFundingPayment,
  type FuturesFundingSettlementEvent,
  type FuturesInsuranceFundState,
  type FuturesLiquidationEvent,
  type FuturesMarginMode,
  type FuturesOrder,
  type FuturesOrderBookLevel,
  type FuturesOrderBookSnapshot,
  type FuturesOrderSide,
  type FuturesOrderType,
  type FuturesPosition,
  type FuturesPositionSide,
  type FuturesPositionTransition,
  type FuturesPnlRecord,
  type FuturesTimeInForce,
  type FuturesTrade,
  type FuturesTriggerSource,
  type UnresolvedDeficitRecord,
} from '../../../shared/contracts/futures';
import { formatRate, toMinor } from '../../../shared/contracts/money';
import {
  calculateFuturesRiskScenarios,
  type FuturesPreviewResponse,
} from '../../../shared/contracts/beginner';
import { isFuturesOrderOpen } from '../../../shared/contracts/orderLifecycle';
import {
  ERROR_MESSAGES_VI,
  type Candle,
  type ErrorCode,
  type Timeframe,
  type Trade,
} from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import {
  INITIAL_FUTURES_INSURANCE_RESERVE_MINOR,
  LedgerService,
  SYSTEM_ACCOUNTS,
} from '../ledger/LedgerService';
import { CandleAggregator } from '../matching/CandleAggregator';
import { MatchingEngine } from '../matching/MatchingEngine';
import { CrossMarginExtensionStub } from './CrossMarginDesign';
import { MarkPriceEngine } from './MarkPriceEngine';
import { MarketRegimeEngine } from './MarketRegimeEngine';
import { buildSeedFuturesContracts } from './futuresSeed';

export interface PlaceFuturesOrderCommand {
  playerId: string;
  playerName: string;
  symbol: string;
  side: FuturesOrderSide;
  type: FuturesOrderType;
  timeInForce?: FuturesTimeInForce;
  marginMode?: FuturesMarginMode;
  leverage?: number;
  priceCR?: number;
  triggerPriceCR?: number;
  triggerSource?: FuturesTriggerSource;
  quantity: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  stopLossCR?: number;
  takeProfitCR?: number;
  maxSlippageBps?: number;
  expiresAt?: string | null;
  ttlSeconds?: number;
  idempotencyKey?: string;
  isLiquidationOrder?: boolean;
  skipRiskAckCheck?: boolean;
}

export interface PlaceFuturesOrderResult {
  order: FuturesOrder;
  trades: FuturesTrade[];
  position: FuturesPosition | null;
  orderBook: FuturesOrderBookSnapshot;
  updatedCandles: Record<Timeframe, Candle> | null;
  attachedConditionalOrders: FuturesOrder[];
  deduplicated: boolean;
}

export interface FuturesCancelOrderResult {
  order: FuturesOrder;
  orderBook: FuturesOrderBookSnapshot;
  refundedMarginMinor: number;
}

export interface LiquidationCycleResult {
  marginCalls: FuturesPosition[];
  liquidations: FuturesLiquidationEvent[];
  trades: FuturesTrade[];
  affectedPlayers: string[];
}

export type FuturesOrderLifecycleEventKind = 'created' | 'partially_filled' | 'filled' | 'cancelled' | 'expired';

export interface FuturesHooks {
  onOrder?: (order: FuturesOrder, eventKind: FuturesOrderLifecycleEventKind) => void;
  onTrade?: (trade: FuturesTrade) => void;
  onOrderBook?: (book: FuturesOrderBookSnapshot) => void;
  onQuote?: (contract: FuturesContract) => void;
  onCandle?: (symbol: string, candles: Record<Timeframe, Candle>) => void;
  onPosition?: (playerId: string, position: FuturesPosition | null, symbol: string) => void;
  onFunding?: (event: FuturesFundingSettlementEvent) => void;
  onLiquidation?: (event: FuturesLiquidationEvent) => void;
  onMarginCall?: (position: FuturesPosition) => void;
}

/**
 * Authoritative Empire Futures Exchange Engine (Perpetual Futures, CR-Margined, Isolated Margin).
 *
 * Completely independent from Spot/Crypto/Forex MatchingEngine while sharing LedgerService
 * for exact double-entry CR conservation (ZERO floating-point settlement, ZERO infinite CR).
 */
export class FuturesEngine {
  public readonly worldId: string;
  public readonly ledger: LedgerService;
  public readonly spotMatching: MatchingEngine;
  public readonly candles: CandleAggregator;
  public readonly markEngine: MarkPriceEngine;
  public readonly regimes: MarketRegimeEngine;
  public readonly crossMargin: CrossMarginExtensionStub;

  private hooks: FuturesHooks = {};

  private contracts = new Map<string, FuturesContract>();
  private bids = new Map<string, FuturesOrder[]>();
  private asks = new Map<string, FuturesOrder[]>();
  private conditionalOrders = new Map<string, FuturesOrder[]>();
  private ordersById = new Map<string, FuturesOrder>();
  private idempotencyIndex = new Map<string, string>();
  private positions = new Map<string, FuturesPosition>(); // Key: `${playerId}:${symbol}`
  private tradesBySymbol = new Map<string, FuturesTrade[]>();
  private allTrades: FuturesTrade[] = [];
  private pnlHistory: FuturesPnlRecord[] = [];
  private fundingHistory: FuturesFundingPayment[] = [];
  private fundingSettlements: FuturesFundingSettlementEvent[] = [];
  private liquidationHistory: FuturesLiquidationEvent[] = [];
  private unresolvedDeficits: UnresolvedDeficitRecord[] = [];
  private riskAcknowledgedAt = new Map<string, string>();

  // Per-player re-entrancy / concurrency guard
  private activeMutationPlayers = new Set<string>();

  // Insurance fund cumulative tracking (actual balance lives authoritatively in LedgerService)
  private insuranceInflowsMinor = 0;
  private insurancePayoutsMinor = 0;

  private orderSeq = 0;
  private bookSeq = 0;
  private tradeSeq = 0;

  public readonly priceBandPct = 0.25; // +/- 25% around mark/reference for limit sanity

  constructor(worldId: string, ledger: LedgerService, spotMatching: MatchingEngine) {
    this.worldId = worldId;
    this.ledger = ledger;
    this.spotMatching = spotMatching;
    this.candles = new CandleAggregator();
    this.markEngine = new MarkPriceEngine(spotMatching);
    this.regimes = new MarketRegimeEngine();
    this.crossMargin = new CrossMarginExtensionStub();
  }

  setHooks(hooks: FuturesHooks): void {
    this.hooks = hooks;
  }

  reset(): void {
    this.contracts.clear();
    this.bids.clear();
    this.asks.clear();
    this.conditionalOrders.clear();
    this.ordersById.clear();
    this.idempotencyIndex.clear();
    this.positions.clear();
    this.tradesBySymbol.clear();
    this.allTrades = [];
    this.pnlHistory = [];
    this.fundingHistory = [];
    this.fundingSettlements = [];
    this.liquidationHistory = [];
    this.unresolvedDeficits = [];
    this.riskAcknowledgedAt.clear();
    this.activeMutationPlayers.clear();
    this.insuranceInflowsMinor = 0;
    this.insurancePayoutsMinor = 0;
    this.orderSeq = 0;
    this.bookSeq = 0;
    this.tradeSeq = 0;
    this.candles.clear();
    this.markEngine.reset();
    this.regimes.reset();
  }

  bootstrapContracts(nowMs = Date.now()): FuturesContract[] {
    const seeded = buildSeedFuturesContracts((symbol) => this.spotMatching.getAsset(symbol), nowMs);
    for (const c of seeded) {
      this.contracts.set(c.symbol, c);
      this.bids.set(c.symbol, []);
      this.asks.set(c.symbol, []);
      this.conditionalOrders.set(c.symbol, []);
      this.tradesBySymbol.set(c.symbol, []);
      this.markEngine.seedContract(c, nowMs);
      this.regimes.registerSymbol(c.symbol, c.markPriceInt);
      const vol = c.underlyingMarketClass === 'CRYPTO' ? 0.016 : c.underlyingMarketClass === 'FOREX' ? 0.0025 : 0.009;
      this.candles.seedSymbol(c.symbol, c.lastPriceInt, vol, nowMs, c.priceScale, c.priceDecimals);
    }
    return seeded;
  }

  // ============================================================================
  // RISK DISCLOSURE & PLAYER PROTECTION
  // ============================================================================

  acknowledgeRisk(playerId: string): { acknowledged: true; acknowledgedAt: string } {
    const nowIso = new Date().toISOString();
    this.riskAcknowledgedAt.set(playerId, nowIso);
    return { acknowledged: true, acknowledgedAt: nowIso };
  }

  hasAcknowledgedRisk(playerId: string): boolean {
    return this.riskAcknowledgedAt.has(playerId);
  }

  // ============================================================================
  // READ QUERIES & SNAPSHOTS
  // ============================================================================

  getContract(symbol: string): FuturesContract | undefined {
    const c = this.contracts.get(symbol);
    return c ? { ...c } : undefined;
  }

  listContracts(): FuturesContract[] {
    return Array.from(this.contracts.values()).map((c) => ({ ...c }));
  }

  getInsuranceFundState(): FuturesInsuranceFundState {
    const balanceMinor = this.ledger.getSystemBalance(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND);
    const unresolvedDeficitTotalMinor = this.unresolvedDeficits.reduce((sum, d) => sum + d.deficitMinor, 0);
    return {
      balanceMinor,
      initialReserveMinor: INITIAL_FUTURES_INSURANCE_RESERVE_MINOR,
      totalInflowsMinor: this.insuranceInflowsMinor,
      totalPayoutsMinor: this.insurancePayoutsMinor,
      unresolvedDeficitTotalMinor,
      unresolvedDeficits: this.unresolvedDeficits.slice(-30).reverse(),
      adlSupported: false,
      adlNote:
        'Auto-Deleveraging (ADL) chưa được triển khai trong phiên bản này. Nếu tổn thất vượt quỹ bảo hiểm hữu hạn, hợp đồng sẽ chuyển sang EMERGENCY_HALTED và ghi nhận nghĩa vụ chưa xử lý.',
    };
  }

  getOrderBook(symbol: string, depth = 15): FuturesOrderBookSnapshot {
    const contract = this.contracts.get(symbol);
    if (!contract) throw new DomainError('ASSET_NOT_FOUND');

    const aggregate = (orders: FuturesOrder[], descending: boolean): FuturesOrderBookLevel[] => {
      const map = new Map<number, FuturesOrderBookLevel>();
      for (const o of orders) {
        if (o.remainingQtyInt <= 0) continue;
        const notional = calcFuturesNotionalMinor(
          o.priceInt,
          o.remainingQtyInt,
          contract.priceScale,
          contract.contractMultiplier,
        );
        const existing = map.get(o.priceInt);
        if (existing) {
          existing.qtyInt += o.remainingQtyInt;
          existing.quantity = fromQtyInt(existing.qtyInt);
          existing.notionalMinor += notional;
          existing.orderCount += 1;
        } else {
          map.set(o.priceInt, {
            priceInt: o.priceInt,
            qtyInt: o.remainingQtyInt,
            quantity: fromQtyInt(o.remainingQtyInt),
            notionalMinor: notional,
            orderCount: 1,
          });
        }
      }
      return Array.from(map.values())
        .sort((a, b) => (descending ? b.priceInt - a.priceInt : a.priceInt - b.priceInt))
        .slice(0, depth);
    };

    const bids = aggregate(this.bids.get(symbol) ?? [], true);
    const asks = aggregate(this.asks.get(symbol) ?? [], false);
    const bestBidInt = bids.length > 0 ? bids[0].priceInt : null;
    const bestAskInt = asks.length > 0 ? asks[0].priceInt : null;
    const spreadInt = bestBidInt !== null && bestAskInt !== null ? bestAskInt - bestBidInt : null;
    const spreadPct =
      spreadInt !== null && bestAskInt && bestAskInt > 0
        ? Number(((spreadInt / bestAskInt) * 100).toFixed(4))
        : null;

    return {
      symbol,
      bids,
      asks,
      bestBidInt,
      bestAskInt,
      spreadInt,
      spreadPct,
      lastPriceInt: contract.lastPriceInt,
      markPriceInt: contract.markPriceInt,
      indexPriceInt: contract.indexPriceInt,
      sequenceNumber: this.bookSeq,
      timestamp: new Date().toISOString(),
    };
  }

  listTrades(symbol?: string, limit = 50): FuturesTrade[] {
    if (symbol) {
      return (this.tradesBySymbol.get(symbol) ?? []).slice(-limit).reverse();
    }
    return this.allTrades.slice(-limit).reverse();
  }

  listRecentLiquidations(limit = 30): FuturesLiquidationEvent[] {
    return this.liquidationHistory.slice(-limit).reverse();
  }

  listFundingSettlements(symbol?: string, limit = 40): FuturesFundingSettlementEvent[] {
    const list = symbol
      ? this.fundingSettlements.filter((s) => s.symbol === symbol)
      : this.fundingSettlements;
    return list.slice(-limit).reverse();
  }

  getPosition(playerId: string, symbol: string): FuturesPosition | null {
    const pos = this.positions.get(`${playerId}:${symbol}`);
    if (!pos || pos.qtyInt <= 0 || pos.status === 'CLOSED') return null;
    return { ...pos };
  }

  listPlayerPositions(playerId: string): FuturesPosition[] {
    const out: FuturesPosition[] = [];
    for (const pos of this.positions.values()) {
      if (pos.playerId === playerId && pos.qtyInt > 0 && pos.status !== 'CLOSED') {
        out.push({ ...pos });
      }
    }
    return out;
  }

  listAllOpenPositions(symbol?: string): FuturesPosition[] {
    const out: FuturesPosition[] = [];
    for (const pos of this.positions.values()) {
      if (pos.qtyInt <= 0 || pos.status === 'CLOSED') continue;
      if (symbol && pos.symbol !== symbol) continue;
      out.push({ ...pos });
    }
    return out;
  }

  listPlayerOrders(playerId: string, symbol?: string): FuturesOrder[] {
    const out: FuturesOrder[] = [];
    for (const o of this.ordersById.values()) {
      if (o.playerId !== playerId) continue;
      if (symbol && o.symbol !== symbol) continue;
      out.push({ ...o });
    }
    return out.sort((a, b) => b.createdSeq - a.createdSeq);
  }

  listPlayerOpenOrders(playerId: string, symbol?: string): FuturesOrder[] {
    const out: FuturesOrder[] = [];
    for (const o of this.ordersById.values()) {
      if (o.playerId !== playerId) continue;
      if (symbol && o.symbol !== symbol) continue;
      if (!isFuturesOrderOpen(o)) continue;
      out.push({ ...o });
    }
    return out.sort((a, b) => b.createdSeq - a.createdSeq);
  }

  getOpenOrdersCount(): number {
    let count = 0;
    for (const o of this.ordersById.values()) {
      if (isFuturesOrderOpen(o)) count++;
    }
    return count;
  }

  getPlayerFuturesValuation(playerId: string): {
    isolatedMarginMinor: number;
    openOrderMarginMinor: number;
    unrealizedPnlMinor: number;
    equityMinor: number;
  } {
    let isolatedMarginMinor = 0;
    let unrealizedPnlMinor = 0;
    let positionEquityMinor = 0;

    for (const pos of this.positions.values()) {
      if (pos.playerId !== playerId || pos.qtyInt <= 0 || pos.status === 'CLOSED') continue;
      isolatedMarginMinor += pos.marginMinor;
      unrealizedPnlMinor += pos.unrealizedPnlMinor;
      // Isolated margin caps loss per position at its own isolated collateral (never negative equity)
      positionEquityMinor += Math.max(0, pos.marginMinor + pos.unrealizedPnlMinor);
    }

    let openOrderMarginMinor = 0;
    for (const ord of this.ordersById.values()) {
      if (ord.playerId !== playerId) continue;
      if (isFuturesOrderOpen(ord)) {
        openOrderMarginMinor += ord.lockedMarginMinor + ord.lockedFeeReserveMinor;
      }
    }

    return {
      isolatedMarginMinor,
      openOrderMarginMinor,
      unrealizedPnlMinor,
      equityMinor: positionEquityMinor + openOrderMarginMinor,
    };
  }

  getPlayerAccountSummary(playerId: string): FuturesAccountSummary {
    const wallet = this.ledger.requireWallet(playerId);
    const val = this.getPlayerFuturesValuation(playerId);
    const allOrders = this.listPlayerOrders(playerId);
    const openOrders = allOrders.filter((o) => isFuturesOrderOpen(o));
    const playerTrades = this.allTrades
      .filter((t) => t.buyerId === playerId || t.sellerId === playerId)
      .slice(-80)
      .reverse();
    const playerPnl = this.pnlHistory
      .filter((p) => p.playerId === playerId)
      .slice(-80)
      .reverse();
    const playerFunding = this.fundingHistory
      .filter((f) => f.playerId === playerId)
      .slice(-80)
      .reverse();

    return {
      riskAcknowledged: this.riskAcknowledgedAt.has(playerId),
      riskAcknowledgedAt: this.riskAcknowledgedAt.get(playerId) ?? null,
      crossMarginEnabled: false,
      crossMarginNote: this.crossMargin.statusReason,
      availableCRMinor: wallet.availableMinor,
      isolatedPositionMarginMinor: val.isolatedMarginMinor,
      openOrderMarginMinor: val.openOrderMarginMinor,
      totalUnrealizedPnlMinor: val.unrealizedPnlMinor,
      totalFuturesEquityMinor: val.equityMinor,
      positions: this.listPlayerPositions(playerId),
      openOrders,
      orderHistory: allOrders.slice(0, 80),
      tradeHistory: playerTrades,
      pnlHistory: playerPnl,
      fundingHistory: playerFunding,
    };
  }

  getTotalOrdersCount(): number {
    return this.ordersById.size;
  }

  getTotalTradesCount(): number {
    return this.allTrades.length;
  }

  // ============================================================================
  // ORDER PLACEMENT & MATCHING (PRICE-TIME PRIORITY)
  // ============================================================================

  placeOrder(cmd: PlaceFuturesOrderCommand): PlaceFuturesOrderResult {
    // Concurrency / re-entrancy guard per player (prevents concurrent margin double-spend)
    if (this.activeMutationPlayers.has(cmd.playerId)) {
      throw new DomainError('RATE_LIMITED', 'Tài khoản đang xử lý một lệnh Futures đồng thời. Vui lòng thử lại.');
    }
    this.activeMutationPlayers.add(cmd.playerId);

    try {
      return this.placeOrderInternal(cmd);
    } finally {
      this.activeMutationPlayers.delete(cmd.playerId);
    }
  }

  private placeOrderInternal(cmd: PlaceFuturesOrderCommand): PlaceFuturesOrderResult {
    // 1. Idempotency deduplication
    if (cmd.idempotencyKey) {
      const idemKey = `${cmd.playerId}:${cmd.idempotencyKey}`;
      const existingId = this.idempotencyIndex.get(idemKey);
      if (existingId) {
        const existing = this.ordersById.get(existingId);
        if (existing) {
          return {
            order: { ...existing },
            trades: [],
            position: this.getPosition(cmd.playerId, existing.symbol),
            orderBook: this.getOrderBook(existing.symbol),
            updatedCandles: null,
            attachedConditionalOrders: [],
            deduplicated: true,
          };
        }
      }
    }

    // 2. Validate risk acknowledgment for human players (unless explicitly bypassed for bots/liquidations)
    if (!cmd.skipRiskAckCheck && !cmd.isLiquidationOrder && !this.riskAcknowledgedAt.has(cmd.playerId)) {
      throw new DomainError('FUTURES_RISK_NOT_ACKNOWLEDGED');
    }

    // 3. Validate Margin Mode (Cross Margin explicitly blocked in Phase 1)
    const marginMode: FuturesMarginMode = cmd.marginMode ?? 'ISOLATED';
    this.crossMargin.assertMarginModeAllowed(marginMode);

    // 4. Validate Contract & Market Health
    const contract = this.contracts.get(cmd.symbol);
    if (!contract) throw new DomainError('ASSET_NOT_FOUND');

    if (contract.status === 'EMERGENCY_HALTED') {
      throw new DomainError('FUTURES_EMERGENCY_HALTED');
    }
    if (contract.status === 'DEGRADED' && !cmd.reduceOnly && !cmd.isLiquidationOrder) {
      throw new DomainError(
        'FUTURES_MARKET_DEGRADED',
        contract.degradedReason ?? 'Thị trường đang ở trạng thái Degraded, tạm khóa mở vị thế mới.',
      );
    }

    // 5. Validate Leverage against allowed levels (1x, 2x, 3x, 5x, 10x)
    const leverage = cmd.leverage ?? 1;
    if (!(FUTURES_ALLOWED_LEVERAGES as readonly number[]).includes(leverage)) {
      throw new DomainError(
        'FUTURES_LEVERAGE_EXCEEDED',
        `Đòn bẩy hợp lệ hiện tại là ${FUTURES_ALLOWED_LEVERAGES.join('x, ')}x. Tầng 20x đang khóa cho đến khi hoàn tất stress tests.`,
      );
    }

    // 6. Validate Quantity & Step in exact integer units
    const qtyInt = toQtyInt(cmd.quantity);
    if (qtyInt < contract.minQtyInt || qtyInt > contract.maxOrderQtyInt) {
      throw new DomainError(
        'INVALID_ORDER',
        `Khối lượng hợp đồng phải từ ${contract.minQty} đến ${contract.maxOrderQty}.`,
      );
    }
    if (qtyInt % contract.qtyStepInt !== 0) {
      throw new DomainError('INVALID_ORDER', `Khối lượng phải là bội số của bước ${contract.qtyStep}.`);
    }

    const isConditional =
      cmd.type === 'STOP_MARKET' ||
      cmd.type === 'STOP_LIMIT' ||
      cmd.type === 'TAKE_PROFIT_MARKET' ||
      cmd.type === 'TAKE_PROFIT_LIMIT';
    const isMarketLike = cmd.type === 'MARKET' || cmd.type === 'STOP_MARKET' || cmd.type === 'TAKE_PROFIT_MARKET';
    const reduceOnly = Boolean(cmd.reduceOnly || cmd.isLiquidationOrder);
    const postOnly = Boolean(cmd.postOnly);

    if (postOnly && (isMarketLike || isConditional || cmd.timeInForce === 'IOC')) {
      throw new DomainError('INVALID_ORDER', 'Post-Only chỉ áp dụng cho lệnh Limit GTC.');
    }

    // 7. Validate Limit Price & Trigger Price in exact integer units
    let priceInt = 0;
    if (!isMarketLike) {
      if (cmd.priceCR === undefined || !Number.isFinite(cmd.priceCR) || cmd.priceCR <= 0) {
        throw new DomainError('INVALID_PRICE');
      }
      priceInt = toPriceInt(cmd.priceCR, contract.priceScale);
      if (priceInt <= 0 || priceInt % contract.priceTickInt !== 0) {
        const tickStr = formatRate(contract.priceTickInt, contract.priceScale, contract.priceDecimals);
        throw new DomainError('INVALID_PRICE', `Giá phải là bội số của bước giá ${tickStr} CR.`);
      }
      if (!cmd.isLiquidationOrder) {
        const ref = contract.markPriceInt > 0 ? contract.markPriceInt : contract.referencePriceInt;
        const minAllowed = Math.max(contract.priceTickInt, Math.floor(ref * (1 - this.priceBandPct)));
        const maxAllowed = Math.ceil(ref * (1 + this.priceBandPct));
        if (priceInt < minAllowed || priceInt > maxAllowed) {
          throw new DomainError(
            'PRICE_BAND_EXCEEDED',
            `Giá nằm ngoài biên độ ±25% quanh Mark Price (${formatRate(minAllowed, contract.priceScale, contract.priceDecimals)} – ${formatRate(maxAllowed, contract.priceScale, contract.priceDecimals)} CR).`,
          );
        }
      }
    }

    let triggerPriceInt: number | null = null;
    let triggerDirection: 'ABOVE' | 'BELOW' | null = null;
    let triggerSource: FuturesTriggerSource | null = null;

    if (isConditional) {
      if (cmd.triggerPriceCR === undefined || !Number.isFinite(cmd.triggerPriceCR) || cmd.triggerPriceCR <= 0) {
        throw new DomainError('INVALID_PRICE', 'Lệnh điều kiện bắt buộc phải có giá kích hoạt.');
      }
      triggerPriceInt = toPriceInt(cmd.triggerPriceCR, contract.priceScale);
      if (triggerPriceInt <= 0 || triggerPriceInt % contract.priceTickInt !== 0) {
        throw new DomainError('INVALID_PRICE', 'Giá kích hoạt không khớp bước giá hợp đồng.');
      }
      triggerSource = cmd.triggerSource ?? 'MARK_PRICE';
      // Standard perpetual trigger direction rules
      if (cmd.type === 'STOP_MARKET' || cmd.type === 'STOP_LIMIT') {
        triggerDirection = cmd.side === 'BUY' ? 'ABOVE' : 'BELOW';
      } else {
        triggerDirection = cmd.side === 'BUY' ? 'BELOW' : 'ABOVE';
      }
    }

    const attachedStopLossInt =
      cmd.stopLossCR !== undefined && cmd.stopLossCR > 0
        ? Math.round(toPriceInt(cmd.stopLossCR, contract.priceScale) / contract.priceTickInt) * contract.priceTickInt
        : null;
    const attachedTakeProfitInt =
      cmd.takeProfitCR !== undefined && cmd.takeProfitCR > 0
        ? Math.round(toPriceInt(cmd.takeProfitCR, contract.priceScale) / contract.priceTickInt) * contract.priceTickInt
        : null;

    // 8. Validate Reduce-Only against existing opposite open position
    const existingPos = this.positions.get(`${cmd.playerId}:${contract.symbol}`);
    const hasOpenPos = Boolean(existingPos && existingPos.qtyInt > 0 && existingPos.status !== 'CLOSED');
    const isOppositeToPos =
      hasOpenPos &&
      ((existingPos!.side === 'LONG' && cmd.side === 'SELL') ||
        (existingPos!.side === 'SHORT' && cmd.side === 'BUY'));

    if (reduceOnly) {
      if (!isOppositeToPos || !existingPos) {
        throw new DomainError(
          'FUTURES_REDUCE_ONLY_VIOLATION',
          'Không có vị thế đối ứng đang mở để thực hiện lệnh Reduce-Only.',
        );
      }
      if (qtyInt > existingPos.qtyInt) {
        throw new DomainError(
          'FUTURES_REDUCE_ONLY_VIOLATION',
          `Khối lượng Reduce-Only (${fromQtyInt(qtyInt)}) vượt quá quy mô vị thế hiện tại (${existingPos.quantity}).`,
        );
      }
    }

    // 9. Validate Risk Tier max leverage for projected position notional
    const estPriceInt =
      !isMarketLike
        ? priceInt
        : triggerPriceInt ?? contract.markPriceInt;
    const currentSameSideQtyInt = hasOpenPos && !isOppositeToPos ? existingPos!.qtyInt : 0;
    const projectedQtyInt = reduceOnly
      ? Math.max(0, (existingPos?.qtyInt ?? 0) - qtyInt)
      : isOppositeToPos
        ? Math.abs((existingPos?.qtyInt ?? 0) - qtyInt)
        : currentSameSideQtyInt + qtyInt;

    if (!reduceOnly && projectedQtyInt > 0) {
      const projectedNotional = calcFuturesNotionalMinor(
        estPriceInt,
        projectedQtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );
      const tier = resolveRiskTier(projectedNotional);
      if (leverage > tier.maxLeverage) {
        throw new DomainError(
          'FUTURES_LEVERAGE_EXCEEDED',
          `Quy mô vị thế thuộc Risk Tier ${tier.tier} chỉ cho phép đòn bẩy tối đa ${tier.maxLeverage}x.`,
        );
      }
    }

    // 10. Pre-check counterparty liquidity, Self-Trade Prevention, and Post-Only for immediate orders
    const oppositeBook = cmd.side === 'BUY' ? this.asks.get(contract.symbol)! : this.bids.get(contract.symbol)!;

    if (!isConditional) {
      if (cmd.type === 'MARKET') {
        const matchable = oppositeBook.filter((o) => o.remainingQtyInt > 0 && o.playerId !== cmd.playerId);
        if (matchable.length === 0) {
          const ownOpposite = oppositeBook.some((o) => o.remainingQtyInt > 0 && o.playerId === cmd.playerId);
          if (ownOpposite) throw new DomainError('SELF_TRADE_FORBIDDEN');
          throw new DomainError('INSUFFICIENT_LIQUIDITY');
        }
      } else {
        // LIMIT checks
        const bestOpp = oppositeBook.find((o) => o.remainingQtyInt > 0);
        if (postOnly && bestOpp) {
          const wouldCross =
            cmd.side === 'BUY' ? priceInt >= bestOpp.priceInt : priceInt <= bestOpp.priceInt;
          if (wouldCross) {
            throw new DomainError('FUTURES_POST_ONLY_REJECTED');
          }
        }
        const crossingOwn = oppositeBook.some((o) => {
          if (o.remainingQtyInt <= 0 || o.playerId !== cmd.playerId) return false;
          return cmd.side === 'BUY' ? o.priceInt <= priceInt : o.priceInt >= priceInt;
        });
        if (crossingOwn) {
          throw new DomainError('SELF_TRADE_FORBIDDEN');
        }
      }
    }

    // 11. Compute required upfront Isolated Margin & Fee Reserve (preventing double-spending across open orders!)
    let lockedMarginMinor = 0;
    let lockedFeeReserveMinor = 0;

    if (!reduceOnly) {
      const oppCapacityQtyInt = isOppositeToPos && existingPos ? existingPos.qtyInt : 0;
      const alreadyClosingQtyInt = this.getPendingClosingQtyInt(cmd.playerId, contract.symbol, cmd.side);
      const freeCloseCapacity = Math.max(0, oppCapacityQtyInt - alreadyClosingQtyInt);
      const netOpeningQtyInt = Math.max(0, qtyInt - freeCloseCapacity);

      // Estimate worst execution price for Market orders
      let pricingRefInt = estPriceInt;
      if (cmd.type === 'MARKET') {
        const bestOpp = oppositeBook.find((o) => o.remainingQtyInt > 0 && o.playerId !== cmd.playerId);
        if (bestOpp) {
          const slipBps = cmd.maxSlippageBps ?? 500;
          pricingRefInt =
            cmd.side === 'BUY'
              ? Math.ceil((bestOpp.priceInt * (10_000 + slipBps)) / 10_000)
              : bestOpp.priceInt;
        }
      }

      const openNotional = calcFuturesNotionalMinor(
        pricingRefInt,
        netOpeningQtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );
      const totalNotional = calcFuturesNotionalMinor(
        pricingRefInt,
        qtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );

      lockedMarginMinor = netOpeningQtyInt > 0 ? calcInitialMarginMinor(openNotional, leverage) : 0;
      lockedFeeReserveMinor = calcFuturesFeeMinor(totalNotional, contract.takerFeeBps, true);

      const totalLockMinor = lockedMarginMinor + lockedFeeReserveMinor;
      if (totalLockMinor > 0) {
        const wallet = this.ledger.requireWallet(cmd.playerId);
        if (wallet.availableMinor < totalLockMinor) {
          throw new DomainError(
            'INSUFFICIENT_FUNDS',
            `Số dư CR khả dụng (${(wallet.availableMinor / 100).toFixed(2)} CR) không đủ ký quỹ và phí dự phòng (${(totalLockMinor / 100).toFixed(2)} CR).`,
          );
        }
        this.ledger.transferAvailable({
          fromAccount: cmd.playerId,
          toAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          amountMinor: totalLockMinor,
          category: 'FUTURES_MARGIN_LOCK',
          referenceId: `FUT-LOCK-${contract.symbol}`,
          description: `Phong tỏa ký quỹ Isolated (${leverage}x) cho lệnh ${cmd.side} ${cmd.quantity} ${contract.symbol}`,
        });
      }
    }

    // 12. Create Authoritative FuturesOrder
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const resolvedExpiresAt =
      cmd.expiresAt ??
      (typeof cmd.ttlSeconds === 'number' && cmd.ttlSeconds > 0
        ? new Date(nowMs + cmd.ttlSeconds * 1000).toISOString()
        : null);
    this.orderSeq += 1;
    const timeInForce: FuturesTimeInForce = isMarketLike ? 'IOC' : (cmd.timeInForce ?? 'GTC');

    const order: FuturesOrder = {
      id: `ford_${this.orderSeq}_${crypto.randomBytes(4).toString('hex')}`,
      worldId: this.worldId,
      playerId: cmd.playerId,
      playerName: cmd.playerName,
      symbol: contract.symbol,
      side: cmd.side,
      type: cmd.type,
      timeInForce,
      marginMode,
      leverage,
      priceInt,
      triggerPriceInt,
      triggerSource,
      triggerDirection,
      quantity: fromQtyInt(qtyInt),
      qtyInt,
      filledQuantity: 0,
      filledQtyInt: 0,
      remainingQuantity: fromQtyInt(qtyInt),
      remainingQtyInt: qtyInt,
      avgExecutionPriceInt: 0,
      reduceOnly,
      postOnly,
      isLiquidationOrder: Boolean(cmd.isLiquidationOrder),
      lockedMarginMinor,
      lockedFeeReserveMinor,
      feesPaidMinor: 0,
      realizedPnlMinor: 0,
      attachedStopLossInt,
      attachedTakeProfitInt,
      parentOrderId: null,
      status: isConditional ? 'PENDING_TRIGGER' : 'OPEN',
      rejectReason: null,
      idempotencyKey: cmd.idempotencyKey,
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

    // 13. If Conditional Order, store in conditional trigger book and return immediately
    if (isConditional) {
      this.conditionalOrders.get(contract.symbol)!.push(order);
      const condSnap = { ...order };
      this.hooks.onOrder?.(condSnap, 'created');
      return {
        order: condSnap,
        trades: [],
        position: this.getPosition(cmd.playerId, contract.symbol),
        orderBook: this.getOrderBook(contract.symbol),
        updatedCandles: null,
        attachedConditionalOrders: [],
        deduplicated: false,
      };
    }

    // 14. Execute Immediate Price-Time Priority Matching
    return this.executeActiveOrder(order, contract, cmd.maxSlippageBps ?? 500);
  }

  private executeActiveOrder(
    order: FuturesOrder,
    contract: FuturesContract,
    maxSlippageBps: number,
  ): PlaceFuturesOrderResult {
    const oppositeBook = order.side === 'BUY' ? this.asks.get(contract.symbol)! : this.bids.get(contract.symbol)!;
    const isMarket = order.type === 'MARKET' || order.type === 'STOP_MARKET' || order.type === 'TAKE_PROFIT_MARKET';

    const bestOpp = oppositeBook.find((o) => o.remainingQtyInt > 0 && o.playerId !== order.playerId);
    const slippageLimitInt =
      isMarket && bestOpp && !order.isLiquidationOrder
        ? order.side === 'BUY'
          ? Math.ceil((bestOpp.priceInt * (10_000 + maxSlippageBps)) / 10_000)
          : Math.floor((bestOpp.priceInt * (10_000 - maxSlippageBps)) / 10_000)
        : null;

    const trades: FuturesTrade[] = [];
    const affectedRestingMap = new Map<string, FuturesOrder>();
    let updatedCandles: Record<Timeframe, Candle> | null = null;
    let weightedPriceSum = 0n;

    let idx = 0;
    while (order.remainingQtyInt > 0 && idx < oppositeBook.length) {
      const resting = oppositeBook[idx];
      if (!isFuturesOrderOpen(resting) || resting.playerId === order.playerId) {
        idx++;
        continue;
      }

      if (!isMarket) {
        const compatible =
          order.side === 'BUY' ? resting.priceInt <= order.priceInt : resting.priceInt >= order.priceInt;
        if (!compatible) break;
      } else if (slippageLimitInt !== null) {
        const withinSlip =
          order.side === 'BUY' ? resting.priceInt <= slippageLimitInt : resting.priceInt >= slippageLimitInt;
        if (!withinSlip) break;
      }

      // Reduce-only runtime clamp (in case position shrunk before fill)
      if (order.reduceOnly) {
        const curPos = this.positions.get(`${order.playerId}:${contract.symbol}`);
        const validOpp =
          curPos &&
          curPos.qtyInt > 0 &&
          ((curPos.side === 'LONG' && order.side === 'SELL') || (curPos.side === 'SHORT' && order.side === 'BUY'));
        if (!validOpp) break;
        if (order.remainingQtyInt > curPos!.qtyInt) {
          order.remainingQtyInt = curPos!.qtyInt;
          order.remainingQuantity = fromQtyInt(order.remainingQtyInt);
        }
      }

      const execQtyInt = Math.min(order.remainingQtyInt, resting.remainingQtyInt);
      if (execQtyInt <= 0) break;

      const execPriceInt = resting.priceInt; // Resting maker sets execution price
      const notionalMinor = calcFuturesNotionalMinor(
        execPriceInt,
        execQtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );

      const buyerOrder = order.side === 'BUY' ? order : resting;
      const sellerOrder = order.side === 'SELL' ? order : resting;
      const buyerFeeMinor = buyerOrder.isLiquidationOrder
        ? 0
        : calcFuturesFeeMinor(notionalMinor, order.side === 'BUY' ? contract.takerFeeBps : contract.makerFeeBps, true);
      const sellerFeeMinor = sellerOrder.isLiquidationOrder
        ? 0
        : calcFuturesFeeMinor(notionalMinor, order.side === 'SELL' ? contract.takerFeeBps : contract.makerFeeBps, true);

      const nowIso = new Date().toISOString();
      this.tradeSeq += 1;
      const tradeId = `ftrd_${this.tradeSeq}_${crypto.randomBytes(4).toString('hex')}`;

      // Apply exact position & margin accounting for both buyer and seller
      const buyerResult = this.applyFillToPosition({
        contract,
        order: buyerOrder,
        fillSide: 'BUY',
        execPriceInt,
        execQtyInt,
        notionalMinor,
        feeMinor: buyerFeeMinor,
        tradeId,
        timestamp: nowIso,
      });

      const sellerResult = this.applyFillToPosition({
        contract,
        order: sellerOrder,
        fillSide: 'SELL',
        execPriceInt,
        execQtyInt,
        notionalMinor,
        feeMinor: sellerFeeMinor,
        tradeId,
        timestamp: nowIso,
      });

      // Update Order fill tracking
      const updateOrderFill = (o: FuturesOrder, fee: number, realizedPnl: number) => {
        const prevFilled = o.filledQtyInt;
        o.filledQtyInt += execQtyInt;
        o.filledQuantity = fromQtyInt(o.filledQtyInt);
        o.remainingQtyInt = Math.max(0, o.remainingQtyInt - execQtyInt);
        o.remainingQuantity = fromQtyInt(o.remainingQtyInt);
        o.feesPaidMinor += fee;
        o.realizedPnlMinor += realizedPnl;
        o.updatedAt = nowIso;
        if (o.id !== order.id) {
          o.avgExecutionPriceInt =
            o.filledQtyInt > 0
              ? Number(
                  (BigInt(prevFilled) * BigInt(o.avgExecutionPriceInt) + BigInt(execQtyInt) * BigInt(execPriceInt)) /
                    BigInt(o.filledQtyInt),
                )
              : execPriceInt;
        }
      };

      updateOrderFill(buyerOrder, buyerResult.actualFeeMinor, buyerResult.realizedPnlMinor);
      updateOrderFill(sellerOrder, sellerResult.actualFeeMinor, sellerResult.realizedPnlMinor);

      weightedPriceSum += BigInt(execPriceInt) * BigInt(execQtyInt);
      order.avgExecutionPriceInt =
        order.filledQtyInt > 0 ? Number(weightedPriceSum / BigInt(order.filledQtyInt)) : execPriceInt;

      // Finalize resting order if filled
      if (resting.remainingQtyInt <= 0) {
        resting.remainingQtyInt = 0;
        resting.remainingQuantity = 0;
        resting.status = 'FILLED';
        this.refundUnusedOrderLock(resting, `Hoàn phần ký quỹ/phí dư sau khi khớp lệnh ${resting.id}`);
      } else {
        resting.status = 'PARTIALLY_FILLED';
      }
      resting.version = (resting.version ?? 0) + 1;
      affectedRestingMap.set(resting.id, { ...resting });

      const trade: FuturesTrade = {
        id: tradeId,
        worldId: this.worldId,
        symbol: contract.symbol,
        buyOrderId: buyerOrder.id,
        sellOrderId: sellerOrder.id,
        buyerId: buyerOrder.playerId,
        buyerName: buyerOrder.playerName,
        sellerId: sellerOrder.playerId,
        sellerName: sellerOrder.playerName,
        priceInt: execPriceInt,
        quantity: fromQtyInt(execQtyInt),
        qtyInt: execQtyInt,
        notionalMinor,
        buyerFeeMinor: buyerResult.actualFeeMinor,
        sellerFeeMinor: sellerResult.actualFeeMinor,
        takerSide: order.side,
        isLiquidation: Boolean(order.isLiquidationOrder || resting.isLiquidationOrder),
        buyerTransition: buyerResult.transition,
        sellerTransition: sellerResult.transition,
        timestamp: nowIso,
      };

      trades.push(trade);
      this.allTrades.push(trade);
      this.tradesBySymbol.get(contract.symbol)!.push(trade);
      if (this.tradesBySymbol.get(contract.symbol)!.length > 500) {
        this.tradesBySymbol.get(contract.symbol)!.shift();
      }
      if (this.allTrades.length > 5000) {
        this.allTrades.shift();
      }

      // Update Last Traded Price & Volume (NOTE: Mark Price stays anchored via MarkPriceEngine!)
      contract.lastPriceInt = execPriceInt;
      contract.high24hInt = Math.max(contract.high24hInt, execPriceInt);
      contract.low24hInt = Math.min(contract.low24hInt, execPriceInt);
      contract.volume24hQty = fromQtyInt(toQtyInt(contract.volume24hQty) + execQtyInt);
      contract.turnover24hMinor += notionalMinor;
      contract.priceChange24hInt = contract.lastPriceInt - contract.open24hInt;
      contract.priceChange24hPct =
        contract.open24hInt > 0 ? Number(((contract.priceChange24hInt / contract.open24hInt) * 100).toFixed(3)) : 0;

      // Record Futures Candle from real matched trade
      const adapterTrade: Trade = {
        id: trade.id,
        worldId: trade.worldId,
        symbol: trade.symbol,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        buyerId: trade.buyerId,
        buyerName: trade.buyerName,
        sellerId: trade.sellerId,
        sellerName: trade.sellerName,
        priceMinor: trade.priceInt,
        quantity: trade.quantity,
        grossAmountMinor: trade.notionalMinor,
        buyerFeeMinor: trade.buyerFeeMinor,
        sellerFeeMinor: trade.sellerFeeMinor,
        takerSide: trade.takerSide,
        timestamp: trade.timestamp,
      };
      updatedCandles = this.candles.recordTrade(adapterTrade);

      this.hooks.onTrade?.(trade);
      this.hooks.onPosition?.(buyerOrder.playerId, this.getPosition(buyerOrder.playerId, contract.symbol), contract.symbol);
      this.hooks.onPosition?.(sellerOrder.playerId, this.getPosition(sellerOrder.playerId, contract.symbol), contract.symbol);

      idx++;
    }

    this.pruneFilledOrders(contract.symbol, order.side === 'BUY' ? 'SELL' : 'BUY');

    // Finalize incoming order status & refund unused locked CR
    if (order.remainingQtyInt <= 0) {
      order.remainingQtyInt = 0;
      order.remainingQuantity = 0;
      order.status = 'FILLED';
      this.refundUnusedOrderLock(order, `Hoàn ký quỹ/phí dư sau khi khớp toàn bộ ${order.id}`);
    } else if (isMarket || order.timeInForce === 'IOC') {
      order.remainingQtyInt = 0;
      order.remainingQuantity = 0;
      order.status = 'CANCELLED';
      this.refundUnusedOrderLock(order, `Hoàn ký quỹ/phí phần chưa khớp của lệnh ${order.type} ${order.id}`);
    } else if (order.expiresAt && Date.parse(order.expiresAt) <= Date.now()) {
      order.remainingQtyInt = 0;
      order.remainingQuantity = 0;
      order.status = 'EXPIRED';
      this.refundUnusedOrderLock(order, `Hoàn ký quỹ/phí lệnh hết hạn ${order.id}`);
    } else {
      order.status = order.filledQtyInt > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
      this.insertRestingOrder(order);
    }

    order.version = (order.version ?? 0) + 1;
    order.updatedAt = new Date().toISOString();

    // Recompute exact Open Interest for symbol
    this.recomputeOpenInterest(contract);
    this.bookSeq += 1;

    // Emit authoritative order lifecycle notifications for affected resting orders & incoming order
    for (const affected of affectedRestingMap.values()) {
      this.hooks.onOrder?.(
        affected,
        affected.status === 'FILLED' ? 'filled' : 'partially_filled',
      );
    }
    const finalOrderSnap = { ...order };
    const incomingKind: FuturesOrderLifecycleEventKind =
      finalOrderSnap.status === 'FILLED'
        ? 'filled'
        : finalOrderSnap.status === 'PARTIALLY_FILLED'
          ? 'partially_filled'
          : finalOrderSnap.status === 'CANCELLED'
            ? 'cancelled'
            : finalOrderSnap.status === 'EXPIRED'
              ? 'expired'
              : 'created';
    this.hooks.onOrder?.(finalOrderSnap, incomingKind);

    // Spawn attached Reduce-Only SL/TP conditional orders if opening order filled
    const attachedConditionalOrders: FuturesOrder[] = [];
    const currentPos = this.getPosition(order.playerId, contract.symbol);
    if (
      order.filledQtyInt > 0 &&
      currentPos &&
      !order.reduceOnly &&
      !order.isLiquidationOrder
    ) {
      const closeSide: FuturesOrderSide = currentPos.side === 'LONG' ? 'SELL' : 'BUY';
      if (order.attachedStopLossInt) {
        const slOrder = this.createLinkedConditionalOrder({
          parentOrder: order,
          contract,
          side: closeSide,
          type: 'STOP_MARKET',
          triggerPriceInt: order.attachedStopLossInt,
          qtyInt: currentPos.qtyInt,
        });
        attachedConditionalOrders.push(slOrder);
      }
      if (order.attachedTakeProfitInt) {
        const tpOrder = this.createLinkedConditionalOrder({
          parentOrder: order,
          contract,
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          triggerPriceInt: order.attachedTakeProfitInt,
          qtyInt: currentPos.qtyInt,
        });
        attachedConditionalOrders.push(tpOrder);
      }
    }

    // Re-evaluate Mark Price (clamped basis around Spot Index) & update all positions on symbol
    this.refreshContractMarkPrice(contract.symbol);

    const book = this.getOrderBook(contract.symbol);
    this.hooks.onOrderBook?.(book);
    this.hooks.onQuote?.({ ...contract });
    if (updatedCandles) {
      this.hooks.onCandle?.(contract.symbol, updatedCandles);
    }

    return {
      order: finalOrderSnap,
      trades,
      position: this.getPosition(order.playerId, contract.symbol),
      orderBook: book,
      updatedCandles,
      attachedConditionalOrders,
      deduplicated: false,
    };
  }

  /**
   * Core Isolated Margin Position State Transition Machine:
   * Handles OPEN_NEW, INCREASE, REDUCE, CLOSE, and REVERSE with exact integer CR conservation!
   */
  private applyFillToPosition(params: {
    contract: FuturesContract;
    order: FuturesOrder;
    fillSide: FuturesOrderSide;
    execPriceInt: number;
    execQtyInt: number;
    notionalMinor: number;
    feeMinor: number;
    tradeId: string;
    timestamp: string;
  }): {
    transition: FuturesPositionTransition;
    realizedPnlMinor: number;
    actualFeeMinor: number;
    bankruptcyShortfallMinor: number;
  } {
    const { contract, order, fillSide, execPriceInt, execQtyInt, feeMinor, tradeId, timestamp } = params;
    const posKey = `${order.playerId}:${contract.symbol}`;
    const existing = this.positions.get(posKey);
    const desiredSide: FuturesPositionSide = fillSide === 'BUY' ? 'LONG' : 'SHORT';

    const hasOpen = Boolean(existing && existing.qtyInt > 0 && existing.status !== 'CLOSED');
    const isSameSide = hasOpen && existing!.side === desiredSide;

    // Helper: collect fee from order's pre-locked fee reserve (already in FUTURES_MARGIN_POOL)
    const payFeeFromOrderReserve = (feeNeeded: number): number => {
      if (feeNeeded <= 0) return 0;
      const fromReserve = Math.min(order.lockedFeeReserveMinor, feeNeeded);
      if (fromReserve > 0) {
        order.lockedFeeReserveMinor -= fromReserve;
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          toAccount: SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE,
          amountMinor: fromReserve,
          category: 'FUTURES_FEE',
          referenceId: tradeId,
          description: `Phí giao dịch Futures ${contract.symbol} (${order.playerName})`,
        });
      }
      return fromReserve;
    };

    // CASE 1: OPEN NEW or INCREASE existing same-side position
    if (!hasOpen || isSameSide) {
      const transition: FuturesPositionTransition = hasOpen ? 'INCREASE' : 'OPEN_NEW';
      const requiredMargin = calcInitialMarginMinor(params.notionalMinor, order.leverage);
      const allocatedMargin = this.consumeOrderMargin(order, requiredMargin, contract.symbol);
      const actualFee = payFeeFromOrderReserve(feeMinor);

      if (!hasOpen) {
        const tier = resolveRiskTier(params.notionalMinor);
        const pos: FuturesPosition = {
          id: `fpos_${crypto.randomBytes(5).toString('hex')}`,
          worldId: this.worldId,
          playerId: order.playerId,
          playerName: order.playerName,
          symbol: contract.symbol,
          side: desiredSide,
          marginMode: 'ISOLATED',
          quantity: fromQtyInt(execQtyInt),
          qtyInt: execQtyInt,
          entryPriceInt: execPriceInt,
          markPriceInt: contract.markPriceInt,
          leverage: order.leverage,
          initialMarginMinor: allocatedMargin,
          marginMinor: allocatedMargin,
          maintenanceMarginMinor: calcMaintenanceMarginMinor(params.notionalMinor, tier.maintenanceMarginBps),
          maintenanceMarginBps: tier.maintenanceMarginBps,
          unrealizedPnlMinor: 0,
          realizedPnlMinor: -actualFee,
          cumulativeFundingMinor: 0,
          liquidationPriceInt: 0,
          bankruptcyPriceInt: 0,
          marginRatioPct: 0,
          roePct: 0,
          notionalMinor: params.notionalMinor,
          status: 'OPEN',
          openedAt: timestamp,
          updatedAt: timestamp,
        };
        this.recalculatePositionMetrics(pos, contract);
        this.positions.set(posKey, pos);
      } else {
        const pos = existing!;
        const newQtyInt = pos.qtyInt + execQtyInt;
        const weightedEntryInt = Number(
          (BigInt(pos.entryPriceInt) * BigInt(pos.qtyInt) + BigInt(execPriceInt) * BigInt(execQtyInt)) /
            BigInt(newQtyInt),
        );
        pos.qtyInt = newQtyInt;
        pos.quantity = fromQtyInt(newQtyInt);
        pos.entryPriceInt = weightedEntryInt;
        pos.initialMarginMinor += allocatedMargin;
        pos.marginMinor += allocatedMargin;
        pos.realizedPnlMinor -= actualFee;
        pos.leverage = Math.max(pos.leverage, order.leverage);
        pos.updatedAt = timestamp;
        this.recalculatePositionMetrics(pos, contract);
      }

      return {
        transition,
        realizedPnlMinor: 0,
        actualFeeMinor: actualFee,
        bankruptcyShortfallMinor: 0,
      };
    }

    // CASE 2: REDUCE, CLOSE, or REVERSE opposite position
    const pos = existing!;
    const closeQtyInt = Math.min(execQtyInt, pos.qtyInt);
    const reverseOpenQtyInt = execQtyInt - closeQtyInt;
    const isFullClose = closeQtyInt === pos.qtyInt;
    const transition: FuturesPositionTransition =
      reverseOpenQtyInt > 0 ? 'REVERSE' : isFullClose ? 'CLOSE' : 'REDUCE';

    // Exact proportional isolated margin release using BigInt
    const releasedMarginMinor = isFullClose
      ? pos.marginMinor
      : Number((BigInt(pos.marginMinor) * BigInt(closeQtyInt)) / BigInt(pos.qtyInt));
    const releasedInitialMinor = isFullClose
      ? pos.initialMarginMinor
      : Number((BigInt(pos.initialMarginMinor) * BigInt(closeQtyInt)) / BigInt(pos.qtyInt));

    const grossRealizedPnlMinor = calcFuturesPnlMinor(
      pos.side,
      pos.entryPriceInt,
      execPriceInt,
      closeQtyInt,
      contract.priceScale,
      contract.contractMultiplier,
    );

    // Fee handling for closing leg
    let actualFeeMinor = 0;
    let feePaidFromCloseProceeds = 0;
    if (feeMinor > 0) {
      actualFeeMinor = payFeeFromOrderReserve(feeMinor);
      const remainingFee = feeMinor - actualFeeMinor;
      if (remainingFee > 0) {
        const grossEquityAfterPnl = releasedMarginMinor + grossRealizedPnlMinor;
        feePaidFromCloseProceeds = Math.min(Math.max(0, grossEquityAfterPnl), remainingFee);
        if (feePaidFromCloseProceeds > 0) {
          this.ledger.transferAvailable({
            fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
            toAccount: SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE,
            amountMinor: feePaidFromCloseProceeds,
            category: 'FUTURES_FEE',
            referenceId: tradeId,
            description: `Phí đóng vị thế Futures ${contract.symbol}`,
          });
          actualFeeMinor += feePaidFromCloseProceeds;
        }
      }
    }

    const netEquityOfSlice = releasedMarginMinor + grossRealizedPnlMinor - feePaidFromCloseProceeds;
    let bankruptcyShortfallMinor = 0;

    if (netEquityOfSlice > 0) {
      // If this is a liquidation order, keep payout inside pool temporarily so LiquidationEngine can collect liqFee & refund remainder cleanly
      if (!order.isLiquidationOrder) {
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          toAccount: order.playerId,
          amountMinor: netEquityOfSlice,
          category: grossRealizedPnlMinor !== 0 ? 'FUTURES_PNL_SETTLEMENT' : 'FUTURES_MARGIN_RELEASE',
          referenceId: tradeId,
          description: `Thanh toán đóng ${fromQtyInt(closeQtyInt)} ${contract.symbol} (PnL: ${(grossRealizedPnlMinor / 100).toFixed(2)} CR)`,
        });
      }
    } else if (netEquityOfSlice < 0) {
      // Isolated Margin Bankruptcy: trader's loss is capped at their isolated collateral (0 returned).
      // Shortfall MUST be covered by finite Insurance Fund so counterparty's profit in POOL remains backed!
      bankruptcyShortfallMinor = -netEquityOfSlice;
      if (!order.isLiquidationOrder) {
        this.coverBankruptcyShortfall(contract, pos, bankruptcyShortfallMinor, tradeId);
      }
    }

    // Record Realized PnL History
    this.pnlHistory.push({
      id: `fpnl_${crypto.randomBytes(5).toString('hex')}`,
      playerId: order.playerId,
      symbol: contract.symbol,
      positionId: pos.id,
      side: pos.side,
      transition,
      closedQuantity: fromQtyInt(closeQtyInt),
      entryPriceInt: pos.entryPriceInt,
      exitPriceInt: execPriceInt,
      grossPnlMinor: grossRealizedPnlMinor,
      feeMinor: actualFeeMinor,
      netPnlMinor: grossRealizedPnlMinor - actualFeeMinor,
      isLiquidation: order.isLiquidationOrder,
      timestamp,
    });
    if (this.pnlHistory.length > 1000) this.pnlHistory.shift();

    // Update or close position
    if (isFullClose) {
      pos.qtyInt = 0;
      pos.quantity = 0;
      pos.marginMinor = 0;
      pos.initialMarginMinor = 0;
      pos.realizedPnlMinor += grossRealizedPnlMinor - actualFeeMinor;
      pos.unrealizedPnlMinor = 0;
      pos.status = 'CLOSED';
      pos.updatedAt = timestamp;
      this.positions.delete(posKey);
      // Auto-cancel dangling Reduce-Only conditional SL/TP orders for this closed position
      this.cancelReduceOnlyConditionals(order.playerId, contract.symbol);
    } else {
      pos.qtyInt -= closeQtyInt;
      pos.quantity = fromQtyInt(pos.qtyInt);
      pos.marginMinor -= releasedMarginMinor;
      pos.initialMarginMinor = Math.max(0, pos.initialMarginMinor - releasedInitialMinor);
      pos.realizedPnlMinor += grossRealizedPnlMinor - actualFeeMinor;
      pos.updatedAt = timestamp;
      this.recalculatePositionMetrics(pos, contract);
    }

    // If REVERSE: open fresh position on opposite side with excess qty
    if (reverseOpenQtyInt > 0) {
      const revNotional = calcFuturesNotionalMinor(
        execPriceInt,
        reverseOpenQtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );
      const revRequiredMargin = calcInitialMarginMinor(revNotional, order.leverage);
      const allocatedRevMargin = this.consumeOrderMargin(order, revRequiredMargin, contract.symbol);
      const tier = resolveRiskTier(revNotional);
      const newPos: FuturesPosition = {
        id: `fpos_${crypto.randomBytes(5).toString('hex')}`,
        worldId: this.worldId,
        playerId: order.playerId,
        playerName: order.playerName,
        symbol: contract.symbol,
        side: desiredSide,
        marginMode: 'ISOLATED',
        quantity: fromQtyInt(reverseOpenQtyInt),
        qtyInt: reverseOpenQtyInt,
        entryPriceInt: execPriceInt,
        markPriceInt: contract.markPriceInt,
        leverage: order.leverage,
        initialMarginMinor: allocatedRevMargin,
        marginMinor: allocatedRevMargin,
        maintenanceMarginMinor: calcMaintenanceMarginMinor(revNotional, tier.maintenanceMarginBps),
        maintenanceMarginBps: tier.maintenanceMarginBps,
        unrealizedPnlMinor: 0,
        realizedPnlMinor: 0,
        cumulativeFundingMinor: 0,
        liquidationPriceInt: 0,
        bankruptcyPriceInt: 0,
        marginRatioPct: 0,
        roePct: 0,
        notionalMinor: revNotional,
        status: 'OPEN',
        openedAt: timestamp,
        updatedAt: timestamp,
      };
      this.recalculatePositionMetrics(newPos, contract);
      this.positions.set(posKey, newPos);
    }

    return {
      transition,
      realizedPnlMinor: grossRealizedPnlMinor,
      actualFeeMinor,
      bankruptcyShortfallMinor,
    };
  }

  private consumeOrderMargin(order: FuturesOrder, neededMarginMinor: number, symbol: string): number {
    if (neededMarginMinor <= 0) return 0;
    if (order.lockedMarginMinor >= neededMarginMinor) {
      order.lockedMarginMinor -= neededMarginMinor;
      return neededMarginMinor;
    }
    // Pull any tiny deficit due to price improvement/slippage within wallet balance if needed
    const deficit = neededMarginMinor - order.lockedMarginMinor;
    const fromOrder = order.lockedMarginMinor;
    order.lockedMarginMinor = 0;

    const wallet = this.ledger.requireWallet(order.playerId);
    const extra = Math.min(wallet.availableMinor, deficit);
    if (extra > 0) {
      this.ledger.transferAvailable({
        fromAccount: order.playerId,
        toAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
        amountMinor: extra,
        category: 'FUTURES_MARGIN_LOCK',
        referenceId: order.id,
        description: `Bổ sung ký quỹ khớp lệnh ${symbol}`,
      });
    }
    return fromOrder + extra;
  }

  private refundUnusedOrderLock(order: FuturesOrder, description: string): number {
    const refund = order.lockedMarginMinor + order.lockedFeeReserveMinor;
    order.lockedMarginMinor = 0;
    order.lockedFeeReserveMinor = 0;
    if (refund > 0) {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
        toAccount: order.playerId,
        amountMinor: refund,
        category: 'FUTURES_MARGIN_RELEASE',
        referenceId: order.id,
        description,
      });
    }
    return refund;
  }

  // ============================================================================
  // ISOLATED MARGIN TOP-UP & CANCEL ORDER
  // ============================================================================

  addPositionMargin(playerId: string, positionId: string, amountMinor: number): FuturesPosition {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new DomainError('INVALID_ORDER', 'Số CR ký quỹ bổ sung phải lớn hơn 0.');
    }

    let target: FuturesPosition | null = null;
    for (const pos of this.positions.values()) {
      if (pos.id === positionId && pos.playerId === playerId && pos.qtyInt > 0 && pos.status !== 'CLOSED') {
        target = pos;
        break;
      }
    }
    if (!target) {
      throw new DomainError('FUTURES_POSITION_NOT_FOUND');
    }

    const contract = this.contracts.get(target.symbol);
    if (!contract) throw new DomainError('ASSET_NOT_FOUND');

    const wallet = this.ledger.requireWallet(playerId);
    if (wallet.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }

    this.ledger.transferAvailable({
      fromAccount: playerId,
      toAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
      amountMinor,
      category: 'FUTURES_MARGIN_LOCK',
      referenceId: target.id,
      description: `Bổ sung ký quỹ Isolated +${(amountMinor / 100).toFixed(2)} CR cho vị thế ${target.symbol}`,
    });

    target.marginMinor += amountMinor;
    target.updatedAt = new Date().toISOString();
    this.recalculatePositionMetrics(target, contract);
    if (target.marginRatioPct < 80 && target.status === 'MARGIN_CALL') {
      target.status = 'OPEN';
    }

    const snapshot = { ...target };
    this.hooks.onPosition?.(playerId, snapshot, target.symbol);
    return snapshot;
  }

  cancelOrder(orderId: string, requesterPlayerId: string): FuturesCancelOrderResult {
    const order = this.ordersById.get(orderId);
    if (!order || order.playerId !== requesterPlayerId) {
      throw new DomainError('ORDER_NOT_FOUND');
    }
    if (
      order.status !== 'OPEN' &&
      order.status !== 'PARTIALLY_FILLED' &&
      order.status !== 'PENDING_TRIGGER'
    ) {
      throw new DomainError('ORDER_ALREADY_FILLED');
    }

    if (order.status === 'PENDING_TRIGGER') {
      const conds = this.conditionalOrders.get(order.symbol) ?? [];
      const cIdx = conds.findIndex((o) => o.id === order.id);
      if (cIdx !== -1) conds.splice(cIdx, 1);
    } else {
      const book = order.side === 'BUY' ? this.bids.get(order.symbol)! : this.asks.get(order.symbol)!;
      const idx = book.findIndex((o) => o.id === order.id);
      if (idx !== -1) book.splice(idx, 1);
    }

    const refundedMarginMinor = this.refundUnusedOrderLock(
      order,
      `Hoàn ký quỹ sau khi hủy lệnh Futures ${order.symbol}`,
    );

    order.remainingQtyInt = 0;
    order.remainingQuantity = 0;
    order.status = 'CANCELLED';
    order.version = (order.version ?? 0) + 1;
    order.updatedAt = new Date().toISOString();
    this.bookSeq += 1;

    const cancelledSnap = { ...order };
    const book = this.getOrderBook(order.symbol);
    this.hooks.onOrder?.(cancelledSnap, 'cancelled');
    this.hooks.onOrderBook?.(book);

    return {
      order: cancelledSnap,
      orderBook: book,
      refundedMarginMinor,
    };
  }

  /**
   * Expires all resting/conditional Futures orders whose `expiresAt` timestamp has elapsed,
   * removes them from book/conditional queues, refunds locked margin & fee reserves,
   * sets remainingQtyInt = 0 & status = 'EXPIRED', and emits `onOrder(..., 'expired')`.
   */
  expireOrders(nowMs = Date.now()): FuturesOrder[] {
    const expired: FuturesOrder[] = [];
    const affectedSymbols = new Set<string>();
    const nowIso = new Date(nowMs).toISOString();

    for (const order of this.ordersById.values()) {
      if (!isFuturesOrderOpen(order)) continue;
      if (!order.expiresAt) continue;
      const expMs = Date.parse(order.expiresAt);
      if (!Number.isFinite(expMs) || expMs > nowMs) continue;

      if (order.status === 'PENDING_TRIGGER') {
        const conds = this.conditionalOrders.get(order.symbol);
        if (conds) {
          const idx = conds.findIndex((o) => o.id === order.id);
          if (idx !== -1) conds.splice(idx, 1);
        }
      } else {
        const book = order.side === 'BUY' ? this.bids.get(order.symbol) : this.asks.get(order.symbol);
        if (book) {
          const idx = book.findIndex((o) => o.id === order.id);
          if (idx !== -1) book.splice(idx, 1);
        }
      }

      this.refundUnusedOrderLock(order, `Hoàn ký quỹ lệnh Futures hết hạn ${order.symbol}`);
      order.remainingQtyInt = 0;
      order.remainingQuantity = 0;
      order.status = 'EXPIRED';
      order.version = (order.version ?? 0) + 1;
      order.updatedAt = nowIso;
      affectedSymbols.add(order.symbol);

      const snap = { ...order };
      expired.push(snap);
      this.hooks.onOrder?.(snap, 'expired');
    }

    if (affectedSymbols.size > 0) {
      this.bookSeq += 1;
      for (const sym of affectedSymbols) {
        this.hooks.onOrderBook?.(this.getOrderBook(sym));
      }
    }

    return expired;
  }

  cancelAllPlayerOrdersForSymbol(playerId: string, symbol: string): void {
    const open = this.listPlayerOpenOrders(playerId, symbol);
    for (const o of open) {
      this.cancelOrder(o.id, playerId);
    }
  }

  // ============================================================================
  // MARK PRICE SYNC, CONDITIONAL TRIGGERS & LIQUIDATION ENGINE
  // ============================================================================

  /**
   * Refreshes Index Price & Mark Price for a symbol, updates position risk metrics,
   * and triggers conditional SL/TP orders if price crosses trigger threshold.
   */
  refreshContractMarkPrice(symbol: string, nowMs = Date.now()): FuturesContract {
    const contract = this.contracts.get(symbol);
    if (!contract) throw new DomainError('ASSET_NOT_FOUND');

    const bids = this.bids.get(symbol) ?? [];
    const asks = this.asks.get(symbol) ?? [];
    const bestBidInt = bids.length > 0 ? bids[0].priceInt : null;
    const bestAskInt = asks.length > 0 ? asks[0].priceInt : null;

    const evalRes = this.markEngine.evaluate(contract, bestBidInt, bestAskInt, nowMs);
    const nowIso = new Date(nowMs).toISOString();

    if (evalRes.degraded) {
      if (contract.status !== 'EMERGENCY_HALTED') {
        contract.status = 'DEGRADED';
        contract.degradedReason = evalRes.degradedReason;
      }
      return { ...contract };
    }

    if (contract.status === 'DEGRADED') {
      contract.status = 'OPEN';
      contract.degradedReason = null;
    }

    contract.indexPriceInt = evalRes.indexPriceInt;
    contract.markPriceInt = evalRes.markPriceInt;
    contract.estimatedFundingRateBps = evalRes.estimatedFundingRateBps;
    contract.lastIndexUpdatedAt = nowIso;
    contract.lastMarkUpdatedAt = nowIso;

    // Update all open positions on this contract with fresh Mark Price
    for (const pos of this.positions.values()) {
      if (pos.symbol === symbol && pos.qtyInt > 0 && pos.status !== 'CLOSED') {
        this.recalculatePositionMetrics(pos, contract);
      }
    }

    this.recomputeOpenInterest(contract);
    this.evaluateConditionalOrders(symbol);

    return { ...contract };
  }

  refreshAllMarkPrices(nowMs = Date.now()): void {
    for (const symbol of this.contracts.keys()) {
      this.refreshContractMarkPrice(symbol, nowMs);
    }
  }

  /**
   * Evaluates all pending conditional SL/TP orders for a contract and converts triggered ones
   * into real orders on the shared order book.
   */
  evaluateConditionalOrders(symbol: string): FuturesOrder[] {
    const contract = this.contracts.get(symbol);
    if (!contract || contract.status !== 'OPEN') return [];

    const pending = this.conditionalOrders.get(symbol) ?? [];
    if (pending.length === 0) return [];

    const triggered: FuturesOrder[] = [];
    const remaining: FuturesOrder[] = [];

    for (const ord of pending) {
      if (ord.status !== 'PENDING_TRIGGER' || ord.triggerPriceInt === null) continue;
      const refPrice = ord.triggerSource === 'LAST_PRICE' ? contract.lastPriceInt : contract.markPriceInt;
      const hit =
        ord.triggerDirection === 'ABOVE'
          ? refPrice >= ord.triggerPriceInt
          : refPrice <= ord.triggerPriceInt;

      if (hit) {
        triggered.push(ord);
      } else {
        remaining.push(ord);
      }
    }

    if (triggered.length === 0) return [];
    this.conditionalOrders.set(symbol, remaining);

    for (const ord of triggered) {
      // Re-verify reduce-only position still exists
      if (ord.reduceOnly) {
        const pos = this.positions.get(`${ord.playerId}:${symbol}`);
        const validOpp =
          pos &&
          pos.qtyInt > 0 &&
          ((pos.side === 'LONG' && ord.side === 'SELL') || (pos.side === 'SHORT' && ord.side === 'BUY'));
        if (!validOpp) {
          ord.status = 'CANCELLED';
          ord.remainingQtyInt = 0;
          ord.remainingQuantity = 0;
          ord.version = (ord.version ?? 0) + 1;
          ord.updatedAt = new Date().toISOString();
          ord.rejectReason = 'Vị thế đã đóng trước khi lệnh điều kiện kích hoạt.';
          this.refundUnusedOrderLock(ord, `Hoàn ký quỹ lệnh điều kiện ${ord.id}`);
          this.hooks.onOrder?.({ ...ord }, 'cancelled');
          continue;
        }
        ord.qtyInt = Math.min(ord.qtyInt, pos!.qtyInt);
        ord.quantity = fromQtyInt(ord.qtyInt);
        ord.remainingQtyInt = ord.qtyInt;
        ord.remainingQuantity = ord.quantity;
      }

      ord.status = 'OPEN';
      ord.version = (ord.version ?? 0) + 1;
      ord.updatedAt = new Date().toISOString();
      try {
        this.executeActiveOrder(ord, contract, 800);
      } catch (err) {
        ord.status = 'CANCELLED';
        ord.remainingQtyInt = 0;
        ord.remainingQuantity = 0;
        ord.version = (ord.version ?? 0) + 1;
        ord.updatedAt = new Date().toISOString();
        ord.rejectReason = err instanceof Error ? err.message : 'Không đủ thanh khoản khi kích hoạt lệnh điều kiện.';
        this.refundUnusedOrderLock(ord, `Hoàn ký quỹ lệnh điều kiện thất bại ${ord.id}`);
        this.hooks.onOrder?.({ ...ord }, 'cancelled');
      }
    }

    return triggered;
  }

  /**
   * Authoritative Liquidation Engine Cycle.
   *
   * Rules strictly enforced:
   * 1. NEVER liquidates a contract in DEGRADED or EMERGENCY_HALTED status.
   * 2. Evaluates strictly using Mark Price (NEVER raw Last Price outlier!).
   * 3. Emits Margin Call warning at marginRatio >= 80%.
   * 4. Liquidates at marginRatio >= 100%:
   *    - Attempts Partial Liquidation (50%) first for large positions (>= 50,000 CR notional).
   *    - Executes forced Reduce-Only close through the REAL shared order book (never fabricates fill price!).
   *    - If book has zero counterparty liquidity -> halts liquidation (`HALTED_INSUFFICIENT_LIQUIDITY`), no fake price!
   *    - Collects Liquidation Fee (0.50%), split 50% Insurance Fund / 50% Fee Revenue.
   *    - If bankruptcy deficit > 0 -> claims from FINITE Insurance Fund. If depleted -> records UnresolvedDeficit & halts market!
   */
  runLiquidationCheck(targetSymbol?: string): LiquidationCycleResult {
    const marginCalls: FuturesPosition[] = [];
    const liquidations: FuturesLiquidationEvent[] = [];
    const allLiqTrades: FuturesTrade[] = [];
    const affectedPlayers = new Set<string>();

    const symbols = targetSymbol ? [targetSymbol] : Array.from(this.contracts.keys());

    for (const symbol of symbols) {
      const contract = this.contracts.get(symbol);
      if (!contract) continue;

      // Critical Safety Rule: NEVER liquidate on degraded or emergency-halted contracts
      if (contract.status === 'DEGRADED' || contract.status === 'EMERGENCY_HALTED') {
        continue;
      }

      const openPositions = this.listAllOpenPositions(symbol);
      for (const posSnap of openPositions) {
        const livePos = this.positions.get(`${posSnap.playerId}:${symbol}`);
        if (!livePos || livePos.qtyInt <= 0 || livePos.status === 'CLOSED') continue;

        this.recalculatePositionMetrics(livePos, contract);

        if (livePos.marginRatioPct >= 80 && livePos.marginRatioPct < 100) {
          if (livePos.status !== 'MARGIN_CALL') {
            livePos.status = 'MARGIN_CALL';
            livePos.updatedAt = new Date().toISOString();
            const snap = { ...livePos };
            marginCalls.push(snap);
            this.hooks.onMarginCall?.(snap);
            this.hooks.onPosition?.(livePos.playerId, snap, symbol);
          }
          continue;
        }

        if (livePos.marginRatioPct < 80 && livePos.status === 'MARGIN_CALL') {
          livePos.status = 'OPEN';
          livePos.updatedAt = new Date().toISOString();
          continue;
        }

        if (livePos.marginRatioPct < 100) continue;

        // ===== LIQUIDATION TRIGGERED (Mark Price Margin Ratio >= 100%) =====
        livePos.status = 'LIQUIDATING';
        const nowIso = new Date().toISOString();

        // Cancel resting orders for this player on this symbol first so locked order collateral returns cleanly
        this.cancelAllPlayerOrdersForSymbol(livePos.playerId, symbol);

        // Determine Partial (50%) vs Full Liquidation
        const canPartial =
          livePos.notionalMinor >= 50_000_00 &&
          livePos.qtyInt >= contract.qtyStepInt * 2 &&
          livePos.marginMinor + livePos.unrealizedPnlMinor > 0;
        const partialStepQtyInt =
          Math.floor(Math.floor(livePos.qtyInt / 2) / contract.qtyStepInt) * contract.qtyStepInt;
        const targetLiqQtyInt = canPartial && partialStepQtyInt >= contract.minQtyInt ? partialStepQtyInt : livePos.qtyInt;
        const liqSide: FuturesOrderSide = livePos.side === 'LONG' ? 'SELL' : 'BUY';

        // Check REAL counterparty liquidity on shared order book (NEVER invent a price!)
        const oppBook = liqSide === 'BUY' ? this.asks.get(symbol)! : this.bids.get(symbol)!;
        const hasRealLiquidity = oppBook.some((o) => o.remainingQtyInt > 0 && o.playerId !== livePos.playerId);

        if (!hasRealLiquidity) {
          contract.status = 'DEGRADED';
          contract.degradedReason = `Thanh khoản sổ lệnh ${symbol} cạn kiệt khi thanh lý vị thế ${livePos.id} — tạm dừng để tránh khớp giá ảo.`;
          const haltedEvent: FuturesLiquidationEvent = {
            id: `fliq_${crypto.randomBytes(5).toString('hex')}`,
            symbol,
            playerId: livePos.playerId,
            playerName: livePos.playerName,
            positionId: livePos.id,
            side: livePos.side,
            liquidationType: 'HALTED_INSUFFICIENT_LIQUIDITY',
            liquidatedQuantity: 0,
            markPriceInt: contract.markPriceInt,
            executionPriceInt: 0,
            bankruptcyPriceInt: livePos.bankruptcyPriceInt,
            liquidationFeeMinor: 0,
            insuranceFundDeltaMinor: 0,
            unresolvedDeficitMinor: 0,
            note: 'Không có lệnh đối ứng hợp lệ trên sổ lệnh. Hệ thống từ chối bịa giá khớp và chuyển thị trường sang DEGRADED.',
            timestamp: nowIso,
          };
          this.liquidationHistory.push(haltedEvent);
          liquidations.push(haltedEvent);
          this.hooks.onLiquidation?.(haltedEvent);
          this.hooks.onQuote?.({ ...contract });
          continue;
        }

        // Snapshot pre-liquidation position parameters
        const preQtyInt = livePos.qtyInt;
        const preMarginMinor = livePos.marginMinor;
        const preEntryPriceInt = livePos.entryPriceInt;
        const preBankruptcyInt = livePos.bankruptcyPriceInt;
        const prePosId = livePos.id;
        const preSide = livePos.side;
        const prePlayerName = livePos.playerName;

        // Execute forced Reduce-Only Market order against the real order book
        const execRes = this.placeOrderInternal({
          playerId: livePos.playerId,
          playerName: livePos.playerName,
          symbol,
          side: liqSide,
          type: 'MARKET',
          timeInForce: 'IOC',
          quantity: fromQtyInt(targetLiqQtyInt),
          leverage: livePos.leverage,
          reduceOnly: true,
          isLiquidationOrder: true,
          skipRiskAckCheck: true,
        });

        allLiqTrades.push(...execRes.trades);
        affectedPlayers.add(livePos.playerId);
        for (const t of execRes.trades) {
          affectedPlayers.add(t.buyerId);
          affectedPlayers.add(t.sellerId);
        }

        const filledQtyInt = execRes.order.filledQtyInt;
        if (filledQtyInt <= 0) {
          continue;
        }

        const avgExecPriceInt = execRes.order.avgExecutionPriceInt;
        const survivingBeforeRefund = this.positions.get(`${livePos.playerId}:${symbol}`);
        const isFullLiquidation = filledQtyInt >= preQtyInt || !survivingBeforeRefund || survivingBeforeRefund.qtyInt <= 0;
        const sliceMarginMinor = isFullLiquidation
          ? preMarginMinor
          : Math.max(0, preMarginMinor - survivingBeforeRefund.marginMinor);
        const slicePnlMinor = execRes.order.realizedPnlMinor;
        const sliceNotional = execRes.trades.reduce((s, t) => s + t.notionalMinor, 0);

        const netBeforeLiqFee = sliceMarginMinor + slicePnlMinor;
        let actualLiqFeeMinor = 0;
        let insuranceDeltaMinor = 0;
        let unresolvedDeficitMinor = 0;
        let liqType: FuturesLiquidationEvent['liquidationType'] = isFullLiquidation ? 'FULL' : 'PARTIAL';
        let note = '';

        if (netBeforeLiqFee >= 0) {
          const targetLiqFee = calcFuturesFeeMinor(sliceNotional, FUTURES_LIQUIDATION_FEE_BPS, true);
          actualLiqFeeMinor = Math.min(netBeforeLiqFee, targetLiqFee);
          const toInsurance = Math.floor(actualLiqFeeMinor / 2);
          const toFeeRev = actualLiqFeeMinor - toInsurance;

          if (toInsurance > 0) {
            this.ledger.transferAvailable({
              fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
              toAccount: SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND,
              amountMinor: toInsurance,
              category: 'FUTURES_INSURANCE_FUND',
              referenceId: prePosId,
              description: `Phí thanh lý trích lập Quỹ bảo hiểm (${symbol})`,
            });
            this.insuranceInflowsMinor += toInsurance;
            insuranceDeltaMinor += toInsurance;
          }
          if (toFeeRev > 0) {
            this.ledger.transferAvailable({
              fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
              toAccount: SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE,
              amountMinor: toFeeRev,
              category: 'FUTURES_LIQUIDATION',
              referenceId: prePosId,
              description: `Phí thanh lý bắt buộc (${symbol})`,
            });
          }

          const remainingRefund = netBeforeLiqFee - actualLiqFeeMinor;
          if (remainingRefund > 0) {
            // For partial liquidation, keep remaining equity buffer inside the surviving position if it improves health;
            // for full liquidation, return remaining isolated equity to trader's available CR wallet.
            const survivingPos = this.positions.get(`${livePos.playerId}:${symbol}`);
            if (!isFullLiquidation && survivingPos && survivingPos.qtyInt > 0) {
              survivingPos.marginMinor += remainingRefund;
              this.recalculatePositionMetrics(survivingPos, contract);
              survivingPos.status = survivingPos.marginRatioPct >= 80 ? 'MARGIN_CALL' : 'OPEN';
              note = `Thanh lý một phần ${fromQtyInt(filledQtyInt)} ${symbol}; phần vốn dư ${(remainingRefund / 100).toFixed(2)} CR gia cố vị thế còn lại.`;
            } else {
              this.ledger.transferAvailable({
                fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
                toAccount: livePos.playerId,
                amountMinor: remainingRefund,
                category: 'FUTURES_LIQUIDATION',
                referenceId: prePosId,
                description: `Hoàn vốn dư sau thanh lý vị thế ${symbol}`,
              });
              note = `Thanh lý toàn bộ ${fromQtyInt(filledQtyInt)} ${symbol} @ ${formatRate(avgExecPriceInt, contract.priceScale, contract.priceDecimals)} CR.`;
            }
          } else {
            note = `Thanh lý ${isFullLiquidation ? 'toàn bộ' : 'một phần'} ${fromQtyInt(filledQtyInt)} ${symbol} — toàn bộ ký quỹ đã hấp thụ lỗ và phí thanh lý.`;
          }
        } else {
          // BANKRUPTCY SHORTFALL: execution price crossed bankruptcy price!
          const shortfall = -netBeforeLiqFee;
          const cover = this.coverBankruptcyShortfall(contract, {
            id: prePosId,
            playerId: livePos.playerId,
            symbol,
          }, shortfall, execRes.order.id);
          insuranceDeltaMinor = -cover.coveredMinor;
          unresolvedDeficitMinor = cover.unresolvedMinor;
          if (cover.unresolvedMinor > 0) {
            liqType = 'HALTED_INSURANCE_DEPLETED';
            note = `Tổn thất phá sản (${(shortfall / 100).toFixed(2)} CR) vượt Quỹ bảo hiểm! Đã ghi nhận nghĩa vụ chưa xử lý ${(cover.unresolvedMinor / 100).toFixed(2)} CR và dừng khẩn cấp hợp đồng.`;
          } else {
            note = `Phá sản vị thế Isolated: Quỹ bảo hiểm đã bù lỗ ${(cover.coveredMinor / 100).toFixed(2)} CR (không tạo CR vô hạn).`;
          }
        }

        // If partial liquidation did not restore health below 100%, immediately finish remaining slice if market still OPEN
        const afterPos = this.positions.get(`${livePos.playerId}:${symbol}`);
        if (afterPos && afterPos.qtyInt > 0) {
          this.recalculatePositionMetrics(afterPos, contract);
          if (afterPos.marginRatioPct < 80) afterPos.status = 'OPEN';
          else if (afterPos.marginRatioPct < 100) afterPos.status = 'MARGIN_CALL';
        }

        const liqEvent: FuturesLiquidationEvent = {
          id: `fliq_${crypto.randomBytes(5).toString('hex')}`,
          symbol,
          playerId: livePos.playerId,
          playerName: prePlayerName,
          positionId: prePosId,
          side: preSide,
          liquidationType: liqType,
          liquidatedQuantity: fromQtyInt(filledQtyInt),
          markPriceInt: contract.markPriceInt,
          executionPriceInt: avgExecPriceInt,
          bankruptcyPriceInt: preBankruptcyInt,
          liquidationFeeMinor: actualLiqFeeMinor,
          insuranceFundDeltaMinor: insuranceDeltaMinor,
          unresolvedDeficitMinor,
          note,
          timestamp: nowIso,
        };

        this.liquidationHistory.push(liqEvent);
        if (this.liquidationHistory.length > 200) this.liquidationHistory.shift();
        liquidations.push(liqEvent);
        this.hooks.onLiquidation?.(liqEvent);
        this.hooks.onPosition?.(livePos.playerId, this.getPosition(livePos.playerId, symbol), symbol);
      }
    }

    return {
      marginCalls,
      liquidations,
      trades: allLiqTrades,
      affectedPlayers: Array.from(affectedPlayers),
    };
  }

  /**
   * Covers bankruptcy deficit strictly from finite Insurance Fund balance.
   * NEVER prints CR! If fund is insufficient, halts market & logs UnresolvedDeficitRecord.
   */
  private coverBankruptcyShortfall(
    contract: FuturesContract,
    pos: { id: string; playerId: string; symbol: string },
    shortfallMinor: number,
    referenceId: string,
  ): { coveredMinor: number; unresolvedMinor: number } {
    const fundBalance = this.ledger.getSystemBalance(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND);
    const coveredMinor = Math.min(fundBalance, shortfallMinor);
    const unresolvedMinor = shortfallMinor - coveredMinor;

    if (coveredMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND,
        toAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
        amountMinor: coveredMinor,
        category: 'FUTURES_INSURANCE_FUND',
        referenceId,
        description: `Quỹ bảo hiểm bù tổn thất phá sản vị thế ${pos.id} (${pos.symbol})`,
      });
      this.insurancePayoutsMinor += coveredMinor;
    }

    if (unresolvedMinor > 0) {
      const record: UnresolvedDeficitRecord = {
        id: `udef_${crypto.randomBytes(5).toString('hex')}`,
        symbol: pos.symbol,
        positionId: pos.id,
        playerId: pos.playerId,
        deficitMinor: unresolvedMinor,
        reason: 'Quỹ bảo hiểm hữu hạn đã cạn kiệt; dừng xử lý không an toàn thay vì phát hành CR vô hạn (ADL chưa kích hoạt).',
        timestamp: new Date().toISOString(),
      };
      this.unresolvedDeficits.push(record);
      contract.status = 'EMERGENCY_HALTED';
      contract.degradedReason = `Dừng khẩn cấp: Tổn thất vượt Quỹ bảo hiểm (${(unresolvedMinor / 100).toFixed(2)} CR chưa có nguồn bù đắp).`;
      this.hooks.onQuote?.({ ...contract });
    }

    return { coveredMinor, unresolvedMinor };
  }

  // ============================================================================
  // FUNDING RATE SETTLEMENT (EXACT ZERO-SUM PEER-TO-PEER)
  // ============================================================================

  settleFundingForSymbol(symbol: string, overrideRateBps?: number, nowMs = Date.now()): FuturesFundingSettlementEvent {
    const contract = this.contracts.get(symbol);
    if (!contract) throw new DomainError('ASSET_NOT_FOUND');

    const nowIso = new Date(nowMs).toISOString();
    contract.nextFundingAt = new Date(nowMs + contract.fundingIntervalSeconds * 1000).toISOString();

    const rateBps =
      overrideRateBps !== undefined
        ? Math.max(-75, Math.min(75, Math.round(overrideRateBps)))
        : contract.estimatedFundingRateBps;
    contract.currentFundingRateBps = rateBps;

    const openPositions = this.listAllOpenPositions(symbol);
    const longs = openPositions
      .map((p) => this.positions.get(`${p.playerId}:${symbol}`)!)
      .filter((p) => p && p.side === 'LONG' && p.qtyInt > 0);
    const shorts = openPositions
      .map((p) => this.positions.get(`${p.playerId}:${symbol}`)!)
      .filter((p) => p && p.side === 'SHORT' && p.qtyInt > 0);

    const settlementId = `ffund_${crypto.randomBytes(5).toString('hex')}`;

    if (rateBps === 0 || longs.length === 0 || shorts.length === 0 || contract.status !== 'OPEN') {
      const zeroEvt: FuturesFundingSettlementEvent = {
        id: settlementId,
        symbol,
        markPriceInt: contract.markPriceInt,
        indexPriceInt: contract.indexPriceInt,
        fundingRateBps: rateBps,
        totalPaidMinor: 0,
        totalReceivedMinor: 0,
        affectedPositionsCount: 0,
        timestamp: nowIso,
      };
      this.fundingSettlements.push(zeroEvt);
      if (this.fundingSettlements.length > 200) this.fundingSettlements.shift();
      this.hooks.onFunding?.(zeroEvt);
      this.hooks.onQuote?.({ ...contract });
      return zeroEvt;
    }

    const absRateBps = Math.abs(rateBps);
    const payers = rateBps > 0 ? longs : shorts;
    const receivers = rateBps > 0 ? shorts : longs;

    // 1. Collect strictly from isolated margin of paying positions (never negative!)
    let totalPaidMinor = 0;
    const payerContributions: Array<{ pos: FuturesPosition; notional: number; paid: number }> = [];
    for (const pos of payers) {
      const notional = calcFuturesNotionalMinor(
        contract.markPriceInt,
        pos.qtyInt,
        contract.priceScale,
        contract.contractMultiplier,
      );
      const scheduled = calcFuturesFeeMinor(notional, absRateBps, false);
      const actualPaid = Math.min(pos.marginMinor, scheduled);
      if (actualPaid > 0) {
        pos.marginMinor -= actualPaid;
        pos.cumulativeFundingMinor -= actualPaid;
        pos.updatedAt = nowIso;
        totalPaidMinor += actualPaid;
        payerContributions.push({ pos, notional, paid: actualPaid });
      }
    }

    // 2. Distribute EXACTLY totalPaidMinor pro-rata by qtyInt across receiving positions (ZERO CR minted!)
    let totalReceivedMinor = 0;
    if (totalPaidMinor > 0) {
      const totalReceiverQty = receivers.reduce((sum, p) => sum + BigInt(p.qtyInt), 0n);
      const allocations = receivers.map((pos) => {
        const share = Number((BigInt(totalPaidMinor) * BigInt(pos.qtyInt)) / totalReceiverQty);
        return { pos, share };
      });
      let allocatedSum = allocations.reduce((s, a) => s + a.share, 0);
      let remainder = totalPaidMinor - allocatedSum;

      // Distribute deterministic 1-minor-unit remainders to largest positions
      allocations.sort((a, b) => b.pos.qtyInt - a.pos.qtyInt || a.pos.id.localeCompare(b.pos.id));
      for (let i = 0; i < allocations.length && remainder > 0; i++) {
        allocations[i].share += 1;
        remainder -= 1;
      }

      const txId = `tx_fund_${settlementId}`;
      for (const item of payerContributions) {
        this.ledger.recordEntry({
          transactionId: txId,
          currency: 'CR',
          debitAccount: item.pos.playerId,
          creditAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          amountMinor: item.paid,
          category: 'FUTURES_FUNDING',
          referenceId: settlementId,
          description: `Trả Funding ${symbol} (${(rateBps / 100).toFixed(2)}%)`,
          timestamp: nowIso,
        });
        this.fundingHistory.push({
          id: `fpay_${crypto.randomBytes(5).toString('hex')}`,
          settlementId,
          symbol,
          playerId: item.pos.playerId,
          positionId: item.pos.id,
          side: item.pos.side,
          notionalMinor: item.notional,
          fundingRateBps: rateBps,
          paymentMinor: -item.paid,
          timestamp: nowIso,
        });
        this.recalculatePositionMetrics(item.pos, contract);
        this.hooks.onPosition?.(item.pos.playerId, { ...item.pos }, symbol);
      }

      for (const alloc of allocations) {
        if (alloc.share <= 0) continue;
        alloc.pos.marginMinor += alloc.share;
        alloc.pos.cumulativeFundingMinor += alloc.share;
        alloc.pos.updatedAt = nowIso;
        totalReceivedMinor += alloc.share;

        const notional = calcFuturesNotionalMinor(
          contract.markPriceInt,
          alloc.pos.qtyInt,
          contract.priceScale,
          contract.contractMultiplier,
        );
        this.ledger.recordEntry({
          transactionId: txId,
          currency: 'CR',
          debitAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          creditAccount: alloc.pos.playerId,
          amountMinor: alloc.share,
          category: 'FUTURES_FUNDING',
          referenceId: settlementId,
          description: `Nhận Funding ${symbol} (${(rateBps / 100).toFixed(2)}%)`,
          timestamp: nowIso,
        });
        this.fundingHistory.push({
          id: `fpay_${crypto.randomBytes(5).toString('hex')}`,
          settlementId,
          symbol,
          playerId: alloc.pos.playerId,
          positionId: alloc.pos.id,
          side: alloc.pos.side,
          notionalMinor: notional,
          fundingRateBps: rateBps,
          paymentMinor: alloc.share,
          timestamp: nowIso,
        });
        this.recalculatePositionMetrics(alloc.pos, contract);
        this.hooks.onPosition?.(alloc.pos.playerId, { ...alloc.pos }, symbol);
      }
      if (this.fundingHistory.length > 1000) {
        this.fundingHistory.splice(0, this.fundingHistory.length - 1000);
      }
    }

    const evt: FuturesFundingSettlementEvent = {
      id: settlementId,
      symbol,
      markPriceInt: contract.markPriceInt,
      indexPriceInt: contract.indexPriceInt,
      fundingRateBps: rateBps,
      totalPaidMinor,
      totalReceivedMinor,
      affectedPositionsCount: payers.length + receivers.length,
      timestamp: nowIso,
    };

    this.fundingSettlements.push(evt);
    if (this.fundingSettlements.length > 200) this.fundingSettlements.shift();
    this.hooks.onFunding?.(evt);
    this.hooks.onQuote?.({ ...contract });

    // Re-check liquidations after funding deductions (funding can push margin below MM!)
    this.runLiquidationCheck(symbol);

    return evt;
  }

  settleDueFunding(nowMs = Date.now()): FuturesFundingSettlementEvent[] {
    const events: FuturesFundingSettlementEvent[] = [];
    for (const c of this.contracts.values()) {
      if (nowMs >= new Date(c.nextFundingAt).getTime()) {
        events.push(this.settleFundingForSymbol(c.symbol, undefined, nowMs));
      }
    }
    return events;
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private recalculatePositionMetrics(pos: FuturesPosition, contract: FuturesContract): void {
    pos.markPriceInt = contract.markPriceInt;
    pos.notionalMinor = calcFuturesNotionalMinor(
      contract.markPriceInt,
      pos.qtyInt,
      contract.priceScale,
      contract.contractMultiplier,
    );
    const tier = resolveRiskTier(pos.notionalMinor);
    pos.maintenanceMarginBps = tier.maintenanceMarginBps;
    pos.maintenanceMarginMinor = calcMaintenanceMarginMinor(pos.notionalMinor, tier.maintenanceMarginBps);
    pos.unrealizedPnlMinor = calcFuturesPnlMinor(
      pos.side,
      pos.entryPriceInt,
      contract.markPriceInt,
      pos.qtyInt,
      contract.priceScale,
      contract.contractMultiplier,
    );

    const { liquidationPriceInt, bankruptcyPriceInt } = calcIsolatedLiquidationPrices({
      side: pos.side,
      entryPriceInt: pos.entryPriceInt,
      qtyInt: pos.qtyInt,
      marginMinor: pos.marginMinor,
      priceScale: contract.priceScale,
      contractMultiplier: contract.contractMultiplier,
      mmrBps: tier.maintenanceMarginBps,
      liqFeeBps: contract.liquidationFeeBps,
    });
    pos.liquidationPriceInt = liquidationPriceInt;
    pos.bankruptcyPriceInt = bankruptcyPriceInt;

    const risk = calcPositionRiskMetrics({
      marginMinor: pos.marginMinor,
      initialMarginMinor: pos.initialMarginMinor,
      unrealizedPnlMinor: pos.unrealizedPnlMinor,
      maintenanceMarginMinor: pos.maintenanceMarginMinor,
      notionalMinor: pos.notionalMinor,
      liqFeeBps: contract.liquidationFeeBps,
    });
    pos.marginRatioPct = risk.marginRatioPct;
    pos.roePct = risk.roePct;
  }

  private recomputeOpenInterest(contract: FuturesContract): void {
    let longQtyInt = 0;
    for (const pos of this.positions.values()) {
      if (pos.symbol === contract.symbol && pos.side === 'LONG' && pos.qtyInt > 0 && pos.status !== 'CLOSED') {
        longQtyInt += pos.qtyInt;
      }
    }
    contract.openInterestQty = fromQtyInt(longQtyInt);
    contract.openInterestNotionalMinor = calcFuturesNotionalMinor(
      contract.markPriceInt,
      longQtyInt,
      contract.priceScale,
      contract.contractMultiplier,
    );
  }

  private getPendingClosingQtyInt(playerId: string, symbol: string, side: FuturesOrderSide): number {
    let sum = 0;
    const book = side === 'BUY' ? this.bids.get(symbol) ?? [] : this.asks.get(symbol) ?? [];
    for (const o of book) {
      if (o.playerId === playerId && o.remainingQtyInt > 0) sum += o.remainingQtyInt;
    }
    return sum;
  }

  private insertRestingOrder(order: FuturesOrder): void {
    const book = order.side === 'BUY' ? this.bids.get(order.symbol)! : this.asks.get(order.symbol)!;
    book.push(order);
    if (order.side === 'BUY') {
      book.sort((a, b) => b.priceInt - a.priceInt || a.createdSeq - b.createdSeq);
    } else {
      book.sort((a, b) => a.priceInt - b.priceInt || a.createdSeq - b.createdSeq);
    }
  }

  private pruneFilledOrders(symbol: string, side: FuturesOrderSide): void {
    const map = side === 'BUY' ? this.bids : this.asks;
    const list = map.get(symbol);
    if (!list) return;
    map.set(
      symbol,
      list.filter((o) => o.remainingQtyInt > 0 && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')),
    );
  }

  private createLinkedConditionalOrder(params: {
    parentOrder: FuturesOrder;
    contract: FuturesContract;
    side: FuturesOrderSide;
    type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
    triggerPriceInt: number;
    qtyInt: number;
  }): FuturesOrder {
    const nowIso = new Date().toISOString();
    this.orderSeq += 1;
    const triggerDirection: 'ABOVE' | 'BELOW' =
      params.type === 'STOP_MARKET'
        ? params.side === 'BUY'
          ? 'ABOVE'
          : 'BELOW'
        : params.side === 'BUY'
          ? 'BELOW'
          : 'ABOVE';

    const ord: FuturesOrder = {
      id: `ford_${this.orderSeq}_${crypto.randomBytes(4).toString('hex')}`,
      worldId: this.worldId,
      playerId: params.parentOrder.playerId,
      playerName: params.parentOrder.playerName,
      symbol: params.contract.symbol,
      side: params.side,
      type: params.type,
      timeInForce: 'IOC',
      marginMode: 'ISOLATED',
      leverage: params.parentOrder.leverage,
      priceInt: 0,
      triggerPriceInt: params.triggerPriceInt,
      triggerSource: 'MARK_PRICE',
      triggerDirection,
      quantity: fromQtyInt(params.qtyInt),
      qtyInt: params.qtyInt,
      filledQuantity: 0,
      filledQtyInt: 0,
      remainingQuantity: fromQtyInt(params.qtyInt),
      remainingQtyInt: params.qtyInt,
      avgExecutionPriceInt: 0,
      reduceOnly: true,
      postOnly: false,
      isLiquidationOrder: false,
      lockedMarginMinor: 0,
      lockedFeeReserveMinor: 0,
      feesPaidMinor: 0,
      realizedPnlMinor: 0,
      attachedStopLossInt: null,
      attachedTakeProfitInt: null,
      parentOrderId: params.parentOrder.id,
      status: 'PENDING_TRIGGER',
      rejectReason: null,
      expiresAt: null,
      version: 1,
      createdSeq: this.orderSeq,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.ordersById.set(ord.id, ord);
    this.conditionalOrders.get(params.contract.symbol)!.push(ord);
    const snap = { ...ord };
    this.hooks.onOrder?.(snap, 'created');
    return snap;
  }

  private cancelReduceOnlyConditionals(playerId: string, symbol: string): void {
    const conds = this.conditionalOrders.get(symbol);
    if (!conds) return;
    const kept: FuturesOrder[] = [];
    for (const c of conds) {
      if (c.playerId === playerId && c.reduceOnly && c.status === 'PENDING_TRIGGER') {
        c.status = 'CANCELLED';
        c.remainingQtyInt = 0;
        c.remainingQuantity = 0;
        c.version = (c.version ?? 0) + 1;
        c.updatedAt = new Date().toISOString();
        this.hooks.onOrder?.({ ...c }, 'cancelled');
      } else {
        kept.push(c);
      }
    }
    this.conditionalOrders.set(symbol, kept);
  }

  /**
   * Side-effect-free Futures Order Preview & Risk Simulation (+1%, -1%, +5%, -5%).
   * Supports specifying either `marginCR` (Beginner Mode) or `quantity` (Pro Mode),
   * using the exact same BigInt margin, risk-tier, fee, and isolated liquidation math as `placeOrder()`.
   */
  public previewOrder(params: {
    playerId: string;
    symbol: string;
    side: FuturesOrderSide;
    type: 'MARKET' | 'LIMIT';
    leverage: number;
    marginCR?: number;
    quantity?: number;
    priceCR?: number;
    maxSlippageBps?: number;
  }): FuturesPreviewResponse {
    const contract = this.contracts.get(params.symbol);
    if (!contract) {
      throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
    }

    const wallet = this.ledger.requireWallet(params.playerId);
    const availableCRBeforeMinor = wallet.availableMinor;
    const positionSide: FuturesPositionSide = params.side === 'BUY' ? 'LONG' : 'SHORT';
    const leverage = Math.max(1, Math.round(params.leverage || 1));

    const book = this.getOrderBook(contract.symbol, 25);
    const oppositeBook = (params.side === 'BUY' ? this.asks.get(contract.symbol) : this.bids.get(contract.symbol)) ?? [];
    const matchableOpposite = oppositeBook.filter((o) => isFuturesOrderOpen(o) && o.playerId !== params.playerId);

    let blockingCode: ErrorCode | null = null;
    let blockingMessage: string | null = null;

    if (contract.status === 'EMERGENCY_HALTED') {
      blockingCode = 'FUTURES_EMERGENCY_HALTED';
      blockingMessage = ERROR_MESSAGES_VI.FUTURES_EMERGENCY_HALTED;
    } else if (contract.status === 'DEGRADED') {
      blockingCode = 'FUTURES_MARKET_DEGRADED';
      blockingMessage = ERROR_MESSAGES_VI.FUTURES_MARKET_DEGRADED;
    }

    if (!(FUTURES_ALLOWED_LEVERAGES as readonly number[]).includes(leverage) || leverage > contract.maxLeverage) {
      blockingCode = blockingCode ?? 'FUTURES_LEVERAGE_EXCEEDED';
      blockingMessage =
        blockingMessage ?? `Đòn bẩy cho phép cho ${contract.symbol} là ${FUTURES_ALLOWED_LEVERAGES.filter((l) => l <= contract.maxLeverage).join('x, ')}x.`;
    }

    let expectedEntryPriceInt =
      params.side === 'BUY'
        ? (book.bestAskInt ?? contract.markPriceInt)
        : (book.bestBidInt ?? contract.markPriceInt);

    if (params.type === 'LIMIT') {
      if (params.priceCR === undefined || !Number.isFinite(params.priceCR) || params.priceCR <= 0) {
        blockingCode = blockingCode ?? 'INVALID_PRICE';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INVALID_PRICE;
      } else {
        const limitInt = toPriceInt(params.priceCR, contract.priceScale);
        if (limitInt <= 0 || limitInt % contract.priceTickInt !== 0) {
          blockingCode = blockingCode ?? 'INVALID_PRICE';
          blockingMessage =
            blockingMessage ??
            `Giá đặt phải là bội số của bước giá ${(contract.priceTickInt / contract.priceScale).toFixed(contract.priceDecimals)} CR.`;
        } else {
          expectedEntryPriceInt = limitInt;
        }
      }
    }

    const snapQtyIntDown = (rawQtyInt: number): number => {
      if (!Number.isFinite(rawQtyInt) || rawQtyInt <= 0) return 0;
      return Math.floor(rawQtyInt / contract.qtyStepInt) * contract.qtyStepInt;
    };

    let qtyInt = 0;
    if (params.quantity !== undefined && Number.isFinite(params.quantity) && params.quantity > 0) {
      qtyInt = toQtyInt(params.quantity);
    } else if (params.marginCR !== undefined && Number.isFinite(params.marginCR) && params.marginCR > 0 && expectedEntryPriceInt > 0) {
      const targetMarginMinor = toMinor(params.marginCR);
      const targetNotionalMinor = targetMarginMinor * leverage;
      const rawQty =
        (targetNotionalMinor / 100) /
        ((expectedEntryPriceInt / contract.priceScale) * contract.contractMultiplier);
      qtyInt = snapQtyIntDown(toQtyInt(rawQty));
      // Ensure initialMarginMinor <= targetMarginMinor
      let guard = 0;
      while (qtyInt >= contract.qtyStepInt && guard < 100) {
        const n = calcFuturesNotionalMinor(expectedEntryPriceInt, qtyInt, contract.priceScale, contract.contractMultiplier);
        if (calcInitialMarginMinor(n, leverage) <= targetMarginMinor) break;
        qtyInt -= contract.qtyStepInt;
        guard++;
      }
    }

    if (qtyInt < contract.minQtyInt) {
      blockingCode = blockingCode ?? 'INVALID_ORDER';
      blockingMessage =
        blockingMessage ??
        `Ký quỹ hoặc khối lượng chưa đạt mức tối thiểu ${contract.minQty} hợp đồng cho ${contract.symbol}.`;
    } else if (qtyInt > contract.maxOrderQtyInt) {
      blockingCode = blockingCode ?? 'INVALID_ORDER';
      blockingMessage =
        blockingMessage ?? `Khối lượng vượt quá giới hạn tối đa ${contract.maxOrderQty} hợp đồng mỗi lệnh.`;
    } else if (qtyInt % contract.qtyStepInt !== 0) {
      blockingCode = blockingCode ?? 'INVALID_ORDER';
      blockingMessage = blockingMessage ?? `Khối lượng phải là bội số của bước ${contract.qtyStep}.`;
    }

    // Refine expected fill price against live opposite order book for MARKET orders
    let fillableQtyInt = qtyInt;
    if (params.type === 'MARKET' && qtyInt > 0) {
      if (matchableOpposite.length === 0) {
        blockingCode = blockingCode ?? 'INSUFFICIENT_LIQUIDITY';
        blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INSUFFICIENT_LIQUIDITY;
        fillableQtyInt = 0;
      } else {
        let rem = qtyInt;
        let weightedPrice = 0;
        let filled = 0;
        for (const opp of matchableOpposite) {
          if (rem <= 0) break;
          const take = Math.min(rem, opp.remainingQtyInt);
          filled += take;
          weightedPrice += opp.priceInt * take;
          rem -= take;
        }
        fillableQtyInt = filled;
        if (filled > 0) {
          expectedEntryPriceInt = Math.round(weightedPrice / filled);
        }
      }
    }

    const positionNotionalMinor =
      qtyInt > 0
        ? calcFuturesNotionalMinor(expectedEntryPriceInt, qtyInt, contract.priceScale, contract.contractMultiplier)
        : 0;
    const tier = resolveRiskTier(positionNotionalMinor);
    const maxAllowedLeverage = Math.min(contract.maxLeverage, tier.maxLeverage);
    if (leverage > maxAllowedLeverage) {
      blockingCode = blockingCode ?? 'FUTURES_LEVERAGE_EXCEEDED';
      blockingMessage =
        blockingMessage ?? `Quy mô vị thế này thuộc Tầng ${tier.tier}, tối đa ${maxAllowedLeverage}x.`;
    }

    const initialMarginMinor = calcInitialMarginMinor(positionNotionalMinor, leverage);
    const maintenanceMarginMinor = calcMaintenanceMarginMinor(positionNotionalMinor, tier.maintenanceMarginBps);
    const feeBps = params.type === 'MARKET' ? contract.takerFeeBps : contract.makerFeeBps;
    const estimatedFeeMinor = calcFuturesFeeMinor(positionNotionalMinor, feeBps, positionNotionalMinor > 0);
    const totalRequiredCRMinor = initialMarginMinor + estimatedFeeMinor;

    if (availableCRBeforeMinor < totalRequiredCRMinor) {
      blockingCode = blockingCode ?? 'INSUFFICIENT_FUNDS';
      blockingMessage = blockingMessage ?? ERROR_MESSAGES_VI.INSUFFICIENT_FUNDS;
    }

    const { liquidationPriceInt, bankruptcyPriceInt } = calcIsolatedLiquidationPrices({
      side: positionSide,
      entryPriceInt: expectedEntryPriceInt,
      qtyInt,
      marginMinor: initialMarginMinor,
      priceScale: contract.priceScale,
      contractMultiplier: contract.contractMultiplier,
      mmrBps: tier.maintenanceMarginBps,
      liqFeeBps: contract.liquidationFeeBps,
    });

    const liquidationDistancePct =
      expectedEntryPriceInt > 0 && liquidationPriceInt > 0
        ? Number(((Math.abs(expectedEntryPriceInt - liquidationPriceInt) / expectedEntryPriceInt) * 100).toFixed(2))
        : 0;

    const scenarios =
      qtyInt > 0 && initialMarginMinor > 0
        ? calculateFuturesRiskScenarios({
            side: positionSide,
            entryPriceInt: expectedEntryPriceInt,
            qtyInt,
            initialMarginMinor,
            liquidationPriceInt,
            priceScale: contract.priceScale,
            contractMultiplier: contract.contractMultiplier,
            movesPct: [1, -1, 5, -5],
          })
        : [];

    const lowLiquidityWarning =
      (params.type === 'MARKET' && fillableQtyInt < qtyInt) ||
      (book.spreadPct !== null && book.spreadPct >= 1.2);

    return {
      symbol: contract.symbol,
      contractName: contract.name,
      side: params.side,
      positionSide,
      type: params.type,
      marginMode: 'ISOLATED',
      leverage,
      maxAllowedLeverage,
      priceScale: contract.priceScale,
      priceDecimals: contract.priceDecimals,
      estimatedQuantity: fromQtyInt(qtyInt),
      expectedEntryPriceInt,
      markPriceInt: contract.markPriceInt,
      positionNotionalMinor,
      initialMarginMinor,
      maintenanceMarginMinor,
      estimatedFeeMinor,
      totalRequiredCRMinor,
      availableCRBeforeMinor,
      remainingCRMinor: Math.max(0, availableCRBeforeMinor - totalRequiredCRMinor),
      liquidationPriceInt,
      bankruptcyPriceInt,
      liquidationDistancePct,
      riskTier: tier.tier,
      lowLiquidityWarning,
      contractStatus: contract.status,
      canExecute: blockingCode === null && qtyInt >= contract.minQtyInt && (params.type === 'LIMIT' || fillableQtyInt > 0),
      blockingCode,
      blockingMessage,
      scenarios,
      disclaimerVi:
        'Bảng mô phỏng chỉ nhằm minh họa mức độ nhạy cảm với biến động giá, KHÔNG phải dự đoán giá. Nếu giá chạm mức thanh lý, vị thế có thể bị đóng cưỡng bức và mất phần ký quỹ.',
    };
  }

  /**
   * Cancels all open/conditional Futures orders and closes/clears open positions for a player
   * STRICTLY inside WORLD-PRACTICE so the player can reset cleanly to 100,000 CR.
   */
  public resetPlayerPracticeState(playerId: string): void {
    if (this.worldId !== 'WORLD-PRACTICE') {
      throw new DomainError('FORBIDDEN_IN_PRODUCTION', 'Chỉ hỗ trợ đặt lại tài khoản trong Phòng Luyện Tập.', 403);
    }
    // 1. Cancel all open and conditional orders
    const openOrders = this.listPlayerOpenOrders(playerId);
    for (const ord of openOrders) {
      try {
        this.cancelOrder(ord.id, playerId);
      } catch {
        // Ignore already closed/cancelled
      }
    }
    // 2. Release any open isolated positions cleanly back to the practice player wallet
    for (const pos of this.listPlayerPositions(playerId)) {
      if (pos.marginMinor > 0) {
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL,
          toAccount: playerId,
          amountMinor: pos.marginMinor,
          category: 'FUTURES_MARGIN_RELEASE',
          referenceId: pos.id,
          description: `Giải phóng ký quỹ Futures khi đặt lại Phòng Luyện Tập (${pos.symbol})`,
        });
      }
      pos.quantity = 0;
      pos.qtyInt = 0;
      pos.marginMinor = 0;
      pos.initialMarginMinor = 0;
      pos.unrealizedPnlMinor = 0;
      pos.status = 'CLOSED';
      pos.updatedAt = new Date().toISOString();
      this.positions.delete(`${playerId}:${pos.symbol}`);
      this.hooks.onPosition?.(playerId, null, pos.symbol);
    }
  }
}

