import crypto from 'node:crypto';
import { ALL_CURRENCIES, type CurrencyCode } from '../../../shared/contracts/money';
import type {
  Asset,
  CentralBankPolicyEvent,
  CentralBankState,
  CurrencyStrengthItem,
  EconomyState,
  ForexCalendarEvent,
  NewsItem,
} from '../../../shared/contracts/types';

interface PolicyScenario {
  bankCode: string;
  currency: CurrencyCode;
  eventType: CentralBankPolicyEvent['eventType'];
  title: string;
  summary: string;
  rateDeltaPct: number;
  inflationDeltaPct: number;
  growthDeltaPct: number;
  confidenceDelta: number;
  calendarTitle: string;
}

const POLICY_SCENARIOS: PolicyScenario[] = [
  {
    bankCode: 'FEDSIM',
    currency: 'USD-SIM',
    eventType: 'RATE_HIKE',
    title: 'FedSim tăng lãi suất điều hành USD-SIM thêm +0.25%',
    summary:
      'Ủy ban tiền tệ FedSim nâng lãi suất nhằm ghìm kỳ vọng lạm phát, nhưng thừa nhận tốc độ tăng trưởng tiêu dùng có dấu hiệu chậm lại — khiến các quỹ FX phân hóa quan điểm giữa carry-trade và lo ngại tăng trưởng.',
    rateDeltaPct: 0.25,
    inflationDeltaPct: -0.15,
    growthDeltaPct: -0.25,
    confidenceDelta: -2,
    calendarTitle: 'Quyết định lãi suất FedSim (USD-SIM)',
  },
  {
    bankCode: 'ESCB',
    currency: 'EUR-SIM',
    eventType: 'RATE_HIKE',
    title: 'EuroSim Central Bank (ESCB) nâng lãi suất EUR-SIM thêm +0.25%',
    summary:
      'ESCB thắt chặt nhẹ chính sách tiền tệ khi CPI lõi khu vực Euro Sim duy trì trên mục tiêu; các ngân hàng thương mại đánh giá lại nhu cầu thanh khoản EUR-SIM.',
    rateDeltaPct: 0.25,
    inflationDeltaPct: -0.1,
    growthDeltaPct: -0.15,
    confidenceDelta: 2,
    calendarTitle: 'Quyết định lãi suất ESCB (EUR-SIM)',
  },
  {
    bankCode: 'BOBS',
    currency: 'GBP-SIM',
    eventType: 'INFLATION_REPORT',
    title: 'Báo cáo CPI Britannia Sim (GBP-SIM) cao hơn dự báo +0.30%',
    summary:
      'Áp lực chi phí dịch vụ đẩy lạm phát GBP-SIM đi lên trong khi tăng trưởng GDP vẫn mong manh, làm gia tăng biến động hai chiều trên GBP-SIM/USD-SIM.',
    rateDeltaPct: 0,
    inflationDeltaPct: 0.3,
    growthDeltaPct: -0.2,
    confidenceDelta: -4,
    calendarTitle: 'Chỉ số lạm phát CPI (GBP-SIM)',
  },
  {
    bankCode: 'BONS',
    currency: 'JPY-SIM',
    eventType: 'RATE_HIKE',
    title: 'Bank of Nippon Sim (BONS) điều chỉnh lãi suất JPY-SIM tăng +0.15%',
    summary:
      'BONS từng bước bình thường hóa chính sách tiền tệ siêu nới lỏng, kích hoạt dòng lệnh điều chỉnh vị thế carry-trade trên cặp USD-SIM/JPY-SIM.',
    rateDeltaPct: 0.15,
    inflationDeltaPct: -0.05,
    growthDeltaPct: 0.1,
    confidenceDelta: 4,
    calendarTitle: 'Họp chính sách tiền tệ BONS (JPY-SIM)',
  },
  {
    bankCode: 'RBAS',
    currency: 'AUD-SIM',
    eventType: 'GDP_RELEASE',
    title: 'GDP Australis Sim (AUD-SIM) tăng trưởng vượt kỳ vọng +0.35%',
    summary:
      'Xuất khẩu khoáng sản và đầu tư năng lượng mở rộng mạnh giúp niềm tin thị trường AUD-SIM cải thiện rõ rệt.',
    rateDeltaPct: 0,
    inflationDeltaPct: 0.1,
    growthDeltaPct: 0.35,
    confidenceDelta: 5,
    calendarTitle: 'Báo cáo tăng trưởng GDP (AUD-SIM)',
  },
  {
    bankCode: 'FEDSIM',
    currency: 'USD-SIM',
    eventType: 'RATE_CUT',
    title: 'FedSim hạ lãi suất điều hành USD-SIM -0.25% hỗ trợ thanh khoản',
    summary:
      'FedSim nới lỏng chính sách để kích thích tăng trưởng kinh tế và cải thiện điều kiện tín dụng liên ngân hàng.',
    rateDeltaPct: -0.25,
    inflationDeltaPct: 0.15,
    growthDeltaPct: 0.3,
    confidenceDelta: 4,
    calendarTitle: 'Thông báo điều chỉnh lãi suất FedSim (USD-SIM)',
  },
  {
    bankCode: 'ESCB',
    currency: 'EUR-SIM',
    eventType: 'LIQUIDITY_INJECTION',
    title: 'ESCB bơm thanh khoản tái cấp vốn cho hệ thống ngân hàng EUR-SIM',
    summary:
      'Cung tiền EUR-SIM mở rộng nhằm ổn định chi phí vay liên ngân hàng trong ngắn hạn; các nhà tạo lập thị trường điều chỉnh báo giá trên EUR-SIM/USD-SIM và EUR-SIM/CR.',
    rateDeltaPct: -0.1,
    inflationDeltaPct: 0.12,
    growthDeltaPct: 0.2,
    confidenceDelta: -1,
    calendarTitle: 'Nghiệp vụ bơm thanh khoản ESCB (EUR-SIM)',
  },
];

/**
 * Sovereign Simulated Central Banks & Monetary Policy Engine for Empire Forex Exchange (EFX).
 * Tracks Policy Rate, Inflation, Economic Growth, Currency Supply, Monetary Events, and Market Confidence.
 * Never directly modifies FX exchange rates — only updates macroeconomic indicators and emits events
 * that AI Forex Traders & human players interpret to submit real orders to the Matching Engine.
 */
export class CentralBankEngine {
  private banks = new Map<CurrencyCode, CentralBankState>();
  private calendar: ForexCalendarEvent[] = [];
  private recentPolicyEvents: CentralBankPolicyEvent[] = [];
  private scenarioSeq = 0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.banks.clear();
    this.calendar = [];
    this.recentPolicyEvents = [];
    this.scenarioSeq = 0;

    const nowIso = new Date().toISOString();
    const initialBanks: CentralBankState[] = [
      {
        code: 'ECB-W01',
        name: 'Empire Central Bank',
        currency: 'CR',
        region: 'WORLD-01 Global Economy',
        policyRatePct: 4.5,
        previousRatePct: 4.5,
        inflationPct: 2.4,
        gdpGrowthPct: 3.1,
        currencySupplyMajor: 55_000_000,
        marketConfidence: 68,
        stance: 'NEUTRAL',
        lastDecisionSummary: 'Duy trì lãi suất cơ bản WORLD-01 ổn định ở mức 4.50%.',
        lastUpdatedAt: nowIso,
      },
      {
        code: 'FEDSIM',
        name: 'Federal Monetary Reserve Sim',
        currency: 'USD-SIM',
        region: 'United States Sim',
        policyRatePct: 4.75,
        previousRatePct: 4.75,
        inflationPct: 2.6,
        gdpGrowthPct: 2.8,
        currencySupplyMajor: 50_000_000,
        marketConfidence: 74,
        stance: 'HAWKISH',
        lastDecisionSummary: 'Giữ lãi suất USD-SIM ở 4.75% và theo dõi chặt lạm phát lõi.',
        lastUpdatedAt: nowIso,
      },
      {
        code: 'ESCB',
        name: 'EuroSim Central Bank',
        currency: 'EUR-SIM',
        region: 'Eurozone Sim',
        policyRatePct: 3.75,
        previousRatePct: 3.75,
        inflationPct: 2.3,
        gdpGrowthPct: 1.9,
        currencySupplyMajor: 42_000_000,
        marketConfidence: 70,
        stance: 'NEUTRAL',
        lastDecisionSummary: 'Cân bằng giữa ổn định giá cả và hỗ trợ sản xuất công nghiệp Euro Sim.',
        lastUpdatedAt: nowIso,
      },
      {
        code: 'BOBS',
        name: 'Bank of Britannia Sim',
        currency: 'GBP-SIM',
        region: 'United Kingdom Sim',
        policyRatePct: 4.5,
        previousRatePct: 4.5,
        inflationPct: 2.9,
        gdpGrowthPct: 1.6,
        currencySupplyMajor: 28_000_000,
        marketConfidence: 67,
        stance: 'HAWKISH',
        lastDecisionSummary: 'Thận trọng trước lạm phát dịch vụ còn neo cao tại Britannia Sim.',
        lastUpdatedAt: nowIso,
      },
      {
        code: 'BONS',
        name: 'Bank of Nippon Sim',
        currency: 'JPY-SIM',
        region: 'Japan Sim',
        policyRatePct: 0.5,
        previousRatePct: 0.5,
        inflationPct: 1.8,
        gdpGrowthPct: 1.4,
        currencySupplyMajor: 6_500_000_000,
        marketConfidence: 72,
        stance: 'DOVISH',
        lastDecisionSummary: 'Duy trì môi trường lãi suất thấp hỗ trợ xuất khẩu và phục hồi tiêu dùng.',
        lastUpdatedAt: nowIso,
      },
      {
        code: 'RBAS',
        name: 'Reserve Bank of Australis Sim',
        currency: 'AUD-SIM',
        region: 'Australia Sim',
        policyRatePct: 4.1,
        previousRatePct: 4.1,
        inflationPct: 2.7,
        gdpGrowthPct: 2.4,
        currencySupplyMajor: 35_000_000,
        marketConfidence: 71,
        stance: 'NEUTRAL',
        lastDecisionSummary: 'Ổn định lãi suất AUD-SIM nhờ dòng vốn xuất khẩu tài nguyên tích cực.',
        lastUpdatedAt: nowIso,
      },
    ];

    for (const b of initialBanks) {
      this.banks.set(b.currency, b);
    }

    this.calendar = [
      {
        id: 'cal_1',
        currency: 'USD-SIM',
        bankCode: 'FEDSIM',
        title: 'Quyết định lãi suất FedSim (USD-SIM)',
        impact: 'HIGH',
        scheduledGameDay: 1,
        scheduledTimeLabel: 'Ngày 1 · 14:00',
        previousValue: '4.75%',
        forecastValue: '5.00%',
        actualValue: null,
        status: 'UPCOMING',
      },
      {
        id: 'cal_2',
        currency: 'EUR-SIM',
        bankCode: 'ESCB',
        title: 'Họp chính sách tiền tệ ESCB (EUR-SIM)',
        impact: 'HIGH',
        scheduledGameDay: 1,
        scheduledTimeLabel: 'Ngày 1 · 16:00',
        previousValue: '3.75%',
        forecastValue: '4.00%',
        actualValue: null,
        status: 'UPCOMING',
      },
      {
        id: 'cal_3',
        currency: 'GBP-SIM',
        bankCode: 'BOBS',
        title: 'Chỉ số lạm phát CPI Britannia Sim',
        impact: 'HIGH',
        scheduledGameDay: 2,
        scheduledTimeLabel: 'Ngày 2 · 09:30',
        previousValue: '2.90%',
        forecastValue: '3.05%',
        actualValue: null,
        status: 'UPCOMING',
      },
      {
        id: 'cal_4',
        currency: 'JPY-SIM',
        bankCode: 'BONS',
        title: 'Định hướng lãi suất Bank of Nippon Sim',
        impact: 'HIGH',
        scheduledGameDay: 2,
        scheduledTimeLabel: 'Ngày 2 · 11:00',
        previousValue: '0.50%',
        forecastValue: '0.65%',
        actualValue: null,
        status: 'UPCOMING',
      },
      {
        id: 'cal_5',
        currency: 'AUD-SIM',
        bankCode: 'RBAS',
        title: 'Báo cáo GDP Australis Sim',
        impact: 'MEDIUM',
        scheduledGameDay: 2,
        scheduledTimeLabel: 'Ngày 2 · 13:30',
        previousValue: '2.40%',
        forecastValue: '2.60%',
        actualValue: null,
        status: 'UPCOMING',
      },
    ];
  }

  public syncEmpireCentralBank(economy: EconomyState, totalCRSupplyMinor: number): void {
    const crBank = this.banks.get('CR');
    if (!crBank) return;
    crBank.previousRatePct = crBank.policyRatePct;
    crBank.policyRatePct = economy.policyInterestRatePct;
    crBank.inflationPct = economy.inflationRatePct;
    crBank.gdpGrowthPct = economy.gdpGrowthPct;
    crBank.marketConfidence = economy.economicConfidenceIndex;
    crBank.currencySupplyMajor = Math.round(totalCRSupplyMinor / 100);
    crBank.stance =
      economy.policyInterestRatePct > 5.0
        ? 'HAWKISH'
        : economy.policyInterestRatePct < 3.75
          ? 'DOVISH'
          : 'NEUTRAL';
  }

  public listCentralBanks(): CentralBankState[] {
    return ALL_CURRENCIES.map((c) => ({ ...this.banks.get(c)! }));
  }

  public getCentralBank(currency: CurrencyCode): CentralBankState {
    return { ...this.banks.get(currency)! };
  }

  public listCalendar(): ForexCalendarEvent[] {
    return this.calendar.map((c) => ({ ...c }));
  }

  public listRecentPolicyEvents(limit = 15): CentralBankPolicyEvent[] {
    return this.recentPolicyEvents.slice(0, limit).map((e) => ({ ...e }));
  }

  /**
   * Executes the next simulated Central Bank policy decision or macro data release.
   * Updates only Central Bank macro indicators & calendar/news — never touches market prices directly.
   */
  public triggerPolicyEvent(targetCurrency?: CurrencyCode, gameDay = 1): {
    policyEvent: CentralBankPolicyEvent;
    newsItem: NewsItem;
    updatedBank: CentralBankState;
  } {
    let scenario: PolicyScenario;
    if (targetCurrency) {
      const matching = POLICY_SCENARIOS.filter((s) => s.currency === targetCurrency);
      scenario = matching[this.scenarioSeq % Math.max(1, matching.length)] ?? POLICY_SCENARIOS[0];
    } else {
      scenario = POLICY_SCENARIOS[this.scenarioSeq % POLICY_SCENARIOS.length];
    }
    this.scenarioSeq += 1;

    const bank = this.banks.get(scenario.currency)!;
    const nowIso = new Date().toISOString();

    bank.previousRatePct = bank.policyRatePct;
    bank.policyRatePct = Number(Math.max(0.1, Math.min(12.0, bank.policyRatePct + scenario.rateDeltaPct)).toFixed(2));
    bank.inflationPct = Number(Math.max(0.2, Math.min(10.0, bank.inflationPct + scenario.inflationDeltaPct)).toFixed(2));
    bank.gdpGrowthPct = Number(Math.max(-3.0, Math.min(7.5, bank.gdpGrowthPct + scenario.growthDeltaPct)).toFixed(2));
    bank.marketConfidence = Math.max(20, Math.min(95, Math.round(bank.marketConfidence + scenario.confidenceDelta)));

    if (scenario.eventType === 'LIQUIDITY_INJECTION') {
      bank.currencySupplyMajor = Math.round(bank.currencySupplyMajor * 1.015);
    }

    bank.stance =
      scenario.rateDeltaPct > 0 || bank.policyRatePct >= 4.75
        ? 'HAWKISH'
        : scenario.rateDeltaPct < 0 || bank.policyRatePct <= 1.0
          ? 'DOVISH'
          : 'NEUTRAL';
    bank.lastDecisionSummary = scenario.title;
    bank.lastUpdatedAt = nowIso;

    const policyEvent: CentralBankPolicyEvent = {
      id: `cb_evt_${this.scenarioSeq}_${crypto.randomBytes(3).toString('hex')}`,
      bankCode: bank.code,
      currency: bank.currency,
      eventType: scenario.eventType,
      title: scenario.title,
      summary: scenario.summary,
      rateDeltaPct: scenario.rateDeltaPct,
      inflationDeltaPct: scenario.inflationDeltaPct,
      growthDeltaPct: scenario.growthDeltaPct,
      confidenceDelta: scenario.confidenceDelta,
      publishedAt: nowIso,
    };

    this.recentPolicyEvents.unshift(policyEvent);
    if (this.recentPolicyEvents.length > 25) this.recentPolicyEvents.pop();

    // Update or append economic calendar release
    const actualDisplay =
      scenario.eventType === 'INFLATION_REPORT'
        ? `${bank.inflationPct.toFixed(2)}%`
        : scenario.eventType === 'GDP_RELEASE'
          ? `${bank.gdpGrowthPct.toFixed(2)}%`
          : `${bank.policyRatePct.toFixed(2)}%`;

    const upcoming = this.calendar.find((c) => c.currency === bank.currency && c.status === 'UPCOMING');
    if (upcoming) {
      upcoming.status = 'RELEASED';
      upcoming.actualValue = actualDisplay;
    } else {
      this.calendar.unshift({
        id: `cal_rel_${this.scenarioSeq}`,
        currency: bank.currency,
        bankCode: bank.code,
        title: scenario.calendarTitle,
        impact: 'HIGH',
        scheduledGameDay: gameDay,
        scheduledTimeLabel: `Ngày ${gameDay} · Vừa công bố`,
        previousValue: `${bank.previousRatePct.toFixed(2)}%`,
        forecastValue: actualDisplay,
        actualValue: actualDisplay,
        status: 'RELEASED',
      });
    }

    // Keep upcoming calendar populated so traders always see scheduled events
    if (this.calendar.filter((c) => c.status === 'UPCOMING').length < 3) {
      const nextScenario = POLICY_SCENARIOS[(this.scenarioSeq + 2) % POLICY_SCENARIOS.length];
      const nextBank = this.banks.get(nextScenario.currency)!;
      this.calendar.push({
        id: `cal_next_${this.scenarioSeq}_${crypto.randomBytes(2).toString('hex')}`,
        currency: nextBank.currency,
        bankCode: nextBank.code,
        title: nextScenario.calendarTitle,
        impact: 'HIGH',
        scheduledGameDay: gameDay + 1,
        scheduledTimeLabel: `Ngày ${gameDay + 1} · Sắp công bố`,
        previousValue: `${nextBank.policyRatePct.toFixed(2)}%`,
        forecastValue: `${(nextBank.policyRatePct + nextScenario.rateDeltaPct).toFixed(2)}%`,
        actualValue: null,
        status: 'UPCOMING',
      });
    }
    if (this.calendar.length > 14) {
      this.calendar = this.calendar.slice(-14);
    }

    // Map related FX symbols for grounded news
    const relatedSymbols = [
      'EUR-SIM/USD-SIM',
      'GBP-SIM/USD-SIM',
      'USD-SIM/JPY-SIM',
      'AUD-SIM/USD-SIM',
      'USD-SIM/CR',
      'EUR-SIM/CR',
    ].filter((sym) => sym.includes(bank.currency));

    const newsItem: NewsItem = {
      id: `news_fx_${crypto.randomBytes(5).toString('hex')}`,
      headline: `[${bank.code}] ${scenario.title}`,
      summary: `${scenario.summary} (Lãi suất: ${bank.policyRatePct.toFixed(2)}% · Lạm phát: ${bank.inflationPct.toFixed(2)}% · GDP: ${bank.gdpGrowthPct.toFixed(2)}% · Niềm tin: ${bank.marketConfidence}/100).`,
      category: 'FOREX',
      relatedSymbols,
      sentiment:
        scenario.confidenceDelta > 1 ? 'POSITIVE' : scenario.confidenceDelta < -1 ? 'NEGATIVE' : 'NEUTRAL',
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: nowIso,
      eventId: policyEvent.id,
    };

    return {
      policyEvent,
      newsItem,
      updatedBank: { ...bank },
    };
  }

  /**
   * Computes mark-to-market conversion rate of 1 major unit of each currency into CR,
   * strictly derived from live matched FX pair lastPriceMinor on the central Matching Engine.
   */
  public computeRatesToCR(fxPairs: Asset[]): Record<CurrencyCode, number> {
    const rateOf = (sym: string, fallback: number): number => {
      const a = fxPairs.find((p) => p.symbol === sym);
      if (!a) return fallback;
      const scale = a.priceScale ?? 10_000;
      return a.lastPriceMinor / scale;
    };

    const usdToCr = rateOf('USD-SIM/CR', 1.0);
    const eurToCr = rateOf('EUR-SIM/CR', 1.084);
    const gbpToUsd = rateOf('GBP-SIM/USD-SIM', 1.268);
    const usdToJpy = rateOf('USD-SIM/JPY-SIM', 149.2);
    const audToUsd = rateOf('AUD-SIM/USD-SIM', 0.662);

    return {
      CR: 1.0,
      'USD-SIM': Number(usdToCr.toFixed(6)),
      'EUR-SIM': Number(eurToCr.toFixed(6)),
      'GBP-SIM': Number((gbpToUsd * usdToCr).toFixed(6)),
      'JPY-SIM': Number((usdToJpy > 0 ? usdToCr / usdToJpy : 0.0067).toFixed(6)),
      'AUD-SIM': Number((audToUsd * usdToCr).toFixed(6)),
    };
  }

  /**
   * Computes Currency Strength Index (0..100) from real matched 24h percentage changes across all 6 EFX pairs.
   */
  public computeCurrencyStrength(fxPairs: Asset[]): CurrencyStrengthItem[] {
    const deltaAccum: Record<CurrencyCode, { sum: number; count: number }> = {
      CR: { sum: 0, count: 0 },
      'USD-SIM': { sum: 0, count: 0 },
      'EUR-SIM': { sum: 0, count: 0 },
      'GBP-SIM': { sum: 0, count: 0 },
      'JPY-SIM': { sum: 0, count: 0 },
      'AUD-SIM': { sum: 0, count: 0 },
    };

    for (const pair of fxPairs) {
      if (!pair.baseCurrency || !pair.quoteCurrency) continue;
      const pct = pair.priceChange24hPct;
      deltaAccum[pair.baseCurrency].sum += pct;
      deltaAccum[pair.baseCurrency].count += 1;
      deltaAccum[pair.quoteCurrency].sum -= pct;
      deltaAccum[pair.quoteCurrency].count += 1;
    }

    const ratesToCR = this.computeRatesToCR(fxPairs);

    return ALL_CURRENCIES.map((currency) => {
      const bank = this.banks.get(currency)!;
      const entry = deltaAccum[currency];
      const avgPct = entry.count > 0 ? entry.sum / entry.count : 0;
      // Map relative 24h FX return (-2% .. +2%) + subtle confidence anchor into a clean 0..100 strength score
      const rawScore = 50 + avgPct * 18 + (bank.marketConfidence - 68) * 0.25;
      const score = Math.max(5, Math.min(95, Math.round(rawScore)));
      return {
        currency,
        score,
        change24hPct: Number(avgPct.toFixed(3)),
        policyRatePct: bank.policyRatePct,
        rateVsCR: ratesToCR[currency],
      };
    }).sort((a, b) => b.score - a.score);
  }
}
