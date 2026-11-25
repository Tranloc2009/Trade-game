import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_CATALOG } from '../../../server/engine/v4/V4Catalog';
import type { BusinessEntity } from '../../../shared/contracts/v4';
import {
  resolveBusinessVisualTier,
  resolveUpgradeProgressInfo,
} from '../business-visuals/buildingTiers';
import {
  BUSINESS_VISUAL_REGISTRY,
  getBusinessVisualEntry,
  getCatalogAssetAuditReport,
} from '../business-visuals/businessVisualRegistry';
import {
  allocateCityBuildings,
  getSaigonTileKind,
  GRAPHICS_QUALITY_PRESETS,
  gridToWorld,
  SAIGON_BUILDING_PLOTS,
  screenToWorld,
  STATIC_CITY_LANDMARKS,
  STATIC_CONTEXT_BUILDINGS,
  worldToGrid,
  worldToScreen,
} from './isoMath';

function makeMockBusiness(overrides: Partial<BusinessEntity>): BusinessEntity {
  const id = overrides.id ?? 'biz_01';
  const ownerId = overrides.ownerId ?? 'player_1';
  const ownerName = overrides.ownerName ?? 'Founder';
  return {
    id,
    companyId: overrides.companyId ?? `co_${id}`,
    worldId: overrides.worldId ?? 'WORLD-CAREER-1',
    founderId: overrides.founderId ?? ownerId,
    founderName: overrides.founderName ?? ownerName,
    ownerId,
    ownerName,
    ceoId: overrides.ceoId ?? ownerId,
    ceoName: overrides.ceoName ?? ownerName,
    boardMemberIds: overrides.boardMemberIds ?? [ownerId],
    holdingCompanyId: overrides.holdingCompanyId ?? null,
    businessName: overrides.businessName ?? 'Sài Gòn Roastery',
    ticker: overrides.ticker ?? 'SGR1',
    industry: overrides.industry ?? 'FNB',
    businessTypeId: overrides.businessTypeId ?? 'fnb_coffee_shop',
    businessTypeName: overrides.businessTypeName ?? 'Quán cà phê',
    businessModel: overrides.businessModel ?? 'MASS_MARKET',
    cityCode: overrides.cityCode ?? 'HCMC',
    cityName: overrides.cityName ?? 'TP. Hồ Chí Minh',
    locationLabel: overrides.locationLabel ?? 'Quận 1',
    linkedPropertyId: overrides.linkedPropertyId ?? null,
    level: overrides.level ?? 1,
    levelTitle: overrides.levelTitle ?? 'Khởi nghiệp',
    initialCapitalMinor: 40_000_00,
    companyCashMinor: 25_000_00,
    companyAssetsMinor: 45_000_00,
    companyLiabilitiesMinor: 0,
    equityMinor: 45_000_00,
    valuationMinor: 45_000_00,
    revenueLastCycleMinor: 4_000_00,
    operatingExpensesLastCycleMinor: 2_800_00,
    netProfitLastCycleMinor: 1_200_00,
    cumulativeProfitMinor: 3_000_00,
    employeeGroups: [],
    employeeCount: 3,
    productionCapacity: 120,
    inventoryUnits: 40,
    sellingPriceMinor: 4_50,
    qualityScore: 72,
    customerDemandUnits: 110,
    marketSharePct: 4.5,
    reputation: 64,
    customerSatisfaction: 76,
    status: overrides.status ?? 'ACTIVE',
    consecutiveLossCycles: 0,
    pendingUpgrade: overrides.pendingUpgrade ?? null,
    upgradeTree: {},
    branches: overrides.branches ?? [],
    franchiseEnabled: false,
    franchiseFeeMinor: 0,
    franchiseRoyaltyPct: 0,
    totalIssuedShares: 10_000,
    treasuryShares: 0,
    shareholders: overrides.shareholders ?? [
      {
        playerId: ownerId,
        playerName: ownerName,
        shares: 10_000,
        votingShares: 10_000,
        ownershipPct: 100,
      },
    ],
    isPublicIpo: false,
    ipoSymbol: null,
    ipoPriceMinor: null,
    financialHistory: [],
    proposals: [],
    auditLogs: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('All 43 real V4Catalog businessTypeIds are explicitly mapped in BUSINESS_VISUAL_REGISTRY', () => {
  assert.equal(BUSINESS_CATALOG.length, 43, 'Expected 43 catalog types in V4Catalog');
  for (const item of BUSINESS_CATALOG) {
    const entry = BUSINESS_VISUAL_REGISTRY[item.typeId];
    assert.ok(entry, `Missing visual registry entry for businessTypeId=${item.typeId}`);
    assert.equal(entry.businessTypeId, item.typeId);
    assert.ok(entry.catalogAssetKey.length > 0);
  }

  const audit = getCatalogAssetAuditReport();
  assert.equal(audit.totalCatalogTypes, 43);
  assert.equal(audit.bespokeGeneratedCount, 16);
  assert.ok(audit.distinctCatalogAssetsUsed >= 30, 'Expected at least 30 distinct catalog images');
});

test('All 6 F&B business types have completely distinct bespoke catalog artwork and distinct visuals', () => {
  const fnbIds = [
    'fnb_coffee_cart',
    'fnb_coffee_shop',
    'fnb_milk_tea',
    'fnb_vn_eatery',
    'fnb_restaurant',
    'fnb_fine_dining',
  ];
  const assetKeys = new Set<string>();
  const signatures = new Set<string>();

  for (const id of fnbIds) {
    const entry = getBusinessVisualEntry(id, 'FNB');
    assert.equal(entry.assetStatus, 'BESPOKE_GENERATED', `${id} must be BESPOKE_GENERATED`);
    assetKeys.add(entry.catalogAssetKey);
    signatures.add(`${entry.archetype}:${entry.spriteVariant}`);
  }

  assert.equal(assetKeys.size, 6, 'All 6 F&B types must have 6 distinct artwork files');
  assert.equal(signatures.size, 6, 'All 6 F&B types must have distinct isometric architecture or variant');
});

test('Isometric projection roundtrips cleanly (grid <-> world <-> screen)', () => {
  for (const [gx, gy] of [
    [0, 0],
    [7, 7],
    [13, 14],
    [25, 13],
  ]) {
    const w = gridToWorld(gx, gy);
    const back = worldToGrid(w.wx, w.wy);
    assert.ok(Math.abs(back.gx - gx) < 1e-6);
    assert.ok(Math.abs(back.gy - gy) < 1e-6);

    const cam = { centerX: 120, centerY: 480, zoom: 1.15 };
    const s = worldToScreen(w.wx, w.wy, cam, 1440, 900);
    const wBack = screenToWorld(s.sx, s.sy, cam, 1440, 900);
    assert.ok(Math.abs(wBack.wx - w.wx) < 1e-6);
    assert.ok(Math.abs(wBack.wy - w.wy) < 1e-6);
  }
});

test('All 36 Saigon building plots lie strictly on valid LAND/PLAZA tiles with zero overlap', () => {
  assert.equal(SAIGON_BUILDING_PLOTS.length, 36);
  const occupied = new Set<string>();

  for (const lm of STATIC_CITY_LANDMARKS) {
    const tile = getSaigonTileKind(lm.gx, lm.gy);
    assert.ok(tile === 'LAND' || tile === 'PLAZA', `Landmark ${lm.locationId} on invalid tile ${tile}`);
    occupied.add(`${lm.gx},${lm.gy}`);
  }

  for (const plot of SAIGON_BUILDING_PLOTS) {
    const key = `${plot.gx},${plot.gy}`;
    const tile = getSaigonTileKind(plot.gx, plot.gy);
    assert.ok(
      tile === 'LAND' || tile === 'PLAZA',
      `Plot ${plot.plotId} (${key}) placed on invalid tile ${tile}`,
    );
    assert.ok(!occupied.has(key), `Plot ${plot.plotId} (${key}) collides with another plot or landmark`);
    occupied.add(key);
  }

  for (const ctxB of STATIC_CONTEXT_BUILDINGS) {
    const key = `${ctxB.gx},${ctxB.gy}`;
    assert.ok(!occupied.has(key), `Context building ${ctxB.id} collides with plot/landmark at ${key}`);
  }
});

test('TEST 06 & 08: allocateCityBuildings is deterministic across reloads and never overlaps multiple companies', () => {
  const coffee = makeMockBusiness({
    id: 'biz_coffee_1',
    businessTypeId: 'fnb_coffee_shop',
    businessName: 'Saigon Brew',
    ticker: 'BREW',
  });
  const milkTea = makeMockBusiness({
    id: 'biz_milktea_2',
    businessTypeId: 'fnb_milk_tea',
    businessName: 'Tra Sua Q1',
    ticker: 'TSQ1',
  });

  const run1 = allocateCityBuildings({
    businesses: [coffee, milkTea],
    playerId: 'player_1',
    worldId: 'WORLD-CAREER-1',
    gameClock: null,
  });
  const run2 = allocateCityBuildings({
    businesses: [milkTea, coffee], // reversed order must still resolve deterministically!
    playerId: 'player_1',
    worldId: 'WORLD-CAREER-1',
    gameClock: null,
  });

  assert.equal(run1.saigonBuildings.length, 2);
  assert.notEqual(
    run1.saigonBuildings[0].plot.plotId,
    run1.saigonBuildings[1].plot.plotId,
    'Two companies must never share the same plot',
  );
  assert.notEqual(
    run1.saigonBuildings[0].archetype,
    run1.saigonBuildings[1].archetype,
    'Coffee Shop and Milk Tea Shop must use different building archetypes',
  );

  // Exact reload stability
  const byId1 = Object.fromEntries(run1.saigonBuildings.map((b) => [b.businessId, b.plot.plotId]));
  const byId2 = Object.fromEntries(run2.saigonBuildings.map((b) => [b.businessId, b.plot.plotId]));
  assert.deepEqual(byId1, byId2);
});

test('TEST 10, 12, 13, 16: Branches, World isolation, City isolation, and Ownership permissions', () => {
  const hcmcHqWithBranches = makeMockBusiness({
    id: 'biz_hq_hcmc',
    worldId: 'WORLD-CAREER-1',
    ownerId: 'player_1',
    cityCode: 'HCMC',
    branches: [
      {
        id: 'br_hcmc_1',
        businessId: 'biz_hq_hcmc',
        cityCode: 'HCMC',
        cityName: 'TP. Hồ Chí Minh',
        locationLabel: 'Quận 3',
        openedAt: '2026-01-02T00:00:00Z',
        status: 'ACTIVE',
        localDemandUnits: 80,
        localEmployees: 2,
        capacityUnits: 90,
        revenueLastCycleMinor: 100_00,
        expensesLastCycleMinor: 60_00,
        profitLastCycleMinor: 40_00,
        reputation: 68,
      },
      {
        id: 'br_hn_1',
        businessId: 'biz_hq_hcmc',
        cityCode: 'HANOI',
        cityName: 'Hà Nội',
        locationLabel: 'Hoàn Kiếm',
        openedAt: '2026-01-03T00:00:00Z',
        status: 'ACTIVE',
        localDemandUnits: 70,
        localEmployees: 2,
        capacityUnits: 80,
        revenueLastCycleMinor: 100_00,
        expensesLastCycleMinor: 60_00,
        profitLastCycleMinor: 40_00,
        reputation: 64,
      },
    ],
  });

  const hanoiBiz = makeMockBusiness({
    id: 'biz_hanoi',
    worldId: 'WORLD-CAREER-1',
    ownerId: 'player_1',
    cityCode: 'HANOI',
    cityName: 'Hà Nội',
  });

  const otherWorldBiz = makeMockBusiness({
    id: 'biz_other_world',
    worldId: 'WORLD-CAREER-OTHER',
    ownerId: 'player_1',
    cityCode: 'HCMC',
  });

  const npcBiz = makeMockBusiness({
    id: 'biz_npc',
    worldId: 'WORLD-CAREER-1',
    ownerId: 'npc_gia_han',
    ceoId: 'npc_gia_han',
    cityCode: 'HCMC',
    shareholders: [
      { playerId: 'npc_gia_han', playerName: 'Gia Han', shares: 10000, votingShares: 10000, ownershipPct: 100 },
    ],
  });

  const result = allocateCityBuildings({
    businesses: [hcmcHqWithBranches, hanoiBiz, otherWorldBiz, npcBiz],
    playerId: 'player_1',
    worldId: 'WORLD-CAREER-1',
    gameClock: null,
  });

  // Saigon should contain: HQ + HCMC branch + NPC HCMC biz = 3 buildings (never Hanoi, never otherWorld!)
  assert.equal(result.saigonBuildings.length, 3);
  assert.ok(!result.saigonBuildings.some((b) => b.businessId === 'biz_hanoi'));
  assert.ok(!result.saigonBuildings.some((b) => b.businessId === 'biz_other_world'));

  // Non-HCMC entities cleanly separated into multi-city panel lists
  assert.equal(result.otherCityBusinesses.length, 1);
  assert.equal(result.otherCityBusinesses[0].id, 'biz_hanoi');
  assert.equal(result.otherCityBranches.length, 1);
  assert.equal(result.otherCityBranches[0].branch.id, 'br_hn_1');

  // Branch occupies distinct plot from HQ
  const hq = result.saigonBuildings.find((b) => b.businessId === 'biz_hq_hcmc' && !b.isBranch)!;
  const br = result.saigonBuildings.find((b) => b.businessId === 'biz_hq_hcmc' && b.isBranch)!;
  assert.ok(hq && br);
  assert.notEqual(hq.plot.plotId, br.plot.plotId);
  assert.equal(br.branchId, 'br_hcmc_1');

  // Permission enforcement (TEST 16)
  const npc = result.saigonBuildings.find((b) => b.businessId === 'biz_npc')!;
  assert.equal(hq.canManage, true);
  assert.equal(npc.canManage, false);
  assert.equal(npc.ownership, 'NPC');
});

test('TEST 09: Visual tiers follow real business.level and pendingUpgrade preserves current tier with scaffolding', () => {
  assert.equal(resolveBusinessVisualTier(1), 1);
  assert.equal(resolveBusinessVisualTier(2), 1);
  assert.equal(resolveBusinessVisualTier(3), 2);
  assert.equal(resolveBusinessVisualTier(5), 2);
  assert.equal(resolveBusinessVisualTier(6), 3);
  assert.equal(resolveBusinessVisualTier(8), 3);
  assert.equal(resolveBusinessVisualTier(9), 4);
  assert.equal(resolveBusinessVisualTier(10), 4);

  const upgradingBiz = makeMockBusiness({
    level: 2,
    pendingUpgrade: {
      targetLevel: 3,
      startedAtGameHour: 10,
      completesAtGameHour: 22,
      costMinor: 25_000_00,
    },
  });
  const info = resolveUpgradeProgressInfo(upgradingBiz, {
    mode: 'ACCELERATED',
    gameDay: 1,
    gameHour: 14,
    gameMinute: 0,
    formattedGameTime: 'Day 1 · 14:00',
    realServerTime: '2026-01-01T14:00:00Z',
    stockMarketOpen: true,
    nextStockMarketChangeLabel: 'Closes in 2h',
    cryptoMarketOpen: true,
  });

  // Still Tier I until backend completes upgrade to Level 3!
  assert.equal(resolveBusinessVisualTier(upgradingBiz.level), 1);
  assert.equal(info.isUpgrading, true);
  assert.equal(info.targetLevel, 3);
  assert.equal(info.remainingGameHours, 8);
});

test('Graphics quality presets scale monotonically from LOW to ULTRA', () => {
  const { LOW, MEDIUM, HIGH, ULTRA } = GRAPHICS_QUALITY_PRESETS;
  assert.ok(LOW.maxDpr < MEDIUM.maxDpr && MEDIUM.maxDpr < HIGH.maxDpr && HIGH.maxDpr < ULTRA.maxDpr);
  assert.ok(LOW.maxFps <= MEDIUM.maxFps && MEDIUM.maxFps <= HIGH.maxFps && HIGH.maxFps <= ULTRA.maxFps);
  assert.equal(LOW.enableVehicles, false);
  assert.equal(LOW.enableWaterAnimation, false);
  assert.equal(HIGH.enableWaterAnimation, true);
  assert.equal(ULTRA.enableNightGlowPools, true);
});
