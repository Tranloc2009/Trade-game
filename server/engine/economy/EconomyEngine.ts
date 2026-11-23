import crypto from 'node:crypto';
import type { INewsProvider } from '../../../shared/contracts/interfaces';
import type {
  Asset,
  CompanyFundamentals,
  EconomicPhase,
  EconomyEvent,
  EconomyState,
  GameClock,
  NewsItem,
  VolatilityRegime,
} from '../../../shared/contracts/types';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';

/**
 * Template-based News Provider grounded strictly in actual simulation state and metrics.
 * Never fabricates profit news when a company is unprofitable.
 * Designed as an adapter implementing INewsProvider for future Gemini/External AI news upgrades.
 */
export class SimulationNewsProvider implements INewsProvider {
  generateFromEvent(event: EconomyEvent): NewsItem {
    const sentiment: NewsItem['sentiment'] =
      event.magnitude > 0.1 ? 'POSITIVE' : event.magnitude < -0.1 ? 'NEGATIVE' : 'NEUTRAL';
    return {
      id: `news_${crypto.randomBytes(5).toString('hex')}`,
      headline: event.title,
      summary: event.description,
      category: event.affectedSectors.includes('CRYPTO') ? 'CRYPTO' : 'MACRO',
      relatedSymbols: event.affectedSectors,
      sentiment,
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: new Date().toISOString(),
      eventId: event.id,
    };
  }

  generateCorporateEarningsNews(
    symbol: string,
    companyName: string,
    fundamentals: CompanyFundamentals,
  ): NewsItem {
    const netProfitCR = fundamentals.netProfitMinor / 100;
    const revenueCR = fundamentals.revenueMinor / 100;
    const isProfitable = fundamentals.netProfitMinor > 0;
    const marginPct = fundamentals.revenueMinor > 0 ? (fundamentals.netProfitMinor / fundamentals.revenueMinor) * 100 : 0;

    return {
      id: `news_${crypto.randomBytes(5).toString('hex')}`,
      headline: isProfitable
        ? `${companyName} (${symbol}) ghi nhận lợi nhuận ròng ${(netProfitCR / 1_000_000).toFixed(2)}M CR`
        : `${companyName} (${symbol}) báo lỗ ròng ${(Math.abs(netProfitCR) / 1_000_000).toFixed(2)}M CR trong kỳ`,
      summary: isProfitable
        ? `Doanh thu mô phỏng đạt ${(revenueCR / 1_000_000).toFixed(2)}M CR với biên lợi nhuận ròng ${marginPct.toFixed(1)}%. Tiền mặt doanh nghiệp đạt ${(fundamentals.cashBalanceMinor / 100 / 1_000_000).toFixed(2)}M CR.`
        : `Áp lực chi phí vận hành khiến biên lợi nhuận âm (${marginPct.toFixed(1)}%). Xếp hạng tín nhiệm hiện ở mức ${fundamentals.creditRating}.`,
      category: 'CORPORATE',
      relatedSymbols: [symbol],
      sentiment: isProfitable ? 'POSITIVE' : 'NEGATIVE',
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: new Date().toISOString(),
    };
  }
}

interface EventTemplate {
  type: string;
  title: string;
  description: string;
  affectedSectors: string[];
  magnitude: number;
  rateDelta?: number;
  inflationDelta?: number;
  demandDelta?: number;
  volatilityTarget?: VolatilityRegime;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  {
    type: 'CENTRAL_BANK_HIKE',
    title: 'Ngân hàng Trung ương WORLD-01 nâng lãi suất điều hành thêm 0.25%',
    description:
      'Nhằm kiểm soát áp lực lạm phát, lãi suất tiết kiệm và lãi vay đều điều chỉnh tăng; thanh khoản thị trường ngắn hạn thu hẹp nhẹ.',
    affectedSectors: ['NEXB', 'Financial Services', 'Property'],
    magnitude: -0.25,
    rateDelta: 0.25,
    inflationDelta: -0.15,
    demandDelta: -3,
  },
  {
    type: 'CENTRAL_BANK_CUT',
    title: 'Ngân hàng Trung ương WORLD-01 hạ lãi suất điều hành 0.25%',
    description:
      'Chính sách nới lỏng hỗ trợ chi phí vốn doanh nghiệp và sức cầu tiêu dùng NPC trong chu kỳ kinh tế mới.',
    affectedSectors: ['NOVA', 'TITAN', 'RETL', 'BTC-SIM'],
    magnitude: 0.35,
    rateDelta: -0.25,
    inflationDelta: 0.15,
    demandDelta: 4,
  },
  {
    type: 'TECH_EARNINGS_SURGE',
    title: 'Nhóm công nghệ dẫn dắt tăng trưởng doanh thu toàn sàn ESE',
    description:
      'Nhu cầu hạ tầng điện toán và thiết bị y tế số đẩy kỳ vọng lợi nhuận các mã công nghệ tăng lên trong mô hình định giá.',
    affectedSectors: ['NOVA', 'MEDI', 'Technology'],
    magnitude: 0.45,
    demandDelta: 3,
  },
  {
    type: 'ENERGY_SURGE',
    title: 'Chi phí năng lượng khu vực công nghiệp tăng mạnh',
    description:
      'Giá điện công nghiệp và nhiên liệu tăng giúp doanh thu nhóm năng lượng mở rộng nhưng tạo áp lực chi phí lên khối sản xuất.',
    affectedSectors: ['ENRG', 'ECO-SIM', 'AERO', 'TITAN'],
    magnitude: 0.15,
    inflationDelta: 0.25,
    volatilityTarget: 'HIGH_VOLATILITY',
  },
  {
    type: 'INFRASTRUCTURE_BILL',
    title: 'Chính quyền WORLD-01 công bố gói hạ tầng giao thông ven sông và logistics',
    description:
      'Dự án mở rộng cảng tự động và tuyến ven sông cải thiện kỳ vọng dòng tiền ngành vận tải và bất động sản Riverside.',
    affectedSectors: ['LOGX', 'Riverside District', 'Industrial Zone'],
    magnitude: 0.4,
    demandDelta: 5,
  },
  {
    type: 'CONSUMER_SOFTNESS',
    title: 'Chỉ số tiêu dùng hộ gia đình NPC chững lại trong tuần mô phỏng',
    description:
      'Tâm lý thận trọng khiến tốc độ tăng trưởng bán lẻ giảm nhẹ và chênh lệch giá mua-bán mở rộng trên một số mã vốn hóa nhỏ.',
    affectedSectors: ['RETL', 'TITAN', 'Retail'],
    magnitude: -0.3,
    demandDelta: -5,
    volatilityTarget: 'NORMAL_VOLATILITY',
  },
  {
    type: 'CRYPTO_LIQUIDITY_WAVE',
    title: 'Dòng vốn mô phỏng xoay vòng mạnh sang Empire Crypto Exchange (ECX)',
    description:
      'Các quỹ đầu tư mô phỏng tăng tỷ trọng tài sản số có thanh khoản cao như BTC-SIM và ETH-SIM.',
    affectedSectors: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'CRYPTO'],
    magnitude: 0.4,
    volatilityTarget: 'HIGH_VOLATILITY',
  },
];

const CYCLE_ORDER: EconomicPhase[] = ['EXPANSION', 'BOOM', 'SLOWDOWN', 'RECESSION', 'RECOVERY'];

/**
 * Authoritative World Economy Engine:
 * - Accelerated Game Clock (1 Game Day = 2 Real Hours; starts at Day 1, 10:00 so ESE is OPEN on boot)
 * - Macro Economic Cycle & Central Bank indicators
 * - Corporate Dividend Payout (strictly bounded by company cashBalanceMinor — INVARIANT & TEST 26)
 * - Grounded Event & News generation
 */
export class EconomyEngine {
  private readonly calendarMode: 'ACCELERATED' | 'REALTIME';
  private bootRealMs: number;
  private initialGameMinutesOffset: number; // Start at Day 1, 10:00 (600 min) so ESE is open immediately
  private forceStockMarketOpenOverride: boolean | null = null;

  public state: EconomyState;
  public news: NewsItem[] = [];
  public readonly newsProvider: INewsProvider;
  private eventSeq = 0;

  constructor(calendarMode: 'ACCELERATED' | 'REALTIME' = 'ACCELERATED') {
    this.calendarMode = calendarMode;
    this.bootRealMs = Date.now();
    this.initialGameMinutesOffset = 10 * 60; // 10:00 AM Game Time
    this.newsProvider = new SimulationNewsProvider();
    this.state = this.createInitialState();
  }

  private createInitialState(): EconomyState {
    return {
      phase: 'EXPANSION',
      volatilityRegime: 'NORMAL_VOLATILITY',
      policyInterestRatePct: 4.5,
      savingsInterestRatePct: 3.75,
      loanInterestRatePct: 7.25,
      inflationRatePct: 2.4,
      employmentRatePct: 95.6,
      gdpGrowthPct: 3.1,
      consumerDemandIndex: 106,
      economicConfidenceIndex: 68,
      bankingLiquidityIndex: 82,
      totalMoneySupplyMinor: 0,
      totalFeeRevenueMinor: 0,
      activeEvents: [],
    };
  }

  reset(): void {
    this.bootRealMs = Date.now();
    this.initialGameMinutesOffset = 10 * 60;
    this.forceStockMarketOpenOverride = null;
    this.state = this.createInitialState();
    this.news = [];
    this.eventSeq = 0;
  }

  seedInitialNews(assets: Asset[]): void {
    const initialEvent: EconomyEvent = {
      id: 'evt_boot_1',
      type: 'WORLD_OPENING',
      title: 'WORLD-01: Phiên giao dịch toàn cầu mở cửa trong chu kỳ Tăng trưởng (EXPANSION)',
      description:
        'Ngân hàng Trung ương giữ lãi suất điều hành ở mức 4.50%/năm, lạm phát ổn định 2.40% và thanh khoản sàn ESE/ECX ở mức dồi dào.',
      affectedSectors: ['NOVA', 'NEXB', 'BTC-SIM'],
      magnitude: 0.2,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      active: true,
    };
    this.state.activeEvents = [initialEvent];
    this.news.unshift(this.newsProvider.generateFromEvent(initialEvent));

    // Generate authentic corporate summaries directly from actual seeded fundamentals
    for (const sym of ['NOVA', 'NEXB', 'ENRG']) {
      const asset = assets.find((a) => a.symbol === sym);
      if (asset?.fundamentals) {
        this.news.unshift(this.newsProvider.generateCorporateEarningsNews(asset.symbol, asset.name, asset.fundamentals));
      }
    }
  }

  /**
   * Computes current Game Clock (1 Game Day = 2 Real Hours in ACCELERATED mode => 12x speed).
   * Stock Market (ESE) open hours: 09:00 – 17:00 Game Time. Crypto (ECX): 24/7.
   */
  getGameClock(nowMs = Date.now()): GameClock {
    let gameDay = 1;
    let gameHour = 10;
    let gameMinute = 0;

    if (this.calendarMode === 'ACCELERATED') {
      const elapsedRealMinutes = (nowMs - this.bootRealMs) / 60_000;
      const totalGameMinutes = Math.floor(this.initialGameMinutesOffset + elapsedRealMinutes * 12);
      gameDay = Math.floor(totalGameMinutes / 1440) + 1;
      const minuteOfDay = totalGameMinutes % 1440;
      gameHour = Math.floor(minuteOfDay / 60);
      gameMinute = minuteOfDay % 60;
    } else {
      const d = new Date(nowMs);
      gameDay = d.getUTCDate();
      gameHour = d.getUTCHours();
      gameMinute = d.getUTCMinutes();
    }

    const scheduledOpen = gameHour >= 9 && gameHour < 17;
    const stockMarketOpen =
      this.forceStockMarketOpenOverride !== null ? this.forceStockMarketOpenOverride : scheduledOpen;

    let nextLabel = '';
    if (stockMarketOpen) {
      const minsUntilClose = Math.max(0, 17 * 60 - (gameHour * 60 + gameMinute));
      const realMins = Math.max(1, Math.ceil(minsUntilClose / 12));
      nextLabel = `Đóng phiên sau ~${realMins} phút thực (17:00 Giờ Game)`;
    } else {
      const minsOfDay = gameHour * 60 + gameMinute;
      const minsUntilOpen = minsOfDay < 9 * 60 ? 9 * 60 - minsOfDay : 24 * 60 - minsOfDay + 9 * 60;
      const realMins = Math.max(1, Math.ceil(minsUntilOpen / 12));
      nextLabel = `Mở phiên sau ~${realMins} phút thực (09:00 Giờ Game)`;
    }

    const hh = String(gameHour).padStart(2, '0');
    const mm = String(gameMinute).padStart(2, '0');

    return {
      mode: this.calendarMode,
      gameDay,
      gameHour,
      gameMinute,
      formattedGameTime: `Ngày ${gameDay} · ${hh}:${mm}`,
      realServerTime: new Date(nowMs).toISOString(),
      stockMarketOpen,
      nextStockMarketChangeLabel: nextLabel,
      cryptoMarketOpen: true,
    };
  }

  setStockMarketOverride(open: boolean | null): void {
    this.forceStockMarketOpenOverride = open;
  }

  syncLedgerMetrics(ledger: LedgerService): void {
    this.state.totalMoneySupplyMinor = ledger.getTotalMoneySupplyMinor();
    this.state.totalFeeRevenueMinor = ledger.getTotalFeeRevenueMinor();
  }

  /**
   * Advances macro economy tick: expires old events, occasionally triggers a new event,
   * and updates economic cycle parameters deterministically.
   */
  tickEconomy(matchingEngine: MatchingEngine): { newEvent: EconomyEvent | null; newNews: NewsItem | null } {
    const now = Date.now();
    // Deactivate expired events
    for (const ev of this.state.activeEvents) {
      if (new Date(ev.endTime).getTime() <= now) {
        ev.active = false;
      }
    }
    this.state.activeEvents = this.state.activeEvents.filter((e) => e.active);

    // Sync ESE market open/close status strictly from server clock
    const clock = this.getGameClock(now);
    matchingEngine.setMarketStatusForClass('STOCK', clock.stockMarketOpen ? 'OPEN' : 'CLOSED');

    // Trigger next structured economic event deterministically on schedule
    this.eventSeq += 1;
    const tpl = EVENT_TEMPLATES[this.eventSeq % EVENT_TEMPLATES.length];
    const event: EconomyEvent = {
      id: `evt_${this.eventSeq}_${crypto.randomBytes(3).toString('hex')}`,
      type: tpl.type,
      title: tpl.title,
      description: tpl.description,
      affectedSectors: tpl.affectedSectors,
      magnitude: tpl.magnitude,
      startTime: new Date(now).toISOString(),
      endTime: new Date(now + 10 * 60 * 1000).toISOString(),
      active: true,
    };

    // Apply macro impacts with realistic bounds
    if (tpl.rateDelta) {
      this.state.policyInterestRatePct = Number(
        Math.max(1.0, Math.min(10.0, this.state.policyInterestRatePct + tpl.rateDelta)).toFixed(2),
      );
      this.state.savingsInterestRatePct = Number(Math.max(0.5, this.state.policyInterestRatePct - 0.75).toFixed(2));
      this.state.loanInterestRatePct = Number((this.state.policyInterestRatePct + 2.75).toFixed(2));
    }
    if (tpl.inflationDelta) {
      this.state.inflationRatePct = Number(
        Math.max(0.4, Math.min(9.5, this.state.inflationRatePct + tpl.inflationDelta)).toFixed(2),
      );
    }
    if (tpl.demandDelta) {
      this.state.consumerDemandIndex = Math.max(60, Math.min(140, this.state.consumerDemandIndex + tpl.demandDelta));
    }
    if (tpl.volatilityTarget) {
      this.state.volatilityRegime = tpl.volatilityTarget;
    }

    // Rotate cycle every 4 events
    if (this.eventSeq % 4 === 0) {
      const nextIdx = (CYCLE_ORDER.indexOf(this.state.phase) + 1) % CYCLE_ORDER.length;
      this.state.phase = CYCLE_ORDER[nextIdx];
      if (this.state.phase === 'RECESSION') {
        this.state.gdpGrowthPct = -0.8;
        this.state.economicConfidenceIndex = 44;
        this.state.volatilityRegime = 'HIGH_VOLATILITY';
      } else if (this.state.phase === 'BOOM') {
        this.state.gdpGrowthPct = 4.9;
        this.state.economicConfidenceIndex = 82;
        this.state.volatilityRegime = 'NORMAL_VOLATILITY';
      } else if (this.state.phase === 'SLOWDOWN') {
        this.state.gdpGrowthPct = 1.2;
        this.state.economicConfidenceIndex = 56;
      } else {
        this.state.gdpGrowthPct = 3.0;
        this.state.economicConfidenceIndex = 67;
        this.state.volatilityRegime = 'NORMAL_VOLATILITY';
      }
    }

    this.state.activeEvents.unshift(event);
    if (this.state.activeEvents.length > 5) {
      this.state.activeEvents.pop();
    }

    const newsItem = this.newsProvider.generateFromEvent(event);
    this.news.unshift(newsItem);
    if (this.news.length > 60) {
      this.news.pop();
    }

    return { newEvent: event, newNews: newsItem };
  }

  /**
   * Distributes corporate dividends to eligible shareholders strictly capped by company cashBalanceMinor.
   * Never prints CR (TEST 26).
   */
  distributeCorporateDividend(params: {
    asset: Asset;
    shareholders: Array<{ playerId: string; shares: number }>;
    ledger: LedgerService;
  }): { paidTotalMinor: number; perSharePaidMinor: number; skippedReason?: string } {
    const fund = params.asset.fundamentals;
    if (!fund || fund.dividendPerShareMinor <= 0) {
      return { paidTotalMinor: 0, perSharePaidMinor: 0, skippedReason: 'NO_DIVIDEND_POLICY' };
    }

    const totalEligibleShares = params.shareholders.reduce((acc, s) => acc + s.shares, 0);
    if (totalEligibleShares <= 0) {
      return { paidTotalMinor: 0, perSharePaidMinor: 0, skippedReason: 'NO_SHAREHOLDERS' };
    }

    const requestedTotal = Math.round(totalEligibleShares * fund.dividendPerShareMinor);
    if (fund.cashBalanceMinor < requestedTotal) {
      return {
        paidTotalMinor: 0,
        perSharePaidMinor: 0,
        skippedReason: 'INSUFFICIENT_CORPORATE_CASH',
      };
    }

    let paidTotalMinor = 0;
    const corpAccount = `${SYSTEM_ACCOUNTS.CORPORATE_TREASURY_PREFIX}${params.asset.symbol}`;

    for (const holder of params.shareholders) {
      if (holder.shares <= 0) continue;
      const payoutMinor = Math.round(holder.shares * fund.dividendPerShareMinor);
      if (payoutMinor <= 0) continue;
      if (fund.cashBalanceMinor < payoutMinor) break;

      fund.cashBalanceMinor -= payoutMinor;
      const wallet = params.ledger.requireWallet(holder.playerId);
      wallet.availableMinor += payoutMinor;
      paidTotalMinor += payoutMinor;

      params.ledger.recordEntry({
        transactionId: `tx_div_${params.asset.symbol}_${crypto.randomBytes(4).toString('hex')}`,
        debitAccount: corpAccount,
        creditAccount: holder.playerId,
        amountMinor: payoutMinor,
        category: 'DIVIDEND',
        referenceId: `DIV-${params.asset.symbol}`,
        description: `Cổ tức ${params.asset.symbol} (${holder.shares} CP x ${(fund.dividendPerShareMinor / 100).toFixed(2)} CR)`,
      });
    }

    return {
      paidTotalMinor,
      perSharePaidMinor: fund.dividendPerShareMinor,
    };
  }
}
