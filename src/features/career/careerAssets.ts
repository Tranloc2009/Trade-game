import type { NpcCharacterId, SceneBackgroundKey } from '../../../shared/contracts/careerStory';
import type { V4BusinessIndustry } from '../../../shared/contracts/v4';

import saigonDawnImg from '../../assets/images/career_scene_saigon_dawn_1795525588378.jpg';
import apartmentImg from '../../assets/images/career_scene_apartment_1795525590441.jpg';
import coffeeShopImg from '../../assets/images/career_scene_coffee_shop_1795525588528.jpg';
import startupOfficeImg from '../../assets/images/hq_modern_startup_1795506326509.jpg';
import boardroomImg from '../../assets/images/hq_corporate_boardroom_1795506326470.jpg';
import crisisOfficeImg from '../../assets/images/hq_financial_center_1795506327777.jpg';
import thuthiemDistrictImg from '../../assets/images/hq_thuthiem_office_1795506326708.jpg';
import saigonRiverHqImg from '../../assets/images/hq_saigon_river_office_1795506327006.jpg';
import cityLegacyImg from '../../assets/images/vn_landmark81_saigon_1795485456055.jpg';

import districtFinancialImg from '../../assets/images/district_central_financial_1795443839869.jpg';
import districtIndustrialImg from '../../assets/images/district_industrial_zone_1795443839037.jpg';
import districtLuxuryBayImg from '../../assets/images/district_luxury_bay_1795443840537.jpg';
import districtRiversideImg from '../../assets/images/district_riverside_1795443839033.jpg';

import npcMinhQuanImg from '../../assets/images/npc_minh_quan_1795525589879.jpg';
import npcGiaHanImg from '../../assets/images/npc_gia_han_1795525591457.jpg';
import npcDucHuyImg from '../../assets/images/npc_duc_huy_1795525589275.jpg';
import npcHoangNamImg from '../../assets/images/npc_hoang_nam_1795525586575.jpg';
import npcThaoLinhImg from '../../assets/images/npc_thao_linh_1795525586633.jpg';

export const CAREER_SCENE_IMAGES: Record<SceneBackgroundKey, string> = {
  saigon_dawn: saigonDawnImg,
  apartment: apartmentImg,
  coffee_shop: coffeeShopImg,
  startup_office: startupOfficeImg,
  boardroom: boardroomImg,
  crisis_office: crisisOfficeImg,
  thuthiem_district: thuthiemDistrictImg,
  saigon_river_hq: saigonRiverHqImg,
  city_legacy: cityLegacyImg,
};

export const DISTRICT_IMAGES = {
  financial: districtFinancialImg,
  industrial: districtIndustrialImg,
  luxuryBay: districtLuxuryBayImg,
  riverside: districtRiversideImg,
  landmark: cityLegacyImg,
  saigonRiverHq: saigonRiverHqImg,
};

export const CAREER_NPC_PORTRAITS: Record<NpcCharacterId, string> = {
  minh_quan: npcMinhQuanImg,
  gia_han: npcGiaHanImg,
  duc_huy: npcDucHuyImg,
  hoang_nam: npcHoangNamImg,
  thao_linh: npcThaoLinhImg,
};

export const INDUSTRY_IMAGES: Record<V4BusinessIndustry, string> = {
  FNB: coffeeShopImg,
  RETAIL: districtRiversideImg,
  TECHNOLOGY: startupOfficeImg,
  TRANSPORTATION: districtIndustrialImg,
  MANUFACTURING: districtIndustrialImg,
  HOSPITALITY: districtLuxuryBayImg,
  REAL_ESTATE: cityLegacyImg,
  FINANCE: districtFinancialImg,
};

export function getSceneImageUrl(key: SceneBackgroundKey): string {
  return CAREER_SCENE_IMAGES[key] ?? saigonDawnImg;
}

export function getNpcPortraitUrl(npcId: NpcCharacterId): string {
  return CAREER_NPC_PORTRAITS[npcId] ?? npcMinhQuanImg;
}

export function getIndustryImageUrl(industry: V4BusinessIndustry): string {
  return INDUSTRY_IMAGES[industry] ?? startupOfficeImg;
}
