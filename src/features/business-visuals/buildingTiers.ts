import type { BusinessEntity } from '../../../shared/contracts/v4';
import type { GameClock } from '../../../shared/contracts/types';
import type { BuildingArchetypeId } from './buildingArchetypes';

export type BuildingVisualTier = 1 | 2 | 3 | 4;

export interface VisualTierSpec {
  tier: BuildingVisualTier;
  tierRoman: 'I' | 'II' | 'III' | 'IV';
  minLevel: number;
  maxLevel: number;
  stageCode: 'STARTUP' | 'ESTABLISHED' | 'FLAGSHIP' | 'EMPIRE';
  labelVi: string;
  shortLabelVi: string;
  floorsScaleHint: string;
}

export const BUILDING_VISUAL_TIERS: Record<BuildingVisualTier, VisualTierSpec> = {
  1: {
    tier: 1,
    tierRoman: 'I',
    minLevel: 1,
    maxLevel: 2,
    stageCode: 'STARTUP',
    labelVi: 'Giai đoạn I · Khởi điểm',
    shortLabelVi: 'Tier I',
    floorsScaleHint: 'Cơ sở khởi nghiệp gọn nhẹ',
  },
  2: {
    tier: 2,
    tierRoman: 'II',
    minLevel: 3,
    maxLevel: 5,
    stageCode: 'ESTABLISHED',
    labelVi: 'Giai đoạn II · Mở rộng',
    shortLabelVi: 'Tier II',
    floorsScaleHint: 'Kiến trúc mở rộng & tăng công suất',
  },
  3: {
    tier: 3,
    tierRoman: 'III',
    minLevel: 6,
    maxLevel: 8,
    stageCode: 'FLAGSHIP',
    labelVi: 'Giai đoạn III · Flagship',
    shortLabelVi: 'Tier III',
    floorsScaleHint: 'Cơ sở chủ lực chuẩn chuyên nghiệp',
  },
  4: {
    tier: 4,
    tierRoman: 'IV',
    minLevel: 9,
    maxLevel: 10,
    stageCode: 'EMPIRE',
    labelVi: 'Giai đoạn IV · Biểu tượng Thương hiệu',
    shortLabelVi: 'Tier IV',
    floorsScaleHint: 'Công trình biểu tượng đầu ngành',
  },
};

export function resolveBusinessVisualTier(level: number): BuildingVisualTier {
  if (level >= 9) return 4;
  if (level >= 6) return 3;
  if (level >= 3) return 2;
  return 1;
}

export function getVisualTierSpec(level: number): VisualTierSpec {
  return BUILDING_VISUAL_TIERS[resolveBusinessVisualTier(level)];
}

const ARCHETYPE_TIER_LABELS: Record<BuildingArchetypeId, Record<BuildingVisualTier, string>> = {
  STREET_KIOSK: {
    1: 'Xe cà phê vỉa hè',
    2: 'Trạm pha chế góc phố',
    3: 'Kiosk cà phê đặc sản Flagship',
    4: 'Tổ hợp Rang xay & Trải nghiệm Cà phê',
  },
  CAFE_SHOPHOUSE: {
    1: 'Quán cà phê mặt tiền nhỏ',
    2: 'Quán cà phê 2 tầng sân vườn',
    3: 'Cửa hàng Cà phê Flagship',
    4: 'Công trình Biểu tượng Thương hiệu Cà phê',
  },
  MILK_TEA_SHOP: {
    1: 'Tiệm trà sữa mang đi',
    2: 'Cửa hàng trà sữa 2 tầng',
    3: 'Flagship Trà sữa & Lounge',
    4: 'Trung tâm Trải nghiệm Đồ uống Biểu tượng',
  },
  EATERY_RESTAURANT: {
    1: 'Quán ăn nhà phố',
    2: 'Nhà hàng mở rộng 2 tầng',
    3: 'Nhà hàng Đô thị Flagship',
    4: 'Tổ hợp Ẩm thực Thương hiệu',
  },
  FINE_DINING_VILLA: {
    1: 'Gian Fine Dining Boutique',
    2: 'Nhà hàng Sân vườn Cao cấp',
    3: 'Biệt thự Ẩm thực Flagship',
    4: 'Dinh thự Ẩm thực Biểu tượng',
  },
  RETAIL_STORE: {
    1: 'Cửa hàng mặt phố nhỏ',
    2: 'Cửa hàng trưng bày mở rộng',
    3: 'Showroom Bán lẻ Chủ lực',
    4: 'Flagship Thương mại Đô thị',
  },
  COMMERCIAL_SHOWROOM: {
    1: 'Showroom tiêu chuẩn',
    2: 'Showroom 2 tầng mở rộng',
    3: 'Trung tâm Trưng bày Flagship',
    4: 'Tổ hợp Thương mại Biểu tượng',
  },
  STARTUP_OFFICE: {
    1: 'Văn phòng Startup nhỏ',
    2: 'Văn phòng Công nghệ mở rộng',
    3: 'Trung tâm Nghiên cứu & Phát triển',
    4: 'Khuôn viên Công nghệ Hiện đại',
  },
  OFFICE_TOWER: {
    1: 'Tòa nhà văn phòng trung tầng',
    2: 'Cao ốc Văn phòng Mở rộng',
    3: 'Trung tâm Điều hành Công nghệ',
    4: 'Tháp Văn phòng Biểu tượng',
  },
  INDUSTRIAL_FACILITY: {
    1: 'Xưởng sản xuất nhỏ',
    2: 'Nhà xưởng mở rộng',
    3: 'Nhà máy Tự động hóa Hiện đại',
    4: 'Tổ hợp Công nghiệp Quy mô lớn',
  },
  LOGISTICS_WAREHOUSE: {
    1: 'Trạm giao nhận cơ sở',
    2: 'Kho vận mở rộng nhiều cửa',
    3: 'Trung tâm Phân phối Hiện đại',
    4: 'Tổ hợp Logistics Liên vùng',
  },
  HOTEL_RESORT: {
    1: 'Cơ sở lưu trú Boutique',
    2: 'Khách sạn Đô thị mở rộng',
    3: 'Khách sạn Hạng sang Flagship',
    4: 'Quần thể Khách sạn & Nghỉ dưỡng Biểu tượng',
  },
  CORPORATE_HQ: {
    1: 'Văn phòng Điều hành Tài chính',
    2: 'Trụ sở Công ty Đầu tư',
    3: 'Tòa tháp Trụ sở Định chế',
    4: 'Tháp Biểu tượng Tập đoàn',
  },
};

export function getArchetypeTierTitle(archetype: BuildingArchetypeId, level: number): string {
  const tier = resolveBusinessVisualTier(level);
  return ARCHETYPE_TIER_LABELS[archetype]?.[tier] ?? BUILDING_VISUAL_TIERS[tier].labelVi;
}

export interface UpgradeVisualStatus {
  isUpgrading: boolean;
  currentLevel: number;
  targetLevel: number | null;
  currentTier: BuildingVisualTier;
  nextTierOnComplete: BuildingVisualTier | null;
  willChangeArchitecture: boolean;
  remainingGameHours: number;
  progressPct: number;
}

export function resolveUpgradeProgressInfo(
  business: Pick<BusinessEntity, 'level' | 'pendingUpgrade'>,
  gameClock: GameClock | null,
): UpgradeVisualStatus {
  const currentTier = resolveBusinessVisualTier(business.level);
  if (!business.pendingUpgrade) {
    return {
      isUpgrading: false,
      currentLevel: business.level,
      targetLevel: null,
      currentTier,
      nextTierOnComplete: null,
      willChangeArchitecture: false,
      remainingGameHours: 0,
      progressPct: 0,
    };
  }

  const { targetLevel, startedAtGameHour, completesAtGameHour } = business.pendingUpgrade;
  const nowHour = gameClock
    ? (gameClock.gameDay - 1) * 24 + gameClock.gameHour
    : startedAtGameHour;
  const totalDuration = Math.max(1, completesAtGameHour - startedAtGameHour);
  const elapsed = Math.max(0, Math.min(totalDuration, nowHour - startedAtGameHour));
  const remaining = Math.max(0, Math.ceil(completesAtGameHour - nowHour));
  const nextTier = resolveBusinessVisualTier(targetLevel);

  return {
    isUpgrading: true,
    currentLevel: business.level,
    targetLevel,
    currentTier,
    nextTierOnComplete: nextTier,
    willChangeArchitecture: nextTier > currentTier,
    remainingGameHours: remaining,
    progressPct: Math.round((elapsed / totalDuration) * 100),
  };
}
