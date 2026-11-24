import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { ALL_BOT_ARCHETYPES } from '../engine/bots/AgentRegistry';
import { SYSTEM_ACCOUNTS } from '../engine/ledger/LedgerService';
import { WorldEngine } from '../engine/WorldEngine';
import { fromMinor, toMinor } from '../../shared/contracts/money';
import type { NewsItem } from '../../shared/contracts/types';

function computeTotalConservedCRMinor(world: WorldEngine): number {
  const walletSum = world.ledger.wallets
    .listAllWallets()
    .reduce((s, w) => s + w.availableMinor + w.lockedMinor + w.savingsMinor + w.termDepositMinor, 0);
  const feeRev = world.ledger.getCurrencyFeeRevenueMinor('CR');
  const futuresMarginPool = world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.FUTURES_MARGIN_POOL);
  const futuresInsurance = world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND);
  const auctionEscrow = world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.ESCROW_AUCTION);
  return walletSum + feeRev + futuresMarginPool + futuresInsurance + auctionEscrow;
}

function assertAllWalletsAndHoldingsNonNegative(world: WorldEngine): void {
  for (const w of world.ledger.wallets.listAllWallets()) {
    assert.ok(w.availableMinor >= 0, `Negative CR availableMinor on ${w.playerId}: ${w.availableMinor}`);
    assert.ok(w.lockedMinor >= 0, `Negative CR lockedMinor on ${w.playerId}: ${w.lockedMinor}`);
    assert.ok(w.savingsMinor >= 0, `Negative CR savingsMinor on ${w.playerId}: ${w.savingsMinor}`);
    for (const h of world.ledger.wallets.listHoldings(w.playerId)) {
      assert.ok(h.availableQty >= 0, `Negative holding availableQty on ${w.playerId} ${h.symbol}`);
      assert.ok(h.lockedQty >= 0, `Negative holding lockedQty on ${w.playerId} ${h.symbol}`);
    }
  }
}

test('1. Autonomous Bot Ecosystem boots with all 8 archetypes, finite wallets, heterogeneous profiles, and Meme Coins', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 20261123 });
  const overview = world.getBotEcosystemOverview();

  assert.equal(overview.agents.length, 24);
  for (const arch of ALL_BOT_ARCHETYPES) {
    assert.ok(overview.archetypeCounts[arch] >= 1, `Archetype ${arch} must have at least 1 agent`);
  }

  // Distinct non-human roles & heterogeneous strategy attributes
  const riskSet = new Set<number>();
  const freqSet = new Set<number>();
  const newsSensSet = new Set<number>();
  for (const agent of overview.agents) {
    assert.ok(agent.role === 'MARKET_MAKER' || agent.role === 'INVESTOR_BOT', 'Bots must never have PLAYER role');
    assert.ok(agent.initialCapitalMinor > 0, `Bot ${agent.id} must start with finite positive capital`);
    assert.ok(agent.availableCashMinor >= 0, `Bot ${agent.id} cash must be non-negative`);
    assert.ok(agent.maxDrawdownPct > 0 && agent.maxDrawdownPct <= 60);
    riskSet.add(agent.riskTolerance);
    freqSet.add(agent.tradingFrequencyMs);
    newsSensSet.add(agent.newsSensitivity);
  }
  assert.ok(riskSet.size >= 8, 'Agents must have heterogeneous riskTolerance values');
  assert.ok(freqSet.size >= 8, 'Agents must have heterogeneous tradingFrequencyMs values');
  assert.ok(newsSensSet.size >= 8, 'Agents must have heterogeneous newsSensitivity values');

  // Meme Coins (Spot) & Perpetual Futures contracts exist with seeded two-sided resting quotes
  const doge = world.matching.getAsset('DOGE-SIM');
  const pepe = world.matching.getAsset('PEPE-SIM');
  const solPerp = world.futures.getContract('SOL-SIM/CR-PERP');
  assert.ok(doge && doge.lastPriceMinor === toMinor(0.25));
  assert.ok(pepe && pepe.lastPriceMinor === toMinor(0.08));
  assert.ok(solPerp && solPerp.underlyingSpotSymbol === 'SOL-SIM');

  const dogeBook = world.matching.getOrderBook('DOGE-SIM', 5);
  assert.ok(dogeBook.bids.length > 0 && dogeBook.asks.length > 0, 'DOGE-SIM must have two-sided AI liquidity');
  const solPerpBook = world.futures.getOrderBook('SOL-SIM/CR-PERP', 5);
  assert.ok(solPerpBook.bids.length > 0 && solPerpBook.asks.length > 0, 'SOL-SIM/CR-PERP must have two-sided AI liquidity');

  // Leaderboard separation: human PLAYERS scope must contain zero AI bots
  const humanLeaderboard = world.getLeaderboard('PLAYERS');
  assert.equal(humanLeaderboard.length, 0);
  const agentLeaderboard = world.getLeaderboard('AGENTS');
  assert.ok(agentLeaderboard.length >= 24);
});

test('2. Human <-> Bot real Spot and Futures trading with exact Ledger settlement', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 20261123 });
  const { session } = world.loginGuest('Human Trader Alice', 'ALICE');
  const aliceId = session.playerId;

  const initialLedgerEntries = world.ledger.ledger.count();

  // Spot BUY against resting AI bot liquidity on DOGE-SIM
  const spotBuy = world.placeOrder(aliceId, {
    symbol: 'DOGE-SIM',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 500,
    maxSlippageBps: 500,
  });

  assert.ok(spotBuy.trades.length >= 1, 'Human Spot BUY must match against AI bot resting ask');
  for (const t of spotBuy.trades) {
    assert.equal(t.buyerId, aliceId);
    assert.notEqual(t.sellerId, aliceId);
    assert.ok(t.sellerId.startsWith('ai_') || t.sellerId.startsWith('npc_'), `Counterparty should be AI/NPC bot, got ${t.sellerId}`);
  }
  const aliceDoge = world.ledger.wallets.getHolding(aliceId, 'DOGE-SIM');
  assert.ok(aliceDoge && aliceDoge.availableQty >= 500);

  // Spot SELL back against AI resting bid
  const spotSell = world.placeOrder(aliceId, {
    symbol: 'DOGE-SIM',
    side: 'SELL',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 200,
    maxSlippageBps: 500,
  });
  assert.ok(spotSell.trades.length >= 1, 'Human Spot SELL must match against AI bot resting bid');

  // Futures leveraged LONG on SOL-SIM/CR-PERP matching against AI Futures liquidity
  world.acknowledgeFuturesRisk(aliceId);
  const futuresBuy = world.placeFuturesOrder(aliceId, {
    symbol: 'SOL-SIM/CR-PERP',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 3,
    quantity: 5,
    maxSlippageBps: 500,
  });
  assert.ok(futuresBuy.trades.length >= 1, 'Human Futures order must match against AI Futures bot');
  for (const ft of futuresBuy.trades) {
    assert.equal(ft.buyerId, aliceId);
    assert.notEqual(ft.sellerId, aliceId);
  }

  assert.ok(world.ledger.ledger.count() > initialLedgerEntries, 'Every Human <-> Bot trade must write Ledger entries');
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('3. Bot <-> Bot autonomous trading enforces zero self-trades, zero wash trades, and real price discovery', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 424242 });

  let totalSpotTrades = 0;
  let totalFuturesTrades = 0;
  let totalOrders = 0;
  const nowStart = Date.now();

  for (let i = 0; i < 15; i++) {
    const res = world.runAutonomousBotTick({
      forceAllAgents: true,
      nowMs: nowStart + i * 10_000,
    });
    totalSpotTrades += res.spotTrades.length;
    totalFuturesTrades += res.futuresTrades.length;
    totalOrders += res.ordersSubmitted;

    for (const t of res.spotTrades) {
      assert.notEqual(t.buyerId, t.sellerId, `Spot self-trade detected on ${t.symbol}: ${t.buyerId}`);
      assert.ok(t.quantity > 0 && t.priceMinor > 0);
    }
    for (const ft of res.futuresTrades) {
      assert.notEqual(ft.buyerId, ft.sellerId, `Futures self-trade detected on ${ft.symbol}: ${ft.buyerId}`);
      assert.ok(ft.quantity > 0 && ft.priceInt > 0);
    }
  }

  assert.ok(totalOrders >= 30, `Expected significant autonomous order flow, got ${totalOrders}`);
  assert.ok(totalSpotTrades >= 5, `Expected autonomous Bot <-> Bot Spot trades, got ${totalSpotTrades}`);
  assert.ok(totalFuturesTrades >= 1, `Expected autonomous Bot <-> Bot Futures trades, got ${totalFuturesTrades}`);
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('4. Zero-Balance / Insolvency: bankrupt bot stops buying, never goes negative, and never mints CR', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 16, botSeed: 101010 });
  const targetBot = world.bots.listAgentConfigs().find((c) => c.archetype === 'MOMENTUM_TRADER')!;
  assert.ok(targetBot);

  // Cancel any open Spot/Futures orders for targetBot
  for (const o of world.matching.listPlayerOrders(targetBot.id)) {
    if (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') {
      world.matching.cancelOrder(o.id, targetBot.id);
    }
  }
  for (const fo of world.futures.listPlayerOrders(targetBot.id)) {
    if (fo.status === 'OPEN' || fo.status === 'PARTIALLY_FILLED') {
      world.futures.cancelOrder(fo.id, targetBot.id);
    }
  }

  // Drain all CR available balance to 0 and zero out holdings to simulate total insolvency
  const wallet = world.ledger.requireWallet(targetBot.id);
  wallet.availableMinor = 0;
  wallet.lockedMinor = 0;
  wallet.currencyBalances.CR.availableMinor = 0;
  wallet.currencyBalances.CR.lockedMinor = 0;
  for (const h of world.ledger.wallets.listHoldings(targetBot.id)) {
    h.availableQty = 0;
    h.lockedQty = 0;
    world.ledger.wallets.saveHolding(targetBot.id, h);
  }

  const supplyBefore = world.ledger.getTotalMoneySupplyMinor();
  const ordersBefore = world.getBotAgentTelemetry(targetBot.id)!.ordersSubmitted;

  for (let i = 0; i < 5; i++) {
    world.runAutonomousBotTick({ forceAllAgents: true, nowMs: Date.now() + (i + 1) * 10_000 });
  }

  const telemetryAfter = world.getBotAgentTelemetry(targetBot.id)!;
  assert.equal(telemetryAfter.status, 'INSOLVENT', 'Zero-equity bot must transition to INSOLVENT');
  assert.equal(telemetryAfter.availableCashMinor, 0, 'Insolvent bot must not receive minted CR');
  assert.equal(telemetryAfter.ordersSubmitted, ordersBefore, 'Insolvent bot must not submit new orders');
  assert.equal(world.ledger.getTotalMoneySupplyMinor(), supplyBefore, 'Money supply must remain strictly unchanged');
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('5. News Reaction: bots react directionally to public POSITIVE and NEGATIVE news events', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 90909 });

  const bullNews: NewsItem = {
    id: 'news_test_bull_doge',
    headline: '[ECX] Làn sóng ứng dụng mới thúc đẩy thanh khoản DOGE-SIM và SOL-SIM tăng đột biến',
    summary: 'Dòng vốn thị trường công khai tăng mạnh trên hệ sinh thái tài sản số mô phỏng.',
    category: 'CRYPTO',
    relatedSymbols: ['DOGE-SIM', 'SOL-SIM'],
    sentiment: 'POSITIVE',
    source: 'EMPIRE_WIRE_SIM',
    publishedAt: new Date().toISOString(),
  };

  const bullReaction = world.publishNewsAndReact(bullNews);
  assert.ok(
    bullReaction.spotTrades.length + bullReaction.futuresTrades.length >= 1,
    'POSITIVE public news must trigger real AI News/Reactive trades',
  );
  assert.ok(
    bullReaction.affectedSpotSymbols.includes('DOGE-SIM') || bullReaction.affectedSpotSymbols.includes('SOL-SIM'),
    'Reaction must target symbols referenced in the public news item',
  );

  // Verify at least one News Trader updated its decision reason to NEWS_*
  const newsTraders = world
    .getBotEcosystemOverview()
    .agents.filter((a) => a.archetype === 'NEWS_TRADER');
  assert.ok(
    newsTraders.some((a) => a.lastDecisionReason.startsWith('NEWS_')),
    'At least one NEWS_TRADER must record NEWS_* decision reason after public news',
  );

  const bearNews: NewsItem = {
    id: 'news_test_bear_eth',
    headline: '[ECX] Cảnh báo thắt chặt thanh khoản gây áp lực bán tháo lên ETH-SIM',
    summary: 'Áp lực chốt lời lan rộng trên thị trường tài sản số mô phỏng.',
    category: 'CRYPTO',
    relatedSymbols: ['ETH-SIM'],
    sentiment: 'NEGATIVE',
    source: 'EMPIRE_WIRE_SIM',
    publishedAt: new Date().toISOString(),
  };

  const bearReaction = world.publishNewsAndReact(bearNews);
  assert.ok(
    bearReaction.affectedSpotSymbols.length + bearReaction.affectedFuturesSymbols.length >= 1,
    'NEGATIVE public news must trigger real AI sell/short reaction',
  );
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('6. Losing Bot & Max Drawdown Circuit Breaker pauses trading and cancels open orders', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 16, botSeed: 555111 });
  const contrarian = world.bots.listAgentConfigs().find((c) => c.archetype === 'CONTRARIAN_TRADER')!;
  assert.ok(contrarian);

  // Place a resting order so we can verify drawdown circuit breaker cancels open orders
  world.matching.placeOrder({
    playerId: contrarian.id,
    playerName: contrarian.username,
    symbol: 'SOL-SIM',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: 155,
    quantity: 5,
  });

  // Simulate heavy trading loss exceeding maxDrawdownPct (e.g. losing 60% of wallet equity)
  const w = world.ledger.requireWallet(contrarian.id);
  const lossMinor = Math.floor(w.availableMinor * 0.72);
  w.availableMinor -= lossMinor;
  w.currencyBalances.CR.availableMinor = w.availableMinor;

  // Trigger lifecycle evaluation on tick
  world.runAutonomousBotTick({ forceAllAgents: true, nowMs: Date.now() + 20_000 });

  const telemetry = world.getBotAgentTelemetry(contrarian.id)!;
  assert.ok(
    telemetry.currentDrawdownPct >= telemetry.maxDrawdownPct,
    `Expected drawdown (${telemetry.currentDrawdownPct}%) >= maxDrawdownPct (${telemetry.maxDrawdownPct}%)`,
  );
  assert.equal(
    telemetry.status,
    'PAUSED_DRAWDOWN',
    `Bot breaching max drawdown must enter PAUSED_DRAWDOWN, got ${telemetry.status}`,
  );

  // Open orders must have been cancelled by circuit breaker
  const openOrders = world.matching
    .listPlayerOrders(contrarian.id)
    .filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED');
  assert.equal(openOrders.length, 0, 'Drawdown circuit breaker must cancel all open Spot orders');
});

test('7. Futures Bot Liquidation: leveraged AI bot has ZERO immunity and gets forcibly liquidated', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 777888 });
  const memeSpec = world.bots.listAgentConfigs().find((c) => c.archetype === 'MEME_SPECULATOR')!;
  const whale = world.bots.listAgentConfigs().find((c) => c.archetype === 'WHALE_TRADER')!;
  assert.ok(memeSpec && whale);

  const contract = world.futures.getContract('SOL-SIM/CR-PERP')!;
  const spotAsset = world.matching.getAsset('SOL-SIM')!;
  const entryPriceCR = fromMinor(spotAsset.lastPriceMinor);

  // Ensure whale posts ask on SOL-SIM/CR-PERP and memeSpec opens a 10x LONG position
  world.futures.placeOrder({
    playerId: whale.id,
    playerName: whale.username,
    symbol: 'SOL-SIM/CR-PERP',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    leverage: 2,
    priceCR: entryPriceCR,
    quantity: 40,
  });

  const openRes = world.futures.placeOrder({
    playerId: memeSpec.id,
    playerName: memeSpec.username,
    symbol: 'SOL-SIM/CR-PERP',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    leverage: 10,
    quantity: 40,
    maxSlippageBps: 500,
  });
  assert.ok(openRes.trades.length >= 1, 'Meme Speculator must open 10x LONG Futures position');
  const openPos = world.futures.listPlayerPositions(memeSpec.id).find((p) => p.symbol === 'SOL-SIM/CR-PERP');
  assert.ok(openPos && openPos.side === 'LONG' && openPos.leverage === 10);

  // Drive Spot SOL-SIM and Futures SOL-SIM/CR-PERP price down sharply via real matched orders (>12% drop)
  const crashPriceCR = Number((entryPriceCR * 0.84).toFixed(1));
  const mm = world.bots.listAgentConfigs().find((c) => c.archetype === 'MARKET_MAKER')!;
  assert.ok(mm);

  // Clear resting bids above crashPrice on SOL-SIM Spot & Futures so real trades print at crashPrice
  for (const agent of world.bots.listAgentConfigs()) {
    for (const o of world.matching.listPlayerOrders(agent.id, 'SOL-SIM')) {
      if (o.side === 'BUY' && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')) {
        world.matching.cancelOrder(o.id, agent.id);
      }
    }
    for (const fo of world.futures.listPlayerOrders(agent.id, 'SOL-SIM/CR-PERP')) {
      if (fo.side === 'BUY' && (fo.status === 'OPEN' || fo.status === 'PARTIALLY_FILLED')) {
        world.futures.cancelOrder(fo.id, agent.id);
      }
    }
  }
  // Also cancel legacy MM/FuturesBot bids on SOL-SIM so the crash trade prints cleanly
  for (const w of world.ledger.wallets.listAllWallets()) {
    if (w.playerId === whale.id || w.playerId === mm.id) continue;
    for (const o of world.matching.listPlayerOrders(w.playerId, 'SOL-SIM')) {
      if (o.side === 'BUY' && (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED')) {
        world.matching.cancelOrder(o.id, w.playerId);
      }
    }
    for (const fo of world.futures.listPlayerOrders(w.playerId, 'SOL-SIM/CR-PERP')) {
      if (fo.side === 'BUY' && (fo.status === 'OPEN' || fo.status === 'PARTIALLY_FILLED')) {
        world.futures.cancelOrder(fo.id, w.playerId);
      }
    }
  }

  // Step down Spot SOL-SIM in two valid price-band steps to crashPriceCR through real matched trades
  const step1Price = Number((entryPriceCR * 0.92).toFixed(1));
  world.matching.placeOrder({
    playerId: mm.id,
    playerName: mm.username,
    symbol: 'SOL-SIM',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: step1Price,
    quantity: 10,
  });
  world.matching.placeOrder({
    playerId: whale.id,
    playerName: whale.username,
    symbol: 'SOL-SIM',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: step1Price,
    quantity: 10,
  });
  world.matching.placeOrder({
    playerId: mm.id,
    playerName: mm.username,
    symbol: 'SOL-SIM',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: crashPriceCR,
    quantity: 10,
  });
  world.matching.placeOrder({
    playerId: whale.id,
    playerName: whale.username,
    symbol: 'SOL-SIM',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: crashPriceCR,
    quantity: 10,
  });

  // Post crash-level liquidity on Futures book and match a trade so Mark Price converges
  world.futures.placeOrder({
    playerId: mm.id,
    playerName: mm.username,
    symbol: contract.symbol,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    leverage: 2,
    priceCR: step1Price,
    quantity: 20,
  });
  world.futures.placeOrder({
    playerId: whale.id,
    playerName: whale.username,
    symbol: contract.symbol,
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    leverage: 2,
    priceCR: step1Price,
    quantity: 20,
  });
  world.futures.placeOrder({
    playerId: mm.id,
    playerName: mm.username,
    symbol: contract.symbol,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    leverage: 2,
    priceCR: crashPriceCR,
    quantity: 60,
  });
  world.futures.placeOrder({
    playerId: whale.id,
    playerName: whale.username,
    symbol: contract.symbol,
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    leverage: 2,
    priceCR: crashPriceCR,
    quantity: 10,
  });

  // Refresh Mark Prices (converging the confirmed real Spot trade price) & run Liquidation Engine
  const crashedSpotAsset = world.matching.getAsset('SOL-SIM')!;
  world.futures.markEngine.applyConfirmedSpotMove(contract, crashedSpotAsset.lastPriceMinor);
  world.futures.refreshAllMarkPrices();
  const liqResult = world.futures.runLiquidationCheck('SOL-SIM/CR-PERP');

  const botLiq = liqResult.liquidations.find((l) => l.playerId === memeSpec.id);
  assert.ok(botLiq, '10x LONG AI bot must be forcibly liquidated when Mark Price crashes >12%');

  const telemetry = world.getBotAgentTelemetry(memeSpec.id)!;
  assert.ok(telemetry.liquidationsCount >= 1, 'Bot telemetry must increment liquidationsCount');
  assert.ok(
    telemetry.status === 'LIQUIDATED' || telemetry.status === 'INSOLVENT' || telemetry.status === 'PAUSED_DRAWDOWN',
    `Liquidated bot status must reflect liquidation/risk state, got ${telemetry.status}`,
  );
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('8. Meme Coin Microstructure: order-book-driven price discovery & liquidity withdrawal under stress', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 314159 });
  world.economy.state.volatilityRegime = 'MARKET_PANIC';

  const nowBase = Date.now();
  let dogeTradesCount = 0;

  for (let i = 0; i < 12; i++) {
    const res = world.runAutonomousBotTick({
      targetSymbol: 'DOGE-SIM',
      forceAllAgents: true,
      nowMs: nowBase + i * 8_000,
    });
    dogeTradesCount += res.spotTrades.filter((t) => t.symbol === 'DOGE-SIM').length;
  }

  const dogeAsset = world.matching.getAsset('DOGE-SIM')!;
  const recentDogeTrades = world.matching.listTrades('DOGE-SIM', 50);
  assert.ok(dogeTradesCount > 0 && recentDogeTrades.length > 0, 'DOGE-SIM must execute real matched orders');

  // CRITICAL INVARIANT: Last price MUST strictly equal the latest executed real trade price (never Math.random!)
  const latestTrade = recentDogeTrades[0];
  assert.equal(
    dogeAsset.lastPriceMinor,
    latestTrade.priceMinor,
    'Asset lastPriceMinor must strictly come from the latest matched Trade',
  );

  // Verify adaptive Market Maker liquidity withdrawal activates in MARKET_PANIC
  const overview = world.getBotEcosystemOverview();
  const dogeSignal = overview.memeMarketSignals.find((s) => s.symbol === 'DOGE-SIM');
  assert.ok(dogeSignal, 'Overview must include live DOGE-SIM market signal snapshot');
  assert.ok(dogeSignal.spreadBps >= 0 && dogeSignal.bidDepthMinor >= 0 && dogeSignal.askDepthMinor >= 0);

  const mms = overview.agents.filter((a) => a.archetype === 'MARKET_MAKER');
  assert.ok(
    mms.some((mm) => mm.adaptiveProfile.liquidityWithdrawalActive || mm.adaptiveProfile.spreadMultiplier > 1.25),
    'Market Makers must widen spreads or withdraw liquidity during MARKET_PANIC',
  );
});

test('9. Ledger Conservation: zero-sum CR invariant & zero CR minting across 30 autonomous ticks', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 888999 });

  const initialSupplyMinor = world.ledger.getTotalMoneySupplyMinor();
  const initialTotalCRMinor = computeTotalConservedCRMinor(world);
  const nowBase = Date.now();

  let totalSpotTrades = 0;
  let totalFuturesTrades = 0;
  for (let i = 0; i < 30; i++) {
    const res = world.runAutonomousBotTick({
      forceAllAgents: true,
      nowMs: nowBase + i * 9_000,
    });
    totalSpotTrades += res.spotTrades.length;
    totalFuturesTrades += res.futuresTrades.length;
  }

  const finalSupplyMinor = world.ledger.getTotalMoneySupplyMinor();
  const finalTotalCRMinor = computeTotalConservedCRMinor(world);

  assert.ok(totalSpotTrades + totalFuturesTrades > 0, 'Simulation must execute real trades');
  assert.equal(finalSupplyMinor, initialSupplyMinor, 'Bots must NEVER mint or destroy CR supply');
  assert.equal(
    finalTotalCRMinor,
    initialTotalCRMinor,
    `Total CR across wallets + fees + futures pools must be strictly conserved (delta=${finalTotalCRMinor - initialTotalCRMinor})`,
  );
  assertAllWalletsAndHoldingsNonNegative(world);
});

test('10. Realtime Synchronization & 24/7 Server Operation with 0 Humans Connected', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 123456 });
  assert.equal(world.getOnlineHumanPlayersCount(), 0);

  const overviewBefore = world.getBotEcosystemOverview();
  assert.equal(overviewBefore.runningWithoutHumans, true);
  assert.equal(overviewBefore.onlineHumanPlayers, 0);

  const events: Array<{ seq: number; type: string }> = [];
  const unsub = world.eventBus.subscribe((env) => {
    events.push({ seq: env.sequenceNumber, type: env.eventType });
  });

  const nowBase = Date.now();
  for (let i = 0; i < 6; i++) {
    world.runAutonomousBotTick({ forceAllAgents: true, nowMs: nowBase + i * 10_000 });
  }
  unsub();

  assert.ok(events.length > 0, 'Autonomous ticks with 0 humans must still publish realtime events');
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].seq > events[i - 1].seq, 'Event sequenceNumber must be strictly monotonically increasing');
  }
  const eventTypes = new Set(events.map((e) => e.type));
  assert.ok(eventTypes.has('market.quote.updated'), 'Must broadcast market.quote.updated');
  assert.ok(eventTypes.has('market.orderbook.updated'), 'Must broadcast market.orderbook.updated');
});

test('11. Seeded Determinism & Anti-Herding Diversity (both BUY and SELL flow)', () => {
  const worldA = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 777123 });
  const worldB = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24, botSeed: 777123 });

  const rosterA = worldA.bots.listAgentConfigs();
  const rosterB = worldB.bots.listAgentConfigs();
  assert.deepEqual(rosterA, rosterB, 'Identical botSeed must generate identical agent rosters');

  const fixedNow = 1_800_000_000_000;
  const tickA = worldA.runAutonomousBotTick({ forceAllAgents: true, nowMs: fixedNow });
  const tickB = worldB.runAutonomousBotTick({ forceAllAgents: true, nowMs: fixedNow });
  assert.equal(tickA.ordersSubmitted, tickB.ordersSubmitted, 'Identical seed + timestamp must submit identical order counts');
  assert.equal(tickA.spotTrades.length, tickB.spotTrades.length, 'Identical seed must produce identical Spot trade counts');

  // Verify anti-herding diversity across 10 ticks: bots must generate both BUY and SELL trades/orders
  let buyOrders = 0;
  let sellOrders = 0;
  for (let i = 1; i <= 10; i++) {
    worldA.runAutonomousBotTick({ forceAllAgents: true, nowMs: fixedNow + i * 10_000 });
  }
  for (const cfg of rosterA) {
    const orders = worldA.matching.listPlayerOrders(cfg.id);
    for (const o of orders) {
      if (o.side === 'BUY') buyOrders += 1;
      else sellOrders += 1;
    }
  }
  assert.ok(buyOrders > 0 && sellOrders > 0, `Bots must never herd unanimously into one side (BUY=${buyOrders}, SELL=${sellOrders})`);
});

test('12. Multi-Scale Performance & Throughput Benchmark (10, 24, 30, 60 Agents)', () => {
  const scales = [10, 24, 30, 60];
  const results: Array<{
    agents: number;
    ticks: number;
    ordersSubmitted: number;
    spotTrades: number;
    futuresTrades: number;
    avgTickMs: number;
    p95TickMs: number;
    avgMatchMs: number;
    p95MatchMs: number;
    wallMs: number;
    ordersPerSec: number;
    rssMb: number;
    heapMb: number;
  }> = [];

  for (const agentCount of scales) {
    const world = new WorldEngine({
      enableBackgroundLoops: false,
      botAgentCount: agentCount,
      botSeed: 20261123 + agentCount,
      botCpuBudgetMs: 40,
    });

    const ticks = 15;
    let spotTrades = 0;
    let futuresTrades = 0;
    let ordersSubmitted = 0;
    const nowBase = Date.now();
    const startWall = performance.now();

    for (let i = 0; i < ticks; i++) {
      const r = world.runAutonomousBotTick({
        forceAllAgents: true,
        nowMs: nowBase + i * 10_000,
      });
      spotTrades += r.spotTrades.length;
      futuresTrades += r.futuresTrades.length;
      ordersSubmitted += r.ordersSubmitted;
    }

    const wallMs = Number((performance.now() - startWall).toFixed(2));
    const perf = world.bots.getPerformanceMetrics();
    const ordersPerSec = Number(((ordersSubmitted / Math.max(1, wallMs)) * 1000).toFixed(1));

    assertAllWalletsAndHoldingsNonNegative(world);
    assert.ok(perf.p95OrderMatchLatencyMs < 25, `p95 order match latency too high at ${agentCount} agents: ${perf.p95OrderMatchLatencyMs}ms`);
    assert.ok(perf.avgTickDurationMs < 250, `avg tick duration too high at ${agentCount} agents: ${perf.avgTickDurationMs}ms`);

    results.push({
      agents: agentCount,
      ticks,
      ordersSubmitted,
      spotTrades,
      futuresTrades,
      avgTickMs: perf.avgTickDurationMs,
      p95TickMs: perf.p95TickDurationMs,
      avgMatchMs: perf.avgOrderMatchLatencyMs,
      p95MatchMs: perf.p95OrderMatchLatencyMs,
      wallMs,
      ordersPerSec,
      rssMb: perf.memoryRssMb,
      heapMb: perf.heapUsedMb,
    });
  }

  // Emit structured real benchmark measurements for test report verification
  console.log('\n[BOT_BENCHMARK_RESULTS_JSON]', JSON.stringify(results));
});
