import type { AccountRole } from './types';

export type BotArchetype =
  | 'MARKET_MAKER'
  | 'INSTITUTIONAL_FUND'
  | 'WHALE_TRADER'
  | 'MOMENTUM_TRADER'
  | 'CONTRARIAN_TRADER'
  | 'NEWS_TRADER'
  | 'MEME_SPECULATOR'
  | 'FUTURES_RISK_AGENT';

export type BotLifecycleStatus =
  | 'ACTIVE'
  | 'COOLDOWN'
  | 'PAUSED_DRAWDOWN'
  | 'INSOLVENT'
  | 'LIQUIDATED'
  | 'DISABLED';

export type BotMarketScope = 'SPOT' | 'FUTURES' | 'BOTH';

export type MemeMarketRegime =
  | 'CALM'
  | 'WHALE_ACCUMULATION'
  | 'RETAIL_FOMO'
  | 'LIQUIDITY_WITHDRAWAL'
  | 'WHALE_DISTRIBUTION'
  | 'PANIC_SELLING';

export interface BotAgentConfig {
  id: string;
  username: string;
  role: Extract<AccountRole, 'MARKET_MAKER' | 'INVESTOR_BOT'>;
  archetype: BotArchetype;
  strategyLabel: string;
  marketScope: BotMarketScope;
  initialCapitalCR: number;
  riskTolerance: number; // 0.1 (ultra conservative) .. 1.0 (aggressive)
  positionLimitPct: number; // Max single-asset exposure as % of equity (0.05 .. 0.45)
  tradingFrequencyMs: number; // Minimum cooldown between active decisions
  newsSensitivity: number; // 0.0 .. 1.0 reaction weight to public economic news
  maxDrawdownPct: number; // Circuit breaker threshold (e.g. 12% .. 55%)
  maxLeverage: 1 | 2 | 3 | 5 | 10;
  preferredSymbols: string[];
  preferredFuturesSymbols: string[];
  biasSeed: number; // Per-agent deterministic threshold offset to prevent synchronized herding
}

export interface BotTradeRecord {
  id: string;
  market: 'SPOT' | 'FUTURES';
  symbol: string;
  side: 'BUY' | 'SELL';
  priceMajor: number;
  quantity: number;
  notionalMinor: number;
  feeMinor: number;
  counterpartyId: string;
  timestamp: string;
}

export interface BotAdaptiveProfile {
  volatilityScalar: number; // 0.35 .. 1.6
  spreadMultiplier: number; // 0.75 .. 4.0
  sizeScalar: number; // 0.25 .. 1.5
  effectiveMaxLeverage: number;
  liquidityWithdrawalActive: boolean;
  sentimentBias: number; // -1 .. +1
}

export interface BotAgentTelemetry {
  id: string;
  username: string;
  role: Extract<AccountRole, 'MARKET_MAKER' | 'INVESTOR_BOT'>;
  archetype: BotArchetype;
  strategyLabel: string;
  marketScope: BotMarketScope;
  status: BotLifecycleStatus;
  initialCapitalMinor: number;
  availableCashMinor: number;
  lockedCashMinor: number;
  spotHoldingsValueMinor: number;
  availableMarginMinor: number;
  usedMarginMinor: number;
  realizedPnlMinor: number;
  unrealizedPnlMinor: number;
  equityMinor: number;
  peakEquityMinor: number;
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  riskTolerance: number;
  positionLimitPct: number;
  tradingFrequencyMs: number;
  newsSensitivity: number;
  openPositionsCount: number;
  tradesCount: number;
  liquidationsCount: number;
  ordersSubmitted: number;
  ordersRejected: number;
  duplicateOrdersBlocked: number;
  washTradesBlocked: number;
  adaptiveProfile: BotAdaptiveProfile;
  lastActionNote: string;
  lastDecisionReason: string;
  lastActiveAt: string | null;
  recentTrades: BotTradeRecord[];
}

export interface MarketSignalSnapshot {
  symbol: string;
  marketClass: 'CRYPTO' | 'STOCK' | 'FOREX';
  isMemeCoin: boolean;
  lastPriceMinor: number;
  referencePriceMinor: number;
  bestBidMinor: number | null;
  bestAskMinor: number | null;
  spreadBps: number;
  bidDepthMinor: number;
  askDepthMinor: number;
  totalDepthMinor: number;
  orderBookImbalance: number; // -1 (heavy ask) .. +1 (heavy bid)
  shortTermReturnPct: number; // Recent price drift vs rolling baseline
  volatilityBps: number; // Realized tick-to-tick volatility in bps
  sentimentScore: number; // -100 .. +100
  newsBias: number; // -1 .. +1 from recent public NewsItems
  fundingRateBps: number; // From linked perpetual contract if present
  basisBps: number; // (futuresLast - spotIndex) / spotIndex * 10000
  liquidationRiskScore: number; // 0 .. 1 derived from recent public liquidations + volatility
  memeRegime: MemeMarketRegime;
  computedAt: string;
}

export interface BotEnginePerformanceMetrics {
  seed: number;
  configuredAgentCount: number;
  activeAgentCount: number;
  cooldownAgentCount: number;
  pausedDrawdownCount: number;
  insolventCount: number;
  liquidatedAgentCount: number;
  ticksExecuted: number;
  totalOrdersSubmitted: number;
  totalOrdersFilled: number;
  totalTradesParticipated: number;
  totalDuplicateBlocked: number;
  totalWashTradeBlocked: number;
  avgTickDurationMs: number;
  p95TickDurationMs: number;
  maxTickDurationMs: number;
  avgOrderMatchLatencyMs: number;
  p95OrderMatchLatencyMs: number;
  ordersPerSecond: number;
  cpuBudgetMsPerTick: number;
  cpuBudgetExceededCount: number;
  memoryRssMb: number;
  heapUsedMb: number;
  lastTickAt: string | null;
}

export interface BotEcosystemOverview {
  engineVersion: '2.0.0';
  runningWithoutHumans: boolean;
  onlineHumanPlayers: number;
  archetypeCounts: Record<BotArchetype, number>;
  performance: BotEnginePerformanceMetrics;
  memeMarketSignals: MarketSignalSnapshot[];
  agents: BotAgentTelemetry[];
}
