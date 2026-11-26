import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candle, Timeframe } from '../../shared/contracts/types';
import {
  extractLiveCandleForTimeframe,
  mergeLiveCandleIntoSeries,
  normalizeCandleSeries,
  reconcileHistoricalWithLive,
} from './chartSync';

function makeCandle(time: number, close: number, volume = 10): Candle {
  return {
    time,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume,
    isHistoricalSeed: false,
  };
}

test('normalizeCandleSeries deduplicates, sorts ascending, and drops invalid candles', () => {
  const input: Candle[] = [
    makeCandle(200, 105, 5),
    makeCandle(100, 100, 10),
    makeCandle(200, 108, 12), // newer update for bucket 200
    { time: Number.NaN, open: 1, high: 1, low: 1, close: 1, volume: 1, isHistoricalSeed: false },
    makeCandle(150, 102, 7),
  ];

  const result = normalizeCandleSeries(input);
  assert.deepEqual(
    result.map((c) => c.time),
    [100, 150, 200],
  );
  assert.equal(result[2].close, 108);
  assert.equal(result[2].volume, 12);
});

test('mergeLiveCandleIntoSeries appends newer bucket, updates latest bucket, and ignores stale older bucket', () => {
  const base = [makeCandle(100, 50, 4), makeCandle(105, 52, 6)];

  // Same bucket update -> replaces last candle
  const updated = mergeLiveCandleIntoSeries(base, makeCandle(105, 54, 9));
  assert.equal(updated.accepted, true);
  assert.equal(updated.series.length, 2);
  assert.equal(updated.series[1].close, 54);
  assert.equal(updated.series[1].volume, 9);

  // Newer bucket -> appends
  const appended = mergeLiveCandleIntoSeries(updated.series, makeCandle(110, 56, 3));
  assert.equal(appended.accepted, true);
  assert.equal(appended.series.length, 3);
  assert.equal(appended.series[2].time, 110);

  // Older stale bucket -> ignored so chart never regresses
  const stale = mergeLiveCandleIntoSeries(appended.series, makeCandle(105, 40, 1));
  assert.equal(stale.accepted, false);
  assert.equal(stale.series.length, 3);
  assert.equal(stale.series[1].close, 54);
});

test('reconcileHistoricalWithLive merges historical snapshot with newer live candle cleanly', () => {
  const historical = [makeCandle(100, 50, 10), makeCandle(105, 51, 8)];
  const live = makeCandle(110, 53, 2);
  const reconciled = reconcileHistoricalWithLive(historical, live);
  assert.deepEqual(
    reconciled.map((c) => c.time),
    [100, 105, 110],
  );
  assert.equal(reconciled[2].close, 53);
});

test('extractLiveCandleForTimeframe rejects arrays, mismatched symbols, and malformed payloads', () => {
  const validMap = {
    '5s': makeCandle(1000, 50, 5),
    '15s': makeCandle(990, 50, 5),
    '30s': makeCandle(990, 50, 5),
    '1m': makeCandle(960, 50, 5),
    '5m': makeCandle(900, 50, 5),
    '15m': makeCandle(900, 50, 5),
    '1h': makeCandle(0, 50, 5),
    '4h': makeCandle(0, 50, 5),
    '1D': makeCandle(0, 50, 5),
  } as Record<Timeframe, Candle>;

  assert.equal(
    extractLiveCandleForTimeframe({ symbol: 'BTC-SIM', candles: validMap }, 'BTC-SIM', '5s')?.close,
    50,
  );
  assert.equal(
    extractLiveCandleForTimeframe({ symbol: 'ETH-SIM', candles: validMap }, 'BTC-SIM', '5s'),
    null,
  );
  assert.equal(
    extractLiveCandleForTimeframe(
      { symbol: 'BTC-SIM', candles: [makeCandle(1000, 50, 5)] as unknown as Record<Timeframe, Candle> },
      'BTC-SIM',
      '5s',
    ),
    null,
  );
});
