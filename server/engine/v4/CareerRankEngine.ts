import crypto from 'node:crypto';
import { fromMinor } from '../../../shared/contracts/money';
import type {
  CareerTitleGroup,
  PlayerCareerProfile,
  PlayerJourneyEvent,
  PlayerMissionProgress,
  WealthRankSpec,
} from '../../../shared/contracts/v4';
import { DomainError } from '../../domain/DomainError';
import { CAREER_MISSIONS, CAREER_TITLES, SKILL_NODE_MAP, WEALTH_RANKS } from './V4Catalog';

export interface PlayerCareerMetricsSnapshot {
  playerId: string;
  username: string;
  netWorthMinor: number;
  totalDebtMinor: number;
  stockValueMinor: number;
  forexValueMinor: number;
  savingsAndTermMinor: number;
  propertyValueMinor: number;
  distinctHoldings: number;
  tradesExecuted: number;
  businessesFounded: number;
  maxBusinessLevel: number;
  profitableBusinessCycles: number;
  totalBusinessEmployees: number;
  businessUpgradesCompleted: number;
  branchesOpened: number;
  franchisesActive: number;
  holdingsCreated: number;
  iposCompleted: number;
  hasManufacturingLv4: boolean;
  hasTechLv4: boolean;
  hasRetailOrFnbLv4: boolean;
  hasHospitalityLv4: boolean;
  hasRealEstateCompany: boolean;
  dividendsReceived: number;
  privateShareDeals: number;
  governanceVotesCast: number;
  maDealsCompleted: number;
  maControllingDealsCompleted: number;
  propertiesOwned: number;
  propertiesRented: number;
  propertyCitiesOwned: number;
  hasHcmcProperty: boolean;
  hasHanoiProperty: boolean;
  hasCoastalProperty: boolean;
  fundsCreated: number;
  fundSubscriptionsOrTrades: number;
  hasFundMembership: boolean;
  hasFundManagedTrade: boolean;
  supercarsOwned: number;
  penthouseOwned: boolean;
  jetsOwned: number;
  yachtsOwned: number;
  collectiblesOwned: number;
  luxuryCustomizations: number;
  luxuryDistinctCategories: number;
  survivedRecessionWithBusiness: boolean;
  restructuredOrRescuedBusiness: boolean;
}

interface StoredPlayerCareer {
  equippedTitleId: string;
  unlockedTitleIds: Set<string>;
  completedMissionIds: Set<string>;
  missionCompletedAt: Map<string, string>;
  claimedMissionRewards: Set<string>;
  skillPoints: number;
  unlockedSkillIds: Set<string>;
  lastRankId: string;
  journey: PlayerJourneyEvent[];
  counters: {
    dividendsReceived: number;
    privateShareDeals: number;
    governanceVotesCast: number;
    maDealsCompleted: number;
    maControllingDealsCompleted: number;
    fundSubscriptionsOrTrades: number;
    hasFundManagedTrade: boolean;
    luxuryCustomizations: number;
    businessUpgradesCompleted: number;
    survivedRecessionWithBusiness: boolean;
    restructuredOrRescuedBusiness: boolean;
  };
}

export interface CareerEvaluationDelta {
  profile: PlayerCareerProfile;
  rankChanged: { from: WealthRankSpec; to: WealthRankSpec } | null;
  newlyCompletedMissions: PlayerMissionProgress[];
  newlyUnlockedTitleIds: string[];
}

export function resolveWealthRank(netWorthMinor: number): {
  current: WealthRankSpec;
  next: WealthRankSpec | null;
  progressPct: number;
} {
  const netWorthCR = Math.max(0, fromMinor(netWorthMinor));
  let idx = 0;
  for (let i = 0; i < WEALTH_RANKS.length; i++) {
    if (netWorthCR >= WEALTH_RANKS[i].minNetWorthCR) {
      idx = i;
    } else {
      break;
    }
  }
  const current = WEALTH_RANKS[idx];
  const next = idx < WEALTH_RANKS.length - 1 ? WEALTH_RANKS[idx + 1] : null;
  if (!next) {
    return { current, next: null, progressPct: 100 };
  }
  const span = Math.max(1, next.minNetWorthCR - current.minNetWorthCR);
  const progressPct = Number(
    Math.max(0, Math.min(100, ((netWorthCR - current.minNetWorthCR) / span) * 100)).toFixed(2),
  );
  return { current, next, progressPct };
}

/**
 * Authoritative Ranks, 54 Titles, 6 Career Paths, 21 Server-Verified Missions,
 * 4-Branch Skill Tree, and Chronological Player Journey Engine.
 */
export class CareerRankEngine {
  private records = new Map<string, StoredPlayerCareer>();

  public reset(): void {
    this.records.clear();
  }

  private ensureRecord(playerId: string): StoredPlayerCareer {
    let rec = this.records.get(playerId);
    if (!rec) {
      rec = {
        equippedTitleId: 't_world_pioneer',
        unlockedTitleIds: new Set(['t_world_pioneer']),
        completedMissionIds: new Set(),
        missionCompletedAt: new Map(),
        claimedMissionRewards: new Set(),
        skillPoints: 1, // 1 starter analytical point
        unlockedSkillIds: new Set(),
        lastRankId: WEALTH_RANKS[0].id,
        journey: [
          {
            id: `jrn_${crypto.randomBytes(4).toString('hex')}`,
            category: 'WORLD',
            title: 'Gia nhập WORLD-01: Global Economy',
            detail: 'Khởi tạo hồ sơ tài chính với vốn khởi điểm 100,000 CR trong thế giới mô phỏng chung.',
            timestamp: new Date().toISOString(),
          },
        ],
        counters: {
          dividendsReceived: 0,
          privateShareDeals: 0,
          governanceVotesCast: 0,
          maDealsCompleted: 0,
          maControllingDealsCompleted: 0,
          fundSubscriptionsOrTrades: 0,
          hasFundManagedTrade: false,
          luxuryCustomizations: 0,
          businessUpgradesCompleted: 0,
          survivedRecessionWithBusiness: false,
          restructuredOrRescuedBusiness: false,
        },
      };
      this.records.set(playerId, rec);
    }
    return rec;
  }

  public recordCounter(
    playerId: string,
    counter: keyof StoredPlayerCareer['counters'],
    delta = 1,
  ): void {
    const rec = this.ensureRecord(playerId);
    const current = rec.counters[counter];
    if (typeof current === 'boolean') {
      (rec.counters[counter] as boolean) = true;
    } else {
      (rec.counters[counter] as number) = current + delta;
    }
  }

  public getCounters(playerId: string): StoredPlayerCareer['counters'] {
    return { ...this.ensureRecord(playerId).counters };
  }

  public recordJourneyEvent(
    playerId: string,
    category: CareerTitleGroup,
    title: string,
    detail: string,
  ): PlayerJourneyEvent {
    const rec = this.ensureRecord(playerId);
    const evt: PlayerJourneyEvent = {
      id: `jrn_${crypto.randomBytes(4).toString('hex')}`,
      category,
      title,
      detail,
      timestamp: new Date().toISOString(),
    };
    rec.journey.unshift(evt);
    if (rec.journey.length > 120) rec.journey.pop();
    return evt;
  }

  public equipTitle(playerId: string, titleId: string): void {
    const rec = this.ensureRecord(playerId);
    if (!rec.unlockedTitleIds.has(titleId)) {
      throw new DomainError('FORBIDDEN', 'Bạn chưa mở khóa danh hiệu này.');
    }
    rec.equippedTitleId = titleId;
  }

  public unlockSkillNode(playerId: string, skillId: string): { skillPointsRemaining: number; unlockedSkillIds: string[] } {
    const rec = this.ensureRecord(playerId);
    const spec = SKILL_NODE_MAP.get(skillId);
    if (!spec) throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy kỹ năng yêu cầu.');
    if (rec.unlockedSkillIds.has(skillId)) {
      throw new DomainError('VALIDATION_ERROR', 'Kỹ năng này đã được mở khóa.');
    }
    if (spec.prerequisiteId && !rec.unlockedSkillIds.has(spec.prerequisiteId)) {
      throw new DomainError('VALIDATION_ERROR', 'Cần mở khóa kỹ năng tiên quyết trước.');
    }
    if (rec.skillPoints < spec.costPoints) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Không đủ điểm kỹ năng (Skill Points). Hãy hoàn thành thêm nhiệm vụ sự nghiệp.');
    }

    rec.skillPoints -= spec.costPoints;
    rec.unlockedSkillIds.add(skillId);
    if (skillId === 'sk_inv_rep') {
      rec.unlockedTitleIds.add('t_market_analyst');
    }
    this.recordJourneyEvent(playerId, 'WORLD', `Mở khóa kỹ năng: ${spec.name}`, spec.unlocksTool);

    return {
      skillPointsRemaining: rec.skillPoints,
      unlockedSkillIds: Array.from(rec.unlockedSkillIds),
    };
  }

  public evaluatePlayerProgression(metrics: PlayerCareerMetricsSnapshot): CareerEvaluationDelta {
    const rec = this.ensureRecord(metrics.playerId);
    const rankInfo = resolveWealthRank(metrics.netWorthMinor);

    let rankChanged: { from: WealthRankSpec; to: WealthRankSpec } | null = null;
    if (rankInfo.current.id !== rec.lastRankId) {
      const prevRank = WEALTH_RANKS.find((r) => r.id === rec.lastRankId) ?? WEALTH_RANKS[0];
      rec.lastRankId = rankInfo.current.id;
      rankChanged = { from: prevRank, to: rankInfo.current };
      this.recordJourneyEvent(
        metrics.playerId,
        'WORLD',
        `Thăng hạng Wealth Rank: ${rankInfo.current.name}`,
        `Tài sản ròng đạt ${Math.round(fromMinor(metrics.netWorthMinor)).toLocaleString('en-US')} CR (${rankInfo.current.frameLabel}).`,
      );
    }

    // 1. Evaluate server-verified Career Missions (idempotent one-time reward grant)
    const newlyCompletedMissions: PlayerMissionProgress[] = [];
    const missionsProgress: PlayerMissionProgress[] = CAREER_MISSIONS.map((m) => {
      const currentValue = this.resolveMetricValue(m.targetMetric, metrics);
      const isMet = currentValue >= m.targetValue;
      const alreadyDone = rec.completedMissionIds.has(m.id);

      if (isMet && !alreadyDone) {
        const nowIso = new Date().toISOString();
        rec.completedMissionIds.add(m.id);
        rec.missionCompletedAt.set(m.id, nowIso);

        // Strictly idempotent one-time reward grant
        if (!rec.claimedMissionRewards.has(m.id)) {
          rec.claimedMissionRewards.add(m.id);
          rec.skillPoints += m.skillPointsReward;
          if (m.rewardTitleId) {
            rec.unlockedTitleIds.add(m.rewardTitleId);
          }
          this.recordJourneyEvent(
            metrics.playerId,
            'WORLD',
            `Hoàn thành nhiệm vụ: ${m.title}`,
            m.rewardDescription,
          );
        }

        const progressItem: PlayerMissionProgress = {
          ...m,
          currentValue: Math.min(m.targetValue, currentValue),
          completed: true,
          completedAt: nowIso,
          rewardClaimed: true,
        };
        newlyCompletedMissions.push(progressItem);
        return progressItem;
      }

      return {
        ...m,
        currentValue: alreadyDone ? m.targetValue : Math.min(m.targetValue, currentValue),
        completed: alreadyDone,
        completedAt: rec.missionCompletedAt.get(m.id) ?? null,
        rewardClaimed: rec.claimedMissionRewards.has(m.id),
      };
    });

    // 2. Evaluate all 54 Career Titles
    const netWorthCR = fromMinor(metrics.netWorthMinor);
    const debtRatio = metrics.netWorthMinor > 0 ? metrics.totalDebtMinor / metrics.netWorthMinor : 0;
    const assetClassesCount =
      (metrics.stockValueMinor > 0 ? 1 : 0) +
      (metrics.propertyValueMinor > 0 ? 1 : 0) +
      (metrics.businessesFounded > 0 ? 1 : 0) +
      (metrics.hasFundMembership ? 1 : 0);

    const titleChecks: Array<[string, boolean]> = [
      // BUSINESS (12)
      ['t_first_entrepreneur', metrics.businessesFounded >= 1],
      ['t_local_business_owner', metrics.maxBusinessLevel >= 2],
      ['t_profitable_founder', metrics.profitableBusinessCycles >= 1],
      ['t_job_creator', metrics.totalBusinessEmployees >= 20],
      ['t_chain_builder', metrics.branchesOpened >= 2],
      ['t_franchise_master', metrics.franchisesActive >= 1],
      ['t_corporate_founder', metrics.holdingsCreated >= 1],
      ['t_manufacturing_king', metrics.hasManufacturingLv4],
      ['t_technology_pioneer', metrics.hasTechLv4],
      ['t_retail_mogul', metrics.hasRetailOrFnbLv4],
      ['t_hospitality_emperor', metrics.hasHospitalityLv4],
      ['t_global_ceo', metrics.maxBusinessLevel >= 10 || metrics.businessesFounded >= 5],
      // INVESTMENT (10)
      ['t_first_investor', metrics.tradesExecuted >= 1],
      ['t_diversified_investor', metrics.distinctHoldings >= 3],
      ['t_long_term_investor', fromMinor(metrics.stockValueMinor) >= 50_000],
      ['t_dividend_collector', metrics.dividendsReceived >= 1],
      ['t_portfolio_architect', assetClassesCount >= 3],
      ['t_risk_management_expert', netWorthCR >= 250_000 && debtRatio < 0.2],
      ['t_market_analyst', rec.unlockedSkillIds.has('sk_inv_rep')],
      ['t_fx_strategist', metrics.forexValueMinor > 0],
      ['t_ipo_pioneer', metrics.iposCompleted >= 1],
      ['t_capital_allocator', metrics.privateShareDeals + metrics.fundSubscriptionsOrTrades >= 2],
      // REAL ESTATE (8)
      ['t_first_property_owner', metrics.propertiesOwned >= 1],
      ['t_saigon_property_investor', metrics.hasHcmcProperty],
      ['t_hanoi_property_investor', metrics.hasHanoiProperty],
      ['t_coastal_property_owner', metrics.hasCoastalProperty],
      ['t_rental_landlord', metrics.propertiesRented >= 1],
      ['t_multi_city_landlord', metrics.propertyCitiesOwned >= 2],
      ['t_property_magnate', fromMinor(metrics.propertyValueMinor) >= 500_000],
      ['t_vn_re_tycoon', metrics.propertiesOwned >= 3 && metrics.hasRealEstateCompany],
      // FINANCE (8)
      ['t_fund_founder', metrics.fundsCreated >= 1],
      ['t_fund_manager', metrics.hasFundManagedTrade],
      ['t_debt_free_investor', netWorthCR >= 150_000 && metrics.totalDebtMinor === 0],
      ['t_capital_preservation', fromMinor(metrics.savingsAndTermMinor) >= 100_000],
      ['t_corporate_strategist', metrics.governanceVotesCast >= 1 || metrics.maDealsCompleted >= 1],
      ['t_deal_maker', metrics.maControllingDealsCompleted >= 1],
      ['t_fund_investor', metrics.hasFundMembership],
      ['t_governance_voice', metrics.governanceVotesCast >= 1],
      // LIFESTYLE (8)
      ['t_first_supercar', metrics.supercarsOwned >= 1],
      ['t_garage_curator', metrics.supercarsOwned >= 2],
      ['t_dream_penthouse', metrics.penthouseOwned],
      ['t_private_jet_owner', metrics.jetsOwned >= 1],
      ['t_yacht_collector', metrics.yachtsOwned >= 1],
      ['t_art_patron', metrics.collectiblesOwned >= 1],
      ['t_bespoke_stylist', metrics.luxuryCustomizations >= 1],
      ['t_luxury_collector', metrics.luxuryDistinctCategories >= 3 && metrics.supercarsOwned + metrics.jetsOwned + metrics.yachtsOwned + metrics.collectiblesOwned >= 4],
      // WORLD (8)
      ['t_world_pioneer', true],
      ['t_recession_survivor', metrics.survivedRecessionWithBusiness],
      ['t_business_recovery', metrics.restructuredOrRescuedBusiness],
      ['t_long_term_leader', rec.completedMissionIds.size >= 8],
      ['t_millionaire_club', netWorthCR >= 1_000_000],
      ['t_tycoon_circle', netWorthCR >= 10_000_000],
      ['t_billionaire_guild', netWorthCR >= 1_000_000_000],
      ['t_empire_legend', rankInfo.current.id === 'rank_empire_legend' || rec.unlockedTitleIds.size >= 25],
    ];

    const newlyUnlockedTitleIds: string[] = [];
    for (const [titleId, unlocked] of titleChecks) {
      if (unlocked && !rec.unlockedTitleIds.has(titleId)) {
        rec.unlockedTitleIds.add(titleId);
        newlyUnlockedTitleIds.push(titleId);
        const spec = CAREER_TITLES.find((t) => t.id === titleId);
        if (spec) {
          this.recordJourneyEvent(
            metrics.playerId,
            spec.group,
            `Mở khóa danh hiệu: ${spec.name}`,
            spec.conditionLabel,
          );
        }
      }
    }

    const equippedSpec = CAREER_TITLES.find((t) => t.id === rec.equippedTitleId) ?? CAREER_TITLES[46];

    const profile: PlayerCareerProfile = {
      playerId: metrics.playerId,
      username: metrics.username,
      netWorthMinor: metrics.netWorthMinor,
      wealthRank: rankInfo.current,
      nextWealthRank: rankInfo.next,
      progressToNextRankPct: rankInfo.progressPct,
      equippedTitleId: equippedSpec.id,
      equippedTitleName: equippedSpec.name,
      equippedTier: equippedSpec.tier,
      unlockedTitleIds: Array.from(rec.unlockedTitleIds),
      skillPoints: rec.skillPoints,
      unlockedSkillIds: Array.from(rec.unlockedSkillIds),
      missions: missionsProgress,
      journey: [...rec.journey],
    };

    return {
      profile,
      rankChanged,
      newlyCompletedMissions,
      newlyUnlockedTitleIds,
    };
  }

  private resolveMetricValue(metric: string, m: PlayerCareerMetricsSnapshot): number {
    switch (metric) {
      case 'businessesFounded':
        return m.businessesFounded;
      case 'profitableBusinessCycles':
        return m.profitableBusinessCycles;
      case 'businessUpgradesCompleted':
        return m.businessUpgradesCompleted;
      case 'branchesOpened':
        return m.branchesOpened;
      case 'holdingsCreated':
        return m.holdingsCreated;
      case 'iposCompleted':
        return m.iposCompleted;
      case 'tradesExecuted':
        return m.tradesExecuted;
      case 'distinctHoldings':
        return m.distinctHoldings;
      case 'dividendsReceived':
        return m.dividendsReceived;
      case 'netWorthCR':
        return Math.floor(fromMinor(m.netWorthMinor));
      case 'propertiesOwned':
        return m.propertiesOwned;
      case 'propertiesRented':
        return m.propertiesRented;
      case 'propertyCitiesOwned':
        return m.propertyCitiesOwned;
      case 'fundsCreated':
        return m.fundsCreated;
      case 'fundSubscriptionsOrTrades':
        return m.fundSubscriptionsOrTrades;
      case 'privateShareDeals':
        return m.privateShareDeals;
      case 'governanceVotesCast':
        return m.governanceVotesCast;
      case 'maDealsCompleted':
        return m.maDealsCompleted;
      case 'supercarsOwned':
        return m.supercarsOwned;
      case 'luxuryCustomizationsOrCollectibles':
        return m.luxuryCustomizations + m.collectiblesOwned;
      case 'jetsOrYachtsOwned':
        return m.jetsOwned + m.yachtsOwned;
      default:
        return 0;
    }
  }
}
