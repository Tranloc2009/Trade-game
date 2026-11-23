import crypto from 'node:crypto';
import type { IEventBus } from '../../shared/contracts/interfaces';
import { calcNotionalMinor, toMinor } from '../../shared/contracts/money';
import {
  API_CONTRACT_VERSION,
  DEFAULT_WORLD_ID,
  DEFAULT_WORLD_NAME,
  type AccountRole,
  type Achievement,
  type ChatMessage,
  type DiagnosticsSnapshot,
  type LeaderboardEntry,
  type NetWorthPoint,
  type PlayerProfile,
  type RealtimeEnvelope,
  type RealtimeEventType,
  type WorldSnapshot,
} from '../../shared/contracts/types';
import {
  createExternalProviderRegistry,
  type ExternalProviderRegistry,
} from '../adapters/ExternalProviders';
import { DomainError } from '../domain/DomainError';
import { buildSeedAssets } from '../seed/worldSeed';
import { DemoAuthProvider, SecurityGuard, sanitizePlainText } from '../security/SecurityGuard';
import { BankingEngine } from './banking/BankingEngine';
import { BusinessEngine } from './business/BusinessEngine';
import { EconomyEngine } from './economy/EconomyEngine';
import { LedgerService } from './ledger/LedgerService';
import { MarketMakerEngine, SIMULATED_AGENTS } from './market-makers/MarketMakerEngine';
import { CandleAggregator } from './matching/CandleAggregator';
import { MatchingEngine, type PlaceOrderCommand } from './matching/MatchingEngine';
import { PROPERTY_DEV_NPC_ID, PROPERTY_DEV_NPC_NAME, PropertyEngine } from './property/PropertyEngine';

export const STARTING_CAPITAL_CR = 100_000;
export const STARTING_CAPITAL_MINOR = toMinor(STARTING_CAPITAL_CR);

export interface PlayerRecord {
  id: string;
  username: string;
  avatarInitials: string;
  role: AccountRole;
  joinedAt: string;
  level: number;
  exp: number;
  title: string;
  startingCapitalMinor: number;
  tradingVolumeMinor: number;
  achievements: Achievement[];
  netWorthHistory: NetWorthPoint[];
}

export class WorldEventBus implements IEventBus {
  private readonly worldId: string;
  private sequenceNumber = 0;
  private listeners = new Set<(envelope: RealtimeEnvelope, room?: string) => void>();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  publish<T>(eventType: RealtimeEventType, payload: T, room?: string): RealtimeEnvelope<T> {
    this.sequenceNumber += 1;
    const envelope: RealtimeEnvelope<T> = {
      eventId: `evt_${this.sequenceNumber}_${crypto.randomBytes(4).toString('hex')}`,
      eventType,
      worldId: this.worldId,
      sequenceNumber: this.sequenceNumber,
      serverTimestamp: new Date().toISOString(),
      payload,
    };
    for (const listener of this.listeners) {
      listener(envelope, room);
    }
    return envelope;
  }

  subscribe(listener: (envelope: RealtimeEnvelope, room?: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  reset(): void {
    this.sequenceNumber = 0;
  }
}

export interface WorldEngineOptions {
  worldId?: string;
  worldName?: string;
  calendarMode?: 'ACCELERATED' | 'REALTIME';
  enableBackgroundLoops?: boolean;
  devToolsEnabled?: boolean;
  providers?: ExternalProviderRegistry;
}

/**
 * Authoritative Singleton State Container for WORLD-01: GLOBAL ECONOMY.
 * Coordinates all financial subsystems, multiplayer sessions, real-time events, and mathematical invariants.
 */
export class WorldEngine {
  public readonly worldId: string;
  public readonly worldName: string;
  public readonly devToolsEnabled: boolean;
  public readonly providers: ExternalProviderRegistry;

  public readonly eventBus: WorldEventBus;
  public readonly auth: DemoAuthProvider;
  public readonly security: SecurityGuard;
  public readonly ledger: LedgerService;
  public readonly candles: CandleAggregator;
  public readonly matching: MatchingEngine;
  public readonly marketMakers: MarketMakerEngine;
  public readonly economy: EconomyEngine;
  public readonly properties: PropertyEngine;
  public readonly business: BusinessEngine;
  public readonly banking: BankingEngine;

  private players = new Map<string, PlayerRecord>();
  private chatMessages: ChatMessage[] = [];
  private stateVersion = 1;
  private bootedAtMs = Date.now();
  private timers: Array<ReturnType<typeof setInterval>> = [];

  // Updated by SocketGateway with real connected clients (NEVER fabricated!)
  private activeConnectionCount = 0;
  private onlineHumanPlayerIds = new Set<string>();

  constructor(options: WorldEngineOptions = {}) {
    this.worldId = options.worldId ?? DEFAULT_WORLD_ID;
    this.worldName = options.worldName ?? DEFAULT_WORLD_NAME;
    this.devToolsEnabled = options.devToolsEnabled ?? true;
    this.providers = options.providers ?? createExternalProviderRegistry();

    this.eventBus = new WorldEventBus(this.worldId);
    this.auth = new DemoAuthProvider();
    this.security = new SecurityGuard();
    this.ledger = new LedgerService(this.worldId);
    this.candles = new CandleAggregator();
    this.matching = new MatchingEngine(this.ledger, this.candles, {
      worldId: this.worldId,
    });
    this.marketMakers = new MarketMakerEngine(this.ledger, this.matching);
    this.economy = new EconomyEngine(options.calendarMode ?? 'ACCELERATED');
    this.properties = new PropertyEngine(this.worldId, this.ledger);
    this.business = new BusinessEngine(this.worldId, this.ledger);
    this.banking = new BankingEngine(this.ledger);

    this.bootstrapWorld();

    if (options.enableBackgroundLoops !== false) {
      this.startBackgroundLoops();
    }
  }

  public bootstrapWorld(): void {
    this.bootedAtMs = Date.now();
    this.players.clear();
    this.chatMessages = [];
    this.eventBus.reset();
    this.security.reset();
    this.ledger.reset();
    this.matching.reset();
    this.marketMakers.reset();
    this.economy.reset();
    this.properties.reset();
    this.business.reset();
    this.banking.reset();

    // 1. Seed 6 ECX Crypto + 8 ESE Stocks
    const assets = buildSeedAssets();
    for (const asset of assets) {
      this.matching.registerAsset(asset, true);
    }

    // 2. Register & fund NPC Market Makers & Investor Bots with finite wallets/inventory
    this.marketMakers.fundAgents(assets);
    for (const agent of SIMULATED_AGENTS) {
      this.players.set(agent.id, {
        id: agent.id,
        username: agent.username,
        avatarInitials: agent.username.slice(0, 2).toUpperCase(),
        role: agent.role,
        joinedAt: new Date().toISOString(),
        level: 10,
        exp: 10_000,
        title: agent.role === 'MARKET_MAKER' ? 'Market Maker' : 'Institutional Fund',
        startingCapitalMinor: agent.role === 'MARKET_MAKER' ? toMinor(12_000_000) : toMinor(4_500_000),
        tradingVolumeMinor: 0,
        achievements: [],
        netWorthHistory: [],
      });
    }

    // Register Empire Estates NPC
    this.players.set(PROPERTY_DEV_NPC_ID, {
      id: PROPERTY_DEV_NPC_ID,
      username: PROPERTY_DEV_NPC_NAME,
      avatarInitials: 'EE',
      role: 'SYSTEM',
      joinedAt: new Date().toISOString(),
      level: 10,
      exp: 0,
      title: 'Property Developer',
      startingCapitalMinor: toMinor(2_000_000),
      tradingVolumeMinor: 0,
      achievements: [],
      netWorthHistory: [],
    });

    // 3. Populate initial resting order books across ECX & ESE via real MatchingEngine
    this.marketMakers.seedInitialOrderBooks(this.economy.state.volatilityRegime);

    // 4. Seed initial grounded news & sync ledger metrics
    this.economy.seedInitialNews(this.matching.listAssets());
    this.economy.syncLedgerMetrics(this.ledger);

    // 5. Initial welcome world message (system notice, clearly labeled)
    this.chatMessages.push({
      id: 'chat_boot_1',
      channel: 'WORLD',
      senderId: 'SYSTEM',
      senderName: 'WORLD-01 System',
      senderTitle: 'Exchange Notice',
      content:
        'Chào mừng tới WORLD-01: GLOBAL ECONOMY (DEMO — TEMPORARY SERVER). Mọi giao dịch được khớp theo cơ chế Price-Time Priority trên máy chủ chung.',
      timestamp: new Date().toISOString(),
      reportedBy: [],
    });

    this.stateVersion += 1;
  }

  public startBackgroundLoops(): void {
    this.stopBackgroundLoops();

    // Every 8s: simulated economic agent tick (real orders through MatchingEngine) + auction expiry check
    const marketTimer = setInterval(() => {
      try {
        const res = this.marketMakers.runSimulationTick(this.economy.state);
        for (const trade of res.trades) {
          this.onTradeExecuted(trade);
        }
        for (const sym of res.affectedSymbols) {
          const asset = this.matching.getAsset(sym);
          if (asset) {
            this.eventBus.publish('market.quote.updated', asset);
            this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
          }
        }
        const settledAuctions = this.properties.settleExpiredAuctions();
        for (const auc of settledAuctions) {
          this.eventBus.publish('auction.ended', auc);
        }
      } catch (err) {
        console.error('[WorldEngine] market tick error:', err);
      }
    }, 8_000);

    // Every 60s: economy event, business operating cycle, rental payouts, bank interest, leaderboard broadcast
    const macroTimer = setInterval(() => {
      try {
        const { newEvent, newNews } = this.economy.tickEconomy(this.matching);
        this.economy.syncLedgerMetrics(this.ledger);

        if (newEvent) this.eventBus.publish('economy.event', newEvent);
        if (newNews) this.eventBus.publish('news.published', newNews);

        const updatedCompanies = this.business.runOperatingCycle(this.economy.state);
        for (const cmp of updatedCompanies) {
          this.eventBus.publish('company.updated', cmp);
        }

        const rentPayouts = this.properties.collectRentalCycle(this.economy.state);
        for (const payout of rentPayouts) {
          this.emitPlayerFinancialSync(payout.playerId);
        }

        this.banking.accrueInterestCycle(this.economy.state);
        this.snapshotHumanNetWorthHistory();

        this.eventBus.publish('world.status', {
          gameClock: this.economy.getGameClock(),
          economy: this.economy.state,
          onlineHumanPlayers: this.onlineHumanPlayerIds.size,
          simulatedAgentsCount: SIMULATED_AGENTS.length,
        });
        this.eventBus.publish('leaderboard.updated', this.getLeaderboard('PLAYERS'));
      } catch (err) {
        console.error('[WorldEngine] macro tick error:', err);
      }
    }, 60_000);

    this.timers.push(marketTimer, macroTimer);
  }

  public stopBackgroundLoops(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  public setRealtimePresence(activeConnections: number, onlineHumanIds: string[]): void {
    this.activeConnectionCount = activeConnections;
    this.onlineHumanPlayerIds = new Set(onlineHumanIds);
  }

  public getOnlineHumanPlayersCount(): number {
    return this.onlineHumanPlayerIds.size;
  }

  /**
   * Registers or retrieves a human Guest Account.
   * Preset 'BOB' receives 100 demo NOVA shares (allocated transparently from initial float)
   * specifically to support Section 32 manual two-client acceptance testing out of the box.
   */
  public loginGuest(username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM') {
    const session = this.auth.createGuestSession(username, preset);
    let record = this.players.get(session.playerId);

    if (!record) {
      const initials = session.username
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2);

      this.ledger.createWallet(
        session.playerId,
        STARTING_CAPITAL_MINOR,
        `Vốn khởi nghiệp mô phỏng 100,000 CR cho ${session.username}`,
      );

      // Section 32 support: Trader Bob receives 100 NOVA demo test shares from initial allocation so he can sell against Alice immediately
      if (preset === 'BOB' || session.username.toLowerCase() === 'trader bob') {
        this.ledger.grantInitialAsset(session.playerId, 'NOVA', 'STOCK', 100, toMinor(50.0));
      }

      const nowIso = new Date().toISOString();
      record = {
        id: session.playerId,
        username: session.username,
        avatarInitials: initials || 'TR',
        role: 'PLAYER',
        joinedAt: nowIso,
        level: 1,
        exp: 0,
        title: 'Market Initiate',
        startingCapitalMinor: STARTING_CAPITAL_MINOR,
        tradingVolumeMinor: 0,
        achievements: [],
        netWorthHistory: [
          {
            timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
            netWorthMinor: STARTING_CAPITAL_MINOR,
            cashMinor: STARTING_CAPITAL_MINOR,
            isDemoSeed: true,
          },
          {
            timestamp: nowIso,
            netWorthMinor: STARTING_CAPITAL_MINOR,
            cashMinor: STARTING_CAPITAL_MINOR,
            isDemoSeed: false,
          },
        ],
      };
      this.players.set(record.id, record);
      this.economy.syncLedgerMetrics(this.ledger);
      this.eventBus.publish('player.joined', {
        playerId: record.id,
        username: record.username,
        onlineHumanPlayers: Math.max(this.onlineHumanPlayerIds.size, 1),
      });
    }

    const profile = this.getPlayerProfile(session.playerId)!;
    // Ensure initial history point reflects actual starting net worth (e.g., Bob with 100 NOVA)
    if (record.netWorthHistory.length <= 2) {
      record.netWorthHistory[record.netWorthHistory.length - 1] = {
        timestamp: new Date().toISOString(),
        netWorthMinor: profile.netWorthMinor,
        cashMinor: profile.wallet.availableMinor + profile.wallet.lockedMinor + profile.wallet.savingsMinor,
      };
    }

    return {
      session,
      profile,
    };
  }

  /**
   * Computes exact PlayerProfile & Net Worth (INVARIANT / TEST 28):
   * NET WORTH = CASH (available + locked + savings + termDeposit) + STOCK VALUE + CRYPTO VALUE + PROPERTY VALUE + BUSINESS EQUITY - LIABILITIES
   * No double counting of locked cash or locked asset shares.
   */
  public getPlayerProfile(playerId: string): PlayerProfile | null {
    const record = this.players.get(playerId);
    const wallet = this.ledger.wallets.getWallet(playerId);
    if (!record || !wallet) return null;

    const holdings = this.ledger.wallets.listHoldings(playerId);
    let stockValueMinor = 0;
    let cryptoValueMinor = 0;
    let realizedPnlMinor = 0;
    let unrealizedPnlMinor = 0;

    for (const h of holdings) {
      const totalQty = h.availableQty + h.lockedQty;
      const asset = this.matching.getAsset(h.symbol);
      const markPrice = asset ? asset.lastPriceMinor : h.avgCostMinor;
      const marketVal = calcNotionalMinor(markPrice, totalQty);
      const costBasis = calcNotionalMinor(h.avgCostMinor, totalQty);

      if (h.marketClass === 'STOCK') stockValueMinor += marketVal;
      else cryptoValueMinor += marketVal;

      realizedPnlMinor += h.realizedPnlMinor;
      unrealizedPnlMinor += marketVal - costBasis;
    }

    const propertyValueMinor = this.properties.getPlayerPropertyValueMinor(playerId);
    const businessEquityMinor = this.business.getPlayerBusinessEquityMinor(playerId);
    const totalDebtMinor = this.banking.getPlayerTotalDebtMinor(playerId);

    const totalCashMinor =
      wallet.availableMinor + wallet.lockedMinor + wallet.savingsMinor + wallet.termDepositMinor;

    const netWorthMinor =
      totalCashMinor +
      stockValueMinor +
      cryptoValueMinor +
      propertyValueMinor +
      businessEquityMinor -
      totalDebtMinor;

    return {
      id: record.id,
      username: record.username,
      avatarInitials: record.avatarInitials,
      role: record.role,
      joinedAt: record.joinedAt,
      level: record.level,
      exp: record.exp,
      title: record.title,
      wallet: { ...wallet },
      holdings: holdings.map((h) => ({ ...h })),
      realizedPnlMinor,
      unrealizedPnlMinor,
      stockValueMinor,
      cryptoValueMinor,
      propertyValueMinor,
      businessEquityMinor,
      totalDebtMinor,
      netWorthMinor,
      tradingVolumeMinor: record.tradingVolumeMinor,
      achievements: [...record.achievements],
      netWorthHistory: [...record.netWorthHistory],
    };
  }

  public getWorldSnapshot(playerId: string | null): WorldSnapshot {
    this.economy.syncLedgerMetrics(this.ledger);
    return {
      apiVersion: API_CONTRACT_VERSION,
      worldId: this.worldId,
      worldName: this.worldName,
      isDemoTemporaryServer: true,
      sequenceNumber: this.eventBus.getSequenceNumber(),
      serverTimestamp: new Date().toISOString(),
      onlineHumanPlayers: this.onlineHumanPlayerIds.size,
      simulatedAgentsCount: SIMULATED_AGENTS.length,
      gameClock: this.economy.getGameClock(),
      economy: { ...this.economy.state, activeEvents: [...this.economy.state.activeEvents] },
      assets: this.matching.listAssets().map((a) => ({ ...a })),
      news: this.economy.news.slice(0, 30),
      player: playerId ? this.getPlayerProfile(playerId) : null,
    };
  }

  /**
   * Authoritative Order Placement entry point with rate-limiting, audit logging, and real-time broadcasts.
   */
  public placeOrder(playerId: string, input: Omit<PlaceOrderCommand, 'playerId' | 'playerName'>) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');

    // Anti-spam rate limit: max 25 orders per 10 seconds per human player
    if (player.role === 'PLAYER') {
      this.security.checkRateLimit(`order:${playerId}`, 25, 10_000, playerId);
    }

    const result = this.matching.placeOrder({
      ...input,
      playerId: player.id,
      playerName: player.username,
    });

    if (result.deduplicated) {
      return result;
    }

    // Broadcast order lifecycle event
    const eventType: RealtimeEventType =
      result.order.status === 'FILLED'
        ? 'order.filled'
        : result.order.status === 'PARTIALLY_FILLED'
          ? 'order.partially_filled'
          : 'order.created';
    this.eventBus.publish(eventType, result.order);

    // Broadcast trades, updated candles, order book, and affected player balances
    for (const trade of result.trades) {
      this.onTradeExecuted(trade);
    }

    const asset = this.matching.getAsset(result.order.symbol);
    if (asset) {
      this.eventBus.publish('market.quote.updated', asset);
    }
    this.eventBus.publish('market.orderbook.updated', result.orderBook, `market:${result.order.symbol}`);

    if (result.updatedCandles) {
      this.eventBus.publish(
        'market.candle.updated',
        { symbol: result.order.symbol, candles: result.updatedCandles },
        `market:${result.order.symbol}`,
      );
    }

    this.economy.syncLedgerMetrics(this.ledger);
    this.emitPlayerFinancialSync(playerId);

    // Check valid progression milestone (First Trade)
    if (result.trades.length > 0) {
      this.unlockAchievement(playerId, 'FIRST_TRADE', 'Giao dịch đầu tiên', 'Hoàn thành lệnh khớp đầu tiên trên sàn WORLD-01.', 50);
    }

    return result;
  }

  public cancelOrder(playerId: string, orderId: string) {
    const result = this.matching.cancelOrder(orderId, playerId);
    this.eventBus.publish('order.cancelled', result.order);
    this.eventBus.publish('market.orderbook.updated', result.orderBook, `market:${result.order.symbol}`);
    this.emitPlayerFinancialSync(playerId);
    return result;
  }

  private onTradeExecuted(trade: {
    id: string;
    symbol: string;
    buyerId: string;
    sellerId: string;
    grossAmountMinor: number;
  }): void {
    const buyer = this.players.get(trade.buyerId);
    const seller = this.players.get(trade.sellerId);
    if (buyer) buyer.tradingVolumeMinor += trade.grossAmountMinor;
    if (seller) seller.tradingVolumeMinor += trade.grossAmountMinor;

    this.eventBus.publish('market.trade.executed', trade, `market:${trade.symbol}`);
    this.emitPlayerFinancialSync(trade.buyerId);
    this.emitPlayerFinancialSync(trade.sellerId);
  }

  public buyProperty(playerId: string, propertyId: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    const result = this.properties.buyProperty(propertyId, playerId, player.username);
    this.eventBus.publish('property.sold', result);
    this.emitPlayerFinancialSync(playerId);
    this.emitPlayerFinancialSync(result.sellerId);
    this.unlockAchievement(playerId, 'FIRST_PROPERTY', 'Chủ sở hữu bất động sản', 'Mua thành công tài sản đầu tiên trên Empire Property Market.', 120);
    return result;
  }

  public listProperty(playerId: string, propertyId: string, listingPriceCR: number) {
    const prop = this.properties.listForSale(propertyId, playerId, listingPriceCR);
    this.eventBus.publish('property.listed', prop);
    return prop;
  }

  public placeAuctionBid(playerId: string, auctionId: string, bidAmountCR: number) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    const result = this.properties.placeBid(auctionId, playerId, player.username, bidAmountCR);
    this.eventBus.publish('auction.bid_placed', result.auction);
    this.emitPlayerFinancialSync(playerId);
    if (result.refundedBidderId) {
      this.emitPlayerFinancialSync(result.refundedBidderId);
    }
    return result;
  }

  public createCompany(
    playerId: string,
    payload: { name: string; ticker: string; sector: Parameters<BusinessEngine['createCompany']>[0]['sector']; initialCapitalCR: number },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    const company = this.business.createCompany({
      founderId: playerId,
      founderName: player.username,
      ...payload,
    });
    this.eventBus.publish('company.updated', company);
    this.emitPlayerFinancialSync(playerId);
    this.unlockAchievement(playerId, 'FIRST_COMPANY', 'Nhà sáng lập doanh nghiệp', 'Thành lập công ty độc lập đầu tiên trong Empire Business Network.', 150);
    return company;
  }

  public postChatMessage(playerId: string, channel: 'WORLD' | 'MARKET', rawContent: string): ChatMessage {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');

    // Rate limit: 6 messages per 15 seconds
    this.security.checkRateLimit(`chat:${playerId}`, 6, 15_000, playerId);

    const content = sanitizePlainText(rawContent);
    if (!content) throw new DomainError('VALIDATION_ERROR', 'Nội dung tin nhắn không hợp lệ.');

    // Basic spam duplicate check
    const recentSame = this.chatMessages
      .slice(-5)
      .some((m) => m.senderId === playerId && m.content === content && Date.now() - new Date(m.timestamp).getTime() < 10_000);
    if (recentSame) {
      throw new DomainError('RATE_LIMITED', 'Vui lòng không gửi lặp lại cùng một tin nhắn liên tục.');
    }

    const msg: ChatMessage = {
      id: `msg_${crypto.randomBytes(5).toString('hex')}`,
      channel,
      senderId: player.id,
      senderName: player.username,
      senderTitle: player.title,
      content,
      timestamp: new Date().toISOString(),
      reportedBy: [],
    };

    this.chatMessages.push(msg);
    if (this.chatMessages.length > 200) this.chatMessages.shift();
    this.eventBus.publish('chat.message', msg);
    return msg;
  }

  public reportChatMessage(playerId: string, messageId: string): void {
    const msg = this.chatMessages.find((m) => m.id === messageId);
    if (!msg) return;
    if (!msg.reportedBy.includes(playerId)) {
      msg.reportedBy.push(playerId);
      this.security.recordAudit(playerId, 'CHAT_REPORT', 'INFO', `Báo cáo tin nhắn ${messageId} từ ${msg.senderName}`);
    }
  }

  public listChatMessages(channel?: 'WORLD' | 'MARKET'): ChatMessage[] {
    if (!channel) return this.chatMessages.slice(-80);
    return this.chatMessages.filter((m) => m.channel === channel).slice(-80);
  }

  /**
   * Isolated Entertainment Zone mini-game using ONLY free Entertainment Chips (never CR!).
   */
  public playEntertainmentChips(playerId: string, wagerChips: number, targetMultiplier: '2x' | '4x' | '8x') {
    const wallet = this.ledger.requireWallet(playerId);
    if (wallet.entertainmentChips < wagerChips) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Không đủ Entertainment Chips. Bạn có thể nhận thêm chip miễn phí.');
    }

    const rules = {
      '2x': { winChance: 0.48, mult: 2 },
      '4x': { winChance: 0.24, mult: 4 },
      '8x': { winChance: 0.12, mult: 8 },
    }[targetMultiplier];

    const roll = crypto.randomInt(0, 10_000) / 10_000;
    const won = roll < rules.winChance;
    wallet.entertainmentChips -= wagerChips;
    const payoutChips = won ? wagerChips * rules.mult : 0;
    wallet.entertainmentChips += payoutChips;

    return {
      won,
      rollPct: Number((roll * 100).toFixed(2)),
      winThresholdPct: Number((rules.winChance * 100).toFixed(2)),
      wagerChips,
      payoutChips,
      remainingChips: wallet.entertainmentChips,
      note: 'Entertainment Chips hoàn toàn tách biệt và không thể quy đổi thành CR.',
    };
  }

  public claimFreeEntertainmentChips(playerId: string): number {
    const wallet = this.ledger.requireWallet(playerId);
    if (wallet.entertainmentChips < 1_000) {
      wallet.entertainmentChips = 1_000;
    }
    return wallet.entertainmentChips;
  }

  public getLeaderboard(scope: 'PLAYERS' | 'AGENTS' | 'ALL' = 'PLAYERS'): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (const record of this.players.values()) {
      if (record.role === 'SYSTEM') continue;
      if (scope === 'PLAYERS' && record.role !== 'PLAYER') continue;
      if (scope === 'AGENTS' && record.role === 'PLAYER') continue;

      const profile = this.getPlayerProfile(record.id);
      if (!profile) continue;

      // Distinguish actual investment return from initial system issuance
      const investmentProfitMinor = profile.netWorthMinor - record.startingCapitalMinor;
      const returnPct =
        record.startingCapitalMinor > 0
          ? Number(((investmentProfitMinor / record.startingCapitalMinor) * 100).toFixed(2))
          : 0;

      entries.push({
        rank: 0,
        playerId: profile.id,
        username: profile.username,
        role: profile.role,
        title: profile.title,
        level: profile.level,
        netWorthMinor: profile.netWorthMinor,
        returnPct,
        realizedPnlMinor: profile.realizedPnlMinor,
        tradingVolumeMinor: profile.tradingVolumeMinor,
        propertyValueMinor: profile.propertyValueMinor,
        businessEquityMinor: profile.businessEquityMinor,
      });
    }

    entries.sort((a, b) => b.netWorthMinor - a.netWorthMinor);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });
    return entries;
  }

  public getDiagnostics(): DiagnosticsSnapshot {
    return {
      serverStatus: 'HEALTHY',
      isDemoTemporaryServer: true,
      worldId: this.worldId,
      worldName: this.worldName,
      stateVersion: this.stateVersion,
      eventSequence: this.eventBus.getSequenceNumber(),
      activeConnections: this.activeConnectionCount,
      onlineHumanPlayers: this.onlineHumanPlayerIds.size,
      simulatedAgentsCount: SIMULATED_AGENTS.length,
      matchingEngineHealth: 'OPERATIONAL',
      totalOrders: this.matching.getTotalOrdersCount(),
      openOrdersCount: this.matching.getOpenOrdersCount(),
      totalTrades: this.matching.getTotalTradesCount(),
      totalLedgerEntries: this.ledger.ledger.count(),
      economyPhase: this.economy.state.phase,
      volatilityRegime: this.economy.state.volatilityRegime,
      gameClock: this.economy.getGameClock(),
      uptimeSeconds: Math.floor((Date.now() - this.bootedAtMs) / 1000),
      devToolsEnabled: this.devToolsEnabled,
      recentAuditLogs: this.security.getRecentAuditLogs(25),
    };
  }

  private unlockAchievement(playerId: string, id: string, title: string, description: string, expGain: number): void {
    const rec = this.players.get(playerId);
    if (!rec || rec.role !== 'PLAYER') return;
    if (rec.achievements.some((a) => a.id === id)) return;

    rec.achievements.push({
      id,
      title,
      description,
      unlockedAt: new Date().toISOString(),
    });
    rec.exp += expGain;
    rec.level = Math.floor(rec.exp / 200) + 1;
    if (rec.level >= 5) rec.title = 'Capital Strategist';
    else if (rec.level >= 3) rec.title = 'Portfolio Manager';
    else if (rec.level >= 2) rec.title = 'Active Investor';
  }

  private emitPlayerFinancialSync(playerId: string): void {
    const profile = this.getPlayerProfile(playerId);
    if (!profile || profile.role !== 'PLAYER') return;
    this.eventBus.publish('balance.updated', { playerId, wallet: profile.wallet }, `player:${playerId}`);
    this.eventBus.publish('portfolio.updated', profile, `player:${playerId}`);
  }

  private snapshotHumanNetWorthHistory(): void {
    const nowIso = new Date().toISOString();
    for (const rec of this.players.values()) {
      if (rec.role !== 'PLAYER') continue;
      const profile = this.getPlayerProfile(rec.id);
      if (!profile) continue;
      rec.netWorthHistory.push({
        timestamp: nowIso,
        netWorthMinor: profile.netWorthMinor,
        cashMinor: profile.wallet.availableMinor + profile.wallet.lockedMinor + profile.wallet.savingsMinor,
      });
      if (rec.netWorthHistory.length > 96) rec.netWorthHistory.shift();

      if (profile.netWorthMinor >= toMinor(120_000)) {
        this.unlockAchievement(rec.id, 'NW_120K', 'Vượt mốc 120,000 CR', 'Gia tăng tài sản ròng thực tế vượt 120,000 CR.', 100);
      }
      if (profile.holdings.length >= 3) {
        this.unlockAchievement(rec.id, 'DIVERSIFIED', 'Nhà đầu tư đa dạng hóa', 'Nắm giữ đồng thời từ 3 mã tài sản trở lên.', 80);
      }
    }
  }
}
