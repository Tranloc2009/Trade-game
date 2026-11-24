import type {
  BotAdaptiveProfile,
  BotAgentConfig,
  MarketSignalSnapshot,
  MemeMarketRegime,
} from '../../../shared/contracts/bots';
import type { FuturesContract, FuturesLiquidationEvent } from '../../../shared/contracts/futures';
import type { Asset, EconomyState, NewsItem, OrderBookSnapshot } from '../../../shared/contracts/types';

export const MEME_COIN_SYMBOLS = new Set<string>(['DOGE-SIM', 'PEPE-SIM']);

export function isMemeCoinSymbol(symbol: string): boolean {
  return MEME_COIN_SYMBOLS.has(symbol.toUpperCase());
}

interface PriceSample {
  priceMinor: number;
  tsMs: number;
}

/**
 * Pure Public-Information Market Signal & Adaptive Intelligence Engine.
 *
 * Strictly observes ONLY public exchange data:
 * - Public order book price levels & depth (never inspects private human player IDs or hidden intent)
 * - Public price history & realized volatility
 * - Public EconomyState & NewsItems
 * - Public Futures funding rates, basis, and public liquidation tape
 */
export class AdaptiveSignalEngine {
  private priceHistory = new Map<string, PriceSample[]>();
  private newsDecayHalfLifeMs = 180_000; // 3 minutes decay for public news impact

  reset(): void {
    this.priceHistory.clear();
  }

  recordPublicPrice(symbol: string, priceMinor: number, nowMs = Date.now()): void {
    if (priceMinor <= 0) return;
    let list = this.priceHistory.get(symbol);
    if (!list) {
      list = [];
      this.priceHistory.set(symbol, list);
    }
    list.push({ priceMinor, tsMs: nowMs });
    if (list.length > 40) list.shift();
  }

  /**
   * Computes a comprehensive public MarketSignalSnapshot for an asset.
   */
  computeMarketSignal(params: {
    asset: Asset;
    orderBook: OrderBookSnapshot;
    economy: EconomyState;
    recentNews: NewsItem[];
    linkedFutures?: FuturesContract | null;
    recentLiquidations?: FuturesLiquidationEvent[];
    whaleNetFlowBias?: number; // -1..+1 observable public large-trade flow bias
    nowMs?: number;
  }): MarketSignalSnapshot {
    const { asset, orderBook, economy, recentNews, linkedFutures, recentLiquidations } = params;
    const nowMs = params.nowMs ?? Date.now();

    this.recordPublicPrice(asset.symbol, asset.lastPriceMinor, nowMs);
    const samples = this.priceHistory.get(asset.symbol) ?? [];

    // 1. Order book liquidity & imbalance (public aggregated depth only)
    const bidDepthMinor = orderBook.bids.reduce((sum, lvl) => sum + lvl.totalMinor, 0);
    const askDepthMinor = orderBook.asks.reduce((sum, lvl) => sum + lvl.totalMinor, 0);
    const totalDepthMinor = bidDepthMinor + askDepthMinor;
    const orderBookImbalance =
      totalDepthMinor > 0 ? Number(((bidDepthMinor - askDepthMinor) / totalDepthMinor).toFixed(4)) : 0;

    const spreadBps =
      orderBook.bestBidMinor && orderBook.bestAskMinor && orderBook.bestBidMinor > 0
        ? Math.round(((orderBook.bestAskMinor - orderBook.bestBidMinor) * 10_000) / orderBook.bestBidMinor)
        : 250;

    // 2. Realized short-term return & volatility from public trade prices
    let shortTermReturnPct = 0;
    let volatilityBps = 25;
    if (samples.length >= 2) {
      const oldest = samples[0].priceMinor;
      const latest = samples[samples.length - 1].priceMinor;
      if (oldest > 0) {
        shortTermReturnPct = Number((((latest - oldest) / oldest) * 100).toFixed(3));
      }
      const returnsBps: number[] = [];
      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1].priceMinor;
        const curr = samples[i].priceMinor;
        if (prev > 0) {
          returnsBps.push(Math.abs(((curr - prev) * 10_000) / prev));
        }
      }
      if (returnsBps.length > 0) {
        const meanAbs = returnsBps.reduce((a, b) => a + b, 0) / returnsBps.length;
        volatilityBps = Math.max(10, Math.round(meanAbs * 1.4));
      }
    } else if (asset.referencePriceMinor > 0) {
      shortTermReturnPct = Number(
        (((asset.lastPriceMinor - asset.referencePriceMinor) / asset.referencePriceMinor) * 100).toFixed(3),
      );
    }

    // 3. Public news bias with exponential time decay
    const newsBias = this.computePublicNewsBias(asset, recentNews, nowMs);

    // 4. Futures funding, basis & public liquidation pressure
    const fundingRateBps = linkedFutures?.estimatedFundingRateBps ?? 0;
    const basisBps =
      linkedFutures && linkedFutures.indexPriceInt > 0
        ? Math.round(((linkedFutures.lastPriceInt - linkedFutures.indexPriceInt) * 10_000) / linkedFutures.indexPriceInt)
        : 0;

    const recentSymLiqs = (recentLiquidations ?? []).filter(
      (l) =>
        (!linkedFutures || l.symbol === linkedFutures.symbol) &&
        nowMs - new Date(l.timestamp).getTime() <= 120_000,
    );
    const volStress = Math.min(1, volatilityBps / 350);
    const regimeStress =
      economy.volatilityRegime === 'MARKET_PANIC'
        ? 0.45
        : economy.volatilityRegime === 'HIGH_VOLATILITY'
          ? 0.25
          : 0.05;
    const liquidationRiskScore = Number(
      Math.min(1, volStress * 0.45 + regimeStress + Math.min(0.4, recentSymLiqs.length * 0.12)).toFixed(3),
    );

    // 5. Emergent Meme Coin microstructure regime classification (derived strictly from real order book & trades)
    const isMemeCoin = isMemeCoinSymbol(asset.symbol);
    const memeRegime = this.classifyMemeRegime({
      isMemeCoin,
      shortTermReturnPct,
      volatilityBps,
      spreadBps,
      orderBookImbalance,
      totalDepthMinor,
      liquidationRiskScore,
      whaleNetFlowBias: params.whaleNetFlowBias ?? 0,
    });

    return {
      symbol: asset.symbol,
      marketClass: asset.marketClass,
      isMemeCoin,
      lastPriceMinor: asset.lastPriceMinor,
      referencePriceMinor: asset.referencePriceMinor,
      bestBidMinor: orderBook.bestBidMinor,
      bestAskMinor: orderBook.bestAskMinor,
      spreadBps,
      bidDepthMinor,
      askDepthMinor,
      totalDepthMinor,
      orderBookImbalance,
      shortTermReturnPct,
      volatilityBps,
      sentimentScore: asset.sentimentScore,
      newsBias,
      fundingRateBps,
      basisBps,
      liquidationRiskScore,
      memeRegime,
      computedAt: new Date(nowMs).toISOString(),
    };
  }

  /**
   * Computes public news sentiment bias (-1..+1) affecting a specific asset.
   */
  computePublicNewsBias(asset: Asset, recentNews: NewsItem[], nowMs = Date.now()): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const item of recentNews.slice(0, 15)) {
      const ageMs = Math.max(0, nowMs - new Date(item.publishedAt).getTime());
      if (ageMs > this.newsDecayHalfLifeMs * 4) continue;

      const directMatch = item.relatedSymbols.includes(asset.symbol);
      const classMatch =
        (item.category === 'CRYPTO' && asset.marketClass === 'CRYPTO') ||
        ((item.category === 'CORPORATE' || item.category === 'MARKET') && asset.marketClass === 'STOCK') ||
        (item.category === 'FOREX' && asset.marketClass === 'FOREX');
      const macroMatch = item.category === 'MACRO';

      const relevance = directMatch ? 1.0 : classMatch ? 0.55 : macroMatch ? 0.35 : 0;
      if (relevance <= 0) continue;

      const decay = Math.pow(0.5, ageMs / this.newsDecayHalfLifeMs);
      const dir = item.sentiment === 'POSITIVE' ? 1 : item.sentiment === 'NEGATIVE' ? -1 : 0;
      if (dir === 0) continue;

      weightedSum += dir * relevance * decay;
      totalWeight += relevance * decay;
    }

    if (totalWeight <= 0) return 0;
    return Number(Math.max(-1, Math.min(1, weightedSum / Math.max(1, totalWeight))).toFixed(3));
  }

  /**
   * Classifies emergent Meme Coin microstructure regime purely from observable market depth,
   * order-book imbalance, realized volatility, and whale flow.
   */
  classifyMemeRegime(input: {
    isMemeCoin: boolean;
    shortTermReturnPct: number;
    volatilityBps: number;
    spreadBps: number;
    orderBookImbalance: number;
    totalDepthMinor: number;
    liquidationRiskScore: number;
    whaleNetFlowBias: number;
  }): MemeMarketRegime {
    if (!input.isMemeCoin) return 'CALM';

    if (input.shortTermReturnPct <= -3.5 || (input.liquidationRiskScore >= 0.7 && input.shortTermReturnPct < -1.2)) {
      return 'PANIC_SELLING';
    }
    if (input.spreadBps >= 260 || input.totalDepthMinor < 200_000_00) {
      return 'LIQUIDITY_WITHDRAWAL';
    }
    if (input.whaleNetFlowBias <= -0.35 && input.shortTermReturnPct > 1.0) {
      return 'WHALE_DISTRIBUTION';
    }
    if (input.shortTermReturnPct >= 2.2 || (input.orderBookImbalance >= 0.32 && input.volatilityBps >= 90)) {
      return 'RETAIL_FOMO';
    }
    if (input.whaleNetFlowBias >= 0.25 && input.orderBookImbalance > 0.08) {
      return 'WHALE_ACCUMULATION';
    }
    return 'CALM';
  }

  /**
   * Computes per-agent Adaptive Intelligence parameters using all 9 market & performance inputs:
   * Volatility, Liquidity, Market Depth, Economic News, Order Book Imbalance,
   * Recent Performance (drawdown), Market Sentiment, Funding Rates, and Liquidation Risk.
   */
  computeAdaptiveProfile(params: {
    config: BotAgentConfig;
    signal: MarketSignalSnapshot;
    economy: EconomyState;
    currentDrawdownPct: number;
    recentWinRate: number; // 0..1
  }): BotAdaptiveProfile {
    const { config, signal, economy, currentDrawdownPct, recentWinRate } = params;

    // 1. Volatility factor
    const volRatio = Math.min(3.0, Math.max(0.5, signal.volatilityBps / 60));
    const regimeMult =
      economy.volatilityRegime === 'MARKET_PANIC'
        ? 2.2
        : economy.volatilityRegime === 'HIGH_VOLATILITY'
          ? 1.5
          : economy.volatilityRegime === 'LOW_VOLATILITY'
            ? 0.8
            : 1.0;

    // 2. Depth & Liquidity factor (thin book -> widen spread, reduce market-order size)
    const thinLiquidity = signal.totalDepthMinor < 500_000_00 || signal.spreadBps > 180;
    const liquidityScalar = thinLiquidity ? 0.65 : 1.0;

    // 3. Recent performance / Drawdown throttling (losing bots automatically tighten risk)
    const ddRatio = config.maxDrawdownPct > 0 ? currentDrawdownPct / config.maxDrawdownPct : 0;
    const performanceScalar = Math.max(0.3, Math.min(1.25, (1 - ddRatio * 0.65) * (0.8 + recentWinRate * 0.4)));

    // 4. Archetype-specific spread & liquidity withdrawal behavior
    const spreadMultiplier = Number(
      Math.max(
        0.75,
        Math.min(
          4.0,
          (0.85 + volRatio * 0.45) * regimeMult * (thinLiquidity ? 1.25 : 1.0) * (1.15 - config.riskTolerance * 0.3),
        ),
      ).toFixed(2),
    );

    const liquidityWithdrawalActive =
      config.archetype === 'MARKET_MAKER' &&
      (signal.liquidationRiskScore >= 0.62 ||
        (signal.isMemeCoin && signal.volatilityBps >= 180) ||
        economy.volatilityRegime === 'MARKET_PANIC');

    // 5. Leverage cap adapts downward when volatility or liquidation risk surges
    const riskAdjustedLev = Math.max(
      1,
      Math.round(
        config.maxLeverage *
          (1 - signal.liquidationRiskScore * 0.55) *
          (1 - ddRatio * 0.45),
      ),
    );
    const effectiveMaxLeverage = Math.min(config.maxLeverage, Math.max(1, riskAdjustedLev));

    // 6. Composite directional sentiment bias (strictly divergent across archetypes!)
    const rawSentiment = signal.sentimentScore / 100;
    const fundingPenalty = Math.max(-0.5, Math.min(0.5, -signal.fundingRateBps / 25)); // High positive funding penalizes crowding longs
    let sentimentBias =
      rawSentiment * 0.3 +
      signal.orderBookImbalance * 0.25 +
      signal.newsBias * config.newsSensitivity * 0.45 +
      fundingPenalty * 0.2;

    if (config.archetype === 'CONTRARIAN_TRADER') {
      // Contrarian naturally inverts crowd euphoria / panic
      sentimentBias = -sentimentBias * 0.9 - (signal.shortTermReturnPct / 10);
    } else if (config.archetype === 'MEME_SPECULATOR') {
      // Meme speculator amplifies momentum & social sentiment
      sentimentBias = sentimentBias * 1.35 + (signal.shortTermReturnPct / 6);
    } else if (config.archetype === 'INSTITUTIONAL_FUND') {
      // Institutional fund weights macro phase & avoids chasing spikes
      const macroTilt =
        economy.phase === 'BOOM' || economy.phase === 'EXPANSION'
          ? 0.22
          : economy.phase === 'RECESSION' || economy.phase === 'SLOWDOWN'
            ? -0.22
            : 0.05;
      sentimentBias = sentimentBias * 0.55 + macroTilt;
    }

    // Per-agent deterministic biasSeed offset guarantees heterogeneous beliefs
    const personalTilt = ((config.biasSeed % 21) - 10) * 0.018;
    sentimentBias = Number(Math.max(-1, Math.min(1, sentimentBias + personalTilt)).toFixed(3));

    const sizeScalar = Number(
      Math.max(0.25, Math.min(1.5, liquidityScalar * performanceScalar * (0.7 + config.riskTolerance * 0.6))).toFixed(2),
    );

    return {
      volatilityScalar: Number(Math.max(0.35, Math.min(1.6, volRatio)).toFixed(2)),
      spreadMultiplier,
      sizeScalar,
      effectiveMaxLeverage,
      liquidityWithdrawalActive,
      sentimentBias,
    };
  }
}
