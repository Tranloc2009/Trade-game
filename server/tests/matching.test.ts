import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { calcFeeMinor, toMinor } from '../../shared/contracts/money';
import type { Asset } from '../../shared/contracts/types';
import { createApiRouter } from '../api/routes';
import { LedgerService } from '../engine/ledger/LedgerService';
import { CandleAggregator } from '../engine/matching/CandleAggregator';
import { MatchingEngine } from '../engine/matching/MatchingEngine';
import { WorldEngine } from '../engine/WorldEngine';

function createIsolatedMatchingFixture() {
  const ledger = new LedgerService('TEST-WORLD');
  const candles = new CandleAggregator();
  const engine = new MatchingEngine(ledger, candles, {
    worldId: 'TEST-WORLD',
    makerFeeBps: 10, // 0.10%
    takerFeeBps: 15, // 0.15%
    enforcePriceBand: true,
    priceBandPct: 0.25,
  });

  const nova: Asset = {
    symbol: 'NOVA',
    name: 'Nova Technologies',
    marketClass: 'STOCK',
    exchange: 'ESE',
    description: 'Test Stock',
    priceTickMinor: 10,
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 50_000,
    circulatingSupply: 10_000_000,
    referencePriceMinor: toMinor(50),
    lastPriceMinor: toMinor(50),
    open24hMinor: toMinor(50),
    high24hMinor: toMinor(50),
    low24hMinor: toMinor(50),
    volume24h: 0,
    turnover24hMinor: 0,
    priceChange24hMinor: 0,
    priceChange24hPct: 0,
    marketCapMinor: toMinor(50) * 10_000_000,
    status: 'OPEN',
    sentimentScore: 0,
    liquidityScore: 0,
  };
  engine.registerAsset(nova, false);

  ledger.createWallet('alice', toMinor(100_000), 'Test Alice');
  ledger.createWallet('bob', toMinor(100_000), 'Test Bob');
  ledger.createWallet('carol', toMinor(100_000), 'Test Carol');
  ledger.grantInitialAsset('bob', 'NOVA', 'STOCK', 100, toMinor(45));
  ledger.grantInitialAsset('carol', 'NOVA', 'STOCK', 100, toMinor(45));

  return { ledger, candles, engine };
}

test('TEST 01: Limit Buy rests on book when no compatible Sell exists', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  const res = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 50,
    quantity: 10,
  });

  assert.equal(res.trades.length, 0);
  assert.equal(res.order.status, 'OPEN');
  assert.equal(res.order.remainingQuantity, 10);
  assert.equal(res.orderBook.bids.length, 1);
  assert.equal(res.orderBook.bids[0].priceMinor, toMinor(50));
  assert.equal(res.orderBook.bids[0].quantity, 10);
  const aliceWallet = ledger.requireWallet('alice');
  assert.ok(aliceWallet.lockedMinor > toMinor(500)); // includes fee reserve
});

test('TEST 02: Limit Sell rests on book when no compatible Buy exists', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  const res = engine.placeOrder({
    playerId: 'bob',
    playerName: 'Bob',
    symbol: 'NOVA',
    side: 'SELL',
    type: 'LIMIT',
    priceCR: 55,
    quantity: 12,
  });

  assert.equal(res.trades.length, 0);
  assert.equal(res.order.status, 'OPEN');
  assert.equal(res.orderBook.asks.length, 1);
  assert.equal(res.orderBook.asks[0].priceMinor, toMinor(55));
  assert.equal(ledger.wallets.getHolding('bob', 'NOVA')?.lockedQty, 12);
  assert.equal(ledger.wallets.getHolding('bob', 'NOVA')?.availableQty, 88);
});

test('TEST 03 & TEST 04: Compatible orders match at resting price with partial fill', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  const buyRes = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 50,
    quantity: 10,
  });

  const sellRes = engine.placeOrder({
    playerId: 'bob',
    playerName: 'Bob',
    symbol: 'NOVA',
    side: 'SELL',
    type: 'LIMIT',
    priceCR: 49,
    quantity: 6,
  });

  assert.equal(sellRes.trades.length, 1);
  const trade = sellRes.trades[0];
  // Resting-order pricing: Alice's 50 CR bid was resting
  assert.equal(trade.priceMinor, toMinor(50));
  assert.equal(trade.quantity, 6);
  assert.equal(trade.grossAmountMinor, toMinor(300));

  // Alice receives 6 NOVA, order has 4 remaining
  assert.equal(ledger.wallets.getHolding('alice', 'NOVA')?.availableQty, 6);
  const aliceOrder = engine.getOrderById(buyRes.order.id)!;
  assert.equal(aliceOrder.status, 'PARTIALLY_FILLED');
  assert.equal(aliceOrder.remainingQuantity, 4);

  // Bob's sell fully filled
  assert.equal(sellRes.order.status, 'FILLED');
  assert.equal(ledger.wallets.getHolding('bob', 'NOVA')?.availableQty, 94);
  assert.equal(engine.getAsset('NOVA')?.lastPriceMinor, toMinor(50));
});

test('TEST 05: Better price has priority over earlier worse price', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 52, quantity: 5 });
  engine.placeOrder({ playerId: 'carol', playerName: 'Carol', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 50, quantity: 5 });

  const buyRes = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 53,
    quantity: 5,
  });

  assert.equal(buyRes.trades.length, 1);
  assert.equal(buyRes.trades[0].sellerId, 'carol');
  assert.equal(buyRes.trades[0].priceMinor, toMinor(50));
});

test('TEST 06: Equal price orders obey strict FIFO time priority', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 51, quantity: 4 });
  engine.placeOrder({ playerId: 'carol', playerName: 'Carol', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 51, quantity: 4 });

  const buyRes = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 51,
    quantity: 4,
  });

  assert.equal(buyRes.trades.length, 1);
  assert.equal(buyRes.trades[0].sellerId, 'bob');
});

test('TEST 07: Market Order consumes real resting order book liquidity', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 50, quantity: 5 });
  engine.placeOrder({ playerId: 'carol', playerName: 'Carol', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 51, quantity: 5 });

  const mkt = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    quantity: 8,
  });

  assert.equal(mkt.trades.length, 2);
  assert.equal(mkt.trades[0].priceMinor, toMinor(50));
  assert.equal(mkt.trades[0].quantity, 5);
  assert.equal(mkt.trades[1].priceMinor, toMinor(51));
  assert.equal(mkt.trades[1].quantity, 3);
  assert.equal(mkt.order.filledQuantity, 8);
});

test('TEST 08: Market Order with empty book rejects and never creates fake trades', () => {
  const { engine } = createIsolatedMatchingFixture();
  assert.throws(
    () =>
      engine.placeOrder({
        playerId: 'alice',
        playerName: 'Alice',
        symbol: 'NOVA',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
      }),
    (err: { code?: string }) => err.code === 'INSUFFICIENT_LIQUIDITY',
  );
  assert.equal(engine.getTotalTradesCount(), 0);
});

test('TEST 09: Cancelling Limit Order refunds remaining locked funds and assets', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  const initialCash = ledger.requireWallet('alice').availableMinor;
  const ord = engine.placeOrder({
    playerId: 'alice',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 50,
    quantity: 10,
  });

  assert.ok(ledger.requireWallet('alice').lockedMinor > 0);
  const cancelRes = engine.cancelOrder(ord.order.id, 'alice');
  assert.equal(cancelRes.order.status, 'CANCELLED');
  assert.equal(ledger.requireWallet('alice').lockedMinor, 0);
  assert.equal(ledger.requireWallet('alice').availableMinor, initialCash);
});

test('TEST 10: Cannot place buy order with insufficient available CR', () => {
  const { engine } = createIsolatedMatchingFixture();
  assert.throws(
    () =>
      engine.placeOrder({
        playerId: 'alice',
        playerName: 'Alice',
        symbol: 'NOVA',
        side: 'BUY',
        type: 'LIMIT',
        priceCR: 50,
        quantity: 2_500, // 125,000 CR > 100,000 CR
      }),
    (err: { code?: string }) => err.code === 'INSUFFICIENT_FUNDS',
  );
});

test('TEST 11: Cannot place sell order with insufficient asset balance', () => {
  const { engine } = createIsolatedMatchingFixture();
  assert.throws(
    () =>
      engine.placeOrder({
        playerId: 'alice',
        playerName: 'Alice',
        symbol: 'NOVA',
        side: 'SELL',
        type: 'LIMIT',
        priceCR: 50,
        quantity: 1,
      }),
    (err: { code?: string }) => err.code === 'INSUFFICIENT_ASSET_BALANCE',
  );
});

test('TEST 12: Double settlement of the same Trade ID is strictly rejected', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'alice', playerName: 'Alice', symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 5 });
  const sellRes = engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 50, quantity: 5 });
  const trade = sellRes.trades[0];

  assert.throws(() => engine.settleTrade(trade), /đã được thanh toán/);
});

test('TEST 13: Two back-to-back orders cannot spend the same balance into negative CR', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'alice', playerName: 'Alice', symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 1_500 }); // 75,000 CR locked
  assert.throws(
    () =>
      engine.placeOrder({
        playerId: 'alice',
        playerName: 'Alice',
        symbol: 'NOVA',
        side: 'BUY',
        type: 'LIMIT',
        priceCR: 50,
        quantity: 1_000, // needs 50,000 CR, only ~24,887 left
      }),
    (err: { code?: string }) => err.code === 'INSUFFICIENT_FUNDS',
  );
  assert.ok(ledger.requireWallet('alice').availableMinor >= 0);
});

test('TEST 14: Maker (0.10%) and Taker (0.15%) fees calculate accurately in minor units', () => {
  const { engine, ledger } = createIsolatedMatchingFixture();
  const aliceStart = ledger.requireWallet('alice').availableMinor;
  const bobStart = ledger.requireWallet('bob').availableMinor;

  // Alice rests -> Maker (0.10%)
  engine.placeOrder({ playerId: 'alice', playerName: 'Alice', symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 10 });
  // Bob crosses -> Taker (0.15%)
  const res = engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 50, quantity: 10 });

  const trade = res.trades[0];
  const gross = toMinor(500); // 50,000 minor
  const expectedMakerFee = calcFeeMinor(gross, 10); // 50 minor = 0.50 CR
  const expectedTakerFee = calcFeeMinor(gross, 15); // 75 minor = 0.75 CR

  assert.equal(trade.buyerFeeMinor, expectedMakerFee);
  assert.equal(trade.sellerFeeMinor, expectedTakerFee);
  assert.equal(ledger.requireWallet('alice').availableMinor, aliceStart - gross - expectedMakerFee);
  assert.equal(ledger.requireWallet('bob').availableMinor, bobStart + gross - expectedTakerFee);
  assert.equal(ledger.getTotalFeeRevenueMinor(), expectedMakerFee + expectedTakerFee);
});

test('TEST 15: Self-trade between the same account is blocked', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 50, quantity: 5 });

  assert.throws(
    () =>
      engine.placeOrder({
        playerId: 'bob',
        playerName: 'Bob',
        symbol: 'NOVA',
        side: 'BUY',
        type: 'LIMIT',
        priceCR: 50,
        quantity: 5,
      }),
    (err: { code?: string }) => err.code === 'SELF_TRADE_FORBIDDEN',
  );
});

test('TEST 16: Order Book maintains strict Price-Time Priority ordering', () => {
  const { engine } = createIsolatedMatchingFixture();
  engine.placeOrder({ playerId: 'alice', playerName: 'Alice', symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 48, quantity: 10 });
  engine.placeOrder({ playerId: 'carol', playerName: 'Carol', symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 10 });
  engine.placeOrder({ playerId: 'bob', playerName: 'Bob', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 54, quantity: 10 });
  engine.placeOrder({ playerId: 'carol', playerName: 'Carol', symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 52, quantity: 10 });

  const book = engine.getOrderBook('NOVA');
  assert.equal(book.bids[0].priceMinor, toMinor(50));
  assert.equal(book.bids[1].priceMinor, toMinor(48));
  assert.equal(book.asks[0].priceMinor, toMinor(52));
  assert.equal(book.asks[1].priceMinor, toMinor(54));
  assert.equal(book.spreadMinor, toMinor(2));
});

test('TEST 17 & TEST 18 & TEST 19: Shared World last price, live candles from trade, and snapshot resync', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const bob = world.loginGuest('Trader Bob', 'BOB');

  // Alice places Limit Buy 10 NOVA @ 50 CR (rests cleanly inside spread)
  world.placeOrder(alice.profile.id, { symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 10 });
  // Bob places Limit Sell 6 NOVA @ 49 CR -> matches Alice @ 50 CR
  const sellRes = world.placeOrder(bob.profile.id, { symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 49, quantity: 6 });
  assert.equal(sellRes.trades.length, 1);
  assert.equal(sellRes.trades[0].priceMinor, toMinor(50));

  // TEST 17: Both Alice and Bob observe identical authoritative Last Price in snapshot
  const snapAlice = world.getWorldSnapshot(alice.profile.id);
  const snapBob = world.getWorldSnapshot(bob.profile.id);
  const novaA = snapAlice.assets.find((a) => a.symbol === 'NOVA')!;
  const novaB = snapBob.assets.find((a) => a.symbol === 'NOVA')!;
  assert.equal(novaA.lastPriceMinor, toMinor(50));
  assert.equal(novaB.lastPriceMinor, toMinor(50));

  // TEST 18: Latest 1m candle reflects live trade (not historical seed)
  const candles = world.candles.getCandles('NOVA', '1m', 5);
  const latest = candles[candles.length - 1];
  assert.equal(latest.isHistoricalSeed, false);
  assert.equal(latest.close, 50);
  assert.ok(latest.volume >= 6);

  // TEST 19: Reconnect snapshot contains consistent holdings & sequence
  assert.equal(snapAlice.player?.holdings.find((h) => h.symbol === 'NOVA')?.availableQty, 6);
  assert.ok(snapAlice.sequenceNumber > 0);
});

test('TEST 20: Malformed JSON / invalid request does not crash server and returns 400 error code', async () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const app = express();
  app.use(express.json());
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Bad JSON' } });
      return;
    }
    next(err);
  });
  app.use('/api', createApiRouter(world));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json',
    });
    assert.equal(resp.status, 400);
    const json = (await resp.json()) as { ok: boolean; error: { code: string } };
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'VALIDATION_ERROR');

    // Server remains healthy after malformed payload
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    server.close();
  }
});
