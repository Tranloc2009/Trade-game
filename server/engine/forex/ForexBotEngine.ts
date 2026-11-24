import {
  ALL_CURRENCIES,
  type CurrencyCode,
  calcFxQuoteMinor,
  formatRate,
  toCurrencyMinor,
} from '../../../shared/contracts/money';
import type {
  AccountRole,
  Asset,
  CentralBankPolicyEvent,
  ForexAgentSummary,
  Trade,
} from '../../../shared/contracts/types';
import { LedgerService } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';
import { CentralBankEngine } from './CentralBankEngine';

export interface ForexAgentSpec {
  id: string;
  username: string;
  role: AccountRole;
  archetype: ForexAgentSummary['archetype'];
  strategyLabel: string;
  riskLimitPct: number; // Max fraction of available balance used on any single trade
  initialBalancesMajor: Record<CurrencyCode, number>;
}

/**
 * 5 Distinct Finite-Capital AI Forex Market Participants:
 * 1. Commercial Bank Bot
 * 2. Currency Market Maker
 * 3. Institutional FX Trader
 * 4. Speculative Trader
 * 5. Long-Term Currency Investor
 *
 * Every agent has finite per-currency balances funded transparently through LedgerService.
 * No agent can buy without sufficient quote currency or sell without sufficient base currency.
 */
export const FOREX_AI_AGENTS: ForexAgentSpec[] = [
  {
    id: 'fx_mm_alpha',
    username: 'FX Liquidity Desk Alpha',
    role: 'MARKET_MAKER',
    archetype: 'CURRENCY_MARKET_MAKER',
    strategyLabel: 'Tạo lập thanh khoản 2 chiều & kiểm soát tồn kho ngoại tệ',
    riskLimitPct: 12,
    initialBalancesMajor: {
      CR: 2_200_000,
      'USD-SIM': 2_000_000,
      'EUR-SIM': 1_800_000,
      'GBP-SIM': 1_400_000,
      'JPY-SIM': 280_000_000,
      'AUD-SIM': 2_200_000,
    },
  },
  {
    id: 'fx_comm_bank',
    username: 'Meridian Commercial Bank',
    role: 'MARKET_MAKER',
    archetype: 'COMMERCIAL_BANK',
    strategyLabel: 'Chuyển đổi dòng tiền thương mại & cân đối dự trữ liên ngân hàng',
    riskLimitPct: 8,
    initialBalancesMajor: {
      CR: 1_800_000,
      'USD-SIM': 1_500_000,
      'EUR-SIM': 1_300_000,
      'GBP-SIM': 950_000,
      'JPY-SIM': 180_000_000,
      'AUD-SIM': 1_400_000,
    },
  },
  {
    id: 'fx_inst_macro',
    username: 'Sovereign Macro FX Fund',
    role: 'INVESTOR_BOT',
    archetype: 'INSTITUTIONAL_FX',
    strategyLabel: 'Giao dịch chênh lệch lãi suất, lạm phát & rủi ro tăng trưởng NHTW',
    riskLimitPct: 6,
    initialBalancesMajor: {
      CR: 900_000,
      'USD-SIM': 850_000,
      'EUR-SIM': 750_000,
      'GBP-SIM': 550_000,
      'JPY-SIM': 110_000_000,
      'AUD-SIM': 800_000,
    },
  },
  {
    id: 'fx_spec_desk',
    username: 'Apex FX Momentum Desk',
    role: 'INVESTOR_BOT',
    archetype: 'SPECULATIVE_TRADER',
    strategyLabel: 'Bám xu hướng ngắn hạn & chốt lời ngược tin (Sell-the-Fact)',
    riskLimitPct: 5,
    initialBalancesMajor: {
      CR: 500_000,
      'USD-SIM': 450_000,
      'EUR-SIM': 400_000,
      'GBP-SIM': 300_000,
      'JPY-SIM': 65_000_000,
      'AUD-SIM': 480_000,
    },
  },
  {
    id: 'fx_lt_reserve',
    username: 'Global Reserve Allocation Trust',
    role: 'INVESTOR_BOT',
    archetype: 'LONG_TERM_INVESTOR',
    strategyLabel: 'Tái cân bằng dài hạn theo tăng trưởng GDP & niềm tin tiền tệ',
    riskLimitPct: 4,
    initialBalancesMajor: {
      CR: 1_100_000,
      'USD-SIM': 900_000,
      'EUR-SIM': 850_000,
      'GBP-SIM': 650_000,
      'JPY-SIM': 125_000_000,
      'AUD-SIM': 950_000,
    },
  },
];

export class ForexBotEngine {
  private readonly ledger: LedgerService;
  private readonly matching: MatchingEngine;
  private readonly centralBanks: CentralBankEngine;
  private tickCounter = 0;
  private tradesCountByAgent = new Map<string, number>();
  private lastActionByAgent = new Map<string, string>();

  constructor(ledger: LedgerService, matching: MatchingEngine, centralBanks: CentralBankEngine) {
    this.ledger = ledger;
    this.matching = matching;
    this.centralBanks = centralBanks;
  }

  public reset(): void {
    this.tickCounter = 0;
    this.tradesCountByAgent.clear();
    this.lastActionByAgent.clear();
  }

  public fundAgents(): void {
    for (const agent of FOREX_AI_AGENTS) {
      const crMinor = toCurrencyMinor(agent.initialBalancesMajor.CR, 'CR');
      this.ledger.createWallet(
        agent.id,
        crMinor,
        `Vốn khởi tạo ngoại hối hữu hạn cho ${agent.username}`,
      );
      for (const currency of ALL_CURRENCIES) {
        if (currency === 'CR') continue;
        const amtMajor = agent.initialBalancesMajor[currency];
        if (amtMajor > 0) {
          this.ledger.issueCurrency(
            agent.id,
            currency,
            toCurrencyMinor(amtMajor, currency),
            `FX-INIT-${agent.id}-${currency}`,
            `Cấp dự trữ hữu hạn ${amtMajor.toLocaleString('en-US')} ${currency} cho ${agent.username}`,
          );
        }
      }
      this.tradesCountByAgent.set(agent.id, 0);
      this.lastActionByAgent.set(agent.id, 'Sẵn sàng cung cấp thanh khoản & phân tích chính sách NHTW');
    }
  }

  /**
   * Computes a macro-informed fair rate anchor for a pair from Central Bank differentials
   * (used by Market Makers & Institutional bots to decide their own quotes — NEVER overwrites price directly).
   */
  private estimateMacroFairRateInt(asset: Asset): number {
    if (!asset.baseCurrency || !asset.quoteCurrency) return asset.lastPriceMinor;
    const baseBank = this.centralBanks.getCentralBank(asset.baseCurrency);
    const quoteBank = this.centralBanks.getCentralBank(asset.quoteCurrency);

    const rateDiff = baseBank.policyRatePct - quoteBank.policyRatePct;
    const realRateBase = baseBank.policyRatePct - baseBank.inflationPct;
    const realRateQuote = quoteBank.policyRatePct - quoteBank.inflationPct;
    const growthDiff = baseBank.gdpGrowthPct - quoteBank.gdpGrowthPct;
    const confDiff = (baseBank.marketConfidence - quoteBank.marketConfidence) / 100;

    // Combined macro tilt bounded conservatively within +/- 4% around reference price
    const macroTiltPct = Math.max(
      -0.04,
      Math.min(0.04, rateDiff * 0.002 + (realRateBase - realRateQuote) * 0.0025 + growthDiff * 0.003 + confDiff * 0.025),
    );
    const macroTarget = Math.round(asset.referencePriceMinor * (1 + macroTiltPct));
    // Anchor 70% on live market lastPrice + 30% on macro fair value so quotes stay continuous
    const blended = Math.round(asset.lastPriceMinor * 0.7 + macroTarget * 0.3);
    const tick = asset.priceTickMinor;
    return Math.max(tick * 5, Math.round(blended / tick) * tick);
  }

  /**
   * Populates realistic multi-level Bid/Ask order books across all 6 EFX pairs
   * strictly through MatchingEngine.placeOrder using finite agent balances.
   */
  public seedInitialOrderBooks(): void {
    const fxPairs = this.matching.listAssets('FOREX');
    const mm = FOREX_AI_AGENTS[0]; // FX Liquidity Desk Alpha
    const bank = FOREX_AI_AGENTS[1]; // Meridian Commercial Bank

    for (const pair of fxPairs) {
      this.refreshMakerQuotes(mm, pair, 4, 2);
      this.refreshMakerQuotes(bank, pair, 3, 5);
    }
  }

  private refreshMakerQuotes(agent: ForexAgentSpec, pair: Asset, levels: number, baseSpreadTicks: number): void {
    if (!pair.baseCurrency || !pair.quoteCurrency) return;
    this.matching.cancelAllPlayerOrdersForSymbol(agent.id, pair.symbol);

    const scale = pair.priceScale ?? 10_000;
    const tick = pair.priceTickMinor;
    const midInt = this.estimateMacroFairRateInt(pair);

    const quoteBal = this.ledger.getCurrencyBalance(agent.id, pair.quoteCurrency);
    const baseBal = this.ledger.getCurrencyBalance(agent.id, pair.baseCurrency);

    const maxQuotePerOrder = Math.floor((quoteBal.availableMinor * (agent.riskLimitPct / 100)) / levels);
    const baseScale = pair.baseCurrency === 'JPY-SIM' ? 1 : 100;
    const maxBaseMajorPerOrder = Math.floor(((baseBal.availableMinor / baseScale) * (agent.riskLimitPct / 100)) / levels);

    const step = pair.qtyStep;
    const targetLevelQty = 800;

    for (let i = 1; i <= levels; i++) {
      const offsetTicks = baseSpreadTicks + (i - 1) * 3;
      const bidInt = Math.max(tick, midInt - offsetTicks * tick);
      const askInt = midInt + offsetTicks * tick;

      // Bid side: strictly bounded by available quoteCurrency
      const quoteCostPerStep = Math.max(1, calcFxQuoteMinor(bidInt, scale, step, pair.quoteCurrency));
      const affordableSteps = Math.floor((maxQuotePerOrder * 0.96) / quoteCostPerStep);
      const bidQty = Math.min(targetLevelQty * i, affordableSteps * step);

      if (bidQty >= pair.minQty) {
        try {
          this.matching.placeOrder({
            playerId: agent.id,
            playerName: agent.username,
            symbol: pair.symbol,
            side: 'BUY',
            type: 'LIMIT',
            timeInForce: 'GTC',
            priceCR: bidInt / scale,
            quantity: bidQty,
          });
        } catch {
          // Respect risk/balance/price-band guards silently
        }
      }

      // Ask side: strictly bounded by available baseCurrency
      const askSteps = Math.floor(maxBaseMajorPerOrder / step);
      const askQty = Math.min(targetLevelQty * i, askSteps * step);

      if (askQty >= pair.minQty) {
        try {
          this.matching.placeOrder({
            playerId: agent.id,
            playerName: agent.username,
            symbol: pair.symbol,
            side: 'SELL',
            type: 'LIMIT',
            timeInForce: 'GTC',
            priceCR: askInt / scale,
            quantity: askQty,
          });
        } catch {
          // Respect risk/balance/price-band guards silently
        }
      }
    }
  }

  /**
   * Executes one FX market tick: refreshes maker quotes & dispatches finite-balance directional
   * orders from Institutional, Speculative, Commercial Bank, or Long-Term Investor bots.
   */
  public runForexTick(targetSymbol?: string): { trades: Trade[]; affectedSymbols: string[] } {
    this.tickCounter += 1;
    const fxPairs = this.matching.listAssets('FOREX');
    if (fxPairs.length === 0) return { trades: [], affectedSymbols: [] };

    const trades: Trade[] = [];
    const affected = new Set<string>();

    const activePair = targetSymbol
      ? fxPairs.find((p) => p.symbol === targetSymbol)
      : fxPairs[this.tickCounter % fxPairs.length];

    if (!activePair || !activePair.baseCurrency || !activePair.quoteCurrency) {
      return { trades, affectedSymbols: [] };
    }

    // Periodically refresh market makers on rotating pair
    const mm = FOREX_AI_AGENTS[this.tickCounter % 2 === 0 ? 0 : 1];
    this.refreshMakerQuotes(mm, activePair, 4, 2);
    affected.add(activePair.symbol);

    // Choose one active directional participant (Institutional / Speculative / Long-Term Investor)
    const directionalAgents = FOREX_AI_AGENTS.slice(2);
    const bot = directionalAgents[this.tickCounter % directionalAgents.length];
    const execTrades = this.executeDirectionalBotOrder(bot, activePair);
    for (const t of execTrades) {
      trades.push(t);
      affected.add(t.symbol);
    }

    return { trades, affectedSymbols: Array.from(affected) };
  }

  /**
   * Reacts to a Central Bank Monetary Policy Event!
   * IMPORTANT: A rate hike does NOT guarantee appreciation — each AI archetype weighs
   * policy rate differential against inflation pressure, GDP slowdown, confidence, and positioning
   * ("sell the fact"), placing real buy/sell orders through MatchingEngine.
   */
  public reactToPolicyEvent(event: CentralBankPolicyEvent): { trades: Trade[]; affectedSymbols: string[] } {
    const fxPairs = this.matching.listAssets('FOREX').filter(
      (p) => p.baseCurrency === event.currency || p.quoteCurrency === event.currency,
    );
    const trades: Trade[] = [];
    const affected = new Set<string>();

    const bank = this.centralBanks.getCentralBank(event.currency);

    for (const pair of fxPairs) {
      // Ensure resting liquidity exists first
      this.refreshMakerQuotes(FOREX_AI_AGENTS[0], pair, 4, 3);
      affected.add(pair.symbol);

      // Institutional Macro Fund evaluates real yield vs recession risk
      const inst = FOREX_AI_AGENTS[2];
      // Speculative Desk may momentum-chase OR fade ("sell the news") when growth slows on a hike
      const spec = FOREX_AI_AGENTS[3];
      // Commercial Bank rebalances treasury reserves
      const comm = FOREX_AI_AGENTS[1];

      const isBase = pair.baseCurrency === event.currency;

      // Macro evaluation: rate hike supports currency IF confidence & GDP hold up;
      // if hike hurts growth & confidence (stagflation risk), institutional fund can SELL the currency instead!
      const stagflationRisk = event.rateDeltaPct > 0 && bank.gdpGrowthPct < 2.2 && event.confidenceDelta < 0;
      let instBullishOnEventCurrency = event.rateDeltaPct > 0 || event.growthDeltaPct > 0.2;
      if (stagflationRisk) {
        instBullishOnEventCurrency = false;
      }

      const instSide: 'BUY' | 'SELL' = isBase
        ? instBullishOnEventCurrency
          ? 'BUY'
          : 'SELL'
        : instBullishOnEventCurrency
          ? 'SELL'
          : 'BUY';

      // Speculative desk often takes contrarian/fade flow against overcrowded moves
      const specSide: 'BUY' | 'SELL' =
        event.eventType === 'RATE_HIKE' && bank.marketConfidence < 72
          ? isBase
            ? 'SELL'
            : 'BUY'
          : instSide;

      for (const [bot, side, reason] of [
        [inst, instSide, `Phản ứng vĩ mô ${event.bankCode}: ${stagflationRisk ? 'lo ngại giảm tốc tăng trưởng dù tăng lãi suất' : 'điều chỉnh theo chênh lệch lợi suất thực'}`],
        [spec, specSide, `Chiến lược đầu cơ sau sự kiện ${event.bankCode} (${specSide} ${pair.symbol})`],
        [comm, instSide, `Cân đối dự trữ ngân hàng thương mại sau thông báo ${event.bankCode}`],
      ] as const) {
        const fills = this.placeBoundedTakerOrder(bot, pair, side, reason);
        for (const t of fills) {
          trades.push(t);
          affected.add(t.symbol);
        }
      }
    }

    return { trades, affectedSymbols: Array.from(affected) };
  }

  private executeDirectionalBotOrder(bot: ForexAgentSpec, pair: Asset): Trade[] {
    if (!pair.baseCurrency || !pair.quoteCurrency) return [];
    const fairRate = this.estimateMacroFairRateInt(pair);
    const scale = pair.priceScale ?? 10_000;
    const decimals = pair.priceDecimals ?? 4;

    let side: 'BUY' | 'SELL';
    let note: string;

    if (bot.archetype === 'INSTITUTIONAL_FX') {
      side = fairRate >= pair.lastPriceMinor ? 'BUY' : 'SELL';
      note = `Định giá vĩ mô ${formatRate(fairRate, scale, decimals)} vs khớp ${formatRate(pair.lastPriceMinor, scale, decimals)} (${pair.symbol})`;
    } else if (bot.archetype === 'SPECULATIVE_TRADER') {
      // Follow momentum unless stretched beyond 0.6%, in which case take contrarian profit
      if (pair.priceChange24hPct > 0.6) {
        side = 'SELL';
        note = `Chốt lời ngắn hạn ${pair.symbol} sau nhịp tăng +${pair.priceChange24hPct.toFixed(2)}%`;
      } else if (pair.priceChange24hPct < -0.6) {
        side = 'BUY';
        note = `Bắt nhịp hồi kỹ thuật ${pair.symbol} (${pair.priceChange24hPct.toFixed(2)}%)`;
      } else {
        side = pair.sentimentScore >= 0 ? 'BUY' : 'SELL';
        note = `Giao dịch theo động lượng dòng lệnh ${pair.symbol}`;
      }
    } else {
      // Long-Term Investor favors higher GDP growth & confidence
      const baseBank = this.centralBanks.getCentralBank(pair.baseCurrency);
      const quoteBank = this.centralBanks.getCentralBank(pair.quoteCurrency);
      const baseScore = baseBank.gdpGrowthPct * 10 + baseBank.marketConfidence;
      const quoteScore = quoteBank.gdpGrowthPct * 10 + quoteBank.marketConfidence;
      side = baseScore >= quoteScore ? 'BUY' : 'SELL';
      note = `Tái cân bằng dài hạn theo nền tảng kinh tế ${pair.baseCurrency} vs ${pair.quoteCurrency}`;
    }

    return this.placeBoundedTakerOrder(bot, pair, side, note);
  }

  private placeBoundedTakerOrder(bot: ForexAgentSpec, pair: Asset, side: 'BUY' | 'SELL', reason: string): Trade[] {
    if (!pair.baseCurrency || !pair.quoteCurrency) return [];
    const book = this.matching.getOrderBook(pair.symbol, 5);
    const scale = pair.priceScale ?? 10_000;

    if (side === 'BUY' && book.bestAskMinor !== null) {
      const quoteBal = this.ledger.getCurrencyBalance(bot.id, pair.quoteCurrency);
      const maxSpendMinor = Math.floor(quoteBal.availableMinor * (bot.riskLimitPct / 100) * 0.2);
      const costPerStep = Math.max(1, calcFxQuoteMinor(book.bestAskMinor, scale, pair.qtyStep, pair.quoteCurrency));
      const maxSteps = Math.floor((maxSpendMinor * 0.98) / costPerStep);
      const qty = Math.min(400, maxSteps * pair.qtyStep);
      if (qty < pair.minQty) {
        this.lastActionByAgent.set(bot.id, `Bỏ qua lệnh mua ${pair.symbol}: giới hạn số dư ${pair.quoteCurrency}`);
        return [];
      }
      try {
        const res = this.matching.placeOrder({
          playerId: bot.id,
          playerName: bot.username,
          symbol: pair.symbol,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'IOC',
          priceCR: book.bestAskMinor / scale,
          quantity: qty,
        });
        if (res.trades.length > 0) {
          this.tradesCountByAgent.set(bot.id, (this.tradesCountByAgent.get(bot.id) ?? 0) + res.trades.length);
          this.lastActionByAgent.set(bot.id, reason);
        }
        return res.trades;
      } catch {
        return [];
      }
    }

    if (side === 'SELL' && book.bestBidMinor !== null) {
      const baseBal = this.ledger.getCurrencyBalance(bot.id, pair.baseCurrency);
      const baseScale = pair.baseCurrency === 'JPY-SIM' ? 1 : 100;
      const availableBaseMajor = baseBal.availableMinor / baseScale;
      const maxSellMajor = availableBaseMajor * (bot.riskLimitPct / 100) * 0.2;
      const qty = Math.min(400, Math.floor(maxSellMajor / pair.qtyStep) * pair.qtyStep);
      if (qty < pair.minQty) {
        this.lastActionByAgent.set(bot.id, `Bỏ qua lệnh bán ${pair.symbol}: giới hạn số dư ${pair.baseCurrency}`);
        return [];
      }
      try {
        const res = this.matching.placeOrder({
          playerId: bot.id,
          playerName: bot.username,
          symbol: pair.symbol,
          side: 'SELL',
          type: 'LIMIT',
          timeInForce: 'IOC',
          priceCR: book.bestBidMinor / scale,
          quantity: qty,
        });
        if (res.trades.length > 0) {
          this.tradesCountByAgent.set(bot.id, (this.tradesCountByAgent.get(bot.id) ?? 0) + res.trades.length);
          this.lastActionByAgent.set(bot.id, reason);
        }
        return res.trades;
      } catch {
        return [];
      }
    }

    return [];
  }

  public listAgentSummaries(): ForexAgentSummary[] {
    return FOREX_AI_AGENTS.map((agent) => {
      const balances = {} as Record<CurrencyCode, { availableMinor: number; lockedMinor: number }>;
      for (const c of ALL_CURRENCIES) {
        const b = this.ledger.getCurrencyBalance(agent.id, c);
        balances[c] = { availableMinor: b.availableMinor, lockedMinor: b.lockedMinor };
      }
      return {
        id: agent.id,
        name: agent.username,
        archetype: agent.archetype,
        strategyLabel: agent.strategyLabel,
        riskLimitPct: agent.riskLimitPct,
        tradesCount: this.tradesCountByAgent.get(agent.id) ?? 0,
        balances,
        lastActionNote: this.lastActionByAgent.get(agent.id) ?? '',
      };
    });
  }
}
