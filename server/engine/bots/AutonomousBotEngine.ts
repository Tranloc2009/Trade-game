import { performance } from 'node:perf_hooks';
import type {
  BotAdaptiveProfile,
  BotAgentConfig,
  BotAgentTelemetry,
  BotArchetype,
  BotEcosystemOverview,
  BotEnginePerformanceMetrics,
  BotLifecycleStatus,
  BotTradeRecord,
  MarketSignalSnapshot,
} from '../../../shared/contracts/bots';
import {
  fromPriceInt,
  fromQtyInt,
  type FuturesContract,
  type FuturesLeverage,
  type FuturesOrderSide,
  type FuturesTrade,
} from '../../../shared/contracts/futures';
import { fromMinor, toMinor } from '../../../shared/contracts/money';
import type { Asset, EconomyState, NewsItem, Trade } from '../../../shared/contracts/types';
import { FuturesEngine } from '../futures/FuturesEngine';
import { LedgerService } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';
import { AdaptiveSignalEngine, isMemeCoinSymbol } from './AdaptiveSignalEngine';
import { ALL_BOT_ARCHETYPES, buildAgentRoster } from './AgentRegistry';
import { SeededRng } from './SeededRng';

interface AgentRuntimeState {
  config: BotAgentConfig;
  rng: SeededRng;
  status: BotLifecycleStatus;
  initialCapitalMinor: number;
  peakEquityMinor: number;
  currentDrawdownPct: number;
  lastActiveAtMs: number;
  cooldownUntilMs: number;
  ordersSubmitted: number;
  ordersFilled: number;
  ordersRejected: number;
  duplicateOrdersBlocked: number;
  washTradesBlocked: number;
  tradesCount: number;
  winningTrades: number;
  liquidationsCount: number;
  whalePhase: 'ACCUMULATE' | 'DISTRIBUTE';
  whaleCycleCounter: number;
  adaptiveProfile: BotAdaptiveProfile;
  lastActionNote: string;
  lastDecisionReason: string;
  recentTrades: BotTradeRecord[];
}

export interface BotTickOptions {
  targetSymbol?: string;
  forceAllAgents?: boolean;
  includeNova?: boolean;
  maxAgentsPerTick?: number;
  nowMs?: number;
}

export interface BotTickResult {
  spotTrades: Trade[];
  futuresTrades: FuturesTrade[];
  affectedSpotSymbols: string[];
  affectedFuturesSymbols: string[];
  agentsEvaluated: number;
  ordersSubmitted: number;
  tickDurationMs: number;
  cpuBudgetExceeded: boolean;
}

const DEFAULT_ADAPTIVE_PROFILE: BotAdaptiveProfile = {
  volatilityScalar: 1.0,
  spreadMultiplier: 1.0,
  sizeScalar: 1.0,
  effectiveMaxLeverage: 3,
  liquidityWithdrawalActive: false,
  sentimentBias: 0,
};

function alignToTick(priceMinor: number, tickMinor: number, mode: 'floor' | 'ceil' | 'round' = 'round'): number {
  const ratio = priceMinor / tickMinor;
  const ticks = mode === 'floor' ? Math.floor(ratio) : mode === 'ceil' ? Math.ceil(ratio) : Math.round(ratio);
  return Math.max(tickMinor, ticks * tickMinor);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(3));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Number((sum / values.length).toFixed(3));
}

function snapFuturesLeverage(raw: number, cap: BotAgentConfig['maxLeverage']): FuturesLeverage {
  const allowed: FuturesLeverage[] = [1, 2, 3, 5, 10];
  const target = Math.min(cap, Math.max(1, Math.round(raw)));
  let best: FuturesLeverage = 1;
  for (const lev of allowed) {
    if (lev <= target) best = lev;
  }
  return best;
}

/**
 * TRADING EMPIRE — AUTONOMOUS AI TRADING ECOSYSTEM V2
 *
 * Server-authoritative, 24/7 quantitative multi-agent market simulation:
 * - 8 distinct trading archetypes with finite CR wallets & asset inventory.
 * - Zero direct price manipulation (prices emerge strictly from matched orders).
 * - Zero privileged liquidation immunity or infinite capital.
 * - Strictly reads public market data only (never inspects private human player order intent).
 * - Deterministic seeded PRNG, CPU-budgeted scheduler, duplicate & wash-trade guards, and full telemetry.
 */
export class AutonomousBotEngine {
  private readonly ledger: LedgerService;
  private readonly matching: MatchingEngine;
  private readonly futures: FuturesEngine;
  public readonly signals: AdaptiveSignalEngine;

  private seed: number;
  private configuredAgentCount: number;
  private cpuBudgetMsPerTick: number;
  private roster: BotAgentConfig[] = [];
  private agents = new Map<string, AgentRuntimeState>();
  private roundRobinCursor = 0;

  // Duplicate order guard window (fingerprint -> expiryMs)
  private recentOrderFingerprints = new Map<string, number>();

  // Publicly observable whale flow bias per symbol (-1..+1) derived solely from executed whale orders
  private whaleNetFlowBySymbol = new Map<string, number>();

  // Performance & latency telemetry ring buffers
  private ticksExecuted = 0;
  private totalOrdersSubmitted = 0;
  private totalOrdersFilled = 0;
  private totalTradesParticipated = 0;
  private totalDuplicateBlocked = 0;
  private totalWashTradeBlocked = 0;
  private cpuBudgetExceededCount = 0;
  private tickDurationsMs: number[] = [];
  private orderMatchLatenciesMs: number[] = [];
  private lastTickAt: string | null = null;
  private startedAtMs = Date.now();

  constructor(
    ledger: LedgerService,
    matching: MatchingEngine,
    futures: FuturesEngine,
    options?: {
      agentCount?: number;
      seed?: number;
      cpuBudgetMsPerTick?: number;
    },
  ) {
    this.ledger = ledger;
    this.matching = matching;
    this.futures = futures;
    this.signals = new AdaptiveSignalEngine();
    this.configuredAgentCount = options?.agentCount ?? 24;
    this.seed = options?.seed ?? 20261123;
    this.cpuBudgetMsPerTick = options?.cpuBudgetMsPerTick ?? 25;
    this.rebuildRoster();
  }

  public configure(options: { agentCount?: number; seed?: number; cpuBudgetMsPerTick?: number }): void {
    if (typeof options.agentCount === 'number' && Number.isFinite(options.agentCount)) {
      this.configuredAgentCount = Math.max(8, Math.min(200, Math.floor(options.agentCount)));
    }
    if (typeof options.seed === 'number' && Number.isFinite(options.seed)) {
      this.seed = Math.floor(options.seed);
    }
    if (typeof options.cpuBudgetMsPerTick === 'number' && Number.isFinite(options.cpuBudgetMsPerTick)) {
      this.cpuBudgetMsPerTick = Math.max(2, Math.min(250, options.cpuBudgetMsPerTick));
    }
  }

  public getConfiguredAgentCount(): number {
    return this.configuredAgentCount;
  }

  public getSeed(): number {
    return this.seed;
  }

  public listAgentConfigs(): BotAgentConfig[] {
    return this.roster.map((c) => ({ ...c }));
  }

  public reset(options?: { agentCount?: number; seed?: number; cpuBudgetMsPerTick?: number }): void {
    if (options) this.configure(options);
    this.signals.reset();
    this.recentOrderFingerprints.clear();
    this.whaleNetFlowBySymbol.clear();
    this.roundRobinCursor = 0;
    this.ticksExecuted = 0;
    this.totalOrdersSubmitted = 0;
    this.totalOrdersFilled = 0;
    this.totalTradesParticipated = 0;
    this.totalDuplicateBlocked = 0;
    this.totalWashTradeBlocked = 0;
    this.cpuBudgetExceededCount = 0;
    this.tickDurationsMs = [];
    this.orderMatchLatenciesMs = [];
    this.lastTickAt = null;
    this.startedAtMs = Date.now();
    this.rebuildRoster();
  }

  private rebuildRoster(): void {
    this.roster = buildAgentRoster(this.configuredAgentCount, this.seed);
    this.agents.clear();
    const masterRng = new SeededRng(this.seed);

    for (const config of this.roster) {
      const initialMinor = toMinor(config.initialCapitalCR);
      this.agents.set(config.id, {
        config,
        rng: masterRng.fork(config.id),
        status: 'ACTIVE',
        initialCapitalMinor: initialMinor,
        peakEquityMinor: initialMinor,
        currentDrawdownPct: 0,
        lastActiveAtMs: 0,
        cooldownUntilMs: 0,
        ordersSubmitted: 0,
        ordersFilled: 0,
        ordersRejected: 0,
        duplicateOrdersBlocked: 0,
        washTradesBlocked: 0,
        tradesCount: 0,
        winningTrades: 0,
        liquidationsCount: 0,
        whalePhase: config.biasSeed % 2 === 0 ? 'ACCUMULATE' : 'DISTRIBUTE',
        whaleCycleCounter: 0,
        adaptiveProfile: {
          ...DEFAULT_ADAPTIVE_PROFILE,
          effectiveMaxLeverage: config.maxLeverage,
        },
        lastActionNote: 'Khởi tạo quỹ AI với vốn hữu hạn trên máy chủ authoritative',
        lastDecisionReason: 'INIT',
        recentTrades: [],
      });
    }
  }

  /**
   * Allocates transparent, finite CR wallets and finite Spot inventory to all autonomous agents.
   * Registers risk disclosure with FuturesEngine via the exact same API as human traders.
   */
  public fundAgents(assets: Asset[]): void {
    const spotAssets = assets.filter((a) => a.marketClass !== 'FOREX');

    for (const runtime of this.agents.values()) {
      const { config } = runtime;
      if (!this.ledger.wallets.getWallet(config.id)) {
        this.ledger.createWallet(
          config.id,
          toMinor(config.initialCapitalCR),
          `Cấp vốn hữu hạn cho ${config.username} [${config.archetype}]`,
        );
      }

      if (config.marketScope === 'FUTURES' || config.marketScope === 'BOTH') {
        this.futures.acknowledgeRisk(config.id);
      }

      // Grant bounded initial inventory ONLY to Spot-active agents (strictly finite)
      if (config.marketScope !== 'FUTURES') {
        for (const asset of spotAssets) {
          const isPreferred = config.preferredSymbols.includes(asset.symbol);
          if (!isPreferred && config.archetype !== 'MARKET_MAKER') continue;

          const targetInventoryCR = this.computeInitialInventoryBudgetCR(config, asset);
          if (targetInventoryCR <= 0 || asset.referencePriceMinor <= 0) continue;

          const rawQty = targetInventoryCR / fromMinor(asset.referencePriceMinor);
          const qty = this.roundToStep(rawQty, asset.qtyStep);
          if (qty >= asset.minQty) {
            this.ledger.grantInitialAsset(
              config.id,
              asset.symbol,
              asset.marketClass,
              qty,
              asset.referencePriceMinor,
            );
          }
        }
      }

      // Snapshot true initial total equity (cash + initial spot inventory) as peak equity baseline
      const initialEquity = this.computeAgentEquityMinor(config.id);
      runtime.initialCapitalMinor = initialEquity;
      runtime.peakEquityMinor = initialEquity;
    }
  }

  private computeInitialInventoryBudgetCR(config: BotAgentConfig, asset: Asset): number {
    const isMeme = isMemeCoinSymbol(asset.symbol);
    switch (config.archetype) {
      case 'MARKET_MAKER':
        return isMeme ? 180_000 : 350_000;
      case 'WHALE_TRADER':
        return isMeme ? 140_000 : 280_000;
      case 'INSTITUTIONAL_FUND':
        return asset.marketClass === 'STOCK' ? 220_000 : 120_000;
      case 'MEME_SPECULATOR':
        return isMeme ? 65_000 : 20_000;
      case 'MOMENTUM_TRADER':
      case 'CONTRARIAN_TRADER':
      case 'NEWS_TRADER':
        return isMeme ? 35_000 : 80_000;
      default:
        return 0;
    }
  }

  /**
   * Seeds initial two-sided resting quotes for Meme Coins & Spot/Futures books from AI Market Makers
   * through real MatchingEngine/FuturesEngine limit orders.
   */
  public seedInitialLiquidity(economy: EconomyState): void {
    const mmAgents = Array.from(this.agents.values()).filter((a) => a.config.archetype === 'MARKET_MAKER');
    const spotAssets = this.matching.listAssets().filter((a) => a.status === 'OPEN' && a.marketClass !== 'FOREX');

    for (const asset of spotAssets) {
      // Keep NOVA untouched on initial boot to preserve Section 32 manual acceptance spread
      if (asset.symbol === 'NOVA') continue;
      for (const mm of mmAgents.slice(0, 2)) {
        this.quoteSpotMarketMaker(mm, asset, economy, null);
      }
    }

    const perpContracts = this.futures.listContracts().filter((c) => c.status === 'OPEN');
    for (const contract of perpContracts) {
      const book = this.futures.getOrderBook(contract.symbol, 1);
      if (book.bids.length > 0 && book.asks.length > 0) continue;
      for (const mm of mmAgents.slice(0, 2)) {
        this.quoteFuturesMarketMaker(mm, contract, null);
      }
    }
  }

  /**
   * Notifies the ecosystem whenever a Futures liquidation occurs so affected AI bots
   * update their real liquidation counters & lifecycle status immediately.
   */
  public onFuturesLiquidation(playerId: string, symbol: string): void {
    const runtime = this.agents.get(playerId);
    if (!runtime) return;

    runtime.liquidationsCount += 1;
    const equity = this.computeAgentEquityMinor(playerId);
    runtime.lastActionNote = `Bị thanh lý cưỡng bức vị thế ${symbol} (không miễn nhiễm rủi ro)`;
    runtime.lastDecisionReason = 'LIQUIDATED_BY_ENGINE';

    if (equity < toMinor(100)) {
      runtime.status = 'INSOLVENT';
    } else {
      runtime.status = 'LIQUIDATED';
      runtime.cooldownUntilMs = Date.now() + Math.max(15_000, runtime.config.tradingFrequencyMs * 3);
    }
  }

  /**
   * Executes one CPU-budgeted autonomous trading tick across the agent ecosystem.
   * Works 24/7 regardless of whether any human browsers are connected.
   */
  public runTick(
    economy: EconomyState,
    recentNews: NewsItem[],
    options: BotTickOptions = {},
  ): BotTickResult {
    const startPerf = performance.now();
    const nowMs = options.nowMs ?? Date.now();
    this.ticksExecuted += 1;
    this.lastTickAt = new Date(nowMs).toISOString();
    this.pruneExpiredFingerprints(nowMs);

    const spotTrades: Trade[] = [];
    const futuresTrades: FuturesTrade[] = [];
    const affectedSpot = new Set<string>();
    const affectedFutures = new Set<string>();
    let agentsEvaluated = 0;
    let tickOrdersSubmitted = 0;
    let cpuBudgetExceeded = false;

    const spotAssets = this.matching.listAssets().filter((a) => a.status === 'OPEN' && a.marketClass !== 'FOREX');
    const futuresContracts = this.futures.listContracts().filter((c) => c.status === 'OPEN');
    const recentLiqs = this.futures.listRecentLiquidations(80);

    // Precompute public MarketSignalSnapshots once per symbol for O(M) efficiency
    const signalBySymbol = new Map<string, MarketSignalSnapshot>();
    const futuresByUnderlying = new Map<string, FuturesContract>();
    for (const c of futuresContracts) {
      futuresByUnderlying.set(c.underlyingSpotSymbol, c);
    }
    for (const asset of spotAssets) {
      const book = this.matching.getOrderBook(asset.symbol, 8);
      const linkedFutures = futuresByUnderlying.get(asset.symbol) ?? null;
      const whaleBias = this.whaleNetFlowBySymbol.get(asset.symbol) ?? 0;
      const sig = this.signals.computeMarketSignal({
        asset,
        orderBook: book,
        economy,
        recentNews,
        linkedFutures,
        recentLiquidations: recentLiqs,
        whaleNetFlowBias: whaleBias,
        nowMs,
      });
      signalBySymbol.set(asset.symbol, sig);
      // Natural mean decay of observable whale flow trace
      if (Math.abs(whaleBias) > 0.01) {
        this.whaleNetFlowBySymbol.set(asset.symbol, Number((whaleBias * 0.88).toFixed(3)));
      }
    }

    // Round-robin scheduling across all configured agents with strict CPU budget enforcement
    const orderedAgents = this.roster;
    const totalAgents = orderedAgents.length;
    const defaultBatch = Math.min(totalAgents, Math.max(8, Math.ceil(totalAgents * 0.65)));
    const maxBatch = options.forceAllAgents
      ? totalAgents
      : options.maxAgentsPerTick && options.maxAgentsPerTick > 0
        ? Math.min(totalAgents, Math.floor(options.maxAgentsPerTick))
        : defaultBatch;

    for (let step = 0; step < maxBatch; step++) {
      if (!options.forceAllAgents && step > 0 && performance.now() - startPerf >= this.cpuBudgetMsPerTick) {
        cpuBudgetExceeded = true;
        this.cpuBudgetExceededCount += 1;
        break;
      }

      const idx = (this.roundRobinCursor + step) % totalAgents;
      const runtime = this.agents.get(orderedAgents[idx].id);
      if (!runtime) continue;

      // Refresh equity, drawdown, insolvency, and cooldown lifecycle
      this.evaluateLifecycleStatus(runtime, nowMs);
      if (
        runtime.status === 'PAUSED_DRAWDOWN' ||
        runtime.status === 'INSOLVENT' ||
        runtime.status === 'DISABLED'
      ) {
        continue;
      }

      if (!options.forceAllAgents) {
        if (runtime.status === 'COOLDOWN' && nowMs < runtime.cooldownUntilMs) continue;
        if (nowMs - runtime.lastActiveAtMs < runtime.config.tradingFrequencyMs) continue;
      }

      agentsEvaluated += 1;
      runtime.lastActiveAtMs = nowMs;
      if (runtime.status === 'LIQUIDATED' && nowMs >= runtime.cooldownUntilMs) {
        runtime.status = 'ACTIVE';
      }

      const execRes = this.executeAgentStep(runtime, {
        economy,
        spotAssets,
        futuresContracts,
        signalBySymbol,
        targetSymbol: options.targetSymbol,
        includeNova: options.includeNova ?? Boolean(options.targetSymbol === 'NOVA'),
        nowMs,
      });

      tickOrdersSubmitted += execRes.ordersSubmitted;
      for (const t of execRes.spotTrades) spotTrades.push(t);
      for (const t of execRes.futuresTrades) futuresTrades.push(t);
      for (const s of execRes.affectedSpot) affectedSpot.add(s);
      for (const s of execRes.affectedFutures) affectedFutures.add(s);
    }

    this.roundRobinCursor = (this.roundRobinCursor + Math.max(1, agentsEvaluated)) % Math.max(1, totalAgents);

    const tickDurationMs = Number((performance.now() - startPerf).toFixed(3));
    this.tickDurationsMs.push(tickDurationMs);
    if (this.tickDurationsMs.length > 200) this.tickDurationsMs.shift();

    return {
      spotTrades,
      futuresTrades,
      affectedSpotSymbols: Array.from(affectedSpot),
      affectedFuturesSymbols: Array.from(affectedFutures),
      agentsEvaluated,
      ordersSubmitted: tickOrdersSubmitted,
      tickDurationMs,
      cpuBudgetExceeded,
    };
  }

  /**
   * Dedicated News Reaction entry point: triggers News Traders, Institutional Funds,
   * and Meme Speculators proportionally to their `newsSensitivity` when public news hits.
   */
  public reactToNews(
    news: NewsItem,
    economy: EconomyState,
    nowMs = Date.now(),
  ): { spotTrades: Trade[]; futuresTrades: FuturesTrade[]; affectedSpotSymbols: string[]; affectedFuturesSymbols: string[] } {
    const spotTrades: Trade[] = [];
    const futuresTrades: FuturesTrade[] = [];
    const affectedSpot = new Set<string>();
    const affectedFutures = new Set<string>();

    if (news.sentiment === 'NEUTRAL') {
      return { spotTrades, futuresTrades, affectedSpotSymbols: [], affectedFuturesSymbols: [] };
    }

    const spotAssets = this.matching.listAssets().filter((a) => {
      if (a.status !== 'OPEN' || a.marketClass === 'FOREX') return false;
      if (a.symbol === 'NOVA' && !news.relatedSymbols.includes('NOVA')) return false;
      if (news.relatedSymbols.includes(a.symbol)) return true;
      if (news.category === 'CRYPTO' && a.marketClass === 'CRYPTO') return true;
      if ((news.category === 'CORPORATE' || news.category === 'MARKET') && a.marketClass === 'STOCK') return true;
      if (news.category === 'MACRO') return true;
      return false;
    });

    const futuresContracts = this.futures.listContracts().filter((c) => {
      if (c.status !== 'OPEN') return false;
      if (news.relatedSymbols.includes(c.underlyingSpotSymbol)) return true;
      if (news.category === 'CRYPTO' && c.underlyingMarketClass === 'CRYPTO') return true;
      if (news.category === 'MACRO') return true;
      return false;
    });

    const reactiveAgents = Array.from(this.agents.values()).filter(
      (r) =>
        r.status === 'ACTIVE' &&
        (r.config.archetype === 'NEWS_TRADER' ||
          r.config.archetype === 'INSTITUTIONAL_FUND' ||
          r.config.archetype === 'MEME_SPECULATOR' ||
          r.config.archetype === 'CONTRARIAN_TRADER'),
    );

    const baseSide: 'BUY' | 'SELL' = news.sentiment === 'POSITIVE' ? 'BUY' : 'SELL';

    for (const runtime of reactiveAgents) {
      this.evaluateLifecycleStatus(runtime, nowMs);
      if (runtime.status !== 'ACTIVE') continue;

      // Heterogeneous reaction: not every agent reacts to every headline; Contrarians may fade overreactions
      if (!runtime.rng.chance(runtime.config.newsSensitivity)) continue;

      const side: 'BUY' | 'SELL' =
        runtime.config.archetype === 'CONTRARIAN_TRADER' && runtime.rng.chance(0.65)
          ? baseSide === 'BUY'
            ? 'SELL'
            : 'BUY'
          : baseSide;

      // Spot reaction
      if (runtime.config.marketScope !== 'FUTURES' && spotAssets.length > 0) {
        const preferred = spotAssets.filter((a) => runtime.config.preferredSymbols.includes(a.symbol));
        const target = preferred.length > 0 ? runtime.rng.pick(preferred) : runtime.rng.pick(spotAssets);
        const res = this.submitSpotCrossingOrder(runtime, target, side, 0.75 + runtime.config.newsSensitivity * 0.6, nowMs);
        if (res.trades.length > 0) {
          spotTrades.push(...res.trades);
          affectedSpot.add(target.symbol);
          runtime.lastActionNote = `Phản ứng tin [${news.category}/${news.sentiment}]: ${side} ${target.symbol}`;
          runtime.lastDecisionReason = `NEWS_${news.sentiment}`;
        }
      }

      // Futures reaction for derivatives-active news/macro bots
      if (runtime.config.marketScope !== 'SPOT' && futuresContracts.length > 0 && runtime.rng.chance(0.6)) {
        const contract = runtime.rng.pick(futuresContracts);
        const fRes = this.submitFuturesDirectionalOrder(runtime, contract, side, economy, null, nowMs);
        if (fRes.trades.length > 0) {
          futuresTrades.push(...fRes.trades);
          affectedFutures.add(contract.symbol);
          runtime.lastActionNote = `Tin ${news.category}: ${side === 'BUY' ? 'Long' : 'Short'} ${contract.symbol}`;
          runtime.lastDecisionReason = `NEWS_FUTURES_${news.sentiment}`;
        }
      }
    }

    return {
      spotTrades,
      futuresTrades,
      affectedSpotSymbols: Array.from(affectedSpot),
      affectedFuturesSymbols: Array.from(affectedFutures),
    };
  }

  /**
   * Evaluates a single agent's finite equity, drawdown circuit breaker, and solvency status.
   */
  public evaluateLifecycleStatus(runtime: AgentRuntimeState, nowMs = Date.now()): BotLifecycleStatus {
    const equityMinor = this.computeAgentEquityMinor(runtime.config.id);
    if (equityMinor > runtime.peakEquityMinor) {
      runtime.peakEquityMinor = equityMinor;
    }

    const drawdownPct =
      runtime.peakEquityMinor > 0
        ? Number((((runtime.peakEquityMinor - equityMinor) / runtime.peakEquityMinor) * 100).toFixed(2))
        : 0;
    runtime.currentDrawdownPct = Math.max(0, drawdownPct);

    const wallet = this.ledger.wallets.getWallet(runtime.config.id);
    const totalCash = (wallet?.availableMinor ?? 0) + (wallet?.lockedMinor ?? 0);
    const holdingsVal = this.computeSpotHoldingsValueMinor(runtime.config.id);
    const openPositions = this.futures.listPlayerPositions(runtime.config.id);

    // 1. Insolvency check (finite capital depleted -> ceases trading, NEVER mints CR)
    if (totalCash < toMinor(100) && holdingsVal < toMinor(100) && openPositions.length === 0) {
      if (runtime.status !== 'INSOLVENT') {
        this.cancelAllBotOrders(runtime.config.id);
        runtime.status = 'INSOLVENT';
        runtime.lastActionNote = 'Cạn kiệt vốn CR & tài sản — ngừng giao dịch hoàn toàn';
        runtime.lastDecisionReason = 'INSOLVENT_ZERO_CAPITAL';
      }
      return runtime.status;
    }

    // 2. Maximum Drawdown Circuit Breaker
    if (runtime.currentDrawdownPct >= runtime.config.maxDrawdownPct) {
      if (runtime.status !== 'PAUSED_DRAWDOWN') {
        this.cancelAllBotOrders(runtime.config.id);
        runtime.status = 'PAUSED_DRAWDOWN';
        runtime.lastActionNote = `Chạm ngưỡng Drawdown tối đa (${runtime.currentDrawdownPct.toFixed(1)}% / ${runtime.config.maxDrawdownPct}%) — tạm dừng giao dịch`;
        runtime.lastDecisionReason = 'MAX_DRAWDOWN_BREACHED';
      }
      return runtime.status;
    }

    if (runtime.status === 'COOLDOWN' && nowMs >= runtime.cooldownUntilMs) {
      runtime.status = 'ACTIVE';
    }

    return runtime.status;
  }

  private executeAgentStep(
    runtime: AgentRuntimeState,
    ctx: {
      economy: EconomyState;
      spotAssets: Asset[];
      futuresContracts: FuturesContract[];
      signalBySymbol: Map<string, MarketSignalSnapshot>;
      targetSymbol?: string;
      includeNova: boolean;
      nowMs: number;
    },
  ): {
    spotTrades: Trade[];
    futuresTrades: FuturesTrade[];
    affectedSpot: string[];
    affectedFutures: string[];
    ordersSubmitted: number;
  } {
    const spotTrades: Trade[] = [];
    const futuresTrades: FuturesTrade[] = [];
    const affectedSpot = new Set<string>();
    const affectedFutures = new Set<string>();
    let ordersSubmitted = 0;

    const { config } = runtime;
    const candidateSpot = ctx.spotAssets.filter((a) => {
      if (!ctx.includeNova && a.symbol === 'NOVA') return false;
      if (ctx.targetSymbol) return a.symbol === ctx.targetSymbol;
      return config.preferredSymbols.includes(a.symbol);
    });
    const spotPool = candidateSpot.length > 0 ? candidateSpot : ctx.spotAssets.filter((a) => ctx.includeNova || a.symbol !== 'NOVA');

    const candidateFutures = ctx.futuresContracts.filter((c) => {
      if (ctx.targetSymbol) {
        return c.symbol === ctx.targetSymbol || c.underlyingSpotSymbol === ctx.targetSymbol;
      }
      return config.preferredFuturesSymbols.includes(c.symbol);
    });

    // Always run active Futures Risk & Margin Management first for any bot holding open perp positions
    const riskClose = this.manageOpenFuturesPositions(runtime, ctx.signalBySymbol, ctx.nowMs);
    if (riskClose.trades.length > 0) {
      futuresTrades.push(...riskClose.trades);
      riskClose.symbols.forEach((s) => affectedFutures.add(s));
      ordersSubmitted += riskClose.ordersSubmitted;
    }

    // Pick primary symbol for this decision step
    const chosenSpot = spotPool.length > 0 ? runtime.rng.pick(spotPool) : null;
    const signal = chosenSpot ? ctx.signalBySymbol.get(chosenSpot.symbol) ?? null : null;
    const recentWinRate = runtime.tradesCount > 0 ? runtime.winningTrades / runtime.tradesCount : 0.5;

    if (signal) {
      runtime.adaptiveProfile = this.signals.computeAdaptiveProfile({
        config,
        signal,
        economy: ctx.economy,
        currentDrawdownPct: runtime.currentDrawdownPct,
        recentWinRate,
      });
    }

    switch (config.archetype) {
      case 'MARKET_MAKER': {
        if (chosenSpot) {
          const qRes = this.quoteSpotMarketMaker(runtime, chosenSpot, ctx.economy, signal);
          ordersSubmitted += qRes.ordersSubmitted;
          if (qRes.ordersSubmitted > 0 || qRes.withdrew) {
            affectedSpot.add(chosenSpot.symbol);
          }
        }
        if (candidateFutures.length > 0) {
          const contract = runtime.rng.pick(candidateFutures);
          const underlyingSignal = ctx.signalBySymbol.get(contract.underlyingSpotSymbol) ?? signal;
          const fqRes = this.quoteFuturesMarketMaker(runtime, contract, underlyingSignal);
          ordersSubmitted += fqRes.ordersSubmitted;
          if (fqRes.ordersSubmitted > 0) affectedFutures.add(contract.symbol);
        }
        break;
      }

      case 'INSTITUTIONAL_FUND': {
        if (chosenSpot && signal) {
          const score = this.computeInstitutionalScore(chosenSpot, signal, ctx.economy);
          if (Math.abs(score) >= 0.14) {
            const side: 'BUY' | 'SELL' = score > 0 ? 'BUY' : 'SELL';
            const res = this.submitSpotCrossingOrder(
              runtime,
              chosenSpot,
              side,
              0.7 * runtime.adaptiveProfile.sizeScalar,
              ctx.nowMs,
            );
            ordersSubmitted += res.submitted ? 1 : 0;
            if (res.trades.length > 0) {
              spotTrades.push(...res.trades);
              affectedSpot.add(chosenSpot.symbol);
              runtime.lastActionNote = `Phân tích vĩ mô (${ctx.economy.phase}): ${side} ${chosenSpot.symbol}`;
              runtime.lastDecisionReason = `MACRO_VALUE_SCORE_${score.toFixed(2)}`;
            }
          }
        }
        // Hedge macro recession/slowdown via low-leverage Futures
        if (candidateFutures.length > 0 && (ctx.economy.phase === 'RECESSION' || ctx.economy.phase === 'SLOWDOWN')) {
          const contract = runtime.rng.pick(candidateFutures);
          const res = this.submitFuturesDirectionalOrder(runtime, contract, 'SELL', ctx.economy, signal, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            futuresTrades.push(...res.trades);
            affectedFutures.add(contract.symbol);
          }
        }
        break;
      }

      case 'WHALE_TRADER': {
        if (chosenSpot && signal) {
          runtime.whaleCycleCounter += 1;
          // Switch between ACCUMULATE and DISTRIBUTE based on inventory / price drift / cycle length
          const holding = this.ledger.wallets.getHolding(config.id, chosenSpot.symbol);
          const holdingValMinor = holding ? Math.round((holding.availableQty + holding.lockedQty) * chosenSpot.lastPriceMinor) : 0;
          const equityMinor = this.computeAgentEquityMinor(config.id);
          const exposureRatio = equityMinor > 0 ? holdingValMinor / equityMinor : 0;

          if (exposureRatio >= config.positionLimitPct * 0.85 || signal.shortTermReturnPct >= 3.2) {
            runtime.whalePhase = 'DISTRIBUTE';
          } else if (exposureRatio <= 0.04 || signal.shortTermReturnPct <= -2.8 || runtime.whaleCycleCounter % 7 === 0) {
            runtime.whalePhase = runtime.whalePhase === 'ACCUMULATE' ? 'DISTRIBUTE' : 'ACCUMULATE';
          }

          const side: 'BUY' | 'SELL' = runtime.whalePhase === 'ACCUMULATE' ? 'BUY' : 'SELL';
          const whaleScale = (1.8 + config.riskTolerance * 1.4) * runtime.adaptiveProfile.sizeScalar;
          const res = this.submitSpotCrossingOrder(runtime, chosenSpot, side, whaleScale, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            spotTrades.push(...res.trades);
            affectedSpot.add(chosenSpot.symbol);
            const prevFlow = this.whaleNetFlowBySymbol.get(chosenSpot.symbol) ?? 0;
            const delta = side === 'BUY' ? 0.35 : -0.35;
            this.whaleNetFlowBySymbol.set(chosenSpot.symbol, Number(Math.max(-1, Math.min(1, prevFlow + delta)).toFixed(3)));
            runtime.lastActionNote = `Cá voi ${runtime.whalePhase === 'ACCUMULATE' ? 'tích lũy' : 'phân phối'} ${chosenSpot.symbol}`;
            runtime.lastDecisionReason = `WHALE_${runtime.whalePhase}`;
          }
        }
        break;
      }

      case 'MOMENTUM_TRADER': {
        if (chosenSpot && signal) {
          const momentumScore = signal.shortTermReturnPct * 0.35 + signal.orderBookImbalance * 0.9 + runtime.adaptiveProfile.sentimentBias * 0.4;
          const side: 'BUY' | 'SELL' =
            Math.abs(momentumScore) >= 0.08
              ? momentumScore > 0
                ? 'BUY'
                : 'SELL'
              : runtime.rng.chance(0.5 + runtime.adaptiveProfile.sentimentBias * 0.2)
                ? 'BUY'
                : 'SELL';

          const res = this.submitSpotCrossingOrder(runtime, chosenSpot, side, 0.95 * runtime.adaptiveProfile.sizeScalar, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            spotTrades.push(...res.trades);
            affectedSpot.add(chosenSpot.symbol);
            runtime.lastActionNote = `Momentum ${side} ${chosenSpot.symbol} (ret ${signal.shortTermReturnPct.toFixed(2)}%)`;
            runtime.lastDecisionReason = `MOMENTUM_${side}`;
          }
        }
        if (candidateFutures.length > 0 && runtime.rng.chance(0.55)) {
          const contract = runtime.rng.pick(candidateFutures);
          const uSig = ctx.signalBySymbol.get(contract.underlyingSpotSymbol) ?? signal;
          const side: 'BUY' | 'SELL' = (uSig?.shortTermReturnPct ?? 0) + (uSig?.orderBookImbalance ?? 0) >= 0 ? 'BUY' : 'SELL';
          const fRes = this.submitFuturesDirectionalOrder(runtime, contract, side, ctx.economy, uSig, ctx.nowMs);
          ordersSubmitted += fRes.submitted ? 1 : 0;
          if (fRes.trades.length > 0) {
            futuresTrades.push(...fRes.trades);
            affectedFutures.add(contract.symbol);
          }
        }
        break;
      }

      case 'CONTRARIAN_TRADER': {
        if (chosenSpot && signal) {
          // Fade extremes: buy sharp dips / oversold, sell sharp pumps / crowded longs
          const refDeviationPct =
            signal.referencePriceMinor > 0
              ? ((signal.lastPriceMinor - signal.referencePriceMinor) / signal.referencePriceMinor) * 100
              : 0;
          const fadeSignal = -(signal.shortTermReturnPct * 0.6 + refDeviationPct * 0.25 + signal.fundingRateBps * 0.05);
          const side: 'BUY' | 'SELL' =
            Math.abs(fadeSignal) >= 0.1
              ? fadeSignal > 0
                ? 'BUY'
                : 'SELL'
              : runtime.rng.chance(0.5)
                ? 'BUY'
                : 'SELL';

          const res = this.submitSpotCrossingOrder(runtime, chosenSpot, side, 0.85 * runtime.adaptiveProfile.sizeScalar, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            spotTrades.push(...res.trades);
            affectedSpot.add(chosenSpot.symbol);
            runtime.lastActionNote = `Đi ngược xu hướng (${side}) ${chosenSpot.symbol} (lệch ${refDeviationPct.toFixed(2)}%)`;
            runtime.lastDecisionReason = `CONTRARIAN_FADE_${side}`;
          }
        }
        break;
      }

      case 'NEWS_TRADER': {
        if (chosenSpot && signal) {
          const bias = signal.newsBias * config.newsSensitivity + runtime.adaptiveProfile.sentimentBias * 0.35;
          const side: 'BUY' | 'SELL' =
            Math.abs(bias) >= 0.06
              ? bias > 0
                ? 'BUY'
                : 'SELL'
              : runtime.rng.chance(0.5)
                ? 'BUY'
                : 'SELL';
          const res = this.submitSpotCrossingOrder(runtime, chosenSpot, side, (0.8 + Math.abs(bias)) * runtime.adaptiveProfile.sizeScalar, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            spotTrades.push(...res.trades);
            affectedSpot.add(chosenSpot.symbol);
            runtime.lastActionNote = `Giao dịch theo tin tức (${side}) ${chosenSpot.symbol}`;
            runtime.lastDecisionReason = `NEWS_SIGNAL_${bias.toFixed(2)}`;
          }
        }
        break;
      }

      case 'MEME_SPECULATOR': {
        const memePool = spotPool.filter((a) => isMemeCoinSymbol(a.symbol));
        const memeAsset = memePool.length > 0 ? runtime.rng.pick(memePool) : chosenSpot;
        if (memeAsset) {
          const mSig = ctx.signalBySymbol.get(memeAsset.symbol) ?? signal;
          const regime = mSig?.memeRegime ?? 'CALM';

          // Authentic Meme Coin micro-behavior: Retail FOMO chasing vs Panic Selling
          let side: 'BUY' | 'SELL';
          let scale = 1.15 * runtime.adaptiveProfile.sizeScalar;
          if (regime === 'WHALE_ACCUMULATION' || regime === 'RETAIL_FOMO') {
            side = runtime.rng.chance(0.82) ? 'BUY' : 'SELL';
            scale *= 1.35;
          } else if (regime === 'PANIC_SELLING' || regime === 'WHALE_DISTRIBUTION' || regime === 'LIQUIDITY_WITHDRAWAL') {
            side = runtime.rng.chance(0.8) ? 'SELL' : 'BUY';
            scale *= 1.45;
          } else {
            side = runtime.rng.chance(0.54 + (mSig?.orderBookImbalance ?? 0) * 0.25) ? 'BUY' : 'SELL';
          }

          const res = this.submitSpotCrossingOrder(runtime, memeAsset, side, scale, ctx.nowMs);
          ordersSubmitted += res.submitted ? 1 : 0;
          if (res.trades.length > 0) {
            spotTrades.push(...res.trades);
            affectedSpot.add(memeAsset.symbol);
            runtime.lastActionNote = `Meme [${regime}]: ${side === 'BUY' ? 'FOMO Mua' : 'Bán tháo'} ${memeAsset.symbol}`;
            runtime.lastDecisionReason = `MEME_${regime}_${side}`;
          }

          // High-leverage meme perp speculation (strictly vulnerable to liquidation cascades!)
          const memePerp =
            candidateFutures.find((c) => c.underlyingSpotSymbol === memeAsset.symbol) ??
            candidateFutures[0];
          if (memePerp && runtime.rng.chance(0.65)) {
            const fRes = this.submitFuturesDirectionalOrder(runtime, memePerp, side, ctx.economy, mSig, ctx.nowMs);
            ordersSubmitted += fRes.submitted ? 1 : 0;
            if (fRes.trades.length > 0) {
              futuresTrades.push(...fRes.trades);
              affectedFutures.add(memePerp.symbol);
            }
          }
        }
        break;
      }

      case 'FUTURES_RISK_AGENT': {
        if (candidateFutures.length > 0) {
          const contract = runtime.rng.pick(candidateFutures);
          const uSig = ctx.signalBySymbol.get(contract.underlyingSpotSymbol) ?? null;
          const basisBps = uSig?.basisBps ?? 0;
          const fundingBps = contract.estimatedFundingRateBps;

          // Basis Arbitrage or Funding Rate Carry with strict SL/TP protection
          let side: FuturesOrderSide | null = null;
          let reason = 'FUTURES_RISK_NEUTRAL';
          if (Math.abs(basisBps) >= 12) {
            side = basisBps > 0 ? 'SELL' : 'BUY';
            reason = `BASIS_ARB_${basisBps}BPS`;
          } else if (Math.abs(fundingBps) >= 3) {
            side = fundingBps > 0 ? 'SELL' : 'BUY';
            reason = `FUNDING_CARRY_${fundingBps}BPS`;
          } else if (runtime.rng.chance(0.45)) {
            side = runtime.adaptiveProfile.sentimentBias >= 0 ? 'BUY' : 'SELL';
            reason = 'DELTA_HEDGED_ENTRY';
          }

          if (side) {
            const fRes = this.submitFuturesDirectionalOrder(runtime, contract, side, ctx.economy, uSig, ctx.nowMs, true);
            ordersSubmitted += fRes.submitted ? 1 : 0;
            if (fRes.trades.length > 0) {
              futuresTrades.push(...fRes.trades);
              affectedFutures.add(contract.symbol);
              runtime.lastActionNote = `Futures Risk [${reason}]: ${side === 'BUY' ? 'Long' : 'Short'} ${contract.symbol}`;
              runtime.lastDecisionReason = reason;
            }
          }
        }
        break;
      }
    }

    return {
      spotTrades,
      futuresTrades,
      affectedSpot: Array.from(affectedSpot),
      affectedFutures: Array.from(affectedFutures),
      ordersSubmitted,
    };
  }

  /**
   * Two-sided inventory-skewed Spot Market Making with adaptive spread & volatility liquidity withdrawal.
   */
  private quoteSpotMarketMaker(
    runtime: AgentRuntimeState,
    asset: Asset,
    economy: EconomyState,
    signal: MarketSignalSnapshot | null,
  ): { ordersSubmitted: number; withdrew: boolean } {
    const { config } = runtime;
    // Cancel stale quotes before refreshing (prevents self-matching and stale books)
    this.matching.cancelAllPlayerOrdersForSymbol(config.id, asset.symbol);

    const wallet = this.ledger.wallets.getWallet(config.id);
    const holding = this.ledger.wallets.getHolding(config.id, asset.symbol);
    if (!wallet) return { ordersSubmitted: 0, withdrew: false };

    const isMeme = isMemeCoinSymbol(asset.symbol);
    const withdraw = runtime.adaptiveProfile.liquidityWithdrawalActive;

    // During Meme Coin liquidity withdrawal / market panic, MM thins depth to 1 wide defensive level
    const levels = withdraw ? 1 : isMeme ? 3 : 3;
    const baseSpreadBps = isMeme ? 55 : asset.marketClass === 'CRYPTO' ? 28 : 34;
    const dynamicSpreadBps = Math.round(
      baseSpreadBps *
        runtime.adaptiveProfile.spreadMultiplier *
        (withdraw ? 2.1 : 1.0) *
        (0.9 + (config.biasSeed % 7) * 0.04),
    );

    // Inventory skew shifts quotes slightly to stay delta-balanced
    const equityMinor = Math.max(1, this.computeAgentEquityMinor(config.id));
    const invValueMinor = holding ? Math.round((holding.availableQty + holding.lockedQty) * asset.lastPriceMinor) : 0;
    const invRatio = invValueMinor / equityMinor;
    const skewBps = Math.round((invRatio - 0.1) * 80); // Heavy inventory -> shift quotes down to encourage sells

    const mid = asset.lastPriceMinor;
    let submitted = 0;

    for (let lvl = 0; lvl < levels; lvl++) {
      const offsetBps = Math.round(dynamicSpreadBps * (1 + lvl * 0.65));
      const bidMinor = alignToTick(
        Math.floor((mid * (10_000 - offsetBps - skewBps)) / 10_000),
        asset.priceTickMinor,
        'floor',
      );
      const askMinor = alignToTick(
        Math.ceil((mid * (10_000 + offsetBps - skewBps)) / 10_000),
        asset.priceTickMinor,
        'ceil',
      );

      if (bidMinor <= 0 || askMinor <= bidMinor) continue;

      const lotScale = (withdraw ? 0.35 : 1.0) * (lvl + 1) * runtime.adaptiveProfile.sizeScalar;
      const qty = this.roundToStep(this.defaultSpotLot(asset) * lotScale, asset.qtyStep);
      const neededCash = Math.round(bidMinor * qty * 1.003);

      if (wallet.availableMinor >= neededCash) {
        const res = this.tryPlaceSpotOrder(runtime, {
          symbol: asset.symbol,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          priceCR: fromMinor(bidMinor),
          quantity: qty,
        });
        if (res.submitted) submitted += 1;
      }

      const freshHolding = this.ledger.wallets.getHolding(config.id, asset.symbol);
      if (freshHolding && freshHolding.availableQty >= qty) {
        const res = this.tryPlaceSpotOrder(runtime, {
          symbol: asset.symbol,
          side: 'SELL',
          type: 'LIMIT',
          timeInForce: 'GTC',
          priceCR: fromMinor(askMinor),
          quantity: qty,
        });
        if (res.submitted) submitted += 1;
      }
    }

    runtime.lastActionNote = withdraw
      ? `Rút thanh khoản phòng thủ trên ${asset.symbol} (spread ${dynamicSpreadBps} bps · ${economy.volatilityRegime})`
      : `Báo giá 2 chiều ${asset.symbol} (${levels} lớp · spread ${dynamicSpreadBps} bps)`;
    runtime.lastDecisionReason = withdraw ? 'MM_LIQUIDITY_WITHDRAWAL' : signal?.memeRegime ?? 'MM_TWO_SIDED_QUOTE';

    return { ordersSubmitted: submitted, withdrew: withdraw };
  }

  private quoteFuturesMarketMaker(
    runtime: AgentRuntimeState,
    contract: FuturesContract,
    signal: MarketSignalSnapshot | null,
  ): { ordersSubmitted: number } {
    const { config } = runtime;
    this.futures.cancelAllPlayerOrdersForSymbol(config.id, contract.symbol);

    const withdraw = runtime.adaptiveProfile.liquidityWithdrawalActive;
    const levels = withdraw ? 1 : 3;
    const midInt = contract.markPriceInt > 0 ? contract.markPriceInt : contract.referencePriceInt;
    const baseStepTicks = Math.max(
      1,
      Math.round((midInt * (0.0014 * runtime.adaptiveProfile.spreadMultiplier * (withdraw ? 1.8 : 1.0))) / contract.priceTickInt),
    );
    const leverage = snapFuturesLeverage(runtime.adaptiveProfile.effectiveMaxLeverage, config.maxLeverage);
    let submitted = 0;

    for (let i = 0; i < levels; i++) {
      const mult = i + 1;
      const bidInt = Math.max(contract.priceTickInt, midInt - mult * baseStepTicks * contract.priceTickInt);
      const askInt = midInt + mult * baseStepTicks * contract.priceTickInt;
      const qty = this.baseFuturesOrderQty(contract, (withdraw ? 0.5 : 1.2) * (i + 1));

      const bidRes = this.tryPlaceFuturesOrder(runtime, {
        symbol: contract.symbol,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        priceCR: fromPriceInt(bidInt, contract.priceScale),
        quantity: qty,
        leverage,
        postOnly: true,
      });
      if (bidRes.submitted) submitted += 1;

      const askRes = this.tryPlaceFuturesOrder(runtime, {
        symbol: contract.symbol,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        priceCR: fromPriceInt(askInt, contract.priceScale),
        quantity: qty,
        leverage,
        postOnly: true,
      });
      if (askRes.submitted) submitted += 1;
    }

    if (submitted > 0 && signal?.isMemeCoin && withdraw) {
      runtime.lastActionNote = `Thu hẹp thanh khoản Perp ${contract.symbol} do biến động cao`;
    }

    return { ordersSubmitted: submitted };
  }

  private submitSpotCrossingOrder(
    runtime: AgentRuntimeState,
    asset: Asset,
    side: 'BUY' | 'SELL',
    scaleFactor: number,
    nowMs: number,
  ): { submitted: boolean; trades: Trade[] } {
    const book = this.matching.getOrderBook(asset.symbol, 5);
    const topCounterparty = side === 'BUY' ? book.asks[0] : book.bids[0];
    if (!topCounterparty) return { submitted: false, trades: [] };

    const { config } = runtime;
    const wallet = this.ledger.wallets.getWallet(config.id);
    if (!wallet) return { submitted: false, trades: [] };

    // Position limit enforcement (never exceed agent's configured positionLimitPct)
    const equityMinor = this.computeAgentEquityMinor(config.id);
    const holding = this.ledger.wallets.getHolding(config.id, asset.symbol);
    const currentPosValMinor = holding ? Math.round((holding.availableQty + holding.lockedQty) * asset.lastPriceMinor) : 0;
    const maxPosValMinor = Math.round(equityMinor * config.positionLimitPct);

    let desiredQty = this.roundToStep(this.defaultSpotLot(asset) * Math.max(0.25, scaleFactor), asset.qtyStep);

    if (side === 'BUY') {
      const remainingRoomMinor = Math.max(0, maxPosValMinor - currentPosValMinor);
      const affordableMinor = Math.min(wallet.availableMinor * 0.85, remainingRoomMinor);
      const maxQtyByCap = Math.floor(affordableMinor / Math.max(1, topCounterparty.priceMinor * 1.003) / asset.qtyStep) * asset.qtyStep;
      desiredQty = this.roundToStep(Math.min(desiredQty, maxQtyByCap), asset.qtyStep);
      if (desiredQty < asset.minQty || affordableMinor < topCounterparty.priceMinor * asset.minQty) {
        return { submitted: false, trades: [] };
      }
    } else {
      const availQty = holding?.availableQty ?? 0;
      if (availQty < asset.minQty) return { submitted: false, trades: [] };
      desiredQty = this.roundToStep(Math.min(desiredQty, availQty * 0.75), asset.qtyStep);
      if (desiredQty < asset.minQty) desiredQty = this.roundToStep(Math.min(availQty, asset.minQty), asset.qtyStep);
    }

    // Anti-wash-trade check: ensure bot does not have its own resting opposite order at crossing price
    if (this.wouldWashTradeSpot(config.id, asset.symbol, side, topCounterparty.priceMinor)) {
      runtime.washTradesBlocked += 1;
      this.totalWashTradeBlocked += 1;
      return { submitted: false, trades: [] };
    }

    // Duplicate-order guard
    const fp = `SPOT|${config.id}|${asset.symbol}|${side}|${topCounterparty.priceMinor}|${desiredQty}|${Math.floor(nowMs / 1500)}`;
    if (this.isDuplicateFingerprint(fp, nowMs)) {
      runtime.duplicateOrdersBlocked += 1;
      this.totalDuplicateBlocked += 1;
      return { submitted: false, trades: [] };
    }

    const res = this.tryPlaceSpotOrder(runtime, {
      symbol: asset.symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'IOC',
      priceCR: fromMinor(topCounterparty.priceMinor),
      quantity: desiredQty,
    });

    return { submitted: res.submitted, trades: res.trades };
  }

  private submitFuturesDirectionalOrder(
    runtime: AgentRuntimeState,
    contract: FuturesContract,
    side: FuturesOrderSide,
    _economy: EconomyState,
    signal: MarketSignalSnapshot | null,
    nowMs: number,
    strictRiskStops = false,
  ): { submitted: boolean; trades: FuturesTrade[] } {
    const { config } = runtime;
    const book = this.futures.getOrderBook(contract.symbol, 5);
    const hasCounterparty = side === 'BUY' ? book.asks.length > 0 : book.bids.length > 0;
    if (!hasCounterparty) return { submitted: false, trades: [] };

    const topPriceInt = side === 'BUY' ? book.asks[0].priceInt : book.bids[0].priceInt;

    // Anti-wash-trade check on Futures
    if (this.wouldWashTradeFutures(config.id, contract.symbol, side, topPriceInt)) {
      runtime.washTradesBlocked += 1;
      this.totalWashTradeBlocked += 1;
      return { submitted: false, trades: [] };
    }

    const wallet = this.ledger.wallets.getWallet(config.id);
    if (!wallet || wallet.availableMinor < toMinor(250)) {
      return { submitted: false, trades: [] };
    }

    // Position exposure cap across open futures margin
    const existingPositions = this.futures.listPlayerPositions(config.id);
    const usedMarginMinor = existingPositions.reduce((s, p) => s + p.marginMinor, 0);
    const equityMinor = this.computeAgentEquityMinor(config.id);
    if (usedMarginMinor > equityMinor * config.positionLimitPct * 1.4) {
      return { submitted: false, trades: [] };
    }

    const leverage = snapFuturesLeverage(
      config.archetype === 'MEME_SPECULATOR'
        ? Math.min(config.maxLeverage, Math.max(5, runtime.adaptiveProfile.effectiveMaxLeverage))
        : runtime.adaptiveProfile.effectiveMaxLeverage,
      config.maxLeverage,
    );
    const qty = this.baseFuturesOrderQty(contract, runtime.adaptiveProfile.sizeScalar);

    const fp = `FUT|${config.id}|${contract.symbol}|${side}|${leverage}|${qty}|${Math.floor(nowMs / 1500)}`;
    if (this.isDuplicateFingerprint(fp, nowMs)) {
      runtime.duplicateOrdersBlocked += 1;
      this.totalDuplicateBlocked += 1;
      return { submitted: false, trades: [] };
    }

    const markMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
    const slPct = strictRiskStops ? 0.035 : config.archetype === 'MEME_SPECULATOR' ? 0.14 : 0.055;
    const tpPct = strictRiskStops ? 0.065 : config.archetype === 'MEME_SPECULATOR' ? 0.16 : 0.085;

    const attachStops = strictRiskStops || config.archetype !== 'MEME_SPECULATOR' || (signal?.liquidationRiskScore ?? 0) < 0.5;
    const stopLossCR = attachStops
      ? this.snapFuturesPrice(contract, markMajor * (side === 'BUY' ? 1 - slPct : 1 + slPct))
      : undefined;
    const takeProfitCR = attachStops
      ? this.snapFuturesPrice(contract, markMajor * (side === 'BUY' ? 1 + tpPct : 1 - tpPct))
      : undefined;

    const res = this.tryPlaceFuturesOrder(runtime, {
      symbol: contract.symbol,
      side,
      type: 'MARKET',
      quantity: qty,
      leverage,
      stopLossCR,
      takeProfitCR,
    });

    if (res.trades.length > 0) {
      runtime.lastActionNote = `${side === 'BUY' ? 'Long' : 'Short'} ${qty} ${contract.symbol} (${leverage}x${stopLossCR ? ' + SL/TP' : ''})`;
      runtime.lastDecisionReason = `FUTURES_${side}_${leverage}X`;
    }

    return { submitted: res.submitted, trades: res.trades };
  }

  /**
   * Active Futures margin management & risk deleveraging for all open bot positions.
   * Bots still face real liquidation if they lack available CR or if price gaps past maintenance margin.
   */
  private manageOpenFuturesPositions(
    runtime: AgentRuntimeState,
    signalBySymbol: Map<string, MarketSignalSnapshot>,
    nowMs: number,
  ): { trades: FuturesTrade[]; symbols: string[]; ordersSubmitted: number } {
    const trades: FuturesTrade[] = [];
    const symbols = new Set<string>();
    let ordersSubmitted = 0;

    const positions = this.futures.listPlayerPositions(runtime.config.id);
    if (positions.length === 0) return { trades, symbols: [], ordersSubmitted: 0 };

    const wallet = this.ledger.wallets.getWallet(runtime.config.id);

    for (const pos of positions) {
      // 1. Margin defense: Risk Agents & Conservative bots top-up isolated margin when marginRatioPct >= 68%
      const canTopUp =
        runtime.config.archetype === 'FUTURES_RISK_AGENT' ||
        runtime.config.archetype === 'INSTITUTIONAL_FUND' ||
        runtime.config.archetype === 'MARKET_MAKER';

      if (canTopUp && pos.marginRatioPct >= 68 && wallet && wallet.availableMinor >= toMinor(50)) {
        const topUpMinor = Math.min(Math.floor(pos.marginMinor * 0.35), Math.floor(wallet.availableMinor * 0.15));
        if (topUpMinor >= toMinor(20)) {
          try {
            this.futures.addPositionMargin(runtime.config.id, pos.id, topUpMinor);
            runtime.lastActionNote = `Bổ sung +${fromMinor(topUpMinor).toFixed(0)} CR ký quỹ bảo vệ ${pos.symbol}`;
            runtime.lastDecisionReason = 'MARGIN_TOP_UP';
          } catch {
            // Respect finite wallet strictly
          }
        }
      }

      // 2. Profit taking / Stop-loss deleveraging based on ROE & adaptive liquidation risk
      const contract = this.futures.getContract(pos.symbol);
      const uSig = contract ? signalBySymbol.get(contract.underlyingSpotSymbol) : undefined;
      const tpThreshold = runtime.config.archetype === 'MEME_SPECULATOR' ? 18 : 10;
      const slThreshold = runtime.config.archetype === 'FUTURES_RISK_AGENT' ? -10 : -18;
      const highLiqDanger = (uSig?.liquidationRiskScore ?? 0) >= 0.78 && pos.roePct < -6 && runtime.config.archetype !== 'MEME_SPECULATOR';

      if (pos.roePct >= tpThreshold || pos.roePct <= slThreshold || highLiqDanger) {
        const closeSide: FuturesOrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const fp = `FUT_CLOSE|${runtime.config.id}|${pos.symbol}|${closeSide}|${pos.quantity}|${Math.floor(nowMs / 1500)}`;
        if (!this.isDuplicateFingerprint(fp, nowMs)) {
          const res = this.tryPlaceFuturesOrder(runtime, {
            symbol: pos.symbol,
            side: closeSide,
            type: 'MARKET',
            quantity: pos.quantity,
            leverage: snapFuturesLeverage(pos.leverage, runtime.config.maxLeverage),
            reduceOnly: true,
          });
          if (res.submitted) ordersSubmitted += 1;
          if (res.trades.length > 0) {
            trades.push(...res.trades);
            symbols.add(pos.symbol);
            if (pos.roePct > 0) runtime.winningTrades += 1;
            runtime.lastActionNote = `Đóng ${pos.side} ${pos.symbol} (ROE ${pos.roePct.toFixed(1)}%)`;
            runtime.lastDecisionReason = pos.roePct >= 0 ? 'TAKE_PROFIT_CLOSE' : 'STOP_LOSS_DELEVERAGE';
          }
        }
      }
    }

    return { trades, symbols: Array.from(symbols), ordersSubmitted };
  }

  private tryPlaceSpotOrder(
    runtime: AgentRuntimeState,
    cmd: {
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'LIMIT' | 'MARKET';
      timeInForce: 'GTC' | 'IOC';
      priceCR?: number;
      quantity: number;
    },
  ): { submitted: boolean; trades: Trade[] } {
    runtime.ordersSubmitted += 1;
    this.totalOrdersSubmitted += 1;
    const t0 = performance.now();
    try {
      const res = this.matching.placeOrder({
        playerId: runtime.config.id,
        playerName: runtime.config.username,
        ...cmd,
      });
      this.recordOrderLatency(performance.now() - t0);
      if (res.trades.length > 0) {
        runtime.ordersFilled += 1;
        this.totalOrdersFilled += 1;
        this.recordSpotTrades(res.trades);
      }
      return { submitted: true, trades: res.trades };
    } catch {
      this.recordOrderLatency(performance.now() - t0);
      runtime.ordersRejected += 1;
      return { submitted: false, trades: [] };
    }
  }

  private tryPlaceFuturesOrder(
    runtime: AgentRuntimeState,
    cmd: {
      symbol: string;
      side: FuturesOrderSide;
      type: 'LIMIT' | 'MARKET';
      timeInForce?: 'GTC' | 'IOC';
      priceCR?: number;
      quantity: number;
      leverage: FuturesLeverage;
      postOnly?: boolean;
      reduceOnly?: boolean;
      stopLossCR?: number;
      takeProfitCR?: number;
    },
  ): { submitted: boolean; trades: FuturesTrade[] } {
    runtime.ordersSubmitted += 1;
    this.totalOrdersSubmitted += 1;
    const t0 = performance.now();
    try {
      const res = this.futures.placeOrder({
        playerId: runtime.config.id,
        playerName: runtime.config.username,
        ...cmd,
      });
      this.recordOrderLatency(performance.now() - t0);
      if (res.trades.length > 0) {
        runtime.ordersFilled += 1;
        this.totalOrdersFilled += 1;
        this.recordFuturesTrades(res.trades);
      }
      return { submitted: true, trades: res.trades };
    } catch {
      this.recordOrderLatency(performance.now() - t0);
      runtime.ordersRejected += 1;
      return { submitted: false, trades: [] };
    }
  }

  private recordSpotTrades(trades: Trade[]): void {
    for (const t of trades) {
      this.totalTradesParticipated += 1;
      const buyer = this.agents.get(t.buyerId);
      if (buyer) {
        buyer.tradesCount += 1;
        buyer.recentTrades.unshift({
          id: t.id,
          market: 'SPOT',
          symbol: t.symbol,
          side: 'BUY',
          priceMajor: fromMinor(t.priceMinor),
          quantity: t.quantity,
          notionalMinor: t.grossAmountMinor,
          feeMinor: t.buyerFeeMinor,
          counterpartyId: t.sellerId,
          timestamp: t.timestamp,
        });
        if (buyer.recentTrades.length > 25) buyer.recentTrades.pop();
      }
      const seller = this.agents.get(t.sellerId);
      if (seller) {
        seller.tradesCount += 1;
        seller.recentTrades.unshift({
          id: t.id,
          market: 'SPOT',
          symbol: t.symbol,
          side: 'SELL',
          priceMajor: fromMinor(t.priceMinor),
          quantity: t.quantity,
          notionalMinor: t.grossAmountMinor,
          feeMinor: t.sellerFeeMinor,
          counterpartyId: t.buyerId,
          timestamp: t.timestamp,
        });
        if (seller.recentTrades.length > 25) seller.recentTrades.pop();
      }
    }
  }

  private recordFuturesTrades(trades: FuturesTrade[]): void {
    for (const t of trades) {
      this.totalTradesParticipated += 1;
      const contract = this.futures.getContract(t.symbol);
      const scale = contract?.priceScale ?? 100;
      const buyer = this.agents.get(t.buyerId);
      if (buyer) {
        buyer.tradesCount += 1;
        buyer.recentTrades.unshift({
          id: t.id,
          market: 'FUTURES',
          symbol: t.symbol,
          side: 'BUY',
          priceMajor: fromPriceInt(t.priceInt, scale),
          quantity: t.quantity,
          notionalMinor: t.notionalMinor,
          feeMinor: t.buyerFeeMinor,
          counterpartyId: t.sellerId,
          timestamp: t.timestamp,
        });
        if (buyer.recentTrades.length > 25) buyer.recentTrades.pop();
      }
      const seller = this.agents.get(t.sellerId);
      if (seller) {
        seller.tradesCount += 1;
        seller.recentTrades.unshift({
          id: t.id,
          market: 'FUTURES',
          symbol: t.symbol,
          side: 'SELL',
          priceMajor: fromPriceInt(t.priceInt, scale),
          quantity: t.quantity,
          notionalMinor: t.notionalMinor,
          feeMinor: t.sellerFeeMinor,
          counterpartyId: t.buyerId,
          timestamp: t.timestamp,
        });
        if (seller.recentTrades.length > 25) seller.recentTrades.pop();
      }
    }
  }

  private wouldWashTradeSpot(agentId: string, symbol: string, side: 'BUY' | 'SELL', targetPriceMinor: number): boolean {
    const openOrders = this.matching.listPlayerOrders(agentId, symbol).filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED',
    );
    for (const o of openOrders) {
      if (side === 'BUY' && o.side === 'SELL' && o.priceMinor <= targetPriceMinor) return true;
      if (side === 'SELL' && o.side === 'BUY' && o.priceMinor >= targetPriceMinor) return true;
    }
    return false;
  }

  private wouldWashTradeFutures(agentId: string, symbol: string, side: FuturesOrderSide, targetPriceInt: number): boolean {
    const openOrders = this.futures.listPlayerOrders(agentId, symbol).filter(
      (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED',
    );
    for (const o of openOrders) {
      if (side === 'BUY' && o.side === 'SELL' && o.priceInt <= targetPriceInt) return true;
      if (side === 'SELL' && o.side === 'BUY' && o.priceInt >= targetPriceInt) return true;
    }
    return false;
  }

  private isDuplicateFingerprint(fp: string, nowMs: number): boolean {
    const existing = this.recentOrderFingerprints.get(fp);
    if (existing && existing > nowMs) {
      return true;
    }
    this.recentOrderFingerprints.set(fp, nowMs + 2_000);
    return false;
  }

  private pruneExpiredFingerprints(nowMs: number): void {
    if (this.recentOrderFingerprints.size < 250) return;
    for (const [k, exp] of this.recentOrderFingerprints.entries()) {
      if (exp <= nowMs) this.recentOrderFingerprints.delete(k);
    }
  }

  private cancelAllBotOrders(agentId: string): void {
    for (const asset of this.matching.listAssets()) {
      this.matching.cancelAllPlayerOrdersForSymbol(agentId, asset.symbol);
    }
    for (const contract of this.futures.listContracts()) {
      this.futures.cancelAllPlayerOrdersForSymbol(agentId, contract.symbol);
    }
  }

  private computeInstitutionalScore(asset: Asset, signal: MarketSignalSnapshot, economy: EconomyState): number {
    let score = 0;
    if (economy.phase === 'BOOM' || economy.phase === 'EXPANSION') score += 0.18;
    else if (economy.phase === 'RECESSION' || economy.phase === 'SLOWDOWN') score -= 0.22;
    else if (economy.phase === 'RECOVERY') score += 0.12;

    if (asset.fundamentals && asset.fundamentals.intrinsicRefPriceMinor > 0) {
      const valuationGap =
        (asset.fundamentals.intrinsicRefPriceMinor - asset.lastPriceMinor) /
        asset.fundamentals.intrinsicRefPriceMinor;
      score += Math.max(-0.4, Math.min(0.4, valuationGap * 2.2));
      if (asset.fundamentals.dividendYieldPct >= 2.5) score += 0.08;
    }

    score += signal.newsBias * 0.35;
    return Number(Math.max(-1, Math.min(1, score)).toFixed(3));
  }

  private computeSpotHoldingsValueMinor(agentId: string): number {
    const holdings = this.ledger.wallets.listHoldings(agentId);
    let total = 0;
    for (const h of holdings) {
      const asset = this.matching.getAsset(h.symbol);
      if (!asset) continue;
      total += Math.round((h.availableQty + h.lockedQty) * asset.lastPriceMinor);
    }
    return total;
  }

  private computeAgentEquityMinor(agentId: string): number {
    const wallet = this.ledger.wallets.getWallet(agentId);
    const cash = (wallet?.availableMinor ?? 0) + (wallet?.lockedMinor ?? 0);
    const spotVal = this.computeSpotHoldingsValueMinor(agentId);
    const positions = this.futures.listPlayerPositions(agentId);
    const futuresEq = positions.reduce((s, p) => s + p.marginMinor + p.unrealizedPnlMinor, 0);
    return Math.max(0, cash + spotVal + futuresEq);
  }

  private recordOrderLatency(ms: number): void {
    this.orderMatchLatenciesMs.push(Number(ms.toFixed(4)));
    if (this.orderMatchLatenciesMs.length > 500) this.orderMatchLatenciesMs.shift();
  }

  private defaultSpotLot(asset: Asset): number {
    if (asset.symbol === 'BTC-SIM') return 0.05;
    if (asset.symbol === 'ETH-SIM') return 0.5;
    if (asset.symbol === 'SOL-SIM') return 6;
    if (asset.symbol === 'DOGE-SIM') return 4_500;
    if (asset.symbol === 'PEPE-SIM') return 12_000;
    if (asset.marketClass === 'CRYPTO') return 60;
    return 16;
  }

  private baseFuturesOrderQty(contract: FuturesContract, scaleFactor = 1): number {
    const priceMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
    if (priceMajor <= 0) return contract.minQty;
    const targetNotionalCR = 3_500 * Math.max(0.3, scaleFactor);
    const rawQty = targetNotionalCR / priceMajor;
    const steps = Math.max(1, Math.round(rawQty / contract.qtyStep));
    const snappedInt = Math.min(contract.maxOrderQtyInt, Math.max(contract.minQtyInt, steps * contract.qtyStepInt));
    return fromQtyInt(snappedInt);
  }

  private snapFuturesPrice(contract: FuturesContract, rawMajor: number): number {
    const rawInt = Math.round(rawMajor * contract.priceScale);
    const snapped = Math.max(contract.priceTickInt, Math.round(rawInt / contract.priceTickInt) * contract.priceTickInt);
    return fromPriceInt(snapped, contract.priceScale);
  }

  private roundToStep(val: number, step: number): number {
    const rounded = Math.max(step, Math.round(val / step) * step);
    return Number(rounded.toFixed(6));
  }

  /**
   * Returns complete telemetry for a single agent.
   */
  public getAgentTelemetry(agentId: string): BotAgentTelemetry | null {
    const runtime = this.agents.get(agentId);
    if (!runtime) return null;

    this.evaluateLifecycleStatus(runtime);
    const wallet = this.ledger.wallets.getWallet(agentId);
    const holdings = this.ledger.wallets.listHoldings(agentId);
    const positions = this.futures.listPlayerPositions(agentId);

    let spotHoldingsValueMinor = 0;
    let spotRealizedPnlMinor = 0;
    let spotUnrealizedPnlMinor = 0;
    for (const h of holdings) {
      const asset = this.matching.getAsset(h.symbol);
      if (!asset) continue;
      const qty = h.availableQty + h.lockedQty;
      spotHoldingsValueMinor += Math.round(qty * asset.lastPriceMinor);
      spotRealizedPnlMinor += h.realizedPnlMinor;
      spotUnrealizedPnlMinor += Math.round((asset.lastPriceMinor - h.avgCostMinor) * qty);
    }

    const usedMarginMinor = positions.reduce((s, p) => s + p.marginMinor, 0);
    const futuresUnrealizedPnlMinor = positions.reduce((s, p) => s + p.unrealizedPnlMinor, 0);
    const futuresRealizedPnlMinor = positions.reduce((s, p) => s + p.realizedPnlMinor, 0);
    const equityMinor = this.computeAgentEquityMinor(agentId);

    return {
      id: runtime.config.id,
      username: runtime.config.username,
      role: runtime.config.role,
      archetype: runtime.config.archetype,
      strategyLabel: runtime.config.strategyLabel,
      marketScope: runtime.config.marketScope,
      status: runtime.status,
      initialCapitalMinor: runtime.initialCapitalMinor,
      availableCashMinor: wallet?.availableMinor ?? 0,
      lockedCashMinor: wallet?.lockedMinor ?? 0,
      spotHoldingsValueMinor,
      availableMarginMinor: wallet?.availableMinor ?? 0,
      usedMarginMinor,
      realizedPnlMinor: spotRealizedPnlMinor + futuresRealizedPnlMinor,
      unrealizedPnlMinor: spotUnrealizedPnlMinor + futuresUnrealizedPnlMinor,
      equityMinor,
      peakEquityMinor: runtime.peakEquityMinor,
      currentDrawdownPct: runtime.currentDrawdownPct,
      maxDrawdownPct: runtime.config.maxDrawdownPct,
      riskTolerance: runtime.config.riskTolerance,
      positionLimitPct: runtime.config.positionLimitPct,
      tradingFrequencyMs: runtime.config.tradingFrequencyMs,
      newsSensitivity: runtime.config.newsSensitivity,
      openPositionsCount: positions.length,
      tradesCount: runtime.tradesCount,
      liquidationsCount: runtime.liquidationsCount,
      ordersSubmitted: runtime.ordersSubmitted,
      ordersRejected: runtime.ordersRejected,
      duplicateOrdersBlocked: runtime.duplicateOrdersBlocked,
      washTradesBlocked: runtime.washTradesBlocked,
      adaptiveProfile: { ...runtime.adaptiveProfile },
      lastActionNote: runtime.lastActionNote,
      lastDecisionReason: runtime.lastDecisionReason,
      lastActiveAt: runtime.lastActiveAtMs > 0 ? new Date(runtime.lastActiveAtMs).toISOString() : null,
      recentTrades: runtime.recentTrades.slice(0, 15),
    };
  }

  public getPerformanceMetrics(): BotEnginePerformanceMetrics {
    let activeAgentCount = 0;
    let cooldownAgentCount = 0;
    let pausedDrawdownCount = 0;
    let insolventCount = 0;
    let liquidatedAgentCount = 0;

    for (const r of this.agents.values()) {
      this.evaluateLifecycleStatus(r);
      if (r.status === 'ACTIVE') activeAgentCount += 1;
      else if (r.status === 'COOLDOWN') cooldownAgentCount += 1;
      else if (r.status === 'PAUSED_DRAWDOWN') pausedDrawdownCount += 1;
      else if (r.status === 'INSOLVENT') insolventCount += 1;
      else if (r.status === 'LIQUIDATED') liquidatedAgentCount += 1;
    }

    const elapsedSec = Math.max(0.001, (Date.now() - this.startedAtMs) / 1000);
    const mem = process.memoryUsage();

    return {
      seed: this.seed,
      configuredAgentCount: this.roster.length,
      activeAgentCount,
      cooldownAgentCount,
      pausedDrawdownCount,
      insolventCount,
      liquidatedAgentCount,
      ticksExecuted: this.ticksExecuted,
      totalOrdersSubmitted: this.totalOrdersSubmitted,
      totalOrdersFilled: this.totalOrdersFilled,
      totalTradesParticipated: this.totalTradesParticipated,
      totalDuplicateBlocked: this.totalDuplicateBlocked,
      totalWashTradeBlocked: this.totalWashTradeBlocked,
      avgTickDurationMs: average(this.tickDurationsMs),
      p95TickDurationMs: percentile(this.tickDurationsMs, 95),
      maxTickDurationMs: this.tickDurationsMs.length > 0 ? Number(Math.max(...this.tickDurationsMs).toFixed(3)) : 0,
      avgOrderMatchLatencyMs: average(this.orderMatchLatenciesMs),
      p95OrderMatchLatencyMs: percentile(this.orderMatchLatenciesMs, 95),
      ordersPerSecond: Number((this.totalOrdersSubmitted / elapsedSec).toFixed(2)),
      cpuBudgetMsPerTick: this.cpuBudgetMsPerTick,
      cpuBudgetExceededCount: this.cpuBudgetExceededCount,
      memoryRssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
      lastTickAt: this.lastTickAt,
    };
  }

  public getOverview(economy: EconomyState, recentNews: NewsItem[], onlineHumanPlayers: number): BotEcosystemOverview {
    const archetypeCounts = {} as Record<BotArchetype, number>;
    for (const arch of ALL_BOT_ARCHETYPES) archetypeCounts[arch] = 0;

    const agents: BotAgentTelemetry[] = [];
    for (const cfg of this.roster) {
      archetypeCounts[cfg.archetype] = (archetypeCounts[cfg.archetype] ?? 0) + 1;
      const telemetry = this.getAgentTelemetry(cfg.id);
      if (telemetry) agents.push(telemetry);
    }

    // Compute live Meme Coin microstructure snapshots
    const memeMarketSignals: MarketSignalSnapshot[] = [];
    const recentLiqs = this.futures.listRecentLiquidations(80);
    for (const asset of this.matching.listAssets()) {
      if (!isMemeCoinSymbol(asset.symbol)) continue;
      const linkedFutures = this.futures.listContracts().find((c) => c.underlyingSpotSymbol === asset.symbol) ?? null;
      memeMarketSignals.push(
        this.signals.computeMarketSignal({
          asset,
          orderBook: this.matching.getOrderBook(asset.symbol, 8),
          economy,
          recentNews,
          linkedFutures,
          recentLiquidations: recentLiqs,
          whaleNetFlowBias: this.whaleNetFlowBySymbol.get(asset.symbol) ?? 0,
        }),
      );
    }

    return {
      engineVersion: '2.0.0',
      runningWithoutHumans: onlineHumanPlayers === 0,
      onlineHumanPlayers,
      archetypeCounts,
      performance: this.getPerformanceMetrics(),
      memeMarketSignals,
      agents,
    };
  }
}
