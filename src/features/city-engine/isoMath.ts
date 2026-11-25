import type { BusinessBranch, BusinessEntity, V4CityCode } from '../../../shared/contracts/v4';
import type { GameClock } from '../../../shared/contracts/types';
import type { SaigonLocationId } from '../career/world/locationRegistry';
import {
  BUILDING_ARCHETYPES,
  type BuildingArchetypeId,
  type SaigonDistrictZone,
} from '../business-visuals/buildingArchetypes';
import {
  resolveBusinessVisualTier,
  resolveUpgradeProgressInfo,
  type BuildingVisualTier,
} from '../business-visuals/buildingTiers';
import { getBusinessVisualEntry } from '../business-visuals/businessVisualRegistry';

export const ISO_GRID_SIZE = 28;
export const ISO_TILE_W = 96;
export const ISO_TILE_H = 48;

export type TileKind = 'LAND' | 'ROAD' | 'WATER' | 'BRIDGE' | 'PARK' | 'PLAZA';

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface GraphicsQualityConfig {
  id: GraphicsQuality;
  labelVi: string;
  shortLabel: string;
  descriptionVi: string;
  maxDpr: number;
  maxFps: number;
  enableWaterAnimation: boolean;
  enableVehicles: boolean;
  maxVehicles: number;
  enableShadows: boolean;
  enableNightGlowPools: boolean;
  enableTreesDetail: boolean;
  enableAtmosphereTint: boolean;
}

export const GRAPHICS_QUALITY_PRESETS: Record<GraphicsQuality, GraphicsQualityConfig> = {
  LOW: {
    id: 'LOW',
    labelVi: 'Thấp (Tiết kiệm pin)',
    shortLabel: 'LOW',
    descriptionVi: 'Độ phân giải 1×, tắt phản chiếu nước, tắt phương tiện và giảm hiệu ứng phụ (~30 FPS).',
    maxDpr: 1,
    maxFps: 30,
    enableWaterAnimation: false,
    enableVehicles: false,
    maxVehicles: 0,
    enableShadows: false,
    enableNightGlowPools: false,
    enableTreesDetail: false,
    enableAtmosphereTint: true,
  },
  MEDIUM: {
    id: 'MEDIUM',
    labelVi: 'Trung bình (Cân bằng)',
    shortLabel: 'MED',
    descriptionVi: 'Sprite đầy đủ, bóng đổ kiến trúc nhẹ, ánh sáng ngày/đêm và giao thông tiết chế.',
    maxDpr: 1.25,
    maxFps: 45,
    enableWaterAnimation: false,
    enableVehicles: true,
    maxVehicles: 8,
    enableShadows: true,
    enableNightGlowPools: false,
    enableTreesDetail: true,
    enableAtmosphereTint: true,
  },
  HIGH: {
    id: 'HIGH',
    labelVi: 'Cao (Khuyến nghị)',
    shortLabel: 'HIGH',
    descriptionVi: 'Texture sắc nét, phản chiếu sông Sài Gòn, đèn đường ban đêm và đầy đủ chi tiết phố.',
    maxDpr: 1.75,
    maxFps: 60,
    enableWaterAnimation: true,
    enableVehicles: true,
    maxVehicles: 16,
    enableShadows: true,
    enableNightGlowPools: true,
    enableTreesDetail: true,
    enableAtmosphereTint: true,
  },
  ULTRA: {
    id: 'ULTRA',
    labelVi: 'Tối đa (Ultra)',
    shortLabel: 'ULTRA',
    descriptionVi: 'Độ nét tối đa theo màn hình, hiệu ứng mặt nước, ánh sáng đầy đủ và mật độ giao thông cao.',
    maxDpr: 2,
    maxFps: 60,
    enableWaterAnimation: true,
    enableVehicles: true,
    maxVehicles: 24,
    enableShadows: true,
    enableNightGlowPools: true,
    enableTreesDetail: true,
    enableAtmosphereTint: true,
  },
};

export interface IsoWorldPoint {
  wx: number;
  wy: number;
}

export interface IsoGridPoint {
  gx: number;
  gy: number;
}

export interface IsoCameraState {
  /** World X currently positioned at viewport center */
  centerX: number;
  /** World Y currently positioned at viewport center */
  centerY: number;
  /** Zoom scale (0.42 .. 1.9) */
  zoom: number;
}

/** Fixed 2:1 isometric projection: grid tile center -> world pixel coordinates */
export function gridToWorld(gx: number, gy: number): IsoWorldPoint {
  return {
    wx: (gx - gy) * (ISO_TILE_W / 2),
    wy: (gx + gy) * (ISO_TILE_H / 2),
  };
}

/** Inverse projection: world pixel coordinates -> fractional grid coordinates */
export function worldToGrid(wx: number, wy: number): IsoGridPoint {
  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;
  return {
    gx: (wx / halfW + wy / halfH) / 2,
    gy: (wy / halfH - wx / halfW) / 2,
  };
}

/** Project world coordinate to screen pixel inside viewport */
export function worldToScreen(
  wx: number,
  wy: number,
  camera: IsoCameraState,
  viewportW: number,
  viewportH: number,
): { sx: number; sy: number } {
  return {
    sx: (wx - camera.centerX) * camera.zoom + viewportW / 2,
    sy: (wy - camera.centerY) * camera.zoom + viewportH / 2,
  };
}

/** Inverse: screen pixel inside viewport -> world coordinate */
export function screenToWorld(
  sx: number,
  sy: number,
  camera: IsoCameraState,
  viewportW: number,
  viewportH: number,
): IsoWorldPoint {
  return {
    wx: (sx - viewportW / 2) / camera.zoom + camera.centerX,
    wy: (sy - viewportH / 2) / camera.zoom + camera.centerY,
  };
}

/** Painter's depth sorting key based on footprint bottom corner */
export function computeIsoDepthKey(gx: number, gy: number, layerBias = 0): number {
  return Math.round((gx + gy) * 100 + gx * 0.5 + layerBias);
}

/** Clamp camera strictly inside Saigon world bounds without rotation */
export function clampIsoCamera(camera: IsoCameraState): IsoCameraState {
  const zoom = Math.max(0.45, Math.min(1.85, camera.zoom));
  const minX = -1120;
  const maxX = 1120;
  const minY = 120;
  const maxY = 1240;
  return {
    centerX: Math.max(minX, Math.min(maxX, camera.centerX)),
    centerY: Math.max(minY, Math.min(maxY, camera.centerY)),
    zoom,
  };
}

/** Compute camera centered on a world point, offsetting left on desktop to clear right preview panel */
export function computeFocusIsoCamera(
  wx: number,
  wy: number,
  zoom: number,
  viewportW: number,
  rightPanelOffsetPx = 0,
): IsoCameraState {
  const clampedZoom = Math.max(0.55, Math.min(1.65, zoom));
  const shiftWorldX = rightPanelOffsetPx > 0 && viewportW >= 920 ? (rightPanelOffsetPx / 2) / clampedZoom : 0;
  return clampIsoCamera({
    centerX: wx + shiftWorldX,
    centerY: wy - 20,
    zoom: clampedZoom,
  });
}

// ============================================================================
// SAIGON CITY TERRAIN & INFRASTRUCTURE MAP (28x28)
// ============================================================================

export function isSaigonRiverTile(gx: number, gy: number): boolean {
  // Iconic Saigon River winding along the south-east and east sides of District 1
  if (gy >= 20 && gy <= 22 && gx <= 22) return true;
  if (gx >= 20 && gx <= 22 && gy <= 22) return true;
  // River bend corner smoothing
  if ((gx === 19 && gy === 19) || (gx === 23 && gy === 23)) return true;
  return false;
}

export function isRoadAxis(gx: number, gy: number): boolean {
  return gx === 4 || gx === 10 || gx === 16 || gx === 24 || gy === 4 || gy === 10 || gy === 16 || gy === 24;
}

export function isBridgeTile(gx: number, gy: number): boolean {
  if (!isSaigonRiverTile(gx, gy)) return false;
  // Bridge 1 (South Crossing): gx === 10 across gy 20..22
  if (gx === 10 && gy >= 20 && gy <= 22) return true;
  // Bridge 2 (East Ba Son Crossing): gy === 10 across gx 20..22
  if (gy === 10 && gx >= 20 && gx <= 22) return true;
  return false;
}

export function isParkTile(gx: number, gy: number): boolean {
  // Central Saigon Green Park
  if (gx >= 11 && gx <= 13 && gy >= 11 && gy <= 12) return true;
  // Riverfront Promenade Park
  if (gx >= 17 && gx <= 18 && gy >= 17 && gy <= 18) return true;
  // Heritage Residential Park
  if (gx >= 1 && gx <= 2 && gy >= 11 && gy <= 12) return true;
  return false;
}

export function getSaigonTileKind(gx: number, gy: number): TileKind {
  if (isBridgeTile(gx, gy)) return 'BRIDGE';
  if (isSaigonRiverTile(gx, gy)) return 'WATER';
  if (isRoadAxis(gx, gy)) return 'ROAD';
  if (isParkTile(gx, gy)) return 'PARK';
  if (gx >= 17 && gx <= 19 && gy >= 5 && gy <= 15) return 'PLAZA';
  return 'LAND';
}

export function getSaigonDistrictAt(gx: number, gy: number): SaigonDistrictZone {
  if (gx >= 23 && gy <= 23) return 'LUXURY_MARINA';
  if (gy >= 23 && gx >= 11) return 'LUXURY_MARINA';
  if (gy >= 17 && gx <= 9) return 'INDUSTRIAL_RIVERSIDE';
  if (gx >= 17 && gx <= 19 && gy <= 15) return 'FINANCIAL_CENTER';
  if (gx >= 11 && gx <= 15 && gy >= 13 && gy <= 19) return 'INNOVATION_QUARTER';
  if (gx >= 5 && gx <= 15 && gy >= 5 && gy <= 9) return 'DISTRICT_1_CORE';
  return 'COMMERCIAL_STREET';
}

export const DISTRICT_LABELS_VI: Record<SaigonDistrictZone, string> = {
  DISTRICT_1_CORE: 'Quận 1 · Trung tâm Lịch sử',
  COMMERCIAL_STREET: 'Phố Thương mại Nguyễn Huệ',
  INNOVATION_QUARTER: 'Khu Khởi nghiệp & Công nghệ',
  FINANCIAL_CENTER: 'Khu Tài chính Sài Gòn',
  INDUSTRIAL_RIVERSIDE: 'Khu Công nghiệp & Kho vận Ven sông',
  LUXURY_MARINA: 'Bến Du thuyền Thủ Thiêm',
};

// ============================================================================
// 7 STORY LANDMARKS ON THE ISOMETRIC GRID (1:1 WITH LOCATION REGISTRY)
// ============================================================================

export interface StaticLandmarkPlacement {
  locationId: SaigonLocationId;
  gx: number;
  gy: number;
  district: SaigonDistrictZone;
  style: 'APARTMENT' | 'CAFE_LANDMARK' | 'STARTUP_HUB' | 'BANK' | 'EXCHANGE_TOWER' | 'CORP_TOWER' | 'SHOWROOM';
}

export const STATIC_CITY_LANDMARKS: StaticLandmarkPlacement[] = [
  { locationId: 'apartment', gx: 2, gy: 7, district: 'COMMERCIAL_STREET', style: 'APARTMENT' },
  { locationId: 'coffee_shop', gx: 7, gy: 7, district: 'DISTRICT_1_CORE', style: 'CAFE_LANDMARK' },
  { locationId: 'company', gx: 13, gy: 14, district: 'INNOVATION_QUARTER', style: 'STARTUP_HUB' },
  { locationId: 'bank', gx: 18, gy: 7, district: 'FINANCIAL_CENTER', style: 'BANK' },
  { locationId: 'financial_district', gx: 18, gy: 13, district: 'FINANCIAL_CENTER', style: 'EXCHANGE_TOWER' },
  { locationId: 'corporate_tower', gx: 25, gy: 13, district: 'LUXURY_MARINA', style: 'CORP_TOWER' },
  { locationId: 'showroom', gx: 25, gy: 7, district: 'LUXURY_MARINA', style: 'SHOWROOM' },
];

export const STATIC_LANDMARK_BY_ID: Record<SaigonLocationId, StaticLandmarkPlacement> =
  STATIC_CITY_LANDMARKS.reduce(
    (acc, item) => {
      acc[item.locationId] = item;
      return acc;
    },
    {} as Record<SaigonLocationId, StaticLandmarkPlacement>,
  );

// ============================================================================
// DYNAMIC BUILDING PLOTS (36 COLLISION-FREE LAND PLOTS ON SAIGON MAP)
// ============================================================================

export interface CityBuildingPlot {
  plotId: string;
  cityCode: V4CityCode;
  districtId: SaigonDistrictZone;
  districtLabelVi: string;
  gx: number;
  gy: number;
  footprintW: number;
  footprintH: number;
  supportedArchetypes: BuildingArchetypeId[];
  orientation: 'SE' | 'SW';
}

const RAW_PLOTS: Array<{
  plotId: string;
  gx: number;
  gy: number;
  districtId: SaigonDistrictZone;
  supportedArchetypes: BuildingArchetypeId[];
  orientation: 'SE' | 'SW';
}> = [
  // District 1 Core (Cafes, Eateries, Fine Dining, Boutique Retail)
  { plotId: 'd1_01', gx: 5, gy: 7, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['CAFE_SHOPHOUSE', 'STREET_KIOSK', 'MILK_TEA_SHOP', 'EATERY_RESTAURANT'], orientation: 'SE' },
  { plotId: 'd1_02', gx: 8, gy: 6, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['MILK_TEA_SHOP', 'CAFE_SHOPHOUSE', 'RETAIL_STORE', 'EATERY_RESTAURANT'], orientation: 'SE' },
  { plotId: 'd1_03', gx: 6, gy: 8, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['EATERY_RESTAURANT', 'CAFE_SHOPHOUSE', 'STREET_KIOSK', 'RETAIL_STORE'], orientation: 'SW' },
  { plotId: 'd1_04', gx: 9, gy: 7, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['RETAIL_STORE', 'MILK_TEA_SHOP', 'CAFE_SHOPHOUSE', 'FINE_DINING_VILLA'], orientation: 'SW' },
  { plotId: 'd1_05', gx: 12, gy: 6, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['CAFE_SHOPHOUSE', 'EATERY_RESTAURANT', 'RETAIL_STORE', 'STARTUP_OFFICE'], orientation: 'SE' },
  { plotId: 'd1_06', gx: 14, gy: 6, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['FINE_DINING_VILLA', 'HOTEL_RESORT', 'EATERY_RESTAURANT', 'RETAIL_STORE'], orientation: 'SE' },
  { plotId: 'd1_07', gx: 12, gy: 8, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['MILK_TEA_SHOP', 'STREET_KIOSK', 'CAFE_SHOPHOUSE', 'RETAIL_STORE'], orientation: 'SW' },
  { plotId: 'd1_08', gx: 14, gy: 8, districtId: 'DISTRICT_1_CORE', supportedArchetypes: ['RETAIL_STORE', 'COMMERCIAL_SHOWROOM', 'EATERY_RESTAURANT', 'STARTUP_OFFICE'], orientation: 'SW' },

  // Commercial Street (Street Kiosks, Retail, Milk Tea, Showrooms, Restaurants)
  { plotId: 'com_01', gx: 6, gy: 12, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['STREET_KIOSK', 'MILK_TEA_SHOP', 'RETAIL_STORE', 'CAFE_SHOPHOUSE'], orientation: 'SE' },
  { plotId: 'com_02', gx: 8, gy: 12, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['RETAIL_STORE', 'COMMERCIAL_SHOWROOM', 'EATERY_RESTAURANT', 'MILK_TEA_SHOP'], orientation: 'SE' },
  { plotId: 'com_03', gx: 6, gy: 14, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['COMMERCIAL_SHOWROOM', 'RETAIL_STORE', 'EATERY_RESTAURANT', 'CAFE_SHOPHOUSE'], orientation: 'SW' },
  { plotId: 'com_04', gx: 8, gy: 14, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['EATERY_RESTAURANT', 'RETAIL_STORE', 'STREET_KIOSK', 'MILK_TEA_SHOP'], orientation: 'SW' },
  { plotId: 'com_05', gx: 2, gy: 14, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['STREET_KIOSK', 'RETAIL_STORE', 'EATERY_RESTAURANT', 'CAFE_SHOPHOUSE'], orientation: 'SE' },
  { plotId: 'com_06', gx: 2, gy: 5, districtId: 'COMMERCIAL_STREET', supportedArchetypes: ['CAFE_SHOPHOUSE', 'RETAIL_STORE', 'MILK_TEA_SHOP', 'STARTUP_OFFICE'], orientation: 'SE' },

  // Innovation Quarter (Startups, Tech Offices, Studios, Cafes)
  { plotId: 'inn_01', gx: 12, gy: 14, districtId: 'INNOVATION_QUARTER', supportedArchetypes: ['STARTUP_OFFICE', 'OFFICE_TOWER', 'CAFE_SHOPHOUSE', 'STREET_KIOSK'], orientation: 'SE' },
  { plotId: 'inn_02', gx: 14, gy: 12, districtId: 'INNOVATION_QUARTER', supportedArchetypes: ['STARTUP_OFFICE', 'OFFICE_TOWER', 'COMMERCIAL_SHOWROOM'], orientation: 'SE' },
  { plotId: 'inn_03', gx: 14, gy: 14, districtId: 'INNOVATION_QUARTER', supportedArchetypes: ['OFFICE_TOWER', 'STARTUP_OFFICE', 'RETAIL_STORE'], orientation: 'SW' },
  { plotId: 'inn_04', gx: 12, gy: 18, districtId: 'INNOVATION_QUARTER', supportedArchetypes: ['STARTUP_OFFICE', 'OFFICE_TOWER', 'INDUSTRIAL_FACILITY'], orientation: 'SE' },
  { plotId: 'inn_05', gx: 14, gy: 18, districtId: 'INNOVATION_QUARTER', supportedArchetypes: ['OFFICE_TOWER', 'CORPORATE_HQ', 'STARTUP_OFFICE'], orientation: 'SW' },

  // Financial Center (Banks, Finance, Office Towers, Corporate HQs)
  { plotId: 'fin_01', gx: 18, gy: 5, districtId: 'FINANCIAL_CENTER', supportedArchetypes: ['CORPORATE_HQ', 'OFFICE_TOWER', 'STARTUP_OFFICE'], orientation: 'SE' },
  { plotId: 'fin_02', gx: 18, gy: 9, districtId: 'FINANCIAL_CENTER', supportedArchetypes: ['OFFICE_TOWER', 'CORPORATE_HQ', 'COMMERCIAL_SHOWROOM'], orientation: 'SW' },
  { plotId: 'fin_03', gx: 18, gy: 11, districtId: 'FINANCIAL_CENTER', supportedArchetypes: ['CORPORATE_HQ', 'OFFICE_TOWER', 'STARTUP_OFFICE'], orientation: 'SE' },
  { plotId: 'fin_04', gx: 18, gy: 15, districtId: 'FINANCIAL_CENTER', supportedArchetypes: ['OFFICE_TOWER', 'CORPORATE_HQ', 'COMMERCIAL_SHOWROOM'], orientation: 'SW' },

  // Luxury Marina / Thu Thiem (Hotels, Fine Dining, Luxury Showrooms, Corporate HQs)
  { plotId: 'lux_01', gx: 25, gy: 5, districtId: 'LUXURY_MARINA', supportedArchetypes: ['HOTEL_RESORT', 'FINE_DINING_VILLA', 'COMMERCIAL_SHOWROOM'], orientation: 'SE' },
  { plotId: 'lux_02', gx: 26, gy: 9, districtId: 'LUXURY_MARINA', supportedArchetypes: ['FINE_DINING_VILLA', 'HOTEL_RESORT', 'CORPORATE_HQ'], orientation: 'SW' },
  { plotId: 'lux_03', gx: 26, gy: 15, districtId: 'LUXURY_MARINA', supportedArchetypes: ['HOTEL_RESORT', 'CORPORATE_HQ', 'OFFICE_TOWER'], orientation: 'SW' },
  { plotId: 'lux_04', gx: 25, gy: 18, districtId: 'LUXURY_MARINA', supportedArchetypes: ['HOTEL_RESORT', 'FINE_DINING_VILLA', 'COMMERCIAL_SHOWROOM'], orientation: 'SE' },
  { plotId: 'lux_05', gx: 13, gy: 25, districtId: 'LUXURY_MARINA', supportedArchetypes: ['HOTEL_RESORT', 'FINE_DINING_VILLA', 'CAFE_SHOPHOUSE'], orientation: 'SE' },
  { plotId: 'lux_06', gx: 15, gy: 25, districtId: 'LUXURY_MARINA', supportedArchetypes: ['COMMERCIAL_SHOWROOM', 'HOTEL_RESORT', 'CORPORATE_HQ'], orientation: 'SE' },
  { plotId: 'lux_07', gx: 19, gy: 25, districtId: 'LUXURY_MARINA', supportedArchetypes: ['CORPORATE_HQ', 'OFFICE_TOWER', 'HOTEL_RESORT'], orientation: 'SW' },

  // Industrial & Logistics Riverside (Factories, Warehouses, Data Centers)
  { plotId: 'ind_01', gx: 2, gy: 18, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['INDUSTRIAL_FACILITY', 'LOGISTICS_WAREHOUSE'], orientation: 'SE' },
  { plotId: 'ind_02', gx: 6, gy: 18, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['LOGISTICS_WAREHOUSE', 'INDUSTRIAL_FACILITY'], orientation: 'SE' },
  { plotId: 'ind_03', gx: 8, gy: 18, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['INDUSTRIAL_FACILITY', 'LOGISTICS_WAREHOUSE', 'COMMERCIAL_SHOWROOM'], orientation: 'SW' },
  { plotId: 'ind_04', gx: 2, gy: 25, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['INDUSTRIAL_FACILITY', 'LOGISTICS_WAREHOUSE'], orientation: 'SE' },
  { plotId: 'ind_05', gx: 6, gy: 25, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['LOGISTICS_WAREHOUSE', 'INDUSTRIAL_FACILITY'], orientation: 'SE' },
  { plotId: 'ind_06', gx: 8, gy: 25, districtId: 'INDUSTRIAL_RIVERSIDE', supportedArchetypes: ['INDUSTRIAL_FACILITY', 'LOGISTICS_WAREHOUSE'], orientation: 'SW' },
];

export const SAIGON_BUILDING_PLOTS: CityBuildingPlot[] = RAW_PLOTS.map((p) => ({
  ...p,
  cityCode: 'HCMC',
  districtLabelVi: DISTRICT_LABELS_VI[p.districtId],
  footprintW: 1,
  footprintH: 1,
}));

// Decorative Vietnamese environment buildings (never overlap roads, water, landmarks, or dynamic plots)
export interface StaticContextBuilding {
  id: string;
  gx: number;
  gy: number;
  kind: 'TUBE_HOUSE' | 'RESIDENTIAL_BLOCK' | 'MID_OFFICE' | 'FINANCE_HIGHRISE' | 'RIVERSIDE_VILLA' | 'INDUSTRIAL_SHED';
  seed: number;
}

function buildContextCityBuildings(): StaticContextBuilding[] {
  const occupied = new Set<string>();
  for (const lm of STATIC_CITY_LANDMARKS) occupied.add(`${lm.gx},${lm.gy}`);
  for (const pl of SAIGON_BUILDING_PLOTS) occupied.add(`${pl.gx},${pl.gy}`);

  const items: StaticContextBuilding[] = [];
  const candidates: Array<{ gx: number; gy: number; kind: StaticContextBuilding['kind'] }> = [
    // Heritage shophouses & residential blocks around District 1 & West side
    { gx: 1, gy: 2, kind: 'TUBE_HOUSE' },
    { gx: 2, gy: 2, kind: 'RESIDENTIAL_BLOCK' },
    { gx: 3, gy: 2, kind: 'TUBE_HOUSE' },
    { gx: 6, gy: 2, kind: 'RESIDENTIAL_BLOCK' },
    { gx: 8, gy: 2, kind: 'TUBE_HOUSE' },
    { gx: 12, gy: 2, kind: 'MID_OFFICE' },
    { gx: 14, gy: 2, kind: 'RESIDENTIAL_BLOCK' },
    { gx: 18, gy: 2, kind: 'FINANCE_HIGHRISE' },
    { gx: 22, gy: 2, kind: 'RIVERSIDE_VILLA' },
    { gx: 25, gy: 2, kind: 'RIVERSIDE_VILLA' },
    { gx: 1, gy: 6, kind: 'TUBE_HOUSE' },
    { gx: 1, gy: 9, kind: 'TUBE_HOUSE' },
    { gx: 3, gy: 8, kind: 'TUBE_HOUSE' },
    { gx: 3, gy: 12, kind: 'TUBE_HOUSE' },
    { gx: 1, gy: 15, kind: 'RESIDENTIAL_BLOCK' },
    { gx: 5, gy: 5, kind: 'TUBE_HOUSE' },
    { gx: 9, gy: 5, kind: 'TUBE_HOUSE' },
    { gx: 9, gy: 9, kind: 'MID_OFFICE' },
    { gx: 5, gy: 9, kind: 'TUBE_HOUSE' },
    { gx: 11, gy: 5, kind: 'MID_OFFICE' },
    { gx: 15, gy: 5, kind: 'MID_OFFICE' },
    { gx: 15, gy: 9, kind: 'MID_OFFICE' },
    { gx: 5, gy: 11, kind: 'TUBE_HOUSE' },
    { gx: 9, gy: 11, kind: 'TUBE_HOUSE' },
    { gx: 5, gy: 15, kind: 'TUBE_HOUSE' },
    { gx: 9, gy: 15, kind: 'MID_OFFICE' },
    { gx: 11, gy: 15, kind: 'MID_OFFICE' },
    { gx: 15, gy: 15, kind: 'MID_OFFICE' },
    { gx: 17, gy: 6, kind: 'FINANCE_HIGHRISE' },
    { gx: 19, gy: 6, kind: 'FINANCE_HIGHRISE' },
    { gx: 17, gy: 12, kind: 'FINANCE_HIGHRISE' },
    { gx: 19, gy: 12, kind: 'FINANCE_HIGHRISE' },
    { gx: 17, gy: 14, kind: 'FINANCE_HIGHRISE' },
    { gx: 19, gy: 14, kind: 'FINANCE_HIGHRISE' },
    { gx: 25, gy: 11, kind: 'RIVERSIDE_VILLA' },
    { gx: 26, gy: 6, kind: 'RIVERSIDE_VILLA' },
    { gx: 26, gy: 12, kind: 'FINANCE_HIGHRISE' },
    { gx: 26, gy: 17, kind: 'RIVERSIDE_VILLA' },
    { gx: 12, gy: 26, kind: 'RIVERSIDE_VILLA' },
    { gx: 15, gy: 26, kind: 'RIVERSIDE_VILLA' },
    { gx: 18, gy: 26, kind: 'RIVERSIDE_VILLA' },
    { gx: 21, gy: 26, kind: 'RIVERSIDE_VILLA' },
    { gx: 3, gy: 17, kind: 'INDUSTRIAL_SHED' },
    { gx: 5, gy: 17, kind: 'INDUSTRIAL_SHED' },
    { gx: 7, gy: 19, kind: 'INDUSTRIAL_SHED' },
    { gx: 3, gy: 26, kind: 'INDUSTRIAL_SHED' },
    { gx: 7, gy: 26, kind: 'INDUSTRIAL_SHED' },
  ];

  candidates.forEach((c, idx) => {
    const key = `${c.gx},${c.gy}`;
    if (occupied.has(key)) return;
    const tile = getSaigonTileKind(c.gx, c.gy);
    if (tile !== 'LAND' && tile !== 'PLAZA') return;
    occupied.add(key);
    items.push({ id: `ctx_${idx}`, gx: c.gx, gy: c.gy, kind: c.kind, seed: idx + 1 });
  });

  return items;
}

export const STATIC_CONTEXT_BUILDINGS: StaticContextBuilding[] = buildContextCityBuildings();

// ============================================================================
// DETERMINISTIC BUSINESS & BRANCH PLOT ALLOCATOR (ZERO RANDOMNESS ON RELOAD)
// ============================================================================

export type MapBuildingOwnership = 'OWNED' | 'CO_OWNED' | 'NPC' | 'RIVAL';

export interface PlacedCityBuilding {
  entityKey: string; // business.id or `${business.id}::branch::${branch.id}`
  businessId: string;
  branchId: string | null;
  isBranch: boolean;
  labelName: string;
  branchSubtitle: string | null;
  ticker: string;
  businessTypeId: string;
  businessTypeName: string;
  archetype: BuildingArchetypeId;
  spriteVariant: number;
  brandAccentHex: string;
  level: number;
  visualTier: BuildingVisualTier;
  ownership: MapBuildingOwnership;
  ownershipPct: number;
  roleLabelVi: string;
  canManage: boolean;
  status: BusinessEntity['status'];
  isUpgrading: boolean;
  upgradeTargetLevel: number | null;
  upgradeRemainingHours: number;
  plot: CityBuildingPlot;
  wx: number;
  wy: number;
  depthKey: number;
  business: BusinessEntity;
  branch: BusinessBranch | null;
}

export interface CityBuildingsAllocation {
  saigonBuildings: PlacedCityBuilding[];
  otherCityBusinesses: BusinessEntity[];
  otherCityBranches: Array<{ business: BusinessEntity; branch: BusinessBranch }>;
}

/** Deterministic FNV-1a 32-bit hash for stable plot assignment across reloads */
export function stableHashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function classifyBusinessOwnership(
  biz: BusinessEntity,
  playerId: string | null,
): {
  ownership: MapBuildingOwnership;
  ownershipPct: number;
  roleLabelVi: string;
  canManage: boolean;
} {
  if (!playerId) {
    return { ownership: 'NPC', ownershipPct: 0, roleLabelVi: 'Doanh nghiệp thị trường', canManage: false };
  }

  const shareholder = biz.shareholders.find((s) => s.playerId === playerId);
  const pct = shareholder?.ownershipPct ?? (biz.ownerId === playerId ? 100 : 0);
  const isOwner = biz.ownerId === playerId;
  const isCeo = biz.ceoId === playerId;
  const hasMultipleShareholders = biz.shareholders.length > 1;

  if (isOwner && !hasMultipleShareholders) {
    return { ownership: 'OWNED', ownershipPct: Math.round(pct), roleLabelVi: 'Chủ sở hữu · CEO', canManage: true };
  }
  if (isOwner || isCeo || (shareholder && shareholder.ownershipPct > 0)) {
    const role = isCeo
      ? `Đồng sáng lập · CEO (${pct.toFixed(0)}%)`
      : isOwner
        ? `Chủ sở hữu chính (${pct.toFixed(0)}%)`
        : `Cổ đông (${pct.toFixed(0)}%)`;
    return {
      ownership: hasMultipleShareholders ? 'CO_OWNED' : 'OWNED',
      ownershipPct: Math.round(pct),
      roleLabelVi: role,
      canManage: isOwner || isCeo,
    };
  }

  const isNpc = biz.ownerId.startsWith('npc_') || biz.ownerId.startsWith('bot_') || biz.ownerId === 'SYSTEM';
  return {
    ownership: isNpc ? 'NPC' : 'RIVAL',
    ownershipPct: 0,
    roleLabelVi: isNpc ? 'Doanh nghiệp NPC' : 'Đối thủ thị trường',
    canManage: false,
  };
}

export function allocateCityBuildings(params: {
  businesses: BusinessEntity[];
  playerId: string | null;
  worldId: string | null;
  gameClock: GameClock | null;
  brandColorOverrides?: Record<string, string>;
}): CityBuildingsAllocation {
  const { businesses, playerId, worldId, gameClock, brandColorOverrides } = params;

  // Strict world isolation (TEST 12): only businesses belonging to the active world
  const scoped = worldId
    ? businesses.filter((b) => !b.worldId || b.worldId === worldId)
    : businesses;

  // Stable deterministic ordering: player-owned first so they get prime district plots, then sorted by ID
  const ordered = [...scoped].sort((a, b) => {
    const aMine = playerId && (a.ownerId === playerId || a.shareholders.some((s) => s.playerId === playerId)) ? 0 : 1;
    const bMine = playerId && (b.ownerId === playerId || b.shareholders.some((s) => s.playerId === playerId)) ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.id.localeCompare(b.id);
  });

  const usedPlotIds = new Set<string>();
  const saigonBuildings: PlacedCityBuilding[] = [];
  const otherCityBusinesses: BusinessEntity[] = [];
  const otherCityBranches: Array<{ business: BusinessEntity; branch: BusinessBranch }> = [];

  const pickDeterministicPlot = (
    seedKey: string,
    archetype: BuildingArchetypeId,
  ): CityBuildingPlot | null => {
    const preferredDistricts = BUILDING_ARCHETYPES[archetype].preferredDistricts;
    const available = SAIGON_BUILDING_PLOTS.filter((p) => !usedPlotIds.has(p.plotId));
    if (available.length === 0) return null;

    // 1. Exact archetype-supported plot in preferred district
    const exactMatch = available.filter(
      (p) => p.supportedArchetypes.includes(archetype) && preferredDistricts.includes(p.districtId),
    );
    const pool =
      exactMatch.length > 0
        ? exactMatch
        : available.filter((p) => p.supportedArchetypes.includes(archetype));
    const finalPool = pool.length > 0 ? pool : available;

    const idx = stableHashString(seedKey) % finalPool.length;
    const chosen = finalPool[idx];
    usedPlotIds.add(chosen.plotId);
    return chosen;
  };

  for (const biz of ordered) {
    const visual = getBusinessVisualEntry(biz.businessTypeId, biz.industry);
    const ownerInfo = classifyBusinessOwnership(biz, playerId);
    const upgradeInfo = resolveUpgradeProgressInfo(biz, gameClock);
    const visualTier = resolveBusinessVisualTier(biz.level);
    const accentHex = brandColorOverrides?.[biz.id] ?? visual.brandAccentHex;

    // Headquarters placement — strictly respects cityCode (TEST 13)
    if (biz.cityCode === 'HCMC') {
      const plot = pickDeterministicPlot(`hq:${biz.id}`, visual.archetype);
      if (plot) {
        const pos = gridToWorld(plot.gx, plot.gy);
        saigonBuildings.push({
          entityKey: biz.id,
          businessId: biz.id,
          branchId: null,
          isBranch: false,
          labelName: biz.businessName,
          branchSubtitle: null,
          ticker: biz.ticker,
          businessTypeId: biz.businessTypeId,
          businessTypeName: biz.businessTypeName,
          archetype: visual.archetype,
          spriteVariant: visual.spriteVariant,
          brandAccentHex: accentHex,
          level: biz.level,
          visualTier,
          ownership: ownerInfo.ownership,
          ownershipPct: ownerInfo.ownershipPct,
          roleLabelVi: ownerInfo.roleLabelVi,
          canManage: ownerInfo.canManage,
          status: biz.status,
          isUpgrading: upgradeInfo.isUpgrading,
          upgradeTargetLevel: upgradeInfo.targetLevel,
          upgradeRemainingHours: upgradeInfo.remainingGameHours,
          plot,
          wx: pos.wx,
          wy: pos.wy,
          depthKey: computeIsoDepthKey(plot.gx, plot.gy, 10),
          business: biz,
          branch: null,
        });
      }
    } else if (ownerInfo.ownership === 'OWNED' || ownerInfo.ownership === 'CO_OWNED') {
      otherCityBusinesses.push(biz);
    }

    // Branches placement — each active HCMC branch spawns on its own plot linked to parent businessId
    for (const branch of biz.branches ?? []) {
      if (branch.status === 'CLOSED') continue;
      if (branch.cityCode === 'HCMC') {
        const branchPlot = pickDeterministicPlot(`branch:${biz.id}:${branch.id}`, visual.archetype);
        if (branchPlot) {
          const pos = gridToWorld(branchPlot.gx, branchPlot.gy);
          // Branches use a compact visual tier capped at Tier II so HQ remains visually dominant
          const branchTier: BuildingVisualTier = visualTier >= 3 ? 2 : 1;
          saigonBuildings.push({
            entityKey: `${biz.id}::branch::${branch.id}`,
            businessId: biz.id,
            branchId: branch.id,
            isBranch: true,
            labelName: biz.businessName,
            branchSubtitle: branch.locationLabel || 'Chi nhánh TP.HCM',
            ticker: biz.ticker,
            businessTypeId: biz.businessTypeId,
            businessTypeName: biz.businessTypeName,
            archetype: visual.archetype,
            spriteVariant: visual.spriteVariant,
            brandAccentHex: accentHex,
            level: biz.level,
            visualTier: branchTier,
            ownership: ownerInfo.ownership,
            ownershipPct: ownerInfo.ownershipPct,
            roleLabelVi: `${ownerInfo.roleLabelVi} · Chi nhánh`,
            canManage: ownerInfo.canManage,
            status: branch.status === 'SUSPENDED' ? 'SUSPENDED' : biz.status,
            isUpgrading: false,
            upgradeTargetLevel: null,
            upgradeRemainingHours: 0,
            plot: branchPlot,
            wx: pos.wx,
            wy: pos.wy,
            depthKey: computeIsoDepthKey(branchPlot.gx, branchPlot.gy, 10),
            business: biz,
            branch,
          });
        }
      } else if (ownerInfo.ownership === 'OWNED' || ownerInfo.ownership === 'CO_OWNED') {
        otherCityBranches.push({ business: biz, branch });
      }
    }
  }

  return {
    saigonBuildings,
    otherCityBusinesses,
    otherCityBranches,
  };
}
