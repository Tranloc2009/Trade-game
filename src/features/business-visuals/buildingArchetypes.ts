import type { V4BusinessIndustry } from '../../../shared/contracts/v4';

export type BuildingArchetypeId =
  | 'STREET_KIOSK'
  | 'CAFE_SHOPHOUSE'
  | 'MILK_TEA_SHOP'
  | 'EATERY_RESTAURANT'
  | 'FINE_DINING_VILLA'
  | 'RETAIL_STORE'
  | 'COMMERCIAL_SHOWROOM'
  | 'STARTUP_OFFICE'
  | 'OFFICE_TOWER'
  | 'INDUSTRIAL_FACILITY'
  | 'LOGISTICS_WAREHOUSE'
  | 'HOTEL_RESORT'
  | 'CORPORATE_HQ';

export type SaigonDistrictZone =
  | 'DISTRICT_1_CORE'
  | 'COMMERCIAL_STREET'
  | 'INNOVATION_QUARTER'
  | 'FINANCIAL_CENTER'
  | 'INDUSTRIAL_RIVERSIDE'
  | 'LUXURY_MARINA';

export interface BuildingArchetypeSpec {
  id: BuildingArchetypeId;
  labelVi: string;
  architecturalSignatureVi: string;
  preferredDistricts: SaigonDistrictZone[];
  footprintTiles: { w: number; h: number };
  baseHeightPx: number;
  defaultAccentHex: string;
  roofToneHex: string;
  facadeToneHex: string;
  industries: V4BusinessIndustry[];
}

export const BUILDING_ARCHETYPES: Record<BuildingArchetypeId, BuildingArchetypeSpec> = {
  STREET_KIOSK: {
    id: 'STREET_KIOSK',
    labelVi: 'Quầy phố & Kiosk mang đi',
    architecturalSignatureVi: 'Quầy gỗ gọn gàng, mái hiên vải sọc và máy pha chế vỉa hè đô thị',
    preferredDistricts: ['COMMERCIAL_STREET', 'DISTRICT_1_CORE', 'INNOVATION_QUARTER'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 42,
    defaultAccentHex: '#2E6F5E',
    roofToneHex: '#2A5C4E',
    facadeToneHex: '#D8B68A',
    industries: ['FNB'],
  },
  CAFE_SHOPHOUSE: {
    id: 'CAFE_SHOPHOUSE',
    labelVi: 'Nhà phố Cà phê Sài Gòn',
    architecturalSignatureVi: 'Nhà phố khung thép kính, nội thất gỗ ấm và ban công phủ cây xanh',
    preferredDistricts: ['DISTRICT_1_CORE', 'COMMERCIAL_STREET', 'INNOVATION_QUARTER'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 68,
    defaultAccentHex: '#B67A45',
    roofToneHex: '#A65239',
    facadeToneHex: '#E5D5BE',
    industries: ['FNB'],
  },
  MILK_TEA_SHOP: {
    id: 'MILK_TEA_SHOP',
    labelVi: 'Cửa hàng Đồ uống Trẻ trung',
    architecturalSignatureVi: 'Mặt tiền kem sáng phối xanh xô thơm, quầy gọi món kính cong hiện đại',
    preferredDistricts: ['COMMERCIAL_STREET', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 62,
    defaultAccentHex: '#7DA88B',
    roofToneHex: '#6F987D',
    facadeToneHex: '#F2EDE2',
    industries: ['FNB'],
  },
  EATERY_RESTAURANT: {
    id: 'EATERY_RESTAURANT',
    labelVi: 'Quán ăn & Nhà hàng Đô thị',
    architecturalSignatureVi: 'Mặt tiền rộng ốp gỗ đá, mái ngói hiện đại và sảnh phục vụ ấm cúng',
    preferredDistricts: ['COMMERCIAL_STREET', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 72,
    defaultAccentHex: '#C25B3F',
    roofToneHex: '#9E4632',
    facadeToneHex: '#E7D4BA',
    industries: ['FNB'],
  },
  FINE_DINING_VILLA: {
    id: 'FINE_DINING_VILLA',
    labelVi: 'Biệt thự Ẩm thực Cao cấp',
    architecturalSignatureVi: 'Gian kính khung đồng sẫm, mái dốc kiến trúc đương đại và sân vườn cảnh quan',
    preferredDistricts: ['LUXURY_MARINA', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 78,
    defaultAccentHex: '#C79B4B',
    roofToneHex: '#3B342D',
    facadeToneHex: '#D8CDBF',
    industries: ['FNB'],
  },
  RETAIL_STORE: {
    id: 'RETAIL_STORE',
    labelVi: 'Cửa hàng Bán lẻ Đô thị',
    architecturalSignatureVi: 'Mặt kính trưng bày lớn, mái che thương mại gọn sắc nét và lối vào rộng',
    preferredDistricts: ['COMMERCIAL_STREET', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 66,
    defaultAccentHex: '#3B82A6',
    roofToneHex: '#46586B',
    facadeToneHex: '#E8ECEF',
    industries: ['RETAIL'],
  },
  COMMERCIAL_SHOWROOM: {
    id: 'COMMERCIAL_SHOWROOM',
    labelVi: 'Showroom & Trung tâm Thương mại',
    architecturalSignatureVi: 'Mặt dựng kính khổ lớn, mái vươn hiện đại và sảnh trưng bày sang trọng',
    preferredDistricts: ['COMMERCIAL_STREET', 'LUXURY_MARINA', 'FINANCIAL_CENTER'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 86,
    defaultAccentHex: '#4D7EA8',
    roofToneHex: '#394B5C',
    facadeToneHex: '#DCE5EC',
    industries: ['RETAIL'],
  },
  STARTUP_OFFICE: {
    id: 'STARTUP_OFFICE',
    labelVi: 'Văn phòng Khởi nghiệp & Studio',
    architecturalSignatureVi: 'Tòa nhà văn phòng nhỏ hiện đại với lam gỗ, kính mở và sân thượng xanh',
    preferredDistricts: ['INNOVATION_QUARTER', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 76,
    defaultAccentHex: '#3E8E8E',
    roofToneHex: '#475966',
    facadeToneHex: '#DCE3E6',
    industries: ['TECHNOLOGY', 'REAL_ESTATE', 'FINANCE'],
  },
  OFFICE_TOWER: {
    id: 'OFFICE_TOWER',
    labelVi: 'Tòa nhà Công nghệ & Văn phòng',
    architecturalSignatureVi: 'Khối tháp kính nhôm hiện đại nhiều tầng, hệ lam che nắng chuẩn cao ốc Sài Gòn',
    preferredDistricts: ['INNOVATION_QUARTER', 'FINANCIAL_CENTER'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 112,
    defaultAccentHex: '#3876A8',
    roofToneHex: '#34495E',
    facadeToneHex: '#C9D9E6',
    industries: ['TECHNOLOGY', 'FINANCE', 'REAL_ESTATE'],
  },
  INDUSTRIAL_FACILITY: {
    id: 'INDUSTRIAL_FACILITY',
    labelVi: 'Nhà xưởng & Nhà máy Sản xuất',
    architecturalSignatureVi: 'Mái răng cưa lấy sáng, kết cấu thép tiền chế và khu sản xuất công nghiệp',
    preferredDistricts: ['INDUSTRIAL_RIVERSIDE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 68,
    defaultAccentHex: '#5B7083',
    roofToneHex: '#5A6B78',
    facadeToneHex: '#CFD6DC',
    industries: ['MANUFACTURING', 'TECHNOLOGY'],
  },
  LOGISTICS_WAREHOUSE: {
    id: 'LOGISTICS_WAREHOUSE',
    labelVi: 'Trung tâm Kho vận & Vận tải',
    architecturalSignatureVi: 'Kho bãi thép hiện đại, mái năng lượng mặt trời và dãy cửa xuất nhập hàng',
    preferredDistricts: ['INDUSTRIAL_RIVERSIDE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 64,
    defaultAccentHex: '#D17A3A',
    roofToneHex: '#4E5D6C',
    facadeToneHex: '#D6DCDF',
    industries: ['TRANSPORTATION'],
  },
  HOTEL_RESORT: {
    id: 'HOTEL_RESORT',
    labelVi: 'Lưu trú, Khách sạn & Nghỉ dưỡng',
    architecturalSignatureVi: 'Kiến trúc lưu trú ấm áp với ban công, lam gỗ nhiệt đới và sảnh đón khách',
    preferredDistricts: ['LUXURY_MARINA', 'DISTRICT_1_CORE'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 92,
    defaultAccentHex: '#C58F4B',
    roofToneHex: '#8E5338',
    facadeToneHex: '#EFE4D2',
    industries: ['HOSPITALITY'],
  },
  CORPORATE_HQ: {
    id: 'CORPORATE_HQ',
    labelVi: 'Trụ sở Tài chính & Tập đoàn',
    architecturalSignatureVi: 'Tháp kính đá hoa cương cao tầng với sảnh cột biểu tượng khu trung tâm tài chính',
    preferredDistricts: ['FINANCIAL_CENTER', 'LUXURY_MARINA'],
    footprintTiles: { w: 1, h: 1 },
    baseHeightPx: 132,
    defaultAccentHex: '#D4AF6A',
    roofToneHex: '#2E3B4E',
    facadeToneHex: '#C6D4E1',
    industries: ['FINANCE', 'REAL_ESTATE', 'TRANSPORTATION'],
  },
};

export const BRAND_VISUAL_PALETTES = [
  { id: 'saigon_gold', labelVi: 'Vàng Di sản', hex: '#D4AF6A' },
  { id: 'emerald_jade', labelVi: 'Ngọc Lục bảo', hex: '#2F8F76' },
  { id: 'terracotta', labelVi: 'Đỏ Gạch Sài Gòn', hex: '#C25B3F' },
  { id: 'cobalt_sky', labelVi: 'Xanh Thương mại', hex: '#3B7EA8' },
  { id: 'sage_tea', labelVi: 'Xanh Trà Sữa', hex: '#7DA88B' },
  { id: 'obsidian_bronze', labelVi: 'Đồng Đương đại', hex: '#8F6A43' },
] as const;

export type BrandPaletteId = (typeof BRAND_VISUAL_PALETTES)[number]['id'];
