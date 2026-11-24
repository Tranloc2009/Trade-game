import crypto from 'node:crypto';
import {
  fromPriceInt,
  fromQtyInt,
  type FuturesBotSummary,
  type FuturesContract,
  type FuturesLeverage,
  type FuturesOrderSide,
  type FuturesTrade,
} from '../../../shared/contracts/futures';
import { toMinor } from '../../../shared/contracts/money';
import type { AccountRole, EconomyState, NewsItem } from '../../../shared/contracts/types';
import { LedgerService } from '../ledger/LedgerService';
import { FuturesEngine } from './FuturesEngine';

export interface FuturesBotSpec {
  id: string;
  username: string;
  role: AccountRole;
  archetype: FuturesBotSummary['archetype'];
  strategyLabel: string;
  initialCapitalCR: number;
  defaultLeverage: FuturesLeverage;
  maxPositionSharePct: number; // Max % of own capital committed to one position
}

export const FUTURES_AI_BOTS: FuturesBotSpec[] = [
  {
    id: 'fut_mm_citadel',
    username: 'Citadel Perp MM',
    role: 'MARKET_MAKER',
    archetype: 'PERP_MARKET_MAKER',
    strategyLabel: 'Tạo lập thanh khoản 2 chiều quanh Mark/Index',
    initialCapitalCR: 10_000_000,
    defaultLeverage: 3,
    maxPositionSharePct: 12,
  },
  {
    id: 'fut_arb_basis',
    username: 'Basis Arbitrage Desk',
    role: 'INVESTOR_BOT',
    archetype: 'BASIS_ARBITRAGE',
    strategyLabel: 'Kinh doanh chênh lệch Basis & Funding Rate',
    initialCapitalCR: 4_000_000,
    defaultLeverage: 3,
    maxPositionSharePct: 10,
  },
  {
    id: 'fut_trend_alpha',
    username: 'Alpha Momentum Perp',
    role: 'INVESTOR_BOT',
    archetype: 'TREND_MOMENTUM',
    strategyLabel: 'Theo xu hướng có Stop Loss / Take Profit tự động',
    initialCapitalCR: 2_500_000,
    defaultLeverage: 5,
    maxPositionSharePct: 10,
  },
  {
    id: 'fut_hedge_macro',
    username: 'Macro Risk Hedger',
    role: 'INVESTOR_BOT',
    archetype: 'MACRO_HEDGER',
    strategyLabel: 'Phòng hộ rủi ro tin vĩ mô & biến động lãi suất',
    initialCapitalCR: 3_000_000,
    defaultLeverage: 2,
    maxPositionSharePct: 10,
  },
  {
    id: 'fut_spec_vol',
    username: 'Apex High-Beta Desk',
    role: 'INVESTOR_BOT',
    archetype: 'HIGH_BETA_SPECULATOR',
    strategyLabel: 'Đầu cơ đòn bẩy 5x–10x (không miễn nhiễm thanh lý)',
    initialCapitalCR: 1_500_000,
    defaultLeverage: 10,
    maxPositionSharePct: 8,
  },
];

/**
 * Finite-Capital AI Futures Traders.
 *
 * Strictly enforces:
 * - Bots use the EXACT SAME `FuturesEngine.placeOrder`, `addPositionMargin`, `cancelOrder` API as human players.
 * - Bots hold finite CR wallets and HAVE ZERO PRIVILEGED LIQUIDATION IMMUNITY.
 * - Bots open Long/Short, place Stop Loss/Take Profit, add isolated margin when approaching Margin Call,
 *   and react to economy/news events.
 */
export class FuturesBotEngine {
  private readonly ledger: LedgerService;
  private readonly futures: FuturesEngine;
  private lastActionByBot = new Map<string, string>();
  private tradesCountByBot = new Map<string, number>();

  constructor(ledger: LedgerService, futures: FuturesEngine) {
    this.ledger = ledger;
    this.futures = futures;
  }

  reset(): void {
    this.lastActionByBot.clear();
    this.tradesCountByBot.clear();
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
      // Bots explicitly acknowledge Futures risk disclosure via the exact same API as players
      this.futures.acknowledgeRisk(bot.id);
      this.lastActionByBot.set(bot.id, 'Sẵn sàng cung cấp thanh khoản & giao dịch hợp đồng vĩnh cửu');
      this.tradesCountByBot.set(bot.id, 0);
    }
  }

  /**
   * Seeds realistic initial two-sided resting Order Books across all 6 perpetual contracts
   * through real `placeOrder` calls (strictly bounded by finite bot CR balances).
   */
  seedInitialOrderBooks(): void {
    const mm = FUTURES_AI_BOTS[0];
    const arb = FUTURES_AI_BOTS[1];

    for (const contract of this.futures.listContracts()) {
      this.quoteMarketMakerBook(mm, contract, 6);
      this.quoteMarketMakerBook(arb, contract, 3, 2);
    }

    // Seed small initial open interest across contracts so funding & OI start grounded
    const trend = FUTURES_AI_BOTS[2];
    const spec = FUTURES_AI_BOTS[4];
    for (const contract of this.futures.listContracts()) {
      const qty = this.baseOrderQty(contract, 1);
      try {
        const res = this.futures.placeOrder({
          playerId: trend.id,
          playerName: trend.username,
          symbol: contract.symbol,
          side: 'BUY',
          type: 'MARKET',
          quantity: qty,
          leverage: 3,
          stopLossCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 0.94),
          takeProfitCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 1.08),
        });
        this.recordBotTrades(res.trades);
        this.lastActionByBot.set(trend.id, `Mở Long ${qty} ${contract.symbol} (3x + SL/TP)`);
      } catch {
        // Skip if insufficient liquidity
      }
      try {
        const res2 = this.futures.placeOrder({
          playerId: spec.id,
          playerName: spec.username,
          symbol: contract.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          leverage: 5,
          stopLossCR: this.snapPrice(contract, fromPriceInt(contract.markPriceInt, contract.priceScale) * 1.06),
        });
        this.recordBotTrades(res2.trades);
        this.lastActionByBot.set(spec.id, `Mở Short ${qty} ${contract.symbol} (5x + SL)`);
      } catch {
        // Skip safely
      }
    }
  }

  /**
   * Periodic simulation tick: refreshes two-sided liquidity, manages open bot risk/margin,
   * executes basis arbitrage & momentum trades, and reacts to economy phase.
   */
  runFuturesTick(economy: EconomyState, targetSymbol?: string): {
    trades: FuturesTrade[];
    affectedSymbols: string[];
  } {
    const trades: FuturesTrade[] = [];
    const affected = new Set<string>();

    const contracts = targetSymbol
      ? this.futures.listContracts().filter((c) => c.symbol === targetSymbol)
      : this.futures.listContracts();

    const mm = FUTURES_AI_BOTS[0];
    const arb = FUTURES_AI_BOTS[1];
    const trend = FUTURES_AI_BOTS[2];
    const hedger = FUTURES_AI_BOTS[3];
    const spec = FUTURES_AI_BOTS[4];

    // 1. Risk & Margin Management across all bots (top-up margin or close losing positions)
    for (const bot of FUTURES_AI_BOTS) {
      const positions = this.futures.listPlayerPositions(bot.id);
      for (const pos of positions) {
        // If approaching Margin Call (> 72% ratio), conservative bots add margin from their finite wallet
        if (pos.marginRatioPct >= 72 && bot.archetype !== 'HIGH_BETA_SPECULATOR') {
          const wallet = this.ledger.requireWallet(bot.id);
          const topUp = Math.min(Math.floor(pos.marginMinor * 0.35), Math.floor(wallet.availableMinor * 0.1));
          if (topUp >= 5_00) {
            try {
              this.futures.addPositionMargin(bot.id, pos.id, topUp);
              this.lastActionByBot.set(bot.id, `Bổ sung +${(topUp / 100).toFixed(0)} CR ký quỹ cho ${pos.symbol}`);
            } catch {
              // Finite capital constraint respected
            }
          }
        }
        // Take profit / reduce risk if ROE > +12% or < -18%
        if (pos.roePct >= 12 || (pos.roePct <= -18 && bot.archetype !== 'PERP_MARKET_MAKER')) {
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
            this.lastActionByBot.set(bot.id, `Đóng ${pos.side} ${pos.symbol} (ROE ${pos.roePct.toFixed(1)}%)`);
          } catch {
            // Ignore if book empty or degraded
          }
        }
      }
    }

    // 2. Refresh MM quotes & run active strategy on 2 contracts per tick
    const rotated = targetSymbol
      ? contracts
      : contracts.filter((_, idx) => (idx + Math.floor(Date.now() / 8000)) % 2 === 0);

    for (const contract of rotated) {
      if (contract.status !== 'OPEN') continue;

      // Refresh MM quotes cleanly
      this.futures.cancelAllPlayerOrdersForSymbol(mm.id, contract.symbol);
      this.quoteMarketMakerBook(mm, contract, 5);
      affected.add(contract.symbol);

      // Basis Arbitrage Desk: trades futures back toward Spot Index when premium/discount > 15 bps
      const basisBps =
        contract.indexPriceInt > 0
          ? Math.round(((contract.lastPriceInt - contract.indexPriceInt) * 10_000) / contract.indexPriceInt)
          : 0;
      if (Math.abs(basisBps) >= 15) {
        const arbSide: FuturesOrderSide = basisBps > 0 ? 'SELL' : 'BUY';
        const qty = this.baseOrderQty(contract, 1);
        try {
          const res = this.futures.placeOrder({
            playerId: arb.id,
            playerName: arb.username,
            symbol: contract.symbol,
            side: arbSide,
            type: 'MARKET',
            quantity: qty,
            leverage: arb.defaultLeverage,
          });
          trades.push(...res.trades);
          this.recordBotTrades(res.trades);
          affected.add(contract.symbol);
          this.lastActionByBot.set(arb.id, `Basis Arb ${arbSide} ${qty} ${contract.symbol} (basis ${basisBps} bps)`);
        } catch {
          // Finite margin or liquidity guard
        }
      }

      // Momentum / Macro / Speculator directional flow grounded in Economy Phase & Spot drift
      const bullBias =
        economy.phase === 'BOOM' || economy.phase === 'EXPANSION'
          ? 0.62
          : economy.phase === 'RECESSION' || economy.phase === 'SLOWDOWN'
            ? 0.38
            : 0.5;
      const roll = crypto.randomInt(0, 100) / 100;
      const actor = roll < 0.36 ? trend : roll < 0.68 ? hedger : spec;
      const side: FuturesOrderSide = crypto.randomInt(0, 100) / 100 < bullBias ? 'BUY' : 'SELL';
      const qty = this.baseOrderQty(contract, 1);
      const markMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
      const slPrice =
        side === 'BUY'
          ? this.snapPrice(contract, markMajor * 0.95)
          : this.snapPrice(contract, markMajor * 1.05);
      const tpPrice =
        side === 'BUY'
          ? this.snapPrice(contract, markMajor * 1.07)
          : this.snapPrice(contract, markMajor * 0.93);

      try {
        const res = this.futures.placeOrder({
          playerId: actor.id,
          playerName: actor.username,
          symbol: contract.symbol,
          side,
          type: 'MARKET',
          quantity: qty,
          leverage: actor.defaultLeverage,
          stopLossCR: actor.archetype !== 'HIGH_BETA_SPECULATOR' ? slPrice : undefined,
          takeProfitCR: actor.archetype === 'TREND_MOMENTUM' ? tpPrice : undefined,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        affected.add(contract.symbol);
        this.lastActionByBot.set(actor.id, `${side === 'BUY' ? 'Long' : 'Short'} ${qty} ${contract.symbol} (${actor.defaultLeverage}x)`);
      } catch {
        // Respect insufficient margin / risk tiers cleanly
      }
    }

    return {
      trades,
      affectedSymbols: Array.from(affected),
    };
  }

  /**
   * Bots react to published macro/corporate/FX news by placing real leveraged orders via FuturesEngine.
   */
  reactToNews(news: NewsItem): { trades: FuturesTrade[]; affectedSymbols: string[] } {
    const trades: FuturesTrade[] = [];
    const affected = new Set<string>();
    const hedger = FUTURES_AI_BOTS[3];
    const trend = FUTURES_AI_BOTS[2];

    const matchingContracts = this.futures.listContracts().filter((c) => {
      if (c.status !== 'OPEN') return false;
      if (news.relatedSymbols.includes(c.underlyingSpotSymbol)) return true;
      if (news.category === 'CRYPTO' && c.underlyingMarketClass === 'CRYPTO') return true;
      if (news.category === 'FOREX' && c.underlyingMarketClass === 'FOREX') return true;
      if (news.category === 'MACRO') return true;
      return false;
    });

    const side: FuturesOrderSide = news.sentiment === 'NEGATIVE' ? 'SELL' : 'BUY';
    for (const contract of matchingContracts.slice(0, 2)) {
      const qty = this.baseOrderQty(contract, 1);
      const actor = news.category === 'MACRO' || news.category === 'FOREX' ? hedger : trend;
      try {
        const res = this.futures.placeOrder({
          playerId: actor.id,
          playerName: actor.username,
          symbol: contract.symbol,
          side,
          type: 'MARKET',
          quantity: qty,
          leverage: actor.defaultLeverage,
        });
        trades.push(...res.trades);
        this.recordBotTrades(res.trades);
        affected.add(contract.symbol);
        this.lastActionByBot.set(actor.id, `Phản ứng tin ${news.category}: ${side} ${qty} ${contract.symbol}`);
      } catch {
        // Ignore if finite margin exhausted
      }
    }

    return { trades, affectedSymbols: Array.from(affected) };
  }

  listBotSummaries(): FuturesBotSummary[] {
    const liqHistory = this.futures.listRecentLiquidations(200);
    return FUTURES_AI_BOTS.map((bot) => {
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
        tradesCount: this.tradesCountByBot.get(bot.id) ?? 0,
        liquidationsCount,
        lastActionNote: this.lastActionByBot.get(bot.id) ?? 'Đang theo dõi sổ lệnh',
      };
    });
  }

  private quoteMarketMakerBook(bot: FuturesBotSpec, contract: FuturesContract, levels: number, offsetSteps = 1): void {
    const midInt = contract.markPriceInt > 0 ? contract.markPriceInt : contract.referencePriceInt;
    const baseStepTicks = Math.max(1, Math.round((midInt * 0.0012) / contract.priceTickInt)); // ~12 bps per level

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
          leverage: bot.defaultLeverage,
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
          leverage: bot.defaultLeverage,
          postOnly: true,
        });
      } catch {
        // Skip if crossing or capital capped
      }
    }
  }

  private baseOrderQty(contract: FuturesContract, scaleFactor = 1): number {
    // Target ~3,000 - 15,000 CR notional per bot slice snapped cleanly to qtyStep
    const priceMajor = fromPriceInt(contract.markPriceInt, contract.priceScale);
    if (priceMajor <= 0) return contract.minQty;
    const targetNotionalCR = 4_000 * scaleFactor;
    const rawQty = targetNotionalCR / priceMajor;
    const steps = Math.max(1, Math.round(rawQty / contract.qtyStep));
    const snappedInt = Math.min(contract.maxOrderQtyInt, Math.max(contract.minQtyInt, steps * contract.qtyStepInt));
    return fromQtyInt(snappedInt);
  }

  private snapPrice(contract: FuturesContract, rawMajor: number): number {
    const rawInt = Math.round(rawMajor * contract.priceScale);
    const snapped = Math.max(contract.priceTickInt, Math.round(rawInt / contract.priceTickInt) * contract.priceTickInt);
    return fromPriceInt(snapped, contract.priceScale);
  }

  private recordBotTrades(trades: FuturesTrade[]): void {
    for (const t of trades) {
      if (this.tradesCountByBot.has(t.buyerId)) {
        this.tradesCountByBot.set(t.buyerId, (this.tradesCountByBot.get(t.buyerId) ?? 0) + 1);
      }
      if (this.tradesCountByBot.has(t.sellerId)) {
        this.tradesCountByBot.set(t.sellerId, (this.tradesCountByBot.get(t.sellerId) ?? 0) + 1);
      }
    }
  }
}
