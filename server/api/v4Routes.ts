import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  API_CONTRACT_VERSION,
  ERROR_MESSAGES_VI,
  type ApiFailure,
  type ApiSuccess,
  type ErrorCode,
} from '../../shared/contracts/types';
import { V4_BALANCE_CONFIG } from '../../shared/contracts/v4';
import { DomainError } from '../domain/DomainError';
import { WorldEngine } from '../engine/WorldEngine';
import { FUND_TYPE_SPECS } from '../engine/v4/InvestmentFundEngine';
import {
  BUSINESS_CATALOG,
  BUSINESS_LEVELS,
  CAREER_MISSIONS,
  CAREER_TITLES,
  EMPLOYEE_ROLES,
  LUXURY_CATALOG,
  SKILL_TREE_NODES,
  UPGRADE_TREE_NODES,
  V4_CITIES,
  WEALTH_RANKS,
  WORLD_EVENT_TEMPLATES_V4,
} from '../engine/v4/V4Catalog';
import { WorldMacroV4Engine } from '../engine/v4/WorldMacroV4Engine';
import { requireAdminDev } from '../security/AdminAuth';

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = {
    ok: true,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    data,
  };
  res.status(status).json(body);
}

function fail(res: Response, code: ErrorCode, message?: string, status = 400, details?: unknown): void {
  const body: ApiFailure = {
    ok: false,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    error: {
      code,
      message: message || ERROR_MESSAGES_VI[code],
      details,
    },
  };
  res.status(status).json(body);
}

const CITY_CODES = ['HCMC', 'HANOI', 'DANANG', 'HAIPHONG', 'NHATRANG', 'DALAT', 'PHUQUOC', 'CANTHO'] as const;
const EMPLOYEE_ROLE_ENUM = [
  'GENERAL_STAFF',
  'SALES_STAFF',
  'TECHNICIAN',
  'ENGINEER',
  'OPERATOR',
  'MANAGER',
  'BRANCH_DIRECTOR',
] as const;

const CreateBusinessV4Schema = z.object({
  businessTypeId: z.string().min(2).max(64),
  businessName: z.string().trim().min(3).max(64),
  ticker: z.string().trim().min(2).max(10),
  cityCode: z.enum(CITY_CODES),
  locationLabel: z.string().trim().max(96).optional(),
  linkedPropertyId: z.string().max(64).nullable().optional(),
  businessModel: z.enum(['MASS_MARKET', 'PREMIUM_NICHE', 'B2B_CONTRACT', 'FRANCHISE_CHAIN']).optional(),
  initialCapitalCR: z.number().positive().max(1_000_000_000),
  idempotencyKey: z.string().max(96).optional(),
});

const BusinessSettingsSchema = z.object({
  sellingPriceCR: z.number().positive().max(10_000_000).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'RESTRUCTURING']).optional(),
  franchiseEnabled: z.boolean().optional(),
  franchiseFeeCR: z.number().positive().max(10_000_000).optional(),
  franchiseRoyaltyPct: z.number().min(1).max(25).optional(),
});

const ManageEmployeesSchema = z.object({
  action: z.enum(['HIRE', 'FIRE', 'TRAIN', 'SET_SALARY']),
  role: z.enum(EMPLOYEE_ROLE_ENUM),
  count: z.number().int().min(1).max(100).optional(),
  salaryCR: z.number().positive().max(500_000).optional(),
});

const OpenBranchSchema = z.object({
  cityCode: z.enum(CITY_CODES),
  locationLabel: z.string().trim().max(96).optional(),
});

const AmountSchema = z.object({
  amountCR: z.number().positive().max(1_000_000_000),
});

const PrivateListingSchema = z.object({
  companyId: z.string().min(3).max(64),
  offeringType: z.enum(['PRIMARY', 'SECONDARY']),
  shares: z.number().int().min(100).max(50_000_000),
  pricePerShareCR: z.number().positive().max(1_000_000),
});

const BuyPrivateListingSchema = z.object({
  shares: z.number().int().positive().optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const GovernanceProposalSchema = z.object({
  type: z.enum(['APPOINT_CEO', 'ISSUE_SHARES', 'PAY_DIVIDEND', 'SELL_MAJOR_ASSET', 'MERGER', 'ACQUISITION', 'DISSOLVE']),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(3).max(400),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const VoteSchema = z.object({
  vote: z.enum(['FOR', 'AGAINST']),
});

const MaOfferSchema = z.object({
  targetCompanyId: z.string().min(3).max(64),
  targetPct: z.union([z.literal(10), z.literal(25), z.literal(51), z.literal(75), z.literal(100)]),
  offerPricePerShareCR: z.number().positive().max(1_000_000),
  dealType: z
    .enum(['MINORITY_INVESTMENT', 'STRATEGIC_INVESTMENT', 'CONTROLLING_STAKE', 'FULL_ACQUISITION', 'COMPANY_MERGER'])
    .optional(),
  buyerHoldingId: z.string().max(64).nullable().optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const MaRespondSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT', 'CANCEL']),
});

const CreateHoldingSchema = z.object({
  name: z.string().trim().min(3).max(64),
  ticker: z.string().trim().min(2).max(10),
  initialCashCR: z.number().min(0).max(1_000_000_000).optional(),
});

const CreateFundSchema = z.object({
  name: z.string().trim().min(3).max(64),
  code: z.string().trim().min(2).max(10),
  fundType: z.enum([
    'STOCK_FUND',
    'CRYPTO_SPOT_FUND',
    'FOREX_FUND',
    'REAL_ESTATE_FUND',
    'DIVIDEND_FUND',
    'BALANCED_FUND',
    'MONEY_MARKET_FUND',
    'MULTI_ASSET_FUND',
  ]),
  description: z.string().trim().max(240).optional(),
  investmentObjective: z.string().trim().max(240).optional(),
  managementFeeAnnualPct: z.number().min(0).max(3).optional(),
  redemptionFeePct: z.number().min(0).max(3).optional(),
  maxSinglePositionPct: z.number().min(15).max(70).optional(),
  minCashReservePct: z.number().min(5).max(50).optional(),
  initialCapitalCR: z.number().min(25_000).max(1_000_000_000),
  isPublic: z.boolean().optional(),
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const FundTradeSchema = z.object({
  symbol: z.string().trim().min(2).max(32),
  side: z.enum(['BUY', 'SELL']),
  amountCR: z.number().positive().max(1_000_000_000),
});

const FundRedeemSchema = z.object({
  units: z.number().positive(),
  idempotencyKey: z.string().max(96).optional(),
});

const FundProposalSchema = z.object({
  type: z.enum(['CHANGE_MANAGER', 'CHANGE_STRATEGY', 'CHANGE_RISK_LIMIT', 'ADJUST_FEE', 'DISSOLVE_FUND']),
  title: z.string().trim().min(3).max(96),
  description: z.string().trim().min(3).max(320),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const LuxuryBuySchema = z.object({
  catalogId: z.string().min(2).max(64),
  exteriorColorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  exteriorColorName: z.string().trim().max(48).optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const LuxuryCustomizeSchema = z.object({
  exteriorColorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  exteriorColorName: z.string().trim().min(2).max(48),
  exteriorTrim: z.enum(['STANDARD', 'CARBON_AERO', 'BESPOKE_GOLD', 'STEALTH_MATTE']),
});

const LuxuryListSchema = z.object({
  listingPriceCR: z.number().positive().max(1_000_000_000),
});

export function createV4Router(world: WorldEngine): Router {
  const router = Router();
  const adminGuard = requireAdminDev(world.devToolsEnabled);

  const resolvePlayerId = (req: Request): string | null => {
    const authHeader = req.header('authorization');
    const session = world.auth.verifyToken(authHeader);
    return session?.playerId ?? null;
  };

  const requirePlayerId = (req: Request): string => {
    const playerId = resolvePlayerId(req);
    if (!playerId) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return playerId;
  };

  // ============================================================================
  // 1. CATALOGS & EMPIRE HUB OVERVIEW
  // ============================================================================

  router.get('/catalogs', (_req, res) => {
    ok(res, {
      cities: V4_CITIES,
      businessCatalog: BUSINESS_CATALOG,
      businessLevels: BUSINESS_LEVELS,
      upgradeTreeNodes: UPGRADE_TREE_NODES,
      employeeRoles: EMPLOYEE_ROLES,
      fundTypes: FUND_TYPE_SPECS,
      luxuryCatalog: LUXURY_CATALOG,
      wealthRanks: WEALTH_RANKS,
      careerTitles: CAREER_TITLES,
      careerMissions: CAREER_MISSIONS,
      skillTreeNodes: SKILL_TREE_NODES,
      eventTemplatesCount: WORLD_EVENT_TEMPLATES_V4.length,
      balanceConfig: V4_BALANCE_CONFIG,
    });
  });

  router.get('/empire/overview', (req, res, next) => {
    try {
      const playerId = resolvePlayerId(req);
      const profile = playerId ? world.getPlayerProfile(playerId) : null;
      const career = playerId ? world.syncPlayerCareerAndNotify(playerId) : null;
      const businesses = world.businessEmpire.listBusinesses();
      const myBusinesses = playerId
        ? businesses.filter((b) => b.ownerId === playerId || b.shareholders.some((s) => s.playerId === playerId))
        : [];
      const holdings = world.businessEmpire.listHoldings();
      const funds = world.funds.listFunds();
      const myLuxury = playerId ? world.luxury.listPlayerAssets(playerId) : [];

      ok(res, {
        profile,
        career,
        macro: world.macroV4.getOverview(),
        summary: {
          totalBusinessesInWorld: businesses.length,
          myBusinessesCount: myBusinesses.length,
          myHoldingsCount: playerId ? holdings.filter((h) => h.founderId === playerId).length : 0,
          totalFundsInWorld: funds.length,
          myLuxuryCount: myLuxury.length,
          openPrivateListingsCount: world.businessEmpire.listPrivateListings().length,
          activeMaOffersCount: world.businessEmpire.listMaOffers().filter((o) => o.status === 'PENDING').length,
        },
        myBusinesses,
        myHoldings: playerId ? holdings.filter((h) => h.founderId === playerId) : [],
        topFunds: funds.slice(0, 4),
        myLuxuryAssets: myLuxury.slice(0, 6),
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 2. BUSINESS EMPIRE V4 ROUTES
  // ============================================================================

  router.get('/businesses', (_req, res) => {
    ok(res, {
      businesses: world.businessEmpire.listBusinesses(),
      franchises: world.businessEmpire.listFranchises(),
      cities: V4_CITIES,
      catalog: BUSINESS_CATALOG,
      levels: BUSINESS_LEVELS,
      upgradeNodes: UPGRADE_TREE_NODES,
      employeeRoles: EMPLOYEE_ROLES,
    });
  });

  router.post('/businesses', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateBusinessV4Schema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const business = world.createV4Business(playerId, { ...parsed.data, idempotencyKey: idem });
      ok(res, { business, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/inject-capital', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = AmountSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const business = world.injectV4BusinessCapital(playerId, req.params.id, parsed.data.amountCR);
      ok(res, { business, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/businesses/:id/settings', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BusinessSettingsSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const business = world.updateV4BusinessSettings(playerId, req.params.id, parsed.data);
      ok(res, { business });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/employees', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ManageEmployeesSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const business = world.manageV4BusinessEmployees(playerId, req.params.id, parsed.data);
      ok(res, { business });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/upgrade-level', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const business = world.upgradeV4BusinessLevel(playerId, req.params.id);
      ok(res, { business, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/upgrade-node', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const nodeId = typeof req.body?.nodeId === 'string' ? req.body.nodeId : '';
      if (!nodeId) return fail(res, 'VALIDATION_ERROR', 'Thiếu mã nâng cấp nodeId.', 400);
      const business = world.purchaseV4UpgradeNode(playerId, req.params.id, nodeId);
      ok(res, { business });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/branches', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = OpenBranchSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const result = world.openV4BusinessBranch(playerId, req.params.id, parsed.data.cityCode, parsed.data.locationLabel);
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/businesses/:id/branches/:branchId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const business = world.businessEmpire.closeBranch(req.params.id, playerId, req.params.branchId);
      ok(res, { business });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/franchise/sign', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const cityCode = req.body?.cityCode;
      if (!CITY_CODES.includes(cityCode)) return fail(res, 'VALIDATION_ERROR', 'Thành phố không hợp lệ.', 400);
      const agreement = world.signV4Franchise(playerId, req.params.id, cityCode);
      ok(res, { agreement, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses/:id/dividend', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = AmountSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const business = world.payV4Dividend(playerId, req.params.id, parsed.data.amountCR);
      ok(res, { business, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 3. CORPORATE OWNERSHIP, PRIVATE SHARES, GOVERNANCE, M&A, HOLDING & IPO
  // ============================================================================

  router.get('/corporate/overview', (_req, res) => {
    ok(res, {
      companies: world.businessEmpire.listBusinesses(),
      holdings: world.businessEmpire.listHoldings(),
      privateListings: world.businessEmpire.listPrivateListings(),
      maOffers: world.businessEmpire.listMaOffers(),
    });
  });

  router.post('/corporate/private-listings', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PrivateListingSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const listing = world.createV4PrivateListing(playerId, parsed.data);
      ok(res, { listing }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/private-listings/:id/buy', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BuyPrivateListingSchema.safeParse(req.body ?? {});
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const result = world.buyV4PrivateListing(playerId, req.params.id, parsed.data.shares, idem);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/companies/:id/proposals', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = GovernanceProposalSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const proposal = world.createV4GovernanceProposal(playerId, req.params.id, parsed.data);
      ok(res, { proposal }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/companies/:id/proposals/:proposalId/vote', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = VoteSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const result = world.voteV4GovernanceProposal(playerId, req.params.id, req.params.proposalId, parsed.data.vote);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/ma/offers', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = MaOfferSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const offer = world.submitV4MaOffer(playerId, { ...parsed.data, idempotencyKey: idem });
      ok(res, { offer, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/ma/offers/:id/respond', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = MaRespondSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const result = world.respondV4MaOffer(playerId, req.params.id, parsed.data.decision);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/holdings', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateHoldingSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const holding = world.createV4Holding(playerId, parsed.data.name, parsed.data.ticker, parsed.data.initialCashCR ?? 0);
      ok(res, { holding, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/holdings/:id/subsidiaries', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId : '';
      if (!businessId) return fail(res, 'VALIDATION_ERROR', 'Thiếu mã công ty con businessId.', 400);
      const holding = world.attachV4Subsidiary(playerId, req.params.id, businessId);
      ok(res, { holding });
    } catch (err) {
      next(err);
    }
  });

  router.post('/corporate/companies/:id/ipo', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const offeringPriceCR = typeof req.body?.offeringPriceCR === 'number' ? req.body.offeringPriceCR : undefined;
      const result = world.launchV4Ipo(playerId, req.params.id, offeringPriceCR);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 4. INVESTMENT FUNDS (MULTIPLAYER)
  // ============================================================================

  router.get('/funds', (_req, res) => {
    ok(res, {
      funds: world.funds.listFunds(),
      fundTypes: FUND_TYPE_SPECS,
    });
  });

  router.post('/funds', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateFundSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const fund = world.createV4Fund(playerId, { ...parsed.data, idempotencyKey: idem });
      ok(res, { fund, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/funds/:id/subscribe', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = AmountSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined);
      const result = world.subscribeV4Fund(playerId, req.params.id, parsed.data.amountCR, idem);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/funds/:id/redeem', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FundRedeemSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const result = world.redeemV4Fund(playerId, req.params.id, parsed.data.units, idem);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/funds/:id/trade', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FundTradeSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const fund = world.executeV4FundTrade(playerId, req.params.id, parsed.data.symbol, parsed.data.side, parsed.data.amountCR);
      ok(res, { fund });
    } catch (err) {
      next(err);
    }
  });

  router.post('/funds/:id/proposals', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FundProposalSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const proposal = world.createV4FundProposal(playerId, req.params.id, parsed.data);
      ok(res, { proposal }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/funds/:id/proposals/:proposalId/vote', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = VoteSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const result = world.voteV4FundProposal(playerId, req.params.id, req.params.proposalId, parsed.data.vote);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 5. BILLIONAIRE LIFESTYLE — EMPIRE LUXURY CLUB
  // ============================================================================

  router.get('/luxury', (req, res) => {
    const playerId = resolvePlayerId(req);
    ok(res, {
      catalog: LUXURY_CATALOG,
      myAssets: playerId ? world.luxury.listPlayerAssets(playerId) : [],
      resaleListings: world.luxury.listActiveResaleListings(),
      customizationFeeCR: V4_BALANCE_CONFIG.luxuryCustomizationFeeCR,
      resaleFeePct: V4_BALANCE_CONFIG.luxuryResaleFeePct,
    });
  });

  router.post('/luxury/buy', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = LuxuryBuySchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const idem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const asset = world.buyV4LuxuryFromShowroom(
        playerId,
        parsed.data.catalogId,
        parsed.data.exteriorColorHex,
        parsed.data.exteriorColorName,
        idem,
      );
      ok(res, { asset, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/luxury/:id/customize', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = LuxuryCustomizeSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const asset = world.customizeV4LuxuryAsset(playerId, req.params.id, parsed.data);
      ok(res, { asset, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/luxury/:id/feature', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const featured = Boolean(req.body?.featured);
      const asset = world.luxury.toggleFeaturedOnProfile(req.params.id, playerId, featured);
      ok(res, { asset });
    } catch (err) {
      next(err);
    }
  });

  router.post('/luxury/:id/list', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = LuxuryListSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const result = world.luxury.listForResale({
        assetId: req.params.id,
        sellerId: playerId,
        listingPriceCR: parsed.data.listingPriceCR,
      });
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/luxury/resale/:listingId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const asset = world.luxury.cancelResaleListing(req.params.listingId, playerId);
      ok(res, { asset });
    } catch (err) {
      next(err);
    }
  });

  router.post('/luxury/resale/:listingId/buy', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const idem = req.header('idempotency-key') || (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined);
      const result = world.buyV4LuxuryResale(playerId, req.params.listingId, idem);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 6. WORLD ECONOMIC CENTER V4 & CAREER PROGRESSION
  // ============================================================================

  router.get('/economy', (_req, res) => {
    ok(res, {
      ...world.macroV4.getOverview(),
      gameClock: world.economy.getGameClock(),
      news: world.economy.news.slice(0, 40),
    });
  });

  router.get('/career', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const career = world.getV4PlayerCareer(playerId);
      ok(res, {
        career,
        ranks: WEALTH_RANKS,
        titles: CAREER_TITLES,
        skills: SKILL_TREE_NODES,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/equip-title', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const titleId = typeof req.body?.titleId === 'string' ? req.body.titleId : '';
      if (!titleId) return fail(res, 'VALIDATION_ERROR', 'Thiếu mã danh hiệu.', 400);
      world.career.equipTitle(playerId, titleId);
      const career = world.syncPlayerCareerAndNotify(playerId);
      ok(res, { career, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/unlock-skill', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const skillId = typeof req.body?.skillId === 'string' ? req.body.skillId : '';
      if (!skillId) return fail(res, 'VALIDATION_ERROR', 'Thiếu mã kỹ năng.', 400);
      const unlockRes = world.career.unlockSkillNode(playerId, skillId);
      const career = world.syncPlayerCareerAndNotify(playerId);
      ok(res, { ...unlockRes, career });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // 7. DEV QA CYCLE TRIGGER & MACRO BALANCE SIMULATION
  // ============================================================================

  router.post('/dev/advance-cycle', adminGuard, (req, res, next) => {
    try {
      const cycles = Math.min(10, Math.max(1, Number(req.body?.cycles) || 1));
      const forceEventTemplateId =
        typeof req.body?.forceEventTemplateId === 'string' ? req.body.forceEventTemplateId : undefined;
      let lastRes = null;
      for (let i = 0; i < cycles; i++) {
        lastRes = world.runV4MacroAndOperatingCycle({
          forceEventTemplateId: i === 0 ? forceEventTemplateId : undefined,
        });
      }
      ok(res, { cyclesExecuted: cycles, lastResult: lastRes });
    } catch (err) {
      next(err);
    }
  });

  router.get('/dev/balance-simulation', adminGuard, (req, res, next) => {
    try {
      const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
      const report = WorldMacroV4Engine.runEconomyBalanceSimulation(days, 2026);
      ok(res, report);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
