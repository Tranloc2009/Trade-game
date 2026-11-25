import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';
import { WorldEngine } from '../engine/WorldEngine';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';
import {
  NPC_DUC_HUY_WALLET_ID,
  NPC_GIA_HAN_WALLET_ID,
  NPC_HOANG_NAM_WALLET_ID,
} from '../engine/career/StoryDirector';
import { createCareerImmersionRouter } from '../api/careerRoutes';
import { createApiRouter } from '../api/routes';
import { STORY_SCENES } from '../../shared/contracts/careerCampaignData';
import { SYSTEM_ACCOUNTS } from '../engine/ledger/LedgerService';
import { resolveLegacyPageRedirect } from '../../src/store/useAppStore';

function createTestWorld() {
  return new WorldEngine({
    worldId: 'WORLD-01',
    worldName: 'WORLD-01: GLOBAL ECONOMY',
    calendarMode: 'ACCELERATED',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
}

function advanceSceneCompletely(
  director: ReturnType<CareerWorldManager['requireActiveSave']>['director'],
  preferredChoiceByNodeId: Record<string, string> = {},
) {
  let guard = 0;
  while (director.activeSceneId && guard < 40) {
    guard += 1;
    const snap = director.getSnapshot();
    const scene = STORY_SCENES[snap.activeSceneId!];
    assert.ok(scene, `Scene ${snap.activeSceneId} must exist`);
    const node = scene.nodes.find((n) => n.id === snap.activeNodeId) ?? scene.nodes[0];
    if (node.choices.length > 0) {
      const choiceId = preferredChoiceByNodeId[node.id] ?? node.choices[0].id;
      director.advanceDialogue(choiceId);
    } else {
      director.advanceDialogue();
    }
  }
  assert.ok(guard < 40, 'Scene progression must terminate deterministically');
}

function drainQueuedScenes(
  director: ReturnType<CareerWorldManager['requireActiveSave']>['director'],
  preferredChoiceByNodeId: Record<string, string> = {},
) {
  if (director.activeSceneId) {
    advanceSceneCompletely(director, preferredChoiceByNodeId);
  }
  while (director.sceneQueue.length > 0) {
    const next = director.sceneQueue.shift()!;
    if (!director.completedSceneIds.has(next)) {
      director.triggerScene(next, true);
      advanceSceneCompletely(director, preferredChoiceByNodeId);
    }
  }
}

function makeTempStoragePath(tag: string): string {
  return path.join(os.tmpdir(), `trading-empire-v61-${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function startHttpServer(onlineWorld: WorldEngine, manager: CareerWorldManager) {
  const app = express();
  app.use(express.json());
  app.use('/api', createCareerImmersionRouter(manager));
  app.use('/api', createApiRouter(onlineWorld));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      assert.ok(addr && typeof addr !== 'string');
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/**
 * Helper to legitimately progress a Career Save up to Chapter 3 M13 (Nam negotiation)
 * or Chapter 5 M22 (Huy alliance) or Chapter 6 M29/M30.
 */
function progressToChapter3M13(
  save: ReturnType<CareerWorldManager['requireActiveSave']>,
  options: { createBiz?: boolean; chooseGiaHanCoFounder?: boolean } = {},
) {
  const createBiz = options.createBiz ?? true;
  save.director.skipOpeningScene();
  save.director.triggerScene('scene_03_first_meeting', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_04_first_capital', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_05_gia_han_meeting', true);
  advanceSceneCompletely(save.director, {
    s05_n2: options.chooseGiaHanCoFounder ? 's05_c_cofounder' : 's05_c_advisor',
  });

  const biz = createBiz
    ? save.world.businessEmpire.createBusiness({
        founderId: save.playerId,
        founderName: save.director.characterName,
        founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
        businessTypeId: 'fnb_coffee_shop',
        businessName: 'Saigon Brew Labs',
        ticker: 'SBL',
        cityCode: 'HCMC',
        businessModel: 'FRANCHISE_CHAIN',
        initialCapitalCR: 25_000,
      })
    : null;

  if (biz) {
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch2_opening', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.manageEmployees({
      businessId: biz.id,
      requesterId: save.playerId,
      action: 'HIRE',
      role: 'OPERATOR',
      count: 1,
    });
    save.director.syncGameplayProgress();
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch2_duc_huy_rival', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.injectCapital(biz.id, save.playerId, save.director.characterName, 2_000);
    save.director.syncGameplayProgress();
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch3_nam_invite', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_ch3_valuation_review', true);
    advanceSceneCompletely(save.director);
  }
  return biz;
}

test('V6.1-01: Server restart restores Career accounts, wallets, holdings, businesses, dialogue, missions, and NPC trust/memories', () => {
  const storagePath = makeTempStoragePath('restart');
  try {
    // Boot #1
    const world1 = createTestWorld();
    const mgr1 = new CareerWorldManager(world1, { enableTimers: false, storagePath });
    const login1 = mgr1.loginOrRegisterAccount({
      username: 'PersistentCEO',
      password: 'strong-password-123',
      preset: 'CUSTOM',
      difficulty: 'EASY',
    });
    const accountKey = login1.account.preferences.accountKey;
    const save1 = mgr1.requireActiveSave(accountKey);

    // Advance story & record choices/memories
    advanceSceneCompletely(save1.director);
    save1.director.triggerScene('scene_03_first_meeting', true);
    advanceSceneCompletely(save1.director, { s03_n1: 's03_c_freedom' });
    save1.director.triggerScene('scene_04_first_capital', true);
    advanceSceneCompletely(save1.director);
    save1.director.triggerScene('scene_05_gia_han_meeting', true);
    advanceSceneCompletely(save1.director, { s05_n2: 's05_c_cofounder' });

    // Create real business (also settles Gia Hân Co-Founder equity!) + place real market buy order
    const biz = save1.world.businessEmpire.createBusiness({
      founderId: save1.playerId,
      founderName: 'PersistentCEO',
      founderNetWorthMinor: save1.world.getPlayerProfile(save1.playerId)!.netWorthMinor,
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Saigon Persistence Coffee',
      ticker: 'SPC',
      cityCode: 'HCMC',
      businessModel: 'FRANCHISE_CHAIN',
      initialCapitalCR: 25_000,
    });
    save1.world.placeOrder(save1.playerId, {
      symbol: 'NOVA',
      side: 'BUY',
      type: 'MARKET',
      quantity: 3,
      idempotencyKey: 'persist_buy_nova',
    });
    save1.director.syncGameplayProgress();
    drainQueuedScenes(save1.director);
    mgr1.setCareerClockSpeed(accountKey, '5x');
    mgr1.persistNow();

    const expectedCash = save1.world.getPlayerProfile(save1.playerId)!.wallet.availableMinor;
    const expectedHoldings = save1.world.getPlayerProfile(save1.playerId)!.holdings.find((h) => h.symbol === 'NOVA')?.availableQty ?? 0;
    const expectedBizCash = save1.world.businessEmpire.getBusiness(biz.id)!.companyCashMinor;
    const expectedShareholders = save1.world.businessEmpire.getBusiness(biz.id)!.shareholders.length;
    const expectedStory = save1.director.getSnapshot();

    assert.ok(expectedHoldings >= 3, 'Must hold purchased NOVA shares before restart');
    assert.ok(fs.existsSync(storagePath), 'Persistence JSON file must be written atomically to disk');

    // Simulate full server shutdown
    mgr1.dispose();

    // Boot #2 with brand-new WorldEngine & CareerWorldManager reading same persistence file
    const world2 = createTestWorld();
    const mgr2 = new CareerWorldManager(world2, { enableTimers: false, storagePath });

    // Login back with password -> must restore exact Career state without duplicating saves or money
    const login2 = mgr2.loginOrRegisterAccount({
      username: 'PersistentCEO',
      password: 'strong-password-123',
      preset: 'CUSTOM',
    });

    assert.equal(login2.isFirstLaunch, false);
    assert.equal(login2.resolvedMode, 'CAREER');
    assert.equal(login2.account.careerSaves.length, 1);
    assert.equal(login2.careerSaveId, save1.saveId);

    const restoredSave = mgr2.requireActiveSave(accountKey);
    const restoredProfile = restoredSave.world.getPlayerProfile(restoredSave.playerId)!;
    const restoredStory = restoredSave.director.getSnapshot();
    const restoredBiz = restoredSave.world.businessEmpire.getBusiness(biz.id)!;

    assert.equal(restoredProfile.wallet.availableMinor, expectedCash, 'Wallet cash must survive restart identically');
    assert.equal(
      restoredProfile.holdings.find((h) => h.symbol === 'NOVA')?.availableQty,
      expectedHoldings,
      'Holdings must survive restart identically',
    );
    assert.ok(restoredBiz, 'Career business must survive restart');
    assert.equal(restoredBiz.companyCashMinor, expectedBizCash, 'Company treasury cash must survive restart');
    assert.equal(restoredBiz.shareholders.length, expectedShareholders, 'Company cap table must survive restart');
    assert.equal(restoredStory.currentChapter, expectedStory.currentChapter);
    assert.equal(restoredStory.activeMissionId, expectedStory.activeMissionId);
    assert.equal(restoredStory.storyFlags.motivation, 'FREEDOM');
    assert.equal(restoredStory.storyFlags.giaHanCoFounderSettled, true);
    assert.equal(restoredStory.relationships.minh_quan.trust, expectedStory.relationships.minh_quan.trust);
    assert.deepEqual(restoredStory.completedMissionIds, expectedStory.completedMissionIds);
    assert.equal(restoredStory.clockSpeed, '5x');

    mgr2.dispose();
  } finally {
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
  }
});

test('V6.1-02: Account ownership protection rejects missing/short password on register and wrong/missing password on login', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    // Missing password on new custom account -> 400
    const noPass = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', preset: 'CUSTOM' }),
    });
    assert.equal(noPass.status, 400, 'Registering custom account without password must fail with 400');

    // Too-short password -> 400
    const shortPass = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', password: '12', preset: 'CUSTOM' }),
    });
    assert.equal(shortPass.status, 400);

    // Valid registration -> 201 Created
    const reg = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', password: 'secret-owner-pw', preset: 'CUSTOM' }),
    });
    assert.equal(reg.status, 201);

    // Attacker trying username alone without password -> 401
    const hijackNoPw = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', preset: 'CUSTOM' }),
    });
    assert.equal(hijackNoPw.status, 401, 'Username-only login on existing account must be rejected (401)');

    // Attacker trying wrong password -> 401
    const hijackWrongPw = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', password: 'wrong-password', preset: 'CUSTOM' }),
    });
    assert.equal(hijackWrongPw.status, 401, 'Wrong password must be rejected (401)');

    // Owner with correct password -> 201
    const ownerRelogin = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SecureFounder', password: 'secret-owner-pw', preset: 'CUSTOM' }),
    });
    assert.equal(ownerRelogin.status, 201);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-03: StoryDirector.triggerScene rejects future chapters and unreached scenes (403 FORBIDDEN)', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    const login = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SceneGuardTester', password: 'scene-password', preset: 'CUSTOM' }),
    }).then((r) => r.json());
    assert.equal(login.ok, true);

    for (const forbiddenScene of [
      'scene_ch3_negotiation',
      'scene_ch4_black_monday',
      'scene_ch5_huy_alliance',
      'scene_ch6_legacy_finale',
    ]) {
      const res = await fetch(`${baseUrl}/api/career/story/trigger-scene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${login.data.activeToken}`,
        },
        body: JSON.stringify({ sceneId: forbiddenScene }),
      });
      assert.equal(
        res.status,
        403,
        `Future scene ${forbiddenScene} must return 403 FORBIDDEN while player is in Chapter 1`,
      );
    }

    // Unlocked Chapter 1 scene (scene_03_first_meeting via initial appointment) IS allowed
    const allowedRes = await fetch(`${baseUrl}/api/career/story/trigger-scene`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.activeToken}`,
      },
      body: JSON.stringify({ sceneId: 'scene_03_first_meeting' }),
    });
    assert.equal(allowedRes.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-04: StoryDirector.confirmEnding blocks Free Play before campaign finale AND rejects ineligible endings', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    const login = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'EndingGateTester',
        password: 'ending-password',
        preset: 'CUSTOM',
        difficulty: 'EASY',
      }),
    }).then((r) => r.json());
    const token = login.data.activeToken;

    // Attempting to confirm ending in Chapter 1 -> 403 FORBIDDEN
    const earlyRes = await fetch(`${baseUrl}/api/career/ending/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endingId: 'THE_LEGEND' }),
    });
    assert.equal(earlyRes.status, 403, 'Cannot unlock Free Play in Chapter 1');

    // Progress save to Chapter 6 finale with 0 upgrades (so THE_INNOVATOR is ineligible, while THE_TYCOON is eligible)
    const save = manager.requireActiveSave(login.data.account.preferences.accountKey);
    const biz = progressToChapter3M13(save, { createBiz: true })!;
    // Ch. 3 M13..M15 using second business instead of upgrade so totalUpgrades stays 0!
    save.director.triggerScene('scene_ch3_negotiation', true);
    advanceSceneCompletely(save.director, { ch3_neg_1: 'ch3_neg_reject' });
    save.director.triggerScene('scene_ch3_conflict', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.createBusiness({
      founderId: save.playerId,
      founderName: 'EndingGateTester',
      founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Second Store',
      ticker: 'SST',
      cityCode: 'HANOI',
      businessModel: 'FRANCHISE_CHAIN',
      initialCapitalCR: 20_000,
    });
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    // Ch. 4
    save.director.triggerScene('scene_ch4_black_monday', true);
    advanceSceneCompletely(save.director);
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    save.director.triggerScene('scene_ch4_secret', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.updateBusinessSettings({
      businessId: biz.id,
      requesterId: save.playerId,
      statusAction: 'RESTRUCTURE',
    });
    save.director.syncGameplayProgress();
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    // Ch. 5
    save.director.triggerScene('scene_ch5_awakening', true);
    advanceSceneCompletely(save.director);
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    save.director.triggerScene('scene_ch5_huy_alliance', true);
    advanceSceneCompletely(save.director, { ch5_huy_1: 'ch5_huy_indep' });
    save.director.triggerScene('scene_ch5_nam_reunion', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.createBusiness({
      founderId: save.playerId,
      founderName: 'EndingGateTester',
      founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Third Store',
      ticker: 'TST',
      cityCode: 'DANANG',
      businessModel: 'FRANCHISE_CHAIN',
      initialCapitalCR: 20_000,
    });
    save.director.syncGameplayProgress();
    save.world.businessEmpire.injectCapital(biz.id, save.playerId, 'EndingGateTester', 2_000);
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    // Ch. 6 M26..M28 (still before M29 completed!)
    save.director.triggerScene('scene_ch6_return_cafe', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_ch6_reflection', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_ch6_vision', true);
    advanceSceneCompletely(save.director);

    // Still on M29 -> confirmEnding MUST still return 403!
    const preM29Res = await fetch(`${baseUrl}/api/career/ending/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endingId: 'THE_TYCOON' }),
    });
    assert.equal(preM29Res.status, 403, 'Cannot unlock Free Play before M29 is completed');

    // Complete M29 via real business level upgrade (still 0 upgradeTree nodes -> THE_INNOVATOR ineligible!)
    save.world.businessEmpire.upgradeBusinessLevel({
      businessId: biz.id,
      requesterId: save.playerId,
      currentGameHourTotal: 100,
      completeImmediatelyForDev: true,
    });
    save.director.syncGameplayProgress();
    assert.ok(save.director.completedMissionIds.has('M29'));
    save.director.triggerScene('scene_ch6_legacy_finale', true);
    advanceSceneCompletely(save.director);
    assert.equal(save.director.freePlayUnlocked, false, 'Free Play must stay locked until eligible ending is confirmed');

    // Try ineligible ending THE_INNOVATOR (0 upgrades) -> 400 VALIDATION_ERROR!
    const ineligibleRes = await fetch(`${baseUrl}/api/career/ending/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endingId: 'THE_INNOVATOR' }),
    });
    assert.equal(ineligibleRes.status, 400, 'Ineligible ending must be rejected with 400');
    assert.equal(save.director.freePlayUnlocked, false);

    // Confirm eligible ending THE_TYCOON -> 200 & unlocks Free Play!
    const eligibleRes = await fetch(`${baseUrl}/api/career/ending/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endingId: 'THE_TYCOON' }),
    }).then((r) => r.json());
    assert.equal(eligibleRes.ok, true);
    assert.equal(eligibleRes.data.careerStory.freePlayUnlocked, true);
    assert.equal(eligibleRes.data.careerStory.selectedEndingId, 'THE_TYCOON');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-05: Failed Nam investment deal does NOT set namDealSettled, NPC role, or complete M13', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const login = manager.loginOrRegisterAccount({
    username: 'NamDealFailTester',
    password: 'nam-fail-password',
    preset: 'CUSTOM',
    difficulty: 'EASY',
  });
  const save = manager.requireActiveSave(login.account.preferences.accountKey);
  const biz = progressToChapter3M13(save, { createBiz: true })!;

  // Case A: Drain Nam's finite wallet so raiseCapital cannot settle -> must throw & leave M13 uncompleted
  const namWallet = save.world.ledger.wallets.getWallet(NPC_HOANG_NAM_WALLET_ID)!;
  save.world.ledger.transferAvailable({
    fromAccount: NPC_HOANG_NAM_WALLET_ID,
    toAccount: SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
    amountMinor: namWallet.availableMinor,
    category: 'SYSTEM_ISSUANCE',
    referenceId: 'TEST-DRAIN-NAM',
    description: 'Simulate depleted investor fund liquidity',
  });

  save.director.triggerScene('scene_ch3_negotiation', true);
  // Advance to choice node ch3_neg_1
  let guard = 0;
  while (save.director.activeNodeId !== 'ch3_neg_1' && guard < 10) {
    guard += 1;
    save.director.advanceDialogue();
  }
  assert.equal(save.director.activeNodeId, 'ch3_neg_1');

  assert.throws(
    () => save.director.advanceDialogue('ch3_neg_accept'),
    /không đủ thanh khoản|INSUFFICIENT/i,
    'Depleted Nam wallet must fail deal atomically',
  );

  const afterFail = save.director.getSnapshot();
  assert.notEqual(afterFail.storyFlags.namDealSettled, true, 'namDealSettled must NEVER become true when deal fails');
  assert.equal(afterFail.relationships.hoang_nam.companyMember, false, 'Nam must NOT become company member on failure');
  assert.equal(afterFail.completedMissionIds.includes('M13'), false, 'M13 must NOT complete when deal fails');
  assert.equal(
    save.world.businessEmpire.getBusiness(biz.id)!.shareholders.some((s) => s.playerId === NPC_HOANG_NAM_WALLET_ID),
    false,
    'Cap table must stay clean when deal fails',
  );

  // Case B: Restore Nam funds, pause business via real engine call (no ACTIVE business) -> still fails cleanly!
  save.world.ledger.issueFunds(
    NPC_HOANG_NAM_WALLET_ID,
    500_000_00,
    'SYSTEM_ISSUANCE',
    'TEST-REFILL-NAM',
    'Refill Nam fund',
  );
  save.world.businessEmpire.updateBusinessSettings({
    businessId: biz.id,
    requesterId: save.playerId,
    statusAction: 'PAUSE',
  });
  assert.throws(
    () => save.director.advanceDialogue('ch3_neg_accept'),
    /ACTIVE/i,
    'Missing ACTIVE business must reject Nam deal',
  );
  assert.notEqual(save.director.storyFlags.namDealSettled, true);
  assert.equal(save.director.completedMissionIds.has('M13'), false);

  manager.dispose();
});

test('V6.1-06: Gia Hân Co-Founder and Phạm Đức Huy Alliance settle real business equity on company cap table', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const login = manager.loginOrRegisterAccount({
    username: 'EquityPartnerCEO',
    password: 'partner-password',
    preset: 'CUSTOM',
    difficulty: 'EASY',
  });
  const save = manager.requireActiveSave(login.account.preferences.accountKey);

  // Choose Gia Hân Co-Founder in Scene 05 BEFORE business exists -> marked pending, companyMember = false
  save.director.skipOpeningScene();
  save.director.triggerScene('scene_03_first_meeting', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_04_first_capital', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_05_gia_han_meeting', true);
  advanceSceneCompletely(save.director, { s05_n2: 's05_c_cofounder' });

  assert.equal(save.director.storyFlags.giaHanRole, 'COFOUNDER');
  assert.equal(save.director.storyFlags.giaHanCoFounderPending, true);
  assert.equal(save.director.relationships.gia_han.companyMember, false, 'Gia Hân is pending until real company exists');

  const giaHanWalletBefore = save.world.ledger.wallets.getWallet(NPC_GIA_HAN_WALLET_ID)!.availableMinor;

  // Create first real business & sync -> settles Gia Hân's real 10,000 CR primary equity contribution!
  const biz = save.world.businessEmpire.createBusiness({
    founderId: save.playerId,
    founderName: 'EquityPartnerCEO',
    founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
    businessTypeId: 'fnb_coffee_shop',
    businessName: 'CoFounder Brew',
    ticker: 'CFB',
    cityCode: 'HCMC',
    businessModel: 'FRANCHISE_CHAIN',
    initialCapitalCR: 25_000,
  });
  const bizCashBeforeGiaHan = save.world.businessEmpire.getBusiness(biz.id)!.companyCashMinor;
  save.director.syncGameplayProgress();
  drainQueuedScenes(save.director);

  const giaHanWalletAfter = save.world.ledger.wallets.getWallet(NPC_GIA_HAN_WALLET_ID)!.availableMinor;
  const bizAfterGiaHan = save.world.businessEmpire.getBusiness(biz.id)!;
  assert.equal(save.director.storyFlags.giaHanCoFounderSettled, true);
  assert.equal(save.director.relationships.gia_han.companyMember, true);
  assert.ok(giaHanWalletAfter < giaHanWalletBefore, 'Gia Hân finite wallet must be debited by real capital raise');
  assert.ok(bizAfterGiaHan.companyCashMinor > bizCashBeforeGiaHan, 'Company cash must increase from Gia Hân equity');
  assert.ok(
    bizAfterGiaHan.shareholders.some((s) => s.playerId === NPC_GIA_HAN_WALLET_ID),
    'Gia Hân must be registered as real shareholder in BusinessEmpireEngine',
  );

  // Progress to Chapter 5 M22 to verify Phạm Đức Huy Alliance real equity settlement
  save.director.triggerScene('scene_ch2_opening', true);
  advanceSceneCompletely(save.director);
  save.world.businessEmpire.manageEmployees({
    businessId: biz.id,
    requesterId: save.playerId,
    action: 'HIRE',
    role: 'OPERATOR',
    count: 1,
  });
  save.director.syncGameplayProgress();
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  drainQueuedScenes(save.director);
  save.director.triggerScene('scene_ch2_duc_huy_rival', true);
  advanceSceneCompletely(save.director);
  save.world.businessEmpire.injectCapital(biz.id, save.playerId, 'EquityPartnerCEO', 2_000);
  save.director.syncGameplayProgress();
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  drainQueuedScenes(save.director);
  save.director.triggerScene('scene_ch3_nam_invite', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_ch3_valuation_review', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_ch3_negotiation', true);
  advanceSceneCompletely(save.director, { ch3_neg_1: 'ch3_neg_reject' });
  save.director.triggerScene('scene_ch3_conflict', true);
  advanceSceneCompletely(save.director);
  save.world.businessEmpire.purchaseUpgradeNode({
    businessId: biz.id,
    requesterId: save.playerId,
    nodeId: 'mkt_ads',
  });
  save.director.syncGameplayProgress();
  drainQueuedScenes(save.director);
  save.director.triggerScene('scene_ch4_black_monday', true);
  advanceSceneCompletely(save.director);
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  save.director.triggerScene('scene_ch4_secret', true);
  advanceSceneCompletely(save.director);
  save.world.businessEmpire.updateBusinessSettings({
    businessId: biz.id,
    requesterId: save.playerId,
    statusAction: 'RESTRUCTURE',
  });
  save.director.syncGameplayProgress();
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  drainQueuedScenes(save.director);
  save.director.triggerScene('scene_ch5_awakening', true);
  advanceSceneCompletely(save.director);
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  assert.equal(save.director.activeMissionId, 'M22');

  const huyWalletBefore = save.world.ledger.wallets.getWallet(NPC_DUC_HUY_WALLET_ID)!.availableMinor;
  const bizCashBeforeHuy = save.world.businessEmpire.getBusiness(biz.id)!.companyCashMinor;

  save.director.triggerScene('scene_ch5_huy_alliance', true);
  advanceSceneCompletely(save.director, { ch5_huy_1: 'ch5_huy_ally' });

  const huyWalletAfter = save.world.ledger.wallets.getWallet(NPC_DUC_HUY_WALLET_ID)!.availableMinor;
  const bizAfterHuy = save.world.businessEmpire.getBusiness(biz.id)!;
  assert.equal(save.director.storyFlags.huyAlliance, 'ALLIED');
  assert.equal(save.director.storyFlags.huyAllianceDealSettled, true);
  assert.equal(save.director.relationships.duc_huy.companyMember, true);
  assert.ok(huyWalletAfter < huyWalletBefore, 'Đức Huy finite wallet must be debited on alliance deal');
  assert.ok(bizAfterHuy.companyCashMinor > bizCashBeforeHuy, 'Company cash must rise on alliance deal');
  assert.ok(
    bizAfterHuy.shareholders.some((s) => s.playerId === NPC_DUC_HUY_WALLET_ID),
    'Đức Huy must appear on company cap table after alliance deal',
  );

  manager.dispose();
});

test('V6.1-07 & V6.1-08: Forged actionFlag cannot complete M19/M29 AND mission baseline prevents pre-unlock auto-cascading', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false, storagePath: null });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    const login = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'BaselineTester', password: 'baseline-password', preset: 'CUSTOM', difficulty: 'EASY' }),
    }).then((r) => r.json());
    const token = login.data.activeToken;
    const save = manager.requireActiveSave(login.data.account.preferences.accountKey);

    // Perform actions BEFORE M05/M07/M08 unlock (buy stock, create business, hire 2 staff, run 2 cycles in Ch. 1!)
    save.director.skipOpeningScene();
    save.director.triggerScene('scene_03_first_meeting', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_04_first_capital', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_05_gia_han_meeting', true);
    advanceSceneCompletely(save.director);

    const biz = save.world.businessEmpire.createBusiness({
      founderId: save.playerId,
      founderName: 'BaselineTester',
      founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Early Action Cafe',
      ticker: 'EAC',
      cityCode: 'HCMC',
      businessModel: 'FRANCHISE_CHAIN',
      initialCapitalCR: 25_000,
    });
    // Hire staff AND run cycles BEFORE M06/M07/M08 are unlocked!
    save.world.businessEmpire.manageEmployees({
      businessId: biz.id,
      requesterId: save.playerId,
      action: 'HIRE',
      role: 'OPERATOR',
      count: 2,
    });
    save.world.runV4MacroAndOperatingCycle();
    save.world.runV4MacroAndOperatingCycle();

    // Sync: M05 completes, stops at M06 (must NOT cascade through M06/M07/M08!)
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    assert.equal(save.director.activeMissionId, 'M06', 'Must stop at M06 without cascading past intro scene');

    // View M06 opening scene -> completes M06 -> unlocks M07, must NOT auto-complete M07 from pre-unlock hires!
    save.director.triggerScene('scene_ch2_opening', true);
    advanceSceneCompletely(save.director);
    assert.equal(
      save.director.activeMissionId,
      'M07',
      'Pre-unlock employees/cycles must NOT auto-complete M07/M08 thanks to missionBaseline',
    );
    assert.equal(save.director.completedMissionIds.has('M07'), false);
    assert.equal(save.director.completedMissionIds.has('M08'), false);

    // Now test forged actionFlag on M19: reach M19 legally first
    save.world.businessEmpire.manageEmployees({
      businessId: biz.id,
      requesterId: save.playerId,
      action: 'HIRE',
      role: 'OPERATOR',
      count: 1,
    });
    save.director.syncGameplayProgress();
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch2_duc_huy_rival', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.injectCapital(biz.id, save.playerId, 'BaselineTester', 2_000);
    save.director.syncGameplayProgress();
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch3_nam_invite', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_ch3_valuation_review', true);
    advanceSceneCompletely(save.director);
    save.director.triggerScene('scene_ch3_negotiation', true);
    advanceSceneCompletely(save.director, { ch3_neg_1: 'ch3_neg_reject' });
    save.director.triggerScene('scene_ch3_conflict', true);
    advanceSceneCompletely(save.director);
    save.world.businessEmpire.purchaseUpgradeNode({
      businessId: biz.id,
      requesterId: save.playerId,
      nodeId: 'mkt_ads',
    });
    save.director.syncGameplayProgress();
    drainQueuedScenes(save.director);
    save.director.triggerScene('scene_ch4_black_monday', true);
    advanceSceneCompletely(save.director);
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    save.director.triggerScene('scene_ch4_secret', true);
    advanceSceneCompletely(save.director);
    assert.equal(save.director.activeMissionId, 'M19');

    // Attempt to forge RESTRUCTURE via POST /api/career/mission/sync -> MUST NOT complete M19!
    const forgedRes = await fetch(`${baseUrl}/api/career/mission/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actionFlag: 'RESTRUCTURE' }),
    }).then((r) => r.json());
    assert.equal(forgedRes.ok, true);
    assert.equal(
      forgedRes.data.careerStory.completedMissionIds.includes('M19'),
      false,
      'Client-forged actionFlag=RESTRUCTURE must NEVER complete M19 without real server event',
    );
    assert.equal(forgedRes.data.careerStory.activeMissionId, 'M19');

    // Performing a real server-side restructuring action DOES complete M19!
    save.world.businessEmpire.updateBusinessSettings({
      businessId: biz.id,
      requesterId: save.playerId,
      statusAction: 'RESTRUCTURE',
    });
    const legitRes = await fetch(`${baseUrl}/api/career/mission/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    assert.equal(legitRes.ok, true);
    assert.equal(legitRes.data.careerStory.completedMissionIds.includes('M19'), true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-09 & V6.1-10: Lifecycle — Logout revokes session & pauses Career timer without touching Online; pause & idle watchdog stop timers', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, {
    enableTimers: true,
    storagePath: null,
    maxIdlePauseMs: 80, // Short idle threshold for deterministic test
  });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    // Login User A into Career Mode
    const login = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'LifecycleCEO', password: 'life-password', preset: 'CUSTOM' }),
    }).then((r) => r.json());
    assert.equal(login.ok, true);
    const token = login.data.activeToken as string;
    const saveId = login.data.careerSaveId as string;

    // Timer must be running at 1x
    assert.equal(manager.hasActiveTimer(saveId), true, 'Active Career save at 1x should have running timer');

    // Explicit pause endpoint (e.g. tab close / pagehide) stops timer cleanly
    const pauseRes = await fetch(`${baseUrl}/api/career/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(pauseRes.status, 200);
    assert.equal(manager.hasActiveTimer(saveId), false, 'POST /api/career/pause must stop Career timer');

    // Resume at 10x -> timer starts, then wait past maxIdlePauseMs -> idle watchdog auto-pauses!
    const speedRes = await fetch(`${baseUrl}/api/career/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ speed: '10x' }),
    });
    assert.equal(speedRes.status, 200);
    assert.equal(manager.hasActiveTimer(saveId), true);

    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      manager.hasActiveTimer(saveId),
      false,
      'Idle watchdog must automatically pause unattended Career scheduler',
    );

    // Resume again, place an Online order for another Online player so we prove logout does NOT affect Online World
    const onlineSnapshotBefore = onlineWorld.getWorldSnapshot(null);
    await fetch(`${baseUrl}/api/career/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ speed: '2x' }),
    });
    assert.equal(manager.hasActiveTimer(saveId), true);

    // Logout -> must revoke token AND pause/clear Career timer without touching Online World
    const logoutRes = await fetch(`${baseUrl}/api/account/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    assert.equal(logoutRes.ok, true);
    assert.equal(manager.hasActiveTimer(saveId), false, 'Logout MUST stop Career timer immediately');

    // Revoked token MUST return 401 on subsequent API calls
    const afterLogoutState = await fetch(`${baseUrl}/api/career/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(afterLogoutState.status, 401, 'Revoked token after logout must return 401');

    // Online World stays healthy and untouched
    const onlineSnapshotAfter = onlineWorld.getWorldSnapshot(null);
    assert.equal(onlineSnapshotAfter.worldId, onlineSnapshotBefore.worldId);
    assert.equal(onlineSnapshotAfter.assets.length, onlineSnapshotBefore.assets.length);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-11: Expired session tokens return 401 and cross-account save access returns 403 while owner access returns 200', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, {
    enableTimers: false,
    storagePath: null,
    sessionTtlMs: 500, // 500ms TTL: long enough for initial setup, short enough to test expiration cleanly
  });
  const { server, baseUrl } = await startHttpServer(onlineWorld, manager);

  try {
    const resA = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'TokenOwnerA', password: 'pw-owner-a', preset: 'CUSTOM' }),
    }).then((r) => r.json());
    const resB = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'TokenOtherB', password: 'pw-other-b', preset: 'CUSTOM' }),
    }).then((r) => r.json());

    // Owner A accessing own Career World proxy -> 200
    const ownOk = await fetch(`${baseUrl}/api/career-world/${resA.data.careerSaveId}/world/snapshot`, {
      headers: { Authorization: `Bearer ${resA.data.activeToken}` },
    });
    assert.equal(ownOk.status, 200);

    // User B accessing Owner A's Career World proxy -> 403
    const crossForbidden = await fetch(`${baseUrl}/api/career-world/${resA.data.careerSaveId}/world/snapshot`, {
      headers: { Authorization: `Bearer ${resB.data.activeToken}` },
    });
    assert.equal(crossForbidden.status, 403);

    // Wait for TTL expiry -> Owner A's token MUST return 401!
    await new Promise((r) => setTimeout(r, 600));
    const expiredRes = await fetch(`${baseUrl}/api/career/state`, {
      headers: { Authorization: `Bearer ${resA.data.activeToken}` },
    });
    assert.equal(expiredRes.status, 401, 'Expired token must return 401 UNAUTHORIZED');

    const expiredProxy = await fetch(`${baseUrl}/api/career-world/${resA.data.careerSaveId}/world/snapshot`, {
      headers: { Authorization: `Bearer ${resA.data.activeToken}` },
    });
    assert.equal(expiredProxy.status, 401, 'Expired token on Career World proxy must return 401');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});

test('V6.1-12: Unified Experience V5 legacy page redirects map cleanly to UnifiedExchangePage, MyEmpirePage, and MyAssetsPage', () => {
  assert.deepEqual(resolveLegacyPageRedirect('discover'), { activePage: 'unified_exchange', exchangeTab: 'discover' });
  assert.deepEqual(resolveLegacyPageRedirect('exchange'), { activePage: 'unified_exchange', exchangeTab: 'spot' });
  assert.deepEqual(resolveLegacyPageRedirect('futures'), { activePage: 'unified_exchange', exchangeTab: 'futures' });
  assert.deepEqual(resolveLegacyPageRedirect('forex'), { activePage: 'unified_exchange', exchangeTab: 'forex' });

  assert.deepEqual(resolveLegacyPageRedirect('empire_hub'), { activePage: 'my_empire', empireTab: 'hub' });
  assert.deepEqual(resolveLegacyPageRedirect('business'), { activePage: 'my_empire', empireTab: 'business' });
  assert.deepEqual(resolveLegacyPageRedirect('corporate'), { activePage: 'my_empire', empireTab: 'corporate' });
  assert.deepEqual(resolveLegacyPageRedirect('capital_hub'), { activePage: 'my_empire', empireTab: 'cofounder' });
  assert.deepEqual(resolveLegacyPageRedirect('company_hq'), { activePage: 'my_empire', empireTab: 'hq' });
  assert.deepEqual(resolveLegacyPageRedirect('funds'), { activePage: 'my_empire', empireTab: 'funds' });

  assert.deepEqual(resolveLegacyPageRedirect('portfolio'), { activePage: 'my_assets', assetsTab: 'portfolio' });
  assert.deepEqual(resolveLegacyPageRedirect('property'), { activePage: 'my_assets', assetsTab: 'property' });
  assert.deepEqual(resolveLegacyPageRedirect('banking'), { activePage: 'my_assets', assetsTab: 'banking' });
  assert.deepEqual(resolveLegacyPageRedirect('luxury'), { activePage: 'my_assets', assetsTab: 'luxury' });

  // Career & Online top-level pages stay separate and unmodified
  assert.deepEqual(resolveLegacyPageRedirect('career_home'), { activePage: 'career_home' });
  assert.deepEqual(resolveLegacyPageRedirect('overview'), { activePage: 'overview' });
});
