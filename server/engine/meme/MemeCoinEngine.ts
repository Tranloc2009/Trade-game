import { fromMinor, toMinor } from '../../../shared/contracts/money';
import type {
  MemeCoinTokenomics,
  MemeMarketOverview,
  MemeNewsEvent,
  MemeNewsEventType,
  MemeSupplyAuditResult,
  MemeWhaleSummary,
} from '../../../shared/contracts/meme';
import type { Asset, OrderSide, Trade } from '../../../shared/contracts/types';
import { LedgerService } from '../ledger/LedgerService';
import { MatchingEngine } from '../matching/MatchingEngine';
import { fastId } from '../matching/fastId';
import { MEME_COIN_SPECS, type MemeCoinSeedSpec } from './memeSeed';

export const MEME_TREASURY_ACCOUNT_ID = 'sys_meme_treasury';
export const MEME_MM_ACCOUNT_ID = 'npc_mm_meme_desk';

export interface MemeWhaleConfig {
  id: string;
  name: string;
  archetype: MemeWhaleSummary['archetype'];
  initialCapitalCR: number;
  focusSymbols: string[];
  whaleShareWeight: number;
}

export const MEME_WHALE_CONFIGS: MemeWhaleConfig[] = [
  {
    id: 'whale_dogx_alpha',
    name: 'Canine Alpha Whale (NPC)',
    archetype: 'MEME_WHALE_ACCUMULATOR',
    initialCapitalCR: 2_200_000,
    focusSymbols: ['DOGX-SIM', 'PEPEX-SIM', 'BONKX-SIM'],
    whaleShareWeight: 0.4,
  },
  {
    id: 'whale_pepe_vault',
    name: 'Galaxy Vault Syndicate (NPC)',
    archetype: 'MEME_WHALE_SWING',
    initialCapitalCR: 2_500_000,
    focusSymbols: ['MOON-SIM', 'FROG-SIM', 'CATX-SIM'],
    whaleShareWeight: 0.35,
  },
  {
    id: 'whale_moon_syndicate',
    name: 'Orbital Degen Whale (NPC)',
    archetype: 'MEME_WHALE_SYNDICATE',
    initialCapitalCR: 1_800_000,
    focusSymbols: ['DEGEN-SIM', 'TURBO-SIM', 'DOGX-SIM', 'MOON-SIM'],
    whaleShareWeight: 0.25,
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alignToTick(priceMinor: number, tickMinor: number, mode: 'floor' | 'ceil' | 'round' = 'round'): number {
  const ratio = priceMinor / tickMinor;
  const ticks = mode === 'floor' ? Math.floor(ratio) : mode === 'ceil' ? Math.ceil(ratio) : Math.round(ratio);
  return Math.max(tickMinor, ticks * tickMinor);
}

/**
 * Simulated Meme Coin Economy Engine.
 *
 * Guarantees:
 * - Finite auditable supply per token: treasury + MM + whales + players === totalSupply (0 drift).
 * - Whales and Meme Market Makers use real finite CR wallets and finite token inventories
 *   through the exact same MatchingEngine as human players (no fake trades, no wash trading).
 * - Structured Meme News events NEVER alter prices directly; they are published as data
 *   for autonomous bots/whales/players to react to through real orders.
 */
export class MemeCoinEngine {
  private readonly ledger: LedgerService;
  private readonly matching: MatchingEngine;
  private rng: () => number;

  private readonly specBySymbol = new Map<string, MemeCoinSeedSpec>();
  private readonly whaleStats = new Map<string, { tradesCount: number; lastActionNote: string }>();
  private readonly newsHistory: MemeNewsEvent[] = [];
  private readonly priceHistory = new Map<string, number[]>();

  constructor(ledger: LedgerService, matching: MatchingEngine, seed = 20261199) {
    this.ledger = ledger;
    this.matching = matching;
    this.rng = mulberry32(seed);
    for (const spec of MEME_COIN_SPECS) {
      this.specBySymbol.set(spec.symbol, spec);
    }
  }

  reset(seed = 20261199): void {
    this.rng = mulberry32(seed);
    this.whaleStats.clear();
    this.newsHistory.length = 0;
    this.priceHistory.clear();
    for (const w of MEME_WHALE_CONFIGS) {
      this.whaleStats.set(w.id, { tradesCount: 0, lastActionNote: 'Khởi tạo ví hữu hạn' });
    }
  }

  /**
   * Distributes the exact finite totalSupply of all 8 Meme Coins across Treasury,
   * Meme Market Maker Desk, and 3 Finite-Capital Whale Accounts.
   */
  bootstrapMemeEconomy(): void {
    // 1. Create Treasury, Meme MM Desk, and Whale wallets with finite CR
    this.ledger.createWallet(
      MEME_TREASURY_ACCOUNT_ID,
      toMinor(1_000_000),
      'Kho dự trữ token Meme (không tự in tiền)',
    );
    this.ledger.createWallet(
      MEME_MM_ACCOUNT_ID,
      toMinor(6_000_000),
      'Cấp vốn tạo lập thị trường Meme Coin (hữu hạn)',
    );

    for (const whale of MEME_WHALE_CONFIGS) {
      this.ledger.createWallet(
        whale.id,
        toMinor(whale.initialCapitalCR),
        `Cấp vốn hữu hạn cho cá voi ${whale.name}`,
      );
      this.whaleStats.set(whale.id, {
        tradesCount: 0,
        lastActionNote: `Phân bổ ${whale.initialCapitalCR.toLocaleString('en-US')} CR`,
      });
    }

    // 2. Distribute EXACT finite supply for each Meme Coin (sum === spec.totalSupply)
    for (const spec of MEME_COIN_SPECS) {
      const refMinor = toMinor(spec.initialPriceCR);
      const treasuryQty = Math.floor((spec.totalSupply * spec.distribution.treasuryPct) / 100);
      const mmQty = Math.floor(
        (spec.totalSupply * (spec.distribution.marketMakerPct + spec.distribution.publicFloatPct)) / 100,
      );
      const totalWhalePool = spec.totalSupply - treasuryQty - mmQty;

      this.ledger.grantInitialAsset(MEME_TREASURY_ACCOUNT_ID, spec.symbol, 'CRYPTO', treasuryQty, refMinor);
      this.ledger.grantInitialAsset(MEME_MM_ACCOUNT_ID, spec.symbol, 'CRYPTO', mmQty, refMinor);

      let distributedWhale = 0;
      for (let i = 0; i < MEME_WHALE_CONFIGS.length; i++) {
        const whale = MEME_WHALE_CONFIGS[i];
        const qty =
          i === MEME_WHALE_CONFIGS.length - 1
            ? totalWhalePool - distributedWhale
            : Math.floor(totalWhalePool * whale.whaleShareWeight);
        distributedWhale += qty;
        if (qty > 0) {
          this.ledger.grantInitialAsset(whale.id, spec.symbol, 'CRYPTO', qty, refMinor);
        }
      }

      this.priceHistory.set(spec.symbol, [refMinor]);
    }
  }

  /**
   * Seeds realistic thinner, wider-spread order books for all 8 Meme Coins.
   */
  seedInitialMemeOrderBooks(): void {
    for (const spec of MEME_COIN_SPECS) {
      const asset = this.matching.getAsset(spec.symbol);
      if (asset && asset.status === 'OPEN') {
        this.refreshMemeMakerQuotes(asset);
      }
    }
  }

  refreshMemeMakerQuotes(asset: Asset, spreadMult = 1.0): void {
    const spec = this.specBySymbol.get(asset.symbol);
    if (!spec || asset.status !== 'OPEN') return;

    this.matching.cancelAllPlayerOrdersForSymbol(MEME_MM_ACCOUNT_ID, asset.symbol);

    const wallet = this.ledger.wallets.getWallet(MEME_MM_ACCOUNT_ID);
    const holding = this.ledger.wallets.getHolding(MEME_MM_ACCOUNT_ID, asset.symbol);
    if (!wallet || !holding) return;

    const mid = asset.lastPriceMinor;
    // Meme coins have intentionally wider spreads (80–240 bps) and thinner depth than BTC/ETH
    const baseHalfSpreadBps = spec.perpEnabled ? 95 : 165;
    const effectiveHalfBps = Math.round(baseHalfSpreadBps * spreadMult);
    const levels = spec.perpEnabled ? 4 : 3;

    // Small lot sizes produce genuine price impact when whales or large players sweep the book
    const targetLevelNotionalCR = spec.perpEnabled ? 3_500 : 1_400;
    const baseQty = Math.max(
      spec.minQty,
      Math.round(targetLevelNotionalCR / Math.max(0.01, fromMinor(mid)) / spec.qtyStep) * spec.qtyStep,
    );

    for (let lvl = 0; lvl < levels; lvl++) {
      const offsetBps = Math.round(effectiveHalfBps * (1 + lvl * 0.85));
      let bidMinor = alignToTick(Math.floor((mid * (10_000 - offsetBps)) / 10_000), asset.priceTickMinor, 'floor');
      let askMinor = alignToTick(Math.ceil((mid * (10_000 + offsetBps)) / 10_000), asset.priceTickMinor, 'ceil');
      if (bidMinor >= askMinor) {
        bidMinor = Math.max(asset.priceTickMinor, mid - (lvl + 1) * asset.priceTickMinor);
        askMinor = mid + (lvl + 1) * asset.priceTickMinor;
      }

      const qty = Math.min(spec.maxOrderQty, baseQty * (lvl + 1));
      const neededCash = Math.round(bidMinor * qty * 1.005);

      if (wallet.availableMinor >= neededCash && bidMinor > 0) {
        try {
          this.matching.placeOrder({
            playerId: MEME_MM_ACCOUNT_ID,
            playerName: 'Meme Liquidity Desk (NPC)',
            symbol: asset.symbol,
            side: 'BUY',
            type: 'LIMIT',
            timeInForce: 'GTC',
            priceCR: fromMinor(bidMinor),
            quantity: qty,
          });
        } catch {
          // Respect price band & finite balance
        }
      }

      const freshHold = this.ledger.wallets.getHolding(MEME_MM_ACCOUNT_ID, asset.symbol);
      if (freshHold && freshHold.availableQty >= qty && askMinor > bidMinor) {
        try {
          this.matching.placeOrder({
            playerId: MEME_MM_ACCOUNT_ID,
            playerName: 'Meme Liquidity Desk (NPC)',
            symbol: asset.symbol,
            side: 'SELL',
            type: 'LIMIT',
            timeInForce: 'GTC',
            priceCR: fromMinor(askMinor),
            quantity: qty,
          });
        } catch {
          // Respect price band & finite inventory
        }
      }
    }
  }

  /**
   * Publishes a structured Meme News Event (NEVER directly alters prices).
   * Traders, Whales, and Futures AI Bots read active news and place real orders on the book.
   */
  publishMemeNews(params?: {
    symbol?: string;
    eventType?: MemeNewsEventType;
    sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    intensity?: number;
    credibility?: number;
    durationMs?: number;
    headline?: string;
    summary?: string;
  }): MemeNewsEvent {
    const spec =
      (params?.symbol ? this.specBySymbol.get(params.symbol.toUpperCase()) : null) ??
      MEME_COIN_SPECS[Math.floor(this.rng() * MEME_COIN_SPECS.length)];

    const templates: Array<{
      eventType: MemeNewsEventType;
      sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      intensity: number;
      credibility: number;
      headline: string;
      summary: string;
    }> = [
      {
        eventType: 'VIRAL_COMMUNITY_CAMPAIGN',
        sentiment: 'BULLISH',
        intensity: 0.78,
        credibility: 0.55,
        headline: `[MEME WIRE] Chiến dịch cộng đồng ${spec.name} (${spec.symbol}) lan truyền mạnh trên WORLD-01`,
        summary: `Khối lượng thảo luận về ${spec.symbol} tăng đột biến. Các bot đầu cơ có xu hướng đuổi sóng trong khi bot hồi quy giá thận trọng với độ tin cậy trung bình.`,
      },
      {
        eventType: 'WHALE_ACCUMULATION_ALERT',
        sentiment: 'BULLISH',
        intensity: 0.85,
        credibility: 0.82,
        headline: `[WHALE ALERT] Ví cá voi gom mạnh ${spec.symbol} trên sổ lệnh giao ngay ECX`,
        summary: `Dữ liệu sổ lệnh ghi nhận các lệnh mua quy mô lớn tập trung vào ${spec.symbol} với thanh khoản mỏng.`,
      },
      {
        eventType: 'EXCHANGE_LISTING_RUMOR',
        sentiment: 'BULLISH',
        intensity: 0.9,
        credibility: 0.35,
        headline: `[RUMOR] Tin đồn mở rộng thanh khoản hệ sinh thái cho ${spec.symbol}`,
        summary: `Tin đồn chưa được xác thực (độ tin cậy thấp 35%) có thể kích hoạt sóng đầu cơ ngắn hạn và áp lực bán chốt lời ngược chiều.`,
      },
      {
        eventType: 'MEME_TREND_REVERSAL',
        sentiment: 'BEARISH',
        intensity: 0.75,
        credibility: 0.72,
        headline: `[MEME WIRE] Dòng tiền đầu cơ rút nhanh khỏi nhóm ${spec.symbol} sau nhịp tăng nóng`,
        summary: `Áp lực bán chốt lời gia tăng trên sổ lệnh ${spec.symbol}; các trader quản trị rủi ro giảm tỷ trọng.`,
      },
      {
        eventType: 'LIQUIDITY_STRESS_ALERT',
        sentiment: 'BEARISH',
        intensity: 0.82,
        credibility: 0.88,
        headline: `[LIQUIDITY] Độ sâu sổ lệnh ${spec.symbol} thu hẹp mạnh — cảnh báo trượt giá cao`,
        summary: `Tỷ lệ spread trên ${spec.symbol} mở rộng; các nhà tạo lập thị trường thu hẹp quy mô chào giá để phòng vệ rủi ro.`,
      },
    ];

    const picked = templates[Math.floor(this.rng() * templates.length)];
    const nowMs = Date.now();
    const durationMs = params?.durationMs ?? 120_000;
    const affected = [spec.symbol];
    if (spec.perpSymbol) affected.push(spec.perpSymbol);

    const event: MemeNewsEvent = {
      id: fastId('mnews'),
      eventType: params?.eventType ?? picked.eventType,
      headline: params?.headline ?? picked.headline,
      summary: params?.summary ?? picked.summary,
      affectedMarkets: affected,
      sentiment: params?.sentiment ?? picked.sentiment,
      intensity: Math.max(0.1, Math.min(1.0, params?.intensity ?? picked.intensity)),
      credibility: Math.max(0.1, Math.min(1.0, params?.credibility ?? picked.credibility)),
      durationMs,
      publishedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + durationMs).toISOString(),
      source: 'EMPIRE_MEME_WIRE_SIM',
    };

    this.newsHistory.unshift(event);
    if (this.newsHistory.length > 50) this.newsHistory.pop();
    return event;
  }

  getActiveNews(symbol?: string, nowMs = Date.now()): MemeNewsEvent[] {
    return this.newsHistory.filter((n) => {
      if (Date.parse(n.expiresAt) <= nowMs) return false;
      if (symbol && !n.affectedMarkets.includes(symbol)) return false;
      return true;
    });
  }

  /**
   * Executes one finite-capital Whale / Meme trader order tick on Spot MatchingEngine.
   * Whales react to active Meme News and order book depth using strictly finite CR & token balances.
   */
  runWhaleTick(targetSymbol?: string): { trades: Trade[]; affectedSymbols: string[] } {
    const spec =
      (targetSymbol ? this.specBySymbol.get(targetSymbol.toUpperCase()) : null) ??
      MEME_COIN_SPECS[Math.floor(this.rng() * MEME_COIN_SPECS.length)];
    if (!spec) return { trades: [], affectedSymbols: [] };

    const asset = this.matching.getAsset(spec.symbol);
    if (!asset || asset.status !== 'OPEN') return { trades: [], affectedSymbols: [] };

    const eligibleWhales = MEME_WHALE_CONFIGS.filter((w) => w.focusSymbols.includes(spec.symbol));
    const whale =
      eligibleWhales.length > 0
        ? eligibleWhales[Math.floor(this.rng() * eligibleWhales.length)]
        : MEME_WHALE_CONFIGS[0];

    const activeNews = this.getActiveNews(spec.symbol);
    let buyBias = 0.5;
    for (const ev of activeNews) {
      const sign = ev.sentiment === 'BULLISH' ? 1 : ev.sentiment === 'BEARISH' ? -1 : 0;
      // Swing whales fade low-credibility hype; accumulator whales ride credible momentum
      if (whale.archetype === 'MEME_WHALE_SWING' && ev.credibility < 0.45) {
        buyBias -= sign * ev.intensity * 0.25;
      } else {
        buyBias += sign * ev.intensity * ev.credibility * 0.3;
      }
    }
    buyBias = Math.max(0.15, Math.min(0.85, buyBias));

    const side: OrderSide = this.rng() < buyBias ? 'BUY' : 'SELL';
    const book = this.matching.getOrderBook(spec.symbol, 5);
    const hasCounterparty = side === 'BUY' ? book.asks.length > 0 : book.bids.length > 0;

    const trades: Trade[] = [];
    const affected = new Set<string>();

    if (hasCounterparty) {
      // Whale sweeps 1–2 levels with realistic finite notional (2,500 – 12,000 CR) -> measurable price impact!
      const notionalTargetCR = 2_500 + this.rng() * 8_500;
      const refCR = Math.max(0.01, fromMinor(asset.lastPriceMinor));
      const rawQty = Math.round(notionalTargetCR / refCR / spec.qtyStep) * spec.qtyStep;
      const qty = Math.max(spec.minQty, Math.min(spec.maxOrderQty, rawQty));

      try {
        const res = this.matching.placeOrder({
          playerId: whale.id,
          playerName: whale.name,
          symbol: spec.symbol,
          side,
          type: 'MARKET',
          timeInForce: 'IOC',
          quantity: qty,
          maxSlippageBps: 1200, // 12% slippage tolerance on thin meme books
        });
        if (res.trades.length > 0) {
          trades.push(...res.trades);
          affected.add(spec.symbol);
          const stat = this.whaleStats.get(whale.id);
          if (stat) {
            stat.tradesCount += res.trades.length;
            stat.lastActionNote = `${side} ${res.order.filledQuantity} ${spec.symbol} @ ${fromMinor(res.order.avgExecutionPriceMinor).toFixed(2)} CR`;
          }
          this.recordPriceSample(spec.symbol, asset.lastPriceMinor);
        }
      } catch {
        // Whale strictly obeys finite CR/token balances & matching constraints
      }
    }

    // Re-quote Meme MM if depth thinned below 2 levels
    const afterBook = this.matching.getOrderBook(spec.symbol, 5);
    if (afterBook.bids.length < 2 || afterBook.asks.length < 2) {
      const spreadMult = activeNews.some((n) => n.eventType === 'LIQUIDITY_STRESS_ALERT') ? 2.2 : 1.0;
      this.refreshMemeMakerQuotes(asset, spreadMult);
      affected.add(spec.symbol);
    }

    return { trades, affectedSymbols: Array.from(affected) };
  }

  recordPriceSample(symbol: string, priceMinor: number): void {
    const arr = this.priceHistory.get(symbol);
    if (!arr) return;
    if (arr[arr.length - 1] !== priceMinor) {
      arr.push(priceMinor);
      if (arr.length > 30) arr.shift();
    }
  }

  /**
   * Exact finite supply conservation audit for a single Meme Coin:
   * sum(all accounts available + locked holdings) MUST equal `spec.totalSupply`.
   */
  auditTokenSupply(symbol: string): MemeSupplyAuditResult {
    const spec = this.specBySymbol.get(symbol);
    if (!spec) {
      return { symbol, totalSupply: 0, accountedSupply: 0, discrepancy: 0, valid: false };
    }
    let accounted = 0;
    for (const wallet of this.ledger.wallets.listAllWallets()) {
      const playerId = wallet.playerId;
      const h = this.ledger.wallets.getHolding(playerId, symbol);
      if (h) {
        accounted += h.availableQty + h.lockedQty;
      }
    }
    const roundedAccounted = Math.round(accounted * 1_000) / 1_000;
    const discrepancy = Math.round((roundedAccounted - spec.totalSupply) * 1_000) / 1_000;
    return {
      symbol,
      totalSupply: spec.totalSupply,
      accountedSupply: roundedAccounted,
      discrepancy,
      valid: Math.abs(discrepancy) < 1e-6,
    };
  }

  auditAllMemeSupplies(): MemeSupplyAuditResult[] {
    return MEME_COIN_SPECS.map((s) => this.auditTokenSupply(s.symbol));
  }

  getTokenomics(symbol: string): MemeCoinTokenomics | null {
    const spec = this.specBySymbol.get(symbol);
    const asset = this.matching.getAsset(symbol);
    if (!spec || !asset) return null;

    let treasuryHoldings = 0;
    let availableMarketMakerHoldings = 0;
    let whaleHoldings = 0;
    let playerHoldings = 0;
    let holderCount = 0;
    const whaleIds = new Set(MEME_WHALE_CONFIGS.map((w) => w.id));

    for (const wallet of this.ledger.wallets.listAllWallets()) {
      const playerId = wallet.playerId;
      const h = this.ledger.wallets.getHolding(playerId, symbol);
      if (!h) continue;
      const total = h.availableQty + h.lockedQty;
      if (total <= 0) continue;
      holderCount += 1;
      if (playerId === MEME_TREASURY_ACCOUNT_ID) {
        treasuryHoldings += total;
      } else if (playerId === MEME_MM_ACCOUNT_ID || playerId.startsWith('npc_mm_')) {
        availableMarketMakerHoldings += total;
      } else if (whaleIds.has(playerId)) {
        whaleHoldings += total;
      } else {
        playerHoldings += total;
      }
    }

    const book = this.matching.getOrderBook(symbol, 10);
    const bidDepthMinor = book.bids.reduce((s, l) => s + l.totalMinor, 0);
    const askDepthMinor = book.asks.reduce((s, l) => s + l.totalMinor, 0);
    const spreadBps =
      book.bestBidMinor && book.bestAskMinor && book.bestAskMinor > 0
        ? Math.round(((book.bestAskMinor - book.bestBidMinor) / book.bestAskMinor) * 10_000)
        : null;

    const prices = this.priceHistory.get(symbol) ?? [asset.lastPriceMinor];
    let sumSq = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        const ret = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
        sumSq += ret * ret;
      }
    }
    const volPct = prices.length > 1 ? Math.sqrt(sumSq / (prices.length - 1)) : 1.5;
    const volatilityIndicator = Math.min(100, Math.round(volPct * 18));

    const circulatingSupply = Math.max(0, spec.totalSupply - treasuryHoldings);
    const thinLiquidityWarning = bidDepthMinor < 10_000_00 || askDepthMinor < 10_000_00 || (spreadBps ?? 9999) > 250;

    return {
      tokenId: spec.tokenId,
      symbol: spec.symbol,
      name: spec.name,
      theme: spec.theme,
      description: spec.description,
      totalSupply: spec.totalSupply,
      circulatingSupply,
      initialDistribution: spec.distribution,
      treasuryHoldings,
      availableMarketMakerHoldings,
      whaleHoldings,
      playerHoldings,
      holderCount,
      lastPriceMinor: asset.lastPriceMinor,
      referencePriceMinor: asset.referencePriceMinor,
      priceChange24hPct: asset.priceChange24hPct,
      marketCapMinor: Math.round(asset.lastPriceMinor * circulatingSupply),
      tradingVolume24h: asset.volume24h,
      turnover24hMinor: asset.turnover24hMinor,
      liquidityMetrics: {
        bidDepthMinor,
        askDepthMinor,
        spreadBps,
        restingLevels: book.bids.length + book.asks.length,
        thinLiquidityWarning,
      },
      volatilityIndicator,
      tradingStatus:
        asset.status === 'HALTED'
          ? 'HALTED'
          : volatilityIndicator >= 65 || thinLiquidityWarning
            ? 'HIGH_VOLATILITY_WARNING'
            : 'ACTIVE',
      contractEligibility: {
        spotEnabled: true,
        perpEnabled: spec.perpEnabled,
        perpSymbol: spec.perpSymbol,
        maxLeverage: spec.perpMaxLeverage,
        reason: spec.eligibilityReason,
      },
    };
  }

  getOverview(): MemeMarketOverview {
    const tokens: MemeCoinTokenomics[] = [];
    for (const spec of MEME_COIN_SPECS) {
      const t = this.getTokenomics(spec.symbol);
      if (t) tokens.push(t);
    }

    const whales: MemeWhaleSummary[] = MEME_WHALE_CONFIGS.map((w) => {
      const wallet = this.ledger.wallets.getWallet(w.id);
      const tokenHoldings: Record<string, { availableQty: number; lockedQty: number }> = {};
      for (const spec of MEME_COIN_SPECS) {
        const h = this.ledger.wallets.getHolding(w.id, spec.symbol);
        if (h && (h.availableQty > 0 || h.lockedQty > 0)) {
          tokenHoldings[spec.symbol] = { availableQty: h.availableQty, lockedQty: h.lockedQty };
        }
      }
      const stat = this.whaleStats.get(w.id);
      return {
        id: w.id,
        name: w.name,
        archetype: w.archetype,
        availableCRMinor: wallet?.availableMinor ?? 0,
        lockedCRMinor: wallet?.lockedMinor ?? 0,
        tokenHoldings,
        tradesCount: stat?.tradesCount ?? 0,
        lastActionNote: stat?.lastActionNote ?? '',
      };
    });

    return {
      tokens,
      whales,
      activeNews: this.getActiveNews(),
      recentNews: this.newsHistory.slice(0, 20),
      supplyAudits: this.auditAllMemeSupplies(),
    };
  }
}
