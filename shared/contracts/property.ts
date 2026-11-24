export type VietnamCityCode =
  | 'HCM'
  | 'HN'
  | 'DN'
  | 'HP'
  | 'CT'
  | 'NT'
  | 'DL'
  | 'PQ'
  | 'VT';

export type VietnamLandmarkImageKey =
  | 'landmark81'
  | 'sala'
  | 'empire_city'
  | 'lotte_hanoi'
  | 'keangnam72'
  | 'sun_cosmo'
  | 'financial'
  | 'riverside'
  | 'industrial'
  | 'luxury';

export interface VietnamCityConfig {
  code: VietnamCityCode;
  name: string;
  shortName: string;
  region: 'Miền Nam' | 'Miền Bắc' | 'Miền Trung';
  status: 'ACTIVE' | 'PLANNED';
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
  description: string;
}

export type LocationVerificationStatus = 'VERIFIED' | 'PENDING_VERIFICATION';

/**
 * LAYER 1: Real-World Reference Location Metadata.
 * Contains strictly verified public geographical/reference data — never real-world sale claims.
 */
export interface RealWorldLocation {
  id: string;
  name: string;
  cityCode: VietnamCityCode;
  city: string;
  districtOrArea: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: LocationVerificationStatus;
  projectCategory: string;
  verifiedOverview: string;
  verifiedFacts: string[];
  sourceName: string;
  sourceUrl: string;
  imageKey: VietnamLandmarkImageKey;
  galleryKeys: VietnamLandmarkImageKey[];
  imageAttribution: string;
  lastVerifiedAt: string;
}

export type PropertyListingStatus = 'UNLISTED' | 'LISTED' | 'IN_AUCTION';
export type PropertyRentalStatus = 'VACANT' | 'RENTED';

export interface PropertyListingRecord {
  id: string;
  propertyId: string;
  sellerId: string;
  sellerName: string;
  askingPriceMinor: number;
  status: 'ACTIVE' | 'CANCELLED' | 'SOLD';
  createdAt: string;
  expiresAt: string;
}

export interface PropertyTransactionRecord {
  id: string;
  propertyId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  executionPriceMinor: number;
  feesMinor: number;
  ledgerTransactionId: string;
  channel: 'DIRECT_LISTING' | 'AUCTION';
  createdAt: string;
}

export interface PropertyRentalAgreement {
  id: string;
  propertyId: string;
  landlordId: string;
  tenantType: 'NPC_MARKET';
  tenantName: string;
  monthlyGrossRentMinor: number;
  monthlyMaintenanceMinor: number;
  monthlyTaxMinor: number;
  occupancyRatePct: number;
  status: 'ACTIVE' | 'TERMINATED';
  startedAt: string;
  exclusive: true;
}

export interface PropertyRentalCycleRecord {
  id: string;
  propertyId: string;
  cycleTimestamp: string;
  status: 'PAID' | 'VACANT';
  grossRentMinor: number;
  maintenanceMinor: number;
  taxMinor: number;
  netRentMinor: number;
  ledgerTransactionId: string | null;
  note: string;
}

export interface CityRealEstateMetrics {
  cityCode: VietnamCityCode;
  cityName: string;
  housingDemandIndex: number; // 60..145
  gameSupplyCount: number;
  listedSupplyCount: number;
  constructionCostIndex: number; // 80..140
  bankLoanRatePct: number;
  avgRentalYieldPct: number;
  infrastructureIndex: number; // 0..100
  vacancyRatePct: number;
  investorSentiment: number; // -100..+100
  marketLiquidityIndex: number; // 0..100
  priceTrendPct: number; // Can be positive or negative
  lastUpdatedAt: string;
}

export interface PropertyMarketEvent {
  id: string;
  cityCode: VietnamCityCode | 'ALL';
  cityLabel: string;
  title: string;
  summary: string;
  impactType:
    | 'INFRASTRUCTURE'
    | 'RENTAL_DEMAND'
    | 'RATE_HIKE'
    | 'CREDIT_TIGHTENING'
    | 'OFFICE_EXPANSION'
    | 'SUPPLY_INCREASE'
    | 'CONSTRUCTION_COST';
  valueDeltaPct: number; // Can be negative or positive
  rentDeltaPct: number;
  vacancyDeltaPct: number;
  isFictionalScenario: true;
  publishedAt: string;
}

export interface PropertyLoanEligibility {
  propertyId: string;
  eligible: boolean;
  reason?: string;
  collateralValueMinor: number;
  ltvLimitPct: number;
  maxLoanMinor: number;
  annualInterestRatePct: number;
  estimatedTermDays: number;
  estimatedInterestMinor: number;
  activeCollateralLoanId: string | null;
}

export interface VietnamPropertyMarketSnapshot {
  cities: VietnamCityConfig[];
  locations: RealWorldLocation[];
  cityMetrics: CityRealEstateMetrics[];
  propertyEvents: PropertyMarketEvent[];
  simulationDisclaimer: string;
}
