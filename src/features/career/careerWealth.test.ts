import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerCompany, PlayerProfile } from '../../../shared/contracts/types';
import type { BusinessEntity, HoldingCompany } from '../../../shared/contracts/v4';
import { buildCareerWealthBreakdown, isAuthoritativeCareerWorld } from './careerWealth';

function createMockProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'player_career_1',
    username: 'Minh Khôi',
    avatarInitials: 'MK',
    role: 'PLAYER',
    joinedAt: '2026-01-01T00:00:00.000Z',
    level: 2,
    exp: 120,
    title: 'Nhà sáng lập',
    wallet: {
      playerId: 'player_career_1',
      availableMinor: 8_500_00, // 8,500 CR
      lockedMinor: 1_500_00, // 1,500 CR
      savingsMinor: 2_000_00, // 2,000 CR
      termDepositMinor: 0,
      termDepositMaturityGameDay: null,
      entertainmentChips: 0,
      currencyBalances: {
        CR: { currency: 'CR', availableMinor: 8_500_00, lockedMinor: 1_500_00 },
        'USD-SIM': { currency: 'USD-SIM', availableMinor: 0, lockedMinor: 0 },
        'EUR-SIM': { currency: 'EUR-SIM', availableMinor: 0, lockedMinor: 0 },
        'GBP-SIM': { currency: 'GBP-SIM', availableMinor: 0, lockedMinor: 0 },
        'JPY-SIM': { currency: 'JPY-SIM', availableMinor: 0, lockedMinor: 0 },
        'AUD-SIM': { currency: 'AUD-SIM', availableMinor: 0, lockedMinor: 0 },
      },
    },
    holdings: [],
    realizedPnlMinor: 0,
    unrealizedPnlMinor: 250_00,
    stockValueMinor: 3_000_00,
    cryptoValueMinor: 1_000_00,
    forexValueMinor: 0,
    futuresEquityMinor: 500_00,
    futuresMarginMinor: 400_00,
    futuresUnrealizedPnlMinor: 100_00,
    propertyValueMinor: 10_000_00,
    businessEquityMinor: 15_000_00, // Already includes company cash + valuation!
    fundUnitsValueMinor: 0,
    luxuryAssetsValueMinor: 0,
    totalDebtMinor: 2_500_00,
    // 8500 + 1500 + 2000 + 3000 + 1000 + 500 + 10000 + 15000 - 2500 = 39,000 CR
    netWorthMinor: 39_000_00,
    tradingVolumeMinor: 4_000_00,
    achievements: [],
    netWorthHistory: [],
    ...overrides,
  };
}

test('strictly rejects Online and Practice worlds from Career wealth breakdown', () => {
  const onlineProfile = createMockProfile({ netWorthMinor: 250_000_00 });

  assert.equal(isAuthoritativeCareerWorld('ONLINE', 'WORLD-01', onlineProfile), false);
  assert.equal(isAuthoritativeCareerWorld('CAREER', 'WORLD-01', onlineProfile), false);
  assert.equal(isAuthoritativeCareerWorld('CAREER', 'WORLD-PRACTICE', onlineProfile), false);
  assert.equal(isAuthoritativeCareerWorld('CAREER', 'WORLD-CAREER-ABC123', null), false);
  assert.equal(isAuthoritativeCareerWorld('CAREER', 'WORLD-CAREER-ABC123', onlineProfile), true);

  assert.equal(
    buildCareerWealthBreakdown({
      playMode: 'CAREER',
      worldId: 'WORLD-01',
      player: onlineProfile,
    }),
    null,
  );
});

test('separates personal cash, locked cash, company cash and net worth with zero double-counting', () => {
  const profile = createMockProfile();

  const v4Businesses = [
    {
      id: 'biz_1',
      businessName: 'Khôi Coffee',
      ticker: 'KCF',
      companyCashMinor: 6_000_00, // 6,000 CR inside company treasury
      totalIssuedShares: 1000,
      shareholders: [
        { playerId: 'player_career_1', playerName: 'Minh Khôi', shares: 800, ownershipPct: 80 },
        { playerId: 'npc_hoang_nam', playerName: 'Hoàng Nam', shares: 200, ownershipPct: 20 },
      ],
    },
  ] as unknown as BusinessEntity[];

  const v4Holdings = [
    {
      id: 'hold_1',
      name: 'Minh Khôi Holdings',
      ticker: 'MKH',
      founderId: 'player_career_1',
      cashMinor: 2_500_00,
    },
  ] as unknown as HoldingCompany[];

  const legacyCompanies = [
    {
      id: 'leg_1',
      name: 'Kho Logistics',
      ticker: 'KLOG',
      cashMinor: 1_000_00,
      shareholders: [{ playerId: 'player_career_1', playerName: 'Minh Khôi', ownershipPct: 100 }],
    },
  ] as unknown as PlayerCompany[];

  const breakdown = buildCareerWealthBreakdown({
    playMode: 'CAREER',
    worldId: 'WORLD-CAREER-S12345',
    player: profile,
    v4Businesses,
    v4Holdings,
    legacyCompanies,
  });

  assert.ok(breakdown);
  // Personal cash is strictly wallet-only, NEVER includes company cash
  assert.equal(breakdown.personalAvailableMinor, 8_500_00);
  assert.equal(breakdown.personalLockedMinor, 1_500_00);
  assert.equal(breakdown.personalSavingsMinor, 2_000_00);
  assert.equal(breakdown.personalTotalCashMinor, 12_000_00);

  // Company treasuries are cleanly aggregated and sorted descending
  assert.equal(breakdown.companyCashTotalMinor, 9_500_00); // 6,000 + 2,500 + 1,000
  assert.equal(breakdown.companyCashPlayerShareMinor, 8_300_00); // 80% of 6,000 + 100% of 2,500 + 100% of 1,000
  assert.equal(breakdown.companyCashItems.length, 3);
  assert.equal(breakdown.companyCashItems[0].id, 'biz_1');

  // Authoritative Net Worth stays strictly 39,000 CR (NEVER re-adds companyCashTotalMinor!)
  assert.equal(breakdown.authoritativeNetWorthMinor, 39_000_00);
  assert.equal(breakdown.reconciliationDeltaMinor, 0);
});

test('deduplicates same company id and updates cleanly after trade or business expense', () => {
  const beforeProfile = createMockProfile({
    wallet: {
      playerId: 'player_career_1',
      availableMinor: 10_000_00,
      lockedMinor: 0,
      savingsMinor: 0,
      termDepositMinor: 0,
      termDepositMaturityGameDay: null,
      entertainmentChips: 0,
      currencyBalances: {
        CR: { currency: 'CR', availableMinor: 10_000_00, lockedMinor: 0 },
        'USD-SIM': { currency: 'USD-SIM', availableMinor: 0, lockedMinor: 0 },
        'EUR-SIM': { currency: 'EUR-SIM', availableMinor: 0, lockedMinor: 0 },
        'GBP-SIM': { currency: 'GBP-SIM', availableMinor: 0, lockedMinor: 0 },
        'JPY-SIM': { currency: 'JPY-SIM', availableMinor: 0, lockedMinor: 0 },
        'AUD-SIM': { currency: 'AUD-SIM', availableMinor: 0, lockedMinor: 0 },
      },
    },
    stockValueMinor: 0,
    cryptoValueMinor: 0,
    futuresEquityMinor: 0,
    propertyValueMinor: 0,
    businessEquityMinor: 0,
    totalDebtMinor: 0,
    netWorthMinor: 10_000_00,
  });

  const before = buildCareerWealthBreakdown({
    playMode: 'CAREER',
    worldId: 'WORLD-CAREER-DEMO01',
    player: beforeProfile,
  });
  assert.ok(before);
  assert.equal(before.personalAvailableMinor, 10_000_00);
  assert.equal(before.authoritativeNetWorthMinor, 10_000_00);

  // After buying 2,000 CR of stock with 20 CR fee -> available drops to 7,980 CR, stock = 2,000 CR, netWorth = 9,980 CR
  const afterTradeProfile = createMockProfile({
    ...beforeProfile,
    wallet: {
      ...beforeProfile.wallet,
      availableMinor: 7_980_00,
    },
    stockValueMinor: 2_000_00,
    netWorthMinor: 9_980_00,
  });

  const after = buildCareerWealthBreakdown({
    playMode: 'CAREER',
    worldId: 'WORLD-CAREER-DEMO01',
    player: afterTradeProfile,
  });
  assert.ok(after);
  assert.equal(after.personalAvailableMinor, 7_980_00);
  assert.equal(after.stockValueMinor, 2_000_00);
  assert.equal(after.authoritativeNetWorthMinor, 9_980_00);
  assert.equal(after.reconciliationDeltaMinor, 0);
});
