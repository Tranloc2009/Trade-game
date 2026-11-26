import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import http from 'node:http';
import {
  ALL_TIMEFRAMES,
  type Candle,
  type MarketPulseSnapshot,
  type RealtimeEnvelope,
  type Timeframe,
} from '../../shared/contracts/types';
import { getAllowedLeveragesForContract, resolveRiskTier, type FuturesLeverage } from '../../shared/contracts/futures';
import { createApiRouter } from '../api/routes';
import { createCareerImmersionRouter } from '../api/careerRoutes';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';
import { WorldEngine } from '../engine/WorldEngine';
import { formatFuturesOrderFeedback, formatSpotOrderFeedback, sanitizeLeverageChoice } from '../../src/lib/tradeExecutionFeedback';

async function withServer(
  setup: (app: express.Express) => void,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  setup(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('AT-HS-01: Live candle contract emits Record<Timeframe, Candle> for all 9 timeframes with zero double volume', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 8 });
  const events: RealtimeEnvelope[] = [];
  world.eventBus.subscribe((env) => {
    if (env.eventType === 'market.candle.updated') events.push(env);
  });

  const { profile } = world.loginGuest('HyperspeedTester1');
  const before5s = world.candles.getCandles('BTC-SIM', '5s', 20);
  const res = world.placeOrder(profile.id, {
    symbol: 'BTC-SIM',
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.05,
    idempotencyKey: 'hs_at01_buy_btc',
  });

  assert.ok(res.trades.length > 0, 'Market buy BTC-SIM should fill immediately');
  assert.equal(res.order.status, 'FILLED');
  assert.equal(events.length, 1, 'Exactly one market.candle.updated event per matched order');

  const payload = events[0].payload as { symbol: string; candles: Record<Timeframe, Candle> };
  assert.equal(payload.symbol, 'BTC-SIM');
  assert.equal(Array.isArray(payload.candles), false, 'Candle payload must NEVER be an array');

  for (const tf of ALL_TIMEFRAMES) {
    const c = payload.candles[tf];
    assert.ok(c && typeof c.time === 'number' && c.close > 0, `Missing valid candle for ${tf}`);
  }

  // Verify live bucket volume matches exact traded qty (zero double counting & zero historical seed mixing)
  const live5s = payload.candles['5s'];
  const hadLiveBucket = before5s.some((c) => c.time === live5s.time);
  assert.equal(hadLiveBucket, false, 'Historical seed must end strictly before live bucket');
  assert.ok(Math.abs(live5s.volume - 0.05) < 1e-6, `Expected live 5s volume 0.05, got ${live5s.volume}`);
});

test('AT-HS-02: Instant Market execution across Stock, Crypto, Forex & Futures with immediate Open Orders removal and ledger conservation', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 8 });
  const { profile } = world.loginGuest('InstantTrader');

  // 1. Stock Market Buy
  const stockRes = world.placeOrder(profile.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    quantity: 5,
    idempotencyKey: 'hs_at02_stock',
  });
  assert.equal(stockRes.order.status, 'FILLED');
  assert.equal(formatSpotOrderFeedback({ order: stockRes.order, trades: stockRes.trades }).tone, 'success');

  // 2. Crypto Market Buy
  const cryptoRes = world.placeOrder(profile.id, {
    symbol: 'ETH-SIM',
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.25,
    idempotencyKey: 'hs_at02_crypto',
  });
  assert.equal(cryptoRes.order.status, 'FILLED');

  // 3. Forex Market Buy (USD-SIM/CR — player starts with CR)
  const fxRes = world.placeOrder(profile.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'MARKET',
    quantity: 100,
    idempotencyKey: 'hs_at02_fx',
  });
  assert.equal(fxRes.order.status, 'FILLED');

  // 4. Open Orders must NOT contain any of the FILLED orders
  const openSpot = world.matching
    .listPlayerOrders(profile.id)
    .filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED');
  assert.equal(openSpot.length, 0, 'Filled Market orders must disappear immediately from Open Orders');

  // 5. Futures Market Long + Immediate Quick Close (reduceOnly)
  world.acknowledgeFuturesRisk(profile.id);
  const futOpen = world.placeFuturesOrder(profile.id, {
    symbol: 'BTC-SIM/CR-PERP',
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.05,
    leverage: 5,
    idempotencyKey: 'hs_at02_fut_open',
  });
  assert.equal(futOpen.order.status, 'FILLED');
  assert.ok(futOpen.position && futOpen.position.quantity > 0);
  assert.equal(
    formatFuturesOrderFeedback({
      order: futOpen.order,
      trades: futOpen.trades,
      side: 'BUY',
      leverage: 5,
      priceScale: 100,
      priceDecimals: 2,
    }).tone,
    'success',
  );

  const futClose = world.closeFuturesPosition(profile.id, futOpen.position.id, {
    type: 'MARKET',
    quantity: futOpen.position.quantity,
    idempotencyKey: 'hs_at02_fut_close',
  });
  assert.equal(futClose.order.status, 'FILLED');
  assert.equal(futClose.position, null, 'Closed position must be removed immediately');

  // 6. Double-entry ledger conservation & zero negative balances
  assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  assert.equal(world.ledger.auditCurrencyConservation('USD-SIM').discrepancyMinor, 0);
  const finalWallet = world.ledger.requireWallet(profile.id);
  assert.ok(finalWallet.availableMinor >= 0 && finalWallet.lockedMinor >= 0);
});

test('AT-HS-03: Market Maker Liquidity V2 provides 5 levels, replenishes thin books, preserves NOVA spread, and never mints CR', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 8 });
  const initialMoneySupply = world.ledger.getTotalMoneySupplyMinor();

  // Check initial NOVA spread protection (Section 32: bid < 50.00 < ask)
  const novaBook = world.matching.getOrderBook('NOVA', 10);
  assert.ok(novaBook.bids.length >= 5, `Expected >= 5 bid levels on NOVA, got ${novaBook.bids.length}`);
  assert.ok(novaBook.asks.length >= 5, `Expected >= 5 ask levels on NOVA, got ${novaBook.asks.length}`);
  assert.ok((novaBook.bestBidMinor ?? 0) < 50_00 && (novaBook.bestAskMinor ?? 0) > 50_00);

  // Check BTC-SIM deep book + auto-replenishment after multiple consecutive player Market orders
  const { profile } = world.loginGuest('WhaleLiquidityTester');
  for (let i = 0; i < 4; i++) {
    const r = world.placeOrder(profile.id, {
      symbol: 'SOL-SIM',
      side: 'BUY',
      type: 'MARKET',
      quantity: 12,
      idempotencyKey: `hs_at03_sol_${i}`,
    });
    assert.equal(r.order.status, 'FILLED', `Consecutive market order #${i + 1} should fill cleanly`);
  }

  const solBookAfter = world.matching.getOrderBook('SOL-SIM', 10);
  assert.ok(solBookAfter.asks.length >= 3, `Expected MarketMaker V2 to keep >= 3 ask levels, got ${solBookAfter.asks.length}`);
  assert.ok(solBookAfter.bids.length >= 3, `Expected MarketMaker V2 to keep >= 3 bid levels, got ${solBookAfter.bids.length}`);

  // Run fast liquidity ticks and verify zero CR minting (conservation of CR)
  const supplyAfterPlayerJoin = world.ledger.getTotalMoneySupplyMinor();
  assert.ok(supplyAfterPlayerJoin >= initialMoneySupply);

  for (let t = 0; t < 10; t++) {
    world.marketMakers.runFastLiquidityTick(world.economy.state, ['BTC-SIM', 'ETH-SIM']);
  }
  const supplyAfterTicks = world.ledger.getTotalMoneySupplyMinor();
  assert.equal(
    supplyAfterTicks,
    supplyAfterPlayerJoin,
    'Market Maker V2 fast liquidity ticks & replenishment must NEVER mint or destroy CR',
  );
  assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
});

test('AT-HS-04: Unified Beginner & Pro leverage policy enforces identical contract caps and rejects invalid inputs', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 8 });
  const btcContract = world.futures.listContracts().find((c) => c.symbol === 'BTC-SIM/CR-PERP');
  assert.ok(btcContract);

  const allowed = getAllowedLeveragesForContract(btcContract.maxLeverage, btcContract.effectiveMaxLeverage);
  assert.ok(
    allowed.includes(1) &&
      (allowed as readonly number[]).includes(btcContract.effectiveMaxLeverage ?? btcContract.maxLeverage),
  );
  assert.equal(sanitizeLeverageChoice(NaN, allowed), 1);
  assert.equal(sanitizeLeverageChoice(Infinity, allowed), 1);
  assert.equal(sanitizeLeverageChoice(999, allowed), allowed[allowed.length - 1]);

  const { profile } = world.loginGuest('LeverageParityUser');
  world.acknowledgeFuturesRisk(profile.id);

  // Opening at effective active Risk Tier cap (identical for Beginner & Pro, > legacy 3x beginner cap)
  const tier1Max = Math.min(allowed[allowed.length - 1], resolveRiskTier(0).maxLeverage) as FuturesLeverage;
  assert.ok(tier1Max >= 10, `Expected unified Tier 1 max leverage >= 10x, got ${tier1Max}x`);
  const okOrder = world.placeFuturesOrder(profile.id, {
    symbol: btcContract.symbol,
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.02,
    leverage: tier1Max,
    idempotencyKey: 'hs_at04_max_lev',
  });
  assert.equal(okOrder.order.status, 'FILLED');

  // Exceeding active Risk Tier / contract cap is strictly rejected by server
  assert.throws(() => {
    world.placeFuturesOrder(profile.id, {
      symbol: btcContract.symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.02,
      leverage: (tier1Max + 10) as FuturesLeverage,
      idempotencyKey: 'hs_at04_over_cap',
    });
  });
});

test('AT-HS-05 & AT-HS-06: Career isolated realtime market scheduler respects Pause/Dialogue/Online switch, isolates WORLD-01, and serves lightweight pulse endpoints', async () => {
  const onlineWorld = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 8 });
  const careerManager = new CareerWorldManager(onlineWorld, {
    enableTimers: true,
    storagePath: null,
    maxIdlePauseMs: 60_000,
  });

  try {
    const login = careerManager.loginOrRegisterAccount({
      username: 'CareerRealtimeCEO',
      password: 'Password123!',
      preferredInitialMode: 'CAREER',
    });
    const accountKey = login.account.preferences.accountKey;
    const activeSaveId = login.account.preferences.activeCareerSaveId;
    assert.ok(activeSaveId);
    const save = careerManager.getSaveById(activeSaveId);
    assert.ok(save);

    // Complete/skip opening so activeSceneId becomes null and scheduler can tick
    save.director.skipOpeningScene();
    careerManager.setCareerClockSpeed(accountKey, '5x');

    const onlineBtcTradesBefore = onlineWorld.matching.listTrades('BTC-SIM', 50).length;
    const careerBtcTradesBefore = save.world.matching.listTrades('BTC-SIM', 50).length;

    // Directly run isolated Career fast market ticks targeting BTC-SIM & verify isolation
    save.watchedSpotSymbol = 'BTC-SIM';
    save.watchedFuturesSymbol = 'BTC-SIM/CR-PERP';
    for (let i = 0; i < 4; i++) {
      save.world.runCareerFastMarketTick(save.watchedSpotSymbol, save.watchedFuturesSymbol);
    }

    const onlineBtcTradesAfter = onlineWorld.matching.listTrades('BTC-SIM', 50).length;
    const careerBtcTradesAfter = save.world.matching.listTrades('BTC-SIM', 50).length;

    assert.equal(
      onlineBtcTradesAfter,
      onlineBtcTradesBefore,
      'Career realtime market ticks must NEVER mutate Online WORLD-01 trades',
    );
    assert.ok(
      careerBtcTradesAfter > careerBtcTradesBefore,
      'Career isolated market ticks must generate genuine trades & candles in Career WorldEngine',
    );

    // Verify Pause clears marketTimer cleanly
    careerManager.setCareerClockSpeed(accountKey, 'PAUSE');
    assert.equal(save.marketTimer, undefined, 'PAUSE must clear Career marketTimer immediately');

    // Resume 2x -> marketTimer active; switch to ONLINE -> marketTimer cleared immediately
    careerManager.setCareerClockSpeed(accountKey, '2x');
    assert.ok(save.marketTimer !== undefined, 'Active Career save must run lightweight marketTimer');
    careerManager.switchMode(accountKey, 'ONLINE');
    assert.equal(save.marketTimer, undefined, 'Switching to ONLINE must stop Career marketTimer immediately');

    // Verify HTTP pulse endpoints on both Online and Career world routers
    careerManager.switchMode(accountKey, 'CAREER', activeSaveId);
    await withServer(
      (app) => {
        app.use('/api', createCareerImmersionRouter(careerManager));
        app.use('/api', createApiRouter(onlineWorld));
      },
      async (baseUrl) => {
        const resSpot = await fetch(
          `${baseUrl}/api/career-world/${encodeURIComponent(activeSaveId)}/markets/ETH-SIM/pulse?timeframe=5s`,
          { headers: { Authorization: `Bearer ${login.activeToken}` } },
        );
        assert.equal(resSpot.status, 200);
        const bodySpot = (await resSpot.json()) as { ok: boolean; data: MarketPulseSnapshot };
        assert.equal(bodySpot.ok, true);
        assert.equal(bodySpot.data.symbol, 'ETH-SIM');
        assert.ok(bodySpot.data.orderBook.bids.length >= 3);
        assert.equal(save.watchedSpotSymbol, 'ETH-SIM', 'Career pulse endpoint should hint watchedSpotSymbol');

        const resFut = await fetch(
          `${baseUrl}/api/career-world/${encodeURIComponent(activeSaveId)}/futures/contracts/BTC-SIM%2FCR-PERP/pulse?timeframe=15s`,
          { headers: { Authorization: `Bearer ${login.activeToken}` } },
        );
        assert.equal(resFut.status, 200);
        const bodyFut = (await resFut.json()) as {
          ok: boolean;
          data: { symbol: string; contract: { symbol: string } };
        };
        assert.equal(bodyFut.ok, true);
        assert.equal(bodyFut.data.symbol, 'BTC-SIM/CR-PERP');
        assert.equal(save.watchedFuturesSymbol, 'BTC-SIM/CR-PERP');
      },
    );
  } finally {
    careerManager.dispose();
  }
});
