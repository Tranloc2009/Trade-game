import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { WorldEngine } from '../engine/WorldEngine';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';
import { createCareerImmersionRouter } from '../api/careerRoutes';
import { createApiRouter } from '../api/routes';
import { STORY_SCENES } from '../../shared/contracts/careerCampaignData';

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

test('AT01 & AT02: Brand-new account auto-enters Career Mode once, runs Opening Scenes 01–05 with Minh Quân motivation flag', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false });

  const loginRes = manager.loginOrRegisterAccount({
    username: 'MinhKhoi',
    preset: 'CUSTOM',
  });

  assert.equal(loginRes.resolvedMode, 'CAREER', 'Brand-new account MUST auto-enter Career Mode');
  assert.equal(loginRes.isFirstLaunch, true);
  assert.ok(loginRes.careerSaveId, '1st Career Save must be created automatically');
  assert.equal(loginRes.account.careerSaves.length, 1);
  assert.equal(loginRes.careerStory?.characterName, 'MinhKhoi');
  assert.equal(loginRes.careerStory?.difficulty, 'NORMAL');
  assert.equal(loginRes.careerStory?.activeSceneId, 'scene_01_opening');
  assert.equal(loginRes.profile.wallet.availableMinor, 100_000_00, 'Normal starting capital = 100,000 CR');

  const save = manager.requireActiveSave(loginRes.account.preferences.accountKey);
  const startCapital = save.world.getPlayerProfile(save.playerId)!.wallet.availableMinor;

  // Complete Scene 01 (M01), then advance Scene 03 (M02) choosing FREEDOM motivation
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_03_first_meeting', true);
  advanceSceneCompletely(save.director, {
    s03_n1: 's03_c_freedom',
  });
  save.director.triggerScene('scene_04_first_capital', true);
  advanceSceneCompletely(save.director);
  save.director.triggerScene('scene_05_gia_han_meeting', true);
  advanceSceneCompletely(save.director);

  const afterOpening = save.director.getSnapshot();
  assert.equal(afterOpening.storyFlags.motivation, 'FREEDOM', 'Minh Quân motivation choice must persist');
  assert.ok(afterOpening.completedMissionIds.includes('M01'));
  assert.ok(afterOpening.completedMissionIds.includes('M02'));
  assert.equal(afterOpening.activeMissionId, 'M05');
  assert.ok(afterOpening.relationships.minh_quan.met);
  assert.ok(afterOpening.relationships.minh_quan.memories.length > 0, 'Minh Quân must record NPC memory');
  assert.equal(
    save.world.getPlayerProfile(save.playerId)!.wallet.availableMinor,
    startCapital,
    'Dialogue alone must never mint or duplicate CR',
  );

  manager.dispose();
});

test('AT03, AT04, AT05, AT06: Real Career gameplay drives Business, Investor primary equity, Recession & Rival Duc Huy', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false });

  const login = manager.loginOrRegisterAccount({ username: 'FounderLan', preset: 'CUSTOM', difficulty: 'EASY' });
  const accountKey = login.account.preferences.accountKey;
  const save = manager.requireActiveSave(accountKey);

  // Rival Phạm Đức Huy must already own a real competing company in the Career World
  const initialStory = save.director.getSnapshot();
  assert.ok(initialStory.rivalCompanyId, 'Phạm Đức Huy must have a real competing business in Career World');
  const rivalBiz = save.world.businessEmpire
    .listBusinesses()
    .find((b) => b.id === initialStory.rivalCompanyId);
  assert.ok(rivalBiz, 'Rival business must exist in BusinessEmpireEngine');

  // Skip opening cutscene cleanly without auto-selecting choices, then complete M02-M04 scenes to reach M05
  save.director.skipOpeningScene();
  const afterSkip = save.director.getSnapshot();
  assert.equal(afterSkip.activeSceneId, null);
  assert.equal(afterSkip.activeMissionId, 'M02');
  for (const sId of ['scene_03_first_meeting', 'scene_04_first_capital', 'scene_05_gia_han_meeting']) {
    save.director.triggerScene(sId, true);
    advanceSceneCompletely(save.director);
  }
  assert.equal(save.director.getSnapshot().activeMissionId, 'M05');

  // Create a real Career business -> completes M05 & unlocks Chapter 2!
  const biz = save.world.businessEmpire.createBusiness({
    founderId: save.playerId,
    founderName: 'FounderLan',
    founderNetWorthMinor: save.world.getPlayerProfile(save.playerId)!.netWorthMinor,
    businessTypeId: 'fnb_coffee_shop',
    businessName: 'Saigon Craft Brew',
    ticker: 'SCB',
    cityCode: 'HCMC',
    businessModel: 'FRANCHISE_CHAIN',
    initialCapitalCR: 25_000,
  });
  save.director.syncGameplayProgress();
  const afterBiz = save.director.getSnapshot();
  assert.ok(afterBiz.completedMissionIds.includes('M05'), 'Creating real business must complete M05');
  assert.equal(afterBiz.currentChapter, 2, 'Completing Chapter 1 must advance to Chapter 2');

  // Chapter 2: Hire employees + advance real operating cycle -> progresses M06, M07 & M08
  save.world.businessEmpire.manageEmployees({
    businessId: biz.id,
    requesterId: save.playerId,
    action: 'HIRE',
    role: 'OPERATOR',
    count: 2,
  });
  save.world.runV4MacroAndOperatingCycle();
  save.director.syncGameplayProgress();
  const ch2Snap = save.director.getSnapshot();
  assert.ok(ch2Snap.completedMissionIds.includes('M06'), 'Active business must complete M06');
  assert.ok(ch2Snap.completedMissionIds.includes('M07'), 'Hiring real staff must complete M07');
  assert.ok(ch2Snap.completedMissionIds.includes('M08'), 'Running real operating cycle must complete M08');

  // Chapter 3: Verify Lê Hoàng Nam real primary equity raise settles real CR from Nam's finite wallet
  const cashBeforeNam = save.world.businessEmpire.getBusiness(biz.id)!.companyCashMinor;
  const sharesBeforeNam = save.world.businessEmpire.getBusiness(biz.id)!.totalIssuedShares;
  save.director.triggerScene('scene_ch3_negotiation', true);
  advanceSceneCompletely(save.director, {
    ch3_neg_1: 'ch3_neg_accept',
  });
  const bizAfterNam = save.world.businessEmpire.getBusiness(biz.id)!;
  assert.ok(
    bizAfterNam.companyCashMinor > cashBeforeNam,
    'Accepting Lê Hoàng Nam offer must transfer real CR into company account',
  );
  assert.ok(
    bizAfterNam.totalIssuedShares > sharesBeforeNam,
    'Accepting Lê Hoàng Nam offer must issue real primary shares',
  );
  assert.ok(
    bizAfterNam.shareholders.some((sh) => sh.playerId === 'npc_career_hoang_nam'),
    'Lê Hoàng Nam must appear on company cap table',
  );

  // Chapter 4: Trigger Black Monday real recession via WorldMacroV4Engine
  save.director.triggerScene('scene_ch4_black_monday');
  advanceSceneCompletely(save.director);
  const macro = save.world.macroV4.getOverview();
  assert.equal(
    macro.indicators.phase,
    'RECESSION',
    'Chapter 4 Black Monday must trigger real macro RECESSION in isolated Career World',
  );
  // Ensure Online WORLD-01 macro is unaffected!
  assert.notEqual(
    onlineWorld.macroV4.getOverview().indicators.phase,
    'RECESSION',
    'Career Chapter 4 recession must NEVER affect Online WORLD-01',
  );

  // Chapter 5: Đức Huy Alliance decision updates flag & trust
  save.director.triggerScene('scene_ch5_huy_alliance');
  advanceSceneCompletely(save.director, {
    ch5_huy_1: 'ch5_huy_ally',
  });
  assert.equal(save.director.getSnapshot().storyFlags.huyAlliance, 'ALLIED');

  manager.dispose();
});

test('AT07 & AT08: Mid-dialogue reload idempotency & returning account remembers lastPlayedMode without duplicating capital', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false });

  // First login -> Career Scene 01
  const first = manager.loginOrRegisterAccount({ username: 'ReturningUser', preset: 'CUSTOM' });
  const accountKey = first.account.preferences.accountKey;
  const save = manager.requireActiveSave(accountKey);

  // Advance 1 step mid-dialogue
  save.director.advanceDialogue();
  const midSnap = save.director.getSnapshot();
  const expectedScene = midSnap.activeSceneId;
  const expectedNode = midSnap.activeNodeId;
  const cashBeforeReload = save.world.getPlayerProfile(save.playerId)!.wallet.availableMinor;

  // Simulate re-login / page reload
  const second = manager.loginOrRegisterAccount({ username: 'ReturningUser', preset: 'CUSTOM' });
  assert.equal(second.resolvedMode, 'CAREER');
  assert.equal(second.isFirstLaunch, false);
  assert.equal(second.account.careerSaves.length, 1, 'Must NEVER create a duplicate Career Save on re-login');
  assert.equal(second.careerStory?.activeSceneId, expectedScene, 'Must resume exact mid-dialogue scene');
  assert.equal(second.careerStory?.activeNodeId, expectedNode, 'Must resume exact mid-dialogue node');
  assert.equal(second.profile.wallet.availableMinor, cashBeforeReload, 'Must NEVER re-grant starting capital');

  // Now switch to ONLINE and re-login -> must resume ONLINE directly without Career intro!
  manager.switchMode(accountKey, 'ONLINE');
  const third = manager.loginOrRegisterAccount({ username: 'ReturningUser', preset: 'CUSTOM' });
  assert.equal(third.resolvedMode, 'ONLINE', 'Returning account last in ONLINE must open ONLINE directly');
  assert.equal(third.isFirstLaunch, false);

  manager.dispose();
});

test('AT09, AT10, AT13 & AT16: Seamless Career <-> Online switch, strict financial isolation across Online & 2 Career Saves, Online immediately playable', () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false });

  // Brand-new account hasn't even finished Career Scene 01 (AT16)
  const login = manager.loginOrRegisterAccount({ username: 'DualPlayer', preset: 'CUSTOM' });
  const accountKey = login.account.preferences.accountKey;
  const save1Id = login.careerSaveId!;
  const save1 = manager.requireActiveSave(accountKey);
  assert.equal(save1.director.activeSceneId, 'scene_01_opening');

  // Switch immediately to ONLINE without finishing Career Chapter 1 (AT09 & AT16)
  const toOnline = manager.switchMode(accountKey, 'ONLINE');
  assert.equal(toOnline.mode, 'ONLINE');
  assert.equal(save1.director.paused, true, 'Switching Career -> Online must pause Career clock');
  assert.equal(
    save1.director.activeSceneId,
    'scene_01_opening',
    'Career dialogue state must be preserved while in Online',
  );

  // Place a real open limit buy order in Online WORLD-01 (within NOVA price band)
  const onlineOrderRes = onlineWorld.placeOrder(toOnline.profile.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    priceCR: 45,
    quantity: 5,
    idempotencyKey: 'at09_online_order',
  });
  assert.ok(onlineOrderRes.order.id);
  const onlineCashAfterOrder = onlineWorld.getPlayerProfile(toOnline.profile.id)!.wallet.availableMinor;

  // Switch back to Career Save 1 -> Online order stays intact, Career cash is untouched (AT10)
  const backCareer = manager.switchMode(accountKey, 'CAREER');
  assert.equal(backCareer.mode, 'CAREER');
  assert.equal(backCareer.careerSaveId, save1Id);
  assert.equal(
    backCareer.profile.wallet.availableMinor,
    100_000_00,
    'Online WORLD-01 order must NEVER reduce Career Save 1 cash',
  );

  // Mutate Career Save 1: create business & change Career clock speed (AT13)
  manager.setCareerClockSpeed(accountKey, '10x');
  assert.equal(save1.director.clockSpeed, '10x');
  save1.world.businessEmpire.createBusiness({
    founderId: save1.playerId,
    founderName: 'DualPlayer',
    founderNetWorthMinor: save1.world.getPlayerProfile(save1.playerId)!.netWorthMinor,
    businessTypeId: 'fnb_coffee_shop',
    businessName: 'Career One Cafe',
    ticker: 'C1C',
    cityCode: 'HCMC',
    businessModel: 'FRANCHISE_CHAIN',
    initialCapitalCR: 20_000,
  });
  const save1CashAfterBiz = save1.world.getPlayerProfile(save1.playerId)!.wallet.availableMinor;
  assert.ok(save1CashAfterBiz < 100_000_00);

  // Create a 2nd isolated Career Save -> must have fresh 65,000 CR (HARD) & 0 player businesses!
  const { save: save2 } = manager.createAdditionalCareerSave(accountKey, 'DualPlayer Hard', 'HARD');
  assert.notEqual(save2.saveId, save1Id);
  assert.equal(save2.world.getPlayerProfile(save2.playerId)!.wallet.availableMinor, 65_000_00);
  const save2PlayerBiz = save2.world.businessEmpire
    .listBusinesses()
    .filter((b) => b.ownerId === save2.playerId);
  assert.equal(save2PlayerBiz.length, 0, 'Career Save 2 must NOT see Career Save 1 businesses');

  // Switch back to ONLINE -> Online cash & open order must remain 100% intact!
  const backOnline = manager.switchMode(accountKey, 'ONLINE');
  assert.equal(backOnline.profile.wallet.availableMinor, onlineCashAfterOrder);
  const onlineOrders = onlineWorld.matching.listPlayerOrders(backOnline.profile.id);
  assert.ok(onlineOrders.some((o) => o.id === onlineOrderRes.order.id));
  const onlinePlayerBiz = onlineWorld.businessEmpire
    .listBusinesses()
    .filter((b) => b.ownerId === backOnline.profile.id);
  assert.equal(onlinePlayerBiz.length, 0, 'Career business must NEVER leak into Online WORLD-01');

  manager.dispose();
});

test('AT11, AT12, AT14 & AT15: HTTP ownership isolation (403), Phone replies, Skip Opening, and 5 Endings -> Free Play preserving assets', async () => {
  const onlineWorld = createTestWorld();
  const manager = new CareerWorldManager(onlineWorld, { enableTimers: false });

  const app = express();
  app.use(express.json());
  app.use('/api', createCareerImmersionRouter(manager));
  app.use('/api', createApiRouter(onlineWorld));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Register User A & User B via HTTP
    const resA = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'OwnerAlpha', preset: 'CUSTOM' }),
    }).then((r) => r.json());
    assert.equal(resA.ok, true);

    const resB = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'IntruderBeta', preset: 'CUSTOM' }),
    }).then((r) => r.json());
    assert.equal(resB.ok, true);

    // AT11: User B MUST receive 403 when attempting to access User A's Career World proxy
    const forbiddenRes = await fetch(
      `${baseUrl}/api/career-world/${resA.data.careerSaveId}/world/snapshot`,
      {
        headers: { Authorization: `Bearer ${resB.data.activeToken}` },
      },
    );
    assert.equal(forbiddenRes.status, 403, 'Cross-account Career World access must return 403 FORBIDDEN');

    // AT11b: User B MUST receive 403 when attempting to switchMode into User A's saveId
    const forbiddenSwitch = await fetch(`${baseUrl}/api/account/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resB.data.activeToken}`,
      },
      body: JSON.stringify({ mode: 'CAREER', careerSaveId: resA.data.careerSaveId }),
    });
    assert.equal(forbiddenSwitch.status, 403);

    // AT14: User A skips opening cleanly via HTTP
    const skipRes = await fetch(`${baseUrl}/api/career/story/skip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resA.data.activeToken}` },
    }).then((r) => r.json());
    assert.equal(skipRes.ok, true);
    assert.equal(skipRes.data.careerStory.activeSceneId, null);

    // AT12: User A replies to an NPC phone message via HTTP
    const msgs = skipRes.data.careerStory.phoneMessages;
    const replyable = msgs.find((m: { replyOptions: unknown[]; repliedChoiceId: string | null }) => m.replyOptions.length > 0 && !m.repliedChoiceId);
    assert.ok(replyable, 'At least one NPC phone message with reply options must exist');
    const replyRes = await fetch(`${baseUrl}/api/career/phone/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resA.data.activeToken}`,
      },
      body: JSON.stringify({
        messageId: replyable.id,
        replyOptionId: replyable.replyOptions[0].id,
      }),
    }).then((r) => r.json());
    assert.equal(replyRes.ok, true);
    const updatedMsg = replyRes.data.careerStory.phoneMessages.find(
      (m: { id: string }) => m.id === replyable.id,
    );
    assert.equal(updatedMsg.repliedChoiceId, replyable.replyOptions[0].id);

    // AT15: Confirming an ending unlocks Free Play & preserves 100% of cash/assets
    const cashBeforeEnding = replyRes.data.profile.wallet.availableMinor;
    const endRes = await fetch(`${baseUrl}/api/career/ending/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resA.data.activeToken}`,
      },
      body: JSON.stringify({ endingId: 'THE_LEGEND' }),
    }).then((r) => r.json());
    assert.equal(endRes.ok, true);
    assert.equal(endRes.data.careerStory.selectedEndingId, 'THE_LEGEND');
    assert.equal(endRes.data.careerStory.freePlayUnlocked, true);
    assert.equal(endRes.data.careerStory.availableEndings.length, 5);
    assert.equal(
      endRes.data.profile.wallet.availableMinor,
      cashBeforeEnding,
      'Unlocking Free Play must preserve 100% of player cash & assets',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    manager.dispose();
  }
});
