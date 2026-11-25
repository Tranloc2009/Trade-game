import type { V4BusinessIndustry } from '../../../shared/contracts/v4';

// 16 bespoke generated Vietnamese architectural catalog assets
import bizFnbCoffeeCartImg from '../../assets/images/biz_fnb_coffee_cart_1795624257410.jpg';
import bizFnbCoffeeShopImg from '../../assets/images/biz_fnb_coffee_shop_1795624259949.jpg';
import bizFnbMilkTeaImg from '../../assets/images/biz_fnb_milk_tea_1795624260624.jpg';
import bizFnbVnEateryImg from '../../assets/images/biz_fnb_vn_eatery_1795624260343.jpg';
import bizFnbRestaurantImg from '../../assets/images/biz_fnb_restaurant_1795624262173.jpg';
import bizFnbFineDiningImg from '../../assets/images/biz_fnb_fine_dining_1795624263234.jpg';
import bizRetConvenienceImg from '../../assets/images/biz_ret_convenience_1795624263615.jpg';
import bizRetFashionImg from '../../assets/images/biz_ret_fashion_1795624265182.jpg';
import bizRetElectronicsImg from '../../assets/images/biz_ret_electronics_1795624266524.jpg';
import bizRetAutoShowroomImg from '../../assets/images/biz_ret_auto_showroom_1795624287193.jpg';
import bizRetSupermarketImg from '../../assets/images/biz_ret_supermarket_1795624267727.jpg';
import bizTechSoftwareStartupImg from '../../assets/images/biz_tech_software_startup_1795624269431.jpg';
import bizTechDataCenterImg from '../../assets/images/biz_tech_data_center_1795624269635.jpg';
import bizTrnLogisticsHubImg from '../../assets/images/biz_trn_logistics_hub_1795624270219.jpg';
import bizMfgModernFactoryImg from '../../assets/images/biz_mfg_modern_factory_1795624287997.jpg';
import bizHospBoutiqueHomestayImg from '../../assets/images/biz_hosp_boutique_homestay_1795624328028.jpg';

// 15 curated architectural Vietnamese city/HQ images
import hqModernStartupImg from '../../assets/images/hq_modern_startup_1795506326509.jpg';
import hqThuthiemOfficeImg from '../../assets/images/hq_thuthiem_office_1795506326708.jpg';
import hqSaigonRiverOfficeImg from '../../assets/images/hq_saigon_river_office_1795506327006.jpg';
import hqCorporateBoardroomImg from '../../assets/images/hq_corporate_boardroom_1795506326470.jpg';
import hqFinancialCenterImg from '../../assets/images/hq_financial_center_1795506327777.jpg';
import vnLandmark81SaigonImg from '../../assets/images/vn_landmark81_saigon_1795485456055.jpg';
import vnEmpireCityThuthiemImg from '../../assets/images/vn_empire_city_thuthiem_1795485456859.jpg';
import vnKeangnamLandmark72Img from '../../assets/images/vn_keangnam_landmark72_1795485455682.jpg';
import vnLotteHanoiImg from '../../assets/images/vn_lotte_hanoi_1795485456376.jpg';
import vnSalaThuthiemImg from '../../assets/images/vn_sala_thuthiem_1795485456025.jpg';
import vnSunCosmoDanangImg from '../../assets/images/vn_sun_cosmo_danang_1795485456716.jpg';
import districtCentralFinancialImg from '../../assets/images/district_central_financial_1795443839869.jpg';
import districtIndustrialZoneImg from '../../assets/images/district_industrial_zone_1795443839037.jpg';
import districtLuxuryBayImg from '../../assets/images/district_luxury_bay_1795443840537.jpg';
import districtRiversideImg from '../../assets/images/district_riverside_1795443839033.jpg';

import { BUILDING_ARCHETYPES, type BuildingArchetypeId } from './buildingArchetypes';
import {
  getArchetypeTierTitle,
  getVisualTierSpec,
  resolveBusinessVisualTier,
  type BuildingVisualTier,
  type VisualTierSpec,
} from './buildingTiers';
import {
  getBusinessVisualEntry,
  type BusinessCatalogAssetKey,
  type VisualAssetStatus,
} from './businessVisualRegistry';

export const BUSINESS_CATALOG_ASSET_URLS: Record<BusinessCatalogAssetKey, string> = {
  biz_fnb_coffee_cart: bizFnbCoffeeCartImg,
  biz_fnb_coffee_shop: bizFnbCoffeeShopImg,
  biz_fnb_milk_tea: bizFnbMilkTeaImg,
  biz_fnb_vn_eatery: bizFnbVnEateryImg,
  biz_fnb_restaurant: bizFnbRestaurantImg,
  biz_fnb_fine_dining: bizFnbFineDiningImg,
  biz_ret_convenience: bizRetConvenienceImg,
  biz_ret_fashion: bizRetFashionImg,
  biz_ret_electronics: bizRetElectronicsImg,
  biz_ret_auto_showroom: bizRetAutoShowroomImg,
  biz_ret_supermarket: bizRetSupermarketImg,
  biz_tech_software_startup: bizTechSoftwareStartupImg,
  biz_tech_data_center: bizTechDataCenterImg,
  biz_trn_logistics_hub: bizTrnLogisticsHubImg,
  biz_mfg_modern_factory: bizMfgModernFactoryImg,
  biz_hosp_boutique_homestay: bizHospBoutiqueHomestayImg,
  hq_modern_startup: hqModernStartupImg,
  hq_thuthiem_office: hqThuthiemOfficeImg,
  hq_saigon_river_office: hqSaigonRiverOfficeImg,
  hq_corporate_boardroom: hqCorporateBoardroomImg,
  hq_financial_center: hqFinancialCenterImg,
  vn_landmark81_saigon: vnLandmark81SaigonImg,
  vn_empire_city_thuthiem: vnEmpireCityThuthiemImg,
  vn_keangnam_landmark72: vnKeangnamLandmark72Img,
  vn_lotte_hanoi: vnLotteHanoiImg,
  vn_sala_thuthiem: vnSalaThuthiemImg,
  vn_sun_cosmo_danang: vnSunCosmoDanangImg,
  district_central_financial: districtCentralFinancialImg,
  district_industrial_zone: districtIndustrialZoneImg,
  district_luxury_bay: districtLuxuryBayImg,
  district_riverside: districtRiversideImg,
};

export type BusinessVisualContext =
  | 'CATALOG'
  | 'MAP'
  | 'BUSINESS_OVERVIEW'
  | 'OPENING_CINEMATIC'
  | 'UPGRADE_PREVIEW';

export interface ResolvedBusinessVisual {
  businessTypeId: string;
  displayName: string;
  catalogAssetKey: BusinessCatalogAssetKey;
  imageUrl: string;
  archetype: BuildingArchetypeId;
  archetypeLabelVi: string;
  tier: BuildingVisualTier;
  tierSpec: VisualTierSpec;
  tierStageTitleVi: string;
  brandAccentHex: string;
  architecturalNote: string;
  assetStatus: VisualAssetStatus;
  spriteVariant: number;
}

export function getBusinessVisual(
  businessTypeId: string,
  businessLevel = 1,
  context: BusinessVisualContext = 'CATALOG',
  fallbackIndustry?: V4BusinessIndustry,
): ResolvedBusinessVisual {
  const entry = getBusinessVisualEntry(businessTypeId, fallbackIndustry);
  const tier = resolveBusinessVisualTier(businessLevel);
  const tierSpec = getVisualTierSpec(businessLevel);
  const archetypeSpec = BUILDING_ARCHETYPES[entry.archetype];

  let assetKey: BusinessCatalogAssetKey = entry.catalogAssetKey;
  if (context === 'OPENING_CINEMATIC') {
    assetKey = entry.openingSceneAssetKey;
  } else if (context === 'UPGRADE_PREVIEW') {
    assetKey = entry.upgradePreviewAssetKey;
  } else if (context === 'BUSINESS_OVERVIEW' && tier >= 3) {
    assetKey = entry.upgradePreviewAssetKey;
  }

  return {
    businessTypeId: entry.businessTypeId,
    displayName: entry.displayName,
    catalogAssetKey: assetKey,
    imageUrl: BUSINESS_CATALOG_ASSET_URLS[assetKey] ?? bizFnbCoffeeShopImg,
    archetype: entry.archetype,
    archetypeLabelVi: archetypeSpec.labelVi,
    tier,
    tierSpec,
    tierStageTitleVi: getArchetypeTierTitle(entry.archetype, businessLevel),
    brandAccentHex: entry.brandAccentHex,
    architecturalNote: entry.architecturalNote,
    assetStatus: entry.assetStatus,
    spriteVariant: entry.spriteVariant,
  };
}
