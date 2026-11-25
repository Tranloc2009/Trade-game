import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_MISSIONS, STORY_SCENES } from '../../../../shared/contracts/careerCampaignData';
import type { CareerStoryState } from '../../../../shared/contracts/careerStory';
import type { BusinessEntity } from '../../../../shared/contracts/v4';
import { resolveSmartMissionDirective } from '../../../lib/navigation';
import {
  LOCATION_BY_ID,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  SAIGON_LOCATIONS,
  SCENE_TO_LOCATION_MAP,
  buildBusinessActionItems,
  clampMapTransform,
  focusMapPoint,
  resolveCityTimeOfDay,
  resolveLocationForMission,
  resolveLocationForScene,
  resolveLocationView,
  resolveRelationshipStageLabel,
} from './locationRegistry';

function makeMinimalStory(overrides: Partial<CareerStoryState> = {}): CareerStoryState {
  return {
    saveId: 'save-test',
    worldId: 'WORLD-CAREER-TEST',
    characterName: 'Minh Khôi',
    difficulty: 'NORMAL',
    currentChapter: 1,
    activeMissionId: 'M01',
    completedMissionIds: [],
    completedSideMissionIds: [],
    completedSceneIds: [],
    sceneQueue: [],
    cornerQueue: [],
    activeSceneId: null,
    activeNodeId: null,
    clockSpeed: '1x',
    paused: false,
    directorState: 'MISSION_IN_PROGRESS',
    freePlayUnlocked: false,
    selectedEndingId: null,
    storyFlags: {},
    missionProgress: {},
    relationships: {
      minh_quan: {
        npcId: 'minh_quan',
        trust: 50,
        met: true,
        companyMember: false,
        statusLabel: 'Cố vấn',
        roleInPlayerStory: 'Người dẫn dắt',
        memories: [],
      },
      gia_han: {
        npcId: 'gia_han',
        trust: 50,
        met: false,
        companyMember: false,
        statusLabel: 'Chưa gặp',
        roleInPlayerStory: 'Đối tác tương lai',
        memories: [],
      },
      duc_huy: {
        npcId: 'duc_huy',
        trust: 30,
        met: false,
        companyMember: false,
        statusLabel: 'Chưa gặp',
        roleInPlayerStory: 'Đối thủ',
        memories: [],
      },
      hoang_nam: {
        npcId: 'hoang_nam',
        trust: 45,
        met: false,
        companyMember: false,
        statusLabel: 'Chưa gặp',
        roleInPlayerStory: 'Nhà đầu tư',
        memories: [],
      },
      thao_linh: {
        npcId: 'thao_linh',
        trust: 50,
        met: false,
        companyMember: false,
        statusLabel: 'Chưa gặp',
        roleInPlayerStory: 'Chuyên gia tài chính',
        memories: [],
      },
    },
    phoneMessages: [],
    appointments: [],
    decisions: [],
    unlockedStoryTitles: [],
    rivalCompanyId: null,
    rivalCompanyName: null,
    namOfferValuationMinor: 0,
    namOfferInvestmentMinor: 0,
    namOfferEquityPct: 0,
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  } as CareerStoryState;
}

test('All 7 Saigon locations sit cleanly within the 1600x900 map coordinate system without overlapping', () => {
  assert.equal(SAIGON_LOCATIONS.length, 7);
  for (const loc of SAIGON_LOCATIONS) {
    assert.ok(loc.mapX > 100 && loc.mapX < MAP_WORLD_WIDTH - 100, `${loc.id} mapX within safe bounds`);
    assert.ok(loc.mapY > 80 && loc.mapY < MAP_WORLD_HEIGHT - 80, `${loc.id} mapY within safe bounds`);
  }
  for (let i = 0; i < SAIGON_LOCATIONS.length; i++) {
    for (let j = i + 1; j < SAIGON_LOCATIONS.length; j++) {
      const a = SAIGON_LOCATIONS[i];
      const b = SAIGON_LOCATIONS[j];
      const dist = Math.hypot(a.mapX - b.mapX, a.mapY - b.mapY);
      assert.ok(dist >= 180, `Locations ${a.id} and ${b.id} are too close (${dist.toFixed(1)}px)`);
    }
  }
});

test('Every story scene in STORY_SCENES is explicitly mapped in SCENE_TO_LOCATION_MAP', () => {
  for (const scene of Object.values(STORY_SCENES)) {
    assert.ok(
      SCENE_TO_LOCATION_MAP[scene.id],
      `Scene ${scene.id} must have an explicit location mapping`,
    );
    assert.ok(LOCATION_BY_ID[resolveLocationForScene(scene.id)]);
  }
});

test('All 30 campaign missions map to accurate Living City locations with zero hardcoded mismatches', () => {
  assert.equal(CAMPAIGN_MISSIONS.length, 30);

  for (const m of CAMPAIGN_MISSIONS) {
    const loc = resolveLocationForMission(m, makeMinimalStory({ activeMissionId: m.id }));
    assert.ok(LOCATION_BY_ID[loc], `Mission ${m.id} resolved to valid location ${loc}`);
  }

  const byId = (id: string) => CAMPAIGN_MISSIONS.find((m) => m.id === id)!;

  // Key regression assertions (M04 -> coffee_shop, M08 -> company, M09 -> company, M12 -> company, M18 -> coffee_shop, M21 -> financial_district, M30 -> coffee_shop)
  assert.equal(resolveLocationForMission(byId('M01')), 'apartment');
  assert.equal(resolveLocationForMission(byId('M02')), 'coffee_shop');
  assert.equal(resolveLocationForMission(byId('M04')), 'coffee_shop');
  assert.equal(resolveLocationForMission(byId('M05')), 'company');
  assert.equal(resolveLocationForMission(byId('M08')), 'company');
  assert.equal(resolveLocationForMission(byId('M09')), 'company');
  assert.equal(resolveLocationForMission(byId('M12')), 'company');
  assert.equal(resolveLocationForMission(byId('M18')), 'coffee_shop');
  assert.equal(resolveLocationForMission(byId('M21')), 'financial_district');
  assert.equal(resolveLocationForMission(byId('M30')), 'coffee_shop');
});

test('Mission Director 2.0 plays introSceneId once without looping for M06, M09, M12, M21 and handles Free Play without M01 fallback', () => {
  const byId = (id: string) => CAMPAIGN_MISSIONS.find((m) => m.id === id)!;

  for (const id of ['M06', 'M09', 'M12', 'M21'] as const) {
    const mission = byId(id);
    assert.ok(mission.introSceneId, `${id} should have introSceneId`);

    // Before introSceneId is completed: must trigger that scene first
    const beforeIntro = resolveSmartMissionDirective({
      mission,
      sceneQueue: [],
      directorState: 'MISSION_IN_PROGRESS',
      freePlayUnlocked: false,
      hasAnyBusiness: true,
      completedSceneIds: [],
    });
    assert.equal(beforeIntro.actionType, 'TRIGGER_SCENE');
    assert.equal(beforeIntro.sceneId, mission.introSceneId);

    // After introSceneId is completed: must NOT loop back to TRIGGER_SCENE — must route to actual gameplay screen
    const afterIntro = resolveSmartMissionDirective({
      mission,
      sceneQueue: [],
      directorState: 'MISSION_IN_PROGRESS',
      freePlayUnlocked: false,
      hasAnyBusiness: true,
      completedSceneIds: [mission.introSceneId!],
    });
    assert.notEqual(
      afterIntro.actionType,
      'TRIGGER_SCENE',
      `${id} must not loop introSceneId once completed`,
    );
  }

  // Free Play must NEVER fall back to M01
  const freePlayDirective = resolveSmartMissionDirective({
    mission: null,
    sceneQueue: [],
    directorState: 'FREE_PLAY',
    freePlayUnlocked: true,
    hasAnyBusiness: true,
    completedSceneIds: ['scene_01_opening'],
  });
  assert.equal(freePlayDirective.actionType, 'OPEN_ROUTE');
  assert.equal(freePlayDirective.sceneId, undefined);
  assert.match(freePlayDirective.primaryLabel, /Free Play|đế chế/i);
});

test('resolveLocationView strictly scopes appointments per location and hides unmet future NPCs', () => {
  const story = makeMinimalStory({
    currentChapter: 2,
    appointments: [
      {
        id: 'appt-huy',
        npcId: 'duc_huy',
        title: 'Cuộc chạm trán với Phạm Đức Huy',
        location: 'Văn phòng khởi nghiệp',
        sceneId: 'scene_ch2_duc_huy_rival',
        chapterNumber: 2,
        completed: false,
      },
    ],
  });

  // Coffee Shop MUST NOT steal Duc Huy's company appointment
  const cafeView = resolveLocationView({
    location: LOCATION_BY_ID.coffee_shop,
    careerStory: story,
    activeMission: CAMPAIGN_MISSIONS.find((m) => m.id === 'M09')!,
    missionLocationId: 'company',
    playerBusinesses: [],
  });
  assert.equal(cafeView.hasAppointment, false);
  assert.equal(cafeView.appointment, null);
  // Anti-spoiler: gia_han is unmet -> must not appear in coffee_shop regular NPCs
  assert.equal(
    cafeView.visibleNpcs.some((n) => n.npcId === 'gia_han'),
    false,
  );

  // Company location MUST receive Duc Huy's appointment cleanly
  const companyView = resolveLocationView({
    location: LOCATION_BY_ID.company,
    careerStory: story,
    activeMission: CAMPAIGN_MISSIONS.find((m) => m.id === 'M09')!,
    missionLocationId: 'company',
    playerBusinesses: [],
  });
  assert.equal(companyView.hasAppointment, true);
  assert.equal(companyView.appointment?.id, 'appt-huy');
  assert.equal(companyView.state, 'APPOINTMENT');
});

test('Map pan/zoom clamping & point focus stay strictly within bounds across desktop and mobile viewports', () => {
  const desktop = clampMapTransform({
    tx: 9999,
    ty: 9999,
    scale: 0.2,
    viewportW: 1200,
    viewportH: 720,
  });
  assert.ok(desktop.scale >= 0.75);
  assert.ok(desktop.tx <= 0 && desktop.ty <= 0);

  const focused = focusMapPoint({
    mapX: LOCATION_BY_ID.corporate_tower.mapX,
    mapY: LOCATION_BY_ID.corporate_tower.mapY,
    scale: 1.15,
    viewportW: 1200,
    viewportH: 720,
  });
  assert.ok(focused.tx <= 0 && focused.tx >= 1200 - MAP_WORLD_WIDTH * focused.scale);
  assert.ok(focused.ty <= 0 && focused.ty >= 720 - MAP_WORLD_HEIGHT * focused.scale);

  const mobile = clampMapTransform({
    tx: -5000,
    ty: -5000,
    scale: 1.0,
    viewportW: 390,
    viewportH: 520,
  });
  assert.ok(mobile.tx >= 390 - MAP_WORLD_WIDTH * mobile.scale);
  assert.ok(mobile.ty >= 520 - MAP_WORLD_HEIGHT * mobile.scale);
});

test('City Day/Night lighting and human relationship stage labels reflect real state', () => {
  assert.equal(
    resolveCityTimeOfDay({
      formattedGameTime: 'Ngày 1 · 08:30',
      gameHour: 8,
    } as never).period,
    'MORNING',
  );
  assert.equal(
    resolveCityTimeOfDay({
      formattedGameTime: 'Ngày 1 · 17:45',
      gameHour: 17,
    } as never).period,
    'SUNSET',
  );
  assert.equal(
    resolveCityTimeOfDay({
      formattedGameTime: 'Ngày 1 · 22:15',
      gameHour: 22,
    } as never).period,
    'NIGHT',
  );

  assert.equal(resolveRelationshipStageLabel(20, true).label, 'Đang bất đồng');
  assert.equal(resolveRelationshipStageLabel(40, true).label, 'Mới quen');
  assert.equal(resolveRelationshipStageLabel(50, true).label, 'Đối tác');
  assert.equal(resolveRelationshipStageLabel(70, true).label, 'Tin tưởng');
  assert.equal(resolveRelationshipStageLabel(85, true).label, 'Đồng minh');
});

test('buildBusinessActionItems derives honest actionable items from real BusinessEntity data', () => {
  const mockBiz = {
    id: 'biz-1',
    level: 1,
    employeeCount: 1,
    customerDemandUnits: 120,
    productionCapacity: 80,
    qualityScore: 55,
    companyCashMinor: 500_000,
    pendingUpgrade: null,
    financialHistory: [
      {
        cycleId: 'c1',
        netProfitMinor: -120_000,
      },
    ],
  } as unknown as BusinessEntity;

  const items = buildBusinessActionItems(mockBiz, 15_000);
  assert.ok(items.length >= 3 && items.length <= 4);
  assert.ok(items.some((i) => i.id === 'fix_operating_loss'));
  assert.ok(items.some((i) => i.id === 'expand_capacity'));
  assert.ok(items.some((i) => i.id === 'hire_staff'));
});
