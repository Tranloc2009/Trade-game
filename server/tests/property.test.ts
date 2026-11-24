import test from 'node:test';
import assert from 'node:assert/strict';
import { PROPERTY_TRANSFER_FEE_BPS, calcFeeMinor, toMinor } from '../../shared/contracts/money';
import { WorldEngine } from '../engine/WorldEngine';

test('TEST 21, 22 & 23: Property atomic buy prevents double-sale, transfers ownership, credits seller net of fee', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const bob = world.loginGuest('Trader Bob', 'BOB');

  // Choose an affordable listed property (Willow Promenade Apartment #4C = 45,000 CR)
  const prop = world.properties.getProperty('PROP-RIV-01')!;
  assert.equal(prop.isListed, true);
  const priceMinor = prop.listingPriceMinor!;
  const sellerBefore = world.ledger.requireWallet(prop.ownerId).availableMinor;

  const buyRes = world.buyProperty(alice.profile.id, prop.id);
  const expectedFee = calcFeeMinor(priceMinor, PROPERTY_TRANSFER_FEE_BPS);
  const expectedSellerNet = priceMinor - expectedFee;

  // TEST 22: Ownership transferred cleanly
  assert.equal(buyRes.property.ownerId, alice.profile.id);
  assert.equal(buyRes.property.isListed, false);

  // TEST 23: Seller receives exact proceeds minus 1.50% fee
  assert.equal(buyRes.feeMinor, expectedFee);
  assert.equal(buyRes.sellerNetMinor, expectedSellerNet);
  assert.equal(world.ledger.requireWallet(buyRes.sellerId).availableMinor, sellerBefore + expectedSellerNet);

  // TEST 21: Second buyer cannot purchase already-sold property
  assert.throws(
    () => world.buyProperty(bob.profile.id, prop.id),
    (err: { code?: string }) => err.code === 'PROPERTY_ALREADY_SOLD',
  );
});

test('TEST 24: Non-owner cannot list another player property for sale', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const bob = world.loginGuest('Trader Bob', 'BOB');

  world.buyProperty(alice.profile.id, 'PROP-RIV-01');

  assert.throws(
    () => world.listProperty(bob.profile.id, 'PROP-RIV-01', 60_000),
    (err: { code?: string }) => err.code === 'NOT_PROPERTY_OWNER',
  );
});

test('TEST 25: Expired auction rejects late bids and settles according to server time', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const bob = world.loginGuest('Trader Bob', 'BOB');

  const auction = world.properties.getAuction('AUC-IND-04')!;
  // Valid bid before expiry (starting price 55,000 CR, reserve 60,000 CR)
  world.properties.placeBid(auction.id, alice.profile.id, alice.profile.username, 62_000, Date.now());
  assert.equal(world.ledger.requireWallet(alice.profile.id).lockedMinor, toMinor(62_000));

  // Late bid after server endTime must be rejected
  const afterExpiryMs = new Date(auction.endTime).getTime() + 5_000;
  assert.throws(
    () => world.properties.placeBid(auction.id, bob.profile.id, bob.profile.username, 70_000, afterExpiryMs),
    (err: { code?: string }) => err.code === 'AUCTION_ENDED',
  );

  // Settle after expiry -> Alice wins ownership
  const settled = world.properties.settleExpiredAuctions(afterExpiryMs);
  assert.equal(settled.length >= 1, true);
  assert.equal(world.properties.getProperty(auction.propertyId)?.ownerId, alice.profile.id);
});

function sumPlayerAndFeeMinor(world: WorldEngine): number {
  const walletTotal = world.ledger.wallets.listAllWallets().reduce(
    (sum, w) => sum + w.availableMinor + w.lockedMinor + w.savingsMinor + w.termDepositMinor,
    0,
  );
  return walletTotal + world.ledger.getTotalFeeRevenueMinor();
}

test('TEST 26: Vietnam Real Estate V2 has 3 active cities, 6 verified landmarks, and safe pending verification location', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const snapshot = world.properties.getVietnamMarketSnapshot(world.economy.state);

  const activeCities = snapshot.cities.filter((c) => c.status === 'ACTIVE');
  const plannedCities = snapshot.cities.filter((c) => c.status === 'PLANNED');
  assert.deepEqual(
    activeCities.map((c) => c.code).sort(),
    ['DN', 'HCM', 'HN'],
  );
  assert.equal(plannedCities.length >= 6, true);

  const verified = snapshot.locations.filter((l) => l.verificationStatus === 'VERIFIED');
  const pending = snapshot.locations.filter((l) => l.verificationStatus === 'PENDING_VERIFICATION');
  assert.equal(verified.length, 6);
  assert.equal(pending.length >= 1, true);

  for (const loc of verified) {
    assert.equal(typeof loc.latitude, 'number');
    assert.equal(typeof loc.longitude, 'number');
    assert.equal(loc.sourceUrl.startsWith('https://'), true);
  }
  for (const loc of pending) {
    assert.equal(loc.latitude, null);
    assert.equal(loc.longitude, null);
  }
});

test('TEST 27: Property buy records ledgerTransactionId and preserves zero-sum CR supply invariant', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');
  const supplyBefore = sumPlayerAndFeeMinor(world);

  const buyRes = world.buyProperty(alice.profile.id, 'VN-DN-SCR-01');
  const supplyAfter = sumPlayerAndFeeMinor(world);

  assert.equal(supplyAfter, supplyBefore);
  assert.equal(buyRes.property.transactions.length, 1);
  assert.equal(buyRes.property.transactions[0].buyerId, alice.profile.id);
  assert.equal(buyRes.property.transactions[0].executionPriceMinor, toMinor(45_000));
  assert.equal(buyRes.property.transactions[0].ledgerTransactionId.length > 0, true);
  assert.equal(buyRes.property.lastSalePriceMinor, toMinor(45_000));
});

test('TEST 28: Exclusive rental prevents overlapping leases and handles finite NPC payout + vacancy cycles', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');

  world.buyProperty(alice.profile.id, 'VN-DN-SCR-01');
  const started = world.properties.startRental('VN-DN-SCR-01', alice.profile.id);
  assert.equal(started.isRented, true);
  assert.equal(started.activeRentalAgreement?.exclusive, true);

  // Starting a second exclusive lease on same property must fail
  assert.throws(
    () => world.properties.startRental('VN-DN-SCR-01', alice.profile.id),
    (err: { code?: string }) => err.code === 'PROPERTY_RENTAL_CONFLICT',
  );

  // Run multiple rental cycles to verify finite budget payouts and realistic vacancy occurrences
  const aliceBefore = world.ledger.requireWallet(alice.profile.id).availableMinor;
  let paidCount = 0;
  let vacantCount = 0;
  let totalPaidMinor = 0;
  for (let i = 0; i < 20; i++) {
    const events = world.properties.collectRentalCycle(world.economy.state);
    for (const evt of events) {
      if (evt.propertyId !== 'VN-DN-SCR-01') continue;
      if (evt.status === 'PAID') {
        paidCount++;
        totalPaidMinor += evt.netRentMinor;
      } else {
        vacantCount++;
      }
    }
  }
  const aliceAfter = world.ledger.requireWallet(alice.profile.id).availableMinor;
  const npcRentDebits = world.ledger.ledger
    .listByAccount('SYS_NPC_TENANT_BUDGET', 200)
    .filter((e) => e.category === 'RENTAL_INCOME' && e.referenceId === 'VN-DN-SCR-01')
    .reduce((sum, e) => sum + e.amountMinor, 0);

  // Every CR paid to Alice comes strictly from finite SYS_NPC_TENANT_BUDGET ledger entries
  assert.equal(aliceAfter - aliceBefore, totalPaidMinor);
  assert.equal(npcRentDebits, totalPaidMinor);
  assert.equal(paidCount > 0, true);
  assert.equal(vacantCount > 0, true);

  const propAfter = world.properties.getProperty('VN-DN-SCR-01')!;
  assert.equal(propAfter.rentalHistory.length, 20);
});

test('TEST 29: Property upgrade deducts CR cleanly and caps at maxUpgradeLevel', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');

  world.buyProperty(alice.profile.id, 'VN-DN-SCR-01');
  const before = world.properties.getProperty('VN-DN-SCR-01')!;
  assert.equal(before.upgradeLevel, 1);

  const up2 = world.upgradeProperty(alice.profile.id, 'VN-DN-SCR-01');
  assert.equal(up2.property.upgradeLevel, 2);
  assert.equal(up2.property.estimatedValueMinor > before.estimatedValueMinor, true);

  const up3 = world.upgradeProperty(alice.profile.id, 'VN-DN-SCR-01');
  assert.equal(up3.property.upgradeLevel, 3);

  assert.throws(
    () => world.upgradeProperty(alice.profile.id, 'VN-DN-SCR-01'),
    (err: { code?: string }) => err.code === 'PROPERTY_MAX_UPGRADE',
  );
});

test('TEST 30: Empire Bank property collateral loan enforces 60% LTV, blocks listing/double-pledge, and releases on repayment', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Trader Alice', 'ALICE');

  world.buyProperty(alice.profile.id, 'VN-DN-SCR-01');
  const eligibility = world.properties.getLoanEligibility(
    'VN-DN-SCR-01',
    alice.profile.id,
    world.economy.state,
    15,
  );
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.ltvLimitPct, 60);
  const maxCR = Math.floor(eligibility.maxLoanMinor / 100);

  // Exceeding 60% LTV must be rejected
  assert.throws(
    () => world.applyPropertyCollateralLoan(alice.profile.id, 'VN-DN-SCR-01', maxCR + 5_000, 15),
    (err: { code?: string }) => err.code === 'LOAN_LIMIT_EXCEEDED',
  );

  // Valid loan at 50% of max LTV succeeds and binds collateral
  const loanPrincipalCR = Math.floor(maxCR * 0.5);
  const { loan, property } = world.applyPropertyCollateralLoan(
    alice.profile.id,
    'VN-DN-SCR-01',
    loanPrincipalCR,
    15,
  );
  assert.equal(loan.collateralPropertyId, 'VN-DN-SCR-01');
  assert.equal(property.collateralLoanId, loan.id);

  // Mortgaged property cannot be listed for sale
  assert.throws(
    () => world.listProperty(alice.profile.id, 'VN-DN-SCR-01', 55_000),
    (err: { code?: string }) => err.code === 'PROPERTY_COLLATERAL_LOCKED',
  );

  // Mortgaged property cannot be pledged twice
  assert.throws(
    () => world.applyPropertyCollateralLoan(alice.profile.id, 'VN-DN-SCR-01', 2_000, 15),
    (err: { code?: string }) => err.code === 'PROPERTY_COLLATERAL_LOCKED',
  );

  // Full repayment releases collateral lock so owner can list again
  const totalOwedCR = Math.ceil(loan.outstandingMinor / 100);
  const repaidLoan = world.repayLoan(alice.profile.id, loan.id, totalOwedCR);
  assert.equal(repaidLoan.status, 'REPAID');
  assert.equal(world.properties.getProperty('VN-DN-SCR-01')?.collateralLoanId, null);

  const listed = world.listProperty(alice.profile.id, 'VN-DN-SCR-01', 55_000);
  assert.equal(listed.isListed, true);
});

test('TEST 31: Regional Vietnam real estate economy supports both upward and downward valuation movements with fictional events', () => {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  let sawNegativeEvent = false;
  let sawPositiveEvent = false;

  for (let i = 0; i < 8; i++) {
    const res = world.simulatePropertyEconomyCycle();
    assert.equal(res.event.isFictionalScenario, true);
    if (res.event.valueDeltaPct < 0) sawNegativeEvent = true;
    if (res.event.valueDeltaPct > 0) sawPositiveEvent = true;
  }

  assert.equal(sawNegativeEvent, true);
  assert.equal(sawPositiveEvent, true);
});

