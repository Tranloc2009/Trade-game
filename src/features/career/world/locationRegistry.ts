import type {
  CareerStoryState,
  NpcCharacterId,
  PhoneAppointment,
  SceneBackgroundKey,
  StoryMissionSpec,
} from '../../../../shared/contracts/careerStory';
import type { GameClock } from '../../../../shared/contracts/types';
import type { BusinessEntity, BusinessCatalogItem } from '../../../../shared/contracts/v4';
import type { BusinessTycoonTab, NavPage } from '../../../lib/navigation';

export type SaigonLocationId =
  | 'apartment'
  | 'coffee_shop'
  | 'company'
  | 'bank'
  | 'financial_district'
  | 'corporate_tower'
  | 'showroom';

export type LocationAvailabilityState =
  | 'APPOINTMENT'
  | 'MISSION_TARGET'
  | 'PLAYER_BUSINESS'
  | 'AVAILABLE'
  | 'UNINTRODUCED';

export interface LocationActionOption {
  id: string;
  label: string;
  description: string;
  kind: 'TRIGGER_SCENE' | 'NAVIGATE' | 'OPEN_WIZARD' | 'OPEN_BUSINESS';
  sceneId?: string;
  targetPage?: NavPage;
  businessId?: string;
  businessTab?: BusinessTycoonTab;
  primary?: boolean;
}

export interface LocationNpcPresence {
  npcId: NpcCharacterId;
  presenceKind: 'APPOINTMENT_READY' | 'ACTIVE_MISSION' | 'REGULAR';
  statusText: string;
  sceneId?: string;
}

export interface SaigonLocationSpec {
  id: SaigonLocationId;
  name: string;
  shortName: string;
  district: string;
  subtitle: string;
  description: string;
  /** Unified 1600x900 isometric map coordinate system */
  mapX: number;
  mapY: number;
  backgroundKey: SceneBackgroundKey;
  districtImageKey?: 'financial' | 'luxuryBay' | 'riverside' | 'landmark';
  regularNpcIds: NpcCharacterId[];
  minIntroChapter: number;
  primaryRoute: NavPage;
  secondaryRoute?: NavPage;
  keywords: string[];
}

export const MAP_WORLD_WIDTH = 1600;
export const MAP_WORLD_HEIGHT = 900;

/**
 * Single Source of Truth for all 7 Living City locations in Ho Chi Minh City (Saigon).
 * Coordinates (mapX, mapY) are calibrated directly to the 1600x900 isometric city artwork
 * so markers sit directly on architectural landmarks with zero drift on zoom/resize.
 */
export const SAIGON_LOCATIONS: SaigonLocationSpec[] = [
  {
    id: 'apartment',
    name: 'Căn hộ Khởi nghiệp',
    shortName: 'Nhà riêng',
    district: 'Bình Thạnh',
    subtitle: 'Điểm xuất phát & nghỉ ngơi',
    description:
      'Căn hộ nhỏ nhìn ra thành phố nơi bạn đọc tin nhắn buổi sáng, theo dõi tiến trình sự nghiệp và chuẩn bị cho những quyết định lớn.',
    mapX: 280,
    mapY: 225,
    backgroundKey: 'apartment',
    regularNpcIds: ['minh_quan'],
    minIntroChapter: 1,
    primaryRoute: 'career_home',
    keywords: ['nhà', 'căn hộ', 'khởi đầu', 'bình thạnh', 'hành trình'],
  },
  {
    id: 'coffee_shop',
    name: 'Quán cà phê Quận 1',
    shortName: 'Quán cà phê',
    district: 'Quận 1 · Nguyễn Huệ',
    subtitle: 'Điểm hẹn cố vấn & đồng sáng lập',
    description:
      'Góc quán quen dưới tán cây trung tâm Quận 1 — nơi chú Minh Quân và Trần Gia Hân thường hẹn gặp để bàn chiến lược khởi nghiệp.',
    mapX: 445,
    mapY: 435,
    backgroundKey: 'coffee_shop',
    regularNpcIds: ['minh_quan', 'gia_han'],
    minIntroChapter: 1,
    primaryRoute: 'career_home',
    keywords: ['cà phê', 'cafe', 'minh quân', 'gia hân', 'cuộc hẹn', 'quận 1'],
  },
  {
    id: 'company',
    name: 'Khu Khởi nghiệp & Doanh nghiệp',
    shortName: 'Khu Khởi nghiệp',
    district: 'Quận 1 · Trung tâm Đổi mới',
    subtitle: 'Khởi lập và điều hành công ty của bạn',
    description:
      'Khu văn phòng năng động quy tụ các doanh nghiệp trẻ tại Sài Gòn. Mở công ty đầu tiên, tuyển nhân sự, nâng cấp cơ sở và theo dõi dòng tiền thực tế.',
    mapX: 805,
    mapY: 460,
    backgroundKey: 'startup_office',
    regularNpcIds: ['gia_han', 'thao_linh'],
    minIntroChapter: 1,
    primaryRoute: 'business',
    keywords: ['công ty', 'doanh nghiệp', 'khởi nghiệp', 'văn phòng', 'startup'],
  },
  {
    id: 'bank',
    name: 'Ngân hàng Thương mại',
    shortName: 'Ngân hàng',
    district: 'Quận 1 · Trục Tài chính',
    subtitle: 'Gửi tiết kiệm & Tín dụng doanh nghiệp',
    description:
      'Trụ sở ngân hàng thương mại phục vụ tài khoản tiết kiệm sinh lãi, khoản vay vốn lưu động và quản lý nghĩa vụ nợ an toàn.',
    mapX: 905,
    mapY: 165,
    backgroundKey: 'boardroom',
    regularNpcIds: ['thao_linh'],
    minIntroChapter: 1,
    primaryRoute: 'banking',
    keywords: ['ngân hàng', 'vay', 'tiết kiệm', 'tín dụng', 'thương mại'],
  },
  {
    id: 'financial_district',
    name: 'Khu Tài chính & Sàn Giao dịch',
    shortName: 'Khu Tài chính',
    district: 'Quận 1 · Phố Wall Sài Gòn',
    subtitle: 'Cổ phiếu, Crypto, Forex & Futures',
    description:
      'Cụm cao ốc tài chính sôi động nơi hội tụ bảng điện Cổ phiếu, Crypto, tỷ giá Forex và hợp đồng phái sinh Futures.',
    mapX: 1265,
    mapY: 185,
    backgroundKey: 'crisis_office',
    districtImageKey: 'financial',
    regularNpcIds: ['thao_linh', 'hoang_nam'],
    minIntroChapter: 1,
    primaryRoute: 'unified_exchange',
    secondaryRoute: 'portfolio',
    keywords: ['sàn', 'giao dịch', 'cổ phiếu', 'crypto', 'forex', 'futures', 'tài chính'],
  },
  {
    id: 'corporate_tower',
    name: 'Tháp Tập đoàn Thủ Thiêm',
    shortName: 'Tháp Thủ Thiêm',
    district: 'Thủ Thiêm · Ven sông',
    subtitle: 'Gọi vốn, M&A & Liên minh chiến lược',
    description:
      'Tháp văn phòng hạng A bên kia cầu Thủ Thiêm — nơi diễn ra các thương vụ gọi vốn cùng Lê Hoàng Nam, đàm phán đối thủ và mở rộng quy mô tập đoàn.',
    mapX: 1465,
    mapY: 415,
    backgroundKey: 'thuthiem_district',
    regularNpcIds: ['hoang_nam', 'duc_huy'],
    minIntroChapter: 2,
    primaryRoute: 'corporate',
    secondaryRoute: 'funds',
    keywords: ['tập đoàn', 'thủ thiêm', 'hoàng nam', 'đức huy', 'm&a', 'gọi vốn', 'quỹ'],
  },
  {
    id: 'showroom',
    name: 'Showroom & Bến Du thuyền',
    shortName: 'Bến Du thuyền',
    district: 'Ven sông Sài Gòn',
    subtitle: 'Bất động sản Việt Nam & Tài sản Cao cấp',
    description:
      'Khu ven sông cao cấp kết hợp trung tâm giao dịch Bất động sản Việt Nam và Showroom siêu xe, du thuyền, bộ sưu tập đẳng cấp.',
    mapX: 1090,
    mapY: 695,
    backgroundKey: 'saigon_river_hq',
    districtImageKey: 'luxuryBay',
    regularNpcIds: ['hoang_nam'],
    minIntroChapter: 2,
    primaryRoute: 'property',
    secondaryRoute: 'luxury',
    keywords: ['showroom', 'du thuyền', 'bất động sản', 'siêu xe', 'ven sông', 'tài sản cao cấp'],
  },
];

export const LOCATION_BY_ID: Record<SaigonLocationId, SaigonLocationSpec> = SAIGON_LOCATIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<SaigonLocationId, SaigonLocationSpec>,
);

/**
 * Exhaustive Scene ID -> SaigonLocationId mapping.
 * Ensures every appointment and story scene resolves to its genuine narrative venue.
 */
export const SCENE_TO_LOCATION_MAP: Record<string, SaigonLocationId> = {
  scene_01_opening: 'apartment',
  scene_03_first_meeting: 'coffee_shop',
  scene_04_first_capital: 'coffee_shop',
  scene_05_gia_han_meeting: 'coffee_shop',
  scene_ch1_outro: 'apartment',
  scene_ch2_opening: 'company',
  scene_ch2_first_revenue: 'company',
  scene_ch2_duc_huy_rival: 'company',
  scene_ch2_outro: 'company',
  scene_ch3_nam_invite: 'corporate_tower',
  scene_ch3_valuation_review: 'company',
  scene_ch3_negotiation: 'corporate_tower',
  scene_ch3_conflict: 'company',
  scene_ch3_outro: 'financial_district',
  scene_ch4_black_monday: 'company',
  scene_ch4_secret: 'coffee_shop',
  scene_ch4_outro: 'financial_district',
  scene_ch5_awakening: 'financial_district',
  scene_ch5_huy_alliance: 'corporate_tower',
  scene_ch5_nam_reunion: 'corporate_tower',
  scene_ch5_outro: 'corporate_tower',
  scene_ch6_return_cafe: 'coffee_shop',
  scene_ch6_reflection: 'corporate_tower',
  scene_ch6_vision: 'corporate_tower',
  scene_ch6_legacy_finale: 'coffee_shop',
};

export function resolveLocationForScene(sceneId: string | null | undefined): SaigonLocationId {
  if (!sceneId) return 'coffee_shop';
  return SCENE_TO_LOCATION_MAP[sceneId] ?? 'coffee_shop';
}

export function resolveLocationForAppointment(
  appointment: Pick<PhoneAppointment, 'sceneId' | 'location'>,
): SaigonLocationId {
  if (appointment.sceneId && SCENE_TO_LOCATION_MAP[appointment.sceneId]) {
    return SCENE_TO_LOCATION_MAP[appointment.sceneId];
  }
  const lower = appointment.location.toLowerCase();
  if (lower.includes('cà phê') || lower.includes('cafe')) return 'coffee_shop';
  if (lower.includes('thủ thiêm') || lower.includes('nhà đầu tư') || lower.includes('tập đoàn')) {
    return 'corporate_tower';
  }
  if (lower.includes('ngân hàng')) return 'bank';
  if (lower.includes('tài chính') || lower.includes('sàn')) return 'financial_district';
  if (lower.includes('du thuyền') || lower.includes('showroom') || lower.includes('bất động sản')) {
    return 'showroom';
  }
  if (lower.includes('văn phòng') || lower.includes('công ty') || lower.includes('doanh nghiệp')) {
    return 'company';
  }
  return 'apartment';
}

/**
 * Dynamically maps ANY of the 30 campaign missions (M01..M30) to its genuine Living City location
 * based on uncompleted introSceneId, active appointments, objectiveType, and targetRoute.
 * Zero broken hardcoded overrides!
 */
export function resolveLocationForMission(
  mission: StoryMissionSpec | null | undefined,
  careerStory?: Pick<CareerStoryState, 'completedSceneIds' | 'appointments' | 'freePlayUnlocked'> | null,
): SaigonLocationId {
  if (!mission) return 'company';
  if (careerStory?.freePlayUnlocked) return 'company';

  const completedScenes = careerStory?.completedSceneIds ?? [];

  // 1. If the mission has an uncompleted introSceneId, direct player to that scene's true location
  if (mission.introSceneId && !completedScenes.includes(mission.introSceneId)) {
    return resolveLocationForScene(mission.introSceneId);
  }

  // 2. If there is an active uncompleted appointment matching this mission's intro/completion scene
  const matchingAppt = careerStory?.appointments?.find(
    (a) => !a.completed && (a.sceneId === mission.introSceneId || a.sceneId === mission.completionSceneId),
  );
  if (matchingAppt) {
    return resolveLocationForAppointment(matchingAppt);
  }

  // 3. Derive strictly from objectiveType and targetRoute
  switch (mission.objectiveType) {
    case 'COMPLETE_SCENE':
    case 'COMPLETE_ENDING':
      return resolveLocationForScene(mission.introSceneId ?? mission.completionSceneId);

    case 'OWN_BUSINESS_COUNT':
    case 'HIRE_EMPLOYEES_OR_UPGRADE':
    case 'COMPLETE_BUSINESS_CYCLE':
    case 'BUSINESS_STRATEGY_ACTION':
    case 'POSITIVE_CASHFLOW_OR_CASH_TARGET':
    case 'REVIEW_OR_VALUE_COMPANY':
    case 'EXPAND_BRANCH_OR_UPGRADE':
    case 'EXPERIENCE_RECESSION_CYCLE':
    case 'RESTRUCTURE_OR_RESERVE':
    case 'SURVIVE_STORM_OR_COMEBACK':
    case 'LEGACY_PROJECT_ACTION':
      return 'company';

    case 'DEBT_OR_CASHFLOW_AUDIT':
      return mission.targetRoute === 'banking' ? 'bank' : 'company';

    case 'RESOLVE_INVESTOR_OFFER':
    case 'RESOLVE_HUY_ALLIANCE':
    case 'GOVERNANCE_OR_DIVIDEND_ACTION':
      return 'corporate_tower';

    case 'POST_CRISIS_TRADE_OR_INVEST':
      return 'financial_district';

    case 'EXPAND_EMPIRE_ASSET':
      return mission.targetRoute === 'property' ? 'showroom' : 'financial_district';

    default:
      break;
  }

  switch (mission.targetRoute) {
    case 'business':
      return 'company';
    case 'exchange':
    case 'portfolio':
      return 'financial_district';
    case 'banking':
      return 'bank';
    case 'corporate':
    case 'funds':
      return 'corporate_tower';
    case 'property':
      return 'showroom';
    default:
      return 'coffee_shop';
  }
}

/**
 * Human-readable Vietnamese relationship stage derived cleanly from real server trust & met flags.
 */
export function resolveRelationshipStageLabel(
  trust: number,
  met: boolean,
  roleInPlayerStory?: string,
): { label: string; tone: 'neutral' | 'negative' | 'accent' | 'positive' } {
  if (!met) {
    return { label: 'Chưa gặp mặt', tone: 'neutral' };
  }
  if (trust < 30) {
    return { label: 'Đang bất đồng', tone: 'negative' };
  }
  if (trust >= 80) {
    return { label: 'Đồng minh', tone: 'positive' };
  }
  if (trust >= 62) {
    return { label: 'Tin tưởng', tone: 'positive' };
  }
  if (
    trust >= 45 ||
    (roleInPlayerStory &&
      (roleInPlayerStory.toLowerCase().includes('đối tác') ||
        roleInPlayerStory.toLowerCase().includes('đồng sáng lập')))
  ) {
    return { label: 'Đối tác', tone: 'accent' };
  }
  return { label: 'Mới quen', tone: 'neutral' };
}

export interface ResolvedLocationView {
  spec: SaigonLocationSpec;
  displayName: string;
  displayShortName: string;
  displaySubtitle: string;
  displayDescription: string;
  state: LocationAvailabilityState;
  stateLabel: string;
  isMissionTarget: boolean;
  hasAppointment: boolean;
  appointment: PhoneAppointment | null;
  queuedSceneId: string | null;
  playerBusinessesHere: BusinessEntity[];
  visibleNpcs: LocationNpcPresence[];
  actions: LocationActionOption[];
}

export function resolveLocationView(params: {
  location: SaigonLocationSpec;
  careerStory: CareerStoryState | null;
  activeMission: StoryMissionSpec | null;
  missionLocationId: SaigonLocationId | null;
  playerBusinesses: BusinessEntity[];
}): ResolvedLocationView {
  const { location, careerStory, activeMission, missionLocationId, playerBusinesses } = params;
  const completedScenes = careerStory?.completedSceneIds ?? [];
  const currentChapter = careerStory?.currentChapter ?? 1;

  // Strictly match ONLY appointments belonging to THIS location
  const matchingAppt =
    careerStory?.appointments.find(
      (a) => !a.completed && resolveLocationForAppointment(a) === location.id,
    ) ?? null;

  // Strictly match ONLY queued scenes belonging to THIS location (never arbitrary sceneQueue[0]!)
  const matchingQueuedScene =
    careerStory?.sceneQueue.find(
      (sid) => !completedScenes.includes(sid) && resolveLocationForScene(sid) === location.id,
    ) ?? null;

  const isMissionTarget =
    Boolean(!careerStory?.freePlayUnlocked && missionLocationId === location.id);

  // If the active mission belongs here and has an uncompleted introSceneId, expose it cleanly
  const missionIntroSceneHere =
    isMissionTarget &&
    activeMission?.introSceneId &&
    !completedScenes.includes(activeMission.introSceneId) &&
    resolveLocationForScene(activeMission.introSceneId) === location.id
      ? activeMission.introSceneId
      : null;

  const triggerableSceneId = matchingAppt?.sceneId ?? matchingQueuedScene ?? missionIntroSceneHere;

  // Player businesses appear on 'company' (Startup/HQ zone)
  const playerBusinessesHere = location.id === 'company' ? playerBusinesses : [];
  const hasOwnedCompany = playerBusinesses.length > 0;

  // Dynamic naming for Startup Zone vs Owned Company HQ
  let displayName = location.name;
  let displayShortName = location.shortName;
  let displaySubtitle = location.subtitle;
  let displayDescription = location.description;

  if (location.id === 'company') {
    if (hasOwnedCompany) {
      const primaryBiz = playerBusinesses[0];
      displayName =
        playerBusinesses.length === 1
          ? primaryBiz.businessName
          : `${primaryBiz.businessName} (+${playerBusinesses.length - 1})`;
      displayShortName = primaryBiz.businessName.length > 18
        ? `${primaryBiz.businessName.slice(0, 16)}…`
        : primaryBiz.businessName;
      displaySubtitle = `Trụ sở doanh nghiệp của bạn · Lv.${primaryBiz.level}`;
      displayDescription = `Điều hành trực tiếp ${primaryBiz.businessName} (${primaryBiz.businessTypeName}) — quản lý nhân sự, mở rộng công suất, nâng cấp cơ sở và theo dõi dòng tiền từng kỳ.`;
    } else {
      displayName = 'Khu Khởi nghiệp Sài Gòn';
      displayShortName = 'Khu Khởi nghiệp';
      displaySubtitle = 'Cơ hội thành lập công ty đầu tiên';
      displayDescription =
        'Bạn chưa có doanh nghiệp riêng. Đây là khu văn phòng khởi nghiệp nơi bạn có thể chọn ngành nghề phù hợp số vốn và chính thức khai trương công ty đầu tiên.';
    }
  }

  // Determine exact location availability state
  let state: LocationAvailabilityState = 'AVAILABLE';
  let stateLabel = 'Sẵn sàng ghé thăm';

  if (matchingAppt || triggerableSceneId) {
    state = 'APPOINTMENT';
    stateLabel = matchingAppt ? 'Có lịch hẹn' : 'Có sự kiện câu chuyện';
  } else if (isMissionTarget) {
    state = 'MISSION_TARGET';
    stateLabel = 'Mục tiêu hiện tại';
  } else if (playerBusinessesHere.length > 0) {
    state = 'PLAYER_BUSINESS';
    stateLabel = 'Trụ sở của bạn';
  } else if (currentChapter < location.minIntroChapter) {
    state = 'UNINTRODUCED';
    stateLabel = `Mở rộng ở Chương ${location.minIntroChapter}`;
  }

  // Resolve visible NPCs WITHOUT spoiling unmet future NPCs
  const visibleNpcs: LocationNpcPresence[] = [];
  const seenNpcs = new Set<NpcCharacterId>();

  if (matchingAppt) {
    seenNpcs.add(matchingAppt.npcId);
    visibleNpcs.push({
      npcId: matchingAppt.npcId,
      presenceKind: 'APPOINTMENT_READY',
      statusText: 'Đang chờ gặp bạn ngay lúc này',
      sceneId: matchingAppt.sceneId,
    });
  }

  if (isMissionTarget && activeMission && !seenNpcs.has(activeMission.featuredNpcId)) {
    const rel = careerStory?.relationships[activeMission.featuredNpcId];
    if (rel?.met || triggerableSceneId) {
      seenNpcs.add(activeMission.featuredNpcId);
      visibleNpcs.push({
        npcId: activeMission.featuredNpcId,
        presenceKind: 'ACTIVE_MISSION',
        statusText: triggerableSceneId ? 'Có cuộc trao đổi mới' : 'Liên quan mục tiêu hiện tại',
        sceneId: triggerableSceneId ?? undefined,
      });
    }
  }

  for (const npcId of location.regularNpcIds) {
    if (seenNpcs.has(npcId)) continue;
    const rel = careerStory?.relationships[npcId];
    // Strict anti-spoiler rule: only show regular presence if player has already met this NPC
    if (!rel?.met) continue;
    seenNpcs.add(npcId);
    visibleNpcs.push({
      npcId,
      presenceKind: 'REGULAR',
      statusText: 'Thường ghé địa điểm này',
    });
  }

  // Build multi-action options per location
  const actions: LocationActionOption[] = [];

  if (triggerableSceneId) {
    actions.push({
      id: `scene_${triggerableSceneId}`,
      label: matchingAppt ? 'Gặp nhân vật tại cuộc hẹn' : 'Bắt đầu phân cảnh tại đây',
      description: matchingAppt ? matchingAppt.title : 'Tiếp tục diễn biến câu chuyện tại địa điểm này',
      kind: 'TRIGGER_SCENE',
      sceneId: triggerableSceneId,
      primary: true,
    });
  }

  switch (location.id) {
    case 'apartment':
      actions.push({
        id: 'go_career_home',
        label: 'Về bàn làm việc & Hành trình',
        description: 'Xem tóm tắt chương truyện, mục tiêu tiếp theo và ghi chú',
        kind: 'NAVIGATE',
        targetPage: 'career_home',
        primary: actions.length === 0,
      });
      break;

    case 'coffee_shop':
      if (!triggerableSceneId) {
        actions.push({
          id: 'cafe_return_home',
          label: 'Xem lịch hẹn & Hành trình',
          description: 'Hiện chưa có cuộc hẹn mới tại quán cà phê',
          kind: 'NAVIGATE',
          targetPage: 'career_home',
          primary: true,
        });
      }
      break;

    case 'company':
      if (hasOwnedCompany) {
        actions.push({
          id: 'open_primary_company',
          label: `Điều hành ${playerBusinesses[0].businessName}`,
          description: 'Mở bảng quản trị công ty, nhân sự và dòng tiền',
          kind: 'OPEN_BUSINESS',
          businessId: playerBusinesses[0].id,
          businessTab: 'OVERVIEW',
          primary: actions.length === 0,
        });
        actions.push({
          id: 'open_new_company_wizard',
          label: 'Thành lập thêm doanh nghiệp',
          description: 'Mở thêm công ty mới để mở rộng danh mục kinh doanh',
          kind: 'OPEN_WIZARD',
        });
      } else {
        actions.push({
          id: 'start_first_company',
          label: 'Thành lập doanh nghiệp đầu tiên',
          description: 'Mở quy trình 3 bước chọn ngành, đặt tên và cấp vốn khởi đầu',
          kind: 'OPEN_WIZARD',
          primary: actions.length === 0,
        });
        actions.push({
          id: 'browse_business_market',
          label: 'Khảo sát khu doanh nghiệp',
          description: 'Xem các mô hình kinh doanh đang hoạt động trên thị trường',
          kind: 'NAVIGATE',
          targetPage: 'business',
        });
      }
      break;

    case 'bank':
      actions.push({
        id: 'open_commercial_bank',
        label: 'Vào Ngân hàng Thương mại',
        description: 'Gửi tiết kiệm sinh lãi, vay vốn và theo dõi lịch trả nợ',
        kind: 'NAVIGATE',
        targetPage: 'banking',
        primary: actions.length === 0,
      });
      break;

    case 'financial_district':
      actions.push({
        id: 'open_unified_exchange',
        label: 'Mở Sàn Giao dịch',
        description: 'Giao dịch Cổ phiếu, Crypto, Forex và Futures',
        kind: 'NAVIGATE',
        targetPage: 'unified_exchange',
        primary: actions.length === 0,
      });
      actions.push({
        id: 'open_portfolio',
        label: 'Xem Danh mục Tài sản',
        description: 'Kiểm tra tiền mặt, cổ phiếu đang nắm giữ và định giá tổng',
        kind: 'NAVIGATE',
        targetPage: 'portfolio',
      });
      break;

    case 'corporate_tower':
      actions.push({
        id: 'open_corporate_board',
        label: 'Vào Quản trị Tập đoàn & M&A',
        description: 'Theo dõi cổ đông, định giá công ty và cơ hội gọi vốn',
        kind: 'NAVIGATE',
        targetPage: 'corporate',
        primary: actions.length === 0,
      });
      actions.push({
        id: 'open_investment_funds',
        label: 'Mở Quỹ Đầu tư',
        description: 'Góp vốn vào các quỹ hoặc thành lập quỹ đầu tư mới',
        kind: 'NAVIGATE',
        targetPage: 'funds',
      });
      break;

    case 'showroom':
      actions.push({
        id: 'open_vn_property',
        label: 'Bất động sản Việt Nam',
        description: 'Mua nhà phố, căn hộ ven sông và thu dòng tiền cho thuê',
        kind: 'NAVIGATE',
        targetPage: 'property',
        primary: actions.length === 0,
      });
      actions.push({
        id: 'open_luxury_showroom',
        label: 'Showroom Tài sản Cao cấp',
        description: 'Tham quan siêu xe, du thuyền và bộ sưu tập giá trị',
        kind: 'NAVIGATE',
        targetPage: 'luxury',
      });
      break;
  }

  return {
    spec: location,
    displayName,
    displayShortName,
    displaySubtitle,
    displayDescription,
    state,
    stateLabel,
    isMissionTarget,
    hasAppointment: Boolean(matchingAppt),
    appointment: matchingAppt,
    queuedSceneId: matchingQueuedScene,
    playerBusinessesHere,
    visibleNpcs,
    actions,
  };
}

export type CityTimePeriod = 'MORNING' | 'NOON' | 'SUNSET' | 'NIGHT';

export interface CityLightingState {
  period: CityTimePeriod;
  labelVi: string;
  timeText: string;
  /** Subtle transparent atmospheric tint over the natural illustrated map — NEVER turns map murky/muddy */
  overlayCss: string;
  skyBadgeColor: string;
}

/**
 * Syncs city lighting overlay with the real authoritative GameClock.
 * Pure visual atmosphere: never alters economy tick rates or revenue formulas.
 */
export function resolveCityTimeOfDay(gameClock: GameClock | null | undefined): CityLightingState {
  let hour = 9;
  const timeText = gameClock?.formattedGameTime ?? 'Ngày 1 · 09:00';

  if (gameClock) {
    if (typeof gameClock.gameHour === 'number' && Number.isFinite(gameClock.gameHour)) {
      hour = gameClock.gameHour;
    } else {
      const hhmmMatch = gameClock.formattedGameTime?.match(/(\d{1,2}):(\d{2})/);
      if (hhmmMatch) {
        const parsedHour = Number(hhmmMatch[1]);
        if (Number.isFinite(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
          hour = parsedHour;
        }
      }
    }
  }

  if (hour >= 5 && hour < 11) {
    return {
      period: 'MORNING',
      labelVi: 'Buổi sáng',
      timeText,
      overlayCss: 'linear-gradient(135deg, rgba(255, 232, 185, 0.08) 0%, rgba(255, 255, 255, 0) 60%)',
      skyBadgeColor: '#F5B942',
    };
  }
  if (hour >= 11 && hour < 16) {
    return {
      period: 'NOON',
      labelVi: 'Ban trưa',
      timeText,
      overlayCss: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(0, 0, 0, 0) 55%)',
      skyBadgeColor: '#38BDF8',
    };
  }
  if (hour >= 16 && hour < 19) {
    return {
      period: 'SUNSET',
      labelVi: 'Hoàng hôn',
      timeText,
      overlayCss:
        'linear-gradient(180deg, rgba(234, 118, 52, 0.16) 0%, rgba(168, 72, 48, 0.12) 55%, rgba(22, 24, 42, 0.22) 100%)',
      skyBadgeColor: '#FB923C',
    };
  }
  return {
    period: 'NIGHT',
    labelVi: 'Đêm Sài Gòn',
    timeText,
    overlayCss:
      'linear-gradient(180deg, rgba(12, 20, 42, 0.34) 0%, rgba(15, 24, 48, 0.28) 60%, rgba(10, 15, 32, 0.42) 100%)',
    skyBadgeColor: '#93C5FD',
  };
}

/**
 * Clamps map pan & zoom transforms so the 1600x900 illustrated Saigon map
 * always covers its viewport cleanly without disappearing offscreen or drifting markers.
 */
export function clampMapTransform(params: {
  tx: number;
  ty: number;
  scale: number;
  viewportW: number;
  viewportH: number;
  worldW?: number;
  worldH?: number;
  minScaleFloor?: number;
  maxScale?: number;
}): { tx: number; ty: number; scale: number; minScale: number } {
  const worldW = params.worldW ?? MAP_WORLD_WIDTH;
  const worldH = params.worldH ?? MAP_WORLD_HEIGHT;
  const vw = Math.max(200, params.viewportW);
  const vh = Math.max(200, params.viewportH);

  // Fit-cover scale so there are never ugly black bars when zoomed out
  const coverScale = Math.max(vw / worldW, vh / worldH);
  const minScale = Math.max(params.minScaleFloor ?? 0.55, coverScale);
  const maxScale = Math.max(minScale * 2.1, params.maxScale ?? 2.0);
  const scale = Math.min(maxScale, Math.max(minScale, params.scale));

  const scaledW = worldW * scale;
  const scaledH = worldH * scale;

  const minTx = Math.min(0, vw - scaledW);
  const maxTx = scaledW < vw ? (vw - scaledW) / 2 : 0;
  const minTy = Math.min(0, vh - scaledH);
  const maxTy = scaledH < vh ? (vh - scaledH) / 2 : 0;

  const tx = Math.min(maxTx, Math.max(minTx, params.tx));
  const ty = Math.min(maxTy, Math.max(minTy, params.ty));

  return { tx, ty, scale, minScale };
}

/**
 * Computes the exact transform (tx, ty) to smoothly center a given (mapX, mapY)
 * inside the current map viewport.
 */
export function focusMapPoint(params: {
  mapX: number;
  mapY: number;
  scale: number;
  viewportW: number;
  viewportH: number;
  worldW?: number;
  worldH?: number;
}): { tx: number; ty: number; scale: number; minScale: number } {
  const rawTx = params.viewportW / 2 - params.mapX * params.scale;
  const rawTy = params.viewportH / 2 - params.mapY * params.scale;
  return clampMapTransform({
    tx: rawTx,
    ty: rawTy,
    scale: params.scale,
    viewportW: params.viewportW,
    viewportH: params.viewportH,
    worldW: params.worldW,
    worldH: params.worldH,
  });
}

export interface BusinessActionRecommendation {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  reason: string;
  estimatedCostText: string;
  affectedMetric: string;
  actionLabel: string;
  targetTab: BusinessTycoonTab;
}

/**
 * Pure real-data "Việc cần làm" recommendation builder for Business Tycoon.
 * Only inspects actual server BusinessEntity fields — zero fabricated metrics, zero auto-purchase.
 */
export function buildBusinessActionItems(
  business: BusinessEntity | null | undefined,
  nextLevelUpgradeCostCR?: number | null,
): BusinessActionRecommendation[] {
  if (!business) return [];

  const items: BusinessActionRecommendation[] = [];
  const latest = business.financialHistory[business.financialHistory.length - 1] ?? null;

  // 1. Operating loss warning
  if (latest && latest.netProfitMinor < 0) {
    items.push({
      id: 'fix_operating_loss',
      severity: 'high',
      title: 'Tối ưu giá bán hoặc cơ cấu chi phí',
      reason: `Kỳ gần nhất công ty đang lỗ ròng ${Math.round(Math.abs(latest.netProfitMinor) / 100).toLocaleString('en-US')} CR. Cần cân đối lại giá bán hoặc nhân sự dư thừa.`,
      estimatedCostText: 'Miễn phí điều chỉnh giá',
      affectedMetric: 'Lợi nhuận ròng / kỳ',
      actionLabel: 'Mở Vận hành & Giá',
      targetTab: 'OPERATIONS',
    });
  }

  // 2. Under-capacity (real demand exceeds production capacity)
  if (business.customerDemandUnits > business.productionCapacity) {
    const gap = business.customerDemandUnits - business.productionCapacity;
    items.push({
      id: 'expand_capacity',
      severity: 'high',
      title: 'Mở rộng công suất đáp ứng nhu cầu',
      reason: `Nhu cầu khách hàng (${business.customerDemandUnits} đv) đang vượt công suất (${business.productionCapacity} đv), bỏ lỡ ${gap} đơn vị doanh thu tiềm năng.`,
      estimatedCostText: nextLevelUpgradeCostCR
        ? `Từ ~${nextLevelUpgradeCostCR.toLocaleString('en-US')} CR (nâng cấp)`
        : 'Theo hạng mục nâng cấp / nhân sự',
      affectedMetric: 'Công suất & Doanh thu',
      actionLabel: 'Mở Nâng cấp',
      targetTab: 'GROWTH',
    });
  }

  // 3. Understaffed
  if (business.employeeCount < Math.max(2, business.level * 2)) {
    items.push({
      id: 'hire_staff',
      severity: 'medium',
      title: 'Bổ sung nhân sự vận hành',
      reason: `Đội ngũ hiện có ${business.employeeCount} nhân viên, còn mỏng so với quy mô Level ${business.level}. Tuyển thêm sẽ tăng công suất phục vụ.`,
      estimatedCostText: 'Tính vào quỹ lương theo kỳ',
      affectedMetric: 'Công suất & Chất lượng dịch vụ',
      actionLabel: 'Tuyển nhân sự',
      targetTab: 'OPERATIONS',
    });
  }

  // 4. Low product/service quality
  if (business.qualityScore < 65) {
    items.push({
      id: 'improve_quality',
      severity: 'medium',
      title: 'Nâng chuẩn chất lượng sản phẩm',
      reason: `Điểm chất lượng hiện ở mức ${business.qualityScore.toFixed(0)}/100. Đào tạo nhân sự hoặc nâng cấp vận hành sẽ giữ chân khách hàng tốt hơn.`,
      estimatedCostText: 'Chi phí đào tạo / nâng cấp',
      affectedMetric: 'Chất lượng & Uy tín',
      actionLabel: 'Đào tạo & Nâng cấp',
      targetTab: 'OPERATIONS',
    });
  }

  // 5. Low company cash reserve
  if (business.companyCashMinor < 800_000) {
    items.push({
      id: 'topup_treasury',
      severity: 'high',
      title: 'Bổ sung quỹ tiền mặt công ty',
      reason: `Tiền mặt tại quỹ doanh nghiệp còn dưới 8,000 CR, dễ bị thiếu thanh khoản khi trả lương và chi phí cố định kỳ tới.`,
      estimatedCostText: 'Chuyển từ ví cá nhân',
      affectedMetric: 'Thanh khoản doanh nghiệp',
      actionLabel: 'Quản lý Vốn',
      targetTab: 'FINANCE',
    });
  }

  // 6. Ready to level up
  if (
    !business.pendingUpgrade &&
    nextLevelUpgradeCostCR &&
    business.companyCashMinor >= nextLevelUpgradeCostCR * 100
  ) {
    items.push({
      id: 'level_up_ready',
      severity: 'info',
      title: `Đủ quỹ nâng cấp lên Level ${business.level + 1}`,
      reason: `Quỹ tiền mặt công ty đã đủ chi trả nâng cấp cấp độ để mở khóa năng lực vận hành và định giá cao hơn.`,
      estimatedCostText: `${nextLevelUpgradeCostCR.toLocaleString('en-US')} CR`,
      affectedMetric: 'Cấp doanh nghiệp & Định giá',
      actionLabel: 'Xem Nâng cấp',
      targetTab: 'GROWTH',
    });
  }

  return items.slice(0, 4);
}

/**
 * Picks budget-friendly starter industries from the real server catalog for the Startup Launchpad.
 */
export function pickRecommendedStarterCatalog(
  catalog: BusinessCatalogItem[],
  availableCashCR: number,
  limit = 6,
): BusinessCatalogItem[] {
  const affordable = catalog.filter((c) => c.startupCostCR <= availableCashCR);
  const pool = affordable.length > 0 ? affordable : catalog;
  return [...pool].sort((a, b) => a.startupCostCR - b.startupCostCR).slice(0, limit);
}
