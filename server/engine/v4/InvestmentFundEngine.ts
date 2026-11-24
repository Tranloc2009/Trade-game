import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import {
  V4_BALANCE_CONFIG,
  type FundAuditLog,
  type FundGovernanceProposal,
  type FundHolding,
  type FundRedemptionRequest,
  type FundType,
  type InvestmentFund,
  type V4MacroIndicators,
} from '../../../shared/contracts/v4';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';

const INITIAL_UNIT_PRICE_MINOR = toMinor(10); // 10.00 CR per fund unit

export const FUND_TYPE_SPECS: Record<
  FundType,
  {
    label: string;
    defaultObjective: string;
    allowedClasses: Array<'STOCK' | 'CRYPTO' | 'FOREX' | 'PROPERTY_INDEX' | 'CASH_EQUIV'>;
    defaultSymbols: string[];
    defaultMaxPositionPct: number;
    defaultMinCashPct: number;
  }
> = {
  STOCK_FUND: {
    label: 'Quỹ Cổ Phiếu (Stock Fund)',
    defaultObjective: 'Tăng trưởng vốn dài hạn thông qua danh mục cổ phiếu chọn lọc trên sàn ESE.',
    allowedClasses: ['STOCK'],
    defaultSymbols: ['NOVA', 'TITAN', 'AERO', 'SOLR', 'MEDI', 'FINX', 'AUTO', 'RETL'],
    defaultMaxPositionPct: 35,
    defaultMinCashPct: 10,
  },
  CRYPTO_SPOT_FUND: {
    label: 'Quỹ Crypto Giao Ngay (Spot Only)',
    defaultObjective: 'Đầu tư tài sản số giao ngay không đòn bẩy trên sàn ECX với giới hạn tỷ trọng chặt chẽ.',
    allowedClasses: ['CRYPTO'],
    defaultSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'AVAX-SIM', 'LINK-SIM'],
    defaultMaxPositionPct: 40,
    defaultMinCashPct: 15,
  },
  FOREX_FUND: {
    label: 'Quỹ Ngoại Hối (Forex Macro Fund)',
    defaultObjective: 'Phân bổ vĩ mô trên các cặp tiền tệ chính tại Empire Forex Exchange.',
    allowedClasses: ['FOREX'],
    defaultSymbols: ['EUR-SIM/USD-SIM', 'GBP-SIM/USD-SIM', 'USD-SIM/JPY-SIM', 'USD-SIM/CR', 'EUR-SIM/CR'],
    defaultMaxPositionPct: 40,
    defaultMinCashPct: 15,
  },
  REAL_ESTATE_FUND: {
    label: 'Quỹ Địa Ốc (Real Estate Index Fund)',
    defaultObjective: 'Đầu tư chỉ số bất động sản Việt Nam (TP.HCM, Hà Nội, Đà Nẵng) và cổ phiếu địa ốc.',
    allowedClasses: ['PROPERTY_INDEX', 'STOCK'],
    defaultSymbols: ['VN-RE-HCMC', 'VN-RE-HN', 'VN-RE-DN', 'TITAN', 'FINX'],
    defaultMaxPositionPct: 45,
    defaultMinCashPct: 12,
  },
  DIVIDEND_FUND: {
    label: 'Quỹ Cổ Tức (Dividend Income Fund)',
    defaultObjective: 'Tập trung cổ phiếu doanh nghiệp nền tảng vững chắc, ưu tiên dòng tiền ổn định.',
    allowedClasses: ['STOCK', 'CASH_EQUIV'],
    defaultSymbols: ['FINX', 'RETL', 'MEDI', 'TITAN', 'TBILL-30D'],
    defaultMaxPositionPct: 30,
    defaultMinCashPct: 15,
  },
  BALANCED_FUND: {
    label: 'Quỹ Cân Bằng (Balanced Fund)',
    defaultObjective: 'Cân bằng giữa tăng trưởng cổ phiếu, ngoại hối và tín phiếu phòng thủ.',
    allowedClasses: ['STOCK', 'FOREX', 'CASH_EQUIV'],
    defaultSymbols: ['NOVA', 'TITAN', 'FINX', 'MEDI', 'EUR-SIM/CR', 'TBILL-30D'],
    defaultMaxPositionPct: 30,
    defaultMinCashPct: 15,
  },
  MONEY_MARKET_FUND: {
    label: 'Quỹ Thị Trường Tiền Tệ (Money Market)',
    defaultObjective: 'Bảo toàn vốn và duy trì thanh khoản cao bằng tín phiếu ngắn hạn và tiền mặt.',
    allowedClasses: ['CASH_EQUIV'],
    defaultSymbols: ['TBILL-30D', 'CD-EMPIRE'],
    defaultMaxPositionPct: 60,
    defaultMinCashPct: 25,
  },
  MULTI_ASSET_FUND: {
    label: 'Quỹ Đa Tài Sản (Multi-Asset Fund)',
    defaultObjective: 'Phân bổ linh hoạt giữa cổ phiếu, crypto giao ngay, địa ốc và tín phiếu theo chu kỳ kinh tế.',
    allowedClasses: ['STOCK', 'CRYPTO', 'FOREX', 'PROPERTY_INDEX', 'CASH_EQUIV'],
    defaultSymbols: ['NOVA', 'TITAN', 'FINX', 'BTC-SIM', 'ETH-SIM', 'EUR-SIM/CR', 'VN-RE-HCMC', 'TBILL-30D'],
    defaultMaxPositionPct: 30,
    defaultMinCashPct: 12,
  },
};

function round4(val: number): number {
  return Number(val.toFixed(4));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

/**
 * Authoritative Multiplayer Investment Fund Engine.
 * - Strict asset isolation: each fund holds an independent Ledger account `FUND_V4_<id>`.
 * - Zero leverage in Phase 1 (`leverageAllowed: false`).
 * - Exact NAV & Unit accounting (`NAV = cash + fairValue(holdings) - liabilities`, `NAV/unit = NAV / outstandingUnits`).
 * - Liquidity-capped redemptions: if fund cash is insufficient, redemption is queued instead of printing CR.
 * - Manager cannot withdraw fund cash to personal wallet or violate risk limits.
 * - Member unit-weighted governance voting & full audit trail.
 */
export class InvestmentFundEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private readonly matching: MatchingEngine;

  private funds = new Map<string, InvestmentFund>();
  private syntheticPricesMinor = new Map<string, number>();
  private idempotencyResults = new Map<string, unknown>();

  constructor(worldId: string, ledger: LedgerService, matching: MatchingEngine) {
    this.worldId = worldId;
    this.ledger = ledger;
    this.matching = matching;
    this.resetSyntheticIndices();
  }

  public reset(): void {
    this.funds.clear();
    this.idempotencyResults.clear();
    this.resetSyntheticIndices();
  }

  private resetSyntheticIndices(): void {
    this.syntheticPricesMinor.set('VN-RE-HCMC', toMinor(120));
    this.syntheticPricesMinor.set('VN-RE-HN', toMinor(112));
    this.syntheticPricesMinor.set('VN-RE-DN', toMinor(94));
    this.syntheticPricesMinor.set('TBILL-30D', toMinor(100));
    this.syntheticPricesMinor.set('CD-EMPIRE', toMinor(100));
  }

  public fundAccountId(fundId: string): string {
    return `FUND_V4_${fundId}`;
  }

  public listFunds(): InvestmentFund[] {
    return Array.from(this.funds.values()).map((f) => this.cloneFund(f));
  }

  public getFund(fundId: string): InvestmentFund | undefined {
    const f = this.funds.get(fundId);
    return f ? this.cloneFund(f) : undefined;
  }

  public getPlayerFundValueMinor(playerId: string): number {
    let total = 0;
    for (const f of this.funds.values()) {
      if (f.status === 'DISSOLVED') continue;
      const member = f.members.find((m) => m.playerId === playerId);
      if (member && member.units > 0) {
        total += Math.round(member.units * f.navPerUnitMinor);
      }
    }
    return total;
  }

  public createFund(params: {
    founderId: string;
    founderName: string;
    name: string;
    code: string;
    fundType: FundType;
    description?: string;
    investmentObjective?: string;
    managementFeeAnnualPct?: number;
    redemptionFeePct?: number;
    maxSinglePositionPct?: number;
    minCashReservePct?: number;
    initialCapitalCR: number;
    isPublic?: boolean;
    logoColor?: string;
    idempotencyKey?: string;
  }): InvestmentFund {
    if (params.idempotencyKey) {
      const idemKey = `create_fund:${params.founderId}:${params.idempotencyKey}`;
      const existing = this.idempotencyResults.get(idemKey) as InvestmentFund | undefined;
      if (existing) return this.cloneFund(existing);
    }

    const spec = FUND_TYPE_SPECS[params.fundType];
    if (!spec) throw new DomainError('VALIDATION_ERROR', 'Loại quỹ đầu tư không hợp lệ.');

    const cleanName = params.name.trim().slice(0, 64);
    const cleanCode = params.code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10);
    if (cleanName.length < 3 || cleanCode.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Tên quỹ (≥ 3 ký tự) và mã quỹ (≥ 2 ký tự) phải hợp lệ.');
    }

    for (const existing of this.funds.values()) {
      if (existing.code === cleanCode) {
        throw new DomainError('VALIDATION_ERROR', `Mã quỹ ${cleanCode} đã tồn tại trên hệ thống.`);
      }
    }

    if (params.initialCapitalCR < V4_BALANCE_CONFIG.minFundInitialCapitalCR) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Vốn khởi tạo quỹ tối thiểu là ${V4_BALANCE_CONFIG.minFundInitialCapitalCR.toLocaleString('en-US')} CR.`,
      );
    }

    const mgmtFee = round2(params.managementFeeAnnualPct ?? 1.5);
    if (mgmtFee < 0 || mgmtFee > V4_BALANCE_CONFIG.maxFundManagementFeePct) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Phí quản lý năm không được vượt quá ${V4_BALANCE_CONFIG.maxFundManagementFeePct}%.`,
      );
    }

    const redeemFee = round2(params.redemptionFeePct ?? V4_BALANCE_CONFIG.defaultFundRedemptionFeePct);
    if (redeemFee < 0 || redeemFee > 3.0) {
      throw new DomainError('VALIDATION_ERROR', 'Phí rút vốn phải nằm trong khoảng 0% – 3%.');
    }

    const maxPosPct = Math.max(15, Math.min(70, Math.round(params.maxSinglePositionPct ?? spec.defaultMaxPositionPct)));
    const minCashPct = Math.max(5, Math.min(50, Math.round(params.minCashReservePct ?? spec.defaultMinCashPct)));

    const initialMinor = toMinor(params.initialCapitalCR);
    const wallet = this.ledger.requireWallet(params.founderId);
    if (wallet.availableMinor < initialMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Số dư khả dụng không đủ để góp vốn khởi tạo quỹ đầu tư.');
    }

    const fundId = `fund_${crypto.randomBytes(5).toString('hex')}`;
    const acctId = this.fundAccountId(fundId);

    this.ledger.transferAvailable({
      fromAccount: params.founderId,
      toAccount: acctId,
      amountMinor: initialMinor,
      category: 'FUND_SUBSCRIPTION',
      referenceId: fundId,
      description: `Khởi tạo quỹ ${cleanName} (${cleanCode}) với vốn ban đầu ${params.initialCapitalCR.toLocaleString('en-US')} CR`,
    });

    const unitsIssued = round4(initialMinor / INITIAL_UNIT_PRICE_MINOR);
    const nowIso = new Date().toISOString();

    const fund: InvestmentFund = {
      id: fundId,
      worldId: this.worldId,
      name: cleanName,
      code: cleanCode,
      logoColor: params.logoColor || '#38bdf8',
      description: params.description?.trim().slice(0, 240) || spec.defaultObjective,
      fundType: params.fundType,
      investmentObjective: params.investmentObjective?.trim().slice(0, 240) || spec.defaultObjective,
      allowedAssets: [...spec.defaultSymbols],
      maxSinglePositionPct: maxPosPct,
      minCashReservePct: minCashPct,
      founderId: params.founderId,
      managerId: params.founderId,
      managerName: params.founderName,
      managementFeeAnnualPct: mgmtFee,
      redemptionFeePct: redeemFee,
      redemptionNoticeLabel: 'Thanh khoản theo tiền mặt sẵn có (T+0 / Hàng chờ)',
      isPublic: params.isPublic ?? true,
      leverageAllowed: false,
      cashMinor: initialMinor,
      holdings: [],
      totalAssetsMinor: initialMinor,
      totalLiabilitiesMinor: 0,
      navMinor: initialMinor,
      outstandingUnits: unitsIssued,
      navPerUnitMinor: INITIAL_UNIT_PRICE_MINOR,
      initialNavPerUnitMinor: INITIAL_UNIT_PRICE_MINOR,
      returnPct: 0,
      maxDrawdownPct: 0,
      annualizedVolatilityPct: 0,
      sharpeRatio: 0,
      members: [
        {
          playerId: params.founderId,
          playerName: params.founderName,
          units: unitsIssued,
          costBasisMinor: initialMinor,
          ownershipPct: 100,
          joinedAt: nowIso,
        },
      ],
      redemptionQueue: [],
      navHistory: [
        {
          timestamp: nowIso,
          navMinor: initialMinor,
          navPerUnitMinor: INITIAL_UNIT_PRICE_MINOR,
          aumMinor: initialMinor,
          netFlowMinor: initialMinor,
        },
      ],
      proposals: [],
      auditLogs: [
        {
          id: `faud_${crypto.randomBytes(4).toString('hex')}`,
          fundId,
          actorId: params.founderId,
          actorName: params.founderName,
          action: 'FUND_CREATED',
          detail: `Thành lập ${cleanName} (${cleanCode}) — Loại ${spec.label}, vốn khởi tạo ${params.initialCapitalCR.toLocaleString('en-US')} CR, NAV/CCQ 10.00 CR.`,
          timestamp: nowIso,
        },
      ],
      status: 'ACTIVE',
      createdAt: nowIso,
    };

    this.funds.set(fundId, fund);

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`create_fund:${params.founderId}:${params.idempotencyKey}`, this.cloneFund(fund));
    }

    return this.cloneFund(fund);
  }

  public subscribeFund(params: {
    fundId: string;
    playerId: string;
    playerName: string;
    amountCR: number;
    idempotencyKey?: string;
  }): { fund: InvestmentFund; unitsIssued: number; navPerUnitMinor: number } {
    if (params.idempotencyKey) {
      const idemKey = `sub_fund:${params.playerId}:${params.idempotencyKey}`;
      const existing = this.idempotencyResults.get(idemKey) as
        | { fund: InvestmentFund; unitsIssued: number; navPerUnitMinor: number }
        | undefined;
      if (existing) return existing;
    }

    const fund = this.funds.get(params.fundId);
    if (!fund) throw new DomainError('FUND_NOT_FOUND', undefined, 404);
    if (fund.status !== 'ACTIVE') throw new DomainError('VALIDATION_ERROR', 'Quỹ hiện không tiếp nhận vốn mới.');
    if (!fund.isPublic && params.playerId !== fund.founderId && !fund.members.some((m) => m.playerId === params.playerId)) {
      throw new DomainError('FORBIDDEN', 'Quỹ riêng tư chỉ nhận vốn từ thành viên được phê duyệt.');
    }

    if (params.amountCR < 1_000) {
      throw new DomainError('VALIDATION_ERROR', 'Số tiền góp vốn tối thiểu là 1,000 CR.');
    }

    this.recomputeFundNav(fund);

    const amountMinor = toMinor(params.amountCR);
    const wallet = this.ledger.requireWallet(params.playerId);
    if (wallet.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Số dư ví khả dụng không đủ để mua chứng chỉ quỹ.');
    }

    const navPerUnit = Math.max(100, fund.navPerUnitMinor);
    const unitsIssued = round4(amountMinor / navPerUnit);

    this.ledger.transferAvailable({
      fromAccount: params.playerId,
      toAccount: this.fundAccountId(fund.id),
      amountMinor,
      category: 'FUND_SUBSCRIPTION',
      referenceId: fund.id,
      description: `Góp vốn ${params.amountCR.toLocaleString('en-US')} CR vào quỹ ${fund.code} (+${unitsIssued.toFixed(4)} CCQ)`,
    });

    fund.cashMinor = this.ledger.getSystemBalance(this.fundAccountId(fund.id));
    fund.outstandingUnits = round4(fund.outstandingUnits + unitsIssued);

    const existingMember = fund.members.find((m) => m.playerId === params.playerId);
    const nowIso = new Date().toISOString();
    if (existingMember) {
      existingMember.units = round4(existingMember.units + unitsIssued);
      existingMember.costBasisMinor += amountMinor;
    } else {
      fund.members.push({
        playerId: params.playerId,
        playerName: params.playerName,
        units: unitsIssued,
        costBasisMinor: amountMinor,
        ownershipPct: 0,
        joinedAt: nowIso,
      });
    }

    this.recomputeFundNav(fund);
    this.appendNavPoint(fund, amountMinor);
    this.appendAudit(
      fund,
      params.playerId,
      params.playerName,
      'FUND_SUBSCRIPTION',
      `Góp ${params.amountCR.toLocaleString('en-US')} CR nhận ${unitsIssued.toFixed(4)} CCQ tại NAV ${(navPerUnit / 100).toFixed(2)} CR.`,
    );

    // Newly added cash may satisfy queued redemptions
    this.processRedemptionQueue(fund.id);

    const out = {
      fund: this.cloneFund(fund),
      unitsIssued,
      navPerUnitMinor: navPerUnit,
    };

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`sub_fund:${params.playerId}:${params.idempotencyKey}`, out);
    }
    return out;
  }

  public requestRedemption(params: {
    fundId: string;
    playerId: string;
    playerName: string;
    units: number;
    idempotencyKey?: string;
  }): { fund: InvestmentFund; request: FundRedemptionRequest; settledImmediately: boolean } {
    if (params.idempotencyKey) {
      const idemKey = `redeem_fund:${params.playerId}:${params.idempotencyKey}`;
      const existing = this.idempotencyResults.get(idemKey) as
        | { fund: InvestmentFund; request: FundRedemptionRequest; settledImmediately: boolean }
        | undefined;
      if (existing) return existing;
    }

    const fund = this.funds.get(params.fundId);
    if (!fund) throw new DomainError('FUND_NOT_FOUND', undefined, 404);

    const member = fund.members.find((m) => m.playerId === params.playerId);
    const unitsReq = round4(params.units);
    if (!member || unitsReq <= 0 || unitsReq > member.units + 0.0001) {
      throw new DomainError('VALIDATION_ERROR', 'Số chứng chỉ quỹ yêu cầu rút vượt quá số dư nắm giữ.');
    }

    // Account for already queued units by this member
    const alreadyQueuedUnits = fund.redemptionQueue
      .filter((r) => r.playerId === params.playerId && r.status === 'QUEUED')
      .reduce((sum, r) => sum + r.unitsRequested, 0);
    if (unitsReq + alreadyQueuedUnits > member.units + 0.0001) {
      throw new DomainError('VALIDATION_ERROR', 'Số CCQ yêu cầu rút cộng với hàng chờ vượt quá số dư hiện có.');
    }

    this.recomputeFundNav(fund);
    const actualUnits = Math.min(unitsReq, member.units);
    const grossPayoutMinor = Math.round(actualUnits * fund.navPerUnitMinor);
    const feeMinor = Math.round((grossPayoutMinor * fund.redemptionFeePct) / 100);
    const netPayoutMinor = Math.max(0, grossPayoutMinor - feeMinor);
    const nowIso = new Date().toISOString();

    const req: FundRedemptionRequest = {
      id: `red_${crypto.randomBytes(4).toString('hex')}`,
      fundId: fund.id,
      playerId: params.playerId,
      playerName: params.playerName,
      unitsRequested: actualUnits,
      estimatedPayoutMinor: netPayoutMinor,
      feeMinor,
      status: 'QUEUED',
      requestedAt: nowIso,
    };

    const availableFundCash = this.ledger.getSystemBalance(this.fundAccountId(fund.id));
    const settledImmediately = availableFundCash >= grossPayoutMinor && grossPayoutMinor > 0;

    if (settledImmediately) {
      this.settleRedemptionRequestInternal(fund, member, req, grossPayoutMinor, feeMinor, netPayoutMinor);
    } else {
      req.note = 'Tiền mặt quỹ hiện không đủ; lệnh rút được đưa vào hàng chờ thanh khoản (không tự in tiền).';
      fund.redemptionQueue.push(req);
      this.appendAudit(
        fund,
        params.playerId,
        params.playerName,
        'REDEMPTION_QUEUED',
        `Xếp hàng chờ rút ${actualUnits.toFixed(4)} CCQ (ước tính ${(netPayoutMinor / 100).toLocaleString('en-US')} CR) do tiền mặt khả dụng quỹ chưa đủ.`,
      );
    }

    const out = {
      fund: this.cloneFund(fund),
      request: { ...req },
      settledImmediately,
    };

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`redeem_fund:${params.playerId}:${params.idempotencyKey}`, out);
    }
    return out;
  }

  public processRedemptionQueue(fundId: string): FundRedemptionRequest[] {
    const fund = this.funds.get(fundId);
    if (!fund) return [];
    this.recomputeFundNav(fund);

    const settled: FundRedemptionRequest[] = [];
    for (const req of fund.redemptionQueue) {
      if (req.status !== 'QUEUED') continue;
      const member = fund.members.find((m) => m.playerId === req.playerId);
      if (!member || member.units < req.unitsRequested - 0.0001) {
        req.status = 'CANCELLED';
        req.note = 'Hủy do thành viên không còn đủ chứng chỉ quỹ.';
        continue;
      }

      const unitsToRedeem = Math.min(req.unitsRequested, member.units);
      const grossMinor = Math.round(unitsToRedeem * fund.navPerUnitMinor);
      const feeMinor = Math.round((grossMinor * fund.redemptionFeePct) / 100);
      const netMinor = Math.max(0, grossMinor - feeMinor);
      const cashNow = this.ledger.getSystemBalance(this.fundAccountId(fund.id));

      if (cashNow >= grossMinor && grossMinor > 0) {
        this.settleRedemptionRequestInternal(fund, member, req, grossMinor, feeMinor, netMinor);
        settled.push({ ...req });
      } else {
        // FIFO queue: stop when cash runs short
        break;
      }
    }
    return settled;
  }

  private settleRedemptionRequestInternal(
    fund: InvestmentFund,
    member: InvestmentFund['members'][number],
    req: FundRedemptionRequest,
    grossMinor: number,
    feeMinor: number,
    netMinor: number,
  ): void {
    const acctId = this.fundAccountId(fund.id);
    if (netMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: acctId,
        toAccount: member.playerId,
        amountMinor: netMinor,
        category: 'FUND_REDEMPTION',
        referenceId: req.id,
        description: `Tất toán rút ${req.unitsRequested.toFixed(4)} CCQ quỹ ${fund.code}`,
      });
    }
    if (feeMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: acctId,
        toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
        amountMinor: feeMinor,
        category: 'FUND_FEE',
        referenceId: req.id,
        description: `Phí rút chứng chỉ quỹ ${fund.code}`,
      });
    }

    const ratio = member.units > 0 ? Math.min(1, req.unitsRequested / member.units) : 1;
    member.units = round4(Math.max(0, member.units - req.unitsRequested));
    member.costBasisMinor = Math.round(member.costBasisMinor * (1 - ratio));
    fund.outstandingUnits = round4(Math.max(0, fund.outstandingUnits - req.unitsRequested));
    fund.members = fund.members.filter((m) => m.units > 0.00005);

    req.estimatedPayoutMinor = netMinor;
    req.feeMinor = feeMinor;
    req.status = 'SETTLED';
    req.settledAt = new Date().toISOString();
    req.note = 'Đã tất toán thành công từ tiền mặt khả dụng của quỹ.';
    if (!fund.redemptionQueue.some((r) => r.id === req.id)) {
      fund.redemptionQueue.push(req);
    }

    this.recomputeFundNav(fund);
    this.appendNavPoint(fund, -grossMinor);
    this.appendAudit(
      fund,
      member.playerId,
      member.playerName,
      'FUND_REDEMPTION',
      `Tất toán rút ${req.unitsRequested.toFixed(4)} CCQ, nhận ròng ${(netMinor / 100).toLocaleString('en-US')} CR (phí ${(feeMinor / 100).toLocaleString('en-US')} CR).`,
    );
  }

  /**
   * Explicit guardrail against unauthorized withdrawal of fund cash to manager personal wallet.
   * Always throws FUND_UNAUTHORIZED_WITHDRAWAL.
   */
  public attemptUnauthorizedManagerWithdrawal(fundId: string, actorId: string): never {
    const fund = this.funds.get(fundId);
    if (fund) {
      this.appendAudit(
        fund,
        actorId,
        actorId,
        'SECURITY_BLOCKED',
        'Từ chối yêu cầu rút tiền mặt trực tiếp từ tài khoản quỹ sang ví cá nhân.',
      );
    }
    throw new DomainError('FUND_UNAUTHORIZED_WITHDRAWAL', undefined, 403);
  }

  /**
   * Manager allocates fund capital into allowed assets (zero leverage).
   * Prices are strictly derived from live MatchingEngine quotes or macro-driven Property/T-Bill indices.
   */
  public executeFundTrade(params: {
    fundId: string;
    managerId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amountCR: number;
  }): InvestmentFund {
    const fund = this.funds.get(params.fundId);
    if (!fund) throw new DomainError('FUND_NOT_FOUND', undefined, 404);
    if (fund.managerId !== params.managerId) {
      throw new DomainError('FORBIDDEN', 'Chỉ Giám đốc Quỹ (Fund Manager) mới có quyền phân bổ danh mục.');
    }
    if (fund.status !== 'ACTIVE') {
      throw new DomainError('VALIDATION_ERROR', 'Quỹ không còn hoạt động.');
    }
    if (params.amountCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Giá trị giao dịch phải lớn hơn 0 CR.');
    }

    const sym = params.symbol.toUpperCase();
    if (!fund.allowedAssets.includes(sym)) {
      throw new DomainError(
        'FUND_RISK_LIMIT_VIOLATION',
        `Tài sản ${sym} không nằm trong danh mục được phép của quỹ ${fund.code}.`,
      );
    }

    const quote = this.resolveSymbolPrice(sym);
    if (!quote) {
      throw new DomainError('ASSET_NOT_FOUND', `Không tìm thấy giá thị trường cho tài sản ${sym}.`);
    }

    this.recomputeFundNav(fund);
    const acctId = this.fundAccountId(fund.id);
    const tradeMinor = toMinor(params.amountCR);

    if (params.side === 'BUY') {
      const cashAvailable = this.ledger.getSystemBalance(acctId);
      if (cashAvailable < tradeMinor) {
        throw new DomainError('INSUFFICIENT_FUNDS', 'Tiền mặt trong tài khoản quỹ không đủ (quỹ không hỗ trợ đòn bẩy).');
      }

      const navAfter = Math.max(1, fund.navMinor);
      const minCashRequired = Math.round((navAfter * fund.minCashReservePct) / 100);
      if (cashAvailable - tradeMinor < minCashRequired) {
        throw new DomainError(
          'FUND_RISK_LIMIT_VIOLATION',
          `Vi phạm hạn mức dự trữ thanh khoản tối thiểu ${fund.minCashReservePct}% NAV của quỹ.`,
        );
      }

      const existing = fund.holdings.find((h) => h.symbol === sym);
      const projectedPosVal = (existing?.marketValueMinor ?? 0) + tradeMinor;
      const projectedWeightPct = (projectedPosVal / navAfter) * 100;
      if (projectedWeightPct > fund.maxSinglePositionPct + 0.5) {
        throw new DomainError(
          'FUND_RISK_LIMIT_VIOLATION',
          `Tỷ trọng ${sym} dự kiến (${projectedWeightPct.toFixed(1)}%) vượt giới hạn tối đa ${fund.maxSinglePositionPct}%/mã.`,
        );
      }

      // Transfer from Fund Account to finite liquidity reserve (zero CR printing)
      this.ledger.transferAvailable({
        fromAccount: acctId,
        toAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
        amountMinor: tradeMinor,
        category: 'TRADE_SETTLEMENT',
        referenceId: `${fund.id}:${sym}`,
        description: `Quỹ ${fund.code} mua ${sym} trị giá ${params.amountCR.toLocaleString('en-US')} CR`,
      });

      const qtyBought = round4(tradeMinor / quote.priceMinor);
      if (existing) {
        const totalCost = Math.round(existing.quantity * existing.avgCostMinor) + tradeMinor;
        existing.quantity = round4(existing.quantity + qtyBought);
        existing.avgCostMinor = Math.round(totalCost / existing.quantity);
        existing.marketPriceMinor = quote.priceMinor;
        existing.stalePricing = quote.stale;
      } else {
        fund.holdings.push({
          symbol: sym,
          assetClass: quote.assetClass,
          quantity: qtyBought,
          avgCostMinor: quote.priceMinor,
          marketPriceMinor: quote.priceMinor,
          marketValueMinor: tradeMinor,
          weightPct: 0,
          stalePricing: quote.stale,
        });
      }

      this.recomputeFundNav(fund);
      this.appendAudit(
        fund,
        fund.managerId,
        fund.managerName,
        'FUND_BUY',
        `Mua ${qtyBought.toFixed(4)} ${sym} giá ${(quote.priceMinor / 100).toFixed(2)} CR (tổng ${params.amountCR.toLocaleString('en-US')} CR).`,
      );
      return this.cloneFund(fund);
    }

    // SELL
    const existing = fund.holdings.find((h) => h.symbol === sym);
    if (!existing || existing.quantity <= 0) {
      throw new DomainError('INSUFFICIENT_ASSET_BALANCE', `Quỹ ${fund.code} không nắm giữ tài sản ${sym}.`);
    }

    const maxSellMinor = Math.round(existing.quantity * quote.priceMinor);
    const sellMinor = Math.min(tradeMinor, maxSellMinor);
    const qtySold = Math.min(existing.quantity, round4(sellMinor / quote.priceMinor));

    // Settle proceeds back to Fund Account from finite liquidity reserve
    const reserveBal = this.ledger.getSystemBalance(SYSTEM_ACCOUNTS.BANK_RESERVE);
    const actualProceeds = Math.min(sellMinor, reserveBal);
    if (actualProceeds <= 0) {
      throw new DomainError('FUND_INSUFFICIENT_LIQUIDITY', 'Thanh khoản thị trường tạm thời không đủ để tất toán.');
    }

    this.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      toAccount: acctId,
      amountMinor: actualProceeds,
      category: 'TRADE_SETTLEMENT',
      referenceId: `${fund.id}:${sym}`,
      description: `Quỹ ${fund.code} bán ${sym} thu về ${(actualProceeds / 100).toLocaleString('en-US')} CR`,
    });

    existing.quantity = round4(Math.max(0, existing.quantity - qtySold));
    if (existing.quantity < 0.0001) {
      fund.holdings = fund.holdings.filter((h) => h.symbol !== sym);
    }

    this.recomputeFundNav(fund);
    this.appendAudit(
      fund,
      fund.managerId,
      fund.managerName,
      'FUND_SELL',
      `Bán ${qtySold.toFixed(4)} ${sym} thu về ${(actualProceeds / 100).toLocaleString('en-US')} CR để bổ sung thanh khoản quỹ.`,
    );

    // Try settling queued redemptions with newly freed cash
    this.processRedemptionQueue(fund.id);

    return this.cloneFund(fund);
  }

  public createFundProposal(params: {
    fundId: string;
    proposerId: string;
    proposerName: string;
    type: FundGovernanceProposal['type'];
    title: string;
    description: string;
    payload?: Record<string, unknown>;
  }): FundGovernanceProposal {
    const fund = this.funds.get(params.fundId);
    if (!fund) throw new DomainError('FUND_NOT_FOUND', undefined, 404);
    const member = fund.members.find((m) => m.playerId === params.proposerId);
    if (!member || member.units <= 0) {
      throw new DomainError('FORBIDDEN', 'Chỉ thành viên nắm giữ chứng chỉ quỹ mới có quyền tạo đề xuất.');
    }

    const proposal: FundGovernanceProposal = {
      id: `fprop_${crypto.randomBytes(4).toString('hex')}`,
      fundId: fund.id,
      type: params.type,
      title: params.title.trim().slice(0, 96),
      description: params.description.trim().slice(0, 320),
      proposerId: params.proposerId,
      proposerName: params.proposerName,
      payload: params.payload ?? {},
      votesFor: member.units,
      votesAgainst: 0,
      voters: [{ playerId: params.proposerId, vote: 'FOR', weight: member.units }],
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };

    fund.proposals.unshift(proposal);
    this.evaluateFundProposal(fund, proposal);
    this.appendAudit(fund, params.proposerId, params.proposerName, 'GOVERNANCE_PROPOSAL', `Đề xuất ${params.type}: ${proposal.title}`);
    return { ...proposal };
  }

  public voteFundProposal(params: {
    fundId: string;
    proposalId: string;
    voterId: string;
    voterName: string;
    vote: 'FOR' | 'AGAINST';
  }): { fund: InvestmentFund; proposal: FundGovernanceProposal } {
    const fund = this.funds.get(params.fundId);
    if (!fund) throw new DomainError('FUND_NOT_FOUND', undefined, 404);
    const proposal = fund.proposals.find((p) => p.id === params.proposalId);
    if (!proposal) throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy đề xuất quản trị quỹ.');
    if (proposal.status !== 'OPEN') throw new DomainError('VALIDATION_ERROR', 'Đề xuất quỹ đã kết thúc.');

    const member = fund.members.find((m) => m.playerId === params.voterId);
    if (!member || member.units <= 0) {
      throw new DomainError('FORBIDDEN', 'Bạn không phải thành viên nắm giữ chứng chỉ quỹ này.');
    }
    if (proposal.voters.some((v) => v.playerId === params.voterId)) {
      throw new DomainError('VALIDATION_ERROR', 'Bạn đã biểu quyết cho đề xuất này rồi.');
    }

    proposal.voters.push({ playerId: params.voterId, vote: params.vote, weight: member.units });
    if (params.vote === 'FOR') proposal.votesFor = round4(proposal.votesFor + member.units);
    else proposal.votesAgainst = round4(proposal.votesAgainst + member.units);

    this.evaluateFundProposal(fund, proposal);
    this.appendAudit(
      fund,
      params.voterId,
      params.voterName,
      'GOVERNANCE_VOTE',
      `Biểu quyết ${params.vote} (${member.units.toFixed(2)} CCQ) cho "${proposal.title}".`,
    );

    return { fund: this.cloneFund(fund), proposal: { ...proposal } };
  }

  private evaluateFundProposal(fund: InvestmentFund, proposal: FundGovernanceProposal): void {
    const total = Math.max(0.0001, fund.outstandingUnits);
    const forPct = (proposal.votesFor / total) * 100;
    const againstPct = (proposal.votesAgainst / total) * 100;

    if (forPct > 50) {
      proposal.status = 'EXECUTED';
      if (proposal.type === 'ADJUST_FEE' && typeof proposal.payload.managementFeeAnnualPct === 'number') {
        fund.managementFeeAnnualPct = round2(
          Math.max(0, Math.min(V4_BALANCE_CONFIG.maxFundManagementFeePct, proposal.payload.managementFeeAnnualPct)),
        );
      } else if (proposal.type === 'CHANGE_RISK_LIMIT') {
        if (typeof proposal.payload.maxSinglePositionPct === 'number') {
          fund.maxSinglePositionPct = Math.max(15, Math.min(70, Math.round(proposal.payload.maxSinglePositionPct)));
        }
        if (typeof proposal.payload.minCashReservePct === 'number') {
          fund.minCashReservePct = Math.max(5, Math.min(50, Math.round(proposal.payload.minCashReservePct)));
        }
      } else if (proposal.type === 'CHANGE_MANAGER' && typeof proposal.payload.newManagerId === 'string') {
        fund.managerId = proposal.payload.newManagerId;
        fund.managerName =
          typeof proposal.payload.newManagerName === 'string'
            ? proposal.payload.newManagerName
            : proposal.payload.newManagerId;
      } else if (proposal.type === 'CHANGE_STRATEGY' && typeof proposal.payload.investmentObjective === 'string') {
        fund.investmentObjective = proposal.payload.investmentObjective.slice(0, 240);
      } else if (proposal.type === 'DISSOLVE_FUND') {
        fund.status = 'LIQUIDATING';
      }
      this.appendAudit(fund, 'SYSTEM', 'Quản trị Quỹ', 'PROPOSAL_EXECUTED', `Nghị quyết "${proposal.title}" đạt ${forPct.toFixed(1)}% CCQ và đã có hiệu lực.`);
    } else if (againstPct >= 50) {
      proposal.status = 'REJECTED';
    }
  }

  /**
   * Runs per macro cycle: updates synthetic real estate / money market benchmarks from V4 macro indicators,
   * marks all fund holdings to live prices, accrues capped management fees, and records NAV history.
   */
  public markToMarketAndAccrueFees(macro: V4MacroIndicators): InvestmentFund[] {
    // Update synthetic property index & T-Bill benchmarks deterministically from macro state
    const propDrift = (macro.propertyDemandIndex - 100) / 1000;
    for (const key of ['VN-RE-HCMC', 'VN-RE-HN', 'VN-RE-DN']) {
      const cur = this.syntheticPricesMinor.get(key) ?? toMinor(100);
      const next = Math.max(toMinor(40), Math.round(cur * (1 + propDrift)));
      this.syntheticPricesMinor.set(key, next);
    }
    const tbillYieldPerCycle = Math.max(0.0001, macro.interestRatePct / 100 / 365);
    for (const key of ['TBILL-30D', 'CD-EMPIRE']) {
      const cur = this.syntheticPricesMinor.get(key) ?? toMinor(100);
      this.syntheticPricesMinor.set(key, Math.round(cur * (1 + tbillYieldPerCycle)));
    }

    const updated: InvestmentFund[] = [];
    for (const fund of this.funds.values()) {
      if (fund.status === 'DISSOLVED') continue;
      this.recomputeFundNav(fund);

      // Proportional management fee for 1 macro cycle (6 game hours = 0.25 day)
      const cycleFractionOfYear = V4_BALANCE_CONFIG.gameHoursPerMacroCycle / (24 * 365);
      const feeDueMinor = Math.round(fund.navMinor * (fund.managementFeeAnnualPct / 100) * cycleFractionOfYear);
      const acctId = this.fundAccountId(fund.id);
      const fundCash = this.ledger.getSystemBalance(acctId);

      if (feeDueMinor > 0 && fundCash >= feeDueMinor && this.ledger.wallets.getWallet(fund.managerId)) {
        this.ledger.transferAvailable({
          fromAccount: acctId,
          toAccount: fund.managerId,
          amountMinor: feeDueMinor,
          category: 'FUND_FEE',
          referenceId: fund.id,
          description: `Phí quản lý định kỳ quỹ ${fund.code} (${fund.managementFeeAnnualPct}%/năm)`,
        });
      }

      this.recomputeFundNav(fund);
      this.appendNavPoint(fund, 0);
      this.processRedemptionQueue(fund.id);
      updated.push(this.cloneFund(fund));
    }

    return updated;
  }

  private resolveSymbolPrice(
    symbol: string,
  ): { priceMinor: number; assetClass: FundHolding['assetClass']; stale: boolean } | null {
    const asset = this.matching.getAsset(symbol);
    if (asset) {
      const assetClass: FundHolding['assetClass'] =
        asset.marketClass === 'STOCK'
          ? 'STOCK'
          : asset.marketClass === 'CRYPTO'
            ? 'CRYPTO'
            : 'FOREX';
      return {
        priceMinor: asset.lastPriceMinor,
        assetClass,
        stale: asset.volume24h <= 0,
      };
    }

    const syn = this.syntheticPricesMinor.get(symbol);
    if (syn !== undefined) {
      return {
        priceMinor: syn,
        assetClass: symbol.startsWith('VN-RE-') ? 'PROPERTY_INDEX' : 'CASH_EQUIV',
        stale: false,
      };
    }
    return null;
  }

  private recomputeFundNav(fund: InvestmentFund): void {
    fund.cashMinor = this.ledger.getSystemBalance(this.fundAccountId(fund.id));

    let holdingsValueMinor = 0;
    for (const h of fund.holdings) {
      const q = this.resolveSymbolPrice(h.symbol);
      if (q) {
        h.marketPriceMinor = q.priceMinor;
        h.stalePricing = q.stale;
      } else {
        h.stalePricing = true;
      }
      h.marketValueMinor = Math.round(h.quantity * h.marketPriceMinor);
      holdingsValueMinor += h.marketValueMinor;
    }

    fund.totalAssetsMinor = fund.cashMinor + holdingsValueMinor;
    fund.navMinor = Math.max(0, fund.totalAssetsMinor - fund.totalLiabilitiesMinor);

    for (const h of fund.holdings) {
      h.weightPct = fund.navMinor > 0 ? round2((h.marketValueMinor / fund.navMinor) * 100) : 0;
    }

    if (fund.outstandingUnits > 0.00005) {
      fund.navPerUnitMinor = Math.max(1, Math.round(fund.navMinor / fund.outstandingUnits));
    }

    for (const m of fund.members) {
      m.ownershipPct = fund.outstandingUnits > 0 ? round2((m.units / fund.outstandingUnits) * 100) : 0;
    }

    fund.returnPct = round2(((fund.navPerUnitMinor - fund.initialNavPerUnitMinor) / fund.initialNavPerUnitMinor) * 100);
    this.recomputeRiskMetrics(fund);
  }

  private recomputeRiskMetrics(fund: InvestmentFund): void {
    const hist = fund.navHistory;
    if (hist.length < 2) {
      fund.maxDrawdownPct = 0;
      fund.annualizedVolatilityPct = 0;
      fund.sharpeRatio = 0;
      return;
    }

    let peak = hist[0].navPerUnitMinor;
    let maxDd = 0;
    const returns: number[] = [];

    for (let i = 1; i < hist.length; i++) {
      const prev = hist[i - 1].navPerUnitMinor;
      const cur = hist[i].navPerUnitMinor;
      if (cur > peak) peak = cur;
      const dd = peak > 0 ? ((peak - cur) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
      if (prev > 0) returns.push((cur - prev) / prev);
    }

    fund.maxDrawdownPct = round2(-maxDd);
    if (returns.length < 2) return;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    const annVol = std * Math.sqrt(365) * 100;
    fund.annualizedVolatilityPct = round2(Math.min(120, annVol));
    fund.sharpeRatio = annVol > 0.2 ? round2((fund.returnPct - 3.5) / annVol) : 0;
  }

  private appendNavPoint(fund: InvestmentFund, netFlowMinor: number): void {
    fund.navHistory.push({
      timestamp: new Date().toISOString(),
      navMinor: fund.navMinor,
      navPerUnitMinor: fund.navPerUnitMinor,
      aumMinor: fund.totalAssetsMinor,
      netFlowMinor,
    });
    if (fund.navHistory.length > 90) fund.navHistory.shift();
  }

  private appendAudit(fund: InvestmentFund, actorId: string, actorName: string, action: string, detail: string): void {
    const entry: FundAuditLog = {
      id: `faud_${crypto.randomBytes(4).toString('hex')}`,
      fundId: fund.id,
      actorId,
      actorName,
      action,
      detail,
      timestamp: new Date().toISOString(),
    };
    fund.auditLogs.unshift(entry);
    if (fund.auditLogs.length > 80) fund.auditLogs.pop();
  }

  private cloneFund(fund: InvestmentFund): InvestmentFund {
    return {
      ...fund,
      allowedAssets: [...fund.allowedAssets],
      holdings: fund.holdings.map((h) => ({ ...h })),
      members: fund.members.map((m) => ({ ...m })),
      redemptionQueue: fund.redemptionQueue.map((r) => ({ ...r })),
      navHistory: fund.navHistory.map((p) => ({ ...p })),
      proposals: fund.proposals.map((p) => ({ ...p, voters: [...p.voters], payload: { ...p.payload } })),
      auditLogs: fund.auditLogs.map((a) => ({ ...a })),
    };
  }
}
