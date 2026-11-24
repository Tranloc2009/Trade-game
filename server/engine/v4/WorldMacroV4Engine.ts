import crypto from 'node:crypto';
import type { EconomyState, NewsItem } from '../../../shared/contracts/types';
import {
  V4_BALANCE_CONFIG,
  type EconomicCalendarItemV4,
  type MacroSimulationReport,
  type V4EconomicPhase,
  type V4MacroIndicators,
  type WorldMacroEventV4,
} from '../../../shared/contracts/v4';
import { WORLD_EVENT_TEMPLATES_V4, type WorldEventTemplateV4 } from './V4Catalog';

const V4_PHASES: V4EconomicPhase[] = [
  'RECOVERY',
  'EXPANSION',
  'BOOM',
  'SLOWDOWN',
  'RECESSION',
  'CRISIS',
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

/**
 * Deterministic Living World Economy Engine V4:
 * - Tracks 12 interconnected macro indicators across 6 economic cycle phases
 * - Drives 42 simulated economic event templates with bounded Economic Chain Reactions
 * - Publishes Economic Calendar items synced to unified Game Clock (no peeking at unannounced events)
 * - Generates template-based SIMULATED NEWS grounded strictly in simulation state (zero AI API calls)
 */
export class WorldMacroV4Engine {
  public indicators: V4MacroIndicators;
  public activeEvents: WorldMacroEventV4[] = [];
  public historicalEvents: WorldMacroEventV4[] = [];
  public calendar: EconomicCalendarItemV4[] = [];
  public indicatorHistory: Array<{
    cycleId: number;
    gameDay: number;
    timestamp: string;
    phase: V4EconomicPhase;
    gdpGrowthPct: number;
    inflationPct: number;
    interestRatePct: number;
    consumerConfidenceIndex: number;
    energyPriceIndex: number;
    propertyDemandIndex: number;
  }> = [];

  private cycleSeq = 0;
  private lastTickId: string | null = null;
  private processedTickIds = new Set<string>();
  private rngState = 20261124;

  constructor() {
    this.indicators = this.createInitialIndicators();
    this.seedInitialState();
  }

  private createInitialIndicators(): V4MacroIndicators {
    return {
      phase: 'EXPANSION',
      gdpGrowthPct: 3.4,
      inflationPct: 2.5,
      interestRatePct: 4.5,
      unemploymentPct: 4.2,
      consumerConfidenceIndex: 69,
      householdSpendingIndex: 105,
      businessInvestmentIndex: 104,
      creditGrowthPct: 8.6,
      bankingLiquidityIndex: 82,
      propertyDemandIndex: 104,
      energyPriceIndex: 100,
      manufacturingCostIndex: 100,
    };
  }

  private nextSeededFloat(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 0x100000000;
  }

  public reset(seed = 20261124): void {
    this.cycleSeq = 0;
    this.lastTickId = null;
    this.processedTickIds.clear();
    this.rngState = seed >>> 0;
    this.indicators = this.createInitialIndicators();
    this.activeEvents = [];
    this.historicalEvents = [];
    this.calendar = [];
    this.indicatorHistory = [];
    this.seedInitialState();
  }

  private seedInitialState(): void {
    const nowIso = new Date().toISOString();
    this.indicatorHistory.push({
      cycleId: 0,
      gameDay: 1,
      timestamp: nowIso,
      phase: this.indicators.phase,
      gdpGrowthPct: this.indicators.gdpGrowthPct,
      inflationPct: this.indicators.inflationPct,
      interestRatePct: this.indicators.interestRatePct,
      consumerConfidenceIndex: this.indicators.consumerConfidenceIndex,
      energyPriceIndex: this.indicators.energyPriceIndex,
      propertyDemandIndex: this.indicators.propertyDemandIndex,
    });
    this.rebuildUpcomingCalendar(1);
  }

  public rebuildUpcomingCalendar(currentGameDay: number): void {
    const released = this.calendar.filter((c) => c.status === 'RELEASED').slice(0, 12);
    const upcoming: EconomicCalendarItemV4[] = [
      {
        id: `cal_payroll_d${currentGameDay + 1}`,
        title: `Kỳ thanh toán lương & vận hành doanh nghiệp (Ngày ${currentGameDay + 1})`,
        category: 'PAYROLL',
        scheduledGameDay: currentGameDay + 1,
        scheduledTimeLabel: `Ngày ${currentGameDay + 1} · 09:00`,
        status: 'UPCOMING',
        publicSummary: 'Các doanh nghiệp hạch toán doanh thu NPC, trả lương nhân viên và chi phí mặt bằng.',
      },
      {
        id: `cal_cpi_d${currentGameDay + 2}`,
        title: `Công bố Chỉ số Lạm phát CPI Mô phỏng (Ngày ${currentGameDay + 2})`,
        category: 'INFLATION',
        scheduledGameDay: currentGameDay + 2,
        scheduledTimeLabel: `Ngày ${currentGameDay + 2} · 10:00`,
        status: 'UPCOMING',
        publicSummary: 'Công bố định kỳ lạm phát tiêu dùng ảnh hưởng đến sức mua hộ gia đình NPC.',
      },
      {
        id: `cal_rate_d${currentGameDay + 3}`,
        title: `Quyết định Lãi suất Ngân hàng Trung ương WORLD-01 (Ngày ${currentGameDay + 3})`,
        category: 'INTEREST_RATE',
        scheduledGameDay: currentGameDay + 3,
        scheduledTimeLabel: `Ngày ${currentGameDay + 3} · 14:00`,
        status: 'UPCOMING',
        publicSummary: 'Định hướng chính sách tiền tệ tác động tới chi phí vay vốn và thanh khoản ngân hàng.',
      },
      {
        id: `cal_earnings_d${currentGameDay + 4}`,
        title: `Kỳ Báo cáo Tài chính & Trả Cổ tức Doanh nghiệp (Ngày ${currentGameDay + 4})`,
        category: 'EARNINGS',
        scheduledGameDay: currentGameDay + 4,
        scheduledTimeLabel: `Ngày ${currentGameDay + 4} · 16:00`,
        status: 'UPCOMING',
        publicSummary: 'Tổng hợp kết quả kinh doanh các công ty niêm yết và doanh nghiệp người chơi.',
      },
      {
        id: `cal_gdp_d${currentGameDay + 5}`,
        title: `Báo cáo Tăng trưởng GDP & Chu kỳ Kinh tế (Ngày ${currentGameDay + 5})`,
        category: 'GDP',
        scheduledGameDay: currentGameDay + 5,
        scheduledTimeLabel: `Ngày ${currentGameDay + 5} · 11:00`,
        status: 'UPCOMING',
        publicSummary: 'Đánh giá tổng thể tăng trưởng sản lượng, thất nghiệp và niềm tin đầu tư.',
      },
      {
        id: `cal_debt_d${currentGameDay + 6}`,
        title: `Kỳ đối soát Nợ vay & Lãi suất Tiết kiệm Empire Bank (Ngày ${currentGameDay + 6})`,
        category: 'DEBT',
        scheduledGameDay: currentGameDay + 6,
        scheduledTimeLabel: `Ngày ${currentGameDay + 6} · 15:00`,
        status: 'UPCOMING',
        publicSummary: 'Cập nhật nghĩa vụ trả nợ ngân hàng và lãi gửi tiết kiệm theo mặt bằng lãi suất mới.',
      },
    ];
    this.calendar = [...upcoming, ...released];
  }

  /**
   * Advances one idempotent macro tick.
   * Applies bounded Economic Chain Reactions (strictly capped to prevent infinite feedback loops).
   */
  public tickMacro(params: {
    tickId: string;
    gameDay: number;
    baseEconomy: EconomyState;
    forceTemplateId?: string;
    activeBusinessCount?: number;
    avgBusinessProfitMarginPct?: number;
  }): {
    deduplicated: boolean;
    startedEvent: WorldMacroEventV4 | null;
    endedEvents: WorldMacroEventV4[];
    generatedNews: NewsItem[];
  } {
    if (this.processedTickIds.has(params.tickId)) {
      return { deduplicated: true, startedEvent: null, endedEvents: [], generatedNews: [] };
    }
    this.processedTickIds.add(params.tickId);
    if (this.processedTickIds.size > 500) {
      const first = this.processedTickIds.values().next().value;
      if (first) this.processedTickIds.delete(first);
    }
    this.lastTickId = params.tickId;
    this.cycleSeq += 1;

    const nowIso = new Date().toISOString();
    const endedEvents: WorldMacroEventV4[] = [];
    const generatedNews: NewsItem[] = [];

    // 1. Decrement active event durations & archive expired events
    for (const ev of this.activeEvents) {
      ev.remainingCycles -= 1;
      if (ev.remainingCycles <= 0) {
        ev.active = false;
        ev.historicalOutcome = `Kết thúc sau ${ev.durationCycles} chu kỳ · GDP ${this.indicators.gdpGrowthPct.toFixed(2)}%, Lạm phát ${this.indicators.inflationPct.toFixed(2)}%, Năng lượng ${this.indicators.energyPriceIndex.toFixed(0)}.`;
        endedEvents.push({ ...ev });
        this.historicalEvents.unshift({ ...ev });
        if (this.historicalEvents.length > 40) this.historicalEvents.pop();
      }
    }
    this.activeEvents = this.activeEvents.filter((e) => e.active);

    // 2. Gentle mean-reversion so economy never explodes to Infinity or negative chaos
    this.indicators.energyPriceIndex = round2(this.indicators.energyPriceIndex + (100 - this.indicators.energyPriceIndex) * 0.12);
    this.indicators.manufacturingCostIndex = round2(this.indicators.manufacturingCostIndex + (100 - this.indicators.manufacturingCostIndex) * 0.12);
    this.indicators.householdSpendingIndex = round2(this.indicators.householdSpendingIndex + (102 - this.indicators.householdSpendingIndex) * 0.1);
    this.indicators.businessInvestmentIndex = round2(this.indicators.businessInvestmentIndex + (102 - this.indicators.businessInvestmentIndex) * 0.1);
    this.indicators.propertyDemandIndex = round2(this.indicators.propertyDemandIndex + (102 - this.indicators.propertyDemandIndex) * 0.1);

    // 3. Feedback from real in-game business activity (if businesses are profitable, investment & employment gently improve)
    if (typeof params.avgBusinessProfitMarginPct === 'number') {
      const marginSignal = clamp(params.avgBusinessProfitMarginPct / 100, -0.25, 0.25);
      this.indicators.businessInvestmentIndex = round2(
        clamp(this.indicators.businessInvestmentIndex + marginSignal * 4, 55, 145),
      );
      this.indicators.unemploymentPct = round2(
        clamp(this.indicators.unemploymentPct - marginSignal * 0.4, 2.2, 13.5),
      );
    }

    // 4. Trigger a new simulated world event on cadence or forced template
    let startedEvent: WorldMacroEventV4 | null = null;
    if (params.forceTemplateId || this.cycleSeq % V4_BALANCE_CONFIG.economicEventCadenceCycles === 0) {
      const tpl = this.pickTemplate(params.forceTemplateId);
      startedEvent = this.instantiateEvent(tpl, nowIso);
      this.applyTemplateVariablesAndChainReaction(tpl);
      this.activeEvents.unshift(startedEvent);
      if (this.activeEvents.length > 6) {
        const retired = this.activeEvents.pop();
        if (retired) {
          retired.active = false;
          retired.historicalOutcome = 'Thay thế bởi diễn biến vĩ mô mới hơn.';
          endedEvents.push(retired);
          this.historicalEvents.unshift(retired);
        }
      }
      generatedNews.push(this.createSimulatedNewsFromEvent(startedEvent, nowIso));
    }

    // 5. Evaluate economic cycle phase transition from real macro fundamentals
    this.updateEconomicCyclePhase();

    // 6. Sync base EconomyState fields so existing Banking / Property / Trading Bot engines react coherently
    params.baseEconomy.policyInterestRatePct = this.indicators.interestRatePct;
    params.baseEconomy.savingsInterestRatePct = round2(Math.max(0.5, this.indicators.interestRatePct - 0.75));
    params.baseEconomy.loanInterestRatePct = round2(this.indicators.interestRatePct + 2.75);
    params.baseEconomy.inflationRatePct = this.indicators.inflationPct;
    params.baseEconomy.gdpGrowthPct = this.indicators.gdpGrowthPct;
    params.baseEconomy.employmentRatePct = round2(100 - this.indicators.unemploymentPct);
    params.baseEconomy.consumerDemandIndex = Math.round(clamp(this.indicators.householdSpendingIndex, 60, 145));
    params.baseEconomy.economicConfidenceIndex = Math.round(clamp(this.indicators.consumerConfidenceIndex, 15, 98));
    params.baseEconomy.bankingLiquidityIndex = Math.round(clamp(this.indicators.bankingLiquidityIndex, 20, 100));
    params.baseEconomy.phase =
      this.indicators.phase === 'CRISIS' ? 'RECESSION' : this.indicators.phase;

    // 7. Release due calendar items & schedule next window
    for (const cal of this.calendar) {
      if (cal.status === 'UPCOMING' && cal.scheduledGameDay <= params.gameDay) {
        cal.status = 'RELEASED';
        cal.publicSummary = `Đã công bố (Ngày ${params.gameDay}): GDP ${this.indicators.gdpGrowthPct.toFixed(2)}% · CPI ${this.indicators.inflationPct.toFixed(2)}% · Lãi suất ${this.indicators.interestRatePct.toFixed(2)}%.`;
      }
    }
    this.rebuildUpcomingCalendar(params.gameDay);

    // 8. Record macro history snapshot
    this.indicatorHistory.push({
      cycleId: this.cycleSeq,
      gameDay: params.gameDay,
      timestamp: nowIso,
      phase: this.indicators.phase,
      gdpGrowthPct: this.indicators.gdpGrowthPct,
      inflationPct: this.indicators.inflationPct,
      interestRatePct: this.indicators.interestRatePct,
      consumerConfidenceIndex: this.indicators.consumerConfidenceIndex,
      energyPriceIndex: this.indicators.energyPriceIndex,
      propertyDemandIndex: this.indicators.propertyDemandIndex,
    });
    if (this.indicatorHistory.length > 60) this.indicatorHistory.shift();

    return { deduplicated: false, startedEvent, endedEvents, generatedNews };
  }

  private pickTemplate(forceTemplateId?: string): WorldEventTemplateV4 {
    if (forceTemplateId) {
      const found = WORLD_EVENT_TEMPLATES_V4.find((t) => t.templateId === forceTemplateId);
      if (found) return found;
    }
    const idx = Math.floor(this.nextSeededFloat() * WORLD_EVENT_TEMPLATES_V4.length);
    return WORLD_EVENT_TEMPLATES_V4[idx % WORLD_EVENT_TEMPLATES_V4.length];
  }

  private instantiateEvent(tpl: WorldEventTemplateV4, nowIso: string): WorldMacroEventV4 {
    return {
      id: `wevt_${this.cycleSeq}_${crypto.randomBytes(3).toString('hex')}`,
      templateId: tpl.templateId,
      title: tpl.title,
      description: tpl.description,
      category: tpl.category,
      affectedIndustries: [...tpl.affectedIndustries],
      affectedCities: [...tpl.affectedCities],
      startTime: nowIso,
      durationCycles: tpl.durationCycles,
      remainingCycles: tpl.durationCycles,
      severity: tpl.severity,
      variableChanges: { ...tpl.variableChanges },
      chainReaction: tpl.chainReaction.map((s) => ({ ...s })),
      recoveryCondition: tpl.recoveryCondition,
      publicAnnouncement: `[SIMULATED NEWS] ${tpl.title} — ${tpl.description}`,
      historicalOutcome: null,
      active: true,
    };
  }

  private applyTemplateVariablesAndChainReaction(tpl: WorldEventTemplateV4): void {
    const v = tpl.variableChanges;
    const cap = V4_BALANCE_CONFIG.maxChainReactionDeltaPct;

    if (v.gdpGrowthPct) this.indicators.gdpGrowthPct = round2(clamp(this.indicators.gdpGrowthPct + clamp(v.gdpGrowthPct, -2.5, 2.5), -4.5, 8.5));
    if (v.inflationPct) this.indicators.inflationPct = round2(clamp(this.indicators.inflationPct + clamp(v.inflationPct, -1.5, 1.5), 0.3, 11.5));
    if (v.interestRatePct) this.indicators.interestRatePct = round2(clamp(this.indicators.interestRatePct + clamp(v.interestRatePct, -1.25, 1.25), 1.0, 11.0));
    if (v.unemploymentPct) this.indicators.unemploymentPct = round2(clamp(this.indicators.unemploymentPct + clamp(v.unemploymentPct, -1.5, 1.5), 2.0, 14.0));
    if (v.consumerConfidenceIndex) this.indicators.consumerConfidenceIndex = round2(clamp(this.indicators.consumerConfidenceIndex + clamp(v.consumerConfidenceIndex, -cap, cap), 18, 96));
    if (v.householdSpendingIndex) this.indicators.householdSpendingIndex = round2(clamp(this.indicators.householdSpendingIndex + clamp(v.householdSpendingIndex, -cap, cap), 60, 145));
    if (v.businessInvestmentIndex) this.indicators.businessInvestmentIndex = round2(clamp(this.indicators.businessInvestmentIndex + clamp(v.businessInvestmentIndex, -cap, cap), 50, 145));
    if (v.creditGrowthPct) this.indicators.creditGrowthPct = round2(clamp(this.indicators.creditGrowthPct + clamp(v.creditGrowthPct, -3.5, 3.5), -3.0, 18.0));
    if (v.bankingLiquidityIndex) this.indicators.bankingLiquidityIndex = round2(clamp(this.indicators.bankingLiquidityIndex + clamp(v.bankingLiquidityIndex, -cap, cap), 25, 98));
    if (v.propertyDemandIndex) this.indicators.propertyDemandIndex = round2(clamp(this.indicators.propertyDemandIndex + clamp(v.propertyDemandIndex, -cap, cap), 55, 145));
    if (v.energyPriceIndex) this.indicators.energyPriceIndex = round2(clamp(this.indicators.energyPriceIndex + clamp(v.energyPriceIndex, -cap, cap), 70, 165));
    if (v.manufacturingCostIndex) this.indicators.manufacturingCostIndex = round2(clamp(this.indicators.manufacturingCostIndex + clamp(v.manufacturingCostIndex, -cap, cap), 70, 165));

    // Bounded deterministic Chain Reactions:
    // High Energy -> Manufacturing Cost pressure -> Slight Inflation -> Slight Household Spending drag
    if (this.indicators.energyPriceIndex > 118) {
      const excess = clamp((this.indicators.energyPriceIndex - 118) * 0.12, 0, 4);
      this.indicators.manufacturingCostIndex = round2(clamp(this.indicators.manufacturingCostIndex + excess, 70, 165));
      this.indicators.householdSpendingIndex = round2(clamp(this.indicators.householdSpendingIndex - excess * 0.45, 60, 145));
    }
    // High Interest Rate -> Credit & Property moderation
    if (this.indicators.interestRatePct > 6.5) {
      const rateExcess = clamp((this.indicators.interestRatePct - 6.5) * 0.8, 0, 3);
      this.indicators.propertyDemandIndex = round2(clamp(this.indicators.propertyDemandIndex - rateExcess, 55, 145));
      this.indicators.creditGrowthPct = round2(clamp(this.indicators.creditGrowthPct - rateExcess * 0.3, -3.0, 18.0));
    }
  }

  private updateEconomicCyclePhase(): void {
    const { gdpGrowthPct, consumerConfidenceIndex, bankingLiquidityIndex } = this.indicators;
    if (gdpGrowthPct <= -2.0 || bankingLiquidityIndex < 35) {
      this.indicators.phase = 'CRISIS';
    } else if (gdpGrowthPct < 0) {
      this.indicators.phase = 'RECESSION';
    } else if (gdpGrowthPct < 1.8) {
      this.indicators.phase = consumerConfidenceIndex >= 55 ? 'RECOVERY' : 'SLOWDOWN';
    } else if (gdpGrowthPct >= 4.6 && consumerConfidenceIndex >= 74) {
      this.indicators.phase = 'BOOM';
    } else {
      this.indicators.phase = 'EXPANSION';
    }
    if (!V4_PHASES.includes(this.indicators.phase)) {
      this.indicators.phase = 'EXPANSION';
    }
  }

  private createSimulatedNewsFromEvent(ev: WorldMacroEventV4, nowIso: string): NewsItem {
    const relatedSymbols: string[] = [];
    if (ev.affectedIndustries.includes('TECHNOLOGY')) relatedSymbols.push('NOVA');
    if (ev.affectedIndustries.includes('TRANSPORTATION')) relatedSymbols.push('LOGX', 'AERO');
    if (ev.affectedIndustries.includes('MANUFACTURING')) relatedSymbols.push('TITAN');
    if (ev.affectedIndustries.includes('RETAIL') || ev.affectedIndustries.includes('FNB')) relatedSymbols.push('RETL');
    if (ev.affectedIndustries.includes('FINANCE')) relatedSymbols.push('NEXB');
    if (ev.category === 'GLOBAL_ECONOMY') relatedSymbols.push('ENRG', 'BTC-SIM');

    const sentiment: NewsItem['sentiment'] =
      (ev.variableChanges.gdpGrowthPct ?? 0) > 0 || (ev.variableChanges.householdSpendingIndex ?? 0) > 0
        ? 'POSITIVE'
        : ev.severity === 'HIGH' || ev.severity === 'CRITICAL'
          ? 'NEGATIVE'
          : 'NEUTRAL';

    return {
      id: `news_v4_${crypto.randomBytes(4).toString('hex')}`,
      headline: `[SIMULATED NEWS] ${ev.title}`,
      summary: `${ev.description} Điều kiện hồi phục: ${ev.recoveryCondition}`,
      category: ev.category === 'REAL_ESTATE' ? 'PROPERTY' : 'MACRO',
      relatedSymbols: Array.from(new Set(relatedSymbols)),
      sentiment,
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: nowIso,
      eventId: ev.id,
    };
  }

  public getOverview() {
    return {
      indicators: { ...this.indicators },
      activeEvents: this.activeEvents.map((e) => ({ ...e })),
      historicalEvents: this.historicalEvents.slice(0, 15),
      calendar: this.calendar.slice(0, 18),
      indicatorHistory: this.indicatorHistory.slice(-30),
      eventLibraryCount: WORLD_EVENT_TEMPLATES_V4.length,
      lastTickId: this.lastTickId,
    };
  }

  /**
   * Runs a deterministic multi-day macroeconomic stress simulation (30, 90, 365 game days)
   * strictly on an isolated clone to validate economic stability and bounds.
   */
  public static runEconomyBalanceSimulation(daysSimulated: number, seed = 42): MacroSimulationReport {
    const sim = new WorldMacroV4Engine();
    sim.reset(seed);
    const mockBaseEconomy: EconomyState = {
      phase: 'EXPANSION',
      volatilityRegime: 'NORMAL_VOLATILITY',
      policyInterestRatePct: 4.5,
      savingsInterestRatePct: 3.75,
      loanInterestRatePct: 7.25,
      inflationRatePct: 2.5,
      employmentRatePct: 95.8,
      gdpGrowthPct: 3.4,
      consumerDemandIndex: 105,
      economicConfidenceIndex: 69,
      bankingLiquidityIndex: 82,
      totalMoneySupplyMinor: 250_000_000_00,
      totalFeeRevenueMinor: 0,
      activeEvents: [],
    };

    let inflationSum = 0;
    let marginSum = 0;
    let failureEvents = 0;
    const totalCompanies = 12;

    for (let day = 1; day <= daysSimulated; day++) {
      const res = sim.tickMacro({
        tickId: `sim_d${day}`,
        gameDay: day,
        baseEconomy: mockBaseEconomy,
        activeBusinessCount: totalCompanies,
        avgBusinessProfitMarginPct: clamp(
          11 + (sim.indicators.householdSpendingIndex - 100) * 0.25 - (sim.indicators.manufacturingCostIndex - 100) * 0.18,
          -15,
          28,
        ),
      });
      void res;
      inflationSum += sim.indicators.inflationPct;
      const cycleMargin = clamp(
        10 + (sim.indicators.householdSpendingIndex - 100) * 0.28 - (sim.indicators.energyPriceIndex - 100) * 0.15,
        -18,
        26,
      );
      marginSum += cycleMargin;
      if (cycleMargin < -4) failureEvents += 1;
    }

    const avgInflationPct = round2(inflationSum / Math.max(1, daysSimulated));
    const averageProfitMarginPct = round2(marginSum / Math.max(1, daysSimulated));
    const businessFailureRatePct = round2(clamp((failureEvents / Math.max(1, daysSimulated)) * 35, 0, 45));

    return {
      daysSimulated,
      finalPhase: sim.indicators.phase,
      finalIndicators: { ...sim.indicators },
      moneySupplyMinor: mockBaseEconomy.totalMoneySupplyMinor,
      giniProxy: round2(clamp(0.32 + Math.abs(sim.indicators.gdpGrowthPct) * 0.015, 0.22, 0.58)),
      businessFailureRatePct,
      averageProfitMarginPct,
      industryCompetitionIndex: round2(clamp(62 + (sim.indicators.businessInvestmentIndex - 100) * 0.3, 30, 95)),
      fundLiquidityRatioPct: round2(clamp(sim.indicators.bankingLiquidityIndex * 0.32, 12, 42)),
      propertyDemandIndex: sim.indicators.propertyDemandIndex,
      avgInflationPct,
      debtToEquityRatioPct: round2(clamp(28 + (sim.indicators.creditGrowthPct - 6) * 1.4, 10, 68)),
    };
  }
}
