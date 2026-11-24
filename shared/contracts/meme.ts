/**
 * Shared contracts for Simulated Meme Coin Economy & Futures V2 Telemetry / Handoff.
 * All tokens, wallets, whales, and news events are 100% simulated game assets with zero real monetary value.
 */

export type MemeTradingStatus = 'ACTIVE' | 'HIGH_VOLATILITY_WARNING' | 'HALTED';

export interface MemeInitialDistribution {
  treasuryPct: number;
  marketMakerPct: number;
  whalePct: number;
  publicFloatPct: number;
}

export interface MemeLiquidityMetrics {
  bidDepthMinor: number;
  askDepthMinor: number;
  spreadBps: number | null;
  restingLevels: number;
  thinLiquidityWarning: boolean;
}

export interface MemeCoinTokenomics {
  tokenId: string;
  symbol: string;
  name: string;
  theme: string;
  description: string;
  totalSupply: number;
  circulatingSupply: number;
  initialDistribution: MemeInitialDistribution;
  treasuryHoldings: number;
  availableMarketMakerHoldings: number;
  whaleHoldings: number;
  playerHoldings: number;
  holderCount: number;
  lastPriceMinor: number;
  referencePriceMinor: number;
  priceChange24hPct: number;
  marketCapMinor: number;
  tradingVolume24h: number;
  turnover24hMinor: number;
  liquidityMetrics: MemeLiquidityMetrics;
  volatilityIndicator: number; // 0..100 realized volatility score
  tradingStatus: MemeTradingStatus;
  contractEligibility: {
    spotEnabled: boolean;
    perpEnabled: boolean;
    perpSymbol: string | null;
    maxLeverage: number;
    reason: string;
  };
}

export interface MemeWhaleSummary {
  id: string;
  name: string;
  archetype: 'MEME_WHALE_ACCUMULATOR' | 'MEME_WHALE_SWING' | 'MEME_WHALE_SYNDICATE';
  availableCRMinor: number;
  lockedCRMinor: number;
  tokenHoldings: Record<string, { availableQty: number; lockedQty: number }>;
  tradesCount: number;
  lastActionNote: string;
}

export type MemeNewsEventType =
  | 'VIRAL_COMMUNITY_CAMPAIGN'
  | 'WHALE_ACCUMULATION_ALERT'
  | 'EXCHANGE_LISTING_RUMOR'
  | 'MEME_TREND_REVERSAL'
  | 'DEV_TREASURY_UPDATE'
  | 'LIQUIDITY_STRESS_ALERT';

export interface MemeNewsEvent {
  id: string;
  eventType: MemeNewsEventType;
  headline: string;
  summary: string;
  affectedMarkets: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  intensity: number; // 0.1 .. 1.0
  credibility: number; // 0.1 .. 1.0 (low credibility triggers contrarian fading by Mean Reversion bots)
  durationMs: number;
  publishedAt: string;
  expiresAt: string;
  source: 'EMPIRE_MEME_WIRE_SIM';
}

export interface MemeSupplyAuditResult {
  symbol: string;
  totalSupply: number;
  accountedSupply: number;
  discrepancy: number;
  valid: boolean;
}

export interface MemeMarketOverview {
  tokens: MemeCoinTokenomics[];
  whales: MemeWhaleSummary[];
  activeNews: MemeNewsEvent[];
  recentNews: MemeNewsEvent[];
  supplyAudits: MemeSupplyAuditResult[];
}
