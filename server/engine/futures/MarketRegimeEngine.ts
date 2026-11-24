import type { FuturesMarketRegime, FuturesRegimeState } from '../../../shared/contracts/futures';

export interface RegimePolicy {
  regime: FuturesMarketRegime;
  leverageCapMultiplier: number; // Scales contract max leverage for NEW orders only
  maxLeverageHardCap: number; // Absolute cap in this regime
  spreadMultiplier: number; // Scales MM quote spreads
  depthMultiplier: number; // Scales MM quoted depth
  botFrequencyMultiplier: number;
  warningMessage: string | null;
}

export const MARKET_REGIME_POLICIES: Record<FuturesMarketRegime, RegimePolicy> = {
  NORMAL: {
    regime: 'NORMAL',
    leverageCapMultiplier: 1.0,
    maxLeverageHardCap: 125,
    spreadMultiplier: 1.0,
    depthMultiplier: 1.0,
    botFrequencyMultiplier: 1.0,
    warningMessage: null,
  },
  HIGH_VOLATILITY: {
    regime: 'HIGH_VOLATILITY',
    leverageCapMultiplier: 0.75,
    maxLeverageHardCap: 75,
    spreadMultiplier: 1.85,
    depthMultiplier: 0.72,
    botFrequencyMultiplier: 1.35,
    warningMessage: 'Biến động cao: đòn bẩy tối đa cho lệnh mới được thu hẹp và chênh lệch giá (spread) giãn rộng.',
  },
  EXTREME_VOLATILITY: {
    regime: 'EXTREME_VOLATILITY',
    leverageCapMultiplier: 0.5,
    maxLeverageHardCap: 25,
    spreadMultiplier: 3.1,
    depthMultiplier: 0.42,
    botFrequencyMultiplier: 1.65,
    warningMessage: 'Biến động cực đoan: giới hạn đòn bẩy lệnh mới tối đa 25x; rủi ro trượt giá và thanh lý dây chuyền rất cao.',
  },
  LIQUIDITY_CRISIS: {
    regime: 'LIQUIDITY_CRISIS',
    leverageCapMultiplier: 0.5,
    maxLeverageHardCap: 10,
    spreadMultiplier: 4.5,
    depthMultiplier: 0.25,
    botFrequencyMultiplier: 0.55,
    warningMessage: 'Khủng hoảng thanh khoản: sổ lệnh mỏng bất thường; đòn bẩy lệnh mới bị giới hạn tối đa 10x.',
  },
  RECOVERY: {
    regime: 'RECOVERY',
    leverageCapMultiplier: 0.8,
    maxLeverageHardCap: 75,
    spreadMultiplier: 1.25,
    depthMultiplier: 0.85,
    botFrequencyMultiplier: 1.1,
    warningMessage: 'Giai đoạn phục hồi: thanh khoản đang ổn định trở lại sau biến động mạnh.',
  },
};

interface SymbolRegimeTracker {
  regime: FuturesMarketRegime;
  overrideRegime: FuturesMarketRegime | null;
  recentPrices: number[];
  recentLiquidationTimestamps: number[];
  realizedVolatilityPct: number;
  spreadBps: number;
  bookDepthMinor: number;
  lastTransitionAt: string;
  enteredCrisisOrExtremeAtMs: number | null;
}

/**
 * Tracks per-contract market regimes driven strictly by real observable market telemetry:
 * realized return volatility, order-book spread/depth, and liquidation cadence.
 *
 * Regime changes restrict NEW order leverage and widen MM quotes without retroactively
 * invalidating already-open positions' initial margin contracts.
 */
export class MarketRegimeEngine {
  private readonly trackers = new Map<string, SymbolRegimeTracker>();

  reset(): void {
    this.trackers.clear();
  }

  registerSymbol(symbol: string, initialPriceInt: number): void {
    this.trackers.set(symbol, {
      regime: 'NORMAL',
      overrideRegime: null,
      recentPrices: [initialPriceInt],
      recentLiquidationTimestamps: [],
      realizedVolatilityPct: 0.5,
      spreadBps: 15,
      bookDepthMinor: 500_000_00,
      lastTransitionAt: new Date().toISOString(),
      enteredCrisisOrExtremeAtMs: null,
    });
  }

  recordLiquidation(symbol: string, nowMs = Date.now()): void {
    const tracker = this.trackers.get(symbol);
    if (!tracker) return;
    tracker.recentLiquidationTimestamps.push(nowMs);
    const cutoff = nowMs - 120_000;
    while (tracker.recentLiquidationTimestamps.length > 0 && tracker.recentLiquidationTimestamps[0] < cutoff) {
      tracker.recentLiquidationTimestamps.shift();
    }
  }

  setRegimeOverride(symbol: string, regime: FuturesMarketRegime | null): FuturesRegimeState | null {
    const tracker = this.trackers.get(symbol);
    if (!tracker) return null;
    tracker.overrideRegime = regime;
    if (regime) {
      tracker.regime = regime;
      tracker.lastTransitionAt = new Date().toISOString();
    }
    return this.getRegimeState(symbol);
  }

  evaluate(
    symbol: string,
    latestPriceInt: number,
    spreadBps: number | null,
    bookDepthMinor: number,
    nowMs = Date.now(),
  ): { state: FuturesRegimeState; changed: boolean } {
    let tracker = this.trackers.get(symbol);
    if (!tracker) {
      this.registerSymbol(symbol, latestPriceInt);
      tracker = this.trackers.get(symbol)!;
    }

    if (latestPriceInt > 0) {
      const last = tracker.recentPrices[tracker.recentPrices.length - 1];
      if (last !== latestPriceInt) {
        tracker.recentPrices.push(latestPriceInt);
        if (tracker.recentPrices.length > 32) {
          tracker.recentPrices.shift();
        }
      }
    }

    // Prune old liquidations (> 2 mins)
    const cutoff = nowMs - 120_000;
    while (tracker.recentLiquidationTimestamps.length > 0 && tracker.recentLiquidationTimestamps[0] < cutoff) {
      tracker.recentLiquidationTimestamps.shift();
    }

    // Compute realized volatility (root-mean-square step return %)
    let sumSq = 0;
    let count = 0;
    for (let i = 1; i < tracker.recentPrices.length; i++) {
      const prev = tracker.recentPrices[i - 1];
      const curr = tracker.recentPrices[i];
      if (prev > 0) {
        const retPct = ((curr - prev) / prev) * 100;
        sumSq += retPct * retPct;
        count++;
      }
    }
    const realizedVolPct = count > 0 ? Number(Math.sqrt(sumSq / count).toFixed(3)) : 0.4;
    tracker.realizedVolatilityPct = realizedVolPct;
    tracker.spreadBps = spreadBps ?? 9999;
    tracker.bookDepthMinor = bookDepthMinor;

    const prevRegime = tracker.regime;
    let nextRegime: FuturesMarketRegime;

    if (tracker.overrideRegime) {
      nextRegime = tracker.overrideRegime;
    } else {
      const liqCount = tracker.recentLiquidationTimestamps.length;
      const thinBook = bookDepthMinor < 20_000_00 || (spreadBps !== null && spreadBps >= 1000) || spreadBps === null;

      if (thinBook && (realizedVolPct >= 2.5 || liqCount >= 2 || bookDepthMinor < 5_000_00)) {
        nextRegime = 'LIQUIDITY_CRISIS';
        tracker.enteredCrisisOrExtremeAtMs = nowMs;
      } else if (realizedVolPct >= 4.0 || liqCount >= 4) {
        nextRegime = 'EXTREME_VOLATILITY';
        tracker.enteredCrisisOrExtremeAtMs = nowMs;
      } else if (realizedVolPct >= 1.8 || liqCount >= 2 || (spreadBps !== null && spreadBps >= 650)) {
        nextRegime = 'HIGH_VOLATILITY';
      } else if (
        (prevRegime === 'LIQUIDITY_CRISIS' || prevRegime === 'EXTREME_VOLATILITY' || prevRegime === 'RECOVERY') &&
        tracker.enteredCrisisOrExtremeAtMs !== null &&
        nowMs - tracker.enteredCrisisOrExtremeAtMs < 90_000
      ) {
        nextRegime = 'RECOVERY';
      } else {
        nextRegime = 'NORMAL';
        tracker.enteredCrisisOrExtremeAtMs = null;
      }
    }

    const changed = nextRegime !== prevRegime;
    if (changed) {
      tracker.regime = nextRegime;
      tracker.lastTransitionAt = new Date(nowMs).toISOString();
    }

    return {
      state: this.getRegimeState(symbol)!,
      changed,
    };
  }

  getPolicy(symbol: string): RegimePolicy {
    const tracker = this.trackers.get(symbol);
    return MARKET_REGIME_POLICIES[tracker?.regime ?? 'NORMAL'];
  }

  getEffectiveMaxLeverage(symbol: string, contractMaxLeverage: number): number {
    const policy = this.getPolicy(symbol);
    const scaled = Math.max(1, Math.floor(contractMaxLeverage * policy.leverageCapMultiplier));
    return Math.min(contractMaxLeverage, policy.maxLeverageHardCap, scaled);
  }

  getRegimeState(symbol: string): FuturesRegimeState | null {
    const tracker = this.trackers.get(symbol);
    if (!tracker) return null;
    const policy = MARKET_REGIME_POLICIES[tracker.regime];
    return {
      symbol,
      regime: tracker.regime,
      realizedVolatilityPct: tracker.realizedVolatilityPct,
      spreadBps: tracker.spreadBps,
      bookDepthMinor: tracker.bookDepthMinor,
      recentLiquidationCount: tracker.recentLiquidationTimestamps.length,
      leverageCapMultiplier: policy.leverageCapMultiplier,
      maxLeverageHardCap: policy.maxLeverageHardCap,
      spreadMultiplier: policy.spreadMultiplier,
      depthMultiplier: policy.depthMultiplier,
      warningMessage: policy.warningMessage,
      isManualOverride: tracker.overrideRegime !== null,
      lastTransitionAt: tracker.lastTransitionAt,
    };
  }

  listAllRegimes(): FuturesRegimeState[] {
    const out: FuturesRegimeState[] = [];
    for (const sym of this.trackers.keys()) {
      const s = this.getRegimeState(sym);
      if (s) out.push(s);
    }
    return out;
  }
}
