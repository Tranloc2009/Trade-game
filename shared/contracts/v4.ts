export type V4CityCode =
  | 'HCMC'
  | 'HANOI'
  | 'DANANG'
  | 'NHATRANG'
  | 'DALAT'
  | 'PHUQUOC'
  | 'HAIPHONG'
  | 'CANTHO';

export interface V4CityConfig {
  code: V4CityCode;
  name: string;
  region: 'SOUTH' | 'NORTH' | 'CENTRAL';
  populationWeight: number; // 0.35..1.5
  incomeIndex: number; // 0.7..1.35
  rentMultiplier: number; // 0.65..1.45
  tourismIndex: number; // 0.6..1.7
  industrialIndex: number; // 0.5..1.4
  techIndex: number; // 0.5..1.5
  householdPoolPerCycleMinor: number; // Finite NPC consumer spending budget per cycle
}

export type V4BusinessIndustry =
  | 'FNB'
  | 'RETAIL'
  | 'TECHNOLOGY'
  | 'TRANSPORTATION'
  | 'MANUFACTURING'
  | 'HOSPITALITY'
  | 'REAL_ESTATE'
  | 'FINANCE';

export type BusinessModelType =
  | 'MASS_MARKET'
  | 'PREMIUM_NICHE'
  | 'B2B_CONTRACT'
  | 'FRANCHISE_CHAIN';

export interface BusinessCatalogItem {
  typeId: string;
  name: string;
  industry: V4BusinessIndustry;
  industryLabel: string;
  startupCostCR: number;
  baseOperatingCostCR: number;
  baseDailyCapacity: number;
  baseSellingPriceCR: number;
  baseUnitCostCR: number;
  minEmployees: number;
  maxLevel1Employees: number;
  requiresPremises: boolean;
  requiresFinanceUnlock?: boolean;
  operatingFormulaNote: string;
  description: string;
  demandCategory: 'CONSUMER' | 'LUXURY' | 'ENTERPRISE' | 'TOURISM' | 'LOGISTICS' | 'INDUSTRIAL' | 'FINANCIAL';
}

export interface BusinessLevelSpec {
  level: number;
  title: string;
  upgradeCostMultiplier: number;
  durationGameHours: number;
  requiredCapitalCR: number;
  requiredReputation: number;
  requiredCumulativeProfitCR: number;
  capacityMultiplier: number;
  additionalEmployees: number;
  opexMultiplier: number;
  unlockedFeature: string;
}

export type UpgradeBranch = 'FACILITIES' | 'OPERATIONS' | 'PERSONNEL' | 'MARKETING' | 'RND';

export interface UpgradeNodeSpec {
  id: string;
  branch: UpgradeBranch;
  name: string;
  description: string;
  maxRank: number;
  baseCostCR: number;
  additionalOpexPerCycleCR: number;
  durationGameHours: number;
  effectSummary: string;
  capacityBonusPct?: number;
  qualityBonus?: number;
  demandBonusPct?: number;
  costReductionPct?: number;
  reputationBonus?: number;
  energyEfficiencyPct?: number;
}

export type EmployeeRole =
  | 'GENERAL_STAFF'
  | 'SALES_STAFF'
  | 'TECHNICIAN'
  | 'ENGINEER'
  | 'OPERATOR'
  | 'MANAGER'
  | 'BRANCH_DIRECTOR';

export interface EmployeeRoleSpec {
  role: EmployeeRole;
  label: string;
  baseSalaryPerCycleCR: number;
  baseProductivity: number; // units of capacity contribution
  trainingCostCR: number;
  preferredIndustries: V4BusinessIndustry[];
}

export interface BusinessEmployeeGroup {
  role: EmployeeRole;
  count: number;
  salaryPerCycleMinor: number;
  skillLevel: number; // 1..10
  productivity: number;
  satisfaction: number; // 0..100
  status: 'ACTIVE' | 'UNDERPAID' | 'TRAINING';
}

export interface BusinessBranch {
  id: string;
  businessId: string;
  cityCode: V4CityCode;
  cityName: string;
  locationLabel: string;
  openedAt: string;
  localDemandUnits: number;
  localEmployees: number;
  capacityUnits: number;
  revenueLastCycleMinor: number;
  expensesLastCycleMinor: number;
  profitLastCycleMinor: number;
  reputation: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export interface FranchiseAgreement {
  id: string;
  franchisorBusinessId: string;
  franchisorName: string;
  franchiseePlayerId: string;
  franchiseeName: string;
  cityCode: V4CityCode;
  initialFeeMinor: number;
  royaltyRatePct: number; // e.g., 6% of revenue
  brandStandardMinQuality: number;
  durationGameDays: number;
  startedGameDay: number;
  totalRoyaltiesPaidMinor: number;
  status: 'ACTIVE' | 'TERMINATED';
}

export interface BusinessFinancialPeriod {
  cycleId: number;
  gameDay: number;
  timestamp: string;
  demandUnits: number;
  capacityUnits: number;
  actualSalesUnits: number;
  sellingPriceMinor: number;
  revenueMinor: number;
  cogsMinor: number;
  salariesMinor: number;
  rentMinor: number;
  utilitiesMinor: number;
  marketingMinor: number;
  maintenanceMinor: number;
  interestMinor: number;
  taxMinor: number;
  totalExpensesMinor: number;
  netProfitMinor: number;
  marketSharePct: number;
  capacityUtilizationPct: number;
  cashEndingMinor: number;
}

export interface ShareholderRecord {
  playerId: string;
  playerName: string;
  shares: number;
  votingShares: number;
  ownershipPct: number;
}

export type GovernanceProposalType =
  | 'APPOINT_CEO'
  | 'ISSUE_SHARES'
  | 'PAY_DIVIDEND'
  | 'SELL_MAJOR_ASSET'
  | 'MERGER'
  | 'ACQUISITION'
  | 'DISSOLVE';

export interface GovernanceProposal {
  id: string;
  companyId: string;
  type: GovernanceProposalType;
  title: string;
  description: string;
  proposerId: string;
  proposerName: string;
  payload: Record<string, unknown>;
  votesFor: number;
  votesAgainst: number;
  voters: Array<{ playerId: string; vote: 'FOR' | 'AGAINST'; weight: number }>;
  requiredMajorityPct: number;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  createdAt: string;
  resolvedAt?: string;
}

export interface CorporateAuditEntry {
  id: string;
  companyId: string;
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface BusinessEntity {
  id: string;
  companyId: string;
  worldId: string;
  founderId: string;
  founderName: string;
  ownerId: string;
  ownerName: string;
  ceoId: string;
  ceoName: string;
  boardMemberIds: string[];
  holdingCompanyId: string | null;
  businessName: string;
  ticker: string;
  industry: V4BusinessIndustry;
  businessTypeId: string;
  businessTypeName: string;
  businessModel: BusinessModelType;
  cityCode: V4CityCode;
  cityName: string;
  locationLabel: string;
  linkedPropertyId: string | null;
  level: number; // 1..10
  levelTitle: string;
  initialCapitalMinor: number;
  companyCashMinor: number;
  companyAssetsMinor: number;
  companyLiabilitiesMinor: number;
  equityMinor: number;
  valuationMinor: number;
  revenueLastCycleMinor: number;
  operatingExpensesLastCycleMinor: number;
  netProfitLastCycleMinor: number;
  cumulativeProfitMinor: number;
  employeeGroups: BusinessEmployeeGroup[];
  employeeCount: number;
  productionCapacity: number;
  inventoryUnits: number;
  sellingPriceMinor: number;
  qualityScore: number; // 0..100
  customerDemandUnits: number;
  marketSharePct: number;
  reputation: number; // 0..100
  customerSatisfaction: number; // 0..100
  status: 'ACTIVE' | 'DISTRESSED' | 'SUSPENDED' | 'RESTRUCTURING' | 'BANKRUPT';
  consecutiveLossCycles: number;
  pendingUpgrade: {
    targetLevel: number;
    startedAtGameHour: number;
    completesAtGameHour: number;
    costMinor: number;
  } | null;
  upgradeTree: Record<string, number>; // nodeId -> rank
  branches: BusinessBranch[];
  franchiseEnabled: boolean;
  franchiseFeeMinor: number;
  franchiseRoyaltyPct: number;
  totalIssuedShares: number;
  treasuryShares: number;
  shareholders: ShareholderRecord[];
  isPublicIpo: boolean;
  ipoSymbol: string | null;
  ipoPriceMinor: number | null;
  financialHistory: BusinessFinancialPeriod[];
  proposals: GovernanceProposal[];
  auditLogs: CorporateAuditEntry[];
  createdAt: string;
}

export interface PrivateShareListing {
  id: string;
  companyId: string;
  companyName: string;
  ticker: string;
  offeringType: 'PRIMARY' | 'SECONDARY';
  sellerId: string;
  sellerName: string;
  sharesAvailable: number;
  pricePerShareMinor: number;
  preMoneyValuationMinor: number;
  postMoneyValuationMinor: number;
  dilutionPct: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: string;
}

export type MaDealType =
  | 'MINORITY_INVESTMENT'
  | 'STRATEGIC_INVESTMENT'
  | 'CONTROLLING_STAKE'
  | 'FULL_ACQUISITION'
  | 'COMPANY_MERGER';

export interface AcquisitionOffer {
  id: string;
  targetCompanyId: string;
  targetCompanyName: string;
  targetTicker: string;
  buyerId: string;
  buyerName: string;
  buyerHoldingId: string | null;
  sellerId: string;
  sellerName: string;
  dealType: MaDealType;
  targetPct: 10 | 25 | 51 | 75 | 100;
  sharesRequested: number;
  offerPricePerShareMinor: number;
  totalOfferMinor: number;
  escrowLockedMinor: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'SETTLED';
  createdAt: string;
  settledAt?: string;
}

export interface HoldingCompany {
  id: string;
  worldId: string;
  name: string;
  ticker: string;
  founderId: string;
  founderName: string;
  cashMinor: number;
  subsidiaryIds: string[];
  consolidatedRevenueMinor: number;
  consolidatedProfitMinor: number;
  consolidatedAssetsMinor: number;
  consolidatedLiabilitiesMinor: number;
  consolidatedEquityMinor: number;
  intercompanyEliminationMinor: number;
  createdAt: string;
}

// ============================================================================
// INVESTMENT FUNDS (MULTIPLAYER)
// ============================================================================

export type FundType =
  | 'STOCK_FUND'
  | 'CRYPTO_SPOT_FUND'
  | 'FOREX_FUND'
  | 'REAL_ESTATE_FUND'
  | 'DIVIDEND_FUND'
  | 'BALANCED_FUND'
  | 'MONEY_MARKET_FUND'
  | 'MULTI_ASSET_FUND';

export interface FundHolding {
  symbol: string;
  assetClass: 'STOCK' | 'CRYPTO' | 'FOREX' | 'PROPERTY_INDEX' | 'CASH_EQUIV';
  quantity: number;
  avgCostMinor: number;
  marketPriceMinor: number;
  marketValueMinor: number;
  weightPct: number;
  stalePricing: boolean;
}

export interface FundMember {
  playerId: string;
  playerName: string;
  units: number;
  costBasisMinor: number;
  ownershipPct: number;
  joinedAt: string;
}

export interface FundRedemptionRequest {
  id: string;
  fundId: string;
  playerId: string;
  playerName: string;
  unitsRequested: number;
  estimatedPayoutMinor: number;
  feeMinor: number;
  status: 'QUEUED' | 'SETTLED' | 'PARTIAL' | 'CANCELLED';
  requestedAt: string;
  settledAt?: string;
  note?: string;
}

export interface FundNavPoint {
  timestamp: string;
  navMinor: number;
  navPerUnitMinor: number;
  aumMinor: number;
  netFlowMinor: number;
}

export interface FundGovernanceProposal {
  id: string;
  fundId: string;
  type: 'CHANGE_MANAGER' | 'CHANGE_STRATEGY' | 'CHANGE_RISK_LIMIT' | 'ADJUST_FEE' | 'DISSOLVE_FUND';
  title: string;
  description: string;
  proposerId: string;
  proposerName: string;
  payload: Record<string, unknown>;
  votesFor: number;
  votesAgainst: number;
  voters: Array<{ playerId: string; vote: 'FOR' | 'AGAINST'; weight: number }>;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  createdAt: string;
}

export interface FundAuditLog {
  id: string;
  fundId: string;
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface InvestmentFund {
  id: string;
  worldId: string;
  name: string;
  code: string;
  logoColor: string;
  description: string;
  fundType: FundType;
  investmentObjective: string;
  allowedAssets: string[];
  maxSinglePositionPct: number; // Risk limit
  minCashReservePct: number; // Liquidity buffer
  founderId: string;
  managerId: string;
  managerName: string;
  managementFeeAnnualPct: number; // Capped <= 3.0%
  redemptionFeePct: number; // e.g., 0.5%
  redemptionNoticeLabel: string;
  isPublic: boolean;
  leverageAllowed: false; // Strictly disabled in Phase 1
  cashMinor: number;
  holdings: FundHolding[];
  totalAssetsMinor: number;
  totalLiabilitiesMinor: number;
  navMinor: number;
  outstandingUnits: number;
  navPerUnitMinor: number;
  initialNavPerUnitMinor: number;
  returnPct: number;
  maxDrawdownPct: number;
  annualizedVolatilityPct: number;
  sharpeRatio: number;
  members: FundMember[];
  redemptionQueue: FundRedemptionRequest[];
  navHistory: FundNavPoint[];
  proposals: FundGovernanceProposal[];
  auditLogs: FundAuditLog[];
  status: 'ACTIVE' | 'LIQUIDATING' | 'DISSOLVED';
  createdAt: string;
}

// ============================================================================
// BILLIONAIRE LIFESTYLE — EMPIRE LUXURY CLUB
// ============================================================================

export type LuxuryCategory = 'SUPERCAR' | 'PRIVATE_JET' | 'YACHT' | 'LUXURY_RESIDENCE' | 'COLLECTIBLE';

export type LuxuryRarity = 'EXCLUSIVE' | 'RARE' | 'BESPOKE' | 'LIMITED_EDITION' | 'ICONIC';

export interface LuxuryCatalogItem {
  catalogId: string;
  modelName: string;
  inspiredClass: string;
  category: LuxuryCategory;
  segmentLabel: string;
  rarity: LuxuryRarity;
  purchasePriceCR: number;
  maintenancePerCycleCR: number;
  depreciationPerCyclePct: number; // Can depreciate; no guaranteed appreciation
  specs: Array<{ label: string; value: string }>;
  availableColors: Array<{ name: string; hex: string }>;
  defaultColorHex: string;
  visualType: 'SUPERCAR' | 'JET' | 'YACHT' | 'PENTHOUSE' | 'WATCH' | 'ART' | 'CLASSIC_CAR' | 'TROPHY';
  vnImageKey?: string;
  description: string;
}

export interface OwnedLuxuryAsset {
  id: string;
  catalogId: string;
  modelName: string;
  category: LuxuryCategory;
  segmentLabel: string;
  rarity: LuxuryRarity;
  ownerId: string;
  ownerName: string;
  purchasePriceMinor: number;
  currentResaleValueMinor: number;
  maintenancePerCycleMinor: number;
  exteriorColorHex: string;
  exteriorColorName: string;
  exteriorTrim: 'STANDARD' | 'CARBON_AERO' | 'BESPOKE_GOLD' | 'STEALTH_MATTE';
  featuredOnProfile: boolean;
  isListed: boolean;
  listingPriceMinor: number | null;
  lockedForSale: boolean;
  ownershipHistory: Array<{
    ownerId: string;
    ownerName: string;
    priceMinor: number;
    acquiredAt: string;
  }>;
  purchasedAt: string;
}

export interface LuxuryResaleListing {
  listingId: string;
  assetId: string;
  catalogId: string;
  modelName: string;
  category: LuxuryCategory;
  rarity: LuxuryRarity;
  sellerId: string;
  sellerName: string;
  listingPriceMinor: number;
  estimatedResaleMinor: number;
  exteriorColorHex: string;
  exteriorColorName: string;
  listedAt: string;
  status: 'ACTIVE' | 'SOLD' | 'CANCELLED';
}

// ============================================================================
// WORLD ECONOMIC EVENTS V4 — LIVING ECONOMY
// ============================================================================

export type V4EconomicPhase =
  | 'RECOVERY'
  | 'EXPANSION'
  | 'BOOM'
  | 'SLOWDOWN'
  | 'RECESSION'
  | 'CRISIS';

export type WorldEventCategory =
  | 'MONETARY_POLICY'
  | 'BUSINESS'
  | 'REAL_ESTATE'
  | 'GLOBAL_ECONOMY'
  | 'TOURISM';

export interface V4MacroIndicators {
  phase: V4EconomicPhase;
  gdpGrowthPct: number;
  inflationPct: number;
  interestRatePct: number;
  unemploymentPct: number;
  consumerConfidenceIndex: number; // 0..100
  householdSpendingIndex: number; // 50..150
  businessInvestmentIndex: number; // 40..150
  creditGrowthPct: number;
  bankingLiquidityIndex: number; // 20..100
  propertyDemandIndex: number; // 40..150
  energyPriceIndex: number; // 60..180
  manufacturingCostIndex: number; // 60..180
}

export interface ChainReactionStep {
  order: number;
  sector: string;
  metric: string;
  deltaLabel: string;
  explanation: string;
}

export interface WorldMacroEventV4 {
  id: string;
  templateId: string;
  title: string;
  description: string;
  category: WorldEventCategory;
  affectedIndustries: V4BusinessIndustry[];
  affectedCities: V4CityCode[];
  startTime: string;
  durationCycles: number;
  remainingCycles: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  variableChanges: Partial<Omit<V4MacroIndicators, 'phase'>>;
  chainReaction: ChainReactionStep[];
  recoveryCondition: string;
  publicAnnouncement: string;
  historicalOutcome: string | null;
  active: boolean;
}

export interface EconomicCalendarItemV4 {
  id: string;
  title: string;
  category: 'EARNINGS' | 'INTEREST_RATE' | 'INFLATION' | 'DIVIDEND' | 'DEBT' | 'PAYROLL' | 'GDP';
  scheduledGameDay: number;
  scheduledTimeLabel: string;
  status: 'UPCOMING' | 'RELEASED';
  publicSummary: string;
}

export interface MacroSimulationReport {
  daysSimulated: number;
  finalPhase: V4EconomicPhase;
  finalIndicators: V4MacroIndicators;
  moneySupplyMinor: number;
  giniProxy: number;
  businessFailureRatePct: number;
  averageProfitMarginPct: number;
  industryCompetitionIndex: number;
  fundLiquidityRatioPct: number;
  propertyDemandIndex: number;
  avgInflationPct: number;
  debtToEquityRatioPct: number;
}

// ============================================================================
// RANKS, TITLES, CAREER MODE & PLAYER JOURNEY
// ============================================================================

export type BadgeTier =
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'OBSIDIAN'
  | 'IMPERIAL';

export interface WealthRankSpec {
  id: string;
  name: string;
  minNetWorthCR: number;
  tier: BadgeTier;
  frameLabel: string;
}

export type CareerTitleGroup =
  | 'BUSINESS'
  | 'INVESTMENT'
  | 'REAL_ESTATE'
  | 'FINANCE'
  | 'LIFESTYLE'
  | 'WORLD';

export interface CareerTitleSpec {
  id: string;
  name: string;
  group: CareerTitleGroup;
  tier: BadgeTier;
  conditionLabel: string;
  rewardLabel: string;
}

export type CareerPathId =
  | 'THE_ENTREPRENEUR'
  | 'THE_INVESTOR'
  | 'THE_PROPERTY_MOGUL'
  | 'THE_FUND_MANAGER'
  | 'THE_CORPORATE_STRATEGIST'
  | 'THE_LUXURY_COLLECTOR';

export interface CareerMissionSpec {
  id: string;
  pathId: CareerPathId;
  order: number;
  title: string;
  description: string;
  targetMetric: string;
  targetValue: number;
  rewardTitleId?: string;
  rewardBadgeTier: BadgeTier;
  rewardDescription: string;
  skillPointsReward: number;
}

export interface PlayerMissionProgress extends CareerMissionSpec {
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
  rewardClaimed: boolean;
}

export type SkillBranchId =
  | 'BUSINESS_MANAGEMENT'
  | 'INVESTMENT_KNOWLEDGE'
  | 'CORPORATE_LEADERSHIP'
  | 'PROPERTY_MANAGEMENT';

export interface SkillNodeSpec {
  id: string;
  branch: SkillBranchId;
  name: string;
  description: string;
  costPoints: number;
  prerequisiteId?: string;
  unlocksTool: string;
}

export interface PlayerJourneyEvent {
  id: string;
  category: CareerTitleGroup;
  title: string;
  detail: string;
  timestamp: string;
}

export interface PlayerCareerProfile {
  playerId: string;
  username: string;
  netWorthMinor: number;
  wealthRank: WealthRankSpec;
  nextWealthRank: WealthRankSpec | null;
  progressToNextRankPct: number;
  equippedTitleId: string;
  equippedTitleName: string;
  equippedTier: BadgeTier;
  unlockedTitleIds: string[];
  skillPoints: number;
  unlockedSkillIds: string[];
  missions: PlayerMissionProgress[];
  journey: PlayerJourneyEvent[];
}

// ============================================================================
// CENTRALIZED ECONOMY BALANCING TABLE (SECTION 14)
// ============================================================================

export const V4_BALANCE_CONFIG = {
  corporateTaxRatePct: 18,
  privateShareFeePct: 0.5,
  maTransactionFeePct: 1.0,
  luxuryResaleFeePct: 2.5,
  luxuryCustomizationFeeCR: 2_500,
  holdingCreationCostCR: 150_000,
  ipoMinBusinessLevel: 4,
  ipoMinHistoryCycles: 3,
  ipoMinEquityCR: 150_000,
  franchiseMinBusinessLevel: 3,
  franchiseMinReputation: 60,
  maxFundManagementFeePct: 3.0,
  defaultFundRedemptionFeePct: 0.5,
  minFundInitialCapitalCR: 25_000,
  branchOpeningCostMultiplier: 0.65,
  bankruptcyConsecutiveLossLimit: 5,
  economicEventCadenceCycles: 2,
  gameHoursPerMacroCycle: 6,
  financeUnlockMinNetWorthCR: 250_000,
  maxChainReactionDeltaPct: 15,
} as const;
