import test from 'node:test';
import assert from 'node:assert/strict';
import { toMinor } from '../../shared/contracts/money';
import { WorldEngine } from '../engine/WorldEngine';

test('TEST 26: Corporate dividend cannot exceed company cash balance (never prints CR)', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const nova = world.matching.getAsset('NOVA')!;
  nova.fundamentals!.cashBalanceMinor = toMinor(10); // Only 10 CR cash left
  nova.fundamentals!.dividendPerShareMinor = toMinor(5); // Wants 5 CR/share

  const res = world.economy.distributeCorporateDividend({
    asset: nova,
    shareholders: [{ playerId: alice.profile.id, shares: 100 }], // Needs 500 CR > 10 CR
    ledger: world.ledger,
  });

  assert.equal(res.paidTotalMinor, 0);
  assert.equal(res.skippedReason, 'INSUFFICIENT_CORPORATE_CASH');
  assert.equal(world.ledger.requireWallet(alice.profile.id).availableMinor, toMinor(100_000));
});

test('TEST 27: Bank savings deposit does not double count CR in wallet or Net Worth', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');

  const before = world.getPlayerProfile(alice.profile.id)!;
  assert.equal(before.netWorthMinor, toMinor(100_000));

  world.banking.depositSavings(alice.profile.id, 30_000);
  const after = world.getPlayerProfile(alice.profile.id)!;

  assert.equal(after.wallet.availableMinor, toMinor(70_000));
  assert.equal(after.wallet.savingsMinor, toMinor(30_000));
  assert.equal(after.netWorthMinor, toMinor(100_000)); // Strictly invariant!
});

test('TEST 28: Net Worth equals CASH + STOCKS + CRYPTO + PROPERTY + BUSINESS - DEBT', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const bob = world.loginGuest('Trader Bob', 'BOB'); // Starts with 100,000 CR + 100 NOVA @ 50 CR = 105,000 CR

  // Buy property (45,000 CR, estValue 44,200 -> blended estValue updates)
  world.buyProperty(bob.profile.id, 'PROP-RIV-01');
  // Found company with 25,000 CR
  world.createCompany(bob.profile.id, {
    name: 'Bob Quant Labs',
    ticker: 'BQLX',
    sector: 'Technology',
    initialCapitalCR: 25_000,
  });
  // Take loan of 10,000 CR (adds 10k cash AND 10k debt -> net worth unchanged)
  const preLoan = world.getPlayerProfile(bob.profile.id)!;
  world.banking.applyForLoan({
    playerId: bob.profile.id,
    principalCR: 10_000,
    termGameDays: 10,
    currentGameDay: 1,
    borrowerNetWorthMinor: preLoan.netWorthMinor,
    economy: world.economy.state,
  });

  const p = world.getPlayerProfile(bob.profile.id)!;
  const totalCash = p.wallet.availableMinor + p.wallet.lockedMinor + p.wallet.savingsMinor + p.wallet.termDepositMinor;
  const expectedNetWorth =
    totalCash + p.stockValueMinor + p.cryptoValueMinor + p.propertyValueMinor + p.businessEquityMinor - p.totalDebtMinor;

  assert.equal(p.netWorthMinor, expectedNetWorth);
  assert.equal(p.netWorthMinor, preLoan.netWorthMinor); // Loan doesn't magically increase net worth
});

test('TEST 29: Zero CR is created or destroyed in peer-to-peer trading (exact conservation with fee account)', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const bob = world.loginGuest('Trader Bob', 'BOB');

  const sumSystemAndPlayers = () => {
    const aW = world.ledger.requireWallet(alice.profile.id);
    const bW = world.ledger.requireWallet(bob.profile.id);
    const fees = world.ledger.getTotalFeeRevenueMinor();
    return aW.availableMinor + aW.lockedMinor + bW.availableMinor + bW.lockedMinor + fees;
  };

  const beforeTotal = sumSystemAndPlayers();

  world.placeOrder(alice.profile.id, { symbol: 'NOVA', side: 'BUY', type: 'LIMIT', priceCR: 50, quantity: 10 });
  world.placeOrder(bob.profile.id, { symbol: 'NOVA', side: 'SELL', type: 'LIMIT', priceCR: 49, quantity: 6 });

  const afterTotal = sumSystemAndPlayers();
  assert.equal(afterTotal, beforeTotal);
});

test('TEST 30: Simulated Market Maker & Investor Bots strictly obey finite wallet and inventory limits', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  for (let i = 0; i < 15; i++) {
    world.marketMakers.runSimulationTick(world.economy.state, 'BTC-SIM');
  }

  for (const wallet of world.ledger.wallets.listAllWallets()) {
    assert.ok(wallet.availableMinor >= 0, `Wallet ${wallet.playerId} availableMinor went negative`);
    assert.ok(wallet.lockedMinor >= 0, `Wallet ${wallet.playerId} lockedMinor went negative`);
    for (const h of world.ledger.wallets.listHoldings(wallet.playerId)) {
      assert.ok(h.availableQty >= 0, `Holding ${h.symbol} for ${wallet.playerId} availableQty went negative`);
      assert.ok(h.lockedQty >= 0, `Holding ${h.symbol} for ${wallet.playerId} lockedQty went negative`);
    }
  }
});
