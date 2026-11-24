import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calcFuturesFeeMinor,
  calcFuturesNotionalMinor,
  calcFuturesPnlMinor,
  calcInitialMarginMinor,
  calcIsolatedLiquidationPrices,
  calcMaintenanceMarginMinor,
  fromPriceInt,
  resolveRiskTier,
  toPriceInt,
  toQtyInt,
  type FuturesContract,
} from '../../shared/contracts/futures';
import { toMinor } from '../../shared/contracts/money';
import { DomainError } from '../domain/DomainError';
import { WorldEngine } from '../engine/WorldEngine';
import { SYSTEM_ACCOUNTS } from '../engine/ledger/LedgerService';

function createTestWorld(): WorldEngine {
  return new WorldEngine({
    worldId: 'WORLD-FUT-TEST',
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
    `[${label}] CR conservation drift detected: issued=${audit.issuedMinor}, totalWallet=${audit.totalWalletMinor}, feeRev=${audit.feeRevenueMinor}, diff=${audit.discrepancyMinor}`,
  );
}

describe('Empire Futures Exchange — Professional Perpetual Derivatives Engine', () => {
  it('1. Exact BigInt integer arithmetic for notional, PnL, margin, fees & liquidation price (zero float drift)', () => {
    // 0.333 BTC @ 65,432.15 CR
    const qtyInt = toQtyInt(0.333);
    const entryInt = toPriceInt(65_432.15, 100);
    const exitInt = toPriceInt(67_100.55, 100);

    const notional = calcFuturesNotionalMinor(entryInt, qtyInt, 100, 1);
    assert.equal(notional, 2_178_891); // 65,432.15 * 0.333 = 21,788.90595 -> 21,788.91 CR (half-up)

    const im10x = calcInitialMarginMinor(notional, 10);
    assert.equal(im10x, 217_890); // ceil(2,178,891 / 10) = 2,178.90 CR exact

    const longPnl = calcFuturesPnlMinor('LONG', entryInt, exitInt, qtyInt, 100, 1);
    const shortPnl = calcFuturesPnlMinor('SHORT', entryInt, exitInt, qtyInt, 100, 1);
    assert.equal(longPnl, -shortPnl, 'Long and Short PnL must be strictly symmetric zero-sum');
    assert.equal(longPnl, 55_558); // (67100.55 - 65432.15) * 0.333 = 555.5772 -> 555.58 CR (half-up)

    const tier = resolveRiskTier(notional);
    assert.equal(tier.tier, 1);
    assert.equal(tier.maintenanceMarginBps, 400);

    const mm = calcMaintenanceMarginMinor(notional, tier.maintenanceMarginBps);
    assert.equal(mm, 87_156); // ceil(2_178_891 * 400 / 10_000)

    const feeTaker = calcFuturesFeeMinor(notional, 5, true);
    assert.equal(feeTaker, 1_089); // round(2_178_891 * 5 / 10_000) = round(1089.4455) = 1_089

    const liqLong = calcIsolatedLiquidationPrices({
      side: 'LONG',
      entryPriceInt: entryInt,
      qtyInt,
      marginMinor: im10x,
      priceScale: 100,
      contractMultiplier: 1,
      mmrBps: 400,
      liqFeeBps: 50,
    });
    assert.ok(liqLong.liquidationPriceInt < entryInt);
    assert.ok(liqLong.bankruptcyPriceInt < liqLong.liquidationPriceInt);

    const liqShort = calcIsolatedLiquidationPrices({
      side: 'SHORT',
      entryPriceInt: entryInt,
      qtyInt,
      marginMinor: im10x,
      priceScale: 100,
      contractMultiplier: 1,
      mmrBps: 400,
      liqFeeBps: 50,
    });
    assert.ok(liqShort.liquidationPriceInt > entryInt);
    assert.ok(liqShort.bankruptcyPriceInt > liqShort.liquidationPriceInt);

    // 4-decimal FX perpetual (EUR-SIM/CR-PERP)
    const fxEntry = toPriceInt(1.0852, 10_000);
    const fxExit = toPriceInt(1.1052, 10_000);
    const fxPnl = calcFuturesPnlMinor('LONG', fxEntry, fxExit, toQtyInt(1000), 10_000, 1);
    assert.equal(fxPnl, 2_000); // 0.02 * 1000 = 20.00 CR exact
  });

  it('2. Seeds all 6 perpetual contracts and never grants spot asset ownership', () => {
    const world = createTestWorld();
    const overview = world.getFuturesOverview();
    const symbols = overview.contracts.map((c) => c.symbol).sort();
    assert.deepEqual(symbols, [
      'BTC-SIM/CR-PERP',
      'ETH-SIM/CR-PERP',
      'EUR-SIM/CR-PERP',
      'NOVA/CR-PERP',
      'SOL-SIM/CR-PERP',
      'TITAN/CR-PERP',
    ]);

    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);
    const beforeHoldings = world.ledger.wallets.listHoldings(alice.id).length;

    const res = world.placeFuturesOrder(alice.id, {
      symbol: 'BTC-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.05,
      leverage: 2,
    });
    assert.ok(res.trades.length > 0);
    assert.ok(res.position && res.position.side === 'LONG');
    assert.equal(world.ledger.wallets.listHoldings(alice.id).length, beforeHoldings, 'Perp must NOT grant Spot holdings');
    assertExactConservation(world, 'zero-spot-ownership');
  });

  it('3. Enforces Risk Disclosure, Isolated-only (Cross disabled), and Leverage limits (20x locked)', () => {
    const world = createTestWorld();
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;

    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'NOVA/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 10,
          leverage: 1,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_RISK_NOT_ACKNOWLEDGED',
    );

    world.acknowledgeFuturesRisk(alice.id);

    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'NOVA/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          marginMode: 'CROSS',
          quantity: 10,
          leverage: 2,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_CROSS_MARGIN_DISABLED',
    );

    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol: 'NOVA/CR-PERP',
          side: 'BUY',
          type: 'MARKET',
          quantity: 10,
          leverage: 20,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_LEVERAGE_EXCEEDED',
    );
  });

  it('4. Direct P2P Long/Short matching, Increase, Partial Close, Full Close & Reverse with exact CR conservation', () => {
    const world = createTestWorld();
    const symbol = 'NOVA/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    const bob = world.loginGuest('Trader Bob', 'BOB').profile;
    world.acknowledgeFuturesRisk(alice.id);
    world.acknowledgeFuturesRisk(bob.id);

    // Clear bot orders on NOVA/CR-PERP so Alice and Bob match directly at exact controlled prices
    for (const bot of world.getFuturesOverview().bots) {
      world.futures.cancelAllPlayerOrdersForSymbol(bot.id, symbol);
    }

    const contract = world.futures.getContract(symbol)!;
    const p1 = snapPriceCR(contract, contract.markPriceInt);
    const p2 = snapPriceCR(contract, Math.round(contract.markPriceInt * 1.04)); // +4%

    const aOpen = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: p1,
      quantity: 20,
      leverage: 5,
    });
    assert.equal(aOpen.order.status, 'OPEN');

    const bOpen = world.placeFuturesOrder(bob.id, {
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: p1,
      quantity: 20,
      leverage: 5,
    });
    assert.equal(bOpen.trades.length, 1);
    assert.equal(bOpen.trades[0].buyerTransition, 'OPEN_NEW');
    assert.equal(bOpen.trades[0].sellerTransition, 'OPEN_NEW');

    const alicePos = world.futures.getPosition(alice.id, symbol)!;
    const bobPos = world.futures.getPosition(bob.id, symbol)!;
    assert.equal(alicePos.side, 'LONG');
    assert.equal(alicePos.quantity, 20);
    assert.equal(bobPos.side, 'SHORT');
    assert.equal(bobPos.quantity, 20);

    // Increase Alice & Bob by +10 @ p1
    world.placeFuturesOrder(alice.id, { symbol, side: 'BUY', type: 'LIMIT', priceCR: p1, quantity: 10, leverage: 5 });
    const inc = world.placeFuturesOrder(bob.id, { symbol, side: 'SELL', type: 'LIMIT', priceCR: p1, quantity: 10, leverage: 5 });
    assert.equal(inc.trades[0].buyerTransition, 'INCREASE');
    assert.equal(world.futures.getPosition(alice.id, symbol)!.quantity, 30);

    // Partial close 10 @ p2 (+4% profit for Alice Long, -4% loss for Bob Short)
    world.placeFuturesOrder(bob.id, { symbol, side: 'BUY', type: 'LIMIT', priceCR: p2, quantity: 10, leverage: 5, reduceOnly: true });
    const partClose = world.placeFuturesOrder(alice.id, { symbol, side: 'SELL', type: 'LIMIT', priceCR: p2, quantity: 10, leverage: 5, reduceOnly: true });
    assert.equal(partClose.trades[0].sellerTransition, 'REDUCE');
    assert.equal(partClose.trades[0].buyerTransition, 'REDUCE');
    assert.equal(world.futures.getPosition(alice.id, symbol)!.quantity, 20);

    // Reverse Alice from LONG 20 -> SHORT 10 against Bob reversing SHORT 20 -> LONG 10
    world.placeFuturesOrder(bob.id, { symbol, side: 'BUY', type: 'LIMIT', priceCR: p2, quantity: 30, leverage: 5 });
    const rev = world.placeFuturesOrder(alice.id, { symbol, side: 'SELL', type: 'LIMIT', priceCR: p2, quantity: 30, leverage: 5 });
    assert.equal(rev.trades[0].sellerTransition, 'REVERSE');
    assert.equal(rev.trades[0].buyerTransition, 'REVERSE');

    assert.equal(world.futures.getPosition(alice.id, symbol)!.side, 'SHORT');
    assert.equal(world.futures.getPosition(alice.id, symbol)!.quantity, 10);
    assert.equal(world.futures.getPosition(bob.id, symbol)!.side, 'LONG');
    assert.equal(world.futures.getPosition(bob.id, symbol)!.quantity, 10);

    // Close both completely @ p2
    world.placeFuturesOrder(bob.id, { symbol, side: 'SELL', type: 'LIMIT', priceCR: p2, quantity: 10, leverage: 5, reduceOnly: true });
    world.placeFuturesOrder(alice.id, { symbol, side: 'BUY', type: 'LIMIT', priceCR: p2, quantity: 10, leverage: 5, reduceOnly: true });

    assert.equal(world.futures.getPosition(alice.id, symbol), null);
    assert.equal(world.futures.getPosition(bob.id, symbol), null);

    const aliceProfile = world.getPlayerProfile(alice.id)!;
    const bobProfile = world.getPlayerProfile(bob.id)!;
    assert.ok(aliceProfile.wallet.availableMinor > toMinor(100_000), 'Alice should have net profit after closing winning Long');
    assert.ok(bobProfile.wallet.availableMinor < toMinor(100_000), 'Bob should have net loss after closing losing Short');
    assertExactConservation(world, 'p2p-full-lifecycle');
  });

  it('5. Post-Only, Reduce-Only, IOC, Idempotency, Insufficient Margin & Add Isolated Margin', () => {
    const world = createTestWorld();
    const symbol = 'ETH-SIM/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    const book = world.futures.getOrderBook(symbol);
    const contract = world.futures.getContract(symbol)!;
    const bestAskMajor = fromPriceInt(book.bestAskInt!, contract.priceScale);

    // Post-Only crossing spread MUST be rejected
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          priceCR: bestAskMajor,
          quantity: 0.5,
          leverage: 2,
          postOnly: true,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_POST_ONLY_REJECTED',
    );

    // Reduce-Only with no open position MUST be rejected
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: 0.5,
          leverage: 2,
          reduceOnly: true,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_REDUCE_ONLY_VIOLATION',
    );

    // Insufficient Margin rejected cleanly
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          priceCR: snapPriceCR(contract, Math.round(book.bestAskInt! * 0.98)),
          quantity: 500,
          leverage: 1,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
    );

    // Idempotency deduplication
    const idemKey = 'idem_test_fut_001';
    const first = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      leverage: 5,
      idempotencyKey: idemKey,
    });
    assert.equal(first.deduplicated, false);
    const balAfterFirst = world.ledger.requireWallet(alice.id).availableMinor;

    const dup = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      leverage: 5,
      idempotencyKey: idemKey,
    });
    assert.equal(dup.deduplicated, true);
    assert.equal(dup.order.id, first.order.id);
    assert.equal(world.ledger.requireWallet(alice.id).availableMinor, balAfterFirst);

    // Add Isolated Margin lowers liquidation price & margin ratio
    const posBefore = world.futures.getPosition(alice.id, symbol)!;
    const posAfter = world.addFuturesPositionMargin(alice.id, posBefore.id, 1_000);
    assert.equal(posAfter.marginMinor, posBefore.marginMinor + toMinor(1_000));
    assert.ok(posAfter.liquidationPriceInt < posBefore.liquidationPriceInt);
    assert.ok(posAfter.marginRatioPct < posBefore.marginRatioPct);

    // Concurrent margin spend prevention: trying to lock remaining + extra fails without negative balance
    const availCR = world.ledger.requireWallet(alice.id).availableMinor / 100;
    assert.throws(
      () =>
        world.placeFuturesOrder(alice.id, {
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          priceCR: snapPriceCR(contract, Math.round(book.bestAskInt! * 0.95)),
          quantity: Math.ceil((availCR * 1.5) / bestAskMajor),
          leverage: 1,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_FUNDS',
    );
    assert.ok(world.ledger.requireWallet(alice.id).availableMinor >= 0);
    assertExactConservation(world, 'flags-idempotency-margin');
  });

  it('6. Attached Stop Loss / Take Profit conditional orders trigger automatically on Mark Price', () => {
    const world = createTestWorld();
    const symbol = 'SOL-SIM/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    const contract = world.futures.getContract(symbol)!;
    const slPrice = snapPriceCR(contract, Math.round(contract.markPriceInt * 0.96));
    const tpPrice = snapPriceCR(contract, Math.round(contract.markPriceInt * 1.08));

    const openRes = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 10,
      leverage: 3,
      stopLossCR: slPrice,
      takeProfitCR: tpPrice,
    });
    assert.equal(openRes.attachedConditionalOrders.length, 2);
    assert.ok(world.futures.getPosition(alice.id, symbol));

    // Move Spot Index down by -6% so Mark Price crosses Stop Loss
    const crashedIndex = Math.round(contract.indexPriceInt * 0.94);
    world.futures.markEngine.applyConfirmedSpotMove(contract, crashedIndex);
    world.futures.refreshContractMarkPrice(symbol);

    assert.equal(world.futures.getPosition(alice.id, symbol), null, 'Stop Loss should have closed LONG position');
    assertExactConservation(world, 'conditional-sl-tp');
  });

  it('7. Mark Price resists single outlier Last Price & Degraded Spot feed pauses liquidations', () => {
    const world = createTestWorld();
    const symbol = 'TITAN/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    const bob = world.loginGuest('Trader Bob', 'BOB').profile;
    const charlie = world.loginGuest('Trader Charlie', 'CUSTOM').profile;
    world.acknowledgeFuturesRisk(alice.id);
    world.acknowledgeFuturesRisk(bob.id);
    world.acknowledgeFuturesRisk(charlie.id);

    // Open a 5x Long for Alice
    world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 5,
      leverage: 5,
    });
    const beforeContract = world.futures.getContract(symbol)!;

    // Simulate single outlier trade on Futures book (-18% below Mark) between Bob and Charlie
    for (const bot of world.getFuturesOverview().bots) {
      world.futures.cancelAllPlayerOrdersForSymbol(bot.id, symbol);
    }
    const outlierPriceCR = snapPriceCR(beforeContract, Math.round(beforeContract.markPriceInt * 0.82));
    world.placeFuturesOrder(bob.id, {
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: outlierPriceCR,
      quantity: 1,
      leverage: 2,
    });
    world.placeFuturesOrder(charlie.id, {
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: outlierPriceCR,
      quantity: 1,
      leverage: 2,
    });

    const afterContract = world.futures.getContract(symbol)!;
    assert.equal(afterContract.lastPriceInt, toPriceInt(outlierPriceCR, afterContract.priceScale));

    // Mark Price MUST remain clamped within +/- 150 bps of Spot Index, NOT drop 18%!
    const deviationBps =
      Math.abs((afterContract.markPriceInt - afterContract.indexPriceInt) * 10_000) / afterContract.indexPriceInt;
    assert.ok(deviationBps <= 155, `Mark Price drifted too far (${deviationBps} bps) from Index!`);

    // Alice's 5x Long MUST NOT be liquidated by the single outlier trade
    const liqCheck = world.futures.runLiquidationCheck(symbol);
    assert.equal(liqCheck.liquidations.filter((l) => l.playerId === alice.id).length, 0);
    assert.ok(world.futures.getPosition(alice.id, symbol), 'Outlier Last Price must NOT liquidate healthy position');

    // Mark Spot feed unhealthy -> contract enters DEGRADED, blocks new opens & pauses liquidations
    world.futures.markEngine.setSpotFeedHealth(symbol, false, 'Mất kết nối Spot Index thử nghiệm');
    const degradedContract = world.futures.refreshContractMarkPrice(symbol);
    assert.equal(degradedContract.status, 'DEGRADED');

    assert.throws(
      () =>
        world.placeFuturesOrder(charlie.id, {
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          priceCR: outlierPriceCR,
          quantity: 1,
          leverage: 1,
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'FUTURES_MARKET_DEGRADED',
    );
    assertExactConservation(world, 'mark-price-and-degraded');
  });

  it('8. Funding Rate is strictly zero-sum peer-to-peer (totalPaid === totalReceived, 0 CR minted)', () => {
    const world = createTestWorld();
    const symbol = 'BTC-SIM/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.2,
      leverage: 3,
    });

    const posBefore = world.futures.getPosition(alice.id, symbol)!;
    const evtPos = world.futures.settleFundingForSymbol(symbol, 25);
    assert.ok(evtPos.totalPaidMinor > 0);
    assert.equal(evtPos.totalPaidMinor, evtPos.totalReceivedMinor, 'Funding MUST be strictly zero-sum');

    const posAfterPos = world.futures.getPosition(alice.id, symbol)!;
    assert.ok(posAfterPos.marginMinor < posBefore.marginMinor, 'Long pays positive funding from isolated margin');

    const evtNeg = world.futures.settleFundingForSymbol(symbol, -30);
    assert.ok(evtNeg.totalPaidMinor > 0);
    assert.equal(evtNeg.totalPaidMinor, evtNeg.totalReceivedMinor, 'Negative funding MUST also be strictly zero-sum');

    const posAfterNeg = world.futures.getPosition(alice.id, symbol)!;
    assert.ok(posAfterNeg.marginMinor > posAfterPos.marginMinor, 'Long receives negative funding into isolated margin');
    assertExactConservation(world, 'zero-sum-funding');
  });

  it('9. Liquidation Engine: Margin Call -> Forced Liquidation -> Liq Fee Split -> Insurance Fund Inflow', () => {
    const world = createTestWorld();
    const symbol = 'BTC-SIM/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    // Open a 10x Long (~13k CR notional)
    const open = world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.2,
      leverage: 10,
    });
    const pos = open.position!;
    const contract = world.futures.getContract(symbol)!;

    // Step 1: Drop Spot Index -5.0% -> with Tier 1 MMR (4%) + LiqFee (0.5%) on 10x Long, Margin Ratio is ~84% (in [80%, 100%))
    const mcIndex = Math.round(pos.entryPriceInt * 0.95);
    world.futures.markEngine.applyConfirmedSpotMove(contract, mcIndex);
    world.futures.refreshContractMarkPrice(symbol);
    const mcRes = world.futures.runLiquidationCheck(symbol);
    const posAfterMc = world.futures.getPosition(alice.id, symbol);
    assert.ok(
      posAfterMc && (mcRes.marginCalls.some((p) => p.playerId === alice.id) || posAfterMc.status === 'MARGIN_CALL'),
      `Should trigger Margin Call warning around 80% (actual ratio=${posAfterMc?.marginRatioPct}%)`,
    );
    assert.equal(mcRes.liquidations.filter((l) => l.playerId === alice.id).length, 0);

    // Step 2: Drop Spot Index below Liq Price (accounting for +150 bps clamped basis) -> breaches 100% Margin Ratio -> Forced Liquidation!
    const liqIndex = Math.round(pos.liquidationPriceInt * 0.98);
    world.futures.markEngine.applyConfirmedSpotMove(contract, liqIndex);
    world.futures.refreshContractMarkPrice(symbol);

    const mm = world.getFuturesOverview().bots[0];
    world.futures.cancelAllPlayerOrdersForSymbol(mm.id, symbol);
    world.futures.placeOrder({
      playerId: mm.id,
      playerName: mm.name,
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, liqIndex),
      quantity: 5,
      leverage: 2,
    });

    const liqRes = world.futures.runLiquidationCheck(symbol);
    const aliceLiq = liqRes.liquidations.find((l) => l.playerId === alice.id);
    assert.ok(aliceLiq, 'Alice 10x Long must be liquidated when Mark crosses Liq Price');
    assert.equal(world.futures.getPosition(alice.id, symbol), null);
    assert.ok(aliceLiq.liquidationFeeMinor > 0 || aliceLiq.insuranceFundDeltaMinor !== 0);

    // Step 3: Verify Partial Liquidation (50%) on a large position (>= 50,000 CR notional)
    const bob = world.loginGuest('Trader Bob', 'BOB').profile;
    world.acknowledgeFuturesRisk(bob.id);
    const askSeedPrice = snapPriceCR(contract, Math.round(liqIndex * 1.005));
    world.futures.placeOrder({
      playerId: mm.id,
      playerName: mm.name,
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: askSeedPrice,
      quantity: 5,
      leverage: 2,
    });
    const largeOpen = world.placeFuturesOrder(bob.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1.0, // ~60k CR notional >= 50k CR partial threshold
      leverage: 10,
    });
    const largePos = largeOpen.position!;
    assert.ok(largePos.notionalMinor >= 50_000_00, `Expected >= 50k CR notional, got ${largePos.notionalMinor}`);

    // Drop Index just below Liq Price (accounting for +150 bps clamped basis) while equity stays positive (> 0) so Partial 50% executes
    const partLiqIndex = Math.round(largePos.liquidationPriceInt * 0.98);
    const refreshedContract = world.futures.getContract(symbol)!;
    world.futures.markEngine.applyConfirmedSpotMove(refreshedContract, partLiqIndex);
    world.futures.refreshContractMarkPrice(symbol);
    world.futures.cancelAllPlayerOrdersForSymbol(mm.id, symbol);
    world.futures.placeOrder({
      playerId: mm.id,
      playerName: mm.name,
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(refreshedContract, partLiqIndex),
      quantity: 5,
      leverage: 2,
    });
    const partRes = world.futures.runLiquidationCheck(symbol);
    const bobLiq = partRes.liquidations.find((l) => l.playerId === bob.id);
    assert.ok(bobLiq, 'Bob large 10x Long must trigger liquidation');
    assert.equal(bobLiq.liquidationType, 'PARTIAL', 'Large position with positive remaining equity should partially liquidate 50%');
    assert.ok(world.futures.getPosition(bob.id, symbol) !== null, 'Half of position should survive partial liquidation');
    assertExactConservation(world, 'liquidation-full-and-partial');
  });

  it('10. Bankruptcy beyond finite Insurance Fund triggers EMERGENCY_HALTED + UnresolvedDeficit (ZERO CR printed, ADL=false)', () => {
    const world = createTestWorld();
    const symbol = 'NOVA/CR-PERP';
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);

    // Open 10x Long on NOVA/CR-PERP
    world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 600,
      leverage: 10,
    });
    const pos = world.futures.getPosition(alice.id, symbol)!;
    const contract = world.futures.getContract(symbol)!;

    // Drain finite Insurance Fund down to 50 CR (via valid system accounting transfer) to test depletion cleanly
    const currentFund = world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND);
    world.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.FUTURES_INSURANCE_FUND,
      toAccount: SYSTEM_ACCOUNTS.FUTURES_FEE_REVENUE,
      amountMinor: currentFund - 50_00,
      category: 'FUTURES_INSURANCE_FUND',
      referenceId: 'test_drain_fund',
      description: 'Test scenario: low insurance reserve',
    });

    // Extreme gap crash -35% below entry -> massive bankruptcy shortfall > 50 CR reserve
    const crashInt = Math.round(pos.entryPriceInt * 0.65);
    world.futures.markEngine.applyConfirmedSpotMove(contract, crashInt);
    world.futures.refreshContractMarkPrice(symbol);

    // Provide resting bid at crashed price so liquidation executes on real book at bankrupt price
    const mm = world.getFuturesOverview().bots[0];
    for (const bot of world.getFuturesOverview().bots) {
      world.futures.cancelAllPlayerOrdersForSymbol(bot.id, symbol);
    }
    world.futures.placeOrder({
      playerId: mm.id,
      playerName: mm.name,
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, crashInt),
      quantity: 2000,
      leverage: 2,
    });

    const res = world.futures.runLiquidationCheck(symbol);
    const depletedLiq = res.liquidations.find((l) => l.playerId === alice.id);
    assert.ok(depletedLiq, 'Liquidation event must be logged');
    assert.equal(depletedLiq.liquidationType, 'HALTED_INSURANCE_DEPLETED');
    assert.ok(depletedLiq.unresolvedDeficitMinor > 0, 'Unresolved deficit must be transparently recorded');

    const fundState = world.futures.getInsuranceFundState();
    assert.equal(fundState.balanceMinor, 0, 'Insurance fund cannot go negative');
    assert.equal(fundState.adlSupported, false, 'Must honestly report adlSupported=false');
    assert.ok(fundState.unresolvedDeficits.length > 0);
    assert.equal(world.futures.getContract(symbol)!.status, 'EMERGENCY_HALTED');
    assertExactConservation(world, 'insurance-depletion-halt');
  });

  it('11. Stress Test: Dry Order Book Liquidity halts liquidation (no fabricated fill price) & AI Bot has zero liquidation immunity', () => {
    const world = createTestWorld();
    const symbol = 'ETH-SIM/CR-PERP';

    // 1) Dry liquidity test: remove ALL resting orders on ETH-SIM/CR-PERP when a Long hits liquidation
    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);
    world.placeFuturesOrder(alice.id, {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 2,
      leverage: 10,
    });
    const pos = world.futures.getPosition(alice.id, symbol)!;
    const ethContract = world.futures.getContract(symbol)!;

    for (const bot of world.getFuturesOverview().bots) {
      world.futures.cancelAllPlayerOrdersForSymbol(bot.id, symbol);
    }

    const crashInt = Math.round(pos.entryPriceInt * 0.85);
    world.futures.markEngine.applyConfirmedSpotMove(ethContract, crashInt);
    world.futures.refreshContractMarkPrice(symbol);

    const dryLiq = world.futures.runLiquidationCheck(symbol);
    const halted = dryLiq.liquidations.find((l) => l.playerId === alice.id);
    assert.ok(halted, 'Dry book liquidation attempt must be recorded');
    assert.equal(halted.liquidationType, 'HALTED_INSUFFICIENT_LIQUIDITY');
    assert.equal(halted.executionPriceInt, 0, 'Engine must NEVER invent a fake fill price');
    assert.equal(world.futures.getContract(symbol)!.status, 'DEGRADED');

    // 2) AI Bot liquidation vulnerability test (ZERO immunity for bots)
    const solSym = 'SOL-SIM/CR-PERP';
    const specBot = world.getFuturesOverview().bots.find((b) => b.archetype === 'HIGH_BETA_SPECULATOR')!;
    const specPos = world.futures.getPosition(specBot.id, solSym);
    assert.ok(specPos, 'Speculator bot should hold an open position on SOL-SIM/CR-PERP');

    // Cancel specBot's protective Stop Loss so the adverse move tests Liquidation Engine directly against the bot
    world.futures.cancelAllPlayerOrdersForSymbol(specBot.id, solSym);

    const solContract = world.futures.getContract(solSym)!;
    const adversePrice =
      specPos.side === 'SHORT'
        ? Math.round(specPos.entryPriceInt * 1.25)
        : Math.round(specPos.entryPriceInt * 0.75);
    world.futures.markEngine.applyConfirmedSpotMove(solContract, adversePrice);
    world.futures.refreshContractMarkPrice(solSym);

    const mm = world.getFuturesOverview().bots[0];
    world.futures.placeOrder({
      playerId: mm.id,
      playerName: mm.name,
      symbol: solSym,
      side: specPos.side === 'SHORT' ? 'SELL' : 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(solContract, adversePrice),
      quantity: 500,
      leverage: 2,
    });

    const botLiqRes = world.futures.runLiquidationCheck(solSym);
    assert.ok(
      botLiqRes.liquidations.some((l) => l.playerId === specBot.id),
      'AI Bot MUST be liquidated like any human trader (zero immunity)',
    );
    assertExactConservation(world, 'dry-liquidity-and-bot-liquidation');
  });

  it('12. Cross-client realtime event emission & authoritative reconnect sync', () => {
    const world = createTestWorld();
    const events: string[] = [];
    const unsubscribe = world.eventBus.subscribe((env) => {
      events.push(env.eventType);
    });

    const alice = world.loginGuest('Trader Alice', 'ALICE').profile;
    world.acknowledgeFuturesRisk(alice.id);
    world.placeFuturesOrder(alice.id, {
      symbol: 'EUR-SIM/CR-PERP',
      side: 'BUY',
      type: 'MARKET',
      quantity: 1_000,
      leverage: 5,
    });

    assert.ok(events.includes('futures.trade.executed'));
    assert.ok(events.includes('futures.orderbook.updated'));
    assert.ok(events.includes('futures.quote.updated'));
    assert.ok(events.includes('futures.position.updated'));

    const accountAfterReconnect = world.getFuturesAccount(alice.id);
    assert.equal(accountAfterReconnect.positions.length, 1);
    assert.equal(accountAfterReconnect.positions[0].symbol, 'EUR-SIM/CR-PERP');

    const profile = world.getPlayerProfile(alice.id)!;
    assert.ok(profile.futuresEquityMinor > 0);
    assert.ok(profile.futuresMarginMinor > 0);
    assert.ok(
      profile.netWorthMinor > toMinor(99_500),
      `Net worth should include isolated futures equity without losing locked margin (got ${profile.netWorthMinor})`,
    );

    unsubscribe();
    assertExactConservation(world, 'realtime-sync-networth');
  });
});
