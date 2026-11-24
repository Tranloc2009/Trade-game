import crypto from 'node:crypto';
import type { IEventBus } from '../../shared/contracts/interfaces';
import {
  ALL_CURRENCIES,
  type CurrencyCode,
  calcNotionalMinor,
  fromCurrencyMinor,
  toMinor,
} from '../../shared/contracts/money';
import {
  API_CONTRACT_VERSION,
  DEFAULT_WORLD_ID,
  DEFAULT_WORLD_NAME,
  type AccountRole,
  type Achievement,
  type ChatMessage,
  type DiagnosticsSnapshot,
  type ForexOverviewSnapshot,
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
import { CentralBankEngine } from './forex/CentralBankEngine';
import { FOREX_AI_AGENTS, ForexBotEngine } from './forex/ForexBotEngine';
import { buildSeedForexPairs } from './forex/forexSeed';
import type {
  FuturesAccountSummary,
  FuturesOverviewSnapshot,
} from '../../shared/contracts/futures';
import { FUTURES_RISK_TIERS } from '../../shared/contracts/futures';
import { FuturesBotEngine, FUTURES_AI_BOTS } from './futures/FuturesBotEngine';
import { FuturesEngine, type PlaceFuturesOrderCommand } from './futures/FuturesEngine';
import { LedgerService, cloneWallet } from './ledger/LedgerService';
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
  public readonly centralBanks: CentralBankEngine;
  public readonly forexBots: ForexBotEngine;
  public readonly futures: FuturesEngine;
  public readonly futuresBots: FuturesBotEngine;
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
    this.centralBanks = new CentralBankEngine();
    this.forexBots = new ForexBotEngine(this.ledger, this.matching, this.centralBanks);
    this.futures = new FuturesEngine(this.worldId, this.ledger, this.matching);
    this.futuresBots = new FuturesBotEngine(this.ledger, this.futures);
    this.economy = new EconomyEngine(options.calendarMode ?? 'ACCELERATED');
    this.properties = new PropertyEngine(this.worldId, this.ledger);
    this.business = new BusinessEngine(this.worldId, this.ledger);
    this.banking = new BankingEngine(this.ledger);

    this.bindMatchingHooks();
    this.bindFuturesHooks();
    this.bootstrapWorld();

    if (options.enableBackgroundLoops !== false) {
      this.startBackgroundLoops();
    }
  }

  private bindMatchingHooks(): void {
    this.matching.setHooks({
      onOrderUpdated: (order, eventKind) => {
        const rec = this.players.get(order.playerId);
        if (rec?.role !== 'PLAYER') return;
        const eventType: RealtimeEventType =
          eventKind === 'filled'
            ? 'order.filled'
            : eventKind === 'partially_filled'
              ? 'order.partially_filled'
              : eventKind === 'cancelled'
                ? 'order.cancelled'
                : eventKind === 'expired'
                  ? 'order.expired'
                  : 'order.created';
        this.eventBus.publish(eventType, order, `player:${order.playerId}`);
      },
    });
  }

  private bindFuturesHooks(): void {
    this.futures.setHooks({
      onOrder: (order, eventKind) => {
        const rec = this.players.get(order.playerId);
        if (rec?.role !== 'PLAYER') return;
        const eventType: RealtimeEventType =
          eventKind === 'filled'
            ? 'futures.order.filled'
            : eventKind === 'partially_filled'
              ? 'futures.order.partially_filled'
              : eventKind === 'cancelled'
                ? 'futures.order.cancelled'
                : eventKind === 'expired'
                  ? 'futures.order.expired'
                  : 'futures.order.created';
        this.eventBus.publish(eventType, order, `player:${order.playerId}`);
      },
      onQuote: (contract) => {
        this.eventBus.publish('futures.quote.updated', contract);
      },
      onOrderBook: (book) => {
        this.eventBus.publish('futures.orderbook.updated', book, `futures:${book.symbol}`);
      },
      onTrade: (trade) => {
        const buyer = this.players.get(trade.buyerId);
        const seller = this.players.get(trade.sellerId);
        if (buyer) buyer.tradingVolumeMinor += trade.notionalMinor;
        if (seller) seller.tradingVolumeMinor += trade.notionalMinor;
        this.eventBus.publish('futures.trade.executed', trade, `futures:${trade.symbol}`);
        if (buyer?.role === 'PLAYER') {
          this.eventBus.publish('futures.trade.executed', trade, `player:${trade.buyerId}`);
        }
        if (seller?.role === 'PLAYER' && trade.sellerId !== trade.buyerId) {
          this.eventBus.publish('futures.trade.executed', trade, `player:${trade.sellerId}`);
        }
        this.emitPlayerFinancialSync(trade.buyerId);
        this.emitPlayerFinancialSync(trade.sellerId);
      },
      onCandle: (symbol, candles) => {
        this.eventBus.publish('futures.candle.updated', { symbol, candles }, `futures:${symbol}`);
      },
      onPosition: (playerId, position, symbol) => {
        const rec = this.players.get(playerId);
        if (rec?.role === 'PLAYER') {
          this.eventBus.publish(
            'futures.position.updated',
            { playerId, symbol, position },
            `player:${playerId}`,
          );
          this.emitPlayerFinancialSync(playerId);
        }
      },
      onFunding: (event) => {
        this.eventBus.publish('futures.funding.settled', event);
      },
      onLiquidation: (event) => {
        this.eventBus.publish('futures.liquidation.executed', event);
        this.emitPlayerFinancialSync(event.playerId);
      },
      onMarginCall: (position) => {
        const rec = this.players.get(position.playerId);
        if (rec?.role === 'PLAYER') {
          this.eventBus.publish('futures.margin_call', position, `player:${position.playerId}`);
        }
      },
    });
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
    this.centralBanks.reset();
    this.forexBots.reset();
    this.futures.reset();
    this.futuresBots.reset();
    this.economy.reset();
    this.properties.reset();
    this.business.reset();
    this.banking.reset();

    // 1. Seed 6 ECX Crypto + 8 ESE Stocks + 6 EFX Forex Pairs
    const assets = buildSeedAssets();
    for (const asset of assets) {
      this.matching.registerAsset(asset, true);
    }
    const forexPairs = buildSeedForexPairs();
    for (const pair of forexPairs) {
      this.matching.registerAsset(pair, true);
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

    // 2b. Register & fund 5 Finite-Capital AI Forex Market Participants
    this.forexBots.fundAgents();
    const initialRatesToCR = this.centralBanks.computeRatesToCR(forexPairs);
    for (const fxAgent of FOREX_AI_AGENTS) {
      let initialTotalCrMinor = 0;
      for (const currency of ALL_CURRENCIES) {
        initialTotalCrMinor += toMinor(fxAgent.initialBalancesMajor[currency] * initialRatesToCR[currency]);
      }
      this.players.set(fxAgent.id, {
        id: fxAgent.id,
        username: fxAgent.username,
        avatarInitials: fxAgent.username.slice(0, 2).toUpperCase(),
        role: fxAgent.role,
        joinedAt: new Date().toISOString(),
        level: 10,
        exp: 10_000,
        title: fxAgent.role === 'MARKET_MAKER' ? 'FX Liquidity Desk' : 'Institutional FX Bot',
        startingCapitalMinor: initialTotalCrMinor,
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

    // 3. Populate initial resting order books across ECX, ESE & EFX via real MatchingEngine
    this.marketMakers.seedInitialOrderBooks(this.economy.state.volatilityRegime);
    this.forexBots.seedInitialOrderBooks();

    // 3b. Seed 6 Empire Futures Exchange Perpetual Contracts & 5 Finite-Capital Futures AI Desks
    this.futures.bootstrapContracts();
    this.futuresBots.fundBots();
    for (const fBot of FUTURES_AI_BOTS) {
      this.players.set(fBot.id, {
        id: fBot.id,
        username: fBot.username,
        avatarInitials: fBot.username.slice(0, 2).toUpperCase(),
        role: fBot.role,
        joinedAt: new Date().toISOString(),
        level: 10,
        exp: 10_000,
        title: fBot.role === 'MARKET_MAKER' ? 'Perp Liquidity Desk' : 'Futures AI Desk',
        startingCapitalMinor: toMinor(fBot.initialCapitalCR),
        tradingVolumeMinor: 0,
        achievements: [],
        netWorthHistory: [],
      });
    }
    this.futuresBots.seedInitialOrderBooks();

    // 4. Seed initial grounded news & sync ledger + Central Bank metrics
    this.economy.seedInitialNews(assets);
    this.economy.syncLedgerMetrics(this.ledger);
    this.centralBanks.syncEmpireCentralBank(this.economy.state, this.economy.state.totalMoneySupplyMinor);
    this.economy.news.unshift({
      id: 'news_boot_efx',
      headline: '[EFX] Empire Forex Exchange mở giao dịch 24/7 cho 6 cặp ngoại hối mô phỏng',
      summary:
        'Tỷ giá EUR-SIM/USD-SIM, GBP-SIM/USD-SIM, USD-SIM/JPY-SIM, AUD-SIM/USD-SIM, USD-SIM/CR và EUR-SIM/CR được hình thành hoàn toàn từ sổ lệnh thực trên Matching Engine.',
      category: 'FOREX',
      relatedSymbols: ['EUR-SIM/USD-SIM', 'USD-SIM/CR', 'USD-SIM/JPY-SIM'],
      sentiment: 'NEUTRAL',
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: new Date().toISOString(),
    });
    this.economy.news.unshift({
      id: 'news_boot_futures',
      headline: '[EMPIRE FUTURES] Ra mắt 6 hợp đồng vĩnh cửu ký quỹ bằng CR (Isolated Margin 1x–10x)',
      summary:
        'BTC-SIM/CR-PERP, ETH-SIM/CR-PERP, SOL-SIM/CR-PERP, NOVA/CR-PERP, TITAN/CR-PERP và EUR-SIM/CR-PERP vận hành với sổ lệnh độc lập, Mark Price chống thao túng, Funding ngang hàng tổng bằng 0 và Quỹ bảo hiểm hữu hạn.',
      category: 'MACRO',
      relatedSymbols: ['BTC-SIM', 'ETH-SIM', 'NOVA'],
      sentiment: 'NEUTRAL',
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: new Date().toISOString(),
    });

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

    // Every 8s: simulated economic agent tick (ECX/ESE + EFX real orders through MatchingEngine) + auction expiry check
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

        const fxRes = this.forexBots.runForexTick();
        for (const trade of fxRes.trades) {
          this.onTradeExecuted(trade);
        }
        for (const sym of fxRes.affectedSymbols) {
          const asset = this.matching.getAsset(sym);
          if (asset) {
            this.eventBus.publish('market.quote.updated', asset);
            this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
          }
        }

        // Expire any stale orders across Spot/Crypto/Forex and Futures
        this.expireStaleOrders();

        // Empire Futures Exchange tick: AI bot liquidity & orders -> Mark Price refresh -> Liquidation Engine -> Due Funding
        this.futuresBots.runFuturesTick(this.economy.state);
        this.futures.refreshAllMarkPrices();
        this.futures.runLiquidationCheck();
        this.futures.settleDueFunding();

        const settledAuctions = this.properties.settleExpiredAuctions();
        for (const auc of settledAuctions) {
          this.eventBus.publish('auction.ended', auc);
        }
      } catch (err) {
        console.error('[WorldEngine] market tick error:', err);
      }
    }, 8_000);

    // Every 60s: economy event, Central Bank FX policy cycle, business operating cycle, rental payouts, bank interest, leaderboard broadcast
    const macroTimer = setInterval(() => {
      try {
        const { newEvent, newNews } = this.economy.tickEconomy(this.matching);
        this.economy.syncLedgerMetrics(this.ledger);
        this.centralBanks.syncEmpireCentralBank(this.economy.state, this.economy.state.totalMoneySupplyMinor);

        if (newEvent) this.eventBus.publish('economy.event', newEvent);
        if (newNews) {
          this.eventBus.publish('news.published', newNews);
          this.futuresBots.reactToNews(newNews);
        }

        this.triggerCentralBankEvent();
        this.futures.refreshAllMarkPrices();
        this.futures.runLiquidationCheck();

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
          simulatedAgentsCount: SIMULATED_AGENTS.length + FOREX_AI_AGENTS.length + FUTURES_AI_BOTS.length,
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
   * Resets a player's isolated Practice account back to 100,000 CR without affecting WORLD-01 or other players.
   */
  public resetPracticePlayer(playerId: string): PlayerProfile {
    if (this.worldId !== 'WORLD-PRACTICE') {
      throw new DomainError('FORBIDDEN_IN_PRODUCTION', 'Chức năng đặt lại tài khoản chỉ khả dụng trong Phòng Luyện Tập.', 403);
    }
    const record = this.players.get(playerId);
    if (!record) {
      throw new DomainError('UNAUTHORIZED', undefined, 401);
    }

    this.matching.cancelAllPlayerOrders(playerId);
    this.futures.resetPlayerPracticeState(playerId);
    this.ledger.resetPracticePlayerBalances(playerId, STARTING_CAPITAL_MINOR);

    record.tradingVolumeMinor = 0;
    const nowIso = new Date().toISOString();
    record.netWorthHistory = [
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
    ];

    this.economy.syncLedgerMetrics(this.ledger);
    this.emitPlayerFinancialSync(playerId);
    return this.getPlayerProfile(playerId)!;
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

    const clonedWallet = cloneWallet(wallet);
    const fxPairs = this.matching.listAssets('FOREX');
    const ratesToCR = this.centralBanks.computeRatesToCR(fxPairs);
    let forexValueMinor = 0;
    for (const currency of ALL_CURRENCIES) {
      if (currency === 'CR') continue;
      const bal = clonedWallet.currencyBalances[currency];
      if (!bal) continue;
      const totalMajor = fromCurrencyMinor(bal.availableMinor + bal.lockedMinor, currency);
      if (totalMajor > 0) {
        forexValueMinor += toMinor(totalMajor * ratesToCR[currency]);
      }
    }

    const totalCashMinor =
      clonedWallet.availableMinor +
      clonedWallet.lockedMinor +
      clonedWallet.savingsMinor +
      clonedWallet.termDepositMinor;

    const futuresVal = this.futures.getPlayerFuturesValuation(playerId);
    const futuresEquityMinor = futuresVal.equityMinor;
    const futuresMarginMinor = futuresVal.isolatedMarginMinor + futuresVal.openOrderMarginMinor;
    const futuresUnrealizedPnlMinor = futuresVal.unrealizedPnlMinor;

    const netWorthMinor =
      totalCashMinor +
      stockValueMinor +
      cryptoValueMinor +
      forexValueMinor +
      futuresEquityMinor +
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
      wallet: clonedWallet,
      holdings: holdings.map((h) => ({ ...h })),
      realizedPnlMinor,
      unrealizedPnlMinor: unrealizedPnlMinor + futuresUnrealizedPnlMinor,
      stockValueMinor,
      cryptoValueMinor,
      forexValueMinor,
      futuresEquityMinor,
      futuresMarginMinor,
      futuresUnrealizedPnlMinor,
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
      simulatedAgentsCount: SIMULATED_AGENTS.length + FOREX_AI_AGENTS.length + FUTURES_AI_BOTS.length,
      gameClock: this.economy.getGameClock(),
      economy: { ...this.economy.state, activeEvents: [...this.economy.state.activeEvents] },
      assets: this.matching.listAssets().map((a) => ({ ...a })),
      news: this.economy.news.slice(0, 30),
      player: playerId ? this.getPlayerProfile(playerId) : null,
    };
  }

  public getForexOverview(): ForexOverviewSnapshot {
    const fxPairs = this.matching.listAssets('FOREX');
    return {
      pairs: fxPairs.map((p) => ({ ...p })),
      centralBanks: this.centralBanks.listCentralBanks(),
      calendar: this.centralBanks.listCalendar(),
      recentPolicyEvents: this.centralBanks.listRecentPolicyEvents(15),
      currencyStrength: this.centralBanks.computeCurrencyStrength(fxPairs),
      ratesToCR: this.centralBanks.computeRatesToCR(fxPairs),
      fxAgents: this.forexBots.listAgentSummaries(),
    };
  }

  public triggerCentralBankEvent(targetCurrency?: CurrencyCode) {
    const gameDay = this.economy.getGameClock().gameDay;
    const { policyEvent, newsItem } = this.centralBanks.triggerPolicyEvent(targetCurrency, gameDay);

    this.economy.news.unshift(newsItem);
    if (this.economy.news.length > 60) this.economy.news.pop();
    this.eventBus.publish('news.published', newsItem);

    const reaction = this.forexBots.reactToPolicyEvent(policyEvent);
    for (const trade of reaction.trades) {
      this.onTradeExecuted(trade);
    }
    for (const sym of reaction.affectedSymbols) {
      const asset = this.matching.getAsset(sym);
      if (asset) {
        this.eventBus.publish('market.quote.updated', asset);
        this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
      }
    }

    const overview = this.getForexOverview();
    this.eventBus.publish('forex.central_bank.updated', overview);

    return {
      policyEvent,
      newsItem,
      tradesExecuted: reaction.trades.length,
      affectedSymbols: reaction.affectedSymbols,
      overview,
    };
  }

  // ============================================================================
  // EMPIRE FUTURES EXCHANGE (PERPETUAL FUTURES — AUTHORITATIVE ENTRY POINTS)
  // ============================================================================

  public getFuturesOverview(): FuturesOverviewSnapshot {
    return {
      contracts: this.futures.listContracts(),
      insuranceFund: this.futures.getInsuranceFundState(),
      recentLiquidations: this.futures.listRecentLiquidations(30),
      recentFundingSettlements: this.futures.listFundingSettlements(undefined, 30),
      bots: this.futuresBots.listBotSummaries(),
      riskTiers: FUTURES_RISK_TIERS,
      crossMarginStatus: {
        enabled: false,
        reason: this.futures.crossMargin.statusReason,
      },
    };
  }

  public getFuturesAccount(playerId: string): FuturesAccountSummary {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    return this.futures.getPlayerAccountSummary(playerId);
  }

  public acknowledgeFuturesRisk(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    return this.futures.acknowledgeRisk(playerId);
  }

  public placeFuturesOrder(
    playerId: string,
    input: Omit<PlaceFuturesOrderCommand, 'playerId' | 'playerName'>,
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');

    if (player.role === 'PLAYER') {
      this.security.checkRateLimit(`futures_order:${playerId}`, 25, 10_000, playerId);
    }

    const result = this.futures.placeOrder({
      ...input,
      playerId: player.id,
      playerName: player.username,
    });

    if (!result.deduplicated) {
      this.economy.syncLedgerMetrics(this.ledger);
      this.emitPlayerFinancialSync(playerId);
      if (result.trades.length > 0) {
        this.unlockAchievement(
          playerId,
          'FIRST_FUTURES_TRADE',
          'Nhà giao dịch Phái sinh',
          'Hoàn thành lệnh khớp hợp đồng vĩnh cửu đầu tiên trên Empire Futures Exchange.',
          75,
        );
      }
    }

    return result;
  }

  public cancelFuturesOrder(playerId: string, orderId: string) {
    const result = this.futures.cancelOrder(orderId, playerId);
    this.emitPlayerFinancialSync(playerId);
    return result;
  }

  public addFuturesPositionMargin(playerId: string, positionId: string, amountCR: number) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');
    const position = this.futures.addPositionMargin(playerId, positionId, toMinor(amountCR));
    this.emitPlayerFinancialSync(playerId);
    return position;
  }

  public closeFuturesPosition(
    playerId: string,
    positionId: string,
    input: { type?: 'MARKET' | 'LIMIT'; priceCR?: number; quantity?: number; idempotencyKey?: string },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED');

    const pos = this.futures.listPlayerPositions(playerId).find((p) => p.id === positionId);
    if (!pos) throw new DomainError('FUTURES_POSITION_NOT_FOUND');

    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const qty = input.quantity ? Math.min(input.quantity, pos.quantity) : pos.quantity;

    return this.placeFuturesOrder(playerId, {
      symbol: pos.symbol,
      side: closeSide,
      type: input.type ?? 'MARKET',
      timeInForce: input.type === 'LIMIT' ? 'GTC' : 'IOC',
      priceCR: input.priceCR,
      quantity: qty,
      leverage: pos.leverage,
      reduceOnly: true,
      idempotencyKey: input.idempotencyKey,
    });
  }

  public devSettleFuturesFunding(symbol?: string) {
    const contracts = symbol
      ? [this.futures.getContract(symbol)].filter((c): c is NonNullable<typeof c> => Boolean(c))
      : this.futures.listContracts();
    const events = contracts.map((c) => this.futures.settleFundingForSymbol(c.symbol));
    return {
      events,
      overview: this.getFuturesOverview(),
    };
  }

  public devSimulateFuturesTick(symbol?: string) {
    const tick = this.futuresBots.runFuturesTick(this.economy.state, symbol);
    this.futures.refreshAllMarkPrices();
    const liq = this.futures.runLiquidationCheck(symbol);
    return {
      tradesExecuted: tick.trades.length + liq.trades.length,
      affectedSymbols: tick.affectedSymbols,
      marginCalls: liq.marginCalls.length,
      liquidations: liq.liquidations.length,
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

    // Order lifecycle events for both resting counterparties and the incoming order
    // are emitted authoritatively by MatchingEngine's bound `onOrderUpdated` hook.

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
    // `order.cancelled` is emitted authoritatively via MatchingEngine's `onOrderUpdated` hook
    this.eventBus.publish('market.orderbook.updated', result.orderBook, `market:${result.order.symbol}`);
    this.emitPlayerFinancialSync(playerId);
    return result;
  }

  public expireStaleOrders(nowMs = Date.now()) {
    const expiredSpot = this.matching.expireOrders(nowMs);
    const expiredFutures = this.futures.expireOrders(nowMs);

    const affectedSpotSymbols = new Set<string>();
    const affectedPlayers = new Set<string>();

    for (const ord of expiredSpot) {
      affectedSpotSymbols.add(ord.symbol);
      affectedPlayers.add(ord.playerId);
    }
    for (const ord of expiredFutures) {
      affectedPlayers.add(ord.playerId);
    }

    for (const sym of affectedSpotSymbols) {
      const asset = this.matching.getAsset(sym);
      if (asset) {
        this.eventBus.publish('market.quote.updated', asset);
        this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
      }
    }

    for (const pid of affectedPlayers) {
      this.emitPlayerFinancialSync(pid);
    }

    return {
      expiredSpot,
      expiredFutures,
    };
  }

  public devSimulateBotTick(symbol?: string) {
    this.expireStaleOrders();
    const result = this.marketMakers.runSimulationTick(this.economy.state, symbol);
    for (const trade of result.trades) {
      this.onTradeExecuted(trade);
    }
    for (const sym of result.affectedSymbols) {
      const asset = this.matching.getAsset(sym);
      if (asset) {
        this.eventBus.publish('market.quote.updated', asset);
        this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
      }
    }
    return result;
  }

  private onTradeExecuted(trade: {
    id: string;
    symbol: string;
    buyerId: string;
    sellerId: string;
    grossAmountMinor: number;
  }): void {
    let volumeCrMinor = trade.grossAmountMinor;
    const asset = this.matching.getAsset(trade.symbol);
    if (asset?.marketClass === 'FOREX' && asset.quoteCurrency && asset.quoteCurrency !== 'CR') {
      const rates = this.centralBanks.computeRatesToCR(this.matching.listAssets('FOREX'));
      const quoteMajor = fromCurrencyMinor(trade.grossAmountMinor, asset.quoteCurrency);
      volumeCrMinor = toMinor(quoteMajor * rates[asset.quoteCurrency]);
    }

    const buyer = this.players.get(trade.buyerId);
    const seller = this.players.get(trade.sellerId);
    if (buyer) buyer.tradingVolumeMinor += volumeCrMinor;
    if (seller) seller.tradingVolumeMinor += volumeCrMinor;

    this.eventBus.publish('market.trade.executed', trade, `market:${trade.symbol}`);
    if (buyer?.role === 'PLAYER') {
      this.eventBus.publish('trade.executed', trade, `player:${trade.buyerId}`);
    }
    if (seller?.role === 'PLAYER' && trade.sellerId !== trade.buyerId) {
      this.eventBus.publish('trade.executed', trade, `player:${trade.sellerId}`);
    }
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
      simulatedAgentsCount: SIMULATED_AGENTS.length + FOREX_AI_AGENTS.length + FUTURES_AI_BOTS.length,
      matchingEngineHealth: 'OPERATIONAL',
      totalOrders: this.matching.getTotalOrdersCount() + this.futures.getTotalOrdersCount(),
      openOrdersCount: this.matching.getOpenOrdersCount() + this.futures.getOpenOrdersCount(),
      totalTrades: this.matching.getTotalTradesCount() + this.futures.getTotalTradesCount(),
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
