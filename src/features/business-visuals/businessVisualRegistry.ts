import type { V4BusinessIndustry } from '../../../shared/contracts/v4';
import type { BuildingArchetypeId } from './buildingArchetypes';

export type BusinessCatalogAssetKey =
  // 16 bespoke generated Vietnamese architectural business assets
  | 'biz_fnb_coffee_cart'
  | 'biz_fnb_coffee_shop'
  | 'biz_fnb_milk_tea'
  | 'biz_fnb_vn_eatery'
  | 'biz_fnb_restaurant'
  | 'biz_fnb_fine_dining'
  | 'biz_ret_convenience'
  | 'biz_ret_fashion'
  | 'biz_ret_electronics'
  | 'biz_ret_auto_showroom'
  | 'biz_ret_supermarket'
  | 'biz_tech_software_startup'
  | 'biz_tech_data_center'
  | 'biz_trn_logistics_hub'
  | 'biz_mfg_modern_factory'
  | 'biz_hosp_boutique_homestay'
  // 15 curated distinct Vietnamese architectural assets already in project
  | 'hq_modern_startup'
  | 'hq_thuthiem_office'
  | 'hq_saigon_river_office'
  | 'hq_corporate_boardroom'
  | 'hq_financial_center'
  | 'vn_landmark81_saigon'
  | 'vn_empire_city_thuthiem'
  | 'vn_keangnam_landmark72'
  | 'vn_lotte_hanoi'
  | 'vn_sala_thuthiem'
  | 'vn_sun_cosmo_danang'
  | 'district_central_financial'
  | 'district_industrial_zone'
  | 'district_luxury_bay'
  | 'district_riverside';

export type VisualAssetStatus =
  | 'BESPOKE_GENERATED'
  | 'CURATED_ARCHITECTURAL'
  | 'SHARED_ARCHETYPE_FALLBACK';

export interface BusinessVisualRegistryEntry {
  businessTypeId: string;
  displayName: string;
  industry: V4BusinessIndustry;
  archetype: BuildingArchetypeId;
  catalogAssetKey: BusinessCatalogAssetKey;
  openingSceneAssetKey: BusinessCatalogAssetKey;
  upgradePreviewAssetKey: BusinessCatalogAssetKey;
  brandAccentHex: string;
  architecturalNote: string;
  assetStatus: VisualAssetStatus;
  /** Used for procedural isometric sprite flavor variations within shared archetype */
  spriteVariant: number;
}

/**
 * Single Source of Truth mapping ALL 43 authoritative V4Catalog businessTypeIds
 * to their architectural archetype, unique catalog artwork, and honest assetStatus.
 */
export const BUSINESS_VISUAL_REGISTRY: Record<string, BusinessVisualRegistryEntry> = {
  // =========================================================================
  // F&B (6) — ALL 6 HAVE BESPOKE GENERATED DISTINCT ARCHITECTURAL CATALOG ART
  // =========================================================================
  fnb_coffee_cart: {
    businessTypeId: 'fnb_coffee_cart',
    displayName: 'Xe cà phê mang đi',
    industry: 'FNB',
    archetype: 'STREET_KIOSK',
    catalogAssetKey: 'biz_fnb_coffee_cart',
    openingSceneAssetKey: 'biz_fnb_coffee_cart',
    upgradePreviewAssetKey: 'biz_fnb_coffee_shop',
    brandAccentHex: '#2E6F5E',
    architecturalNote: 'Quầy gỗ gọn, máy pha espresso và mái che sọc vỉa hè Sài Gòn',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  fnb_coffee_shop: {
    businessTypeId: 'fnb_coffee_shop',
    displayName: 'Quán cà phê',
    industry: 'FNB',
    archetype: 'CAFE_SHOPHOUSE',
    catalogAssetKey: 'biz_fnb_coffee_shop',
    openingSceneAssetKey: 'biz_fnb_coffee_shop',
    upgradePreviewAssetKey: 'biz_fnb_coffee_shop',
    brandAccentHex: '#B67A45',
    architecturalNote: 'Nhà phố Sài Gòn 2 tầng, cửa kính khung thép và cây xanh ban công',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  fnb_milk_tea: {
    businessTypeId: 'fnb_milk_tea',
    displayName: 'Tiệm trà sữa',
    industry: 'FNB',
    archetype: 'MILK_TEA_SHOP',
    catalogAssetKey: 'biz_fnb_milk_tea',
    openingSceneAssetKey: 'biz_fnb_milk_tea',
    upgradePreviewAssetKey: 'biz_fnb_milk_tea',
    brandAccentHex: '#7DA88B',
    architecturalNote: 'Mặt tiền kem phối xanh pastel, quầy takeaway kính cong trẻ trung',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  fnb_vn_eatery: {
    businessTypeId: 'fnb_vn_eatery',
    displayName: 'Quán ăn Việt Nam',
    industry: 'FNB',
    archetype: 'EATERY_RESTAURANT',
    catalogAssetKey: 'biz_fnb_vn_eatery',
    openingSceneAssetKey: 'biz_fnb_vn_eatery',
    upgradePreviewAssetKey: 'biz_fnb_restaurant',
    brandAccentHex: '#C25B3F',
    architecturalNote: 'Nhà phố ngói đỏ, quầy bếp mở gần gũi và không gian bàn gỗ truyền thống',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  fnb_restaurant: {
    businessTypeId: 'fnb_restaurant',
    displayName: 'Nhà hàng',
    industry: 'FNB',
    archetype: 'EATERY_RESTAURANT',
    catalogAssetKey: 'biz_fnb_restaurant',
    openingSceneAssetKey: 'biz_fnb_restaurant',
    upgradePreviewAssetKey: 'biz_fnb_fine_dining',
    brandAccentHex: '#B8723E',
    architecturalNote: 'Nhà hàng 2 tầng mặt tiền ốp gỗ đá, đèn lồng ấm và sảnh tiếp khách rộng',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 1,
  },
  fnb_fine_dining: {
    businessTypeId: 'fnb_fine_dining',
    displayName: 'Nhà hàng cao cấp',
    industry: 'FNB',
    archetype: 'FINE_DINING_VILLA',
    catalogAssetKey: 'biz_fnb_fine_dining',
    openingSceneAssetKey: 'biz_fnb_fine_dining',
    upgradePreviewAssetKey: 'biz_fnb_fine_dining',
    brandAccentHex: '#C79B4B',
    architecturalNote: 'Gian kính khung đồng sang trọng, sân vườn hồ cá Koi và ánh sáng fine dining',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },

  // =========================================================================
  // RETAIL (6) — 5 BESPOKE GENERATED + 1 CURATED LANDMARK MALL
  // =========================================================================
  ret_convenience: {
    businessTypeId: 'ret_convenience',
    displayName: 'Cửa hàng tiện lợi',
    industry: 'RETAIL',
    archetype: 'RETAIL_STORE',
    catalogAssetKey: 'biz_ret_convenience',
    openingSceneAssetKey: 'biz_ret_convenience',
    upgradePreviewAssetKey: 'biz_ret_supermarket',
    brandAccentHex: '#3B82A6',
    architecturalNote: 'Góc phố 24/7 sáng sủa, vách kính mở rộng và mái hiên thương mại',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  ret_fashion: {
    businessTypeId: 'ret_fashion',
    displayName: 'Cửa hàng thời trang',
    industry: 'RETAIL',
    archetype: 'RETAIL_STORE',
    catalogAssetKey: 'biz_ret_fashion',
    openingSceneAssetKey: 'biz_ret_fashion',
    upgradePreviewAssetKey: 'biz_ret_fashion',
    brandAccentHex: '#A67C5B',
    architecturalNote: 'Boutique đá travertine Quận 1 với cửa vòm cao và tủ kính trưng bày',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 1,
  },
  ret_electronics: {
    businessTypeId: 'ret_electronics',
    displayName: 'Cửa hàng điện tử',
    industry: 'RETAIL',
    archetype: 'COMMERCIAL_SHOWROOM',
    catalogAssetKey: 'biz_ret_electronics',
    openingSceneAssetKey: 'biz_ret_electronics',
    upgradePreviewAssetKey: 'biz_ret_electronics',
    brandAccentHex: '#4A7FA7',
    architecturalNote: 'Mặt dựng nhôm kính tối giản, không gian trưng bày thiết bị công nghệ',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  ret_auto_showroom: {
    businessTypeId: 'ret_auto_showroom',
    displayName: 'Showroom ô tô',
    industry: 'RETAIL',
    archetype: 'COMMERCIAL_SHOWROOM',
    catalogAssetKey: 'biz_ret_auto_showroom',
    openingSceneAssetKey: 'biz_ret_auto_showroom',
    upgradePreviewAssetKey: 'biz_ret_auto_showroom',
    brandAccentHex: '#465A6E',
    architecturalNote: 'Showroom kính khổ lớn mặt đại lộ với mái vươn và khu trưng bày xe',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 1,
  },
  ret_supermarket: {
    businessTypeId: 'ret_supermarket',
    displayName: 'Siêu thị',
    industry: 'RETAIL',
    archetype: 'COMMERCIAL_SHOWROOM',
    catalogAssetKey: 'biz_ret_supermarket',
    openingSceneAssetKey: 'biz_ret_supermarket',
    upgradePreviewAssetKey: 'vn_lotte_hanoi',
    brandAccentHex: '#3B8A63',
    architecturalNote: 'Khối siêu thị đô thị hiện đại, lam xanh sinh thái và sảnh đón lớn',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 2,
  },
  ret_shopping_mall: {
    businessTypeId: 'ret_shopping_mall',
    displayName: 'Trung tâm thương mại',
    industry: 'RETAIL',
    archetype: 'COMMERCIAL_SHOWROOM',
    catalogAssetKey: 'vn_lotte_hanoi',
    openingSceneAssetKey: 'vn_lotte_hanoi',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#C59A53',
    architecturalNote: 'Tổ hợp thương mại đa tầng quy mô đô thị lớn',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 3,
  },

  // =========================================================================
  // TECHNOLOGY (6) — 2 BESPOKE + 4 CURATED DISTINCT OFFICES
  // =========================================================================
  tech_web_agency: {
    businessTypeId: 'tech_web_agency',
    displayName: 'Công ty thiết kế website',
    industry: 'TECHNOLOGY',
    archetype: 'STARTUP_OFFICE',
    catalogAssetKey: 'hq_modern_startup',
    openingSceneAssetKey: 'hq_modern_startup',
    upgradePreviewAssetKey: 'hq_thuthiem_office',
    brandAccentHex: '#3E8E8E',
    architecturalNote: 'Studio sáng tạo gọn nhẹ cho đội ngũ thiết kế sản phẩm số',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 0,
  },
  tech_software_startup: {
    businessTypeId: 'tech_software_startup',
    displayName: 'Startup phần mềm',
    industry: 'TECHNOLOGY',
    archetype: 'STARTUP_OFFICE',
    catalogAssetKey: 'biz_tech_software_startup',
    openingSceneAssetKey: 'biz_tech_software_startup',
    upgradePreviewAssetKey: 'hq_thuthiem_office',
    brandAccentHex: '#2F8F83',
    architecturalNote: 'Văn phòng loft sáng thoáng với bàn kỹ sư và phòng họp kính',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 1,
  },
  tech_game_studio: {
    businessTypeId: 'tech_game_studio',
    displayName: 'Studio phát triển game',
    industry: 'TECHNOLOGY',
    archetype: 'STARTUP_OFFICE',
    catalogAssetKey: 'hq_thuthiem_office',
    openingSceneAssetKey: 'hq_thuthiem_office',
    upgradePreviewAssetKey: 'hq_saigon_river_office',
    brandAccentHex: '#6378B5',
    architecturalNote: 'Không gian studio đa màn hình tại khu công nghệ sáng tạo',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 2,
  },
  tech_ecommerce: {
    businessTypeId: 'tech_ecommerce',
    displayName: 'Công ty thương mại điện tử',
    industry: 'TECHNOLOGY',
    archetype: 'OFFICE_TOWER',
    catalogAssetKey: 'hq_saigon_river_office',
    openingSceneAssetKey: 'hq_saigon_river_office',
    upgradePreviewAssetKey: 'vn_empire_city_thuthiem',
    brandAccentHex: '#3A7CA5',
    architecturalNote: 'Tòa văn phòng điều phối thương mại số kết nối kho vận đa vùng',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 0,
  },
  tech_enterprise_saas: {
    businessTypeId: 'tech_enterprise_saas',
    displayName: 'Công ty phần mềm doanh nghiệp',
    industry: 'TECHNOLOGY',
    archetype: 'OFFICE_TOWER',
    catalogAssetKey: 'vn_empire_city_thuthiem',
    openingSceneAssetKey: 'vn_empire_city_thuthiem',
    upgradePreviewAssetKey: 'vn_keangnam_landmark72',
    brandAccentHex: '#2D6B9E',
    architecturalNote: 'Cao ốc công nghệ doanh nghiệp hiện đại khu đô thị mới',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },
  tech_data_center: {
    businessTypeId: 'tech_data_center',
    displayName: 'Trung tâm dữ liệu',
    industry: 'TECHNOLOGY',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_tech_data_center',
    openingSceneAssetKey: 'biz_tech_data_center',
    upgradePreviewAssetKey: 'biz_tech_data_center',
    brandAccentHex: '#4E6B82',
    architecturalNote: 'Khuôn viên hạ tầng máy chủ Tier-III lam nhôm an ninh và hệ thống làm mát',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 2,
  },

  // =========================================================================
  // TRANSPORTATION (6) — 1 BESPOKE LOGISTICS + CURATED + SHARED FALLBACKS
  // =========================================================================
  trn_delivery: {
    businessTypeId: 'trn_delivery',
    displayName: 'Dịch vụ giao hàng',
    industry: 'TRANSPORTATION',
    archetype: 'LOGISTICS_WAREHOUSE',
    catalogAssetKey: 'biz_trn_logistics_hub',
    openingSceneAssetKey: 'biz_trn_logistics_hub',
    upgradePreviewAssetKey: 'biz_trn_logistics_hub',
    brandAccentHex: '#D17A3A',
    architecturalNote: 'Trạm trung chuyển giao nhận nội thành với bãi xe giao hàng gọn gàng',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 0,
  },
  trn_taxi: {
    businessTypeId: 'trn_taxi',
    displayName: 'Công ty taxi',
    industry: 'TRANSPORTATION',
    archetype: 'LOGISTICS_WAREHOUSE',
    catalogAssetKey: 'district_riverside',
    openingSceneAssetKey: 'district_riverside',
    upgradePreviewAssetKey: 'biz_ret_auto_showroom',
    brandAccentHex: '#C9963B',
    architecturalNote: 'Trung tâm điều phối và bãi đỗ đội xe vận tải hành khách đô thị',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },
  trn_road_freight: {
    businessTypeId: 'trn_road_freight',
    displayName: 'Công ty vận tải đường bộ',
    industry: 'TRANSPORTATION',
    archetype: 'LOGISTICS_WAREHOUSE',
    catalogAssetKey: 'district_industrial_zone',
    openingSceneAssetKey: 'district_industrial_zone',
    upgradePreviewAssetKey: 'biz_trn_logistics_hub',
    brandAccentHex: '#B86A35',
    architecturalNote: 'Bãi xe tải đường dài và trạm bảo dưỡng vận tải liên tỉnh',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 2,
  },
  trn_logistics: {
    businessTypeId: 'trn_logistics',
    displayName: 'Công ty logistics',
    industry: 'TRANSPORTATION',
    archetype: 'LOGISTICS_WAREHOUSE',
    catalogAssetKey: 'biz_trn_logistics_hub',
    openingSceneAssetKey: 'biz_trn_logistics_hub',
    upgradePreviewAssetKey: 'biz_trn_logistics_hub',
    brandAccentHex: '#C87334',
    architecturalNote: 'Trung tâm kho vận mái điện mặt trời với hàng chục cửa xuất nhập container',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  trn_shipping: {
    businessTypeId: 'trn_shipping',
    displayName: 'Công ty vận tải biển',
    industry: 'TRANSPORTATION',
    archetype: 'LOGISTICS_WAREHOUSE',
    catalogAssetKey: 'district_industrial_zone',
    openingSceneAssetKey: 'district_industrial_zone',
    upgradePreviewAssetKey: 'district_industrial_zone',
    brandAccentHex: '#356C8C',
    architecturalNote: 'Trụ sở khai thác cảng container và tuyến hàng hải ven biển',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 3,
  },
  trn_airline: {
    businessTypeId: 'trn_airline',
    displayName: 'Hãng hàng không',
    industry: 'TRANSPORTATION',
    archetype: 'CORPORATE_HQ',
    catalogAssetKey: 'vn_sun_cosmo_danang',
    openingSceneAssetKey: 'vn_sun_cosmo_danang',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#2E6299',
    architecturalNote: 'Trung tâm điều hành khai thác bay và trụ sở hãng hàng không',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },

  // =========================================================================
  // MANUFACTURING (6) — 1 BESPOKE FACTORY + ARCHETYPE VARIANTS
  // =========================================================================
  mfg_garment: {
    businessTypeId: 'mfg_garment',
    displayName: 'Xưởng may',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_mfg_modern_factory',
    openingSceneAssetKey: 'biz_mfg_modern_factory',
    upgradePreviewAssetKey: 'biz_mfg_modern_factory',
    brandAccentHex: '#5A788A',
    architecturalNote: 'Nhà xưởng gia công may mặc mái lấy sáng tự nhiên',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 0,
  },
  mfg_furniture: {
    businessTypeId: 'mfg_furniture',
    displayName: 'Xưởng nội thất',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_mfg_modern_factory',
    openingSceneAssetKey: 'biz_mfg_modern_factory',
    upgradePreviewAssetKey: 'biz_mfg_modern_factory',
    brandAccentHex: '#8A6748',
    architecturalNote: 'Xưởng chế tác nội thất gỗ và hoàn thiện vật liệu công trình',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 1,
  },
  mfg_food_plant: {
    businessTypeId: 'mfg_food_plant',
    displayName: 'Nhà máy thực phẩm',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_mfg_modern_factory',
    openingSceneAssetKey: 'biz_mfg_modern_factory',
    upgradePreviewAssetKey: 'biz_mfg_modern_factory',
    brandAccentHex: '#4E8268',
    architecturalNote: 'Nhà máy chế biến thực phẩm chuẩn khu công nghiệp hiện đại',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  mfg_electronics_plant: {
    businessTypeId: 'mfg_electronics_plant',
    displayName: 'Nhà máy điện tử',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_tech_data_center',
    openingSceneAssetKey: 'biz_tech_data_center',
    upgradePreviewAssetKey: 'biz_mfg_modern_factory',
    brandAccentHex: '#43698C',
    architecturalNote: 'Cơ sở lắp ráp linh kiện điện tử công nghệ cao',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 2,
  },
  mfg_auto_plant: {
    businessTypeId: 'mfg_auto_plant',
    displayName: 'Nhà máy sản xuất ô tô',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'district_industrial_zone',
    openingSceneAssetKey: 'district_industrial_zone',
    upgradePreviewAssetKey: 'biz_mfg_modern_factory',
    brandAccentHex: '#506478',
    architecturalNote: 'Tổ hợp dây chuyền tự động hóa lắp ráp ô tô quy mô lớn',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 3,
  },
  mfg_semiconductor: {
    businessTypeId: 'mfg_semiconductor',
    displayName: 'Nhà máy bán dẫn',
    industry: 'MANUFACTURING',
    archetype: 'INDUSTRIAL_FACILITY',
    catalogAssetKey: 'biz_tech_data_center',
    openingSceneAssetKey: 'biz_tech_data_center',
    upgradePreviewAssetKey: 'biz_tech_data_center',
    brandAccentHex: '#3A5F80',
    architecturalNote: 'Tổ hợp phòng sạch sản xuất vi mạch bán dẫn siêu chính xác',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 2,
  },

  // =========================================================================
  // HOSPITALITY (5) — 1 BESPOKE HOMESTAY + CURATED COASTAL & URBAN HOTELS
  // =========================================================================
  hosp_homestay: {
    businessTypeId: 'hosp_homestay',
    displayName: 'Homestay nghỉ dưỡng',
    industry: 'HOSPITALITY',
    archetype: 'HOTEL_RESORT',
    catalogAssetKey: 'biz_hosp_boutique_homestay',
    openingSceneAssetKey: 'biz_hosp_boutique_homestay',
    upgradePreviewAssetKey: 'biz_hosp_boutique_homestay',
    brandAccentHex: '#B67B48',
    architecturalNote: 'Biệt thự vườn lam gỗ, ngói đỏ và sân nghỉ dưỡng đậm bản sắc Việt',
    assetStatus: 'BESPOKE_GENERATED',
    spriteVariant: 0,
  },
  hosp_mini_hotel: {
    businessTypeId: 'hosp_mini_hotel',
    displayName: 'Khách sạn mini',
    industry: 'HOSPITALITY',
    archetype: 'HOTEL_RESORT',
    catalogAssetKey: 'vn_sala_thuthiem',
    openingSceneAssetKey: 'vn_sala_thuthiem',
    upgradePreviewAssetKey: 'vn_sun_cosmo_danang',
    brandAccentHex: '#C29152',
    architecturalNote: 'Khách sạn boutique đô thị tiện nghi tại khu trung tâm',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },
  hosp_hotel_4star: {
    businessTypeId: 'hosp_hotel_4star',
    displayName: 'Khách sạn 4 sao',
    industry: 'HOSPITALITY',
    archetype: 'HOTEL_RESORT',
    catalogAssetKey: 'vn_sun_cosmo_danang',
    openingSceneAssetKey: 'vn_sun_cosmo_danang',
    upgradePreviewAssetKey: 'district_luxury_bay',
    brandAccentHex: '#C89B54',
    architecturalNote: 'Khách sạn thương mại 4 sao tích hợp sảnh hội nghị và nhà hàng',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 2,
  },
  hosp_hotel_5star: {
    businessTypeId: 'hosp_hotel_5star',
    displayName: 'Khách sạn 5 sao',
    industry: 'HOSPITALITY',
    archetype: 'HOTEL_RESORT',
    catalogAssetKey: 'vn_landmark81_saigon',
    openingSceneAssetKey: 'vn_landmark81_saigon',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#D4AF6A',
    architecturalNote: 'Tháp khách sạn biểu tượng 5 sao hướng sông Sài Gòn',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 3,
  },
  hosp_luxury_resort: {
    businessTypeId: 'hosp_luxury_resort',
    displayName: 'Resort cao cấp',
    industry: 'HOSPITALITY',
    archetype: 'HOTEL_RESORT',
    catalogAssetKey: 'district_luxury_bay',
    openingSceneAssetKey: 'district_luxury_bay',
    upgradePreviewAssetKey: 'district_luxury_bay',
    brandAccentHex: '#CFA052',
    architecturalNote: 'Quần thể nghỉ dưỡng ven vịnh đẳng cấp 5 sao+',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 3,
  },

  // =========================================================================
  // REAL ESTATE (4)
  // =========================================================================
  re_apartment_mgmt: {
    businessTypeId: 're_apartment_mgmt',
    displayName: 'Công ty quản lý căn hộ',
    industry: 'REAL_ESTATE',
    archetype: 'STARTUP_OFFICE',
    catalogAssetKey: 'vn_sala_thuthiem',
    openingSceneAssetKey: 'vn_sala_thuthiem',
    upgradePreviewAssetKey: 'vn_empire_city_thuthiem',
    brandAccentHex: '#52807A',
    architecturalNote: 'Văn phòng ban quản lý và vận hành khu căn hộ đô thị',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 0,
  },
  re_construction: {
    businessTypeId: 're_construction',
    displayName: 'Công ty xây dựng',
    industry: 'REAL_ESTATE',
    archetype: 'OFFICE_TOWER',
    catalogAssetKey: 'hq_corporate_boardroom',
    openingSceneAssetKey: 'hq_corporate_boardroom',
    upgradePreviewAssetKey: 'vn_keangnam_landmark72',
    brandAccentHex: '#B87E3C',
    architecturalNote: 'Văn phòng tổng thầu thi công hạ tầng và cao ốc đô thị',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 2,
  },
  re_developer: {
    businessTypeId: 're_developer',
    displayName: 'Công ty phát triển bất động sản',
    industry: 'REAL_ESTATE',
    archetype: 'OFFICE_TOWER',
    catalogAssetKey: 'vn_keangnam_landmark72',
    openingSceneAssetKey: 'vn_keangnam_landmark72',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#C59A53',
    architecturalNote: 'Trung tâm phát triển dự án khu phức hợp và nhà ở cao tầng',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },
  re_conglomerate: {
    businessTypeId: 're_conglomerate',
    displayName: 'Tập đoàn bất động sản',
    industry: 'REAL_ESTATE',
    archetype: 'CORPORATE_HQ',
    catalogAssetKey: 'vn_landmark81_saigon',
    openingSceneAssetKey: 'vn_landmark81_saigon',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#D4AF6A',
    architecturalNote: 'Trụ sở tập đoàn phát triển đại đô thị quy mô quốc gia',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 0,
  },

  // =========================================================================
  // FINANCE (4)
  // =========================================================================
  fin_asset_mgmt: {
    businessTypeId: 'fin_asset_mgmt',
    displayName: 'Công ty quản lý tài sản',
    industry: 'FINANCE',
    archetype: 'STARTUP_OFFICE',
    catalogAssetKey: 'hq_financial_center',
    openingSceneAssetKey: 'hq_financial_center',
    upgradePreviewAssetKey: 'district_central_financial',
    brandAccentHex: '#B9924C',
    architecturalNote: 'Văn phòng tư vấn quản lý tài sản chuẩn khu tài chính Quận 1',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 1,
  },
  fin_investment_firm: {
    businessTypeId: 'fin_investment_firm',
    displayName: 'Công ty đầu tư',
    industry: 'FINANCE',
    archetype: 'OFFICE_TOWER',
    catalogAssetKey: 'hq_corporate_boardroom',
    openingSceneAssetKey: 'hq_corporate_boardroom',
    upgradePreviewAssetKey: 'district_central_financial',
    brandAccentHex: '#C59C55',
    architecturalNote: 'Định chế đầu tư cổ phần tư nhân và cấu trúc vốn doanh nghiệp',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 2,
  },
  fin_fund_house: {
    businessTypeId: 'fin_fund_house',
    displayName: 'Công ty quản lý quỹ đầu tư',
    industry: 'FINANCE',
    archetype: 'CORPORATE_HQ',
    catalogAssetKey: 'district_central_financial',
    openingSceneAssetKey: 'district_central_financial',
    upgradePreviewAssetKey: 'district_central_financial',
    brandAccentHex: '#D0A55A',
    architecturalNote: 'Trụ sở quản trị quỹ đầu tư tại trung tâm tài chính Sài Gòn',
    assetStatus: 'CURATED_ARCHITECTURAL',
    spriteVariant: 0,
  },
  fin_conglomerate: {
    businessTypeId: 'fin_conglomerate',
    displayName: 'Tập đoàn tài chính',
    industry: 'FINANCE',
    archetype: 'CORPORATE_HQ',
    catalogAssetKey: 'district_central_financial',
    openingSceneAssetKey: 'district_central_financial',
    upgradePreviewAssetKey: 'vn_landmark81_saigon',
    brandAccentHex: '#D4AF6A',
    architecturalNote: 'Tháp trụ sở tập đoàn tài chính đa năng',
    assetStatus: 'SHARED_ARCHETYPE_FALLBACK',
    spriteVariant: 1,
  },
};

export function getBusinessVisualEntry(
  businessTypeId: string,
  fallbackIndustry?: V4BusinessIndustry,
): BusinessVisualRegistryEntry {
  const direct = BUSINESS_VISUAL_REGISTRY[businessTypeId];
  if (direct) return direct;

  // Deterministic industry-level fallback ONLY for unknown future catalog IDs
  const fallbackByIndustry: Record<V4BusinessIndustry, string> = {
    FNB: 'fnb_coffee_shop',
    RETAIL: 'ret_convenience',
    TECHNOLOGY: 'tech_software_startup',
    TRANSPORTATION: 'trn_logistics',
    MANUFACTURING: 'mfg_food_plant',
    HOSPITALITY: 'hosp_homestay',
    REAL_ESTATE: 're_developer',
    FINANCE: 'fin_asset_mgmt',
  };
  const fallbackKey = fallbackIndustry ? fallbackByIndustry[fallbackIndustry] : 'tech_software_startup';
  return BUSINESS_VISUAL_REGISTRY[fallbackKey];
}

export interface CatalogAssetAuditReport {
  totalCatalogTypes: number;
  bespokeGeneratedCount: number;
  curatedArchitecturalCount: number;
  sharedFallbackCount: number;
  distinctCatalogAssetsUsed: number;
  bespokeTypeIds: string[];
  curatedTypeIds: string[];
  sharedFallbackTypeIds: string[];
}

export function getCatalogAssetAuditReport(): CatalogAssetAuditReport {
  const entries = Object.values(BUSINESS_VISUAL_REGISTRY);
  const bespoke = entries.filter((e) => e.assetStatus === 'BESPOKE_GENERATED');
  const curated = entries.filter((e) => e.assetStatus === 'CURATED_ARCHITECTURAL');
  const shared = entries.filter((e) => e.assetStatus === 'SHARED_ARCHETYPE_FALLBACK');
  const distinctKeys = new Set(entries.map((e) => e.catalogAssetKey));

  return {
    totalCatalogTypes: entries.length,
    bespokeGeneratedCount: bespoke.length,
    curatedArchitecturalCount: curated.length,
    sharedFallbackCount: shared.length,
    distinctCatalogAssetsUsed: distinctKeys.size,
    bespokeTypeIds: bespoke.map((e) => e.businessTypeId),
    curatedTypeIds: curated.map((e) => e.businessTypeId),
    sharedFallbackTypeIds: shared.map((e) => e.businessTypeId),
  };
}
