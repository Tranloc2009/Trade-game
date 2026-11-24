import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import {
  ALL_CURRENCIES,
  FOREX_MAKER_FEE_BPS,
  FOREX_TAKER_FEE_BPS,
  calcFeeMinor,
  calcFxQuoteMinor,
  toCurrencyMinor,
} from '../../shared/contracts/money';
import type { RealtimeEnvelope } from '../../shared/contracts/types';
import { createApiRouter } from '../api/routes';
import { DomainError } from '../domain/DomainError';
import { FOREX_AI_AGENTS } from '../engine/forex/ForexBotEngine';
import { buildSeedForexPairs } from '../engine/forex/forexSeed';
import { LedgerService } from '../engine/ledger/LedgerService';
import { CandleAggregator } from '../engine/matching/CandleAggregator';
import { MatchingEngine } from '../engine/matching/MatchingEngine';
import { WorldEngine } from '../engine/WorldEngine';
import { SocketGateway } from '../realtime/SocketGateway';

function setupIsolatedFxHarness() {
  const ledger = new LedgerService('WORLD-FX-TEST');
  const candles = new CandleAggregator();
  const matching = new MatchingEngine(ledger, candles, { worldId: 'WORLD-FX-TEST' });

  for (const pair of buildSeedForexPairs()) {
    matching.registerAsset(pair, false);
  }

  ledger.createWallet('alice', toCurrencyMinor(50_000, 'CR'), 'Alice CR init');
  ledger.createWallet('bob', toCurrencyMinor(50_000, 'CR'), 'Bob CR init');
  ledger.issueCurrency('alice', 'USD-SIM', toCurrencyMinor(10_000, 'USD-SIM'), 'INIT-A-USD', 'Alice USD init');
  ledger.issueCurrency('bob', 'EUR-SIM', toCurrencyMinor(10_000, 'EUR-SIM'), 'INIT-B-EUR', 'Bob EUR init');
  ledger.issueCurrency('bob', 'USD-SIM', toCurrencyMinor(5_000, 'USD-SIM'), 'INIT-B-USD', 'Bob USD init');
  ledger.issueCurrency('alice', 'JPY-SIM', toCurrencyMinor(500_000, 'JPY-SIM'), 'INIT-A-JPY', 'Alice JPY init');

  return { ledger, matching };
}

test('FX 01: Two human players trade EUR-SIM/USD-SIM with resting price execution, partial fill & cancel refund', () => {
  const { ledger, matching } = setupIsolatedFxHarness();

  // Alice places resting BUY 500 EUR-SIM @ 1.0900 USD-SIM
  const buyRes = matching.placeOrder({
    playerId: 'alice',
    playerName: 'Trader Alice',
    symbol: 'EUR-SIM/USD-SIM',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 1.09,
    quantity: 500,
  });
  assert.equal(buyRes.order.status, 'OPEN');
  assert.equal(buyRes.trades.length, 0);

  const aliceUsdAfterLock = ledger.getCurrencyBalance('alice', 'USD-SIM');
  assert.ok(aliceUsdAfterLock.lockedMinor > 0);

  // Bob places crossing SELL 200 EUR-SIM @ 1.0800 -> MUST execute at Alice's resting 1.0900!
  const sellRes = matching.placeOrder({
    playerId: 'bob',
    playerName: 'Trader Bob',
    symbol: 'EUR-SIM/USD-SIM',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 1.08,
    quantity: 200,
  });

  assert.equal(sellRes.trades.length, 1);
  assert.equal(sellRes.order.status, 'FILLED');
  assert.equal(sellRes.trades[0].priceMinor, 10_900); // 1.0900 at scale 10,000
  assert.equal(sellRes.trades[0].quantity, 200);

  // Check exact currency deltas
  const expectedGrossUsdMinor = calcFxQuoteMinor(10_900, 10_000, 200, 'USD-SIM'); // 218.00 USD-SIM = 21800
  const makerFeeUsd = calcFeeMinor(expectedGrossUsdMinor, FOREX_MAKER_FEE_BPS, true);
  const takerFeeUsd = calcFeeMinor(expectedGrossUsdMinor, FOREX_TAKER_FEE_BPS, true);

  assert.equal(ledger.getCurrencyBalance('alice', 'EUR-SIM').availableMinor, toCurrencyMinor(200, 'EUR-SIM'));
  assert.equal(ledger.getCurrencyBalance('bob', 'EUR-SIM').availableMinor, toCurrencyMinor(9_800, 'EUR-SIM'));
  assert.equal(
    ledger.getCurrencyBalance('bob', 'USD-SIM').availableMinor,
    toCurrencyMinor(5_000, 'USD-SIM') + expectedGrossUsdMinor - takerFeeUsd,
  );

  // Cancel Alice's remaining 300 EUR-SIM resting buy -> locked USD-SIM returns cleanly to 0
  const cancelRes = matching.cancelOrder(buyRes.order.id, 'alice');
  assert.equal(cancelRes.order.status, 'CANCELLED');

  const aliceUsdFinal = ledger.getCurrencyBalance('alice', 'USD-SIM');
  assert.equal(aliceUsdFinal.lockedMinor, 0);
  assert.equal(
    aliceUsdFinal.availableMinor,
    toCurrencyMinor(10_000, 'USD-SIM') - expectedGrossUsdMinor - makerFeeUsd,
  );

  // Zero discrepancy across all currencies
  for (const currency of ALL_CURRENCIES) {
    assert.equal(ledger.auditCurrencyConservation(currency).discrepancyMinor, 0);
  }
});

test('FX 02: 0-decimal JPY-SIM pair settlement, negative balance prevention & insufficient funds rejection', () => {
  const { ledger, matching } = setupIsolatedFxHarness();

  // Bob sells 100 USD-SIM for JPY-SIM @ 149.20
  const sellOrder = matching.placeOrder({
    playerId: 'bob',
    playerName: 'Trader Bob',
    symbol: 'USD-SIM/JPY-SIM',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 149.2,
    quantity: 100,
  });
  assert.equal(sellOrder.order.status, 'OPEN');
  assert.equal(ledger.getCurrencyBalance('bob', 'USD-SIM').lockedMinor, toCurrencyMinor(100, 'USD-SIM'));

  // Alice buys 100 USD-SIM paying JPY-SIM (0 decimals -> 14,920 JPY-SIM gross)
  const buyOrder = matching.placeOrder({
    playerId: 'alice',
    playerName: 'Trader Alice',
    symbol: 'USD-SIM/JPY-SIM',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 149.2,
    quantity: 100,
  });
  assert.equal(buyOrder.trades.length, 1);
  assert.equal(buyOrder.trades[0].grossAmountMinor, 14_920); // JPY-SIM scale = 1

  const jpyTakerFee = calcFeeMinor(14_920, FOREX_TAKER_FEE_BPS, true);
  assert.equal(ledger.getCurrencyBalance('alice', 'JPY-SIM').availableMinor, 500_000 - 14_920 - jpyTakerFee);
  assert.equal(ledger.getCurrencyBalance('alice', 'USD-SIM').availableMinor, toCurrencyMinor(10_100, 'USD-SIM'));

  // Attempting to sell GBP-SIM when holding 0 GBP-SIM MUST fail cleanly without mutating balances
  assert.throws(
    () =>
      matching.placeOrder({
        playerId: 'alice',
        playerName: 'Trader Alice',
        symbol: 'GBP-SIM/USD-SIM',
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        priceCR: 1.268,
        quantity: 50,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
  );

  // Attempting to buy more EUR-SIM than available USD-SIM MUST fail with INSUFFICIENT_FUNDS
  assert.throws(
    () =>
      matching.placeOrder({
        playerId: 'alice',
        playerName: 'Trader Alice',
        symbol: 'EUR-SIM/USD-SIM',
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        priceCR: 1.09,
        quantity: 50_000,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
  );

  for (const w of ledger.wallets.listAllWallets()) {
    for (const c of ALL_CURRENCIES) {
      assert.ok(w.currencyBalances[c].availableMinor >= 0, `${w.playerId} ${c} available >= 0`);
      assert.ok(w.currencyBalances[c].lockedMinor >= 0, `${w.playerId} ${c} locked >= 0`);
    }
  }
});

test('FX 03: Zero money creation across multi-hop FX conversions & Net Worth avoids CR double-counting', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const { profile: aliceInit } = world.loginGuest('Trader Alice', 'ALICE');

  // Fresh human player starts with 100,000 CR, 0 FX value -> exact 100,000 CR Net Worth
  assert.equal(aliceInit.forexValueMinor, 0);
  assert.equal(aliceInit.netWorthMinor, 100_000_00);

  // Alice buys 1,000 USD-SIM using CR on USD-SIM/CR against resting liquidity
  const buyUsd = world.placeOrder(aliceInit.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'MARKET',
    quantity: 1_000,
  });
  assert.ok(buyUsd.trades.length > 0);

  // Alice uses acquired USD-SIM to buy 500 EUR-SIM on EUR-SIM/USD-SIM
  const buyEur = world.placeOrder(aliceInit.id, {
    symbol: 'EUR-SIM/USD-SIM',
    side: 'BUY',
    type: 'MARKET',
    quantity: 500,
  });
  assert.ok(buyEur.trades.length > 0);

  // Alice places a resting SELL on EUR-SIM/CR to verify locked foreign currency isn't double-counted
  world.placeOrder(aliceInit.id, {
    symbol: 'EUR-SIM/CR',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 1.12,
    quantity: 100,
  });

  const aliceAfter = world.getPlayerProfile(aliceInit.id)!;
  assert.ok(aliceAfter.forexValueMinor > 0);
  // Net worth should stay near 100,000 CR minus modest spread/fees (never doubled or inflated!)
  assert.ok(aliceAfter.netWorthMinor > 99_500_00 && aliceAfter.netWorthMinor < 100_100_00);

  // Strict conservation check for ALL 6 currencies across entire world
  for (const currency of ALL_CURRENCIES) {
    const audit = world.ledger.auditCurrencyConservation(currency);
    assert.equal(audit.discrepancyMinor, 0, `Currency ${currency} conservation discrepancy must be 0`);
  }
});

test('FX 04: Market Order rejects on empty book & partially fills only valid resting liquidity', () => {
  const { ledger, matching } = setupIsolatedFxHarness();

  // Empty order book -> Market Order MUST reject with INSUFFICIENT_LIQUIDITY
  assert.throws(
    () =>
      matching.placeOrder({
        playerId: 'alice',
        playerName: 'Trader Alice',
        symbol: 'EUR-SIM/USD-SIM',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_LIQUIDITY',
  );

  // Bob posts ONLY 80 EUR-SIM ask @ 1.0850
  matching.placeOrder({
    playerId: 'bob',
    playerName: 'Trader Bob',
    symbol: 'EUR-SIM/USD-SIM',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 1.085,
    quantity: 80,
  });

  // Alice submits Market BUY for 200 EUR-SIM -> must fill ONLY 80 and never fabricate the remaining 120
  const mktRes = matching.placeOrder({
    playerId: 'alice',
    playerName: 'Trader Alice',
    symbol: 'EUR-SIM/USD-SIM',
    side: 'BUY',
    type: 'MARKET',
    quantity: 200,
  });

  assert.equal(mktRes.trades.length, 1);
  assert.equal(mktRes.order.filledQuantity, 80);
  assert.equal(mktRes.order.remainingQuantity, 120);
  assert.equal(mktRes.order.status, 'CANCELLED');
  assert.equal(mktRes.orderBook.bids.length, 0);
  assert.equal(ledger.getCurrencyBalance('alice', 'EUR-SIM').availableMinor, toCurrencyMinor(80, 'EUR-SIM'));
  assert.equal(ledger.getCurrencyBalance('alice', 'USD-SIM').lockedMinor, 0);
});

test('FX 05: All 5 AI Forex Bots strictly obey finite per-currency balances and never create infinite liquidity', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });

  // Run 12 consecutive FX ticks across all 6 pairs
  for (let i = 0; i < 12; i++) {
    world.forexBots.runForexTick();
  }

  for (const agent of FOREX_AI_AGENTS) {
    const wallet = world.ledger.requireWallet(agent.id);
    for (const c of ALL_CURRENCIES) {
      assert.ok(wallet.currencyBalances[c].availableMinor >= 0, `${agent.id} ${c} available >= 0`);
      assert.ok(wallet.currencyBalances[c].lockedMinor >= 0, `${agent.id} ${c} locked >= 0`);
    }
  }

  // Lock all of a bot's available USD-SIM so available === 0 and verify it CANNOT buy EUR-SIM/USD-SIM
  const specId = 'fx_spec_desk';
  const specWallet = world.ledger.requireWallet(specId);
  const drainedUsd = specWallet.currencyBalances['USD-SIM'].availableMinor;
  if (drainedUsd > 0) {
    world.ledger.lockCurrency(specId, 'USD-SIM', drainedUsd);
  }
  assert.equal(world.ledger.getCurrencyBalance(specId, 'USD-SIM').availableMinor, 0);

  assert.throws(
    () =>
      world.matching.placeOrder({
        playerId: specId,
        playerName: 'Apex FX Momentum Desk',
        symbol: 'EUR-SIM/USD-SIM',
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'IOC',
        priceCR: 1.09,
        quantity: 50,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
  );

  for (const currency of ALL_CURRENCIES) {
    assert.equal(world.ledger.auditCurrencyConservation(currency).discrepancyMinor, 0);
  }
});

test('FX 06: Central Bank events trigger real AI trades & rate hike does NOT guarantee appreciation under weak growth/confidence', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const beforeRate = world.centralBanks.getCentralBank('USD-SIM').policyRatePct;

  // Trigger FedSim RATE_HIKE on USD-SIM
  const res = world.triggerCentralBankEvent('USD-SIM');
  assert.equal(res.policyEvent.currency, 'USD-SIM');
  assert.equal(res.policyEvent.eventType, 'RATE_HIKE');
  assert.ok(res.policyEvent.rateDeltaPct > 0);
  assert.equal(
    world.centralBanks.getCentralBank('USD-SIM').policyRatePct,
    Number((beforeRate + res.policyEvent.rateDeltaPct).toFixed(2)),
  );
  assert.ok(res.tradesExecuted > 0, 'AI Forex bots must execute real MatchingEngine orders on policy events');
  assert.equal(res.newsItem.category, 'FOREX');

  // Verify non-guaranteed appreciation: force low GDP growth + weak confidence before a USD-SIM rate hike
  // and verify Institutional/Speculative bots can actually SELL USD-SIM (BUY EUR-SIM/USD-SIM or SELL USD-SIM/CR)!
  const usdBank = (world.centralBanks as unknown as { banks: Map<string, { gdpGrowthPct: number; marketConfidence: number }> }).banks.get('USD-SIM')!;
  usdBank.gdpGrowthPct = 1.1;
  usdBank.marketConfidence = 58;

  const usdCrTradesBefore = world.matching.listTrades('USD-SIM/CR', 100).length;
  const stagflationReaction = world.forexBots.reactToPolicyEvent({
    id: 'cb_test_stagflation',
    bankCode: 'FEDSIM',
    currency: 'USD-SIM',
    eventType: 'RATE_HIKE',
    title: 'FedSim tăng lãi suất giữa lo ngại giảm tốc GDP',
    summary: 'Stagflation risk test',
    rateDeltaPct: 0.25,
    inflationDeltaPct: 0.1,
    growthDeltaPct: -0.4,
    confidenceDelta: -5,
    publishedAt: new Date().toISOString(),
  });

  const newUsdCrTrades = world.matching.listTrades('USD-SIM/CR', 100).slice(0, world.matching.listTrades('USD-SIM/CR', 100).length - usdCrTradesBefore);
  assert.ok(stagflationReaction.trades.length > 0);
  assert.ok(
    newUsdCrTrades.some((t) => t.takerSide === 'SELL'),
    'Under stagflation/weak confidence, rate hike must trigger SELL flow on USD-SIM/CR rather than guaranteed appreciation',
  );
});

test('FX 07: Realtime Socket.IO sync pushes FX order book, trades, and central bank updates to subscribed clients', async () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(world));

  const server = http.createServer(app);
  new SocketGateway(server, world);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const { session: aliceSession, profile: alice } = world.loginGuest('Trader Alice', 'ALICE');
  const client: ClientSocket = createClientSocket(baseUrl, {
    auth: { token: aliceSession.token },
    transports: ['websocket'],
  });

  const receivedTypes = new Set<string>();
  const bookSymbols = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 5_000);
    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    client.on('connect_error', reject);
  });

  client.on('world:event', (env: RealtimeEnvelope) => {
    receivedTypes.add(env.eventType);
    if (env.eventType === 'market.orderbook.updated') {
      bookSymbols.add((env.payload as { symbol: string }).symbol);
    }
  });

  client.emit('market:subscribe', 'USD-SIM/CR');

  await new Promise((r) => setTimeout(r, 120));

  // Execute an FX order and trigger a Central Bank event
  world.placeOrder(alice.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'MARKET',
    quantity: 100,
  });
  world.triggerCentralBankEvent('EUR-SIM');

  await new Promise((r) => setTimeout(r, 200));

  assert.ok(bookSymbols.has('USD-SIM/CR'), 'Client must receive orderbook update for 10-char FX pair USD-SIM/CR');
  assert.ok(receivedTypes.has('market.trade.executed'), 'Client must receive live FX trade event');
  assert.ok(receivedTypes.has('forex.central_bank.updated'), 'Client must receive Central Bank update event');
  assert.ok(receivedTypes.has('balance.updated'), 'Client must receive private balance update');

  client.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('FX 08: Zero regression on existing Stock (NOVA) and Crypto (BTC-SIM) markets', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const { profile: alice } = world.loginGuest('Trader Alice', 'ALICE');
  const { profile: bob } = world.loginGuest('Trader Bob', 'BOB');

  // Stock trade: Alice Limit Buy 10 NOVA @ 50.00 CR, Bob Limit Sell 10 NOVA @ 49.00 CR -> matches at 50.00 CR
  const buyNova = world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 50,
    quantity: 10,
  });
  assert.equal(buyNova.order.status, 'OPEN');

  const sellNova = world.placeOrder(bob.id, {
    symbol: 'NOVA',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 49,
    quantity: 10,
  });
  assert.equal(sellNova.trades.length, 1);
  assert.equal(sellNova.trades[0].priceMinor, 50_00);

  // Crypto trade: Alice Market Buy 0.01 BTC-SIM
  const buyBtc = world.placeOrder(alice.id, {
    symbol: 'BTC-SIM',
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.01,
  });
  assert.ok(buyBtc.trades.length > 0);
  assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
});
