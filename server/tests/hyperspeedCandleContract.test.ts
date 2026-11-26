import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TIMEFRAMES, type Candle, type RealtimeEnvelope, type Timeframe, type Trade } from '../../shared/contracts/types';
import { CandleAggregator } from '../engine/matching/CandleAggregator';
import { WorldEngine } from '../engine/WorldEngine';
import {
  extractLiveCandleForTimeframe,
  mergeLiveCandleIntoSeries,
  normalizeCandleSeries,
  reconcileHistoricalWithLive,
} from '../../src/lib/chartSync';

function assertValidCandleRecord(candles: unknown, label: string): void {
  assert.equal(Array.isArray(candles), false, `${label}: candles must NOT be an array`);
  assert.equal(typeof candles, 'object', `${label}: candles must be an object`);
  assert.ok(candles !== null, `${label}: candles must not be null`);
  const rec = candles as Record<Timeframe, Candle>;
  for (const tf of ALL_TIMEFRAMES) {
    const c = rec[tf];
    assert.ok(c, `${label}: missing timeframe ${tf}`);
    assert.equal(typeof c.time, 'number', `${label}[${tf}].time must be number`);
    assert.equal(typeof c.open, 'number', `${label}[${tf}].open must be number`);
    assert.equal(typeof c.high, 'number', `${label}[${tf}].high must be number`);
    assert.equal(typeof c.low, 'number', `${label}[${tf}].low must be number`);
    assert.equal(typeof c.close, 'number', `${label}[${tf}].close must be number`);
    assert.equal(typeof c.volume, 'number', `${label}[${tf}].volume must be number`);
    assert.ok(c.high >= c.low, `${label}[${tf}] high >= low`);
  }
}

test('CandleAggregator supports 5s/15s/30s..1D, separates historical seed from live trades, and guards out-of-order ticks', () => {
  const agg = new CandleAggregator();
  const baseMs = Date.UTC(2026, 10, 25, 10, 0, 0);
  agg.seedSymbol('BTC-SIM', 50_000_00, 0.015, baseMs, 100, 2);

  for (const tf of ALL_TIMEFRAMES) {
    const seeded = agg.getCandles('BTC-SIM', tf, 100);
    assert.equal(seeded.length, 80, `seeded ${tf} length`);
    assert.equal(seeded[seeded.length - 1].isHistoricalSeed, true, `seeded ${tf} flagged as historical`);
  }

  // Record a real matched trade at baseMs + 1s (new live bucket, never mixing seed volume)
  const trade1: Trade = {
    id: 'trd_1',
    worldId: 'WORLD-01',
    symbol: 'BTC-SIM',
    buyOrderId: 'b1',
    sellOrderId: 's1',
    buyerId: 'p1',
    buyerName: 'P1',
    sellerId: 'p2',
    sellerName: 'P2',
    priceMinor: 50_100_00,
    quantity: 1.5,
    grossAmountMinor: 75_150_00,
    buyerFeeMinor: 75_15,
    sellerFeeMinor: 37_58,
    takerSide: 'BUY',
    timestamp: new Date(baseMs + 1000).toISOString(),
  };

  const res1 = agg.recordTrade(trade1);
  assertValidCandleRecord(res1, 'recordTrade(trade1)');
  assert.equal(res1['5s'].isHistoricalSeed, false);
  assert.equal(res1['5s'].volume, 1.5, 'live bucket volume equals exact matched trade quantity (no seed mixing)');
  assert.equal(res1['5s'].close, 50100);

  // Second trade in same 5s bucket accumulates OHLCV
  const trade2: Trade = {
    ...trade1,
    id: 'trd_2',
    priceMinor: 50_250_00,
    quantity: 2.0,
    timestamp: new Date(baseMs + 3000).toISOString(),
  };
  const res2 = agg.recordTrade(trade2);
  assert.equal(res2['5s'].time, res1['5s'].time);
  assert.equal(res2['5s'].high, 50250);
  assert.equal(res2['5s'].close, 50250);
  assert.equal(res2['5s'].volume, 3.5);

  // Third trade rolls over to next 5s bucket while staying in same 15s bucket
  const trade3: Trade = {
    ...trade1,
    id: 'trd_3',
    priceMinor: 50_200_00,
    quantity: 0.5,
    timestamp: new Date(baseMs + 6000).toISOString(),
  };
  const res3 = agg.recordTrade(trade3);
  assert.equal(res3['5s'].time, res1['5s'].time + 5);
  assert.equal(res3['5s'].open, 50250);
  assert.equal(res3['5s'].close, 50200);
  assert.equal(res3['5s'].volume, 0.5);
  assert.equal(res3['15s'].time, res1['15s'].time);
  assert.equal(res3['15s'].volume, 4.0);

  // Out-of-order older trade does not corrupt ascending series order
  const outOfOrder: Trade = {
    ...trade1,
    id: 'trd_old',
    priceMinor: 50_050_00,
    quantity: 0.25,
    timestamp: new Date(baseMs + 2000).toISOString(),
  };
  agg.recordTrade(outOfOrder);
  const series5s = agg.getCandles('BTC-SIM', '5s', 200);
  for (let i = 1; i < series5s.length; i++) {
    assert.ok(series5s[i].time > series5s[i - 1].time, '5s series must remain strictly ascending');
  }

  const latestRecord = agg.getLatestCandlesByTimeframe('BTC-SIM');
  assertValidCandleRecord(latestRecord, 'getLatestCandlesByTimeframe');
});

test('WorldEngine emits strictly Record<Timeframe, Candle> (never Candle[]) across player, bot, FX, and futures sources with zero double volume', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, devToolsEnabled: true });
  const candleEvents: RealtimeEnvelope[] = [];
  const futuresCandleEvents: RealtimeEnvelope[] = [];

  const unsub = world.eventBus.subscribe((env) => {
    if (env.eventType === 'market.candle.updated') candleEvents.push(env);
    if (env.eventType === 'futures.candle.updated') futuresCandleEvents.push(env);
  });

  try {
    // 1. Player market trade
    const alice = world.loginGuest('AliceHyperspeed', 'ALICE');
    const preLatest5s = world.candles.getLatestCandle('BTC-SIM', '5s');
    const preVol = preLatest5s && !preLatest5s.isHistoricalSeed ? preLatest5s.volume : 0;

    const orderRes = world.placeOrder(alice.profile.id, {
      symbol: 'BTC-SIM',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      idempotencyKey: 'hs_candle_test_1',
    });
    assert.ok(orderRes.trades.length > 0, 'player market order must execute');
    const postLatest5s = world.candles.getLatestCandle('BTC-SIM', '5s');
    assert.ok(postLatest5s && !postLatest5s.isHistoricalSeed, 'live 5s candle created');
    const matchedQty = orderRes.trades.reduce((s, t) => s + t.quantity, 0);
    // Verify zero double recordTrade
    if (preLatest5s && postLatest5s.time === preLatest5s.time && !preLatest5s.isHistoricalSeed) {
      assert.ok(Math.abs(postLatest5s.volume - (preVol + matchedQty)) < 1e-4, 'no double candle volume');
    } else {
      assert.ok(Math.abs(postLatest5s.volume - matchedQty) < 1e-4, 'exact single-recorded live volume');
    }

    // 2. AutonomousBotEngine tick (previously emitted Candle[] bug!)
    world.runAutonomousBotTick({ forceAllAgents: true });

    // 3. Central Bank FX reaction
    world.triggerCentralBankEvent('USD-SIM');

    // 4. Futures bot tick
    world.futuresBots.runFuturesTick(world.economy.state);

    assert.ok(candleEvents.length > 0, 'market.candle.updated events emitted');
    for (const evt of candleEvents) {
      const payload = evt.payload as { symbol: string; candles: unknown };
      assert.equal(typeof payload.symbol, 'string');
      assertValidCandleRecord(payload.candles, `market.candle.updated(${payload.symbol})`);
    }

    assert.ok(futuresCandleEvents.length > 0, 'futures.candle.updated events emitted');
    for (const evt of futuresCandleEvents) {
      const payload = evt.payload as { symbol: string; candles: unknown };
      assert.equal(typeof payload.symbol, 'string');
      assertValidCandleRecord(payload.candles, `futures.candle.updated(${payload.symbol})`);
    }
  } finally {
    unsub();
    world.stopBackgroundLoops();
  }
});

test('chartSync helpers protect against out-of-order ticks, stale snapshots, and legacy array payloads', () => {
  const base: Candle[] = [
    { time: 1000, open: 10, high: 11, low: 9, close: 10.5, volume: 20, isHistoricalSeed: true },
    { time: 1005, open: 10.5, high: 12, low: 10, close: 11.5, volume: 15, isHistoricalSeed: false },
  ];

  // Out-of-order rejected
  const old = mergeLiveCandleIntoSeries(base, {
    time: 1000,
    open: 10,
    high: 11,
    low: 9,
    close: 10.2,
    volume: 5,
    isHistoricalSeed: false,
  });
  assert.equal(old.accepted, false);
  assert.equal(old.reason, 'out_of_order');

  // Stale seed rejected over live bar
  const staleSeed = mergeLiveCandleIntoSeries(base, {
    time: 1005,
    open: 10.5,
    high: 11,
    low: 10,
    close: 10.8,
    volume: 99,
    isHistoricalSeed: true,
  });
  assert.equal(staleSeed.accepted, false);
  assert.equal(staleSeed.reason, 'stale');

  // Valid in-place update accepted
  const inPlace = mergeLiveCandleIntoSeries(base, {
    time: 1005,
    open: 10.5,
    high: 12.5,
    low: 10,
    close: 12.2,
    volume: 25,
    isHistoricalSeed: false,
  });
  assert.equal(inPlace.accepted, true);
  assert.equal(inPlace.series.length, 2);
  assert.equal(inPlace.latest?.close, 12.2);

  // Reconcile historical snapshot preserves newer live candle
  const reconciled = reconcileHistoricalWithLive([base[0]], inPlace.latest);
  assert.equal(reconciled.length, 2);
  assert.equal(reconciled[1].close, 12.2);

  // Legacy array payload rejected safely
  assert.equal(extractLiveCandleForTimeframe({ symbol: 'NOVA', candles: base }, 'NOVA', '5s'), null);
  assert.ok(
    extractLiveCandleForTimeframe({ symbol: 'NOVA', candles: { '5s': base[1] } }, 'NOVA', '5s'),
  );
  assert.equal(normalizeCandleSeries([base[1], base[0], base[1]]).length, 2);
});
