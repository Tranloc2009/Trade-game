import type { Candle, Timeframe } from '../../shared/contracts/types';

export interface CandlePointUpdate {
  accepted: boolean;
  reason?: 'invalid' | 'out_of_order' | 'stale';
  series: Candle[];
  latest: Candle | null;
}

/**
 * Sorts and deduplicates candles in strict ascending `time` order, filtering malformed entries.
 */
export function normalizeCandleSeries(candles: Candle[]): Candle[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const valid = candles.filter(
    (c) =>
      c &&
      Number.isFinite(c.time) &&
      c.time > 0 &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume),
  );
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (const c of sorted) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) {
      const prev = deduped[deduped.length - 1];
      // Prefer live matched trade candle over historical seed on identical timestamp
      deduped[deduped.length - 1] = !c.isHistoricalSeed || prev.isHistoricalSeed ? { ...c } : prev;
    } else {
      deduped.push({ ...c });
    }
  }
  return deduped;
}

/**
 * Merges a single incoming realtime candle into an existing sorted candle array.
 * Rejects out-of-order candles (`live.time < last.time`) so `lightweight-charts` never throws.
 * Handles duplicate timestamp ticks cleanly as in-place OHLCV updates.
 */
export function mergeLiveCandleIntoSeries(series: Candle[], live: Candle | null | undefined): CandlePointUpdate {
  if (
    !live ||
    !Number.isFinite(live.time) ||
    live.time <= 0 ||
    !Number.isFinite(live.open) ||
    !Number.isFinite(live.high) ||
    !Number.isFinite(live.low) ||
    !Number.isFinite(live.close)
  ) {
    return { accepted: false, reason: 'invalid', series, latest: series[series.length - 1] ?? null };
  }

  if (series.length === 0) {
    const next = [{ ...live }];
    return { accepted: true, series: next, latest: next[0] };
  }

  const last = series[series.length - 1];
  if (live.time < last.time) {
    return { accepted: false, reason: 'out_of_order', series, latest: last };
  }

  if (live.time === last.time) {
    // Reject stale historical seed overwriting an already-live candle
    if (live.isHistoricalSeed && !last.isHistoricalSeed) {
      return { accepted: false, reason: 'stale', series, latest: last };
    }
    const next = [...series];
    next[next.length - 1] = { ...live };
    return { accepted: true, series: next, latest: next[next.length - 1] };
  }

  const next = [...series, { ...live }];
  if (next.length > 360) {
    next.shift();
  }
  return { accepted: true, series: next, latest: next[next.length - 1] };
}

/**
 * Reconciles a freshly fetched historical snapshot with any newer realtime candle
 * that may have already arrived while the HTTP request was in flight.
 */
export function reconcileHistoricalWithLive(
  historical: Candle[],
  currentLive: Candle | null | undefined,
): Candle[] {
  const normalized = normalizeCandleSeries(historical);
  if (!currentLive) return normalized;
  const merged = mergeLiveCandleIntoSeries(normalized, currentLive);
  return merged.accepted ? merged.series : normalized;
}

/**
 * Validates that an incoming realtime candle payload conforms strictly to `Record<Timeframe, Candle>`
 * (rejecting legacy `Candle[]` arrays or malformed payloads).
 */
export function extractLiveCandleForTimeframe(
  payload: { symbol?: string; candles?: unknown } | null | undefined,
  expectedSymbol: string,
  timeframe: Timeframe,
): Candle | null {
  if (!payload || payload.symbol !== expectedSymbol) return null;
  if (!payload.candles || Array.isArray(payload.candles) || typeof payload.candles !== 'object') {
    return null;
  }
  const candidate = (payload.candles as Record<string, unknown>)[timeframe] as Candle | undefined;
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !Number.isFinite(candidate.time) ||
    !Number.isFinite(candidate.close)
  ) {
    return null;
  }
  return candidate;
}
