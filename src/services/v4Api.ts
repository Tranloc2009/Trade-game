import type { GameClock, NewsItem, PlayerProfile } from '../../shared/contracts/types';
import type {
  AcquisitionOffer,
  BusinessCatalogItem,
  BusinessEntity,
  BusinessLevelSpec,
  BusinessModelType,
  CareerMissionSpec,
  CareerTitleSpec,
  EconomicCalendarItemV4,
  EmployeeRole,
  EmployeeRoleSpec,
  FranchiseAgreement,
  FundGovernanceProposal,
  FundRedemptionRequest,
  FundType,
  GovernanceProposal,
  GovernanceProposalType,
  HoldingCompany,
  InvestmentFund,
  LuxuryCatalogItem,
  LuxuryResaleListing,
  MaDealType,
  MacroSimulationReport,
  OwnedLuxuryAsset,
  PlayerCareerProfile,
  PrivateShareListing,
  SkillNodeSpec,
  UpgradeNodeSpec,
  V4CityCode,
  V4CityConfig,
  V4MacroIndicators,
  WealthRankSpec,
  WorldMacroEventV4,
} from '../../shared/contracts/v4';
import { ApiClientError, getAuthToken, notifyCareerFinancialMutation, resolveApiPath } from './api';

async function v4Request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const targetPath = resolveApiPath(`/api/v4${path}`);
  const res = await fetch(targetPath, { ...init, headers });
  let payload: { ok: boolean; data?: T; error?: { code: string; message: string } };
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError('SERVER_ERROR', 'Máy chủ V4 trả về dữ liệu không hợp lệ.', res.status);
  }
  if (!res.ok || !payload.ok || payload.data === undefined) {
    throw new ApiClientError(
      payload.error?.code ?? 'SERVER_ERROR',
      payload.error?.message ?? 'Yêu cầu thất bại.',
      res.status,
    );
  }
  notifyCareerFinancialMutation(targetPath, init.method);
  return payload.data;
}

export interface V4MacroOverview {
  indicators: V4MacroIndicators;
  activeEvents: WorldMacroEventV4[];
  historicalEvents: WorldMacroEventV4[];
  calendar: EconomicCalendarItemV4[];
  indicatorHistory: Array<{
    cycleId: number;
    gameDay: number;
    timestamp: string;
    phase: V4MacroIndicators['phase'];
    gdpGrowthPct: number;
    inflationPct: number;
    interestRatePct: number;
    consumerConfidenceIndex: number;
    energyPriceIndex: number;
    propertyDemandIndex: number;
  }>;
  gameClock?: GameClock;
  news?: NewsItem[];
}

export const V4Service = {
  getEmpireOverview: () =>
    v4Request<{
      profile: PlayerProfile | null;
      career: PlayerCareerProfile | null;
      macro: V4MacroOverview;
      summary: {
        totalBusinessesInWorld: number;
        myBusinessesCount: number;
        myHoldingsCount: number;
        totalFundsInWorld: number;
        myLuxuryCount: number;
        openPrivateListingsCount: number;
        activeMaOffersCount: number;
      };
      myBusinesses: BusinessEntity[];
      myHoldings: HoldingCompany[];
      topFunds: InvestmentFund[];
      myLuxuryAssets: OwnedLuxuryAsset[];
    }>('/empire/overview'),

  // Businesses
  getBusinessesOverview: () =>
    v4Request<{
      businesses: BusinessEntity[];
      franchises: FranchiseAgreement[];
      cities: V4CityConfig[];
      catalog: BusinessCatalogItem[];
      levels: BusinessLevelSpec[];
      upgradeNodes: UpgradeNodeSpec[];
      employeeRoles: EmployeeRoleSpec[];
    }>('/businesses'),

  createBusiness: (payload: {
    businessTypeId: string;
    businessName: string;
    ticker: string;
    cityCode: V4CityCode;
    locationLabel?: string;
    businessModel?: BusinessModelType;
    initialCapitalCR: number;
    idempotencyKey?: string;
  }) =>
    v4Request<{ business: BusinessEntity; profile: PlayerProfile }>('/businesses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  injectCapital: (businessId: string, amountCR: number) =>
    v4Request<{ business: BusinessEntity; profile: PlayerProfile }>(
      `/businesses/${encodeURIComponent(businessId)}/inject-capital`,
      { method: 'POST', body: JSON.stringify({ amountCR }) },
    ),

  updateBusinessSettings: (
    businessId: string,
    payload: {
      sellingPriceCR?: number;
      status?: 'ACTIVE' | 'SUSPENDED' | 'RESTRUCTURING';
      franchiseEnabled?: boolean;
      franchiseFeeCR?: number;
      franchiseRoyaltyPct?: number;
    },
  ) =>
    v4Request<{ business: BusinessEntity }>(`/businesses/${encodeURIComponent(businessId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  manageEmployees: (
    businessId: string,
    payload: {
      action: 'HIRE' | 'FIRE' | 'TRAIN' | 'SET_SALARY';
      role: EmployeeRole;
      count?: number;
      salaryCR?: number;
    },
  ) =>
    v4Request<{ business: BusinessEntity }>(`/businesses/${encodeURIComponent(businessId)}/employees`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upgradeBusinessLevel: (businessId: string) =>
    v4Request<{ business: BusinessEntity; profile: PlayerProfile }>(
      `/businesses/${encodeURIComponent(businessId)}/upgrade-level`,
      { method: 'POST' },
    ),

  purchaseUpgradeNode: (businessId: string, nodeId: string) =>
    v4Request<{ business: BusinessEntity }>(`/businesses/${encodeURIComponent(businessId)}/upgrade-node`, {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    }),

  openBranch: (businessId: string, cityCode: V4CityCode, locationLabel?: string) =>
    v4Request<{ business: BusinessEntity }>(`/businesses/${encodeURIComponent(businessId)}/branches`, {
      method: 'POST',
      body: JSON.stringify({ cityCode, locationLabel }),
    }),

  closeBranch: (businessId: string, branchId: string) =>
    v4Request<{ business: BusinessEntity }>(
      `/businesses/${encodeURIComponent(businessId)}/branches/${encodeURIComponent(branchId)}`,
      { method: 'DELETE' },
    ),

  signFranchise: (businessId: string, cityCode: V4CityCode) =>
    v4Request<{ agreement: FranchiseAgreement; profile: PlayerProfile }>(
      `/businesses/${encodeURIComponent(businessId)}/franchise/sign`,
      { method: 'POST', body: JSON.stringify({ cityCode }) },
    ),

  payDividend: (businessId: string, amountCR: number) =>
    v4Request<{ business: BusinessEntity; profile: PlayerProfile }>(
      `/businesses/${encodeURIComponent(businessId)}/dividend`,
      { method: 'POST', body: JSON.stringify({ amountCR }) },
    ),

  // Corporate, M&A, Holding & IPO
  getCorporateOverview: () =>
    v4Request<{
      companies: BusinessEntity[];
      holdings: HoldingCompany[];
      privateListings: PrivateShareListing[];
      maOffers: AcquisitionOffer[];
    }>('/corporate/overview'),

  createPrivateListing: (payload: {
    companyId: string;
    offeringType: 'PRIMARY' | 'SECONDARY';
    shares: number;
    pricePerShareCR: number;
  }) =>
    v4Request<{ listing: PrivateShareListing }>('/corporate/private-listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  buyPrivateListing: (listingId: string, shares?: number) =>
    v4Request<{ company: BusinessEntity; listing: PrivateShareListing; profile: PlayerProfile }>(
      `/corporate/private-listings/${encodeURIComponent(listingId)}/buy`,
      { method: 'POST', body: JSON.stringify({ shares }) },
    ),

  createGovernanceProposal: (
    companyId: string,
    payload: { type: GovernanceProposalType; title: string; description: string; payload?: Record<string, unknown> },
  ) =>
    v4Request<{ proposal: GovernanceProposal }>(
      `/corporate/companies/${encodeURIComponent(companyId)}/proposals`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  voteGovernanceProposal: (companyId: string, proposalId: string, vote: 'FOR' | 'AGAINST') =>
    v4Request<{ company: BusinessEntity; proposal: GovernanceProposal }>(
      `/corporate/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/vote`,
      { method: 'POST', body: JSON.stringify({ vote }) },
    ),

  submitMaOffer: (payload: {
    targetCompanyId: string;
    targetPct: 10 | 25 | 51 | 75 | 100;
    offerPricePerShareCR: number;
    dealType?: MaDealType;
    buyerHoldingId?: string | null;
  }) =>
    v4Request<{ offer: AcquisitionOffer; profile: PlayerProfile }>('/corporate/ma/offers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  respondMaOffer: (offerId: string, decision: 'ACCEPT' | 'REJECT' | 'CANCEL') =>
    v4Request<{ offer: AcquisitionOffer; company?: BusinessEntity; profile: PlayerProfile }>(
      `/corporate/ma/offers/${encodeURIComponent(offerId)}/respond`,
      { method: 'POST', body: JSON.stringify({ decision }) },
    ),

  createHolding: (name: string, ticker: string, initialCashCR = 0) =>
    v4Request<{ holding: HoldingCompany; profile: PlayerProfile }>('/corporate/holdings', {
      method: 'POST',
      body: JSON.stringify({ name, ticker, initialCashCR }),
    }),

  attachSubsidiary: (holdingId: string, businessId: string) =>
    v4Request<{ holding: HoldingCompany }>(`/corporate/holdings/${encodeURIComponent(holdingId)}/subsidiaries`, {
      method: 'POST',
      body: JSON.stringify({ businessId }),
    }),

  launchIpo: (businessId: string, offeringPriceCR?: number) =>
    v4Request<{ company: BusinessEntity; profile: PlayerProfile }>(
      `/corporate/companies/${encodeURIComponent(businessId)}/ipo`,
      { method: 'POST', body: JSON.stringify({ offeringPriceCR }) },
    ),

  // Investment Funds
  getFunds: () =>
    v4Request<{
      funds: InvestmentFund[];
      fundTypes: Record<FundType, { label: string; defaultObjective: string; defaultSymbols: string[] }>;
    }>('/funds'),

  createFund: (payload: {
    name: string;
    code: string;
    fundType: FundType;
    description?: string;
    managementFeeAnnualPct?: number;
    redemptionFeePct?: number;
    maxSinglePositionPct?: number;
    minCashReservePct?: number;
    initialCapitalCR: number;
    isPublic?: boolean;
    logoColor?: string;
  }) =>
    v4Request<{ fund: InvestmentFund; profile: PlayerProfile }>('/funds', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  subscribeFund: (fundId: string, amountCR: number) =>
    v4Request<{ fund: InvestmentFund; unitsIssued: number; profile: PlayerProfile }>(
      `/funds/${encodeURIComponent(fundId)}/subscribe`,
      { method: 'POST', body: JSON.stringify({ amountCR }) },
    ),

  redeemFund: (fundId: string, units: number) =>
    v4Request<{
      fund: InvestmentFund;
      request: FundRedemptionRequest;
      settledImmediately: boolean;
      profile: PlayerProfile;
    }>(`/funds/${encodeURIComponent(fundId)}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ units }),
    }),

  executeFundTrade: (fundId: string, symbol: string, side: 'BUY' | 'SELL', amountCR: number) =>
    v4Request<{ fund: InvestmentFund }>(`/funds/${encodeURIComponent(fundId)}/trade`, {
      method: 'POST',
      body: JSON.stringify({ symbol, side, amountCR }),
    }),

  createFundProposal: (
    fundId: string,
    payload: { type: FundGovernanceProposal['type']; title: string; description: string; payload?: Record<string, unknown> },
  ) =>
    v4Request<{ proposal: FundGovernanceProposal }>(`/funds/${encodeURIComponent(fundId)}/proposals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  voteFundProposal: (fundId: string, proposalId: string, vote: 'FOR' | 'AGAINST') =>
    v4Request<{ fund: InvestmentFund; proposal: FundGovernanceProposal }>(
      `/funds/${encodeURIComponent(fundId)}/proposals/${encodeURIComponent(proposalId)}/vote`,
      { method: 'POST', body: JSON.stringify({ vote }) },
    ),

  // Luxury Club
  getLuxury: () =>
    v4Request<{
      catalog: LuxuryCatalogItem[];
      myAssets: OwnedLuxuryAsset[];
      resaleListings: LuxuryResaleListing[];
      customizationFeeCR: number;
      resaleFeePct: number;
    }>('/luxury'),

  buyLuxury: (catalogId: string, exteriorColorHex?: string, exteriorColorName?: string) =>
    v4Request<{ asset: OwnedLuxuryAsset; profile: PlayerProfile }>('/luxury/buy', {
      method: 'POST',
      body: JSON.stringify({ catalogId, exteriorColorHex, exteriorColorName }),
    }),

  customizeLuxury: (
    assetId: string,
    payload: {
      exteriorColorHex: string;
      exteriorColorName: string;
      exteriorTrim: OwnedLuxuryAsset['exteriorTrim'];
    },
  ) =>
    v4Request<{ asset: OwnedLuxuryAsset; profile: PlayerProfile }>(
      `/luxury/${encodeURIComponent(assetId)}/customize`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  toggleFeaturedLuxury: (assetId: string, featured: boolean) =>
    v4Request<{ asset: OwnedLuxuryAsset }>(`/luxury/${encodeURIComponent(assetId)}/feature`, {
      method: 'POST',
      body: JSON.stringify({ featured }),
    }),

  listLuxuryForResale: (assetId: string, listingPriceCR: number) =>
    v4Request<{ asset: OwnedLuxuryAsset; listing: LuxuryResaleListing }>(
      `/luxury/${encodeURIComponent(assetId)}/list`,
      { method: 'POST', body: JSON.stringify({ listingPriceCR }) },
    ),

  cancelLuxuryResale: (listingId: string) =>
    v4Request<{ asset: OwnedLuxuryAsset }>(`/luxury/resale/${encodeURIComponent(listingId)}`, {
      method: 'DELETE',
    }),

  buyLuxuryResale: (listingId: string) =>
    v4Request<{ asset: OwnedLuxuryAsset; profile: PlayerProfile }>(
      `/luxury/resale/${encodeURIComponent(listingId)}/buy`,
      { method: 'POST' },
    ),

  // World Macro & Career
  getWorldMacroV4: () => v4Request<V4MacroOverview>('/economy'),

  getCareer: () =>
    v4Request<{
      career: PlayerCareerProfile;
      ranks: WealthRankSpec[];
      titles: CareerTitleSpec[];
      skills: SkillNodeSpec[];
      missions?: CareerMissionSpec[];
    }>('/career'),

  equipTitle: (titleId: string) =>
    v4Request<{ career: PlayerCareerProfile; profile: PlayerProfile }>('/career/equip-title', {
      method: 'POST',
      body: JSON.stringify({ titleId }),
    }),

  unlockSkill: (skillId: string) =>
    v4Request<{ skillPointsRemaining: number; unlockedSkillIds: string[]; career: PlayerCareerProfile }>(
      '/career/unlock-skill',
      { method: 'POST', body: JSON.stringify({ skillId }) },
    ),

  devAdvanceCycle: (cycles = 1, forceEventTemplateId?: string) =>
    v4Request<{ cyclesExecuted: number }>('/dev/advance-cycle', {
      method: 'POST',
      body: JSON.stringify({ cycles, forceEventTemplateId }),
    }),

  devBalanceSimulation: (days = 90) => v4Request<MacroSimulationReport>(`/dev/balance-simulation?days=${days}`),
};
