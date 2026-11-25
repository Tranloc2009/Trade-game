import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_MISSIONS } from '../../shared/contracts/careerCampaignData';
import {
  CAREER_SIDEBAR_SECTIONS,
  ONLINE_MOBILE_NAV_IDS,
  ONLINE_SIDEBAR_SECTIONS,
  getChapterFocusGuidance,
  resolveCanonicalNavigation,
  resolveSmartMissionDirective,
} from './navigation';

test('Online Mode sidebar has exactly 7 sections and mobile bottom bar has exactly 5 items', () => {
  assert.equal(ONLINE_SIDEBAR_SECTIONS.length, 7);
  assert.deepEqual(
    ONLINE_SIDEBAR_SECTIONS.map((s) => s.label),
    ['Trang chủ', 'Sàn giao dịch', 'Đế chế của tôi', 'Tài sản', 'Phong cách sống', 'Thế giới', 'Cài đặt'],
  );
  assert.equal(ONLINE_MOBILE_NAV_IDS.length, 5);
  assert.deepEqual([...ONLINE_MOBILE_NAV_IDS], ['overview', 'unified_exchange', 'my_empire', 'my_assets', 'world']);
});

test('Career Mode sidebar has 6 clean narrative sections', () => {
  assert.equal(CAREER_SIDEBAR_SECTIONS.length, 6);
});

test('Legacy route redirects resolve cleanly to unified hubs with exact sub-tabs preserved', () => {
  assert.deepEqual(resolveCanonicalNavigation('exchange'), { activePage: 'unified_exchange', exchangeTab: 'spot' });
  assert.deepEqual(resolveCanonicalNavigation('futures'), { activePage: 'unified_exchange', exchangeTab: 'futures' });
  assert.deepEqual(resolveCanonicalNavigation('forex'), { activePage: 'unified_exchange', exchangeTab: 'forex' });
  assert.deepEqual(resolveCanonicalNavigation('discover'), { activePage: 'unified_exchange', exchangeTab: 'discover' });

  assert.deepEqual(resolveCanonicalNavigation('business'), { activePage: 'my_empire', empireTab: 'business' });
  assert.deepEqual(resolveCanonicalNavigation('capital_hub'), { activePage: 'my_empire', empireTab: 'cofounder' });
  assert.deepEqual(resolveCanonicalNavigation('company_hq'), { activePage: 'my_empire', empireTab: 'hq' });
  assert.deepEqual(resolveCanonicalNavigation('corporate'), { activePage: 'my_empire', empireTab: 'corporate' });
  assert.deepEqual(resolveCanonicalNavigation('funds'), { activePage: 'my_empire', empireTab: 'funds' });

  assert.deepEqual(resolveCanonicalNavigation('portfolio'), { activePage: 'my_assets', assetsTab: 'portfolio' });
  assert.deepEqual(resolveCanonicalNavigation('property'), { activePage: 'my_assets', assetsTab: 'property' });
  assert.deepEqual(resolveCanonicalNavigation('banking'), { activePage: 'my_assets', assetsTab: 'banking' });
  assert.deepEqual(resolveCanonicalNavigation('luxury'), { activePage: 'my_assets', assetsTab: 'luxury' });

  assert.deepEqual(resolveCanonicalNavigation('career'), { activePage: 'lifestyle', lifestyleTab: 'rank' });
  assert.deepEqual(resolveCanonicalNavigation('entertainment'), { activePage: 'lifestyle', lifestyleTab: 'entertainment' });
  assert.deepEqual(resolveCanonicalNavigation('social'), { activePage: 'world', worldTab: 'connect' });
  assert.deepEqual(resolveCanonicalNavigation('leaderboard'), { activePage: 'world', worldTab: 'leaderboard' });
  assert.deepEqual(resolveCanonicalNavigation('news'), { activePage: 'world', worldTab: 'news' });
});

test('Smart Mission Flow routes M05 directly into Business Creation Wizard when player owns no business', () => {
  const m05 = CAMPAIGN_MISSIONS.find((m) => m.id === 'M05')!;
  const directive = resolveSmartMissionDirective({
    mission: m05,
    sceneQueue: [],
    directorState: 'MISSION_ACTIVE',
    freePlayUnlocked: false,
    hasAnyBusiness: false,
  });
  assert.equal(directive.actionType, 'OPEN_BUSINESS_WIZARD');
  assert.equal(directive.openWizard, true);
  assert.equal(directive.targetPage, 'business');
  assert.match(directive.primaryLabel, /Thành lập doanh nghiệp/);
});

test('Smart Mission Flow routes M07 directly into Operations tab for hiring/upgrading', () => {
  const m07 = CAMPAIGN_MISSIONS.find((m) => m.id === 'M07')!;
  const directive = resolveSmartMissionDirective({
    mission: m07,
    sceneQueue: [],
    directorState: 'MISSION_ACTIVE',
    freePlayUnlocked: false,
    hasAnyBusiness: true,
  });
  assert.equal(directive.actionType, 'OPEN_BUSINESS_TAB');
  assert.equal(directive.businessTab, 'OPERATIONS');
});

test('Progressive Disclosure focuses Chapter 1 on startup & spot without pushing Futures', () => {
  const ch1 = getChapterFocusGuidance(1, false);
  assert.equal(ch1.recommendedExchangeTabs.includes('futures'), false);
  assert.deepEqual(ch1.recommendedEmpireTabs, ['business']);

  const freePlay = getChapterFocusGuidance(6, true);
  assert.equal(freePlay.recommendedExchangeTabs.includes('futures'), true);
  assert.equal(freePlay.recommendedEmpireTabs.length, 6);
});
