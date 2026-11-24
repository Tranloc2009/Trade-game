import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorldEngine } from '../engine/WorldEngine';
import { WorldMacroV4Engine } from '../engine/v4/WorldMacroV4Engine';
import {
  BUSINESS_CATALOG,
  CAREER_MISSIONS,
  CAREER_TITLES,
  LUXURY_CATALOG,
  SKILL_TREE_NODES,
  UPGRADE_TREE_NODES,
  WEALTH_RANKS,
  WORLD_EVENT_TEMPLATES_V4,
} from '../engine/v4/V4Catalog';
import { SYSTEM_ACCOUNTS } from '../engine/ledger/LedgerService';
import { DomainError } from '../domain/DomainError';

function createFreshWorld() {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Alice Billionaire', 'ALICE');
  const bob = world.loginGuest('Bob Tycoon', 'BOB');
  return { world, aliceId: alice.profile.id, bobId: bob.profile.id };
}

describe('Trading Empire V4 — Catalog & Authoritative Economy Invariants', () => {
  it('V4-01: Catalog completeness (>=38 businesses, 25 luxury items, 42 macro events, 12 ranks, 54 titles, 21 missions, 12 skills)', () => {
    assert.ok(BUSINESS_CATALOG.length >= 38);
    assert.equal(LUXURY_CATALOG.length, 25);
    assert.equal(WORLD_EVENT_TEMPLATES_V4.length, 42);
    assert.equal(WEALTH_RANKS.length, 12);
    assert.equal(CAREER_TITLES.length, 54);
    assert.equal(CAREER_MISSIONS.length, 21);
    assert.equal(SKILL_TREE_NODES.length, 12);
  });

  it('V4-02: Initial bootstrap seeds NPC businesses & public funds and preserves exact zero CR conservation discrepancy', () => {
    const { world } = createFreshWorld();
    const audit = world.ledger.auditCurrencyConservation('CR');
    assert.equal(audit.discrepancyMinor, 0);
    assert.ok(world.businessEmpire.listBusinesses().length >= 3);
    assert.ok(world.funds.listFunds().length >= 2);
  });
});

describe('Trading Empire V4 — Business & Multi-City Operations', () => {
  it('V4-03: Create business with isolated company account, reject insufficient funds', () => {
    const { world, aliceId } = createFreshWorld();
    const beforeWallet = world.ledger.wallets.getWallet(aliceId)!.availableMinor;

    const biz = world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Saigon Roastery Lab',
      ticker: 'SRLB',
      cityCode: 'HCMC',
      initialCapitalCR: 20_000,
    });

    assert.equal(biz.level, 1);
    assert.ok(biz.companyCashMinor > 0 && biz.companyCashMinor <= 20_000 * 100);
    assert.equal(biz.companyCashMinor + biz.companyAssetsMinor, 20_000 * 100);
    assert.equal(world.ledger.wallets.getWallet(aliceId)!.availableMinor, beforeWallet - 20_000 * 100);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);

    // Reject insufficient funds
    assert.throws(
      () =>
        world.createV4Business(aliceId, {
          businessTypeId: 'fin_conglomerate',
          businessName: 'Mega Unfunded Bank',
          ticker: 'MUBK',
          cityCode: 'HCMC',
          initialCapitalCR: 99_999_999,
        }),
      (err: unknown) => err instanceof DomainError,
    );
  });

  it('V4-04: Business level upgrade, concurrent upgrade lock, upgrade tree node, and employees', () => {
    const { world, aliceId } = createFreshWorld();
    const biz = world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Hanoi Brew Co',
      ticker: 'HBCX',
      cityCode: 'HANOI',
      initialCapitalCR: 80_000,
    });

    // Hire and train staff
    const hired = world.manageV4BusinessEmployees(aliceId, biz.id, {
      action: 'HIRE',
      role: 'SALES_STAFF',
      count: 2,
    });
    assert.ok(hired.employeeCount > biz.employeeCount);

    const trained = world.manageV4BusinessEmployees(aliceId, biz.id, {
      action: 'TRAIN',
      role: 'SALES_STAFF',
    });
    assert.ok(trained.employeeGroups.some((g) => g.role === 'SALES_STAFF' && g.skillLevel >= 2));

    // Purchase Upgrade Tree node
    const firstNodeId = UPGRADE_TREE_NODES[0].id;
    const upgradedNode = world.purchaseV4UpgradeNode(aliceId, biz.id, firstNodeId);
    assert.equal(upgradedNode.upgradeTree[firstNodeId], 1);

    // Start Level 1 -> Level 2 upgrade
    const upgrading = world.upgradeV4BusinessLevel(aliceId, biz.id);
    assert.ok(upgrading.pendingUpgrade !== null);
    assert.equal(upgrading.pendingUpgrade.targetLevel, 2);

    // Concurrent upgrade lock rejects duplicate upgrade
    assert.throws(
      () => world.upgradeV4BusinessLevel(aliceId, biz.id),
      (err: unknown) => err instanceof DomainError && err.code === 'UPGRADE_IN_PROGRESS',
    );

    // Advance cycles until upgrade completes
    world.runV4MacroAndOperatingCycle();
    world.runV4MacroAndOperatingCycle();
    world.runV4MacroAndOperatingCycle();
    const afterCycles = world.businessEmpire.getBusiness(biz.id)!;
    assert.equal(afterCycles.level, 2);
    assert.equal(afterCycles.pendingUpgrade, null);
    assert.ok(afterCycles.financialHistory.length >= 3);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });

  it('V4-05: Competition between 2 players in same city, multi-city branch opening, and franchise royalties', () => {
    const { world, aliceId, bobId } = createFreshWorld();

    const aliceBiz = world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Alice Coffee HCMC',
      ticker: 'ACFH',
      cityCode: 'HCMC',
      initialCapitalCR: 70_000,
    });
    const bobBiz = world.createV4Business(bobId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Bob Coffee HCMC',
      ticker: 'BCFH',
      cityCode: 'HCMC',
      initialCapitalCR: 70_000,
    });

    world.runV4MacroAndOperatingCycle();
    const aAfter = world.businessEmpire.getBusiness(aliceBiz.id)!;
    const bAfter = world.businessEmpire.getBusiness(bobBiz.id)!;
    assert.ok(aAfter.marketSharePct > 0 && aAfter.marketSharePct < 100);
    assert.ok(bAfter.marketSharePct > 0 && bAfter.marketSharePct < 100);

    // Open additional branch in Da Nang
    const branchRes = world.openV4BusinessBranch(aliceId, aliceBiz.id, 'DANANG', 'Bạch Đằng, Hải Châu');
    assert.ok(branchRes.business.branches.length >= 1);
    assert.equal(branchRes.branch.cityCode, 'DANANG');

    // Upgrade Alice's business organically through Level 2 & Level 3 to unlock franchise
    world.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: aliceId,
      amountMinor: 200_000 * 100,
      category: 'BANK_DEPOSIT',
      referenceId: 'test_franchise_cap',
      description: 'Test expansion capital',
    });
    world.injectV4BusinessCapital(aliceId, aliceBiz.id, 150_000);
    world.businessEmpire.upgradeBusinessLevel({
      businessId: aliceBiz.id,
      requesterId: aliceId,
      currentGameHourTotal: 100,
      completeImmediatelyForDev: true,
    });
    // Build reputation and cumulative profit via cycles & marketing upgrade
    world.purchaseV4UpgradeNode(aliceId, aliceBiz.id, 'mkt_brand');
    for (let i = 0; i < 4; i += 1) {
      world.runV4MacroAndOperatingCycle();
    }
    world.businessEmpire.upgradeBusinessLevel({
      businessId: aliceBiz.id,
      requesterId: aliceId,
      currentGameHourTotal: 200,
      completeImmediatelyForDev: true,
    });

    world.updateV4BusinessSettings(aliceId, aliceBiz.id, {
      franchiseEnabled: true,
      franchiseFeeCR: 8_000,
      franchiseRoyaltyPct: 6,
    });

    const agreement = world.signV4Franchise(bobId, aliceBiz.id, 'NHATRANG');
    assert.equal(agreement.status, 'ACTIVE');
    assert.equal(agreement.cityCode, 'NHATRANG');
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });

  it('V4-06: Recession & severe overpricing cause operating losses and distress/bankruptcy handling', () => {
    const { world, aliceId } = createFreshWorld();
    const biz = world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Fragile Cafe',
      ticker: 'FRGL',
      cityCode: 'CANTHO',
      initialCapitalCR: 20_000,
    });

    // Set maximum overpriced band (80 CR) + heavy payroll + trigger macro shock so losses accumulate
    world.updateV4BusinessSettings(aliceId, biz.id, { sellingPriceCR: 80 });
    world.manageV4BusinessEmployees(aliceId, biz.id, { action: 'HIRE', role: 'MANAGER', count: 3 });

    const recTemplate = WORLD_EVENT_TEMPLATES_V4.find((e) => e.category === 'GLOBAL_ECONOMY')?.templateId;
    for (let i = 0; i < 6; i += 1) {
      world.runV4MacroAndOperatingCycle({ forceEventTemplateId: recTemplate });
    }

    const updated = world.businessEmpire.getBusiness(biz.id)!;
    assert.ok(updated.netProfitLastCycleMinor <= 0 || updated.consecutiveLossCycles > 0);
    assert.ok(
      updated.status === 'DISTRESSED' || updated.status === 'BANKRUPT' || updated.consecutiveLossCycles >= 1,
    );
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });
});

describe('Trading Empire V4 — Corporate Ownership, M&A, Holding & IPO', () => {
  it('V4-07: Primary capital raise dilution, Secondary share sale, race protection, Governance voting & Dividends', () => {
    const { world, aliceId, bobId } = createFreshWorld();
    const biz = world.createV4Business(aliceId, {
      businessTypeId: 'tech_software_startup',
      businessName: 'Delta Tech Corp',
      ticker: 'DLTA',
      cityCode: 'HCMC',
      initialCapitalCR: 80_000,
    });

    // Primary capital raise from Bob
    const raiseRes = world.raiseV4Capital(aliceId, biz.id, bobId, 40_000);
    assert.ok(raiseRes.sharesIssued > 0);
    assert.ok(raiseRes.postMoneyValuationMinor > raiseRes.preMoneyValuationMinor);
    assert.equal(raiseRes.business.shareholders.length, 2);

    // Secondary share listing by Alice & full buy by Bob
    const listing = world.createV4PrivateListing(aliceId, {
      companyId: biz.id,
      offeringType: 'SECONDARY',
      shares: 1_000,
      pricePerShareCR: 12,
    });
    const buy1 = world.buyV4PrivateListing(bobId, listing.id, 1_000);
    assert.equal(buy1.listing.status, 'FILLED');

    // Concurrent / duplicate buy on filled listing rejected
    assert.throws(
      () => world.buyV4PrivateListing(bobId, listing.id, 100),
      (err: unknown) => err instanceof DomainError,
    );

    // Governance proposal by Bob (minority shareholder -> stays OPEN until majority Alice votes)
    const prop = world.createV4GovernanceProposal(bobId, biz.id, {
      type: 'PAY_DIVIDEND',
      title: 'Chi cổ tức quý 1',
      description: 'Phân phối 5.000 CR cho cổ đông hiện hữu.',
    });
    assert.equal(prop.status, 'OPEN');
    const votedProp = world.voteV4GovernanceProposal(aliceId, biz.id, prop.id, 'FOR');
    assert.ok(votedProp.votesFor > 0);
    assert.equal(votedProp.status, 'APPROVED');

    // Pay dividend proportional to Alice & Bob
    const aliceBefore = world.ledger.wallets.getWallet(aliceId)!.availableMinor;
    const bobBefore = world.ledger.wallets.getWallet(bobId)!.availableMinor;
    world.payV4Dividend(aliceId, biz.id, 5_000);
    assert.ok(world.ledger.wallets.getWallet(aliceId)!.availableMinor > aliceBefore);
    assert.ok(world.ledger.wallets.getWallet(bobId)!.availableMinor > bobBefore);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });

  it('V4-08: M&A Escrow lock, Reject refund, Accept settlement, Holding Company consolidation & Qualified IPO', () => {
    const { world, aliceId, bobId } = createFreshWorld();
    // Transfer test liquidity from BANK_RESERVE to Alice & Bob while preserving zero-sum CR conservation
    world.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: aliceId,
      amountMinor: 600_000 * 100,
      category: 'BANK_DEPOSIT',
      referenceId: 'test_seed_a',
      description: 'V4 test capital Alice',
    });
    world.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: bobId,
      amountMinor: 400_000 * 100,
      category: 'BANK_DEPOSIT',
      referenceId: 'test_seed_b',
      description: 'V4 test capital Bob',
    });

    const target = world.createV4Business(aliceId, {
      businessTypeId: 'tech_ecommerce',
      businessName: 'Saigon Mart Digital',
      ticker: 'SMDG',
      cityCode: 'HCMC',
      initialCapitalCR: 150_000,
    });

    // Bob submits M&A offer -> Escrow locks funds
    const bobCashBefore = world.ledger.wallets.getWallet(bobId)!.availableMinor;
    const offer1 = world.submitV4MaOffer(bobId, {
      targetCompanyId: target.id,
      targetPct: 25,
      offerPricePerShareCR: 15,
    });
    assert.equal(offer1.status, 'PENDING');
    assert.ok(world.ledger.wallets.getWallet(bobId)!.availableMinor < bobCashBefore);

    // Alice rejects -> Escrow fully refunded to Bob
    const rejected = world.respondV4MaOffer(aliceId, offer1.id, 'REJECT');
    assert.equal(rejected.offer.status, 'REJECTED');
    assert.equal(world.ledger.wallets.getWallet(bobId)!.availableMinor, bobCashBefore);

    // Bob submits 51% controlling M&A offer -> Alice accepts -> Ownership transfers
    const offer2 = world.submitV4MaOffer(bobId, {
      targetCompanyId: target.id,
      targetPct: 51,
      offerPricePerShareCR: 16,
    });
    const accepted = world.respondV4MaOffer(aliceId, offer2.id, 'ACCEPT');
    assert.equal(accepted.offer.status, 'SETTLED');
    assert.equal(accepted.business.ownerId, bobId);

    // Bob creates Holding Company and attaches subsidiary
    const holding = world.createV4Holding(bobId, 'Pacific Capital Holdings', 'PCHV', 20_000);
    const attached = world.attachV4Subsidiary(bobId, holding.id, target.id);
    assert.deepEqual(attached.subsidiaryIds, [target.id]);
    assert.ok(attached.consolidatedAssetsMinor > 0);

    // Non-owner Alice cannot attach subsidiaries to Bob's holding
    assert.throws(
      () => world.attachV4Subsidiary(aliceId, holding.id, target.id),
      (err: unknown) => err instanceof DomainError && err.code === 'NOT_COMPANY_OWNER',
    );

    // Prepare Bob's company for IPO (Level 4, 3 cycles history, equity >= 150,000 CR)
    world.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: bobId,
      amountMinor: 2_000_000 * 100,
      category: 'BANK_DEPOSIT',
      referenceId: 'test_ipo_cap',
      description: 'Test IPO scaling capital',
    });
    world.injectV4BusinessCapital(bobId, target.id, 1_600_000);
    world.purchaseV4UpgradeNode(bobId, target.id, 'mkt_brand');
    for (let i = 0; i < 5; i += 1) {
      world.runV4MacroAndOperatingCycle();
    }
    for (let lv = 2; lv <= 4; lv += 1) {
      world.businessEmpire.upgradeBusinessLevel({
        businessId: target.id,
        requesterId: bobId,
        currentGameHourTotal: lv * 100,
        completeImmediatelyForDev: true,
      });
      world.runV4MacroAndOperatingCycle();
    }

    const ipo = world.launchV4Ipo(bobId, target.id);
    assert.equal(ipo.business.isPublicIpo, true);
    assert.ok(world.matching.getAsset(ipo.listedAsset.symbol) !== undefined);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });
});

describe('Trading Empire V4 — Multiplayer Investment Funds', () => {
  it('V4-09: Fund creation (zero leverage), subscription NAV math, allocation trade, risk limit, unauthorized withdrawal block & FIFO liquidity redemption queue', () => {
    const { world, aliceId, bobId } = createFreshWorld();
    const fund = world.createV4Fund(aliceId, {
      name: 'Alpha Growth Equity',
      code: 'AGEF',
      fundType: 'STOCK_FUND',
      initialCapitalCR: 40_000,
      managementFeeAnnualPct: 1.5,
      maxSinglePositionPct: 40,
      minCashReservePct: 15,
    });

    assert.equal(fund.leverageAllowed, false);
    assert.equal(fund.navMinor, 40_000 * 100);

    // Manager unauthorized cash withdrawal MUST throw
    assert.throws(
      () => world.funds.attemptUnauthorizedManagerWithdrawal(fund.id, aliceId),
      (err: unknown) => err instanceof DomainError && err.code === 'FUND_UNAUTHORIZED_WITHDRAWAL',
    );

    // Bob subscribes 20,000 CR (Total NAV = 60,000 CR)
    const sub = world.subscribeV4Fund(bobId, fund.id, 20_000);
    assert.ok(sub.unitsIssued > 0);
    assert.equal(sub.fund.navMinor, 60_000 * 100);

    // Alice allocates within 40% single-position limit
    const traded = world.executeV4FundTrade(aliceId, fund.id, 'NOVA', 'BUY', 20_000);
    assert.equal(traded.holdings.length, 1);

    // Exceeding single-position risk limit rejected
    assert.throws(
      () => world.executeV4FundTrade(aliceId, fund.id, 'NOVA', 'BUY', 15_000),
      (err: unknown) => err instanceof DomainError,
    );

    // Allocate across 2 more stocks so remaining cash (~10k) is less than Bob's ~20k redemption -> FIFO QUEUED
    world.executeV4FundTrade(aliceId, fund.id, 'AERO', 'BUY', 18_000);
    world.executeV4FundTrade(aliceId, fund.id, 'TITAN', 'BUY', 12_000);
    const bobUnits = world.funds.getFund(fund.id)!.members.find((m) => m.playerId === bobId)!.units;
    const redeemRes = world.redeemV4Fund(bobId, fund.id, bobUnits);
    assert.equal(redeemRes.settledImmediately, false);
    assert.equal(redeemRes.request.status, 'QUEUED');

    // Governance proposal & voting
    const prop = world.createV4FundProposal(bobId, fund.id, {
      type: 'ADJUST_FEE',
      title: 'Giảm phí quản lý xuống 1%',
      description: 'Đề xuất tối ưu chi phí dài hạn.',
    });
    const voted = world.voteV4FundProposal(aliceId, fund.id, prop.id, 'FOR');
    assert.ok(voted.proposal.votesFor > 0);

    // CR conservation exact
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });
});

describe('Trading Empire V4 — Luxury Club, World Macro & Career Progression', () => {
  it('V4-10: Showroom buy, customize, resale lock, duplicate listing/buy block, maintenance & depreciation', () => {
    const { world, aliceId, bobId } = createFreshWorld();
    const cheapItem = LUXURY_CATALOG.reduce((a, b) => (a.purchasePriceCR < b.purchasePriceCR ? a : b));

    const asset = world.buyV4LuxuryFromShowroom(aliceId, cheapItem.catalogId, '#facc15', 'Solaris Yellow');
    assert.equal(asset.ownerId, aliceId);
    assert.ok((world.getPlayerProfile(aliceId)?.luxuryAssetsValueMinor ?? 0) > 0);

    const customized = world.customizeV4LuxuryAsset(aliceId, asset.id, {
      exteriorColorHex: '#ef4444',
      exteriorColorName: 'Rosso Corsa',
      exteriorTrim: 'CARBON_AERO',
    });
    assert.equal(customized.exteriorTrim, 'CARBON_AERO');

    // List for resale
    const listed = world.luxury.listForResale({
      assetId: asset.id,
      sellerId: aliceId,
      listingPriceCR: Math.round(cheapItem.purchasePriceCR * 0.9),
    });
    assert.equal(listed.asset.lockedForSale, true);

    // Duplicate listing blocked
    assert.throws(
      () =>
        world.luxury.listForResale({
          assetId: asset.id,
          sellerId: aliceId,
          listingPriceCR: Math.round(cheapItem.purchasePriceCR * 0.85),
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'LUXURY_ALREADY_LISTED',
    );

    // Bob buys resale listing
    const sale = world.buyV4LuxuryResale(bobId, listed.listing.listingId);
    assert.equal(sale.asset.ownerId, bobId);
    assert.equal(sale.asset.lockedForSale, false);

    // Double buy on sold listing blocked
    assert.throws(
      () => world.buyV4LuxuryResale(aliceId, listed.listing.listingId),
      (err: unknown) => err instanceof DomainError,
    );

    // Maintenance & depreciation cycle reduces resale value slightly & keeps CR conservation exact
    const valBefore = world.luxury.getAsset(asset.id)!.currentResaleValueMinor;
    world.runV4MacroAndOperatingCycle();
    const valAfter = world.luxury.getAsset(asset.id)!.currentResaleValueMinor;
    assert.ok(valAfter <= valBefore);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });

  it('V4-11: World Macro 30/90/365-day simulation stability & Career rank/missions/skills/titles idempotency', () => {
    const sim30 = WorldMacroV4Engine.runEconomyBalanceSimulation(30, 101);
    const sim90 = WorldMacroV4Engine.runEconomyBalanceSimulation(90, 202);
    const sim365 = WorldMacroV4Engine.runEconomyBalanceSimulation(365, 303);

    for (const report of [sim30, sim90, sim365]) {
      assert.ok(report.avgInflationPct > -5 && report.avgInflationPct < 20);
      assert.ok(report.businessFailureRatePct >= 0 && report.businessFailureRatePct <= 60);
      assert.ok(report.giniProxy > 0 && report.giniProxy < 1);
    }

    const { world, aliceId } = createFreshWorld();
    // Create a business to trigger Entrepreneur Mission 1 ("Khởi nghiệp đầu tiên")
    world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Career Starter Coffee',
      ticker: 'CSCF',
      cityCode: 'HCMC',
      initialCapitalCR: 20_000,
    });

    const career1 = world.syncPlayerCareerAndNotify(aliceId)!;
    const firstMission = career1.missions.find((m) => m.id === 'm_ent_1')!;
    assert.equal(firstMission.completed, true);
    assert.equal(firstMission.rewardClaimed, true);
    const spAfter1 = career1.skillPoints;
    assert.ok(spAfter1 >= firstMission.skillPointsReward);

    // Re-evaluating career must NOT double-grant skill points (idempotent one-time rewards)
    const career2 = world.syncPlayerCareerAndNotify(aliceId)!;
    assert.equal(career2.skillPoints, spAfter1);

    // Unlock a root skill node
    const skillRes = world.career.unlockSkillNode(aliceId, 'sk_biz_ops');
    assert.ok(skillRes.unlockedSkillIds.includes('sk_biz_ops'));

    // Equip an unlocked title
    const unlockedTitle = career2.unlockedTitleIds[0];
    world.career.equipTitle(aliceId, unlockedTitle);
    const afterEquip = world.syncPlayerCareerAndNotify(aliceId)!;
    assert.equal(afterEquip.equippedTitleId, unlockedTitle);
    assert.equal(world.ledger.auditCurrencyConservation('CR').discrepancyMinor, 0);
  });
});
