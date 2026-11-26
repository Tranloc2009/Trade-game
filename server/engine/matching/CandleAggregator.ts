import { CR_SCALE } from '../../../shared/contracts/money';
import { ALL_TIMEFRAMES, type Candle, type Timeframe, type Trade } from '../../../shared/contracts/types';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

/**
 * Deterministic PRNG (Mulberry32) used ONLY for initial simulated historical seed data
 * before server boot. After server boot, ALL candle updates come strictly from real matched trades.
 */
function seededRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CandleAggregator {
  private candles = new Map<string, Map<Timeframe, Candle[]>>();
  private precisionBySymbol = new Map<string, { scale: number; decimals: number }>();

  clear(): void {
    this.candles.clear();
    this.precisionBySymbol.clear();
  }

  setSymbolPrecision(symbol: string, scale = CR_SCALE, decimals = 2): void {
    this.precisionBySymbol.set(symbol, { scale, decimals });
  }

  /**
   * Generates deterministic historical simulated candles ending right BEFORE the current live bucket.
   * Marked explicitly with `isHistoricalSeed: true` so live matched trade candles (`isHistoricalSeed: false`)
   * never mix seeded volume with real matched trade volume.
   */
  seedSymbol(
    symbol: string,
    basePriceMinor: number,
    volatilityFactor = 0.014,
    nowMs = Date.now(),
    priceScale = CR_SCALE,
    priceDecimals = 2,
  ): void {
    this.precisionBySymbol.set(symbol, { scale: priceScale, decimals: priceDecimals });

    const tfMap = new Map<Timeframe, Candle[]>();
    const endPrice = basePriceMinor / priceScale;
    const nowSec = Math.floor(nowMs / 1000);
    const minTick = 1 / priceScale;

    for (const tf of ALL_TIMEFRAMES) {
      const stepSec = TIMEFRAME_SECONDS[tf];
      const count = 80;
      const rng = seededRng(`${symbol}:${tf}:WORLD-01`);
      // End historical seed one bucket before current time so live trades start a pure live bucket
      const lastHistoricalBucket = Math.floor(nowSec / stepSec) * stepSec - stepSec;

      const closes: number[] = new Array(count);
      closes[count - 1] = Number(endPrice.toFixed(priceDecimals));
      const tfScale = Math.sqrt(stepSec / 300);

      for (let i = count - 2; i >= 0; i--) {
        const drift = (rng() - 0.5) * 2 * volatilityFactor * Math.min(tfScale, 2.5);
        const prev = Math.max(endPrice * 0.82, Math.min(endPrice * 1.18, closes[i + 1] / (1 + drift)));
        closes[i] = Number(prev.toFixed(priceDecimals));
      }

      const series: Candle[] = [];
      for (let i = 0; i < count; i++) {
        const bucketTime = lastHistoricalBucket - (count - 1 - i) * stepSec;
        const open = i === 0 ? closes[0] : closes[i - 1];
        const close = closes[i];
        const wickSpan = Math.max(
          minTick * 2,
          Math.abs(close - open) + close * volatilityFactor * Math.min(1, tfScale) * 0.35 * rng(),
        );
        const high = Number((Math.max(open, close) + wickSpan * rng()).toFixed(priceDecimals));
        const low = Number(Math.max(minTick, Math.min(open, close) - wickSpan * rng()).toFixed(priceDecimals));
        const volume = Number((Math.max(1, 15 * tfScale) + rng() * 140 * Math.max(0.15, tfScale)).toFixed(2));

        series.push({
          time: bucketTime,
          open: Number(open.toFixed(priceDecimals)),
          high,
          low,
          close: Number(close.toFixed(priceDecimals)),
          volume,
          isHistoricalSeed: true,
        });
      }
      tfMap.set(tf, series);
    }

    this.candles.set(symbol, tfMap);
  }

  /**
   * Updates every timeframe candle strictly from an executed trade event.
   * Never fabricates candles or volume without real matched trades.
   * Handles duplicate/out-of-order trade timestamps without breaking ascending time order.
   */
  recordTrade(trade: Trade): Record<Timeframe, Candle> {
    const tfMap = this.candles.get(trade.symbol) ?? new Map<Timeframe, Candle[]>();
    if (!this.candles.has(trade.symbol)) {
      this.candles.set(trade.symbol, tfMap);
    }

    const prec = this.precisionBySymbol.get(trade.symbol) ?? { scale: CR_SCALE, decimals: 2 };
    const parsedMs = Date.parse(trade.timestamp);
    const tradeSec = Math.floor((Number.isFinite(parsedMs) ? parsedMs : Date.now()) / 1000);
    const price = Number((trade.priceMinor / prec.scale).toFixed(prec.decimals));
    const qty = Math.max(0, Number.isFinite(trade.quantity) ? trade.quantity : 0);
    const updated = {} as Record<Timeframe, Candle>;

    for (const tf of ALL_TIMEFRAMES) {
      const stepSec = TIMEFRAME_SECONDS[tf];
      const bucketTime = Math.floor(tradeSec / stepSec) * stepSec;
      let series = tfMap.get(tf);
      if (!series) {
        series = [];
        tfMap.set(tf, series);
      }

      const last = series[series.length - 1];
      if (last && last.time === bucketTime) {
        if (last.isHistoricalSeed) {
          // Transition cleanly from historical seed to real live trade data
          last.open = price;
          last.high = price;
          last.low = price;
          last.close = price;
          last.volume = Number(qty.toFixed(4));
          last.isHistoricalSeed = false;
        } else {
          last.high = Math.max(last.high, price);
          last.low = Math.min(last.low, price);
          last.close = price;
          last.volume = Number((last.volume + qty).toFixed(4));
        }
        updated[tf] = { ...last };
      } else if (last && bucketTime < last.time) {
        // Out-of-order older trade: update matching historical bucket if present, preserve ascending order
        const existingIdx = series.findIndex((c) => c.time === bucketTime);
        if (existingIdx !== -1) {
          const target = series[existingIdx];
          target.high = Math.max(target.high, price);
          target.low = Math.min(target.low, price);
          target.close = price;
          target.volume = Number((target.volume + qty).toFixed(4));
          target.isHistoricalSeed = false;
        }
        updated[tf] = { ...last };
      } else {
        const openPrice = last ? last.close : price;
        const candle: Candle = {
          time: bucketTime,
          open: openPrice,
          high: Math.max(openPrice, price),
          low: Math.min(openPrice, price),
          close: price,
          volume: Number(qty.toFixed(4)),
          isHistoricalSeed: false,
        };
        series.push(candle);
        if (series.length > 360) {
          series.shift();
        }
        updated[tf] = { ...candle };
      }
    }

    return updated;
  }

  /**
   * Returns the latest authoritative candle for every timeframe as `Record<Timeframe, Candle>`.
   * Guarantees the canonical realtime contract shape (`Record<Timeframe, Candle>`, never `Candle[]`).
   */
  getLatestCandlesByTimeframe(symbol: string): Record<Timeframe, Candle> | null {
    const tfMap = this.candles.get(symbol);
    if (!tfMap) return null;

    const result = {} as Record<Timeframe, Candle>;
    let foundAny = false;
    for (const tf of ALL_TIMEFRAMES) {
      const series = tfMap.get(tf);
      const last = series && series.length > 0 ? series[series.length - 1] : null;
      if (last) {
        result[tf] = { ...last };
        foundAny = true;
      }
    }
    return foundAny ? result : null;
  }

  getLatestCandle(symbol: string, timeframe: Timeframe): Candle | null {
    const series = this.candles.get(symbol)?.get(timeframe);
    if (!series || series.length === 0) return null;
    return { ...series[series.length - 1] };
  }

  getCandles(symbol: string, timeframe: Timeframe, limit = 120): Candle[] {
    const series = this.candles.get(symbol)?.get(timeframe) ?? [];
    return series.slice(-limit).map((c) => ({ ...c }));
  }
}

