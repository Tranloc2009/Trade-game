import crypto from 'node:crypto';
import {
  fromPriceInt,
  fromQtyInt,
  getAllowedLeveragesForContract,
  type FuturesBotArchetype,
  type FuturesBotSummary,
  type FuturesContract,
  type FuturesLeverage,
  type FuturesOrderSide,
  type FuturesTrade,
} from '../../../shared/contracts/futures';
import type { MemeNewsEvent } from '../../../shared/contracts/meme';
import { toMinor } from '../../../shared/contracts/money';
import type { AccountRole, EconomyState, NewsItem } from '../../../shared/contracts/types';
import { LedgerService } from '../ledger/LedgerService';
import { FuturesEngine } from './FuturesEngine';

export interface FuturesBotSpec {
  id: string;
  username: string;
  role: AccountRole;
  archetype: FuturesBotArchetype;
  strategyLabel: string;
  initialCapitalCR: number;
  defaultLeverage: FuturesLeverage;
  leverageLimit: FuturesLeverage;
  maxDrawdownPct: number;
  maxPositionSharePct: number;
}

export const FUTURES_AI_BOTS: FuturesBotSpec[] = [
  {
    id: 'bot_fut_cons_mm',
    username: 'Citadel Conservative MM',
    role: 'MARKET_MAKER',
    archetype: 'CONSERVATIVE_MM',
    strategyLabel: 'Tạo lập thanh khoản bảo thủ, tự giãn spread khi biến động cao',
    initialCapitalCR: 12_000_000,
    defaultLeverage: 3,
    leverageLimit: 5,
    maxDrawdownPct: 18,
    maxPositionSharePct: 10,
  },
  {
    id: 'bot_fut_aggr_mm',
    username: 'Jump Aggressive Perp MM',
    role: 'MARKET_MAKER',
    archetype: 'AGGRESSIVE_MM',
    strategyLabel: 'Tạo lập spread hẹp nhiều tầng cho Major Crypto & Liquid Meme',
    initialCapitalCR: 8_000_000,
    defaultLeverage: 5,
    leverageLimit: 10,
    maxDrawdownPct: 25,
    maxPositionSharePct: 12,
  },
  {
    id: 'bot_fut_momentum',
    username: 'Alpha Momentum Perp',
    role: 'INVESTOR_BOT',
    archetype: 'MOMENTUM_TRADER',
    strategyLabel: 'Theo xu hướng có Stop Loss / Take Profit tự động',
    initialCapitalCR: 2_500_000,
    defaultLeverage: 5,
    leverageLimit: 20,
    maxDrawdownPct: 22,
    maxPositionSharePct: 10,
  },
  {
    id: 'bot_fut_meanrev',
    username: 'Sigma Mean-Reversion Desk',
    role: 'INVESTOR_BOT',
    archetype: 'MEAN_REVERSION',
    strategyLabel: 'Giao dịch hồi quy trung bình & phản ứng ngược tin đồn Meme yếu',
    initialCapitalCR: 3_000_000,
    defaultLeverage: 5,
    leverageLimit: 10,
    maxDrawdownPct: 20,
    maxPositionSharePct: 10,
  },
  {
    id: 'bot_fut_news',
    username: 'Catalyst News Velocity Desk',
    role: 'INVESTOR_BOT',
    archetype: 'NEWS_TRADER',
    strategyLabel: 'Bám tin vĩ mô & sự kiện Meme theo cường độ/độ tin cậy',
    initialCapitalCR: 2_000_000,
    defaultLeverage: 10,
    leverageLimit: 25,
    maxDrawdownPct: 25,
    maxPositionSharePct: 10,
  },
  {
    id: 'bot_fut_liqsens',
    username: 'Vanguard Liquidity Sentinel',
    role: 'INVESTOR_BOT',
    archetype: 'LIQUIDITY_SENSITIVE',
    strategyLabel: 'Nhạy thanh khoản — tự giảm quy mô hoặc đứng ngoài khi sổ lệnh mỏng',
    initialCapitalCR: 2_500_000,
    defaultLeverage: 3,
    leverageLimit: 10,
    maxDrawdownPct: 15,
    maxPositionSharePct: 8,
  },
  {
    id: 'bot_fut_spec',
    username: 'Apex High-Beta Desk',
    role: 'INVESTOR_BOT',
    archetype: 'HIGH_BETA_SPECULATOR',
    strategyLabel: 'Đầu cơ đòn bẩy cao SOL & Meme (không miễn nhiễm thanh lý)',
    initialCapitalCR: 1_500_000,
    defaultLeverage: 10,
    leverageLimit: 50,
    maxDrawdownPct: 65,
    maxPositionSharePct: 8,
  },
  {
    id: 'bot_fut_inst_risk',
    username: 'Meridian Institutional Risk',
    role: 'INVESTOR_BOT',
    archetype: 'INSTITUTIONAL_RISK_MANAGER',
    strategyLabel: 'Basis/Funding Arb kiểm soát drawdown nghiêm ngặt (<= 12%)',
    initialCapitalCR: 4_500_000,
    defaultLeverage: 3,
    leverageLimit: 5,
    maxDrawdownPct: 12,
    maxPositionSharePct: 10,
  },
];

interface BotRuntimeState {
  peakEquityMinor: number;
  currentDrawdownPct: number;
  suspended: boolean;
  suspendedReason: string | null;
  tradesCount: number;
  lastActionNote: string;
}

/**
 * Finite-Capital AI Futures Traders (V2 — 8 Distinct Strategy Archetypes).
 *
 * Strictly enforces:
 * - Bots use the EXACT SAME `FuturesEngine.placeOrder`, `addPositionMargin`, `cancelOrder` API as human players.
 * - Bots hold finite CR wallets and HAVE ZERO PRIVILEGED LIQUIDATION IMMUNITY.
 * - Drawdown limits automatically suspend breached desks from opening new risk positions.
 * - Market Makers dynamically widen spreads & thin depth in response to `MarketRegimeEngine` states.
 * - Bots produce genuinely divergent reactions to Meme News depending on strategy & news credibility.
 */
export class FuturesBotEngine {
  private readonly ledger: LedgerService;
  private readonly futures: FuturesEngine;
  private runtimeByBot = new Map<string, BotRuntimeState>();

  constructor(ledger: LedgerService, futures: FuturesEngine) {
    this.ledger = ledger;
    this.futures = futures;
  }

  reset(): void {
    this.runtimeByBot.clear();
  }

  fundBots(): void {
    for (const bot of FUTURES_AI_BOTS) {
      if (!this.ledger.wallets.getWallet(bot.id)) {
        this.ledger.createWallet(
          bot.id,
          toMinor(bot.initialCapitalCR),
          `Cấp vốn hữu hạn ban đầu cho quỹ AI Futures ${bot.username}`,
        );
      }
      this.futures.acknowledgeRisk(bot.id);
      this.runtimeByBot.set(bot.id, {
        peakEquityMinor: toMinor(bot.initialCapitalCR),
        currentDrawdownPct: 0,
        suspended: false,
        suspendedReason: null,
        tradesCount: 0,
        lastActionNote: 'Sẵn sàng cung cấp thanh khoản & giao dịch hợp đồng vĩnh cửu',
      });
    }
  }

  /**
   * Seeds realistic initial two-sided resting Order Books across all 12 perpetual contracts
   * (Core Crypto/Equity/FX + Liquid & Emerging Meme Perps) through real `placeOrder` calls.
   */
  seedInitialOrderBooks(): void {
    const consMm = this.getBot('bot_fut_cons_mm');
    const aggrMm = this.getBot('bot_fut_aggr_mm');
    const instArb = this.getBot('bot_fut_inst_risk');

    for (const contract of this.futures.listContracts()) {
      const isEmergingMeme = contract.riskProfile === 'EMERGING_MEME';
      const isLiquidMeme = contract.riskProfile === 'LIQUID_MEME';

      // Conservative MM provides baseline liquidity on all contracts (thinner on emerging memes)
      this.quoteMarketMakerBook(consMm, contract, isEmergingMeme ? 4 : 6, 1, isEmergingMeme ? 2.4 : isLiquidMeme ? 1.5 : 1.0);

      // Aggressive MM tightens inner spread on Major/Alt Crypto & Liquid Memes
      if (!isEmergingMeme) {
        this.quoteMarketMakerBook(aggrMm, contract, isLiquidMeme ? 4 : 5, 1, isLiquidMeme ? 1.2 : 0.8);
      }

      // Institutional desk adds outer resting depth on core contracts
      if (contract.underlyingClass !== 'MEME') {
        this.quoteMarketMakerBook(instArb, contract, 2, 3, 1.4);
      }
    }

    // Seed small initial open interest across contracts so funding & OI start grounded
    // Note: HIGH_BETA_SPECULATOR opens a real leveraged Short on SOL-SIM/CR-PERP & all contracts (no liquidation immunity)
    const momentum = this.getBot('bot_fut_momentum');
    const spec = this.getBot('bot_fut_spec');
    for (const contract of this.futures.listContracts()) {
      const qty = this.baseOrderQty(contract, 1);
      const levLong = this.pickAllowedLeverage(contract, Math.min(3, momentum.leverageLimit));
      const levShort = this.pickAllowedLeverage(contract, Math.min(5, spec.leverageLimit));
      try {
        const res = this.futures.placeOrder({
          playerId: momentum.id,
          playerName: momentum.username,
          symbol: contract.symbol,
          side: 'BUY',
          type: 'MARKET',
          quantity: qty,
          leverage: levLong,
          stopLossCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 0.93),
          takeProfitCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 1.09),
        });
        this.recordBotTrades(res.trades);
        this.setActionNote(momentum.id, `Mở Long ${qty} ${contract.symbol} (${levLong}x + SL/TP)`);
      } catch {
        // Respect finite margin / liquidity
      }
      try {
        const res2 = this.futures.placeOrder({
          playerId: spec.id,
          playerName: spec.username,
          symbol: contract.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          leverage: levShort,
          stopLossCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 1.07),
        });
        this.recordBotTrades(res2.trades);
        this.setActionNote(spec.id, `Mở Short ${qty} ${contract.symbol} (${levShort}x + SL)`);
      } catch {
        // Respect finite margin / liquidity
      }
    }
  }

  /**
   * Computes current equity & drawdown for every bot and enforces automatic risk suspension
   * when equity drawdown breaches `bot.maxDrawdownPct`.
   */
  public evaluateBotDrawdowns(): void {
    for (const bot of FUTURES_AI_BOTS) {
      this.evaluateBotDrawdown(bot.id);
    }
  }

  public evaluateBotDrawdown(botId: string): BotRuntimeState | null {
    const bot = FUTURES_AI_BOTS.find((b) => b.id === botId);
    const state = this.runtimeByBot.get(botId);
    if (!bot || !state) return null;

    const wallet = this.ledger.wallets.getWallet(botId);
    if (!wallet) return state;

    const futVal = this.futures.getPlayerFuturesValuation(botId);
    const totalEquityMinor = wallet.availableMinor + wallet.lockedMinor + futVal.equityMinor;

    if (totalEquityMinor > state.peakEquityMinor) {
      state.peakEquityMinor = totalEquityMinor;
    }

    const drawdownPct =
      state.peakEquityMinor > 0
        ? Math.max(0, Number((((state.peakEquityMinor - totalEquityMinor) / state.peakEquityMinor) * 100).toFixed(2)))
        : 0;
    state.currentDrawdownPct = drawdownPct;

    if (!state.suspended && drawdownPct >= bot.maxDrawdownPct) {
      state.suspended = true;
      state.suspendedReason = `Drawdown ${drawdownPct.toFixed(1)}% vượt giới hạn rủi ro ${bot.maxDrawdownPct}%.`;
      state.lastActionNote = `Tạm dừng mở vị thế mới: ${state.suspendedReason}`;
    } else if (state.suspended && drawdownPct < bot.maxDrawdownPct * 0.65) {
      state.suspended = false;
      state.suspendedReason = null;
      state.lastActionNote = 'Phục hồi equity dưới ngưỡng drawdown — mở lại giao dịch.';
    }

    return state;
  }

  /**
   * Periodic simulation tick:
   * 1. Enforces drawdown checks & active risk management across all 8 bots.
   * 2. Refreshes regime-aware two-sided Market Maker quotes across rotated contracts.
   * 3. Executes Basis Arb, Momentum, Mean-Reversion, Liquidity-Sensitive, News & High-Beta flows.
   */
  runFuturesTick(
    economy: EconomyState,
    targetSymbol?: string,
    activeMemeNews: MemeNewsEvent[] = [],
  ): {
    trades: FuturesTrade[];
    affectedSymbols: string[];
  } {
    const trades: FuturesTrade[] = [];
    const affected = new Set<string>();

    this.evaluateBotDrawdowns();

    const contracts = targetSymbol
      ? this.futures.listContracts().filter((c) => c.symbol === targetSymbol)
      : this.futures.listContracts();

    const consMm = this.getBot('bot_fut_cons_mm');
    const aggrMm = this.getBot('bot_fut_aggr_mm');
    const momentum = this.getBot('bot_fut_momentum');
    const meanRev = this.getBot('bot_fut_meanrev');
    const newsDesk = this.getBot('bot_fut_news');
    const liqSens = this.getBot('bot_fut_liqsens');
    const spec = this.getBot('bot_fut_spec');
    const instArb = this.getBot('bot_fut_inst_risk');

    // 1. Risk & Margin Management across all 8 bots
    for (const bot of FUTURES_AI_BOTS) {
      const state = this.runtimeByBot.get(bot.id);
      const positions = this.futures.listPlayerPositions(bot.id);
      for (const pos of positions) {
        // Conservative / Institutional bots top up isolated margin when approaching Margin Call (> 72% ratio)
        // High-Beta Speculator intentionally does NOT top up margin, preserving authentic liquidation dynamics
        if (pos.marginRatioPct >= 72 && bot.archetype !== 'HIGH_BETA_SPECULATOR' && !state?.suspended) {
          const wallet = this.ledger.requireWallet(bot.id);
          const topUp = Math.min(Math.floor(pos.marginMinor * 0.35), Math.floor(wallet.availableMinor * 0.1));
          if (topUp >= 5_00) {
            try {
              this.futures.addPositionMargin(bot.id, pos.id, topUp);
              this.setActionNote(bot.id, `Bổ sung +${(topUp / 100).toFixed(0)} CR ký quỹ cho ${pos.symbol}`);
            } catch {
              // Finite capital constraint respected
            }
          }
        }

        // Suspended bots or profitable/stop-out risk controls reduce open exposure via Reduce-Only
        const shouldCloseForRisk =
          (state?.suspended && pos.unrealizedPnlMinor < 0) ||
          pos.roePct >= 14 ||
          (pos.roePct <= -18 && bot.archetype !== 'CONSERVATIVE_MM' && bot.archetype !== 'AGGRESSIVE_MM');

        if (shouldCloseForRisk) {
          try {
            const closeSide: FuturesOrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
            const res = this.futures.placeOrder({
              playerId: bot.id,
              playerName: bot.username,
              symbol: pos.symbol,
              side: closeSide,
              type: 'MARKET',
              quantity: pos.quantity,
              leverage: pos.leverage,
              reduceOnly: true,
            });
            trades.push(...res.trades);
            this.recordBotTrades(res.trades);
            affected.add(pos.symbol);
            this.setActionNote(bot.id, `Đóng ${pos.side} ${pos.symbol} (ROE ${pos.roePct.toFixed(1)}%)`);
          } catch {
            // Respect book/degraded guards
          }
        }
      }
    }

    // 2. Refresh MM quotes & run active strategy on rotated subset (3 contracts per tick for smooth throughput across 12 contracts)
    const tickBucket = Math.floor(Date.now() / 8000);
    const rotated = targetSymbol
      ? contracts
      : contracts.filter((_, idx) => (idx + tickBucket) % 4 === 0);

    for (const contract of rotated) {
      if (contract.status !== 'OPEN') continue;

      const regimeState = this.futures.regimes.getRegimeState(contract.symbol) ?? {
        symbol: contract.symbol,
        regime: 'NORMAL' as const,
        realizedVolatilityPct: 0.5,
        spreadBps: 15,
        bookDepthMinor: 500_000_00,
        recentLiquidationCount: 0,
        leverageCapMultiplier: 1,
        maxLeverageHardCap: contract.maxLeverage,
        spreadMultiplier: 1,
        depthMultiplier: 1,
        warningMessage: null,
        isManualOverride: false,
        lastTransitionAt: new Date().toISOString(),
      };
      const isEmergingMeme = contract.riskProfile === 'EMERGING_MEME';

      // Refresh Conservative MM (adapts spread & depth directly to regime!)
      if (!this.isSuspended(consMm.id)) {
        this.futures.cancelAllPlayerOrdersForSymbol(consMm.id, contract.symbol);
        const levels = Math.max(2, Math.round((isEmergingMeme ? 3 : 5) * regimeState.depthMultiplier));
        const spreadMult = (isEmergingMeme ? 2.4 : 1.0) * regimeState.spreadMultiplier;
        this.quoteMarketMakerBook(consMm, contract, levels, 1, spreadMult);
        affected.add(contract.symbol);
      }

      // Refresh Aggressive MM on non-emerging contracts (steps back during LIQUIDITY_CRISIS)
      if (!isEmergingMeme && !this.isSuspended(aggrMm.id) && regimeState.regime !== 'LIQUIDITY_CRISIS') {
        this.futures.cancelAllPlayerOrdersForSymbol(aggrMm.id, contract.symbol);
        const levels = Math.max(2, Math.round(4 * regimeState.depthMultiplier));
        this.quoteMarketMakerBook(aggrMm, contract, levels, 1, 0.85 * regimeState.spreadMultiplier);
        affected.add(contract.symbol);
      }

      // Institutional Risk Manager: Basis Arbitrage when premium/discount > 15 bps
      if (!this.isSuspended(instArb.id)) {
        const basisBps =
          contract.indexPriceInt > 0
            ? Math.round(((contract.lastPriceInt - contract.indexPriceInt) * 10_000) / contract.indexPriceInt)
            : 0;
        if (Math.abs(basisBps) >= 15) {
          const arbSide: FuturesOrderSide = basisBps > 0 ? 'SELL' : 'BUY';
          const qty = this.baseOrderQty(contract, 1);
          const lev = this.pickAllowedLeverage(contract, instArb.defaultLeverage);
          try {
            const res = this.futures.placeOrder({
              playerId: instArb.id,
              playerName: instArb.username,
              symbol: contract.symbol,
              side: arbSide,
              type: 'MARKET',
              quantity: qty,
              leverage: lev,
            });
            trades.push(...res.trades);
            this.recordBotTrades(res.trades);
            affected.add(contract.symbol);
            this.setActionNote(instArb.id, `Basis Arb ${arbSide} ${qty} ${contract.symbol} (${basisBps} bps)`);
          } catch {
            // Finite margin / risk cap respected
          }
        }
      }

      // Liquidity-Sensitive Bot: only trades when order book depth is healthy & NOT in LIQUIDITY_CRISIS
      const book = this.futures.getOrderBook(contract.symbol, 5);
      const spreadBps = book.spreadPct !== null ? Math.round(book.spreadPct * 100) : 9999;
      const bookHealthy =
        regimeState.regime !== 'LIQUIDITY_CRISIS' &&
        book.bids.length >= 2 &&
        book.asks.length >= 2 &&
        spreadBps <= 180;

      // Active Meme News signal for this contract if applicable
      const relevantNews = activeMemeNews.find(
        (n) => n.affectedMarkets.includes(contract.underlyingSpotSymbol) || n.affectedMarkets.includes(contract.symbol),
      );

      // Select directional bot
      const bullBias =
        economy.phase === 'BOOM' || economy.phase === 'EXPANSION'
          ? 0.6
          : economy.phase === 'RECESSION' || economy.phase === 'SLOWDOWN'
            ? 0.4
            : 0.5;

      const roll = crypto.randomInt(0, 100) / 100;
      let actor: FuturesBotSpec;
      let side: FuturesOrderSide;

      if (relevantNews && !this.isSuspended(newsDesk.id) && roll < 0.35) {
        actor = newsDesk;
        side = relevantNews.sentiment === 'BEARISH' ? 'SELL' : 'BUY';
      } else if (roll < 0.28) {
        actor = momentum;
        side = contract.priceChange24hPct >= 0 ? 'BUY' : 'SELL';
      } else if (roll < 0.52) {
        actor = meanRev;
        // Mean reversion fades recent price deviation
        side = contract.priceChange24hPct >= 0.4 ? 'SELL' : contract.priceChange24hPct <= -0.4 ? 'BUY' : crypto.randomInt(0, 2) === 0 ? 'BUY' : 'SELL';
      } else if (roll < 0.72 && bookHealthy) {
        actor = liqSens;
        side = crypto.randomInt(0, 100) / 100 < bullBias ? 'BUY' : 'SELL';
      } else {
        actor = spec;
        side = crypto.randomInt(0, 100) / 100 < bullBias ? 'BUY' : 'SELL';
      }

      if (this.isSuspended(actor.id)) continue;

      const sizeMult =
        actor.archetype === 'LIQUIDITY_SENSITIVE' && regimeState.regime !== 'NORMAL' ? 0.5 : 1;
      const qty = this.baseOrderQty(contract, sizeMult);
      const effectiveCap = contract.effectiveMaxLeverage ?? contract.maxLeverage;
      const targetLev =
        actor.archetype === 'HIGH_BETA_SPECULATOR'
          ? contract.underlyingClass === 'MEME'
            ? Math.min(20, effectiveCap)
            : Math.min(25, effectiveCap)
          : actor.defaultLeverage;
      const lev = this.pickAllowedLeverage(contract, Math.min(targetLev, actor.leverageLimit));

      const markMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
      const slPrice =
        side === 'BUY'
          ? this.snapPrice(contract, markMajor * 0.95)
          : this.snapPrice(contract, markMajor * 1.05);
      const tpPrice =
        side === 'BUY'
          ? this.snapPrice(contract, markMajor * 1.08)
          : this.snapPrice(contract, markMajor * 0.92);

      try {
        const res = this.futures.placeOrder({
          playerId: actor.id,
          playerName: actor.username,
          symbol: contract.symbol,
          side,
          type: 'MARKET',
          quantity: qty,
          leverage: lev,
          stopLossCR: actor.archetype !== 'HIGH_BETA_SPECULATOR' ? slPrice : undefined,
          takeProfitCR: actor.archetype === 'MOMENTUM_TRADER' ? tpPrice : undefined,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        affected.add(contract.symbol);
        this.setActionNote(actor.id, `${side === 'BUY' ? 'Long' : 'Short'} ${qty} ${contract.symbol} (${lev}x)`);
      } catch {
        // Respect insufficient margin / regime leverage caps cleanly
      }
    }

    return {
      trades,
      affectedSymbols: Array.from(affected),
    };
  }

  /**
   * Bots react to published macro/corporate/FX/meme news via real leveraged orders.
   */
  reactToNews(news: NewsItem): { trades: FuturesTrade[]; affectedSymbols: string[] } {
    const trades: FuturesTrade[] = [];
    const affected = new Set<string>();
    const newsDesk = this.getBot('bot_fut_news');
    const momentum = this.getBot('bot_fut_momentum');
    const instArb = this.getBot('bot_fut_inst_risk');

    const matchingContracts = this.futures.listContracts().filter((c) => {
      if (c.status !== 'OPEN') return false;
      if (news.relatedSymbols.includes(c.underlyingSpotSymbol)) return true;
      if (news.category === 'MEME' && c.underlyingClass === 'MEME') return true;
      if (news.category === 'CRYPTO' && c.underlyingClass === 'CRYPTO') return true;
      if (news.category === 'FOREX' && c.underlyingClass === 'FOREX') return true;
      if (news.category === 'MACRO') return true;
      return false;
    });

    const side: FuturesOrderSide = news.sentiment === 'NEGATIVE' ? 'SELL' : 'BUY';
    for (const contract of matchingContracts.slice(0, 2)) {
      const actor =
        news.category === 'MEME'
          ? newsDesk
          : news.category === 'MACRO' || news.category === 'FOREX'
            ? instArb
            : momentum;
      if (this.isSuspended(actor.id)) continue;

      const qty = this.baseOrderQty(contract, 1);
      const lev = this.pickAllowedLeverage(contract, actor.defaultLeverage);
      try {
        const res = this.futures.placeOrder({
          playerId: actor.id,
          playerName: actor.username,
          symbol: contract.symbol,
          side,
          type: 'MARKET',
          quantity: qty,
          leverage: lev,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        affected.add(contract.symbol);
        this.setActionNote(actor.id, `Phản ứng tin ${news.category}: ${side} ${qty} ${contract.symbol} (${lev}x)`);
      } catch {
        // Respect finite capital / regime constraints
      }
    }

    return { trades, affectedSymbols: Array.from(affected) };
  }

  /**
   * Produces genuinely DIVERGENT bot reactions to structured Meme News events:
   * - `NEWS_TRADER` & `HIGH_BETA_SPECULATOR`: chase the news direction (weighted by intensity).
   * - `MEAN_REVERSION`: fades low-credibility rumors (`credibility < 0.65`) in the OPPOSITE direction!
   * - `CONSERVATIVE_MM`: widens spreads on high-intensity news (`intensity >= 0.7`).
   */
  reactToMemeNews(news: MemeNewsEvent): {
    trades: FuturesTrade[];
    ordersByBot: Array<{ botId: string; archetype: FuturesBotArchetype; side: FuturesOrderSide; filledQty: number }>;
    affectedSymbols: string[];
  } {
    const trades: FuturesTrade[] = [];
    const ordersByBot: Array<{
      botId: string;
      archetype: FuturesBotArchetype;
      side: FuturesOrderSide;
      filledQty: number;
    }> = [];
    const affected = new Set<string>();

    const targetPerp = news.affectedMarkets.find((m) => m.endsWith('-PERP'));
    const perpSymbol = targetPerp ?? `${news.affectedMarkets[0]}/CR-PERP`;
    const contract = this.futures.getContract(perpSymbol);
    if (!contract || contract.status !== 'OPEN') {
      return { trades, ordersByBot, affectedSymbols: [] };
    }

    const consMm = this.getBot('bot_fut_cons_mm');
    const newsDesk = this.getBot('bot_fut_news');
    const meanRev = this.getBot('bot_fut_meanrev');
    const spec = this.getBot('bot_fut_spec');

    // Conservative MM widens quotes when high-intensity meme news hits
    if (news.intensity >= 0.65 && !this.isSuspended(consMm.id)) {
      this.futures.cancelAllPlayerOrdersForSymbol(consMm.id, contract.symbol);
      this.quoteMarketMakerBook(consMm, contract, 4, 1, 2.2 + news.intensity * 1.5);
      this.setActionNote(consMm.id, `Giãn spread bảo vệ sổ lệnh ${contract.symbol} trước tin ${news.eventType}`);
      affected.add(contract.symbol);
    }

    const newsSide: FuturesOrderSide = news.sentiment === 'BEARISH' ? 'SELL' : 'BUY';
    const fadeSide: FuturesOrderSide = newsSide === 'BUY' ? 'SELL' : 'BUY';

    // 1. News Trader enters in news direction
    if (!this.isSuspended(newsDesk.id)) {
      const qty = this.baseOrderQty(contract, Math.max(1, Math.round(news.intensity * 2)));
      const lev = this.pickAllowedLeverage(
        contract,
        Math.min(newsDesk.defaultLeverage, contract.effectiveMaxLeverage ?? contract.maxLeverage),
      );
      try {
        const res = this.futures.placeOrder({
          playerId: newsDesk.id,
          playerName: newsDesk.username,
          symbol: contract.symbol,
          side: newsSide,
          type: 'MARKET',
          quantity: qty,
          leverage: lev,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        ordersByBot.push({
          botId: newsDesk.id,
          archetype: newsDesk.archetype,
          side: newsSide,
          filledQty: res.order.filledQuantity,
        });
        this.setActionNote(
          newsDesk.id,
          `Theo tin ${news.eventType} (${news.sentiment}): ${newsSide} ${qty} ${contract.symbol}`,
        );
        affected.add(contract.symbol);
      } catch {
        // Ignore if book exhausted
      }
    }

    // 2. High-Beta Speculator chases high-intensity hype/panic
    if (news.intensity >= 0.5 && !this.isSuspended(spec.id)) {
      const qty = this.baseOrderQty(contract, 1);
      const lev = this.pickAllowedLeverage(
        contract,
        Math.min(20, contract.effectiveMaxLeverage ?? contract.maxLeverage),
      );
      try {
        const res = this.futures.placeOrder({
          playerId: spec.id,
          playerName: spec.username,
          symbol: contract.symbol,
          side: newsSide,
          type: 'MARKET',
          quantity: qty,
          leverage: lev,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        ordersByBot.push({
          botId: spec.id,
          archetype: spec.archetype,
          side: newsSide,
          filledQty: res.order.filledQuantity,
        });
        this.setActionNote(spec.id, `Đầu cơ theo sóng tin ${news.eventType}: ${newsSide} ${contract.symbol} (${lev}x)`);
        affected.add(contract.symbol);
      } catch {
        // Ignore if finite margin exhausted
      }
    }

    // 3. Mean Reversion Desk FADES low-credibility hype/rumors (divergent counterparty reaction!)
    if (news.credibility < 0.7 && !this.isSuspended(meanRev.id)) {
      const qty = this.baseOrderQty(contract, 1);
      const lev = this.pickAllowedLeverage(
        contract,
        Math.min(meanRev.defaultLeverage, contract.effectiveMaxLeverage ?? contract.maxLeverage),
      );
      try {
        const res = this.futures.placeOrder({
          playerId: meanRev.id,
          playerName: meanRev.username,
          symbol: contract.symbol,
          side: fadeSide,
          type: 'MARKET',
          quantity: qty,
          leverage: lev,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        ordersByBot.push({
          botId: meanRev.id,
          archetype: meanRev.archetype,
          side: fadeSide,
          filledQty: res.order.filledQuantity,
        });
        this.setActionNote(
          meanRev.id,
          `Đi ngược tin độ tin cậy thấp (${Math.round(news.credibility * 100)}%): ${fadeSide} ${qty} ${contract.symbol}`,
        );
        affected.add(contract.symbol);
      } catch {
        // Ignore if finite margin exhausted
      }
    }

    return {
      trades,
      ordersByBot,
      affectedSymbols: Array.from(affected),
    };
  }

  listBotSummaries(): FuturesBotSummary[] {
    const liqHistory = this.futures.listRecentLiquidations(300);
    return FUTURES_AI_BOTS.map((bot) => {
      const state = this.evaluateBotDrawdown(bot.id);
      const wallet = this.ledger.wallets.getWallet(bot.id);
      const positions = this.futures.listPlayerPositions(bot.id);
      const totalMarginMinor = positions.reduce((s, p) => s + p.marginMinor, 0);
      const totalUnrealizedPnlMinor = positions.reduce((s, p) => s + p.unrealizedPnlMinor, 0);
      const liquidationsCount = liqHistory.filter((l) => l.playerId === bot.id).length;

      return {
        id: bot.id,
        name: bot.username,
        archetype: bot.archetype,
        strategyLabel: bot.strategyLabel,
        availableCRMinor: wallet?.availableMinor ?? 0,
        openPositionsCount: positions.length,
        totalMarginMinor,
        totalUnrealizedPnlMinor,
        leverageLimit: bot.leverageLimit,
        maxDrawdownPct: bot.maxDrawdownPct,
        currentDrawdownPct: state?.currentDrawdownPct ?? 0,
        suspended: state?.suspended ?? false,
        suspendedReason: state?.suspendedReason ?? null,
        tradesCount: state?.tradesCount ?? 0,
        liquidationsCount,
        lastActionNote: state?.lastActionNote ?? 'Đang theo dõi sổ lệnh',
      };
    });
  }

  private quoteMarketMakerBook(
    bot: FuturesBotSpec,
    contract: FuturesContract,
    levels: number,
    offsetSteps = 1,
    spreadMultiplier = 1.0,
  ): void {
    const midInt = contract.markPriceInt > 0 ? contract.markPriceInt : contract.indexPriceInt;
    const baseStepTicks = Math.max(1, Math.round((midInt * 0.0012 * spreadMultiplier) / contract.priceTickInt));
    const lev = this.pickAllowedLeverage(contract, bot.defaultLeverage);

    for (let i = 0; i < levels; i++) {
      const mult = i + offsetSteps;
      const bidInt = Math.max(contract.priceTickInt, midInt - mult * baseStepTicks * contract.priceTickInt);
      const askInt = midInt + mult * baseStepTicks * contract.priceTickInt;
      const qty = this.baseOrderQty(contract, i + 2);

      try {
        this.futures.placeOrder({
          playerId: bot.id,
          playerName: bot.username,
          symbol: contract.symbol,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          priceCR: fromPriceInt(bidInt, contract.priceScale),
          quantity: qty,
          leverage: lev,
          postOnly: true,
        });
      } catch {
        // Skip if crossing or capital capped
      }

      try {
        this.futures.placeOrder({
          playerId: bot.id,
          playerName: bot.username,
          symbol: contract.symbol,
          side: 'SELL',
          type: 'LIMIT',
          timeInForce: 'GTC',
          priceCR: fromPriceInt(askInt, contract.priceScale),
          quantity: qty,
          leverage: lev,
          postOnly: true,
        });
      } catch {
        // Skip if crossing or capital capped
      }
    }
  }

  private pickAllowedLeverage(contract: FuturesContract, desired: number): FuturesLeverage {
    const allowed = getAllowedLeveragesForContract(contract.maxLeverage, contract.effectiveMaxLeverage);
    let best: FuturesLeverage = 1;
    for (const lev of allowed) {
      if (lev <= desired) best = lev;
    }
    return best;
  }

  private baseOrderQty(contract: FuturesContract, scaleFactor = 1): number {
    const priceMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
    if (priceMajor <= 0) return contract.minQty;
    // Emerging memes have thinner notional slices so thin-book slippage & cascades behave realistically
    const baseNotional =
      contract.riskProfile === 'EMERGING_MEME'
        ? 1_200
        : contract.riskProfile === 'LIQUID_MEME'
          ? 2_500
          : 4_000;
    const targetNotionalCR = baseNotional * scaleFactor;
    const rawQty = targetNotionalCR / priceMajor;
    const steps = Math.max(1, Math.round(rawQty / contract.qtyStep));
    const snappedInt = Math.min(contract.maxOrderQtyInt, Math.max(contract.minQtyInt, steps * contract.qtyStepInt));
    return fromQtyInt(snappedInt);
  }

  private snapPrice(contract: FuturesContract, rawMajor: number): number {
    const rawInt = Math.round(rawMajor * contract.priceScale);
    const snapped = Math.max(
      contract.priceTickInt,
      Math.round(rawInt / contract.priceTickInt) * contract.priceTickInt,
    );
    return fromPriceInt(snapped, contract.priceScale);
  }

  private getBot(id: string): FuturesBotSpec {
    const found = FUTURES_AI_BOTS.find((b) => b.id === id);
    if (!found) throw new Error(`Unknown futures bot ${id}`);
    return found;
  }

  private isSuspended(botId: string): boolean {
    return this.runtimeByBot.get(botId)?.suspended ?? false;
  }

  private setActionNote(botId: string, note: string): void {
    const st = this.runtimeByBot.get(botId);
    if (st) st.lastActionNote = note;
  }

  private recordBotTrades(trades: FuturesTrade[]): void {
    for (const t of trades) {
      const buyerState = this.runtimeByBot.get(t.buyerId);
      if (buyerState) buyerState.tradesCount += 1;
      const sellerState = this.runtimeByBot.get(t.sellerId);
      if (sellerState) sellerState.tradesCount += 1;
    }
  }
}
