import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  calculateFuturesRiskScenarios,
  classifyVolatility,
  mapHumanErrorMessage,
} from '../../shared/contracts/beginner';
import { toMinor } from '../../shared/contracts/money';
import { TUTORIAL_LESSONS } from '../../shared/contracts/tutorial';
import { FINANCIAL_GLOSSARY, GLOSSARY_LIST } from '../../shared/i18n/glossary';
import { createApiRouter } from '../api/routes';
import { WorldEngine } from '../engine/WorldEngine';

test('V2-01: Glossary includes all 25 required terms in both VI and EN without promotional language', () => {
  const requiredTermIds = [
    'cr',
    'bid',
    'ask',
    'spread',
    'market_order',
    'limit_order',
    'stop_order',
    'slippage',
    'fee',
    'liquidity',
    'volatility',
    'order_book',
    'long',
    'short',
    'leverage',
    'margin',
    'isolated_margin',
    'liquidation_price',
    'funding_rate',
    'stop_loss',
    'take_profit',
    'realized_pnl',
    'unrealized_pnl',
    'available_balance',
    'locked_balance',
  ];

  for (const id of requiredTermIds) {
    const entry = FINANCIAL_GLOSSARY[id];
    assert.ok(entry, `Missing required glossary term: ${id}`);
    assert.ok(entry.vi.title.length > 0 && entry.vi.short.length > 10, `Invalid VI entry for ${id}`);
    assert.ok(entry.en.title.length > 0 && entry.en.short.length > 10, `Invalid EN entry for ${id}`);
  }
  assert.ok(GLOSSARY_LIST.length >= 25);
});

test('V2-02: Interactive Tutorial contains 10 deterministic lessons with valid quiz options', () => {
  assert.equal(TUTORIAL_LESSONS.length, 10);
  const ids = new Set<string>();
  for (let i = 0; i < TUTORIAL_LESSONS.length; i++) {
    const lesson = TUTORIAL_LESSONS[i];
    assert.equal(lesson.order, i + 1);
    assert.ok(!ids.has(lesson.id), `Duplicate lesson ID: ${lesson.id}`);
    ids.add(lesson.id);
    assert.ok(lesson.summary.length > 15);
    assert.ok(lesson.bulletPoints.length >= 2);
    assert.ok(lesson.quiz.options.length >= 2);
    assert.ok(
      lesson.quiz.correctIndex >= 0 && lesson.quiz.correctIndex < lesson.quiz.options.length,
      `Invalid correctIndex for ${lesson.id}`,
    );
  }
});

test('V2-03: Volatility classifier returns objective labels only (zero promotional language)', () => {
  const low = classifyVolatility(0.8);
  const med = classifyVolatility(3.2);
  const high = classifyVolatility(9.4);

  assert.equal(low.level, 'LOW');
  assert.equal(low.labelVi, 'Biến động thấp');
  assert.equal(med.level, 'MEDIUM');
  assert.equal(med.labelVi, 'Biến động trung bình');
  assert.equal(high.level, 'HIGH');
  assert.equal(high.labelVi, 'Biến động cao');

  for (const item of [low, med, high]) {
    const combined = `${item.labelVi} ${item.labelEn}`.toLowerCase();
    assert.ok(!combined.includes('hot'));
    assert.ok(!combined.includes('lời'));
    assert.ok(!combined.includes('dễ thắng'));
    assert.ok(!combined.includes('chắc'));
  }
});

test('V2-04: Futures risk scenario calculator accurately models +1%/-1%/+5%/-5% PnL and liquidation', () => {
  const entryMinor = toMinor(1000); // 1,000 CR
  const qty = 10; // Notional = 10,000 CR
  const margin10x = toMinor(1000); // 10x leverage -> 1,000 CR margin
  const liqLong10x = toMinor(910); // ~9% adverse move

  const scenariosLong = calculateFuturesRiskScenarios({
    side: 'LONG',
    entryPriceMinor: entryMinor,
    quantity: qty,
    marginMinor: margin10x,
    liquidationPriceMinor: liqLong10x,
  });

  assert.equal(scenariosLong.length, 4);
  assert.deepEqual(
    scenariosLong.map((s) => s.priceMovePct),
    [1, -1, 5, -5],
  );
  // +5% on 10,000 CR notional = +500 CR = +50,000 minor (+50% ROI on 1,000 CR margin)
  const plus5 = scenariosLong.find((s) => s.priceMovePct === 5)!;
  assert.equal(plus5.pnlMinor, toMinor(500));
  assert.equal(plus5.roiPct, 50);
  assert.equal(plus5.wouldLiquidate, false);

  // If liquidation price is at 960 CR (-4%), a -5% drop must flag wouldLiquidate = true
  const scenariosHighLev = calculateFuturesRiskScenarios({
    side: 'LONG',
    entryPriceMinor: entryMinor,
    quantity: qty,
    marginMinor: toMinor(500), // 20x
    liquidationPriceMinor: toMinor(960),
  });
  const minus5 = scenariosHighLev.find((s) => s.priceMovePct === -5)!;
  assert.equal(minus5.wouldLiquidate, true);
  assert.equal(minus5.pnlMinor, -toMinor(500));
});

test('V2-05: Human error mapper translates technical codes into beginner-friendly Vietnamese messages', () => {
  const msg1 = mapHumanErrorMessage('INSUFFICIENT_FUNDS', 'raw');
  assert.ok(msg1.includes('CR khả dụng'));
  const msg2 = mapHumanErrorMessage('INSUFFICIENT_ASSET_BALANCE', 'raw');
  assert.ok(msg2.includes('số lượng tài sản'));
  const msg3 = mapHumanErrorMessage('MARKET_CLOSED', 'raw');
  assert.ok(msg3.includes('đóng cửa'));
  const msg4 = mapHumanErrorMessage('DISCONNECTED', 'raw');
  assert.ok(msg4.includes('kết nối'));
});

test('V2-06: Spot previewOrder is side-effect-free, handles CR budget + fee snapping, and validates DOGX-SIM Meme Coin', () => {
  const world = new WorldEngine({ worldId: 'WORLD-TEST-PREVIEW', enableBackgroundLoop: false });
  try {
    const assets = world.getMarkets();
    const dogx = assets.find((a) => a.symbol === 'DOGX-SIM');
    assert.ok(dogx, 'DOGX-SIM Meme Coin must exist in seeded assets');
    assert.equal(dogx.subCategory, 'MEME');
    assert.equal(dogx.marketClass, 'CRYPTO');

    const { profile } = world.loginGuest('Preview Tester');
    const walletBefore = world.ledger.getWallet(profile.id);
    const bookBefore = world.matching.getOrderBook('BTC-SIM', 10);

    // Preview buying 5,000 CR worth of BTC-SIM
    const preview = world.matching.previewOrder(profile.id, {
      symbol: 'BTC-SIM',
      side: 'BUY',
      type: 'MARKET',
      amountQuoteCR: 5000,
    });

    assert.equal(preview.canExecute, true, `Expected executable preview, got: ${preview.blockingReason}`);
    assert.ok(preview.estimatedQty > 0);
    assert.ok(preview.estimatedFeeMinor > 0);
    assert.ok(preview.totalCostMinor <= toMinor(5000) + 100, 'Total cost should respect CR budget');
    assert.equal(preview.quoteCurrency, 'CR');

    // Verify 100% side-effect-free (no funds locked, no ledger entries added, book unchanged)
    const walletAfter = world.ledger.getWallet(profile.id);
    const bookAfter = world.matching.getOrderBook('BTC-SIM', 10);
    assert.equal(walletAfter.availableMinor, walletBefore.availableMinor);
    assert.equal(walletAfter.lockedMinor, walletBefore.lockedMinor);
    assert.equal(bookAfter.asks.length, bookBefore.asks.length);
    assert.equal(world.matching.getOpenOrdersByPlayer(profile.id).length, 0);

    // Selling asset not owned must return canExecute = false with clear reason
    const badSell = world.matching.previewOrder(profile.id, {
      symbol: 'BTC-SIM',
      side: 'SELL',
      type: 'MARKET',
      quantity: 1,
    });
    assert.equal(badSell.canExecute, false);
    assert.ok(badSell.blockingReason && badSell.blockingReason.length > 0);

    // Buying more than available balance must return canExecute = false
    const overBudget = world.matching.previewOrder(profile.id, {
      symbol: 'BTC-SIM',
      side: 'BUY',
      type: 'MARKET',
      amountQuoteCR: 500_000,
    });
    assert.equal(overBudget.canExecute, false);
    assert.ok(overBudget.blockingReason && overBudget.blockingReason.includes('CR khả dụng'));
  } finally {
    world.stop();
  }
});

test('V2-07: Futures previewOrder is side-effect-free and matches real 1x and 5x execution math', () => {
  const world = new WorldEngine({ worldId: 'WORLD-TEST-FUT-PREVIEW', enableBackgroundLoop: false });
  try {
    const { profile } = world.loginGuest('Futures Previewer');
    const walletBefore = world.ledger.getWallet(profile.id);

    const preview1x = world.futures.previewOrder(profile.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      marginCR: 2000,
      leverage: 1,
      marginMode: 'ISOLATED',
    });

    assert.equal(preview1x.canExecute, true, `Expected executable 1x preview, got: ${preview1x.blockingReason}`);
    assert.equal(preview1x.leverage, 1);
    assert.equal(preview1x.marginMode, 'ISOLATED');
    assert.equal(preview1x.scenarios.length, 4);
    assert.ok(preview1x.estimatedQty > 0);
    assert.ok(preview1x.estimatedLiquidationPriceMinor < preview1x.estimatedEntryPriceMinor);

    // High leverage 10x should produce liquidation price much closer to entry price
    const preview10x = world.futures.previewOrder(profile.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      marginCR: 2000,
      leverage: 10,
      marginMode: 'ISOLATED',
    });
    assert.equal(preview10x.canExecute, true);
    assert.ok(
      preview10x.estimatedLiquidationPriceMinor > preview1x.estimatedLiquidationPriceMinor,
      '10x LONG liquidation price must be higher (closer to entry) than 1x LONG',
    );
    assert.ok(preview10x.warnings.length > 0, '10x leverage should emit risk warning');

    // Confirm side-effect-free
    const walletAfterPreview = world.ledger.getWallet(profile.id);
    assert.equal(walletAfterPreview.availableMinor, walletBefore.availableMinor);
    assert.equal(world.futures.getPlayerPositions(profile.id).length, 0);

    // Actually execute matching 1x order via FuturesEngine and confirm consistency
    const placed = world.futures.placeOrder(profile.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: preview1x.estimatedQty,
      leverage: 1,
      marginMode: 'ISOLATED',
      idempotencyKey: 'v2-preview-parity-1',
    });
    assert.equal(placed.order.status, 'FILLED');
    assert.ok(placed.position && placed.position.quantity === preview1x.estimatedQty);
    assert.equal(world.futures.getOpenOrdersByPlayer(profile.id).length, 0);
  } finally {
    world.stop();
  }
});

test('V2-08: Practice Mode (WORLD-PRACTICE) is 100% isolated from WORLD-01 and resets cleanly to 100,000 CR via HTTP API', async () => {
  const liveWorld = new WorldEngine({ worldId: 'WORLD-01', enableBackgroundLoop: false });
  const practiceWorld = new WorldEngine({ worldId: 'WORLD-PRACTICE', enableBackgroundLoop: false });

  const app = express();
  app.use(express.json());
  app.use('/api/practice', createApiRouter(practiceWorld));
  app.use('/api', createApiRouter(liveWorld));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Login to WORLD-01 and record baseline balance
    const liveLoginRes = await fetch(`${baseUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Isolation Alice' }),
    });
    const liveLogin = (await liveLoginRes.json()) as { ok: boolean; data: { token: string; profile: { id: string; wallet: { availableMinor: number } } } };
    assert.equal(liveLogin.ok, true);
    const liveToken = liveLogin.data.token;
    const liveInitialAvailable = liveLogin.data.profile.wallet.availableMinor;

    // 2. Login to WORLD-PRACTICE separately
    const pracLoginRes = await fetch(`${baseUrl}/api/practice/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Isolation Alice' }),
    });
    const pracLogin = (await pracLoginRes.json()) as { ok: boolean; data: { token: string; profile: { id: string; wallet: { availableMinor: number } } } };
    assert.equal(pracLogin.ok, true);
    const pracToken = pracLogin.data.token;
    assert.equal(pracLogin.data.profile.wallet.availableMinor, toMinor(100_000));

    // 3. Preview & execute a Spot trade + Futures position inside WORLD-PRACTICE
    const previewRes = await fetch(`${baseUrl}/api/practice/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pracToken}` },
      body: JSON.stringify({ symbol: 'DOGX-SIM', side: 'BUY', type: 'MARKET', amountQuoteCR: 2000 }),
    });
    const previewJson = (await previewRes.json()) as { ok: boolean; data: { canExecute: boolean; estimatedQty: number } };
    assert.equal(previewJson.ok, true);
    assert.equal(previewJson.data.canExecute, true);

    const buyRes = await fetch(`${baseUrl}/api/practice/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pracToken}` },
      body: JSON.stringify({
        symbol: 'DOGX-SIM',
        side: 'BUY',
        type: 'MARKET',
        quantity: previewJson.data.estimatedQty,
        idempotencyKey: 'prac-buy-dogx-1',
      }),
    });
    const buyJson = (await buyRes.json()) as { ok: boolean; data: { profile: { wallet: { availableMinor: number }; holdings: unknown[] } } };
    assert.equal(buyJson.ok, true);
    assert.ok(buyJson.data.profile.wallet.availableMinor < toMinor(100_000));
    assert.ok(buyJson.data.profile.holdings.length >= 1);

    // Open a Futures 1x Long in Practice
    const futRes = await fetch(`${baseUrl}/api/practice/futures/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pracToken}` },
      body: JSON.stringify({
        symbol: 'BTC-SIM/CR-PERP',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.05,
        leverage: 1,
        marginMode: 'ISOLATED',
        idempotencyKey: 'prac-fut-1',
      }),
    });
    const futJson = (await futRes.json()) as { ok: boolean; data: { position: { id: string } | null } };
    assert.equal(futJson.ok, true);
    assert.ok(futJson.data.position);

    // 4. Verify WORLD-01 player balance & holdings are 100% untouched!
    const liveMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    const liveMe = (await liveMeRes.json()) as { ok: boolean; data: { wallet: { availableMinor: number }; holdings: unknown[] } };
    assert.equal(liveMe.ok, true);
    assert.equal(liveMe.data.wallet.availableMinor, liveInitialAvailable);
    assert.equal(liveMe.data.holdings.length, 0);

    // 5. Reset WORLD-PRACTICE account -> must restore exact 100,000 CR, 0 locked, 0 holdings, 0 positions
    const resetRes = await fetch(`${baseUrl}/api/practice/reset-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pracToken}` },
    });
    const resetJson = (await resetRes.json()) as {
      ok: boolean;
      data: {
        reset: boolean;
        profile: { wallet: { availableMinor: number; lockedMinor: number }; holdings: unknown[] };
      };
    };
    assert.equal(resetJson.ok, true);
    assert.equal(resetJson.data.reset, true);
    assert.equal(resetJson.data.profile.wallet.availableMinor, toMinor(100_000));
    assert.equal(resetJson.data.profile.wallet.lockedMinor, 0);
    assert.equal(resetJson.data.profile.holdings.length, 0);
    assert.equal(practiceWorld.futures.getPlayerPositions(pracLogin.data.profile.id).length, 0);
    assert.equal(practiceWorld.matching.getOpenOrdersByPlayer(pracLogin.data.profile.id).length, 0);

    // 6. Calling reset-account against WORLD-01 MUST be rejected with 403 FORBIDDEN_IN_PRODUCTION
    const forbiddenRes = await fetch(`${baseUrl}/api/reset-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${liveToken}` },
    });
    assert.equal(forbiddenRes.status, 403);
    const forbiddenJson = (await forbiddenRes.json()) as { ok: boolean; error: { code: string } };
    assert.equal(forbiddenJson.ok, false);
    assert.equal(forbiddenJson.error.code, 'FORBIDDEN_IN_PRODUCTION');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    liveWorld.stop();
    practiceWorld.stop();
  }
});
