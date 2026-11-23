import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import type { BusinessSector, EconomyState, PlayerCompany } from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';

const SECTOR_METRICS: Record<
  BusinessSector,
  { baseMargin: number; wagePerWorkerCR: number; demandSensitivity: number }
> = {
  Technology: { baseMargin: 0.24, wagePerWorkerCR: 280, demandSensitivity: 1.2 },
  Manufacturing: { baseMargin: 0.16, wagePerWorkerCR: 210, demandSensitivity: 1.1 },
  Logistics: { baseMargin: 0.15, wagePerWorkerCR: 190, demandSensitivity: 1.0 },
  'Real Estate Development': { baseMargin: 0.19, wagePerWorkerCR: 240, demandSensitivity: 1.3 },
  'Financial Services': { baseMargin: 0.22, wagePerWorkerCR: 310, demandSensitivity: 1.15 },
  Retail: { baseMargin: 0.12, wagePerWorkerCR: 165, demandSensitivity: 1.25 },
  Energy: { baseMargin: 0.18, wagePerWorkerCR: 250, demandSensitivity: 0.85 },
};

/**
 * Empire Business Network (Business Lite).
 * Enforces INVARIANT 11: Company cash & assets are strictly separated from founder's personal wallet.
 */
export class BusinessEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private companies = new Map<string, PlayerCompany>();

  constructor(worldId: string, ledger: LedgerService) {
    this.worldId = worldId;
    this.ledger = ledger;
  }

  reset(): void {
    this.companies.clear();
  }

  listCompanies(): PlayerCompany[] {
    return Array.from(this.companies.values());
  }

  getCompany(companyId: string): PlayerCompany | undefined {
    return this.companies.get(companyId);
  }

  getPlayerBusinessEquityMinor(playerId: string): number {
    let total = 0;
    for (const c of this.companies.values()) {
      const share = c.shareholders.find((s) => s.playerId === playerId);
      if (share) {
        total += Math.round((c.valuationMinor * share.ownershipPct) / 100);
      }
    }
    return total;
  }

  /**
   * Founds a new company by transferring initial capital from personal wallet into separate company account.
   */
  createCompany(params: {
    founderId: string;
    founderName: string;
    name: string;
    ticker: string;
    sector: BusinessSector;
    initialCapitalCR: number;
  }): PlayerCompany {
    const duplicate = Array.from(this.companies.values()).find(
      (c) => c.ticker.toUpperCase() === params.ticker.toUpperCase(),
    );
    if (duplicate) {
      throw new DomainError('INVALID_ORDER', `Mã doanh nghiệp ${params.ticker} đã tồn tại trong WORLD-01.`);
    }

    const capitalMinor = toMinor(params.initialCapitalCR);
    const companyId = `cmp_${crypto.randomBytes(5).toString('hex')}`;
    const companyAccount = `COMPANY_${companyId}`;

    // Transfer capital from personal available wallet to separate company account
    this.ledger.transferAvailable({
      fromAccount: params.founderId,
      toAccount: companyAccount,
      amountMinor: capitalMinor,
      category: 'COMPANY_CAPITAL',
      referenceId: companyId,
      description: `Góp vốn thành lập doanh nghiệp ${params.name} (${params.ticker})`,
    });

    const equipmentAllocation = Math.round(capitalMinor * 0.35);
    const workingCash = capitalMinor - equipmentAllocation;

    const company: PlayerCompany = {
      id: companyId,
      worldId: this.worldId,
      name: params.name,
      ticker: params.ticker.toUpperCase(),
      sector: params.sector,
      founderId: params.founderId,
      founderName: params.founderName,
      ceoName: params.founderName,
      foundedAt: new Date().toISOString(),
      cashMinor: workingCash,
      assetsMinor: equipmentAllocation,
      debtMinor: 0,
      revenueLastCycleMinor: 0,
      expensesLastCycleMinor: 0,
      netProfitLastCycleMinor: 0,
      totalProfitMinor: 0,
      workforceCount: 5,
      capacityLevel: 1,
      reputation: 50,
      valuationMinor: capitalMinor,
      status: 'ACTIVE',
      shareholders: [
        {
          playerId: params.founderId,
          playerName: params.founderName,
          ownershipPct: 100,
        },
      ],
      ipoReady: false,
    };

    this.companies.set(company.id, company);
    return { ...company };
  }

  /**
   * Expands company production capacity & hires NPC staff using company cash (separate from personal cash).
   */
  expandCompany(companyId: string, requesterId: string): PlayerCompany {
    const company = this.companies.get(companyId);
    if (!company) throw new DomainError('COMPANY_NOT_FOUND');
    if (company.founderId !== requesterId) throw new DomainError('NOT_COMPANY_OWNER');

    const expansionCostMinor = toMinor(12_000 * company.capacityLevel);
    if (company.cashMinor < expansionCostMinor) {
      throw new DomainError(
        'INSUFFICIENT_FUNDS',
        `Tiền mặt doanh nghiệp cần ít nhất ${(expansionCostMinor / 100).toLocaleString('en-US')} CR để mở rộng quy mô.`,
      );
    }

    company.cashMinor -= expansionCostMinor;
    company.assetsMinor += Math.round(expansionCostMinor * 0.85);
    company.capacityLevel += 1;
    company.workforceCount += 4;
    company.reputation = Math.min(100, company.reputation + 4);
    this.recomputeValuation(company);
    return { ...company };
  }

  /**
   * Runs one economy-linked operating cycle for all active companies.
   * Revenue depends on capacity, sector margin, and WORLD-01 Consumer Demand Index.
   * Costs include NPC wages and overhead — companies CAN lose money in recession!
   */
  runOperatingCycle(economy: EconomyState): PlayerCompany[] {
    const updated: PlayerCompany[] = [];
    const demandMultiplier = economy.consumerDemandIndex / 100;
    const phaseFactor =
      economy.phase === 'BOOM'
        ? 1.15
        : economy.phase === 'EXPANSION'
          ? 1.05
          : economy.phase === 'RECESSION'
            ? 0.72
            : economy.phase === 'SLOWDOWN'
              ? 0.88
              : 0.98;

    for (const company of this.companies.values()) {
      const cfg = SECTOR_METRICS[company.sector];
      const baseRevenueCR = company.capacityLevel * 4_200 + (company.assetsMinor / 100) * 0.045;
      const revenueMinor = toMinor(baseRevenueCR * demandMultiplier * phaseFactor * cfg.demandSensitivity);

      const wageExpenseMinor = toMinor(company.workforceCount * cfg.wagePerWorkerCR);
      const operatingOverheadMinor = Math.round(revenueMinor * (1 - cfg.baseMargin) * 0.65);
      const totalExpenseMinor = wageExpenseMinor + operatingOverheadMinor;
      const netProfitMinor = revenueMinor - totalExpenseMinor;

      company.revenueLastCycleMinor = revenueMinor;
      company.expensesLastCycleMinor = totalExpenseMinor;
      company.netProfitLastCycleMinor = netProfitMinor;
      company.totalProfitMinor += netProfitMinor;
      company.cashMinor += netProfitMinor;

      if (company.cashMinor < 0) {
        company.status = 'DISTRESSED';
        company.reputation = Math.max(10, company.reputation - 8);
      } else {
        company.status = 'ACTIVE';
        if (netProfitMinor > 0) {
          company.reputation = Math.min(100, company.reputation + 1);
        }
      }

      company.ipoReady = company.valuationMinor >= toMinor(250_000) && company.status === 'ACTIVE' && company.totalProfitMinor > 0;
      this.recomputeValuation(company);
      updated.push({ ...company });
    }

    return updated;
  }

  /**
   * Pays out legal dividend from company cash to shareholders (strictly capped by available company cash).
   */
  distributeDividend(companyId: string, requesterId: string, amountCR: number): PlayerCompany {
    const company = this.companies.get(companyId);
    if (!company) throw new DomainError('COMPANY_NOT_FOUND');
    if (company.founderId !== requesterId) throw new DomainError('NOT_COMPANY_OWNER');
    if (company.status === 'DISTRESSED') {
      throw new DomainError('INVALID_ORDER', 'Doanh nghiệp đang khó khăn tài chính, không được chia cổ tức.');
    }

    const amountMinor = toMinor(amountCR);
    if (amountMinor <= 0 || company.cashMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Tiền mặt doanh nghiệp không đủ để chi trả cổ tức.');
    }

    company.cashMinor -= amountMinor;
    const companyAccount = `COMPANY_${company.id}`;

    for (const sh of company.shareholders) {
      const shareMinor = Math.round((amountMinor * sh.ownershipPct) / 100);
      if (shareMinor <= 0) continue;
      const wallet = this.ledger.requireWallet(sh.playerId);
      wallet.availableMinor += shareMinor;
      this.ledger.recordEntry({
        transactionId: `tx_cdiv_${crypto.randomBytes(4).toString('hex')}`,
        debitAccount: companyAccount,
        creditAccount: sh.playerId,
        amountMinor: shareMinor,
        category: 'COMPANY_DIVIDEND',
        referenceId: company.id,
        description: `Phân phối lợi nhuận từ ${company.name} (${company.ticker})`,
      });
    }

    // Keep system reserve synced (no CR minted)
    void SYSTEM_ACCOUNTS;
    this.recomputeValuation(company);
    return { ...company };
  }

  private recomputeValuation(company: PlayerCompany): void {
    const bookValue = Math.max(0, company.cashMinor + company.assetsMinor - company.debtMinor);
    const earningsMultiple = Math.max(0, company.netProfitLastCycleMinor * 6);
    company.valuationMinor = Math.max(0, bookValue + earningsMultiple);
  }
}
