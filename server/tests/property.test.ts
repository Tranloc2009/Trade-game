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
