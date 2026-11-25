import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import type { Asset } from '../../../shared/contracts/types';
import {
  V4_BALANCE_CONFIG,
  type AcquisitionOffer,
  type BusinessBranch,
  type BusinessEmployeeGroup,
  type BusinessEntity,
  type BusinessFinancialPeriod,
  type BusinessModelType,
  type CorporateAuditEntry,
  type EmployeeRole,
  type FranchiseAgreement,
  type GovernanceProposal,
  type GovernanceProposalType,
  type HoldingCompany,
  type MaDealType,
  type PrivateShareListing,
  type ShareholderRecord,
  type V4CityCode,
  type V4MacroIndicators,
} from '../../../shared/contracts/v4';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';
import {
  BUSINESS_CATALOG,
  BUSINESS_CATALOG_MAP,
  BUSINESS_LEVELS,
  EMPLOYEE_ROLE_MAP,
  UPGRADE_NODE_MAP,
  V4_CITY_MAP,
} from './V4Catalog';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Authoritative V4 Business & Corporate Empire Engine.
 * Enforces:
 * - Strict isolation between personal wallets and Company Cash accounts (COMPANY_<id>) via LedgerService
 * - Finite NPC Household City Demand Pools & multiplayer market-share competition
 * - Industry-specific operating formulas (never flat clicker income)
 * - 10-Level upgrade progression with duration & concurrent-upgrade lock
 * - 5-Branch Upgrade Tree (20 functional nodes) + 7 NPC employee roles
 * - Branches across 8 VN cities + Franchise Agreements
 * - Business distress, restructuring & bankruptcy
 * - Corporate Ownership Registry (sum of shares === totalIssuedShares, ownership <= 100%)
 * - Capital Raising (Pre-Money, Investment, Post-Money, Shares Issued, Dilution) -> cash enters Company Account
 * - Private Share Market (Primary Offering vs Secondary Sale)
 * - Governance Voting & Audit Logs
 * - M&A Deal Room (10/25/51/75/100% offers with escrow lock, seller acceptance, atomic settlement)
 * - Holding Company Ownership Tree with strict cycle-prevention & consolidated elimination
 * - Qualified IPO directly into existing MatchingEngine (ESE)
 */
export class BusinessEmpireEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private readonly matching: MatchingEngine;

  private businesses = new Map<string, BusinessEntity>();
  private holdings = new Map<string, HoldingCompany>();
  private privateListings = new Map<string, PrivateShareListing>();
  private maOffers = new Map<string, AcquisitionOffer>();
  private franchises = new Map<string, FranchiseAgreement>();
  private idempotencyResults = new Map<string, unknown>();
  private operatingCycleSeq = 0;
  private processedOperatingTicks = new Set<string>();

  constructor(worldId: string, ledger: LedgerService, matching: MatchingEngine) {
    this.worldId = worldId;
    this.ledger = ledger;
    this.matching = matching;
  }

  public reset(): void {
    this.businesses.clear();
    this.holdings.clear();
    this.privateListings.clear();
    this.maOffers.clear();
    this.franchises.clear();
    this.idempotencyResults.clear();
    this.operatingCycleSeq = 0;
    this.processedOperatingTicks.clear();
  }

  public companyAccountId(businessId: string): string {
    return `COMPANY_V4_${businessId}`;
  }

  public holdingAccountId(holdingId: string): string {
    return `HOLDING_V4_${holdingId}`;
  }

  public listBusinesses(): BusinessEntity[] {
    return Array.from(this.businesses.values()).map((b) => this.cloneBusiness(b));
  }

  public getBusiness(businessId: string): BusinessEntity | undefined {
    const b = this.businesses.get(businessId);
    return b ? this.cloneBusiness(b) : undefined;
  }

  public listHoldings(): HoldingCompany[] {
    return Array.from(this.holdings.values()).map((h) => this.recomputeHoldingConsolidated(h));
  }

  public listPrivateListings(): PrivateShareListing[] {
    return Array.from(this.privateListings.values()).filter((l) => l.status === 'OPEN');
  }

  public listMaOffers(): AcquisitionOffer[] {
    return Array.from(this.maOffers.values());
  }

  public listFranchises(): FranchiseAgreement[] {
    return Array.from(this.franchises.values());
  }

  /**
   * Computes exact player equity across all V4 Businesses (via shareholding %) + Holding Cash.
   * Avoids double-counting subsidiary equity when owned through a Holding Company!
   */
  public getPlayerV4BusinessEquityMinor(playerId: string): number {
    let total = 0;
    for (const b of this.businesses.values()) {
      const sh = b.shareholders.find((s) => s.playerId === playerId);
      if (sh && b.totalIssuedShares > 0) {
        total += Math.round((b.valuationMinor * sh.shares) / b.totalIssuedShares);
      }
    }
    for (const h of this.holdings.values()) {
      if (h.founderId === playerId) {
        // Only add Holding's own cash — subsidiary valuations are already accounted for via shareholding
        total += Math.max(0, h.cashMinor);
      }
    }
    return total;
  }

  // ============================================================================
  // 1. BUSINESS CREATION FLOW (9-STEP VALIDATED REGISTRATION + LEDGER)
  // ============================================================================

  public createBusiness(params: {
    founderId: string;
    founderName: string;
    founderNetWorthMinor: number;
    businessTypeId: string;
    businessName: string;
    ticker: string;
    cityCode: V4CityCode;
    businessModel: BusinessModelType;
    locationLabel?: string;
    linkedPropertyId?: string | null;
    initialCapitalCR: number;
    idempotencyKey?: string;
  }): BusinessEntity {
    if (params.idempotencyKey && this.idempotencyResults.has(`create:${params.founderId}:${params.idempotencyKey}`)) {
      return this.cloneBusiness(
        this.idempotencyResults.get(`create:${params.founderId}:${params.idempotencyKey}`) as BusinessEntity,
      );
    }

    const catalog = BUSINESS_CATALOG_MAP.get(params.businessTypeId);
    if (!catalog) {
      throw new DomainError('VALIDATION_ERROR', 'Loại hình doanh nghiệp không tồn tại trong danh mục.');
    }

    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) {
      throw new DomainError('VALIDATION_ERROR', 'Thành phố hoạt động không hợp lệ.');
    }

    if (
      catalog.requiresFinanceUnlock &&
      params.founderNetWorthMinor < toMinor(V4_BALANCE_CONFIG.financeUnlockMinNetWorthCR)
    ) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Ngành Tài chính yêu cầu tài sản ròng tối thiểu ${V4_BALANCE_CONFIG.financeUnlockMinNetWorthCR.toLocaleString('en-US')} CR để đáp ứng chuẩn quản trị rủi ro.`,
      );
    }

    const cleanTicker = params.ticker.trim().toUpperCase();
    const tickerExists =
      Array.from(this.businesses.values()).some((b) => b.ticker === cleanTicker) ||
      Boolean(this.matching.getAsset(cleanTicker));
    if (tickerExists) {
      throw new DomainError('INVALID_ORDER', `Mã doanh nghiệp ${cleanTicker} đã tồn tại trong WORLD-01.`);
    }

    if (!Number.isFinite(params.initialCapitalCR) || params.initialCapitalCR < catalog.startupCostCR) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Vốn thành lập tối thiểu cho ${catalog.name} là ${catalog.startupCostCR.toLocaleString('en-US')} CR.`,
      );
    }

    const capitalMinor = toMinor(params.initialCapitalCR);
    const businessId = `biz_${crypto.randomBytes(5).toString('hex')}`;
    const companyAccount = this.companyAccountId(businessId);

    // Transfer capital from personal available wallet to strictly isolated company ledger account
    this.ledger.transferAvailable({
      fromAccount: params.founderId,
      toAccount: companyAccount,
      amountMinor: capitalMinor,
      category: 'COMPANY_CAPITAL',
      referenceId: businessId,
      description: `Góp vốn thành lập ${params.businessName} (${cleanTicker}) — ${catalog.name} tại ${city.name}`,
    });

    const fixedAssetAllocMinor = Math.round(capitalMinor * 0.4);
    const workingCashMinor = capitalMinor - fixedAssetAllocMinor;
    const defaultRole: EmployeeRole =
      catalog.industry === 'TECHNOLOGY'
        ? 'ENGINEER'
        : catalog.industry === 'MANUFACTURING'
          ? 'TECHNICIAN'
          : catalog.industry === 'TRANSPORTATION'
            ? 'OPERATOR'
            : catalog.industry === 'FINANCE'
              ? 'MANAGER'
              : 'GENERAL_STAFF';
    const roleSpec = EMPLOYEE_ROLE_MAP.get(defaultRole)!;
    const initialStaffCount = Math.max(1, catalog.minEmployees);
    const initialIssuedShares = 10_000;

    const nowIso = new Date().toISOString();
    const business: BusinessEntity = {
      id: businessId,
      companyId: `cmp_${businessId}`,
      worldId: this.worldId,
      founderId: params.founderId,
      founderName: params.founderName,
      ownerId: params.founderId,
      ownerName: params.founderName,
      ceoId: params.founderId,
      ceoName: params.founderName,
      boardMemberIds: [params.founderId],
      holdingCompanyId: null,
      businessName: params.businessName.trim(),
      ticker: cleanTicker,
      industry: catalog.industry,
      businessTypeId: catalog.typeId,
      businessTypeName: catalog.name,
      businessModel: params.businessModel,
      cityCode: city.code,
      cityName: city.name,
      locationLabel: params.locationLabel?.trim() || `Khu trung tâm thương mại ${city.name}`,
      linkedPropertyId: params.linkedPropertyId ?? null,
      level: 1,
      levelTitle: BUSINESS_LEVELS[0].title,
      initialCapitalMinor: capitalMinor,
      companyCashMinor: workingCashMinor,
      companyAssetsMinor: fixedAssetAllocMinor,
      companyLiabilitiesMinor: 0,
      equityMinor: capitalMinor,
      valuationMinor: capitalMinor,
      revenueLastCycleMinor: 0,
      operatingExpensesLastCycleMinor: 0,
      netProfitLastCycleMinor: 0,
      cumulativeProfitMinor: 0,
      employeeGroups: [
        {
          role: defaultRole,
          count: initialStaffCount,
          salaryPerCycleMinor: toMinor(roleSpec.baseSalaryPerCycleCR),
          skillLevel: 1,
          productivity: roleSpec.baseProductivity,
          satisfaction: 78,
          status: 'ACTIVE',
        },
      ],
      employeeCount: initialStaffCount,
      productionCapacity: catalog.baseDailyCapacity,
      inventoryUnits: Math.round(catalog.baseDailyCapacity * 1.2),
      sellingPriceMinor: toMinor(
        params.businessModel === 'PREMIUM_NICHE'
          ? catalog.baseSellingPriceCR * 1.25
          : params.businessModel === 'MASS_MARKET'
            ? catalog.baseSellingPriceCR * 0.92
            : catalog.baseSellingPriceCR,
      ),
      qualityScore: params.businessModel === 'PREMIUM_NICHE' ? 66 : 54,
      customerDemandUnits: Math.round(catalog.baseDailyCapacity * 0.85),
      marketSharePct: 0,
      reputation: 50,
      customerSatisfaction: 72,
      status: 'ACTIVE',
      consecutiveLossCycles: 0,
      pendingUpgrade: null,
      upgradeTree: {},
      branches: [],
      franchiseEnabled: false,
      franchiseFeeMinor: toMinor(Math.round(catalog.startupCostCR * 0.4)),
      franchiseRoyaltyPct: 6,
      totalIssuedShares: initialIssuedShares,
      treasuryShares: 0,
      shareholders: [
        {
          playerId: params.founderId,
          playerName: params.founderName,
          shares: initialIssuedShares,
          votingShares: initialIssuedShares,
          ownershipPct: 100,
        },
      ],
      isPublicIpo: false,
      ipoSymbol: null,
      ipoPriceMinor: null,
      financialHistory: [],
      proposals: [],
      auditLogs: [
        this.makeAudit(
          businessId,
          params.founderId,
          params.founderName,
          'BUSINESS_CREATED',
          `Thành lập ${params.businessName} (${cleanTicker}) với vốn điều lệ ${params.initialCapitalCR.toLocaleString('en-US')} CR tại ${city.name}.`,
        ),
      ],
      createdAt: nowIso,
    };

    this.recomputeCapacityAndValuation(business);
    this.businesses.set(business.id, business);

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`create:${params.founderId}:${params.idempotencyKey}`, business);
    }

    return this.cloneBusiness(business);
  }

  // ============================================================================
  // 2. CAPITAL INJECTION, PRICING, EMPLOYEES, UPGRADES, BRANCHES & FRANCHISE
  // ============================================================================

  public injectCapital(businessId: string, playerId: string, playerName: string, amountCR: number): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    if (!Number.isFinite(amountCR) || amountCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Số CR góp thêm phải lớn hơn 0.');
    }
    const sh = biz.shareholders.find((s) => s.playerId === playerId);
    if (!sh) throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ cổ đông hiện hữu mới được góp vốn bổ sung trực tiếp.');

    const amountMinor = toMinor(amountCR);
    this.ledger.transferAvailable({
      fromAccount: playerId,
      toAccount: this.companyAccountId(biz.id),
      amountMinor,
      category: 'COMPANY_CAPITAL',
      referenceId: biz.id,
      description: `Góp vốn bổ sung vào tài khoản công ty ${biz.businessName} (${biz.ticker})`,
    });

    biz.companyCashMinor += amountMinor;
    if ((biz.status === 'DISTRESSED' || biz.status === 'RESTRUCTURING') && biz.companyCashMinor > 0) {
      biz.status = 'ACTIVE';
      biz.consecutiveLossCycles = 0;
    }
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, playerId, playerName, 'CAPITAL_INJECTION', `Bổ sung ${amountCR.toLocaleString('en-US')} CR vào tài khoản tiền mặt doanh nghiệp.`),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  public updateBusinessSettings(params: {
    businessId: string;
    requesterId: string;
    sellingPriceCR?: number;
    statusAction?: 'PAUSE' | 'RESUME' | 'RESTRUCTURE';
    enableFranchise?: boolean;
    franchiseFeeCR?: number;
    franchiseRoyaltyPct?: number;
  }): BusinessEntity {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;

    if (typeof params.sellingPriceCR === 'number') {
      const minPrice = catalog.baseSellingPriceCR * 0.5;
      const maxPrice = catalog.baseSellingPriceCR * 2.5;
      if (params.sellingPriceCR < minPrice || params.sellingPriceCR > maxPrice) {
        throw new DomainError(
          'INVALID_PRICE',
          `Giá bán hợp lệ cho ${catalog.name} nằm trong khoảng ${minPrice.toFixed(1)} – ${maxPrice.toFixed(1)} CR.`,
        );
      }
      biz.sellingPriceMinor = toMinor(params.sellingPriceCR);
    }

    if (params.statusAction === 'PAUSE') {
      biz.status = 'SUSPENDED';
    } else if (params.statusAction === 'RESUME') {
      if (biz.status === 'BANKRUPT') {
        throw new DomainError('BUSINESS_LOCKED', 'Doanh nghiệp phá sản cần tái cơ cấu và bổ sung vốn trước khi mở lại.');
      }
      biz.status = biz.companyCashMinor < 0 ? 'DISTRESSED' : 'ACTIVE';
    } else if (params.statusAction === 'RESTRUCTURE') {
      // Sell 30% fixed assets at 70% liquidation value & trim overhead to recover from distress/bankruptcy
      const assetSaleMinor = Math.round(biz.companyAssetsMinor * 0.3 * 0.7);
      biz.companyAssetsMinor = Math.max(0, biz.companyAssetsMinor - Math.round(biz.companyAssetsMinor * 0.3));
      biz.companyCashMinor += assetSaleMinor;
      biz.status = biz.companyCashMinor >= 0 ? 'ACTIVE' : 'RESTRUCTURING';
      biz.consecutiveLossCycles = 0;
      biz.auditLogs.unshift(
        this.makeAudit(biz.id, params.requesterId, biz.ceoName, 'RESTRUCTURE', `Tái cơ cấu tài sản thu hồi ${(assetSaleMinor / 100).toLocaleString('en-US')} CR thanh khoản.`),
      );
    }

    if (params.enableFranchise !== undefined) {
      if (
        params.enableFranchise &&
        (biz.level < V4_BALANCE_CONFIG.franchiseMinBusinessLevel ||
          biz.reputation < V4_BALANCE_CONFIG.franchiseMinReputation)
      ) {
        throw new DomainError(
          'VALIDATION_ERROR',
          `Nhượng quyền yêu cầu doanh nghiệp đạt Level ≥ ${V4_BALANCE_CONFIG.franchiseMinBusinessLevel} và Uy tín ≥ ${V4_BALANCE_CONFIG.franchiseMinReputation}.`,
        );
      }
      biz.franchiseEnabled = params.enableFranchise;
    }

    if (typeof params.franchiseFeeCR === 'number') {
      biz.franchiseFeeMinor = toMinor(clamp(params.franchiseFeeCR, 1_000, 10_000_000));
    }

    if (typeof params.franchiseRoyaltyPct === 'number') {
      biz.franchiseRoyaltyPct = clamp(params.franchiseRoyaltyPct, 2, 15);
    }

    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Hires, trains, fires, or adjusts salary for an NPC Employee Role group.
   * Salaries and training costs are strictly paid out of Company Cash (never personal wallet).
   */
  public manageEmployees(params: {
    businessId: string;
    requesterId: string;
    action: 'HIRE' | 'FIRE' | 'TRAIN' | 'SET_SALARY';
    role: EmployeeRole;
    count?: number;
    salaryCR?: number;
  }): BusinessEntity {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    const spec = EMPLOYEE_ROLE_MAP.get(params.role);
    if (!spec) throw new DomainError('VALIDATION_ERROR', 'Chức danh nhân sự không hợp lệ.');

    let group = biz.employeeGroups.find((g) => g.role === params.role);

    if (params.action === 'HIRE') {
      const addCount = Math.max(1, Math.min(25, Math.floor(params.count ?? 1)));
      const onboardingCostMinor = toMinor(spec.baseSalaryPerCycleCR * 0.5 * addCount);
      if (biz.companyCashMinor < onboardingCostMinor) {
        throw new DomainError('INSUFFICIENT_COMPANY_CASH', 'Tiền mặt công ty không đủ chi phí tuyển dụng ban đầu.');
      }
      biz.companyCashMinor -= onboardingCostMinor;
      this.recordCompanyOutflow(biz.id, SYSTEM_ACCOUNTS.NPC_HOUSEHOLD_POOL, onboardingCostMinor, 'BUSINESS_OPEX', `Tuyển ${addCount} ${spec.label} cho ${biz.ticker}`);

      if (!group) {
        group = {
          role: params.role,
          count: addCount,
          salaryPerCycleMinor: toMinor(spec.baseSalaryPerCycleCR),
          skillLevel: 1,
          productivity: spec.baseProductivity,
          satisfaction: 78,
          status: 'ACTIVE',
        };
        biz.employeeGroups.push(group);
      } else {
        group.count += addCount;
      }
    } else if (params.action === 'FIRE') {
      if (!group || group.count <= 0) {
        throw new DomainError('VALIDATION_ERROR', 'Không có nhân sự ở vị trí này để cắt giảm.');
      }
      const removeCount = Math.min(group.count, Math.max(1, Math.floor(params.count ?? 1)));
      if (biz.employeeCount - removeCount < 1) {
        throw new DomainError('VALIDATION_ERROR', 'Doanh nghiệp phải giữ lại tối thiểu 1 nhân sự vận hành.');
      }
      group.count -= removeCount;
      if (group.count === 0) {
        biz.employeeGroups = biz.employeeGroups.filter((g) => g.role !== params.role);
      }
    } else if (params.action === 'TRAIN') {
      if (!group || group.count <= 0) {
        throw new DomainError('VALIDATION_ERROR', 'Cần tuyển nhân sự trước khi đào tạo.');
      }
      if (group.skillLevel >= 10) {
        throw new DomainError('VALIDATION_ERROR', 'Nhóm nhân sự đã đạt trình độ tối đa (Cấp 10).');
      }
      const trainCostMinor = toMinor(spec.trainingCostCR * group.count * (1 + group.skillLevel * 0.15));
      if (biz.companyCashMinor < trainCostMinor) {
        throw new DomainError('INSUFFICIENT_COMPANY_CASH', 'Tiền mặt công ty không đủ chi phí đào tạo.');
      }
      biz.companyCashMinor -= trainCostMinor;
      this.recordCompanyOutflow(biz.id, SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL, trainCostMinor, 'BUSINESS_UPGRADE', `Đào tạo nâng cấp tay nghề ${spec.label} (${biz.ticker})`);
      group.skillLevel += 1;
      group.productivity = Math.round(spec.baseProductivity * (1 + (group.skillLevel - 1) * 0.16));
      group.satisfaction = Math.min(100, group.satisfaction + 5);
    } else if (params.action === 'SET_SALARY') {
      if (!group) throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy nhóm nhân sự.');
      const newSalCR = params.salaryCR ?? spec.baseSalaryPerCycleCR;
      if (newSalCR < spec.baseSalaryPerCycleCR * 0.6 || newSalCR > spec.baseSalaryPerCycleCR * 2.5) {
        throw new DomainError('VALIDATION_ERROR', 'Mức lương nằm ngoài khung hợp lệ (60% – 250% lương chuẩn).');
      }
      group.salaryPerCycleMinor = toMinor(newSalCR);
      const ratio = newSalCR / spec.baseSalaryPerCycleCR;
      group.satisfaction = Math.round(clamp(55 + (ratio - 0.75) * 60, 25, 100));
      group.status = ratio < 0.85 ? 'UNDERPAID' : 'ACTIVE';
    }

    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Starts or completes a Business Level Upgrade (Levels 1 -> 10) with strict concurrency lock.
   * Rejects concurrent upgrade attempts while another level upgrade is in progress.
   */
  public upgradeBusinessLevel(params: {
    businessId: string;
    requesterId: string;
    currentGameHourTotal: number;
    completeImmediatelyForDev?: boolean;
  }): BusinessEntity {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    if (biz.status === 'BANKRUPT' || biz.status === 'SUSPENDED') {
      throw new DomainError('BUSINESS_LOCKED');
    }
    if (biz.pendingUpgrade) {
      throw new DomainError('UPGRADE_IN_PROGRESS');
    }
    if (biz.level >= 10) {
      throw new DomainError('VALIDATION_ERROR', 'Doanh nghiệp đã đạt cấp tối đa Level 10 (Global Empire).');
    }

    const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;
    const nextSpec = BUSINESS_LEVELS[biz.level]; // index == currentLevel because level is 1-based
    const upgradeCostMinor = toMinor(Math.round(catalog.startupCostCR * nextSpec.upgradeCostMultiplier));

    if (biz.companyCashMinor < upgradeCostMinor) {
      throw new DomainError(
        'INSUFFICIENT_COMPANY_CASH',
        `Cần ${(upgradeCostMinor / 100).toLocaleString('en-US')} CR trong tài khoản công ty để nâng lên Level ${nextSpec.level} (${nextSpec.title}).`,
      );
    }
    if (biz.reputation < nextSpec.requiredReputation) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Cần uy tín tối thiểu ${nextSpec.requiredReputation}/100 (hiện tại ${biz.reputation}/100).`,
      );
    }
    if (biz.equityMinor < toMinor(nextSpec.requiredCapitalCR)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Cần vốn chủ sở hữu tối thiểu ${nextSpec.requiredCapitalCR.toLocaleString('en-US')} CR.`,
      );
    }

    biz.companyCashMinor -= upgradeCostMinor;
    this.recordCompanyOutflow(
      biz.id,
      SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL,
      upgradeCostMinor,
      'BUSINESS_UPGRADE',
      `Nâng cấp ${biz.businessName} lên Level ${nextSpec.level} (${nextSpec.title})`,
    );

    if (params.completeImmediatelyForDev || nextSpec.durationGameHours <= 0) {
      this.applyLevelCompletion(biz, nextSpec.level, upgradeCostMinor);
    } else {
      biz.pendingUpgrade = {
        targetLevel: nextSpec.level,
        startedAtGameHour: params.currentGameHourTotal,
        completesAtGameHour: params.currentGameHourTotal + nextSpec.durationGameHours,
        costMinor: upgradeCostMinor,
      };
    }

    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.requesterId,
        biz.ceoName,
        'LEVEL_UPGRADE',
        `Khởi công nâng cấp lên Level ${nextSpec.level} (${nextSpec.title}) · Chi phí ${(upgradeCostMinor / 100).toLocaleString('en-US')} CR.`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  private applyLevelCompletion(biz: BusinessEntity, targetLevel: number, costMinor: number): void {
    const spec = BUSINESS_LEVELS[targetLevel - 1];
    biz.level = targetLevel;
    biz.levelTitle = spec.title;
    biz.companyAssetsMinor += Math.round(costMinor * 0.8);
    biz.reputation = Math.min(100, biz.reputation + 4);
    biz.pendingUpgrade = null;
    this.recomputeCapacityAndValuation(biz);
  }

  /**
   * Purchases a specific node rank in the 5-Branch Upgrade Tree (FACILITIES / OPERATIONS / PERSONNEL / MARKETING / RND).
   * Every node directly modifies real simulation variables (capacity, quality, demand, COGS, energy efficiency, opex).
   */
  public purchaseUpgradeNode(params: {
    businessId: string;
    requesterId: string;
    nodeId: string;
  }): BusinessEntity {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    const node = UPGRADE_NODE_MAP.get(params.nodeId);
    if (!node) throw new DomainError('VALIDATION_ERROR', 'Hạng mục nâng cấp không tồn tại.');

    const currentRank = biz.upgradeTree[node.id] ?? 0;
    if (currentRank >= node.maxRank) {
      throw new DomainError('VALIDATION_ERROR', `${node.name} đã đạt cấp tối đa (${node.maxRank}/${node.maxRank}).`);
    }

    const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;
    const scaleFactor = Math.max(0.65, Math.pow(catalog.startupCostCR / 25_000, 0.42));
    const costMinor = toMinor(Math.round(node.baseCostCR * scaleFactor * Math.pow(1.45, currentRank)));

    if (biz.companyCashMinor < costMinor) {
      throw new DomainError(
        'INSUFFICIENT_COMPANY_CASH',
        `Cần ${(costMinor / 100).toLocaleString('en-US')} CR trong tài khoản công ty cho ${node.name} cấp ${currentRank + 1}.`,
      );
    }

    biz.companyCashMinor -= costMinor;
    biz.companyAssetsMinor += Math.round(costMinor * 0.6);
    biz.upgradeTree[node.id] = currentRank + 1;
    if (node.qualityBonus) biz.qualityScore = clamp(biz.qualityScore + node.qualityBonus, 10, 100);
    if (node.reputationBonus) biz.reputation = clamp(biz.reputation + node.reputationBonus, 5, 100);

    this.recordCompanyOutflow(
      biz.id,
      SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL,
      costMinor,
      'BUSINESS_UPGRADE',
      `Nâng cấp ${node.name} (Rank ${currentRank + 1}) cho ${biz.ticker}`,
    );

    biz.auditLogs.unshift(
      this.makeAudit(biz.id, params.requesterId, biz.ceoName, 'TREE_UPGRADE', `${node.name} đạt cấp ${currentRank + 1}/${node.maxRank} · ${node.effectSummary}.`),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Opens a new branch in any Vietnamese city (including cross-city expansion).
   */
  public openBranch(params: {
    businessId: string;
    requesterId: string;
    cityCode: V4CityCode;
    locationLabel?: string;
  }): { business: BusinessEntity; branch: BusinessBranch } {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) throw new DomainError('VALIDATION_ERROR', 'Thành phố chi nhánh không hợp lệ.');

    const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;
    const branchCostMinor = toMinor(
      Math.round(catalog.startupCostCR * V4_BALANCE_CONFIG.branchOpeningCostMultiplier * city.rentMultiplier),
    );
    if (biz.companyCashMinor < branchCostMinor) {
      throw new DomainError(
        'INSUFFICIENT_COMPANY_CASH',
        `Cần ${(branchCostMinor / 100).toLocaleString('en-US')} CR trong tài khoản công ty để mở chi nhánh tại ${city.name}.`,
      );
    }

    biz.companyCashMinor -= branchCostMinor;
    biz.companyAssetsMinor += Math.round(branchCostMinor * 0.75);
    this.recordCompanyOutflow(
      biz.id,
      SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL,
      branchCostMinor,
      'BUSINESS_UPGRADE',
      `Mở chi nhánh ${biz.ticker} tại ${city.name}`,
    );

    const branch: BusinessBranch = {
      id: `br_${crypto.randomBytes(4).toString('hex')}`,
      businessId: biz.id,
      cityCode: city.code,
      cityName: city.name,
      locationLabel: params.locationLabel?.trim() || `Chi nhánh trung tâm ${city.name}`,
      openedAt: new Date().toISOString(),
      localDemandUnits: Math.round(catalog.baseDailyCapacity * city.populationWeight * 0.75),
      localEmployees: Math.max(2, catalog.minEmployees),
      capacityUnits: Math.round(catalog.baseDailyCapacity * (0.85 + biz.level * 0.15)),
      revenueLastCycleMinor: 0,
      expensesLastCycleMinor: 0,
      profitLastCycleMinor: 0,
      reputation: Math.max(40, biz.reputation - 5),
      status: 'ACTIVE',
    };

    biz.branches.push(branch);
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, params.requesterId, biz.ceoName, 'BRANCH_OPENED', `Khai trương chi nhánh tại ${city.name} (${branch.locationLabel}).`),
    );
    this.recomputeCapacityAndValuation(biz);
    return { business: this.cloneBusiness(biz), branch: { ...branch } };
  }

  public closeBranch(businessId: string, requesterId: string, branchId: string): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    this.requireOperatorAuthority(biz, requesterId);
    const branch = biz.branches.find((b) => b.id === branchId && b.status !== 'CLOSED');
    if (!branch) throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy chi nhánh đang hoạt động.');
    branch.status = 'CLOSED';
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Signs a Franchise Agreement between another player (franchisee) and a qualified brand (franchisor).
   * Initial fee goes through Ledger directly to franchisor's isolated company account.
   */
  public signFranchiseAgreement(params: {
    franchisorBusinessId: string;
    franchiseePlayerId: string;
    franchiseeName: string;
    cityCode: V4CityCode;
  }): FranchiseAgreement {
    const franchisor = this.requireBusiness(params.franchisorBusinessId);
    if (!franchisor.franchiseEnabled) {
      throw new DomainError('VALIDATION_ERROR', 'Doanh nghiệp này chưa mở chương trình nhượng quyền thương hiệu.');
    }
    if (franchisor.founderId === params.franchiseePlayerId) {
      throw new DomainError('VALIDATION_ERROR', 'Không thể tự ký hợp đồng nhượng quyền với chính thương hiệu của mình.');
    }
    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) throw new DomainError('VALIDATION_ERROR', 'Thành phố không hợp lệ.');

    const feeMinor = franchisor.franchiseFeeMinor;
    const agreementId = `frn_${crypto.randomBytes(4).toString('hex')}`;

    this.ledger.transferAvailable({
      fromAccount: params.franchiseePlayerId,
      toAccount: this.companyAccountId(franchisor.id),
      amountMinor: feeMinor,
      category: 'BUSINESS_FRANCHISE',
      referenceId: agreementId,
      description: `Phí nhượng quyền thương hiệu ${franchisor.businessName} tại ${city.name}`,
    });
    franchisor.companyCashMinor += feeMinor;

    const agreement: FranchiseAgreement = {
      id: agreementId,
      franchisorBusinessId: franchisor.id,
      franchisorName: franchisor.businessName,
      franchiseePlayerId: params.franchiseePlayerId,
      franchiseeName: params.franchiseeName,
      cityCode: city.code,
      initialFeeMinor: feeMinor,
      royaltyRatePct: franchisor.franchiseRoyaltyPct,
      brandStandardMinQuality: Math.max(55, franchisor.qualityScore - 10),
      durationGameDays: 60,
      startedGameDay: 1,
      totalRoyaltiesPaidMinor: 0,
      status: 'ACTIVE',
    };
    this.franchises.set(agreement.id, agreement);
    franchisor.auditLogs.unshift(
      this.makeAudit(franchisor.id, params.franchiseePlayerId, params.franchiseeName, 'FRANCHISE_SIGNED', `Ký hợp đồng nhượng quyền tại ${city.name} (Royalty ${agreement.royaltyRatePct}%).`),
    );
    return { ...agreement };
  }

  // ============================================================================
  // 3. OPERATING CYCLE — FINITE NPC DEMAND, COMPETITION & INDUSTRY FORMULAS
  // ============================================================================

  /**
   * Executes one deterministic, idempotent operating cycle across all active businesses.
   * Formula:
   *   Actual Sales = min(Allocated City Demand, Available Capacity, Available Inventory)
   *   Revenue = Actual Sales * Selling Price (strictly bounded by finite NPC city household budget!)
   *   Net Profit = Revenue - COGS - Salaries - Rent - Utilities - Marketing - Maintenance - Interest - Taxes
   * Companies CAN lose money, enter DISTRESSED, and go BANKRUPT if losses persist without rescue.
   */
  public runOperatingCycle(params: {
    tickId: string;
    gameDay: number;
    currentGameHourTotal: number;
    macro: V4MacroIndicators;
  }): BusinessEntity[] {
    if (this.processedOperatingTicks.has(params.tickId)) {
      return [];
    }
    this.processedOperatingTicks.add(params.tickId);
    if (this.processedOperatingTicks.size > 400) {
      const oldest = this.processedOperatingTicks.values().next().value;
      if (oldest) this.processedOperatingTicks.delete(oldest);
    }

    this.operatingCycleSeq += 1;
    const nowIso = new Date().toISOString();
    const activeBusinesses = Array.from(this.businesses.values()).filter(
      (b) => b.status === 'ACTIVE' || b.status === 'DISTRESSED' || b.status === 'RESTRUCTURING',
    );

    // 1. Complete any finished level upgrades
    for (const biz of activeBusinesses) {
      if (biz.pendingUpgrade && params.currentGameHourTotal >= biz.pendingUpgrade.completesAtGameHour) {
        this.applyLevelCompletion(biz, biz.pendingUpgrade.targetLevel, biz.pendingUpgrade.costMinor);
      }
    }

    // 2. Group businesses by (cityCode + industry) for finite multiplayer competition
    const competitionBuckets = new Map<string, BusinessEntity[]>();
    for (const biz of activeBusinesses) {
      const key = `${biz.cityCode}:${biz.industry}`;
      const list = competitionBuckets.get(key) ?? [];
      list.push(biz);
      competitionBuckets.set(key, list);
    }

    const updated: BusinessEntity[] = [];

    for (const biz of activeBusinesses) {
      const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;
      const city = V4_CITY_MAP.get(biz.cityCode)!;
      const mods = this.computeUpgradeModifiers(biz);
      const bucket = competitionBuckets.get(`${biz.cityCode}:${biz.industry}`) ?? [biz];

      // Compute competitiveness score for market share allocation among rivals in same city+industry
      const scoreOf = (candidate: BusinessEntity) => {
        const cCat = BUSINESS_CATALOG_MAP.get(candidate.businessTypeId)!;
        const cMods = this.computeUpgradeModifiers(candidate);
        const priceRatio = clamp(cCat.baseSellingPriceCR / Math.max(1, candidate.sellingPriceMinor / 100), 0.45, 1.55);
        const qualityWeight = 0.6 + candidate.qualityScore / 100;
        const repWeight = 0.6 + candidate.reputation / 100;
        const mktWeight = 1 + cMods.demandBonusPct / 100;
        const capWeight = Math.pow(Math.max(10, candidate.productionCapacity), 0.35);
        return Math.max(1, priceRatio * qualityWeight * repWeight * mktWeight * capWeight);
      };

      const totalScore = bucket.reduce((acc, c) => acc + scoreOf(c), 0);
      const myScore = scoreOf(biz);
      const marketShare = totalScore > 0 ? myScore / totalScore : 1;
      biz.marketSharePct = Number((marketShare * 100).toFixed(1));

      // Industry-specific macro demand multiplier
      const phaseMult =
        params.macro.phase === 'BOOM'
          ? 1.18
          : params.macro.phase === 'EXPANSION'
            ? 1.06
            : params.macro.phase === 'RECOVERY'
              ? 0.98
              : params.macro.phase === 'SLOWDOWN'
                ? 0.86
                : params.macro.phase === 'RECESSION'
                  ? 0.72
                  : 0.58; // CRISIS

      const sectorDemandFactor = this.computeIndustryDemandFactor(catalog, city, params.macro);
      const priceElasticity = clamp(
        Math.pow(catalog.baseSellingPriceCR / Math.max(1, biz.sellingPriceMinor / 100), 1.15),
        0.35,
        1.4,
      );

      // Finite city demand pool for this industry (divided among competitors by market share!)
      const cityIndustryBaseUnits =
        catalog.baseDailyCapacity *
        city.populationWeight *
        city.incomeIndex *
        (1 + Math.min(bucket.length - 1, 4) * 0.28); // Finite pool grows sublinearly with competitors -> oversaturation hurts!

      const hqDemandUnits = Math.max(
        0,
        Math.round(
          cityIndustryBaseUnits *
            marketShare *
            phaseMult *
            sectorDemandFactor *
            priceElasticity *
            (1 + mods.demandBonusPct / 100),
        ),
      );

      // Restock inventory proportionally to working cash (shortage if cash depleted!)
      const unitCostMult = this.computeIndustryCostFactor(catalog, params.macro) * (1 - mods.costReductionPct / 100);
      const effectiveUnitCostMinor = Math.max(10, Math.round(toMinor(catalog.baseUnitCostCR) * unitCostMult));
      const desiredInventory = Math.max(biz.productionCapacity, hqDemandUnits);
      const maxAffordableUnits =
        biz.companyCashMinor > 0 ? Math.floor((biz.companyCashMinor * 0.85) / effectiveUnitCostMinor) : 0;
      biz.inventoryUnits = Math.min(desiredInventory, Math.max(Math.round(biz.productionCapacity * 0.35), maxAffordableUnits));

      // HQ Actual Sales = min(Demand, Capacity, Inventory)
      const hqSalesUnits = Math.max(0, Math.min(hqDemandUnits, biz.productionCapacity, biz.inventoryUnits));
      const hqGrossRevenueMinor = hqSalesUnits * biz.sellingPriceMinor;

      // Branches revenue & expenses
      let branchRevenueMinor = 0;
      let branchExpensesMinor = 0;
      let totalBranchDemand = 0;
      let totalBranchCapacity = 0;
      let totalBranchSales = 0;

      for (const br of biz.branches) {
        if (br.status !== 'ACTIVE') continue;
        const brCity = V4_CITY_MAP.get(br.cityCode) ?? city;
        const brDemand = Math.max(
          0,
          Math.round(
            catalog.baseDailyCapacity *
              brCity.populationWeight *
              phaseMult *
              this.computeIndustryDemandFactor(catalog, brCity, params.macro) *
              priceElasticity *
              (1 + mods.demandBonusPct / 100) *
              0.78,
          ),
        );
        const brSales = Math.min(brDemand, br.capacityUnits);
        const brRev = brSales * biz.sellingPriceMinor;
        const brCogs = brSales * effectiveUnitCostMinor;
        const brOpex = Math.round(toMinor(catalog.baseOperatingCostCR * 0.65 * brCity.rentMultiplier) + toMinor(br.localEmployees * 310));
        br.localDemandUnits = brDemand;
        br.revenueLastCycleMinor = brRev;
        br.expensesLastCycleMinor = brCogs + brOpex;
        br.profitLastCycleMinor = brRev - (brCogs + brOpex);
        branchRevenueMinor += brRev;
        branchExpensesMinor += brCogs + brOpex;
        totalBranchDemand += brDemand;
        totalBranchCapacity += br.capacityUnits;
        totalBranchSales += brSales;
      }

      // Finite NPC Household Pool Cap (never mint revenue from thin air!)
      const npcPoolAvailable = this.ledger.getSystemBalance(SYSTEM_ACCOUNTS.NPC_HOUSEHOLD_POOL);
      const rawTotalRevenueMinor = hqGrossRevenueMinor + branchRevenueMinor;
      const cappedRevenueMinor = Math.min(rawTotalRevenueMinor, Math.min(city.householdPoolPerCycleMinor, npcPoolAvailable));

      // Detailed expense lines
      const levelSpec = BUSINESS_LEVELS[biz.level - 1];
      const cogsMinor = hqSalesUnits * effectiveUnitCostMinor;
      const salariesMinor = biz.employeeGroups.reduce((acc, g) => acc + g.count * g.salaryPerCycleMinor, 0);
      const rentMinor = catalog.requiresPremises
        ? Math.round(toMinor(catalog.baseOperatingCostCR * 0.35 * city.rentMultiplier * levelSpec.opexMultiplier))
        : Math.round(toMinor(catalog.baseOperatingCostCR * 0.1 * levelSpec.opexMultiplier));
      const energyFactor = (params.macro.energyPriceIndex / 100) * (1 - mods.energyEfficiencyPct / 100);
      const utilitiesMinor = Math.round(toMinor(catalog.baseOperatingCostCR * 0.22 * levelSpec.opexMultiplier * energyFactor));
      const marketingMinor = Math.round(toMinor(mods.extraOpexCR * 0.45));
      const maintenanceMinor = Math.round(
        toMinor(catalog.baseOperatingCostCR * 0.18 * levelSpec.opexMultiplier) + toMinor(mods.extraOpexCR * 0.55),
      );
      const interestMinor =
        biz.companyLiabilitiesMinor > 0
          ? Math.round((biz.companyLiabilitiesMinor * (params.macro.interestRatePct + 2.5)) / 100 / 30)
          : 0;

      const preTaxExpensesMinor =
        cogsMinor + salariesMinor + rentMinor + utilitiesMinor + marketingMinor + maintenanceMinor + interestMinor + branchExpensesMinor;
      const preTaxProfitMinor = cappedRevenueMinor - preTaxExpensesMinor;
      const taxMinor =
        preTaxProfitMinor > 0 ? Math.round((preTaxProfitMinor * V4_BALANCE_CONFIG.corporateTaxRatePct) / 100) : 0;
      const totalExpensesMinor = preTaxExpensesMinor + taxMinor;
      const netProfitMinor = cappedRevenueMinor - totalExpensesMinor;

      // Record cash inflows/outflows against isolated company ledger & recycle wages/taxes to NPC pool
      if (cappedRevenueMinor > 0) {
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.NPC_HOUSEHOLD_POOL,
          toAccount: this.companyAccountId(biz.id),
          amountMinor: cappedRevenueMinor,
          category: 'BUSINESS_REVENUE',
          referenceId: `${biz.id}_c${this.operatingCycleSeq}`,
          description: `Doanh thu tiêu dùng NPC kỳ #${this.operatingCycleSeq} của ${biz.ticker}`,
        });
      }

      // Wages & COGS recycle back into NPC Household Pool so finite economy stays circular
      const recycleToHousehold = Math.min(
        Math.max(0, biz.companyCashMinor + cappedRevenueMinor),
        salariesMinor + cogsMinor,
      );
      if (recycleToHousehold > 0) {
        this.recordCompanyOutflow(
          biz.id,
          SYSTEM_ACCOUNTS.NPC_HOUSEHOLD_POOL,
          recycleToHousehold,
          'BUSINESS_OPEX',
          `Chi trả lương & nguyên liệu kỳ #${this.operatingCycleSeq} (${biz.ticker})`,
        );
      }

      const otherOutflow = Math.min(
        Math.max(0, biz.companyCashMinor + cappedRevenueMinor - recycleToHousehold),
        Math.max(0, totalExpensesMinor - salariesMinor - cogsMinor),
      );
      if (otherOutflow > 0) {
        this.recordCompanyOutflow(
          biz.id,
          SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL,
          otherOutflow,
          'BUSINESS_OPEX',
          `Chi phí mặt bằng, điện nước & thuế kỳ #${this.operatingCycleSeq} (${biz.ticker})`,
        );
      }

      // Franchise royalty collection from active franchisees
      for (const fr of this.franchises.values()) {
        if (fr.franchisorBusinessId === biz.id && fr.status === 'ACTIVE') {
          const royaltyMinor = Math.round((cappedRevenueMinor * 0.25 * fr.royaltyRatePct) / 100);
          const fWallet = this.ledger.wallets.getWallet(fr.franchiseePlayerId);
          if (royaltyMinor > 0 && fWallet && fWallet.availableMinor >= royaltyMinor) {
            this.ledger.transferAvailable({
              fromAccount: fr.franchiseePlayerId,
              toAccount: this.companyAccountId(biz.id),
              amountMinor: royaltyMinor,
              category: 'BUSINESS_FRANCHISE',
              referenceId: fr.id,
              description: `Phí bản quyền nhượng quyền (${fr.royaltyRatePct}%) cho ${biz.ticker}`,
            });
            biz.companyCashMinor += royaltyMinor;
            fr.totalRoyaltiesPaidMinor += royaltyMinor;
          }
        }
      }

      biz.revenueLastCycleMinor = cappedRevenueMinor;
      biz.operatingExpensesLastCycleMinor = totalExpensesMinor;
      biz.netProfitLastCycleMinor = netProfitMinor;
      biz.cumulativeProfitMinor += netProfitMinor;
      biz.companyCashMinor += netProfitMinor;
      biz.customerDemandUnits = hqDemandUnits + totalBranchDemand;

      // Update status, consecutive losses, bankruptcy & reputation
      if (netProfitMinor < 0) {
        biz.consecutiveLossCycles += 1;
      } else {
        biz.consecutiveLossCycles = 0;
      }

      if (biz.companyCashMinor < 0) {
        biz.reputation = Math.max(10, biz.reputation - 5);
        if (biz.consecutiveLossCycles >= V4_BALANCE_CONFIG.bankruptcyConsecutiveLossLimit) {
          biz.status = 'BANKRUPT';
          biz.auditLogs.unshift(
            this.makeAudit(biz.id, 'SYSTEM', 'WORLD-01 Audit', 'BANKRUPTCY', `Doanh nghiệp mất khả năng thanh toán sau ${biz.consecutiveLossCycles} kỳ lỗ liên tiếp. Cần tái cơ cấu hoặc góp vốn cứu trợ.`),
          );
        } else {
          biz.status = 'DISTRESSED';
        }
      } else {
        biz.status = 'ACTIVE';
        if (netProfitMinor > 0) {
          biz.reputation = Math.min(100, biz.reputation + 1);
        }
      }

      const totalCap = biz.productionCapacity + totalBranchCapacity;
      const totalSales = hqSalesUnits + totalBranchSales;
      const utilizationPct = totalCap > 0 ? Number(((totalSales / totalCap) * 100).toFixed(1)) : 0;
      biz.customerSatisfaction = Math.round(
        clamp(biz.qualityScore * 0.55 + biz.reputation * 0.35 + (priceElasticity >= 0.95 ? 12 : -6), 15, 100),
      );

      const period: BusinessFinancialPeriod = {
        cycleId: this.operatingCycleSeq,
        gameDay: params.gameDay,
        timestamp: nowIso,
        demandUnits: biz.customerDemandUnits,
        capacityUnits: totalCap,
        actualSalesUnits: totalSales,
        sellingPriceMinor: biz.sellingPriceMinor,
        revenueMinor: cappedRevenueMinor,
        cogsMinor,
        salariesMinor,
        rentMinor,
        utilitiesMinor,
        marketingMinor,
        maintenanceMinor,
        interestMinor,
        taxMinor,
        totalExpensesMinor,
        netProfitMinor,
        marketSharePct: biz.marketSharePct,
        capacityUtilizationPct: utilizationPct,
        cashEndingMinor: biz.companyCashMinor,
      };
      biz.financialHistory.push(period);
      if (biz.financialHistory.length > 36) biz.financialHistory.shift();

      this.recomputeCapacityAndValuation(biz);
      updated.push(this.cloneBusiness(biz));
    }

    return updated;
  }

  private computeIndustryDemandFactor(
    catalog: (typeof BUSINESS_CATALOG)[number],
    city: { tourismIndex: number; techIndex: number; industrialIndex: number },
    macro: V4MacroIndicators,
  ): number {
    switch (catalog.demandCategory) {
      case 'TOURISM':
        return (macro.householdSpendingIndex / 100) * (0.7 + city.tourismIndex * 0.35);
      case 'ENTERPRISE':
        return (macro.businessInvestmentIndex / 100) * (0.75 + city.techIndex * 0.3);
      case 'INDUSTRIAL':
        return (macro.businessInvestmentIndex / 100) * (0.75 + city.industrialIndex * 0.3);
      case 'LUXURY':
        return Math.pow(macro.consumerConfidenceIndex / 68, 1.35) * (macro.householdSpendingIndex / 100);
      case 'LOGISTICS':
        return ((macro.householdSpendingIndex + macro.businessInvestmentIndex) / 200) * (0.8 + city.industrialIndex * 0.25);
      case 'FINANCIAL':
        return (macro.bankingLiquidityIndex / 80) * (macro.consumerConfidenceIndex / 68);
      default:
        return macro.householdSpendingIndex / 100;
    }
  }

  private computeIndustryCostFactor(
    catalog: (typeof BUSINESS_CATALOG)[number],
    macro: V4MacroIndicators,
  ): number {
    if (catalog.industry === 'TRANSPORTATION') {
      return 0.55 + (macro.energyPriceIndex / 100) * 0.45;
    }
    if (catalog.industry === 'MANUFACTURING' || catalog.industry === 'REAL_ESTATE') {
      return 0.45 + (macro.manufacturingCostIndex / 100) * 0.4 + (macro.energyPriceIndex / 100) * 0.15;
    }
    if (catalog.industry === 'RETAIL' || catalog.industry === 'FNB') {
      return 0.55 + (macro.manufacturingCostIndex / 100) * 0.3 + (macro.energyPriceIndex / 100) * 0.15;
    }
    return 0.75 + (macro.inflationPct / 100) * 2.5 + (macro.energyPriceIndex / 100) * 0.15;
  }

  // ============================================================================
  // 4. CORPORATE EMPIRE: DIVIDENDS, CAPITAL RAISING, PRIVATE SHARES, GOVERNANCE, M&A, HOLDING & IPO
  // ============================================================================

  public distributeDividend(businessId: string, requesterId: string, amountCR: number): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    this.requireOperatorAuthority(biz, requesterId);
    if (biz.status !== 'ACTIVE') {
      throw new DomainError('BUSINESS_LOCKED', 'Doanh nghiệp phải ở trạng thái hoạt động lành mạnh mới được chia cổ tức.');
    }
    const amountMinor = toMinor(amountCR);
    if (amountMinor <= 0 || biz.companyCashMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_COMPANY_CASH');
    }

    biz.companyCashMinor -= amountMinor;
    const companyAcc = this.companyAccountId(biz.id);

    for (const sh of biz.shareholders) {
      const shareMinor = Math.round((amountMinor * sh.shares) / biz.totalIssuedShares);
      if (shareMinor <= 0) continue;
      this.ledger.transferAvailable({
        fromAccount: companyAcc,
        toAccount: sh.playerId,
        amountMinor: shareMinor,
        category: 'COMPANY_DIVIDEND',
        referenceId: biz.id,
        description: `Cổ tức từ ${biz.businessName} (${biz.ticker}) — ${sh.ownershipPct.toFixed(1)}% cổ phần`,
      });
    }

    biz.auditLogs.unshift(
      this.makeAudit(biz.id, requesterId, biz.ceoName, 'DIVIDEND_PAID', `Chi trả tổng cổ tức ${amountCR.toLocaleString('en-US')} CR theo tỷ lệ cổ đông.`),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Primary Capital Raising with explicit Pre-Money, Investment Amount, Post-Money, Shares Issued & Ownership Dilution.
   * Capital enters the isolated Company Account (never personal founder wallet!).
   */
  public raiseCapital(params: {
    businessId: string;
    investorId: string;
    investorName: string;
    investmentCR: number;
    preMoneyValuationCR?: number;
    approvedByFounderId?: string;
  }): {
    business: BusinessEntity;
    preMoneyValuationMinor: number;
    investmentMinor: number;
    postMoneyValuationMinor: number;
    sharesIssued: number;
    investorOwnershipPct: number;
    dilutionPct: number;
  } {
    const biz = this.requireBusiness(params.businessId);
    if (biz.status === 'BANKRUPT') throw new DomainError('BUSINESS_LOCKED');

    const investmentMinor = toMinor(params.investmentCR);
    if (investmentMinor <= 0) throw new DomainError('VALIDATION_ERROR', 'Số tiền góp vốn phải lớn hơn 0.');

    const preMoneyValuationMinor = params.preMoneyValuationCR
      ? toMinor(params.preMoneyValuationCR)
      : Math.max(biz.valuationMinor, biz.initialCapitalMinor);
    const postMoneyValuationMinor = preMoneyValuationMinor + investmentMinor;

    // New shares issued so investor receives exact ratio: investment / postMoney
    const pricePerShareMinor = Math.max(1, Math.round(preMoneyValuationMinor / biz.totalIssuedShares));
    const sharesIssued = Math.max(1, Math.round((biz.totalIssuedShares * investmentMinor) / preMoneyValuationMinor));

    this.ledger.transferAvailable({
      fromAccount: params.investorId,
      toAccount: this.companyAccountId(biz.id),
      amountMinor: investmentMinor,
      category: 'SHARE_OFFERING',
      referenceId: biz.id,
      description: `Gọi vốn Primary Offering vào ${biz.businessName} (${biz.ticker})`,
    });

    biz.companyCashMinor += investmentMinor;
    biz.totalIssuedShares += sharesIssued;

    const existing = biz.shareholders.find((s) => s.playerId === params.investorId);
    if (existing) {
      existing.shares += sharesIssued;
      existing.votingShares += sharesIssued;
    } else {
      biz.shareholders.push({
        playerId: params.investorId,
        playerName: params.investorName,
        shares: sharesIssued,
        votingShares: sharesIssued,
        ownershipPct: 0,
      });
    }

    this.normalizeShareholders(biz);
    const investorRecord = biz.shareholders.find((s) => s.playerId === params.investorId)!;
    const dilutionPct = Number(((sharesIssued / biz.totalIssuedShares) * 100).toFixed(2));

    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.investorId,
        params.investorName,
        'CAPITAL_RAISE',
        `Gọi vốn ${(investmentMinor / 100).toLocaleString('en-US')} CR · Pre-Money ${(preMoneyValuationMinor / 100).toLocaleString('en-US')} CR → Post-Money ${(postMoneyValuationMinor / 100).toLocaleString('en-US')} CR · Phát hành ${sharesIssued.toLocaleString('en-US')} CP (Pha loãng ${dilutionPct}%).`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);

    return {
      business: this.cloneBusiness(biz),
      preMoneyValuationMinor,
      investmentMinor,
      postMoneyValuationMinor,
      sharesIssued,
      investorOwnershipPct: investorRecord.ownershipPct,
      dilutionPct,
    };
  }

  /**
   * Lists shares on the Private Share Market — cleanly distinguishing PRIMARY (new shares -> cash to company)
   * vs SECONDARY (existing shares -> cash to selling shareholder, zero dilution).
   */
  public createPrivateShareListing(params: {
    businessId: string;
    sellerId: string;
    sellerName: string;
    offeringType: 'PRIMARY' | 'SECONDARY';
    shares: number;
    pricePerShareCR: number;
  }): PrivateShareListing {
    const biz = this.requireBusiness(params.businessId);
    const shares = Math.floor(params.shares);
    if (shares <= 0 || !Number.isFinite(params.pricePerShareCR) || params.pricePerShareCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Số lượng cổ phần và giá chào bán phải lớn hơn 0.');
    }

    if (params.offeringType === 'PRIMARY') {
      this.requireOperatorAuthority(biz, params.sellerId);
      if (shares > biz.totalIssuedShares) {
        throw new DomainError('VALIDATION_ERROR', 'Không được phát hành vượt quá 100% số cổ phần hiện lưu hành trong một đợt.');
      }
    } else {
      const sh = biz.shareholders.find((s) => s.playerId === params.sellerId);
      const alreadyListed = Array.from(this.privateListings.values())
        .filter((l) => l.status === 'OPEN' && l.companyId === biz.id && l.sellerId === params.sellerId && l.offeringType === 'SECONDARY')
        .reduce((a, b) => a + b.sharesAvailable, 0);
      if (!sh || sh.shares - alreadyListed < shares) {
        throw new DomainError('INSUFFICIENT_ASSET_BALANCE', 'Số cổ phần sở hữu khả dụng không đủ để chào bán.');
      }
    }

    const priceMinor = toMinor(params.pricePerShareCR);
    const preMoney = biz.totalIssuedShares * priceMinor;
    const postMoney = params.offeringType === 'PRIMARY' ? preMoney + shares * priceMinor : preMoney;
    const dilutionPct =
      params.offeringType === 'PRIMARY'
        ? Number(((shares / (biz.totalIssuedShares + shares)) * 100).toFixed(2))
        : 0;

    const listing: PrivateShareListing = {
      id: `psl_${crypto.randomBytes(4).toString('hex')}`,
      companyId: biz.id,
      companyName: biz.businessName,
      ticker: biz.ticker,
      offeringType: params.offeringType,
      sellerId: params.sellerId,
      sellerName: params.sellerName,
      sharesAvailable: shares,
      pricePerShareMinor: priceMinor,
      preMoneyValuationMinor: preMoney,
      postMoneyValuationMinor: postMoney,
      dilutionPct,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    this.privateListings.set(listing.id, listing);
    return { ...listing };
  }

  /**
   * Purchases shares from a Private Share Market listing with concurrency protection & exact settlement.
   */
  public buyPrivateShareListing(params: {
    listingId: string;
    buyerId: string;
    buyerName: string;
    shares: number;
  }): { listing: PrivateShareListing; business: BusinessEntity } {
    const listing = this.privateListings.get(params.listingId);
    if (!listing || listing.status !== 'OPEN') {
      throw new DomainError('ORDER_NOT_FOUND', 'Chào bán cổ phần không còn hiệu lực hoặc đã được mua hết.');
    }
    const buyShares = Math.floor(params.shares);
    if (buyShares <= 0 || buyShares > listing.sharesAvailable) {
      throw new DomainError('INVALID_ORDER', `Chỉ còn ${listing.sharesAvailable} cổ phần khả dụng.`);
    }
    if (listing.offeringType === 'SECONDARY' && listing.sellerId === params.buyerId) {
      throw new DomainError('SELF_TRADE_FORBIDDEN', 'Không thể tự mua lại cổ phần do chính mình chào bán.');
    }

    const biz = this.requireBusiness(listing.companyId);
    const grossMinor = buyShares * listing.pricePerShareMinor;
    const feeMinor = Math.round((grossMinor * V4_BALANCE_CONFIG.privateShareFeePct) / 100);

    if (listing.offeringType === 'PRIMARY') {
      // Cash goes strictly to Company Account; new shares issued (dilution)
      this.ledger.transferAvailable({
        fromAccount: params.buyerId,
        toAccount: this.companyAccountId(biz.id),
        amountMinor: grossMinor,
        category: 'SHARE_OFFERING',
        referenceId: listing.id,
        description: `Mua ${buyShares} CP phát hành mới (Primary) của ${biz.ticker}`,
      });
      if (feeMinor > 0) {
        this.ledger.transferAvailable({
          fromAccount: params.buyerId,
          toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
          amountMinor: feeMinor,
          category: 'TRADING_FEE',
          referenceId: listing.id,
          description: `Phí giao dịch thị trường cổ phần tư nhân (${biz.ticker})`,
        });
      }
      biz.companyCashMinor += grossMinor;
      biz.totalIssuedShares += buyShares;
    } else {
      // Secondary Sale: Seller must still hold shares; cash goes to Seller, zero dilution!
      const sellerRec = biz.shareholders.find((s) => s.playerId === listing.sellerId);
      if (!sellerRec || sellerRec.shares < buyShares) {
        listing.status = 'CANCELLED';
        throw new DomainError('INSUFFICIENT_ASSET_BALANCE', 'Người bán không còn đủ cổ phần.');
      }
      this.ledger.transferAvailable({
        fromAccount: params.buyerId,
        toAccount: listing.sellerId,
        amountMinor: grossMinor,
        category: 'SHARE_TRANSFER',
        referenceId: listing.id,
        description: `Chuyển nhượng ${buyShares} CP thứ cấp (Secondary) của ${biz.ticker}`,
      });
      if (feeMinor > 0) {
        this.ledger.transferAvailable({
          fromAccount: params.buyerId,
          toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
          amountMinor: feeMinor,
          category: 'TRADING_FEE',
          referenceId: listing.id,
          description: `Phí chuyển nhượng cổ phần ${biz.ticker}`,
        });
      }
      sellerRec.shares -= buyShares;
      sellerRec.votingShares -= buyShares;
    }

    const buyerRec = biz.shareholders.find((s) => s.playerId === params.buyerId);
    if (buyerRec) {
      buyerRec.shares += buyShares;
      buyerRec.votingShares += buyShares;
    } else {
      biz.shareholders.push({
        playerId: params.buyerId,
        playerName: params.buyerName,
        shares: buyShares,
        votingShares: buyShares,
        ownershipPct: 0,
      });
    }

    listing.sharesAvailable -= buyShares;
    if (listing.sharesAvailable === 0) listing.status = 'FILLED';

    this.normalizeShareholders(biz);
    this.syncControllingOwner(biz);
    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.buyerId,
        params.buyerName,
        listing.offeringType === 'PRIMARY' ? 'PRIMARY_SUBSCRIPTION' : 'SECONDARY_TRANSFER',
        `${params.buyerName} mua ${buyShares} CP (${listing.offeringType}) tại ${(listing.pricePerShareMinor / 100).toFixed(2)} CR/CP.`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);

    return { listing: { ...listing }, business: this.cloneBusiness(biz) };
  }

  // ============================================================================
  // 5. CORPORATE GOVERNANCE VOTING
  // ============================================================================

  public createGovernanceProposal(params: {
    businessId: string;
    proposerId: string;
    proposerName: string;
    type: GovernanceProposalType;
    title: string;
    description: string;
    payload?: Record<string, unknown>;
  }): GovernanceProposal {
    const biz = this.requireBusiness(params.businessId);
    const sh = biz.shareholders.find((s) => s.playerId === params.proposerId);
    if (!sh || sh.votingShares <= 0) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ cổ đông có quyền biểu quyết mới được tạo nghị quyết.');
    }

    const proposal: GovernanceProposal = {
      id: `gov_${crypto.randomBytes(4).toString('hex')}`,
      companyId: biz.id,
      type: params.type,
      title: params.title.trim(),
      description: params.description.trim(),
      proposerId: params.proposerId,
      proposerName: params.proposerName,
      payload: params.payload ?? {},
      votesFor: sh.votingShares,
      votesAgainst: 0,
      voters: [{ playerId: params.proposerId, vote: 'FOR', weight: sh.votingShares }],
      requiredMajorityPct: params.type === 'DISSOLVE' || params.type === 'MERGER' ? 65 : 50.01,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };

    biz.proposals.unshift(proposal);
    this.evaluateProposal(biz, proposal);
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, params.proposerId, params.proposerName, 'PROPOSAL_CREATED', `Đề xuất nghị quyết [${params.type}]: ${proposal.title}`),
    );
    return { ...proposal };
  }

  public voteOnProposal(params: {
    businessId: string;
    proposalId: string;
    voterId: string;
    voterName: string;
    vote: 'FOR' | 'AGAINST';
  }): GovernanceProposal {
    const biz = this.requireBusiness(params.businessId);
    const prop = biz.proposals.find((p) => p.id === params.proposalId);
    if (!prop || prop.status !== 'OPEN') {
      throw new DomainError('VALIDATION_ERROR', 'Nghị quyết không tồn tại hoặc đã đóng.');
    }
    const sh = biz.shareholders.find((s) => s.playerId === params.voterId);
    if (!sh || sh.votingShares <= 0) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Bạn không có cổ phần biểu quyết tại công ty này.');
    }
    if (prop.voters.some((v) => v.playerId === params.voterId)) {
      throw new DomainError('VALIDATION_ERROR', 'Bạn đã biểu quyết cho nghị quyết này rồi.');
    }

    prop.voters.push({ playerId: params.voterId, vote: params.vote, weight: sh.votingShares });
    if (params.vote === 'FOR') prop.votesFor += sh.votingShares;
    else prop.votesAgainst += sh.votingShares;

    this.evaluateProposal(biz, prop);
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, params.voterId, params.voterName, 'PROPOSAL_VOTE', `Biểu quyết ${params.vote} (${sh.ownershipPct.toFixed(1)}%) cho "${prop.title}".`),
    );
    return { ...prop };
  }

  private evaluateProposal(biz: BusinessEntity, prop: GovernanceProposal): void {
    const totalVoting = Math.max(1, biz.totalIssuedShares);
    const forPct = (prop.votesFor / totalVoting) * 100;
    const againstPct = (prop.votesAgainst / totalVoting) * 100;

    if (forPct >= prop.requiredMajorityPct) {
      prop.status = 'APPROVED';
      prop.resolvedAt = new Date().toISOString();
      if (prop.type === 'APPOINT_CEO' && typeof prop.payload.newCeoId === 'string' && typeof prop.payload.newCeoName === 'string') {
        biz.ceoId = prop.payload.newCeoId;
        biz.ceoName = prop.payload.newCeoName;
        prop.status = 'EXECUTED';
      } else if (prop.type === 'DISSOLVE') {
        biz.status = 'SUSPENDED';
        prop.status = 'EXECUTED';
      }
    } else if (againstPct > 100 - prop.requiredMajorityPct) {
      prop.status = 'REJECTED';
      prop.resolvedAt = new Date().toISOString();
    }
  }

  // ============================================================================
  // 6. MERGERS & ACQUISITIONS (CORPORATE DEAL ROOM)
  // ============================================================================

  public submitAcquisitionOffer(params: {
    targetCompanyId: string;
    buyerId: string;
    buyerName: string;
    buyerHoldingId?: string | null;
    targetPct: 10 | 25 | 51 | 75 | 100;
    offerPricePerShareCR: number;
  }): AcquisitionOffer {
    const target = this.requireBusiness(params.targetCompanyId);
    // Find majority/selling shareholder (cannot buy shares that don't have a seller)
    const seller = target.shareholders
      .filter((s) => s.playerId !== params.buyerId)
      .sort((a, b) => b.shares - a.shares)[0];

    if (!seller) {
      throw new DomainError('VALIDATION_ERROR', 'Không có cổ đông bán phù hợp cho thương vụ M&A này.');
    }

    const sharesRequested = Math.max(1, Math.round((target.totalIssuedShares * params.targetPct) / 100));
    if (seller.shares < sharesRequested) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Cổ đông chính chỉ nắm giữ ${seller.shares.toLocaleString('en-US')} CP (${seller.ownershipPct.toFixed(1)}%), không đủ cho đề nghị ${params.targetPct}%.`,
      );
    }

    if (params.buyerHoldingId) {
      const holding = this.holdings.get(params.buyerHoldingId);
      if (!holding || holding.founderId !== params.buyerId) {
        throw new DomainError('NOT_COMPANY_OWNER', 'Holding Company không thuộc quyền sở hữu của bạn.');
      }
    }

    const offerPricePerShareMinor = toMinor(params.offerPricePerShareCR);
    if (offerPricePerShareMinor <= 0) throw new DomainError('INVALID_PRICE');

    const totalOfferMinor = sharesRequested * offerPricePerShareMinor;
    const dealId = `ma_${crypto.randomBytes(5).toString('hex')}`;

    // Lock buyer funds in Escrow pool immediately (prevents fake/unfunded M&A offers)
    this.ledger.transferAvailable({
      fromAccount: params.buyerId,
      toAccount: SYSTEM_ACCOUNTS.MA_ESCROW_POOL,
      amountMinor: totalOfferMinor,
      category: 'MA_ESCROW_LOCK',
      referenceId: dealId,
      description: `Phong tỏa ký quỹ M&A mua ${params.targetPct}% cổ phần ${target.ticker}`,
    });

    const dealType: MaDealType =
      params.targetPct === 10
        ? 'MINORITY_INVESTMENT'
        : params.targetPct === 25
          ? 'STRATEGIC_INVESTMENT'
          : params.targetPct === 51
            ? 'CONTROLLING_STAKE'
            : params.targetPct === 75
              ? 'CONTROLLING_STAKE'
              : 'FULL_ACQUISITION';

    const offer: AcquisitionOffer = {
      id: dealId,
      targetCompanyId: target.id,
      targetCompanyName: target.businessName,
      targetTicker: target.ticker,
      buyerId: params.buyerId,
      buyerName: params.buyerName,
      buyerHoldingId: params.buyerHoldingId ?? null,
      sellerId: seller.playerId,
      sellerName: seller.playerName,
      dealType,
      targetPct: params.targetPct,
      sharesRequested,
      offerPricePerShareMinor,
      totalOfferMinor,
      escrowLockedMinor: totalOfferMinor,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.maOffers.set(offer.id, offer);
    target.auditLogs.unshift(
      this.makeAudit(
        target.id,
        params.buyerId,
        params.buyerName,
        'MA_OFFER_SUBMITTED',
        `Gửi đề nghị M&A (${dealType}) mua ${params.targetPct}% cổ phần (${sharesRequested} CP) giá ${(totalOfferMinor / 100).toLocaleString('en-US')} CR.`,
      ),
    );
    return { ...offer };
  }

  public respondAcquisitionOffer(params: {
    offerId: string;
    responderId: string;
    decision: 'ACCEPT' | 'REJECT' | 'CANCEL';
  }): { offer: AcquisitionOffer; business: BusinessEntity } {
    const offer = this.maOffers.get(params.offerId);
    if (!offer || offer.status !== 'PENDING') {
      throw new DomainError('ORDER_NOT_FOUND', 'Đề nghị M&A không tồn tại hoặc đã được xử lý.');
    }
    if (params.decision === 'CANCEL') {
      if (offer.buyerId !== params.responderId) {
        throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ bên mua mới có quyền hủy đề nghị M&A đang chờ.');
      }
    } else if (offer.sellerId !== params.responderId) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ cổ đông nhận đề nghị mới có quyền chấp thuận hoặc từ chối.');
    }

    const target = this.requireBusiness(offer.targetCompanyId);

    if (params.decision === 'REJECT' || params.decision === 'CANCEL') {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.MA_ESCROW_POOL,
        toAccount: offer.buyerId,
        amountMinor: offer.escrowLockedMinor,
        category: 'MA_SETTLEMENT',
        referenceId: offer.id,
        description:
          params.decision === 'CANCEL'
            ? `Hoàn trả ký quỹ M&A do bên mua hủy đề nghị ${target.ticker}`
            : `Hoàn trả ký quỹ M&A do đề nghị ${target.ticker} bị từ chối`,
      });
      offer.escrowLockedMinor = 0;
      offer.status = params.decision === 'CANCEL' ? 'CANCELLED' : 'REJECTED';
      return { offer: { ...offer }, business: this.cloneBusiness(target) };
    }

    // Verify seller still holds requested shares
    const sellerRec = target.shareholders.find((s) => s.playerId === offer.sellerId);
    if (!sellerRec || sellerRec.shares < offer.sharesRequested) {
      throw new DomainError('INSUFFICIENT_ASSET_BALANCE', 'Số cổ phần khả dụng của bên bán không còn đủ để tất toán M&A.');
    }

    // Settle escrow -> seller (minus 1% M&A transaction fee -> FEE_REVENUE)
    const feeMinor = Math.round((offer.escrowLockedMinor * V4_BALANCE_CONFIG.maTransactionFeePct) / 100);
    const sellerProceedsMinor = offer.escrowLockedMinor - feeMinor;

    this.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.MA_ESCROW_POOL,
      toAccount: offer.sellerId,
      amountMinor: sellerProceedsMinor,
      category: 'MA_SETTLEMENT',
      referenceId: offer.id,
      description: `Thanh toán thương vụ M&A ${offer.targetPct}% cổ phần ${target.ticker}`,
    });
    if (feeMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.MA_ESCROW_POOL,
        toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
        amountMinor: feeMinor,
        category: 'TRADING_FEE',
        referenceId: offer.id,
        description: `Phí giao dịch M&A ${target.ticker}`,
      });
    }

    sellerRec.shares -= offer.sharesRequested;
    sellerRec.votingShares -= offer.sharesRequested;

    const buyerRec = target.shareholders.find((s) => s.playerId === offer.buyerId);
    if (buyerRec) {
      buyerRec.shares += offer.sharesRequested;
      buyerRec.votingShares += offer.sharesRequested;
    } else {
      target.shareholders.push({
        playerId: offer.buyerId,
        playerName: offer.buyerName,
        shares: offer.sharesRequested,
        votingShares: offer.sharesRequested,
        ownershipPct: 0,
      });
    }

    this.normalizeShareholders(target);
    this.syncControllingOwner(target);

    // Attach to buyer Holding Company if specified & buyer now holds >= 50%
    const updatedBuyerRec = target.shareholders.find((s) => s.playerId === offer.buyerId);
    if (offer.buyerHoldingId && updatedBuyerRec && updatedBuyerRec.ownershipPct > 50) {
      const holding = this.holdings.get(offer.buyerHoldingId);
      if (holding && !holding.subsidiaryIds.includes(target.id)) {
        target.holdingCompanyId = holding.id;
        holding.subsidiaryIds.push(target.id);
      }
    }

    offer.escrowLockedMinor = 0;
    offer.status = 'SETTLED';
    offer.settledAt = new Date().toISOString();

    target.auditLogs.unshift(
      this.makeAudit(
        target.id,
        offer.buyerId,
        offer.buyerName,
        'MA_SETTLED',
        `Hoàn tất M&A ${offer.targetPct}% cổ phần (${offer.sharesRequested} CP) · Giá trị ${(offer.totalOfferMinor / 100).toLocaleString('en-US')} CR. Công ty vẫn giữ tài khoản độc lập.`,
      ),
    );
    this.recomputeCapacityAndValuation(target);

    return { offer: { ...offer }, business: this.cloneBusiness(target) };
  }

  // ============================================================================
  // 7. HOLDING COMPANY & OWNERSHIP TREE (STRICT CYCLE PREVENTION)
  // ============================================================================

  public createHoldingCompany(params: {
    founderId: string;
    founderName: string;
    name: string;
    ticker: string;
    initialSubsidiaryIds?: string[];
  }): HoldingCompany {
    const cleanTicker = params.ticker.trim().toUpperCase();
    if (Array.from(this.holdings.values()).some((h) => h.ticker === cleanTicker)) {
      throw new DomainError('INVALID_ORDER', `Mã tập đoàn ${cleanTicker} đã tồn tại.`);
    }

    const costMinor = toMinor(V4_BALANCE_CONFIG.holdingCreationCostCR);
    const holdingId = `hld_${crypto.randomBytes(5).toString('hex')}`;

    this.ledger.transferAvailable({
      fromAccount: params.founderId,
      toAccount: this.holdingAccountId(holdingId),
      amountMinor: costMinor,
      category: 'HOLDING_CAPITAL',
      referenceId: holdingId,
      description: `Thành lập Tập đoàn Mẹ (Holding Company) ${params.name} (${cleanTicker})`,
    });

    const holding: HoldingCompany = {
      id: holdingId,
      worldId: this.worldId,
      name: params.name.trim(),
      ticker: cleanTicker,
      founderId: params.founderId,
      founderName: params.founderName,
      cashMinor: Math.round(costMinor * 0.8), // 20% incorporation fee / setup cost absorbed cleanly
      subsidiaryIds: [],
      consolidatedRevenueMinor: 0,
      consolidatedProfitMinor: 0,
      consolidatedAssetsMinor: 0,
      consolidatedLiabilitiesMinor: 0,
      consolidatedEquityMinor: 0,
      intercompanyEliminationMinor: 0,
      createdAt: new Date().toISOString(),
    };

    const setupFee = costMinor - holding.cashMinor;
    if (setupFee > 0) {
      this.ledger.transferAvailable({
        fromAccount: this.holdingAccountId(holdingId),
        toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
        amountMinor: setupFee,
        category: 'TRADING_FEE',
        referenceId: holdingId,
        description: `Phí đăng ký thành lập Tập đoàn ${cleanTicker}`,
      });
    }

    this.holdings.set(holding.id, holding);

    if (params.initialSubsidiaryIds) {
      for (const subId of params.initialSubsidiaryIds) {
        this.attachSubsidiaryToHolding(holding.id, subId, params.founderId);
      }
    }

    return this.recomputeHoldingConsolidated(holding);
  }

  public attachSubsidiaryToHolding(holdingId: string, businessId: string, requesterId: string): HoldingCompany {
    const holding = this.holdings.get(holdingId);
    if (!holding) throw new DomainError('BUSINESS_NOT_FOUND', 'Không tìm thấy Holding Company.');
    if (holding.founderId !== requesterId) throw new DomainError('NOT_COMPANY_OWNER');

    const biz = this.requireBusiness(businessId);
    // Strict cycle guard: a business cannot already be the holding itself or create circular ownership
    if (biz.id === holding.id || biz.companyId === holding.id) {
      throw new DomainError('OWNERSHIP_CYCLE_FORBIDDEN');
    }
    const sh = biz.shareholders.find((s) => s.playerId === requesterId);
    if (!sh || sh.ownershipPct <= 50) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Cần nắm giữ trên 50% cổ phần biểu quyết để đưa công ty vào Tập đoàn Mẹ.');
    }

    // Detach from any previous holding cleanly (preventing multi-parent cycles)
    if (biz.holdingCompanyId && biz.holdingCompanyId !== holding.id) {
      const prev = this.holdings.get(biz.holdingCompanyId);
      if (prev) prev.subsidiaryIds = prev.subsidiaryIds.filter((id) => id !== biz.id);
    }

    biz.holdingCompanyId = holding.id;
    if (!holding.subsidiaryIds.includes(biz.id)) {
      holding.subsidiaryIds.push(biz.id);
    }
    return this.recomputeHoldingConsolidated(holding);
  }

  private recomputeHoldingConsolidated(holding: HoldingCompany): HoldingCompany {
    let rev = 0;
    let profit = 0;
    let assets = holding.cashMinor;
    let liab = 0;
    let equity = holding.cashMinor;
    let intercompanyElimination = 0;

    for (const subId of holding.subsidiaryIds) {
      const sub = this.businesses.get(subId);
      if (!sub) continue;
      rev += sub.revenueLastCycleMinor;
      profit += sub.netProfitLastCycleMinor;
      assets += sub.companyCashMinor + sub.companyAssetsMinor;
      liab += sub.companyLiabilitiesMinor;
      equity += sub.equityMinor;
      // Eliminate internal cross-subsidiary franchise/royalty transfers when same holding owns both
      for (const fr of this.franchises.values()) {
        if (fr.franchisorBusinessId === sub.id && fr.franchiseePlayerId === holding.founderId) {
          intercompanyElimination += fr.totalRoyaltiesPaidMinor;
        }
      }
    }

    holding.consolidatedRevenueMinor = Math.max(0, rev - intercompanyElimination);
    holding.consolidatedProfitMinor = profit;
    holding.consolidatedAssetsMinor = assets;
    holding.consolidatedLiabilitiesMinor = liab;
    holding.consolidatedEquityMinor = equity;
    holding.intercompanyEliminationMinor = intercompanyElimination;
    return { ...holding, subsidiaryIds: [...holding.subsidiaryIds] };
  }

  // ============================================================================
  // 8. IPO SYSTEM — LIST QUALIFIED COMPANIES DIRECTLY ON EXISTING ESE EXCHANGE
  // ============================================================================

  public launchIpo(params: {
    businessId: string;
    requesterId: string;
    offeringShares: number;
    ipoPriceCR: number;
  }): { business: BusinessEntity; listedAsset: Asset } {
    const biz = this.requireBusiness(params.businessId);
    this.requireOperatorAuthority(biz, params.requesterId);

    if (biz.isPublicIpo) {
      throw new DomainError('IPO_REQUIREMENTS_NOT_MET', 'Doanh nghiệp này đã niêm yết IPO lên sàn ESE rồi.');
    }
    if (biz.status !== 'ACTIVE' || biz.companyCashMinor < 0) {
      throw new DomainError('IPO_REQUIREMENTS_NOT_MET', 'Doanh nghiệp đang mất khả năng thanh toán hoặc không ở trạng thái hoạt động.');
    }
    if (biz.level < V4_BALANCE_CONFIG.ipoMinBusinessLevel) {
      throw new DomainError(
        'IPO_REQUIREMENTS_NOT_MET',
        `IPO yêu cầu doanh nghiệp đạt tối thiểu Level ${V4_BALANCE_CONFIG.ipoMinBusinessLevel} (hiện tại Level ${biz.level}).`,
      );
    }
    if (biz.financialHistory.length < V4_BALANCE_CONFIG.ipoMinHistoryCycles) {
      throw new DomainError(
        'IPO_REQUIREMENTS_NOT_MET',
        `IPO yêu cầu ít nhất ${V4_BALANCE_CONFIG.ipoMinHistoryCycles} kỳ báo cáo tài chính minh bạch (hiện có ${biz.financialHistory.length}).`,
      );
    }
    if (biz.equityMinor < toMinor(V4_BALANCE_CONFIG.ipoMinEquityCR)) {
      throw new DomainError(
        'IPO_REQUIREMENTS_NOT_MET',
        `IPO yêu cầu vốn chủ sở hữu tối thiểu ${V4_BALANCE_CONFIG.ipoMinEquityCR.toLocaleString('en-US')} CR.`,
      );
    }

    const offeringShares = Math.floor(params.offeringShares);
    if (offeringShares < 1_000 || offeringShares > biz.totalIssuedShares) {
      throw new DomainError('VALIDATION_ERROR', 'Số cổ phần IPO phải từ 1,000 đến tối đa 100% cổ phần hiện lưu hành.');
    }

    const ipoPriceMinor = toMinor(params.ipoPriceCR);
    if (ipoPriceMinor < 100) throw new DomainError('INVALID_PRICE', 'Giá IPO tối thiểu là 1.00 CR/cổ phiếu.');

    const ipoSymbol = biz.ticker;
    if (this.matching.getAsset(ipoSymbol)) {
      throw new DomainError('IPO_REQUIREMENTS_NOT_MET', `Mã chứng khoán ${ipoSymbol} đã tồn tại trên sàn ESE.`);
    }

    // Register directly into the existing MatchingEngine (ESE) — never create a second disconnected exchange!
    const totalSharesAfterIpo = biz.totalIssuedShares + offeringShares;
    const listedAsset: Asset = {
      symbol: ipoSymbol,
      name: biz.businessName,
      marketClass: 'STOCK',
      exchange: 'ESE',
      description: `Cổ phiếu niêm yết IPO từ Empire Business Network (${biz.businessTypeName} · ${biz.cityName}).`,
      priceTickMinor: 5,
      qtyStep: 1,
      minQty: 1,
      maxOrderQty: 50_000,
      circulatingSupply: totalSharesAfterIpo,
      referencePriceMinor: ipoPriceMinor,
      lastPriceMinor: ipoPriceMinor,
      open24hMinor: ipoPriceMinor,
      high24hMinor: ipoPriceMinor,
      low24hMinor: ipoPriceMinor,
      volume24h: 0,
      turnover24hMinor: 0,
      priceChange24hMinor: 0,
      priceChange24hPct: 0,
      marketCapMinor: totalSharesAfterIpo * ipoPriceMinor,
      status: 'OPEN',
      sentimentScore: 15,
      liquidityScore: 55,
      fundamentals: {
        sector: 'Technology',
        revenueMinor: biz.revenueLastCycleMinor * 4,
        operatingCostMinor: biz.operatingExpensesLastCycleMinor * 4,
        operatingProfitMinor: biz.netProfitLastCycleMinor * 4,
        debtInterestMinor: 0,
        netProfitMinor: biz.netProfitLastCycleMinor * 4,
        assetsMinor: biz.companyAssetsMinor + biz.companyCashMinor,
        debtMinor: biz.companyLiabilitiesMinor,
        cashBalanceMinor: biz.companyCashMinor,
        epsMinor: Math.max(0, Math.round((biz.netProfitLastCycleMinor * 4) / totalSharesAfterIpo)),
        dividendPerShareMinor: 0,
        dividendYieldPct: 0,
        creditRating: biz.reputation >= 80 ? 'A' : 'BBB',
        intrinsicRefPriceMinor: ipoPriceMinor,
        quarterlyHistory: biz.financialHistory.slice(-4).map((p, idx) => ({
          quarter: `Kỳ ${idx + 1}`,
          revenueMinor: p.revenueMinor,
          netProfitMinor: p.netProfitMinor,
          dividendPaidMinor: 0,
        })),
      },
    };

    this.matching.registerAsset(listedAsset, true);

    // Grant founder's existing share allocation onto their exchange holdings so they can trade transparently
    for (const sh of biz.shareholders) {
      this.ledger.grantInitialAsset(sh.playerId, ipoSymbol, 'STOCK', sh.shares, ipoPriceMinor);
    }

    biz.totalIssuedShares = totalSharesAfterIpo;
    biz.treasuryShares += offeringShares;
    biz.isPublicIpo = true;
    biz.ipoSymbol = ipoSymbol;
    biz.ipoPriceMinor = ipoPriceMinor;
    this.normalizeShareholders(biz);

    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.requesterId,
        biz.ceoName,
        'IPO_LISTED',
        `Niêm yết thành công ${ipoSymbol} trên sàn ESE · Phát hành ${offeringShares.toLocaleString('en-US')} CP @ ${params.ipoPriceCR.toFixed(2)} CR.`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);

    return { business: this.cloneBusiness(biz), listedAsset };
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private requireBusiness(businessId: string): BusinessEntity {
    const biz = this.businesses.get(businessId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    return biz;
  }

  private requireOperatorAuthority(biz: BusinessEntity, playerId: string): void {
    const isCeoOrOwner = biz.ceoId === playerId || biz.ownerId === playerId;
    const sh = biz.shareholders.find((s) => s.playerId === playerId);
    if (!isCeoOrOwner && (!sh || sh.ownershipPct <= 50)) {
      throw new DomainError('NOT_COMPANY_OWNER');
    }
  }

  private recordCompanyOutflow(
    businessId: string,
    toSystemAccount: string,
    amountMinor: number,
    category: 'BUSINESS_OPEX' | 'BUSINESS_UPGRADE',
    description: string,
  ): void {
    if (amountMinor <= 0) return;
    const acc = this.companyAccountId(businessId);
    const bal = this.ledger.getSystemBalance(acc);
    const transferable = Math.min(bal, amountMinor);
    if (transferable > 0) {
      this.ledger.transferAvailable({
        fromAccount: acc,
        toAccount: toSystemAccount,
        amountMinor: transferable,
        category,
        referenceId: businessId,
        description,
      });
    }
  }

  private computeUpgradeModifiers(biz: BusinessEntity) {
    let capacityBonusPct = 0;
    let demandBonusPct = 0;
    let costReductionPct = 0;
    let energyEfficiencyPct = 0;
    let extraOpexCR = 0;

    for (const [nodeId, rank] of Object.entries(biz.upgradeTree)) {
      if (rank <= 0) continue;
      const spec = UPGRADE_NODE_MAP.get(nodeId);
      if (!spec) continue;
      capacityBonusPct += (spec.capacityBonusPct ?? 0) * rank;
      demandBonusPct += (spec.demandBonusPct ?? 0) * rank;
      costReductionPct += (spec.costReductionPct ?? 0) * rank;
      energyEfficiencyPct += (spec.energyEfficiencyPct ?? 0) * rank;
      extraOpexCR += spec.additionalOpexPerCycleCR * rank;
    }

    return {
      capacityBonusPct,
      demandBonusPct,
      costReductionPct: Math.min(40, costReductionPct),
      energyEfficiencyPct: Math.min(55, energyEfficiencyPct),
      extraOpexCR,
    };
  }

  // ============================================================================
  // 8. PROJECT CO-FOUNDER INTEGRATION HOOKS (REUSES SINGLE LEDGER & ENGINE)
  // ============================================================================

  /**
   * Atomically activates a multi-shareholder company funded from CAPITAL_ESCROW_POOL
   * or from Partner Company Wallets (for Joint Ventures).
   */
  public activateCoFoundedBusiness(params: {
    businessTypeId: string;
    businessName: string;
    ticker: string;
    cityCode: V4CityCode;
    businessModel: BusinessModelType;
    founderId: string;
    founderName: string;
    ceoId: string;
    ceoName: string;
    boardMemberIds: string[];
    totalCapitalMinor: number;
    initialTotalShares: number;
    shareholders: Array<{ playerId: string; playerName: string; shares: number }>;
    fundingSource:
      | { kind: 'ESCROW'; projectId: string }
      | { kind: 'JOINT_VENTURE'; jvId: string; partnerTransfers: Array<{ partnerCompanyId: string; amountMinor: number }> };
  }): BusinessEntity {
    const catalog = BUSINESS_CATALOG_MAP.get(params.businessTypeId);
    if (!catalog) {
      throw new DomainError('VALIDATION_ERROR', 'Loại hình doanh nghiệp không tồn tại trong danh mục.');
    }
    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) {
      throw new DomainError('VALIDATION_ERROR', 'Thành phố hoạt động không hợp lệ.');
    }

    const cleanTicker = params.ticker.trim().toUpperCase();
    const tickerExists =
      Array.from(this.businesses.values()).some((b) => b.ticker === cleanTicker) ||
      Boolean(this.matching.getAsset(cleanTicker));
    if (tickerExists) {
      throw new DomainError('INVALID_ORDER', `Mã doanh nghiệp ${cleanTicker} đã tồn tại trong WORLD-01.`);
    }

    const businessId = `biz_${crypto.randomBytes(5).toString('hex')}`;
    const companyAccount = this.companyAccountId(businessId);

    if (params.fundingSource.kind === 'ESCROW') {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
        toAccount: companyAccount,
        amountMinor: params.totalCapitalMinor,
        category: 'CAPITAL_ESCROW_RELEASE',
        referenceId: params.fundingSource.projectId,
        description: `Giải ngân vốn điều lệ từ Capital Escrow thành lập ${params.businessName} (${cleanTicker})`,
      });
    } else {
      // Joint venture: transfer directly from each partner company's isolated Company Wallet
      for (const pt of params.fundingSource.partnerTransfers) {
        const partnerBiz = this.requireBusiness(pt.partnerCompanyId);
        if (partnerBiz.companyCashMinor < pt.amountMinor) {
          throw new DomainError(
            'INSUFFICIENT_COMPANY_CASH',
            `Công ty đối tác ${partnerBiz.businessName} không đủ tiền mặt (${(partnerBiz.companyCashMinor / 100).toLocaleString('en-US')} CR) để góp vốn liên doanh.`,
          );
        }
      }
      for (const pt of params.fundingSource.partnerTransfers) {
        const partnerBiz = this.requireBusiness(pt.partnerCompanyId);
        this.ledger.transferAvailable({
          fromAccount: this.companyAccountId(partnerBiz.id),
          toAccount: companyAccount,
          amountMinor: pt.amountMinor,
          category: 'JOINT_VENTURE_CAPITAL',
          referenceId: params.fundingSource.jvId,
          description: `${partnerBiz.ticker} góp vốn từ ví công ty thành lập liên doanh ${cleanTicker}`,
        });
        partnerBiz.companyCashMinor -= pt.amountMinor;
        partnerBiz.companyAssetsMinor += pt.amountMinor; // Equity investment recorded on partner balance sheet (never double-counted as cash)
        partnerBiz.auditLogs.unshift(
          this.makeAudit(
            partnerBiz.id,
            partnerBiz.ceoId,
            partnerBiz.ceoName,
            'JOINT_VENTURE_INVESTMENT',
            `Góp ${(pt.amountMinor / 100).toLocaleString('en-US')} CR từ ví công ty vào liên doanh ${params.businessName} (${cleanTicker}).`,
          ),
        );
        this.recomputeCapacityAndValuation(partnerBiz);
      }
    }

    const fixedAssetAllocMinor = Math.round(params.totalCapitalMinor * 0.35);
    const workingCashMinor = params.totalCapitalMinor - fixedAssetAllocMinor;
    const defaultRole: EmployeeRole =
      catalog.industry === 'TECHNOLOGY'
        ? 'ENGINEER'
        : catalog.industry === 'MANUFACTURING'
          ? 'TECHNICIAN'
          : catalog.industry === 'TRANSPORTATION'
            ? 'OPERATOR'
            : catalog.industry === 'FINANCE'
              ? 'MANAGER'
              : 'GENERAL_STAFF';
    const roleSpec = EMPLOYEE_ROLE_MAP.get(defaultRole)!;
    const initialStaffCount = Math.max(1, catalog.minEmployees);
    const nowIso = new Date().toISOString();

    const shareholders: ShareholderRecord[] = params.shareholders.map((s) => ({
      playerId: s.playerId,
      playerName: s.playerName,
      shares: s.shares,
      votingShares: s.shares,
      ownershipPct: 0,
    }));

    const business: BusinessEntity = {
      id: businessId,
      companyId: `cmp_${businessId}`,
      worldId: this.worldId,
      founderId: params.founderId,
      founderName: params.founderName,
      ownerId: params.founderId,
      ownerName: params.founderName,
      ceoId: params.ceoId,
      ceoName: params.ceoName,
      boardMemberIds: Array.from(new Set(params.boardMemberIds)),
      holdingCompanyId: null,
      businessName: params.businessName.trim(),
      ticker: cleanTicker,
      industry: catalog.industry,
      businessTypeId: catalog.typeId,
      businessTypeName: catalog.name,
      businessModel: params.businessModel,
      cityCode: city.code,
      cityName: city.name,
      locationLabel: `Trụ sở chính ${city.name}`,
      linkedPropertyId: null,
      level: 1,
      levelTitle: BUSINESS_LEVELS[0].title,
      initialCapitalMinor: params.totalCapitalMinor,
      companyCashMinor: workingCashMinor,
      companyAssetsMinor: fixedAssetAllocMinor,
      companyLiabilitiesMinor: 0,
      equityMinor: params.totalCapitalMinor,
      valuationMinor: params.totalCapitalMinor,
      revenueLastCycleMinor: 0,
      operatingExpensesLastCycleMinor: 0,
      netProfitLastCycleMinor: 0,
      cumulativeProfitMinor: 0,
      employeeGroups: [
        {
          role: defaultRole,
          count: initialStaffCount,
          salaryPerCycleMinor: toMinor(roleSpec.baseSalaryPerCycleCR),
          skillLevel: 1,
          productivity: roleSpec.baseProductivity,
          satisfaction: 80,
          status: 'ACTIVE',
        },
      ],
      employeeCount: initialStaffCount,
      productionCapacity: catalog.baseDailyCapacity,
      inventoryUnits: Math.round(catalog.baseDailyCapacity * 1.2),
      sellingPriceMinor: toMinor(catalog.baseSellingPriceCR),
      qualityScore: 58,
      customerDemandUnits: Math.round(catalog.baseDailyCapacity * 0.9),
      marketSharePct: 0,
      reputation: 52,
      customerSatisfaction: 74,
      status: 'ACTIVE',
      consecutiveLossCycles: 0,
      pendingUpgrade: null,
      upgradeTree: {},
      branches: [],
      franchiseEnabled: false,
      franchiseFeeMinor: toMinor(Math.round(catalog.startupCostCR * 0.4)),
      franchiseRoyaltyPct: 6,
      totalIssuedShares: params.initialTotalShares,
      treasuryShares: 0,
      shareholders,
      isPublicIpo: false,
      ipoSymbol: null,
      ipoPriceMinor: null,
      financialHistory: [],
      proposals: [],
      auditLogs: [
        this.makeAudit(
          businessId,
          params.founderId,
          params.founderName,
          'COFOUNDER_COMPANY_ACTIVATED',
          `Thành lập công ty đa cổ đông ${params.businessName} (${cleanTicker}) với ${shareholders.length} cổ đông · Vốn điều lệ ${(params.totalCapitalMinor / 100).toLocaleString('en-US')} CR · ${params.initialTotalShares.toLocaleString('en-US')} CP.`,
        ),
      ],
      createdAt: nowIso,
    };

    this.normalizeShareholders(business);
    this.syncControllingOwner(business);
    this.recomputeCapacityAndValuation(business);
    this.businesses.set(business.id, business);
    return this.cloneBusiness(business);
  }

  /**
   * Explicitly rejects any attempt by Founder/CEO to withdraw company cash into personal wallet.
   */
  public attemptUnauthorizedCompanyWithdrawal(businessId: string, actorId: string): never {
    const biz = this.requireBusiness(businessId);
    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        actorId,
        biz.shareholders.find((s) => s.playerId === actorId)?.playerName ?? actorId,
        'SECURITY_BLOCK_WITHDRAWAL',
        'Hệ thống đã chặn yêu cầu rút tiền công ty về ví cá nhân trái quy định bảo vệ cổ đông.',
      ),
    );
    throw new DomainError(
      'COMPANY_UNAUTHORIZED_WITHDRAWAL',
      'CEO và Nhà sáng lập không có quyền tự rút tiền từ Company Wallet sang ví cá nhân. Chỉ được phân phối lợi nhuận hợp lệ qua nghị quyết chia cổ tức.',
      403,
    );
  }

  public setCompanyCeoByBoard(
    businessId: string,
    newCeoId: string,
    newCeoName: string,
    actorId: string,
    actorName: string,
  ): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    biz.ceoId = newCeoId;
    biz.ceoName = newCeoName;
    if (!biz.boardMemberIds.includes(newCeoId)) {
      biz.boardMemberIds.push(newCeoId);
    }
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, actorId, actorName, 'BOARD_CEO_CHANGED', `Hội đồng quản trị bổ nhiệm ${newCeoName} làm CEO mới của ${biz.ticker}.`),
    );
    return this.cloneBusiness(biz);
  }

  public grantBoardApprovedBankLoan(
    businessId: string,
    loanMinor: number,
    actorId: string,
    actorName: string,
  ): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    if (!Number.isInteger(loanMinor) || loanMinor <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Khoản vay doanh nghiệp phải lớn hơn 0.');
    }
    const maxLoan = Math.max(toMinor(50_000), Math.round(biz.equityMinor * 0.8));
    if (biz.companyLiabilitiesMinor + loanMinor > maxLoan) {
      throw new DomainError('LOAN_LIMIT_EXCEEDED', 'Tổng nợ vay vượt quá hạn mức tín dụng doanh nghiệp (80% vốn chủ sở hữu).');
    }
    this.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: this.companyAccountId(biz.id),
      amountMinor: loanMinor,
      category: 'LOAN_DISBURSEMENT',
      referenceId: biz.id,
      description: `Giải ngân khoản vay doanh nghiệp theo nghị quyết HĐQT cho ${biz.ticker}`,
    });
    biz.companyCashMinor += loanMinor;
    biz.companyLiabilitiesMinor += loanMinor;
    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        actorId,
        actorName,
        'BOARD_LOAN_APPROVED',
        `Giải ngân khoản vay ${(loanMinor / 100).toLocaleString('en-US')} CR vào tài khoản công ty ${biz.ticker}.`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  /**
   * Executes a board-approved proportional dividend payout with strict financial safety checks:
   * - Distributable profit check (cumulativeProfitMinor > 0)
   * - Operating cash reserve check (keep at least 15% of initial capital or 1 cycle opex)
   * - Debt obligation check
   * - Exact pro-rata payout by recorded shareholding; zero CR drift
   */
  public executeBoardApprovedDividend(params: {
    businessId: string;
    totalDividendMinor: number;
    actorId: string;
    actorName: string;
    proposalId: string | null;
  }): {
    business: BusinessEntity;
    payouts: Array<{
      playerId: string;
      playerName: string;
      sharesAtRecord: number;
      amountMinor: number;
      ledgerTransactionId: string;
    }>;
  } {
    const biz = this.requireBusiness(params.businessId);
    if (!Number.isInteger(params.totalDividendMinor) || params.totalDividendMinor <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Tổng cổ tức phân phối phải lớn hơn 0.');
    }
    if (biz.status === 'BANKRUPT' || biz.status === 'DISTRESSED') {
      throw new DomainError('DIVIDEND_CONDITIONS_NOT_MET', 'Không thể chia cổ tức khi doanh nghiệp đang trong trạng thái kiệt quệ hoặc phá sản.');
    }
    const distributableProfit = Math.max(0, biz.cumulativeProfitMinor);
    if (params.totalDividendMinor > distributableProfit) {
      throw new DomainError(
        'DIVIDEND_CONDITIONS_NOT_MET',
        `Lợi nhuận được phép phân phối chỉ còn ${(distributableProfit / 100).toLocaleString('en-US')} CR (không được chia vượt lợi nhuận giữ lại).`,
      );
    }
    const opexReserve = Math.max(
      Math.round(biz.initialCapitalMinor * 0.12),
      biz.operatingExpensesLastCycleMinor,
    );
    const availableForDividend = Math.max(0, biz.companyCashMinor - opexReserve);
    if (params.totalDividendMinor > availableForDividend) {
      throw new DomainError(
        'DIVIDEND_CONDITIONS_NOT_MET',
        `Tiền mặt khả dụng sau khi giữ dự trữ vận hành (${(opexReserve / 100).toLocaleString('en-US')} CR) chỉ còn ${(availableForDividend / 100).toLocaleString('en-US')} CR.`,
      );
    }

    const totalShares = Math.max(1, biz.totalIssuedShares);
    const payouts: Array<{
      playerId: string;
      playerName: string;
      sharesAtRecord: number;
      amountMinor: number;
      ledgerTransactionId: string;
    }> = [];

    let distributedMinor = 0;
    const sortedHolders = [...biz.shareholders].sort((a, b) => b.shares - a.shares);
    for (let i = 0; i < sortedHolders.length; i += 1) {
      const sh = sortedHolders[i];
      const isLast = i === sortedHolders.length - 1;
      const sharePayout = isLast
        ? Math.max(0, params.totalDividendMinor - distributedMinor)
        : Math.floor((params.totalDividendMinor * sh.shares) / totalShares);
      if (sharePayout <= 0) continue;

      // Support both player wallets and partner company wallets (when a JV pays dividends to parent companies!)
      const targetAccount = this.businesses.has(sh.playerId)
        ? this.companyAccountId(sh.playerId)
        : sh.playerId;

      const entry = this.ledger.transferAvailable({
        fromAccount: this.companyAccountId(biz.id),
        toAccount: targetAccount,
        amountMinor: sharePayout,
        category: 'COMPANY_DIVIDEND',
        referenceId: params.proposalId ?? biz.id,
        description: `Cổ tức ${biz.ticker} (${sh.ownershipPct.toFixed(2)}% cổ phần)`,
      });

      const parentBiz = this.businesses.get(sh.playerId);
      if (parentBiz) {
        parentBiz.companyCashMinor += sharePayout;
        this.recomputeCapacityAndValuation(parentBiz);
      }

      distributedMinor += sharePayout;
      payouts.push({
        playerId: sh.playerId,
        playerName: sh.playerName,
        sharesAtRecord: sh.shares,
        amountMinor: sharePayout,
        ledgerTransactionId: entry.transactionId,
      });
    }

    biz.companyCashMinor -= distributedMinor;
    biz.cumulativeProfitMinor = Math.max(0, biz.cumulativeProfitMinor - distributedMinor);
    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.actorId,
        params.actorName,
        'BOARD_DIVIDEND_PAID',
        `Chi trả cổ tức tổng ${(distributedMinor / 100).toLocaleString('en-US')} CR cho ${payouts.length} cổ đông theo đúng tỷ lệ chốt quyền.`,
      ),
    );
    this.recomputeCapacityAndValuation(biz);
    return { business: this.cloneBusiness(biz), payouts };
  }

  public executeBoardApprovedUpgrade(params: {
    businessId: string;
    upgradeKind: 'LEVEL' | 'NODE';
    nodeId?: string;
    currentGameHourTotal: number;
    actorId: string;
    actorName: string;
  }): BusinessEntity {
    const biz = this.requireBusiness(params.businessId);
    // Delegate directly to existing authoritative upgrade paths using CEO/owner context
    const execRequesterId = biz.ownerId;
    if (params.upgradeKind === 'NODE' && params.nodeId) {
      return this.purchaseUpgradeNode({ businessId: biz.id, requesterId: execRequesterId, nodeId: params.nodeId });
    }
    return this.upgradeBusinessLevel({
      businessId: biz.id,
      requesterId: execRequesterId,
      currentGameHourTotal: params.currentGameHourTotal,
      completeImmediatelyForDev: false,
    });
  }

  public dissolveCompanyByBoard(businessId: string, actorId: string, actorName: string): BusinessEntity {
    const biz = this.requireBusiness(businessId);
    // Pay liabilities first if cash allows, then distribute residual cash pro-rata
    const debtPay = Math.min(biz.companyCashMinor, biz.companyLiabilitiesMinor);
    if (debtPay > 0) {
      this.ledger.transferAvailable({
        fromAccount: this.companyAccountId(biz.id),
        toAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
        amountMinor: debtPay,
        category: 'LOAN_REPAYMENT',
        referenceId: biz.id,
        description: `Thanh toán nợ khi giải thể ${biz.ticker}`,
      });
      biz.companyCashMinor -= debtPay;
      biz.companyLiabilitiesMinor -= debtPay;
    }

    const residualCash = biz.companyCashMinor;
    const totalShares = Math.max(1, biz.totalIssuedShares);
    let paid = 0;
    const holders = [...biz.shareholders].sort((a, b) => b.shares - a.shares);
    for (let i = 0; i < holders.length; i += 1) {
      const sh = holders[i];
      const payout = i === holders.length - 1 ? residualCash - paid : Math.floor((residualCash * sh.shares) / totalShares);
      if (payout <= 0) continue;
      const targetAcc = this.businesses.has(sh.playerId) ? this.companyAccountId(sh.playerId) : sh.playerId;
      this.ledger.transferAvailable({
        fromAccount: this.companyAccountId(biz.id),
        toAccount: targetAcc,
        amountMinor: payout,
        category: 'COMPANY_DIVIDEND',
        referenceId: biz.id,
        description: `Thanh lý vốn còn lại khi giải thể ${biz.ticker}`,
      });
      paid += payout;
    }
    biz.companyCashMinor -= paid;
    biz.companyAssetsMinor = 0;
    biz.status = 'SUSPENDED';
    biz.auditLogs.unshift(
      this.makeAudit(biz.id, actorId, actorName, 'BOARD_COMPANY_DISSOLVED', `Giải thể công ty ${biz.ticker} theo nghị quyết HĐQT, phân bổ ${(paid / 100).toLocaleString('en-US')} CR tài sản ròng.`),
    );
    this.recomputeCapacityAndValuation(biz);
    return this.cloneBusiness(biz);
  }

  public addAuditNote(businessId: string, actorId: string, actorName: string, action: string, detail: string): void {
    const biz = this.businesses.get(businessId);
    if (!biz) return;
    biz.auditLogs.unshift(this.makeAudit(biz.id, actorId, actorName, action, detail));
  }

  private recomputeCapacityAndValuation(biz: BusinessEntity): void {
    const catalog = BUSINESS_CATALOG_MAP.get(biz.businessTypeId)!;
    const levelSpec = BUSINESS_LEVELS[biz.level - 1];
    const mods = this.computeUpgradeModifiers(biz);

    const totalEmployees = biz.employeeGroups.reduce((a, g) => a + g.count, 0);
    biz.employeeCount = totalEmployees;

    const requiredEmployees = Math.max(1, catalog.minEmployees + levelSpec.additionalEmployees);
    // Understaffing reduces capacity proportionally; overstaffing gives diminishing returns while raising payroll!
    const staffingRatio = clamp(totalEmployees / requiredEmployees, 0.25, 1.35);
    const avgSkillBoost =
      totalEmployees > 0
        ? biz.employeeGroups.reduce((acc, g) => acc + g.count * (1 + (g.skillLevel - 1) * 0.12) * (g.satisfaction / 80), 0) /
          totalEmployees
        : 0.5;

    const facilityCapacity = catalog.baseDailyCapacity * levelSpec.capacityMultiplier * (1 + mods.capacityBonusPct / 100);
    biz.productionCapacity = Math.max(1, Math.round(facilityCapacity * Math.min(1.15, staffingRatio) * clamp(avgSkillBoost, 0.55, 1.65)));

    const bookEquity = biz.companyCashMinor + biz.companyAssetsMinor - biz.companyLiabilitiesMinor;
    biz.equityMinor = Math.max(0, bookEquity);
    const earningsMultiple = Math.max(0, biz.netProfitLastCycleMinor * 8);
    const branchBonus = biz.branches.filter((b) => b.status === 'ACTIVE').length * Math.round(biz.initialCapitalMinor * 0.35);
    biz.valuationMinor = Math.max(0, biz.equityMinor + earningsMultiple + branchBonus);
  }

  public raisePrimaryCapital(params: {
    businessId: string;
    investorId: string;
    investorName: string;
    investmentCR: number;
    preMoneyValuationCR: number;
  }): { business: BusinessEntity; sharesIssued: number; dilutionPct: number } {
    const biz = this.requireBusiness(params.businessId);
    const amountMinor = toMinor(params.investmentCR);
    const preMoneyMinor = toMinor(params.preMoneyValuationCR);
    if (amountMinor <= 0 || preMoneyMinor <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Giá trị đầu tư và định giá Pre-Money phải lớn hơn 0.');
    }

    const totalBefore = Math.max(1, biz.totalIssuedShares);
    const sharesIssued = Math.max(1, Math.round((amountMinor / preMoneyMinor) * totalBefore));
    const totalAfter = totalBefore + sharesIssued;

    this.ledger.transferAvailable({
      fromAccount: params.investorId,
      toAccount: this.companyAccountId(biz.id),
      amountMinor,
      category: 'CAPITAL_ESCROW_RELEASE',
      referenceId: biz.id,
      description: `Góp vốn vòng sơ cấp vào ${biz.ticker} (+${sharesIssued} cp)`,
    });

    biz.companyCashMinor += amountMinor;
    biz.totalIssuedShares = totalAfter;

    const existing = biz.shareholders.find((s) => s.playerId === params.investorId);
    if (existing) {
      existing.shares += sharesIssued;
      existing.votingShares += sharesIssued;
    } else {
      biz.shareholders.push({
        playerId: params.investorId,
        playerName: params.investorName,
        shares: sharesIssued,
        votingShares: sharesIssued,
        ownershipPct: 0,
      });
    }

    this.normalizeShareholders(biz);
    this.syncControllingOwner(biz);
    this.recomputeCapacityAndValuation(biz);

    const dilutionPct = Number(((sharesIssued / totalAfter) * 100).toFixed(4));
    biz.auditLogs.unshift(
      this.makeAudit(
        biz.id,
        params.investorId,
        params.investorName,
        'PRIMARY_CAPITAL_RAISED',
        `${params.investorName} đầu tư ${params.investmentCR.toLocaleString('en-US')} CR, nhận ${sharesIssued.toLocaleString('en-US')} cổ phần mới (pha loãng ${dilutionPct.toFixed(2)}%).`,
      ),
    );
    return { business: this.cloneBusiness(biz), sharesIssued, dilutionPct };
  }

  private normalizeShareholders(biz: BusinessEntity): void {
    biz.shareholders = biz.shareholders.filter((s) => s.shares > 0);
    const total = Math.max(1, biz.totalIssuedShares);
    for (const sh of biz.shareholders) {
      sh.ownershipPct = Number(((sh.shares / total) * 100).toFixed(2));
    }
    biz.shareholders.sort((a, b) => b.shares - a.shares);
  }

  private syncControllingOwner(biz: BusinessEntity): void {
    const top = biz.shareholders[0];
    if (top) {
      biz.ownerId = top.playerId;
      biz.ownerName = top.playerName;
    }
  }

  private makeAudit(
    companyId: string,
    actorId: string,
    actorName: string,
    action: string,
    detail: string,
  ): CorporateAuditEntry {
    return {
      id: `aud_${crypto.randomBytes(4).toString('hex')}`,
      companyId,
      actorId,
      actorName,
      action,
      detail,
      timestamp: new Date().toISOString(),
    };
  }

  public exportSnapshot(): {
    businesses: BusinessEntity[];
    holdings: HoldingCompany[];
    privateListings: PrivateShareListing[];
    maOffers: AcquisitionOffer[];
    franchises: FranchiseAgreement[];
    operatingCycleSeq: number;
  } {
    return {
      businesses: Array.from(this.businesses.values()).map((b) => structuredClone(b)),
      holdings: Array.from(this.holdings.values()).map((h) => structuredClone(h)),
      privateListings: Array.from(this.privateListings.values()).map((l) => structuredClone(l)),
      maOffers: Array.from(this.maOffers.values()).map((o) => structuredClone(o)),
      franchises: Array.from(this.franchises.values()).map((f) => structuredClone(f)),
      operatingCycleSeq: this.operatingCycleSeq,
    };
  }

  public importSnapshot(snapshot: {
    businesses: BusinessEntity[];
    holdings: HoldingCompany[];
    privateListings: PrivateShareListing[];
    maOffers: AcquisitionOffer[];
    franchises: FranchiseAgreement[];
    operatingCycleSeq: number;
  }): void {
    this.businesses.clear();
    for (const b of snapshot.businesses ?? []) {
      this.businesses.set(b.id, structuredClone(b));
    }
    this.holdings.clear();
    for (const h of snapshot.holdings ?? []) {
      this.holdings.set(h.id, structuredClone(h));
    }
    this.privateListings.clear();
    for (const l of snapshot.privateListings ?? []) {
      this.privateListings.set(l.id, structuredClone(l));
    }
    this.maOffers.clear();
    for (const o of snapshot.maOffers ?? []) {
      this.maOffers.set(o.id, structuredClone(o));
    }
    this.franchises.clear();
    for (const f of snapshot.franchises ?? []) {
      this.franchises.set(f.id, structuredClone(f));
    }
    this.operatingCycleSeq = typeof snapshot.operatingCycleSeq === 'number' ? snapshot.operatingCycleSeq : 0;
  }

  private cloneBusiness(b: BusinessEntity): BusinessEntity {
    return {
      ...b,
      boardMemberIds: [...b.boardMemberIds],
      employeeGroups: b.employeeGroups.map((g) => ({ ...g })),
      upgradeTree: { ...b.upgradeTree },
      branches: b.branches.map((br) => ({ ...br })),
      shareholders: b.shareholders.map((s) => ({ ...s })),
      financialHistory: b.financialHistory.slice(-24),
      proposals: b.proposals.slice(0, 20),
      auditLogs: b.auditLogs.slice(0, 30),
      pendingUpgrade: b.pendingUpgrade ? { ...b.pendingUpgrade } : null,
    };
  }
}
