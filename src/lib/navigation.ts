import type { StoryMissionSpec } from '../../shared/contracts/careerStory';

export type UnifiedExchangeTab = 'discover' | 'spot' | 'futures' | 'forex';
export type MyEmpireTab = 'hub' | 'business' | 'corporate' | 'cofounder' | 'hq' | 'funds';
export type MyAssetsTab = 'portfolio' | 'property' | 'banking' | 'luxury';
export type LifestyleTab = 'luxury' | 'rank' | 'entertainment';
export type WorldTab = 'connect' | 'leaderboard' | 'news';
export type BusinessTycoonTab = 'OVERVIEW' | 'OPERATIONS' | 'GROWTH' | 'FINANCE';

export type NavPage =
  | 'overview'
  | 'unified_exchange'
  | 'my_empire'
  | 'my_assets'
  | 'lifestyle'
  | 'world'
  | 'discover'
  | 'exchange'
  | 'forex'
  | 'futures'
  | 'portfolio'
  | 'property'
  | 'business'
  | 'empire_hub'
  | 'capital_hub'
  | 'company_hq'
  | 'corporate'
  | 'funds'
  | 'luxury'
  | 'career'
  | 'banking'
  | 'social'
  | 'leaderboard'
  | 'news'
  | 'entertainment'
  | 'settings'
  | 'career_home'
  | 'career_world'
  | 'career_settings';

export const VALID_NAV_PAGES = new Set<NavPage>([
  'overview',
  'unified_exchange',
  'my_empire',
  'my_assets',
  'lifestyle',
  'world',
  'discover',
  'exchange',
  'forex',
  'futures',
  'portfolio',
  'property',
  'business',
  'empire_hub',
  'capital_hub',
  'company_hq',
  'corporate',
  'funds',
  'luxury',
  'career',
  'banking',
  'social',
  'leaderboard',
  'news',
  'entertainment',
  'settings',
  'career_home',
  'career_world',
  'career_settings',
]);

export interface ResolvedNavTarget {
  activePage: NavPage;
  exchangeTab?: UnifiedExchangeTab;
  empireTab?: MyEmpireTab;
  assetsTab?: MyAssetsTab;
  lifestyleTab?: LifestyleTab;
  worldTab?: WorldTab;
}

/**
 * Single canonical route resolver used by useAppStore, App.tsx, AppShell, CareerShell,
 * and Smart Mission Flow. Preserves all legacy deep links while normalizing to unified hubs.
 */
export function resolveCanonicalNavigation(page: NavPage): ResolvedNavTarget {
  switch (page) {
    case 'discover':
      return { activePage: 'unified_exchange', exchangeTab: 'discover' };
    case 'exchange':
      return { activePage: 'unified_exchange', exchangeTab: 'spot' };
    case 'futures':
      return { activePage: 'unified_exchange', exchangeTab: 'futures' };
    case 'forex':
      return { activePage: 'unified_exchange', exchangeTab: 'forex' };
    case 'empire_hub':
      return { activePage: 'my_empire', empireTab: 'hub' };
    case 'business':
      return { activePage: 'my_empire', empireTab: 'business' };
    case 'corporate':
      return { activePage: 'my_empire', empireTab: 'corporate' };
    case 'capital_hub':
      return { activePage: 'my_empire', empireTab: 'cofounder' };
    case 'company_hq':
      return { activePage: 'my_empire', empireTab: 'hq' };
    case 'funds':
      return { activePage: 'my_empire', empireTab: 'funds' };
    case 'portfolio':
      return { activePage: 'my_assets', assetsTab: 'portfolio' };
    case 'property':
      return { activePage: 'my_assets', assetsTab: 'property' };
    case 'banking':
      return { activePage: 'my_assets', assetsTab: 'banking' };
    case 'luxury':
      return { activePage: 'my_assets', assetsTab: 'luxury' };
    case 'career':
      return { activePage: 'lifestyle', lifestyleTab: 'rank' };
    case 'entertainment':
      return { activePage: 'lifestyle', lifestyleTab: 'entertainment' };
    case 'social':
      return { activePage: 'world', worldTab: 'connect' };
    case 'leaderboard':
      return { activePage: 'world', worldTab: 'leaderboard' };
    case 'news':
      return { activePage: 'world', worldTab: 'news' };
    default:
      return { activePage: page };
  }
}

export type OnlineSidebarSectionId =
  | 'overview'
  | 'unified_exchange'
  | 'my_empire'
  | 'my_assets'
  | 'lifestyle'
  | 'world'
  | 'settings';

export type CareerSidebarSectionId =
  | 'career_home'
  | 'career_world'
  | 'my_empire'
  | 'my_assets'
  | 'unified_exchange'
  | 'career_settings';

export interface OnlineSidebarSectionSpec {
  id: OnlineSidebarSectionId;
  targetPage: NavPage;
  label: string;
  shortLabel: string;
  mobileLabel: string;
  matchPages: NavPage[];
}

/**
 * Exact 7 Online Mode Sidebar items per Playable World Redesign §9.
 */
export const ONLINE_SIDEBAR_SECTIONS: readonly OnlineSidebarSectionSpec[] = [
  {
    id: 'overview',
    targetPage: 'overview',
    label: 'Trang chủ',
    shortLabel: 'Trang chủ',
    mobileLabel: 'Trang chủ',
    matchPages: ['overview'],
  },
  {
    id: 'unified_exchange',
    targetPage: 'unified_exchange',
    label: 'Sàn giao dịch',
    shortLabel: 'Giao dịch',
    mobileLabel: 'Giao dịch',
    matchPages: ['unified_exchange', 'discover', 'exchange', 'futures', 'forex'],
  },
  {
    id: 'my_empire',
    targetPage: 'my_empire',
    label: 'Đế chế của tôi',
    shortLabel: 'Đế chế',
    mobileLabel: 'Đế chế',
    matchPages: ['my_empire', 'empire_hub', 'business', 'corporate', 'capital_hub', 'company_hq', 'funds'],
  },
  {
    id: 'my_assets',
    targetPage: 'my_assets',
    label: 'Tài sản',
    shortLabel: 'Tài sản',
    mobileLabel: 'Tài sản',
    matchPages: ['my_assets', 'portfolio', 'property', 'banking', 'luxury'],
  },
  {
    id: 'lifestyle',
    targetPage: 'lifestyle',
    label: 'Phong cách sống',
    shortLabel: 'Phong cách',
    mobileLabel: 'Phong cách',
    matchPages: ['lifestyle', 'career', 'entertainment'],
  },
  {
    id: 'world',
    targetPage: 'world',
    label: 'Thế giới',
    shortLabel: 'Thế giới',
    mobileLabel: 'Thế giới',
    matchPages: ['world', 'social', 'leaderboard', 'news'],
  },
  {
    id: 'settings',
    targetPage: 'settings',
    label: 'Cài đặt',
    shortLabel: 'Cài đặt',
    mobileLabel: 'Cài đặt',
    matchPages: ['settings'],
  },
] as const;

/**
 * Exact 5 Online Mobile Bottom Bar items per §9.
 */
export const ONLINE_MOBILE_NAV_IDS: readonly OnlineSidebarSectionId[] = [
  'overview',
  'unified_exchange',
  'my_empire',
  'my_assets',
  'world',
] as const;

export interface CareerSidebarSectionSpec {
  id: CareerSidebarSectionId;
  targetPage: NavPage;
  label: string;
  shortLabel: string;
  matchPages: NavPage[];
  recommendedMinChapter: number;
}

/**
 * Exact 6 Career Mode Sidebar items per Career Design System.
 */
export const CAREER_SIDEBAR_SECTIONS: readonly CareerSidebarSectionSpec[] = [
  {
    id: 'career_home',
    targetPage: 'career_home',
    label: 'Hành trình',
    shortLabel: 'Hành trình',
    matchPages: ['career_home'],
    recommendedMinChapter: 1,
  },
  {
    id: 'career_world',
    targetPage: 'career_world',
    label: 'Thành phố',
    shortLabel: 'Thành phố',
    matchPages: ['career_world'],
    recommendedMinChapter: 1,
  },
  {
    id: 'my_empire',
    targetPage: 'my_empire',
    label: 'Doanh nghiệp',
    shortLabel: 'Doanh nghiệp',
    matchPages: ['my_empire', 'business', 'corporate', 'capital_hub', 'company_hq', 'empire_hub', 'funds'],
    recommendedMinChapter: 1,
  },
  {
    id: 'my_assets',
    targetPage: 'my_assets',
    label: 'Tài sản',
    shortLabel: 'Tài sản',
    matchPages: ['my_assets', 'portfolio', 'property', 'banking', 'luxury'],
    recommendedMinChapter: 2,
  },
  {
    id: 'unified_exchange',
    targetPage: 'unified_exchange',
    label: 'Sàn giao dịch',
    shortLabel: 'Sàn',
    matchPages: ['unified_exchange', 'exchange', 'discover', 'futures', 'forex'],
    recommendedMinChapter: 1,
  },
  {
    id: 'career_settings',
    targetPage: 'career_settings',
    label: 'Cài đặt',
    shortLabel: 'Cài đặt',
    matchPages: ['career_settings'],
    recommendedMinChapter: 1,
  },
] as const;

/**
 * Progressive Disclosure chapter guidance (§4.3).
 * Never hard-locks experienced players; highlights what matters right now and keeps advanced tools toggleable.
 */
export interface ChapterFocusGuidance {
  chapterNumber: number;
  focusTitle: string;
  focusSummary: string;
  recommendedEmpireTabs: MyEmpireTab[];
  recommendedAssetsTabs: MyAssetsTab[];
  recommendedExchangeTabs: UnifiedExchangeTab[];
}

export function getChapterFocusGuidance(chapterNumber: number, freePlayUnlocked: boolean): ChapterFocusGuidance {
  if (freePlayUnlocked || chapterNumber >= 6) {
    return {
      chapterNumber: 6,
      focusTitle: 'Toàn bộ hệ thống & Free Play',
      focusSummary: 'Tự do điều hành tập đoàn, quỹ đầu tư, bất động sản và toàn bộ thị trường tài chính.',
      recommendedEmpireTabs: ['hub', 'business', 'corporate', 'cofounder', 'hq', 'funds'],
      recommendedAssetsTabs: ['portfolio', 'property', 'banking', 'luxury'],
      recommendedExchangeTabs: ['discover', 'spot', 'forex', 'futures'],
    };
  }
  switch (chapterNumber) {
    case 1:
      return {
        chapterNumber: 1,
        focusTitle: 'Chương I · Khởi nghiệp & Vốn ban đầu',
        focusSummary: 'Tập trung vào câu chuyện nhân vật, nguồn vốn mặt và chọn ngành nghề mở doanh nghiệp đầu tiên.',
        recommendedEmpireTabs: ['business'],
        recommendedAssetsTabs: ['portfolio'],
        recommendedExchangeTabs: ['discover', 'spot'],
      };
    case 2:
      return {
        chapterNumber: 2,
        focusTitle: 'Chương II · Doanh nghiệp & Vận hành',
        focusSummary: 'Tuyển nhân sự, nâng cấp chất lượng phục vụ và tạo dòng tiền dương từ khách hàng đầu tiên.',
        recommendedEmpireTabs: ['business', 'hq'],
        recommendedAssetsTabs: ['portfolio', 'banking'],
        recommendedExchangeTabs: ['discover', 'spot'],
      };
    case 3:
      return {
        chapterNumber: 3,
        focusTitle: 'Chương III · Góp vốn, Cổ phần & Ngân hàng',
        focusSummary: 'Đàm phán nhà đầu tư, quản trị tỷ lệ sở hữu, mở chi nhánh và tận dụng nguồn vốn ngân hàng.',
        recommendedEmpireTabs: ['business', 'cofounder', 'hq'],
        recommendedAssetsTabs: ['portfolio', 'banking', 'property'],
        recommendedExchangeTabs: ['discover', 'spot'],
      };
    case 4:
      return {
        chapterNumber: 4,
        focusTitle: 'Chương IV · Dòng tiền, Nợ & Quản trị Rủi ro',
        focusSummary: 'Kiểm soát chi phí cố định, dự phòng thanh khoản và tái cơ cấu vượt qua chu kỳ suy thoái.',
        recommendedEmpireTabs: ['business', 'corporate', 'hq'],
        recommendedAssetsTabs: ['banking', 'portfolio', 'property'],
        recommendedExchangeTabs: ['discover', 'spot', 'forex'],
      };
    default:
      return {
        chapterNumber: 5,
        focusTitle: 'Chương V · Quỹ đầu tư, Tập đoàn & Thương vụ',
        focusSummary: 'Mở rộng thành tập đoàn đa ngành, góp vốn quỹ đầu tư, thương vụ M&A và liên minh chiến lược.',
        recommendedEmpireTabs: ['hub', 'business', 'corporate', 'cofounder', 'hq', 'funds'],
        recommendedAssetsTabs: ['portfolio', 'property', 'banking', 'luxury'],
        recommendedExchangeTabs: ['discover', 'spot', 'forex', 'futures'],
      };
  }
}

export interface SmartMissionDirective {
  primaryLabel: string;
  actionType: 'TRIGGER_SCENE' | 'OPEN_BUSINESS_WIZARD' | 'OPEN_BUSINESS_TAB' | 'OPEN_ROUTE' | 'OPEN_ENDING';
  sceneId?: string;
  targetPage?: NavPage;
  businessTab?: BusinessTycoonTab;
  openWizard?: boolean;
  hintText: string;
}

/**
 * Smart Mission Flow resolver (§4.2 & §4.4):
 * Produces contextual, specific primary CTAs and direct deep-link targets instead of generic labels.
 */
export function resolveSmartMissionDirective(params: {
  mission: StoryMissionSpec;
  sceneQueue: string[];
  pendingAppointmentSceneId?: string | null;
  pendingAppointmentNpcName?: string | null;
  directorState: string;
  freePlayUnlocked: boolean;
  hasAnyBusiness: boolean;
}): SmartMissionDirective {
  const {
    mission,
    sceneQueue,
    pendingAppointmentSceneId,
    pendingAppointmentNpcName,
    directorState,
    freePlayUnlocked,
    hasAnyBusiness,
  } = params;

  if (directorState === 'CAMPAIGN_COMPLETED' && !freePlayUnlocked) {
    return {
      primaryLabel: 'Chọn Di sản & Mở khóa Free Play',
      actionType: 'OPEN_ENDING',
      hintText: 'Chiến dịch chính đã hoàn tất. Hãy khắc tên di sản của bạn để tiếp tục Free Play.',
    };
  }

  if (sceneQueue.length > 0) {
    return {
      primaryLabel: mission.ctaLabel || 'Tiếp tục cuộc trò chuyện',
      actionType: 'TRIGGER_SCENE',
      sceneId: sceneQueue[0],
      hintText: mission.objectiveLabel,
    };
  }

  const isSceneDriven =
    mission.objectiveType === 'COMPLETE_SCENE' ||
    mission.objectiveType === 'RESOLVE_INVESTOR_OFFER' ||
    mission.objectiveType === 'RESOLVE_HUY_ALLIANCE' ||
    mission.objectiveType === 'COMPLETE_ENDING';

  if (isSceneDriven && mission.introSceneId) {
    return {
      primaryLabel: mission.ctaLabel,
      actionType: 'TRIGGER_SCENE',
      sceneId: mission.introSceneId,
      hintText: mission.objectiveLabel,
    };
  }

  if (pendingAppointmentSceneId) {
    return {
      primaryLabel: pendingAppointmentNpcName ? `Gặp ${pendingAppointmentNpcName}` : 'Tham dự cuộc hẹn',
      actionType: 'TRIGGER_SCENE',
      sceneId: pendingAppointmentSceneId,
      hintText: 'Bạn đang có lịch hẹn quan trọng đang chờ.',
    };
  }

  // Gameplay-driven missions deep-link directly to the exact flow or tab!
  switch (mission.objectiveType) {
    case 'OWN_BUSINESS_COUNT':
      if (!hasAnyBusiness) {
        return {
          primaryLabel: 'Thành lập doanh nghiệp đầu tiên',
          actionType: 'OPEN_BUSINESS_WIZARD',
          targetPage: 'business',
          openWizard: true,
          hintText: 'Mở quy trình 3 bước chọn ngành nghề, tên thương hiệu và ngân sách khởi nghiệp.',
        };
      }
      return {
        primaryLabel: 'Mở bảng điều hành doanh nghiệp',
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'OVERVIEW',
        hintText: mission.objectiveLabel,
      };
    case 'HIRE_EMPLOYEES_OR_UPGRADE':
      return {
        primaryLabel: 'Tuyển nhân sự & Nâng cấp cơ sở',
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'OPERATIONS',
        hintText: 'Đi thẳng tới khu Vận hành để tuyển nhân sự hoặc mở khóa nâng cấp.',
      };
    case 'COMPLETE_BUSINESS_CYCLE':
    case 'EXPERIENCE_RECESSION_CYCLE':
      return {
        primaryLabel: 'Theo dõi & vận hành chu kỳ kinh doanh',
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'OVERVIEW',
        hintText: 'Theo dõi doanh thu, chi phí và lợi nhuận thực tế sau chu kỳ vận hành.',
      };
    case 'BUSINESS_STRATEGY_ACTION':
    case 'RESTRUCTURE_OR_RESERVE':
      return {
        primaryLabel: mission.objectiveType === 'RESTRUCTURE_OR_RESERVE' ? 'Tái cơ cấu & giữ dòng tiền' : 'Điều chỉnh chiến lược cạnh tranh',
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'OPERATIONS',
        hintText: mission.objectiveLabel,
      };
    case 'REVIEW_OR_VALUE_COMPANY':
    case 'POSITIVE_CASHFLOW_OR_CASH_TARGET':
      return {
        primaryLabel: mission.ctaLabel,
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'FINANCE',
        hintText: mission.objectiveLabel,
      };
    case 'EXPAND_BRANCH_OR_UPGRADE':
      return {
        primaryLabel: 'Nâng cấp cấp độ & Mở chi nhánh',
        actionType: 'OPEN_BUSINESS_TAB',
        targetPage: 'business',
        businessTab: 'GROWTH',
        hintText: mission.objectiveLabel,
      };
    default:
      if (mission.targetRoute && mission.targetRoute !== 'career_home') {
        return {
          primaryLabel: mission.ctaLabel,
          actionType: 'OPEN_ROUTE',
          targetPage: mission.targetRoute,
          hintText: mission.objectiveLabel,
        };
      }
      return {
        primaryLabel: mission.ctaLabel || 'Tiếp tục hành trình',
        actionType: 'TRIGGER_SCENE',
        sceneId: mission.introSceneId,
        hintText: mission.objectiveLabel,
      };
  }
}
