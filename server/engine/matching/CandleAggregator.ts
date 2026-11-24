import { CR_SCALE } from '../../../shared/contracts/money';
import type { Candle, Timeframe, Trade } from '../../../shared/contracts/types';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

const ALL_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

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
   * Generates deterministic historical simulated candles ending at `basePriceMinor` right before server boot.
   * Marked explicitly with `isHistoricalSeed: true`.
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
      const lastBucket = Math.floor(nowSec / stepSec) * stepSec;

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
        const bucketTime = lastBucket - (count - 1 - i) * stepSec;
        const open = i === 0 ? closes[0] : closes[i - 1];
        const close = closes[i];
        const wickSpan = Math.max(minTick * 2, Math.abs(close - open) + close * volatilityFactor * 0.35 * rng());
        const high = Number((Math.max(open, close) + wickSpan * rng()).toFixed(priceDecimals));
        const low = Number(Math.max(minTick, Math.min(open, close) - wickSpan * rng()).toFixed(priceDecimals));
        const volume = Number((15 + rng() * 140 * Math.max(1, tfScale)).toFixed(2));

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
   */
  recordTrade(trade: Trade): Record<Timeframe, Candle> {
    const tfMap = this.candles.get(trade.symbol) ?? new Map<Timeframe, Candle[]>();
    if (!this.candles.has(trade.symbol)) {
      this.candles.set(trade.symbol, tfMap);
    }

    const prec = this.precisionBySymbol.get(trade.symbol) ?? { scale: CR_SCALE, decimals: 2 };
    const tradeSec = Math.floor(new Date(trade.timestamp).getTime() / 1000);
    const price = Number((trade.priceMinor / prec.scale).toFixed(prec.decimals));
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
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.volume = Number((last.volume + trade.quantity).toFixed(4));
        last.isHistoricalSeed = false;
        updated[tf] = { ...last };
      } else {
        const candle: Candle = {
          time: bucketTime,
          open: last ? last.close : price,
          high: Math.max(last ? last.close : price, price),
          low: Math.min(last ? last.close : price, price),
          close: price,
          volume: Number(trade.quantity.toFixed(4)),
          isHistoricalSeed: false,
        };
        series.push(candle);
        if (series.length > 300) {
          series.shift();
        }
        updated[tf] = { ...candle };
      }
    }

    return updated;
  }

  getCandles(symbol: string, timeframe: Timeframe, limit = 120): Candle[] {
    const series = this.candles.get(symbol)?.get(timeframe) ?? [];
    return series.slice(-limit).map((c) => ({ ...c }));
  }
}
