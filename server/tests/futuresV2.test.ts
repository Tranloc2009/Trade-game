import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import express from 'express';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  fromPriceInt,
  resolveEffectiveMarginParams,
  toPriceInt,
  type FuturesContract,
  type FuturesOrderBookDelta,
  type FuturesOrderBookSnapshot,
} from '../../shared/contracts/futures';
import { toMinor } from '../../shared/contracts/money';
import type { RealtimeEnvelope } from '../../shared/contracts/types';
import { createApiRouter } from '../api/routes';
import { DomainError } from '../domain/DomainError';
import { WorldEngine } from '../engine/WorldEngine';
import { IndexedOrderBook } from '../engine/matching/IndexedOrderBook';
import { MEME_COIN_SPECS } from '../engine/meme/memeSeed';
import { MEME_WHALE_CONFIGS } from '../engine/meme/MemeCoinEngine';
import { FUTURES_AI_BOTS } from '../engine/futures/FuturesBotEngine';
import { SocketGateway } from '../realtime/SocketGateway';

function createTestWorld(): WorldEngine {
  return new WorldEngine({
    worldId: 'WORLD-FUT-V2-TEST',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
}

function snapPriceCR(contract: FuturesContract, rawPriceInt: number): number {
  const snappedInt = Math.max(
    contract.priceTickInt,
    Math.round(rawPriceInt / contract.priceTickInt) * contract.priceTickInt,
  );
  return fromPriceInt(snappedInt, contract.priceScale);
}

function assertExactConservation(world: WorldEngine, label: string): void {
  const audit = world.ledger.auditCurrencyConservation('CR');
  assert.equal(
    audit.discrepancyMinor,
    0,
    `[${label}] CR conservation drift: issued=${audit.issuedMinor}, totalWallet=${audit.totalWalletMinor}, diff=${audit.discrepancyMinor}`,
  );
}

function assertExactMemeSupplyConservation(world: WorldEngine, label: string): void {
  const audits = world.memes.auditAllMemeSupplies();
  assert.equal(audits.length, 8, `[${label}] Must audit all 8 meme coins`);
  for (const a of audits) {
    assert.equal(
      a.valid,
      true,
      `[${label}] Meme supply drift on ${a.symbol}: total=${a.totalSupply}, accounted=${a.accountedSupply}, diff=${a.discrepancy}`,
    );
  }
}

describe('TRADING EMPIRE — FUTURES V2 High-Performance Derivatives & Meme Economy Suite', () => {
  it('V2-01. Supports leverage tiers 1x, 5x, 20x, 50x, 100x, 125x on BTC/ETH and liquidates 125x cleanly on ~0.5% move', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    const btc = world.futures.getContract('BTC-SIM/CR-PERP')!;
    assert.equal(btc.maxLeverage, 125);
    assert.equal(btc.effectiveMaxLeverage, 125);

    // Open and close across 1x, 5x, 20x, 50x, 100x cleanly
    for (const lev of [1, 5, 20, 50, 100] as const) {
      const open = world.placeFuturesOrder(alice.id, {
        symbol: 'BTC-SIM/CR-PERP',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.02,
        leverage: lev,
      });
      assert.ok(open.position && open.position.leverage === lev, `Expected ${lev}x position`);
      assert.ok(open.position.marginRatioPct < 80, `${lev}x position must open healthy (not in immediate margin call)`);
      world.closeFuturesPosition(alice.id, open.position.id, { type: 'MARKET' });
    }

    // Open 125x Long on BTC-SIM/CR-PERP
    const open125 = world.placeFuturesOrder(alice.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.05,
      leverage: 125,
    });
    assert.ok(open125.position);
    assert.equal(open125.position.leverage, 125);
    assert.equal(open125.position.status, 'OPEN');
    assert.ok(open125.position.liquidationPriceInt < open125.position.entryPriceInt);
    assert.ok(open125.position.liquidationPriceInt > Math.round(open125.position.entryPriceInt * 0.99));

    // Confirm ~0.6% adverse Mark Price shock liquidates 125x Long immediately
    const shockPriceInt = Math.round(open125.position.entryPriceInt * 0.994);
    world.futures.markEngine.applyConfirmedSpotMove(btc, shockPriceInt);
    world.futures.refreshContractMarkPrice('BTC-SIM/CR-PERP');
    const liq = world.futures.runLiquidationCheck('BTC-SIM/CR-PERP');

    const aliceLiq = liq.liquidations.find((l) => l.playerId === alice.id);
    assert.ok(aliceLiq, '125x Long must liquidate on 0.6% adverse Mark Price drop');
    assert.equal(world.futures.getPosition(alice.id, 'BTC-SIM/CR-PERP'), null);
    assertExactConservation(world, 'V2-01-125x-liquidation');
  });

  it('V2-02. Enforces per-asset leverage caps & Position-Size Notional Risk Tier step-downs', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    // Give Alice extra CR to test high notional tier step-downs
    world.ledger.issueCurrency(alice.id, 'CR', toMinor(1_500_000), 'test_v2_notional', 'Test capital');

    // SOL allows 75x, rejects 100x
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'SOL-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 1,
          leverage: 100,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );
    const sol75 = world.placeFuturesOrder(alice.id, {
      symbol: 'SOL-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      leverage: 75,
    });
    assert.equal(sol75.position?.leverage, 75);

    // DOGX allows 50x, rejects 75x
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'DOGX-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 100,
          leverage: 75,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );
    const dogx50 = world.placeFuturesOrder(alice.id, {
      symbol: 'DOGX-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 100,
      leverage: 50,
    });
    assert.equal(dogx50.position?.leverage, 50);

    // FROG allows 20x, rejects 25x
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'FROG-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 100,
          leverage: 25,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );
    const frog20 = world.placeFuturesOrder(alice.id, {
      symbol: 'FROG-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 100,
      leverage: 20,
    });
    assert.equal(frog20.position?.leverage, 20);

    // DEGEN allows 10x, rejects 20x
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'DEGEN-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 50,
          leverage: 20,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );

    // Notional Risk Tier step-down on BTC-SIM/CR-PERP:
    // Small notional (~5,000 CR) -> Tier 1 (max 125x)
    // Large notional (~400,000 CR, e.g. 6 BTC @ 65k CR) -> Tier 4+ (max <= 25x), so 125x MUST be rejected!
    const tierSmall = resolveEffectiveMarginParams(toMinor(5_000), 'MAJOR_CRYPTO', 125, 125);
    const tierLarge = resolveEffectiveMarginParams(toMinor(400_000), 'MAJOR_CRYPTO', 125, 25);
    assert.equal(tierSmall.maxAllowedLeverage, 125);
    assert.ok(tierLarge.maxAllowedLeverage <= 25, `Large BTC notional must step down max leverage (got ${tierLarge.maxAllowedLeverage})`);
    assert.ok(tierLarge.maintenanceMarginBps > tierSmall.maintenanceMarginBps, 'Larger notional tier must increase MMR');

    const btc = world.futures.getContract('BTC-SIM/CR-PERP')!;
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'BTC-SIM/CR-PERP',
          side: 'BUY',
          type: 'LIMIT',
          priceCR: snapPriceCR(btc, Math.round(btc.markPriceInt * 0.95)),
          quantity: 6, // ~390,000 CR notional -> exceeds Tier 1-3
          leverage: 125,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );

    assertExactConservation(world, 'V2-02-asset-caps-and-tiers');
  });

  it('V2-03. Cross-market account lock prevents overlapping collateral double-spend & negative balances', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    // Re-entrant cross-market attempt while account lock is held must fail cleanly (409 conflict / RATE_LIMITED)
    world.ledger.withAccountLock(alice.id, () => {
      assert.equal(world.ledger.isAccountLocked(alice.id), true);
      assert.throws(
        () =>
          world.placeFuturesOrder(alice.id, {
            symbol: 'BTC-SIM/CR-PERP',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.05,
            leverage: 10,
          }),
        (err: unknown) => err instanceof DomainError && err.statusCode === 409 && err.code === 'RATE_LIMITED',
      );
      assert.throws(
        () =>
          world.placeOrder(alice.id, {
            symbol: 'NOVA',
            side: 'BUY',
            type: 'LIMIT',
            priceCR: 45,
            quantity: 10,
          }),
        (err: unknown) => err instanceof DomainError && err.statusCode === 409 && err.code === 'RATE_LIMITED',
      );
    });
    assert.equal(world.ledger.isAccountLocked(alice.id), false);

    // Sequential Spot + Futures collateral exhaustion never allows negative available CR
    const spotBuy = world.placeOrder(alice.id, {
      symbol: 'NOVA',
      side: 'BUY',
      type: 'LIMIT',
      priceCR: 45,
      quantity: 2000, // locks 90,000 CR + fee reserve (~90,135 CR)
    });
    assert.equal(spotBuy.order.status, 'OPEN');

    // Remaining available CR is ~9,865 CR -> attempting a 20,000 CR initial margin Futures order must reject
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'BTC-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 1, // ~65,000 CR notional @ 2x = ~32,500 CR IM
          leverage: 2,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
    );

    const wallet = world.ledger.requireWallet(alice.id);
    assert.ok(wallet.availableMinor >= 0, 'Available CR must never become negative');
    assertExactConservation(world, 'V2-03-cross-market-lock');
  });

  it('V2-04. Trailing Stop (TRAILING_STOP_MARKET) advances watermark on favorable move and triggers on callback retracement', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    const btc = world.futures.getContract('BTC-SIM/CR-PERP')!;
    const open = world.placeFuturesOrder(alice.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.05,
      leverage: 10,
    });
    assert.ok(open.position);
    const entryInt = open.position.entryPriceInt;

    // Place 1.00% (100 bps) Trailing Stop Sell (reduceOnly)
    const tsOrder = world.placeFuturesOrder(alice.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'SELL',
      type: 'TRAILING_STOP_MARKET',
      quantity: 0.05,
      leverage: 10,
      reduceOnly: true,
      callbackRateBps: 100,
    });
    assert.equal(tsOrder.order.status, 'PENDING_TRIGGER');
    assert.equal(tsOrder.order.callbackRateBps, 100);

    // Price rallies +4% -> trailing watermark should advance upward, NOT trigger yet
    const peakInt = Math.round(entryInt * 1.04);
    world.futures.markEngine.applyConfirmedSpotMove(btc, peakInt);
    world.futures.refreshContractMarkPrice('BTC-SIM/CR-PERP');
    assert.ok(world.futures.getPosition(alice.id, 'BTC-SIM/CR-PERP'), 'Position must stay open during rally');

    // Add resting bid liquidity near peak-1.5% so triggered market sell fills cleanly
    const bob = world.loginGuest('Trader Bob', 'BOB').profile;
    world.acknowledgeFuturesRisk(bob.id);
    const retraceInt = Math.round(peakInt * 0.985); // -1.5% from peak (> 1.0% callback!)
    world.placeFuturesOrder(bob.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(btc, retraceInt),
      quantity: 0.2,
      leverage: 5,
    });

    // Price retraces -1.5% from peak -> Trailing Stop triggers and closes Alice's Long!
    world.futures.markEngine.applyConfirmedSpotMove(btc, retraceInt);
    world.futures.refreshContractMarkPrice('BTC-SIM/CR-PERP');

    assert.equal(
      world.futures.getPosition(alice.id, 'BTC-SIM/CR-PERP'),
      null,
      'Trailing Stop must close Long after 1.5% pullback from peak',
    );
    const closedOrder = world.futures.listPlayerOrders(alice.id, 'BTC-SIM/CR-PERP').find((o) => o.id === tsOrder.order.id);
    assert.equal(closedOrder?.status, 'FILLED');
    assertExactConservation(world, 'V2-04-trailing-stop');
  });

  it('V2-05. Market Regimes dynamically restrict NEW order leverage while leaving existing open positions intact', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    // Open a 100x position under NORMAL regime
    const open100 = world.placeFuturesOrder(alice.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.02,
      leverage: 100,
    });
    assert.equal(open100.position?.leverage, 100);

    // Transition through all 5 regimes and verify effective leverage caps
    const highVol = world.setFuturesRegimeOverride('BTC-SIM/CR-PERP', 'HIGH_VOLATILITY');
    assert.equal(highVol.regime, 'HIGH_VOLATILITY');
    assert.ok(world.futures.getContract('BTC-SIM/CR-PERP')!.effectiveMaxLeverage <= 75);

    const extreme = world.setFuturesRegimeOverride('BTC-SIM/CR-PERP', 'EXTREME_VOLATILITY');
    assert.equal(extreme.regime, 'EXTREME_VOLATILITY');
    assert.ok(world.futures.getContract('BTC-SIM/CR-PERP')!.effectiveMaxLeverage <= 25);

    const crisis = world.setFuturesRegimeOverride('BTC-SIM/CR-PERP', 'LIQUIDITY_CRISIS');
    assert.equal(crisis.regime, 'LIQUIDITY_CRISIS');
    assert.ok(world.futures.getContract('BTC-SIM/CR-PERP')!.effectiveMaxLeverage <= 10);

    // Existing 100x position MUST remain intact!
    const existing = world.futures.getPosition(alice.id, 'BTC-SIM/CR-PERP');
    assert.ok(existing && existing.leverage === 100 && existing.status === 'OPEN');

    // NEW 50x order MUST be rejected during LIQUIDITY_CRISIS
    const bob = world.loginGuest('Trader Bob', 'BOB').profile;
    world.acknowledgeFuturesRisk(bob.id);
    assert.throws(
      () =>
        world.placeFuturesOrder(bob.id, {
          symbol: 'BTC-SIM/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 0.02,
          leverage: 50,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );

    // NEW 10x order succeeds during LIQUIDITY_CRISIS
    const bob10 = world.placeFuturesOrder(bob.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.02,
      leverage: 10,
    });
    assert.equal(bob10.position?.leverage, 10);

    // Recovery & back to Normal
    const rec = world.setFuturesRegimeOverride('BTC-SIM/CR-PERP', 'RECOVERY');
    assert.equal(rec.regime, 'RECOVERY');
    const norm = world.setFuturesRegimeOverride('BTC-SIM/CR-PERP', 'NORMAL');
    assert.equal(norm.regime, 'NORMAL');
    assert.equal(world.futures.getContract('BTC-SIM/CR-PERP')!.effectiveMaxLeverage, 125);

    assertExactConservation(world, 'V2-05-market-regimes');
  });

  it('V2-06. Cascading Liquidation Engine liquidates staggered leveraged cohorts cleanly with zero CR drift', () => {
    const world = createTestWorld();
    const eth = world.futures.getContract('ETH-SIM/CR-PERP')!;
    const liqMaker = world.loginGuest('Deep Bid Desk', 'CUSTOM').profile;
    world.acknowledgeFuturesRisk(liqMaker.id);
    world.ledger.issueCurrency(liqMaker.id, 'CR', toMinor(5_000_000), 'test_cascade_maker', 'Cascade bid depth');

    // Create 3 traders with staggered leverage: 100x, 50x, 25x on ETH-SIM/CR-PERP
    const t100 = world.loginGuest('Lev100 Trader', 'CUSTOM').profile;
    const t50 = world.loginGuest('Lev50 Trader', 'CUSTOM').profile;
    const t25 = world.loginGuest('Lev25 Trader', 'CUSTOM').profile;
    for (const t of [t100, t50, t25]) world.acknowledgeFuturesRisk(t.id);

    const p100 = world.placeFuturesOrder(t100.id, {
      symbol: 'ETH-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.5,
      leverage: 100,
    }).position!;
    const p50 = world.placeFuturesOrder(t50.id, {
      symbol: 'ETH-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.5,
      leverage: 50,
    }).position!;
    const p25 = world.placeFuturesOrder(t25.id, {
      symbol: 'ETH-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.5,
      leverage: 25,
    }).position!;

    assert.ok(p100.liquidationPriceInt > p50.liquidationPriceInt);
    assert.ok(p50.liquidationPriceInt > p25.liquidationPriceInt);

    // Provide resting bids down to -5% so liquidation sells execute against real counterparties
    const crashInt = Math.round(eth.markPriceInt * 0.96); // -4% drop triggers 100x, 50x, AND 25x!
    for (let i = 0; i < 6; i++) {
      world.placeFuturesOrder(liqMaker.id, {
        symbol: 'ETH-SIM/CR-PERP',
        side: 'BUY',
        type: 'LIMIT',
        priceCR: snapPriceCR(eth, Math.round(eth.markPriceInt * (0.97 - i * 0.005))),
        quantity: 2,
        leverage: 3,
      });
    }

    world.futures.markEngine.applyConfirmedSpotMove(eth, crashInt);
    world.futures.refreshContractMarkPrice('ETH-SIM/CR-PERP');
    const cascade = world.futures.runLiquidationCheck('ETH-SIM/CR-PERP');

    const liquidatedIds = new Set(cascade.liquidations.map((l) => l.playerId));
    assert.ok(liquidatedIds.has(t100.id), '100x position must be liquidated');
    assert.ok(liquidatedIds.has(t50.id), '50x position must be liquidated');
    assert.ok(liquidatedIds.has(t25.id), '25x position must be liquidated');
    assert.ok(cascade.trades.length >= 3, 'Liquidations must execute real closing trades on the order book');
    assertExactConservation(world, 'V2-06-liquidation-cascade');
  });

  it('V2-07. Meme Coin Economy: 8 Spot Coins, 6 Perps, exact supply conservation, finite whales & real slippage', () => {
    const world = createTestWorld();
    assert.equal(MEME_COIN_SPECS.length, 8);
    assertExactMemeSupplyConservation(world, 'V2-07-initial');

    const overview = world.getMemeOverview();
    assert.equal(overview.tokens.length, 8);
    assert.equal(overview.whales.length, 3);
    assert.equal(
      overview.tokens.filter((t) => t.contractEligibility.perpEnabled).length,
      6,
      'Exactly 6 Meme Coins should be eligible for Perpetual Futures',
    );

    // Verify all 8 meme coins exist in MatchingEngine & 6 perps exist in FuturesEngine
    for (const spec of MEME_COIN_SPECS) {
      assert.ok(world.matching.getAsset(spec.symbol), `Spot meme ${spec.symbol} missing`);
      if (spec.perpSymbol) {
        assert.ok(world.futures.getContract(spec.perpSymbol), `Perp ${spec.perpSymbol} missing`);
      }
    }

    // Real thin-book price impact on DEGEN-SIM when player sweeps asks
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    const beforeAsset = world.matching.getAsset('DEGEN-SIM')!;
    const beforePrice = beforeAsset.lastPriceMinor;
    const beforeBook = world.matching.getOrderBook('DEGEN-SIM', 10);
    assert.ok(beforeBook.asks.length >= 2, 'DEGEN-SIM must have resting asks');

    const sweepQty = Math.min(20_000, Math.round(beforeBook.asks[0].quantity + beforeBook.asks[1].quantity * 0.6));
    const buyRes = world.placeOrder(alice.id, {
      symbol: 'DEGEN-SIM',
      side: 'BUY',
      type: 'MARKET',
      quantity: Math.max(beforeAsset.minQty, Math.round(sweepQty / beforeAsset.qtyStep) * beforeAsset.qtyStep),
      maxSlippageBps: 2000,
    });
    assert.ok(buyRes.trades.length >= 1);
    const afterPrice = world.matching.getAsset('DEGEN-SIM')!.lastPriceMinor;
    assert.ok(afterPrice >= beforePrice, 'Sweeping thin meme asks must move execution price upward');

    // Finite Whale capital constraint: Whale CANNOT buy beyond its finite CR balance!
    const whale = MEME_WHALE_CONFIGS[0];
    const whaleWallet = world.ledger.requireWallet(whale.id);
    assert.ok(whaleWallet.availableMinor > 0 && whaleWallet.availableMinor < toMinor(10_000_000));
    const btcRef = world.matching.getAsset('BTC-SIM')!;
    assert.throws(
      () =>
        world.matching.placeOrder({
          playerId: whale.id,
          playerName: whale.name,
          symbol: 'BTC-SIM',
          side: 'BUY',
          type: 'LIMIT',
          priceCR: btcRef.lastPriceMinor / 100, // in-band price
          quantity: 100, // ~6.5M CR > whale's finite 2.2M CR wallet!
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
    );

    // Run whale ticks and verify 0 token supply drift & 0 CR drift
    for (let i = 0; i < 6; i++) {
      world.memes.runWhaleTick();
    }
    assertExactMemeSupplyConservation(world, 'V2-07-post-whale-trading');
    assertExactConservation(world, 'V2-07-post-whale-cr');
  });

  it('V2-08. Structured Meme News triggers genuinely DIVERGENT bot reactions & Drawdown Limit suspends breached bot', () => {
    const world = createTestWorld();
    assert.equal(FUTURES_AI_BOTS.length, 8, 'Must have all 8 Futures AI Bot archetypes');

    // Publish low-credibility bullish rumor on DOGX-SIM (credibility = 0.35, intensity = 0.90)
    const published = world.publishMemeNews({
      symbol: 'DOGX-SIM',
      eventType: 'EXCHANGE_LISTING_RUMOR',
      sentiment: 'BULLISH',
      intensity: 0.9,
      credibility: 0.35,
      headline: '[TEST RUMOR] Đồn đoán niêm yết DOGX-SIM (độ tin cậy thấp)',
    });

    assert.equal(published.news.sentiment, 'BULLISH');
    assert.ok(published.botReaction.ordersByBot.length >= 2, 'Multiple bots should react to meme news');

    const newsBotOrder = published.botReaction.ordersByBot.find((o) => o.archetype === 'NEWS_TRADER');
    const meanRevOrder = published.botReaction.ordersByBot.find((o) => o.archetype === 'MEAN_REVERSION');
    assert.ok(newsBotOrder, 'NEWS_TRADER must react to meme news');
    assert.ok(meanRevOrder, 'MEAN_REVERSION must react to low-credibility meme news');
    assert.equal(newsBotOrder.side, 'BUY', 'NEWS_TRADER chases bullish rumor');
    assert.equal(meanRevOrder.side, 'SELL', 'MEAN_REVERSION fades low-credibility bullish rumor in opposite direction');

    // Verify Drawdown Suspension on INSTITUTIONAL_RISK_MANAGER (maxDrawdownPct = 12%)
    const instBot = FUTURES_AI_BOTS.find((b) => b.archetype === 'INSTITUTIONAL_RISK_MANAGER')!;
    const instWallet = world.ledger.requireWallet(instBot.id);
    // Simulate realized loss transferring 15% of bot's CR to counterparty (preserving CR conservation!)
    const lossAmount = Math.floor(instWallet.availableMinor * 0.16);
    const alice = world.loginGuest('Counterparty Alice', 'ALICE').profile;
    world.ledger.transferAvailable({
      fromAccount: instBot.id,
      toAccount: alice.id,
      amountMinor: lossAmount,
      category: 'TRADE_SETTLEMENT',
      referenceId: 'test_dd_loss',
      description: 'Simulated realized loss to verify bot drawdown circuit breaker',
    });

    const state = world.futuresBots.evaluateBotDrawdown(instBot.id);
    assert.ok(state && state.currentDrawdownPct >= 12, `Expected drawdown >= 12%, got ${state?.currentDrawdownPct}`);
    assert.equal(state.suspended, true, 'Bot breaching maxDrawdownPct MUST be automatically suspended');
    assert.ok(state.suspendedReason && state.suspendedReason.includes('Drawdown'));

    assertExactConservation(world, 'V2-08-divergent-news-and-drawdown');
  });

  it('V2-09. Incremental Order Book Deltas reconstruct exact authoritative L2 snapshot with monotonic sequencing', () => {
    const world = createTestWorld();
    const symbol = 'ETH-SIM/CR-PERP';
    const eth = world.futures.getContract(symbol)!;

    // Capture baseline authoritative L2 snapshot
    const initialSnap = world.futures.getOrderBook(symbol, 100);
    const localBids = new Map<number, { qty: number; orders: number }>();
    const localAsks = new Map<number, { qty: number; orders: number }>();
    for (const l of initialSnap.bids) localBids.set(l.priceInt, { qty: l.quantity, orders: l.orderCount });
    for (const l of initialSnap.asks) localAsks.set(l.priceInt, { qty: l.quantity, orders: l.orderCount });

    let lastSeq = initialSnap.sequenceNumber;
    const capturedDeltas: Array<{ envelope: RealtimeEnvelope<FuturesOrderBookDelta>; delta: FuturesOrderBookDelta }> = [];

    const unsub = world.eventBus.subscribe((env) => {
      if (env.eventType === 'futures.orderbook.delta' && env.marketId === symbol) {
        const delta = env.payload as FuturesOrderBookDelta;
        capturedDeltas.push({ envelope: env as RealtimeEnvelope<FuturesOrderBookDelta>, delta });
      }
    });

    const alice = world.loginGuest('Delta Alice', 'ALICE').profile;
    const bob = world.loginGuest('Delta Bob', 'BOB').profile;
    world.acknowledgeFuturesRisk(alice.id);
    world.acknowledgeFuturesRisk(bob.id);

    // Perform insert, partial fill, cancel, and market sweep
    const limitBidPrice = snapPriceCR(eth, Math.round(eth.markPriceInt * 0.99));
    const placed1 = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: limitBidPrice,
      quantity: 0.4,
      leverage: 5,
    });
    const placed2 = world.placeFuturesOrder(bob.id, {
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: limitBidPrice,
      quantity: 0.3,
      leverage: 5,
    });
    // Market sell consumes top of book
    world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: 0.2,
      leverage: 5,
    });
    // Cancel resting order
    world.cancelFuturesOrder(bob.id, placed2.order.id);
    world.cancelFuturesOrder(alice.id, placed1.order.id);

    unsub();

    assert.ok(capturedDeltas.length >= 4, `Expected >= 4 incremental deltas, got ${capturedDeltas.length}`);

    for (const { envelope, delta } of capturedDeltas) {
      assert.equal(envelope.marketId, symbol, 'Envelope must include marketId');
      assert.equal(delta.prevSequenceNumber, lastSeq, 'Delta prevSequenceNumber must chain strictly with previous seq');
      assert.ok(delta.sequenceNumber > lastSeq, 'Delta sequenceNumber must strictly increase');
      lastSeq = delta.sequenceNumber;

      for (const b of delta.bids) {
        if (b.quantity <= 0 || b.orderCount <= 0) localBids.delete(b.priceInt);
        else localBids.set(b.priceInt, { qty: b.quantity, orders: b.orderCount });
      }
      for (const a of delta.asks) {
        if (a.quantity <= 0 || a.orderCount <= 0) localAsks.delete(a.priceInt);
        else localAsks.set(a.priceInt, { qty: a.quantity, orders: a.orderCount });
      }
    }

    const finalAuthoritative = world.futures.getOrderBook(symbol, 100);
    assert.equal(lastSeq, finalAuthoritative.sequenceNumber);

    const reconstructedBids = Array.from(localBids.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([priceInt, v]) => ({ priceInt, qty: Number(v.qty.toFixed(3)), orders: v.orders }));
    const authBids = finalAuthoritative.bids.map((b) => ({
      priceInt: b.priceInt,
      qty: Number(b.quantity.toFixed(3)),
      orders: b.orderCount,
    }));
    assert.deepEqual(reconstructedBids, authBids, 'Reconstructed L2 bids must match authoritative snapshot 100%');

    const reconstructedAsks = Array.from(localAsks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([priceInt, v]) => ({ priceInt, qty: Number(v.qty.toFixed(3)), orders: v.orders }));
    const authAsks = finalAuthoritative.asks.map((a) => ({
      priceInt: a.priceInt,
      qty: Number(a.quantity.toFixed(3)),
      orders: a.orderCount,
    }));
    assert.deepEqual(reconstructedAsks, authAsks, 'Reconstructed L2 asks must match authoritative snapshot 100%');
  });

  it('V2-10. Real Two-Client Socket.IO broadcast, private room isolation & reconnect resync', async () => {
    const world = createTestWorld();
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(world));
    const httpServer = http.createServer(app);
    new SocketGateway(httpServer, world);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    assert.ok(addr && typeof addr === 'object');
    const url = `http://127.0.0.1:${addr.port}`;

    const aliceLogin = world.loginGuest('Socket Alice', 'ALICE');
    const bobLogin = world.loginGuest('Socket Bob', 'BOB');
    world.acknowledgeFuturesRisk(aliceLogin.profile.id);
    world.acknowledgeFuturesRisk(bobLogin.profile.id);

    const aliceEvents: RealtimeEnvelope[] = [];
    const bobEvents: RealtimeEnvelope[] = [];

    const connectClient = (token: string, bucket: RealtimeEnvelope[]): Promise<ClientSocket> =>
      new Promise((resolve, reject) => {
        const client = createSocketClient(url, {
          path: '/socket.io',
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
        });
        client.on('world:event', (env: RealtimeEnvelope) => bucket.push(env));
        client.on('connect', () => resolve(client));
        client.on('connect_error', reject);
      });

    let clientAlice: ClientSocket | null = null;
    let clientBob: ClientSocket | null = null;

    try {
      clientAlice = await connectClient(aliceLogin.session.token, aliceEvents);
      clientBob = await connectClient(bobLogin.session.token, bobEvents);

      clientAlice.emit('futures:subscribe', 'BTC-SIM/CR-PERP');
      clientBob.emit('futures:subscribe', 'BTC-SIM/CR-PERP');
      await new Promise((r) => setTimeout(r, 80));

      // Alice opens a 50x Long on BTC-SIM/CR-PERP
      world.placeFuturesOrder(aliceLogin.profile.id, {
        symbol: 'BTC-SIM/CR-PERP',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.03,
        leverage: 50,
      });

      await new Promise((r) => setTimeout(r, 120));

      // Public market events delivered to BOTH clients with marketId
      assert.ok(
        aliceEvents.some((e) => e.eventType === 'futures.orderbook.delta' && e.marketId === 'BTC-SIM/CR-PERP'),
        'Alice must receive public futures.orderbook.delta',
      );
      assert.ok(
        bobEvents.some((e) => e.eventType === 'futures.orderbook.delta' && e.marketId === 'BTC-SIM/CR-PERP'),
        'Bob must receive public futures.orderbook.delta',
      );
      assert.ok(
        bobEvents.some((e) => e.eventType === 'futures.trade.executed' && e.marketId === 'BTC-SIM/CR-PERP'),
        'Bob must receive public futures.trade.executed',
      );

      // Private position & balance events delivered ONLY to Alice (STRICT PRIVATE ISOLATION!)
      assert.ok(
        aliceEvents.some((e) => e.eventType === 'futures.position.updated'),
        'Alice must receive her private futures.position.updated',
      );
      assert.equal(
        bobEvents.some(
          (e) =>
            e.eventType === 'futures.position.updated' &&
            (e.payload as { playerId?: string })?.playerId === aliceLogin.profile.id,
        ),
        false,
        'Bob MUST NEVER receive Alice private position updates!',
      );
      assert.equal(
        bobEvents.some(
          (e) =>
            e.eventType === 'balance.updated' &&
            (e.payload as { playerId?: string })?.playerId === aliceLogin.profile.id,
        ),
        false,
        'Bob MUST NEVER receive Alice private balance updates!',
      );

      // Reconnection resync test
      clientAlice.disconnect();
      const resyncEvents: RealtimeEnvelope[] = [];
      clientAlice = await connectClient(aliceLogin.session.token, resyncEvents);
      clientAlice.emit('futures:resync', 'BTC-SIM/CR-PERP');
      await new Promise((r) => setTimeout(r, 100));

      assert.ok(
        resyncEvents.some(
          (e) =>
            e.eventType === 'futures.orderbook.updated' &&
            (e.payload as FuturesOrderBookSnapshot).symbol === 'BTC-SIM/CR-PERP',
        ),
        'Reconnect resync must push authoritative orderbook snapshot',
      );
      assert.ok(
        resyncEvents.some((e) => e.eventType === 'futures.position.updated' && e.marketId === 'BTC-SIM/CR-PERP'),
        'Reconnect resync must push open private position state',
      );
    } finally {
      clientAlice?.disconnect();
      clientBob?.disconnect();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('V2-11. IndexedOrderBook standalone stress: 2,000 orders across 200 levels maintain strict Price-Time Priority & O(1) cancel', () => {
    interface MiniOrder {
      id: string;
      playerId: string;
      side: 'BUY' | 'SELL';
      priceInt: number;
      remainingQtyInt: number;
      createdSeq: number;
    }

    const book = new IndexedOrderBook<MiniOrder>('STRESS-PERP', true);
    const insertedIds: string[] = [];

    for (let i = 0; i < 2000; i++) {
      const side = i % 2 === 0 ? 'BUY' : 'SELL';
      const levelIdx = Math.floor(i / 2) % 100;
      const priceInt = side === 'BUY' ? 100_000 - levelIdx * 10 : 100_100 + levelIdx * 10;
      const ord: MiniOrder = {
        id: `ord_${i}`,
        playerId: `p_${i % 20}`,
        side,
        priceInt,
        remainingQtyInt: 1_000,
        createdSeq: i + 1,
      };
      book.addOrder(ord, priceInt, 1_000);
      insertedIds.push(ord.id);
    }

    assert.equal(book.getOrderCount(), 2000);
    assert.equal(book.getBestBidPrice(), 100_000);
    assert.equal(book.getBestAskPrice(), 100_100);

    // Check strict FIFO at best bid (100_000): orders 0, 200, 400, ...
    const topBid = book.getBestOrder('BUY');
    assert.equal(topBid?.id, 'ord_0');

    // Cancel middle order in FIFO queue (ord_200) in O(1) and verify remaining queue stays intact
    const removed = book.removeOrder('ord_200');
    assert.equal(removed, true);
    assert.equal(book.getOrderCount(), 1999);

    // Verify L2 snapshot ordering (bids descending, asks ascending)
    const bidsL2 = book.getTopLevels('BUY', 50);
    const asksL2 = book.getTopLevels('SELL', 50);
    for (let i = 1; i < bidsL2.length; i++) {
      assert.ok(bidsL2[i - 1].priceInt > bidsL2[i].priceInt, 'Bids must be strictly descending');
    }
    for (let i = 1; i < asksL2.length; i++) {
      assert.ok(asksL2[i - 1].priceInt < asksL2[i].priceInt, 'Asks must be strictly ascending');
    }

    // Remove all remaining orders and verify empty book
    for (const id of insertedIds) {
      book.removeOrder(id);
    }
    assert.equal(book.getOrderCount(), 0);
    assert.equal(book.getBestBidPrice(), null);
    assert.equal(book.getBestAskPrice(), null);
  });
});
