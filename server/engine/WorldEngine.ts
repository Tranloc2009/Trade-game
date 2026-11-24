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
import type {
  BotAgentTelemetry,
  BotEcosystemOverview,
} from '../../shared/contracts/bots';
import type { NewsItem } from '../../shared/contracts/types';
import { AutonomousBotEngine, type BotTickOptions, type BotTickResult } from './bots/AutonomousBotEngine';
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
import { BusinessEmpireEngine } from './v4/BusinessEmpireEngine';
import { CareerRankEngine, resolveWealthRank, type PlayerCareerMetricsSnapshot } from './v4/CareerRankEngine';
import { InvestmentFundEngine } from './v4/InvestmentFundEngine';
import { LuxuryClubEngine } from './v4/LuxuryClubEngine';
import { WorldMacroV4Engine } from './v4/WorldMacroV4Engine';
import { BUSINESS_CATALOG } from './v4/V4Catalog';
import { CoFounderEngine } from './cofounder/CoFounderEngine';
import { ConnectEngine } from './connect/ConnectEngine';
import type {
  BoardProposalType,
  CapitalProjectPolicy,
  CapitalProjectVisibility,
  CapitalRoundType,
  CoFounderCapitalHubPayload,
  CoFounderInvite,
  CompanyRole,
  WorldMode,
} from '../../shared/contracts/cofounder';
import type {
  BusinessModelType,
  EmployeeRole,
  FundGovernanceProposal,
  FundType,
  GovernanceProposalType,
  MaDealType,
  OwnedLuxuryAsset,
  V4CityCode,
} from '../../shared/contracts/v4';

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

  publish<T>(eventType: RealtimeEventType, payload: T, room?: string, marketId?: string): RealtimeEnvelope<T> {
    this.sequenceNumber += 1;
    const envelope: RealtimeEnvelope<T> = {
      eventId: `evt_${this.sequenceNumber}_${crypto.randomBytes(4).toString('hex')}`,
      eventType,
      worldId: this.worldId,
      ...(marketId ? { marketId } : {}),
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
  botAgentCount?: number;
  botSeed?: number;
  botCpuBudgetMs?: number;
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
  public readonly bots: AutonomousBotEngine;
  public readonly economy: EconomyEngine;
  public readonly properties: PropertyEngine;
  public readonly business: BusinessEngine;
  public readonly banking: BankingEngine;
  public readonly macroV4: WorldMacroV4Engine;
  public readonly businessEmpire: BusinessEmpireEngine;
  public readonly funds: InvestmentFundEngine;
  public readonly luxury: LuxuryClubEngine;
  public readonly career: CareerRankEngine;
  public readonly cofounder: CoFounderEngine;
  public readonly connect: ConnectEngine;

  private players = new Map<string, PlayerRecord>();
  private chatMessages: ChatMessage[] = [];
  private stateVersion = 1;
  private bootedAtMs = Date.now();
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private v4MacroTickSeq = 0;

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
    const envBotCount = Number(process.env.BOT_AGENT_COUNT);
    const initialBotCount =
      options.botAgentCount ?? (Number.isFinite(envBotCount) && envBotCount >= 8 ? Math.floor(envBotCount) : 24);
    this.bots = new AutonomousBotEngine(this.ledger, this.matching, this.futures, {
      agentCount: initialBotCount,
      seed: options.botSeed,
      cpuBudgetMsPerTick: options.botCpuBudgetMs,
    });
    this.economy = new EconomyEngine(options.calendarMode ?? 'ACCELERATED');
    this.properties = new PropertyEngine(this.worldId, this.ledger);
    this.business = new BusinessEngine(this.worldId, this.ledger);
    this.banking = new BankingEngine(this.ledger);
    this.macroV4 = new WorldMacroV4Engine();
    this.businessEmpire = new BusinessEmpireEngine(this.worldId, this.ledger, this.matching);
    this.funds = new InvestmentFundEngine(this.worldId, this.ledger, this.matching);
    this.luxury = new LuxuryClubEngine(this.ledger);
    this.career = new CareerRankEngine();
    this.cofounder = new CoFounderEngine(this.worldId, this.ledger, this.businessEmpire, this.funds);
    this.connect = new ConnectEngine({
      worldId: this.worldId,
      getOnlineHumanPlayerIds: () => Array.from(this.onlineHumanPlayerIds),
      listHumanPlayers: () =>
        Array.from(this.players.values())
          .filter((p) => p.role === 'PLAYER')
          .map((p) => ({
            id: p.id,
            username: p.username,
            avatarInitials: p.avatarInitials,
            joinedAt: p.joinedAt,
            level: p.level,
            title: p.title,
            achievements: [...p.achievements],
          })),
      getPlayerPublicSnapshot: (playerId: string) => {
        const p = this.players.get(playerId);
        if (!p || p.role !== 'PLAYER') return null;
        const ownedCompanies = this.business
          .listCompanies()
          .filter((c) => c.founderId === playerId || c.shareholders.some((s) => s.playerId === playerId));
        const ownedProps = this.properties.listProperties().filter((prop) => prop.ownerId === playerId);
        const profile = this.getPlayerProfile(playerId);
        return {
          id: p.id,
          username: p.username,
          avatarInitials: p.avatarInitials,
          joinedAt: p.joinedAt,
          level: p.level,
          title: p.title,
          achievements: [...p.achievements],
          companies: ownedCompanies.map((c) => ({
            id: c.id,
            name: c.name,
            ticker: c.ticker,
            sector: c.sector,
            level: c.capacityLevel,
            modeContext: 'ONLINE' as const,
          })),
          propertyCount: ownedProps.length,
          propertyPortfolioValueMinor: profile?.propertyValueMinor ?? 0,
          businessValuationMinor: profile?.businessEquityMinor ?? 0,
          onlineEmpireScoreMinor: profile?.netWorthMinor ?? 0,
        };
      },
      checkRateLimit: (bucket: string, maxRequests: number, windowMs: number, actorId?: string) => {
        this.security.checkRateLimit(bucket, maxRequests, windowMs, actorId);
      },
      recordSecurityAudit: (actorId: string, action: string, severity: 'INFO' | 'WARN' | 'CRITICAL', detail: string) => {
        this.security.recordAudit(actorId, action, severity === 'CRITICAL' ? 'ALERT' : severity, detail);
      },
      publishEvent: <T,>(eventType: RealtimeEventType, payload: T, room?: string, marketId?: string) => {
        this.eventBus.publish(eventType, payload, room, marketId);
      },
    });

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
        this.bots.onFuturesLiquidation(event.playerId, event.symbol);
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
    this.bots.reset();
    this.economy.reset();
    this.properties.reset();
    this.business.reset();
    this.banking.reset();
    this.macroV4.reset();
    this.businessEmpire.reset();
    this.funds.reset();
    this.luxury.reset();
    this.career.reset();
    this.cofounder.reset();
    this.connect.reset();
    this.v4MacroTickSeq = 0;

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

    // 3c. Seed Autonomous AI Trading Ecosystem V2 (8 Archetypes — Finite Capital, Public-Data Only)
    this.bots.fundAgents(assets);
    for (const botCfg of this.bots.listAgentConfigs()) {
      this.players.set(botCfg.id, {
        id: botCfg.id,
        username: botCfg.username,
        avatarInitials: botCfg.username.slice(0, 2).toUpperCase(),
        role: botCfg.role,
        joinedAt: new Date().toISOString(),
        level: 10,
        exp: 10_000,
        title: botCfg.strategyLabel,
        startingCapitalMinor: toMinor(botCfg.initialCapitalCR),
        tradingVolumeMinor: 0,
        achievements: [],
        netWorthHistory: [],
      });
    }
    this.bots.seedInitialLiquidity(this.economy.state);

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

    // 5. Seed V4 Multiplayer Living World (NPC-owned businesses, private offering & 2 public investment funds from finite NPC wallets)
    this.seedV4MultiplayerEcosystem();

    // 6. Initial welcome world message (system notice, clearly labeled)
    this.chatMessages.push({
      id: 'chat_boot_1',
      channel: 'WORLD',
      senderId: 'SYSTEM',
      senderName: 'WORLD-01 System',
      senderTitle: 'Exchange Notice',
      content:
        'Chào mừng tới WORLD-01: GLOBAL ECONOMY — V4 RISE OF BILLIONAIRES (DEMO — TEMPORARY SERVER). Mọi giao dịch được khớp theo cơ chế Price-Time Priority trên máy chủ chung.',
      timestamp: new Date().toISOString(),
      reportedBy: [],
    });

    this.stateVersion += 1;
  }

  private seedV4MultiplayerEcosystem(): void {
    const instA = SIMULATED_AGENTS[1]; // Institutional finite-capital NPC
    const instB = SIMULATED_AGENTS[2] ?? SIMULATED_AGENTS[1];
    if (!instA || !instB) return;

    try {
      // Seed 3 realistic VN businesses operated by finite-capital institutional NPCs
      const b1 = this.businessEmpire.createBusiness({
        founderId: instA.id,
        founderName: instA.username,
        businessTypeId: 'fnb_coffee_shop',
        businessName: 'Saigon Heritage Roastery',
        ticker: 'SGR',
        cityCode: 'HCMC',
        locationLabel: 'Quận 1 — Nguyễn Huệ, TP.HCM',
        businessModel: 'PREMIUM_NICHE',
        initialCapitalCR: 95_000,
        founderNetWorthMinor: 4_500_000 * 100,
        idempotencyKey: 'seed_v4_b1',
      });
      const b2 = this.businessEmpire.createBusiness({
        founderId: instB.id,
        founderName: instB.username,
        businessTypeId: 'tech_software_startup',
        businessName: 'Thăng Long Cloud Core',
        ticker: 'TLC',
        cityCode: 'HANOI',
        locationLabel: 'Cầu Giấy — Duy Tân, Hà Nội',
        businessModel: 'B2B_CONTRACT',
        initialCapitalCR: 180_000,
        founderNetWorthMinor: 4_500_000 * 100,
        idempotencyKey: 'seed_v4_b2',
      });
      this.businessEmpire.createBusiness({
        founderId: instA.id,
        founderName: instA.username,
        businessTypeId: 'hosp_mini_hotel',
        businessName: 'Mỹ Khê Boutique Hotel',
        ticker: 'MKR',
        cityCode: 'DANANG',
        locationLabel: 'Sơn Trà — Võ Nguyên Giáp, Đà Nẵng',
        businessModel: 'PREMIUM_NICHE',
        initialCapitalCR: 240_000,
        founderNetWorthMinor: 4_500_000 * 100,
        idempotencyKey: 'seed_v4_b3',
      });

      // Run 1 initial operating cycle so starter businesses show real operating metrics & financials
      const clock = this.economy.getGameClock();
      this.businessEmpire.runOperatingCycle({
        tickId: 'v4_seed_cycle_1',
        gameDay: clock.gameDay,
        currentGameHourTotal: clock.gameHour,
        macro: this.macroV4.indicators,
      });

      // Open 1 primary capital raise listing & 1 secondary share listing so players can invest right away
      this.businessEmpire.createPrivateShareListing({
        businessId: b1.id,
        sellerId: instA.id,
        sellerName: instA.username,
        offeringType: 'SECONDARY',
        shares: 2_500,
        pricePerShareCR: 11.5,
      });
      this.businessEmpire.createPrivateShareListing({
        businessId: b2.id,
        sellerId: instB.id,
        sellerName: instB.username,
        offeringType: 'PRIMARY',
        shares: 3_000,
        pricePerShareCR: 21,
      });

      // Seed 2 realistic public multiplayer Investment Funds with live ESE/ECX/T-Bill allocations
      const f1 = this.funds.createFund({
        founderId: instA.id,
        founderName: instA.username,
        name: 'Saigon Growth Equity Fund',
        code: 'SGEF',
        fundType: 'STOCK_FUND',
        description: 'Quỹ cổ phiếu tăng trưởng tập trung vào các tập đoàn công nghệ và tài chính hàng đầu trên sàn ESE.',
        managementFeeAnnualPct: 1.5,
        redemptionFeePct: 0.5,
        maxSinglePositionPct: 35,
        minCashReservePct: 15,
        initialCapitalCR: 250_000,
        isPublic: true,
        logoColor: '#38bdf8',
        idempotencyKey: 'seed_v4_f1',
      });
      this.funds.executeFundTrade({ fundId: f1.id, managerId: instA.id, symbol: 'NOVA', side: 'BUY', amountCR: 70_000 });
      this.funds.executeFundTrade({ fundId: f1.id, managerId: instA.id, symbol: 'TITAN', side: 'BUY', amountCR: 60_000 });
      this.funds.executeFundTrade({ fundId: f1.id, managerId: instA.id, symbol: 'AERO', side: 'BUY', amountCR: 50_000 });

      const f2 = this.funds.createFund({
        founderId: instB.id,
        founderName: instB.username,
        name: 'Indochina Balanced Alpha',
        code: 'IBAF',
        fundType: 'MULTI_ASSET_FUND',
        description: 'Quỹ đa tài sản cân bằng giữa cổ phiếu, bất động sản Việt Nam, crypto giao ngay và tín phiếu phòng thủ.',
        managementFeeAnnualPct: 1.2,
        redemptionFeePct: 0.4,
        maxSinglePositionPct: 30,
        minCashReservePct: 20,
        initialCapitalCR: 200_000,
        isPublic: true,
        logoColor: '#10b981',
        idempotencyKey: 'seed_v4_f2',
      });
      this.funds.executeFundTrade({ fundId: f2.id, managerId: instB.id, symbol: 'VN-RE-HCMC', side: 'BUY', amountCR: 50_000 });
      this.funds.executeFundTrade({ fundId: f2.id, managerId: instB.id, symbol: 'TBILL-30D', side: 'BUY', amountCR: 45_000 });
      this.funds.executeFundTrade({ fundId: f2.id, managerId: instB.id, symbol: 'BTC-SIM', side: 'BUY', amountCR: 35_000 });

      this.funds.markToMarketAndAccrueFees(this.macroV4.indicators);
    } catch (err) {
      console.error('[WorldEngine] V4 seed ecosystem warning:', err);
    }
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

        // Autonomous AI Trading Ecosystem V2 tick (24/7 server-authoritative across Spot, Meme Coins & Futures)
        this.runAutonomousBotTick();

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
          this.triggerBotNewsReaction(newNews);
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

        // V4 Rise of Billionaires unified macro, business operating, fund MTM, luxury & career progression tick
        this.runV4MacroAndOperatingCycle();

        this.snapshotHumanNetWorthHistory();

        this.eventBus.publish('world.status', {
          gameClock: this.economy.getGameClock(),
          economy: this.economy.state,
          onlineHumanPlayers: this.onlineHumanPlayerIds.size,
          simulatedAgentsCount: this.getTotalSimulatedAgentsCount(),
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

  public hasPlayerUsername(username: string): boolean {
    const lower = username.trim().toLowerCase();
    for (const rec of this.players.values()) {
      if (rec.username.toLowerCase() === lower) return true;
    }
    return false;
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
    const businessEquityMinor =
      this.business.getPlayerBusinessEquityMinor(playerId) +
      this.businessEmpire.getPlayerV4BusinessEquityMinor(playerId);
    const fundUnitsValueMinor = this.funds.getPlayerFundValueMinor(playerId);
    const luxuryAssetsValueMinor = this.luxury.getPlayerLuxuryValueMinor(playerId);
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
      businessEquityMinor +
      fundUnitsValueMinor +
      luxuryAssetsValueMinor -
      totalDebtMinor;

    const wealthRank = resolveWealthRank(netWorthMinor).current;

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
      fundUnitsValueMinor,
      luxuryAssetsValueMinor,
      wealthRankName: wealthRank.name,
      wealthRankTier: wealthRank.tier,
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
      simulatedAgentsCount: this.getTotalSimulatedAgentsCount(),
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

  // ============================================================================
  // AUTONOMOUS AI TRADING ECOSYSTEM V2 (24/7 AUTHORITATIVE AGENT ENGINE)
  // ============================================================================

  public getTotalSimulatedAgentsCount(): number {
    return (
      SIMULATED_AGENTS.length +
      FOREX_AI_AGENTS.length +
      FUTURES_AI_BOTS.length +
      this.bots.getConfiguredAgentCount()
    );
  }

  public runAutonomousBotTick(options: BotTickOptions = {}): BotTickResult {
    const result = this.bots.runTick(this.economy.state, this.economy.news, options);
    for (const trade of result.spotTrades) {
      this.onTradeExecuted(trade);
    }
    for (const sym of result.affectedSpotSymbols) {
      const asset = this.matching.getAsset(sym);
      if (asset) {
        this.eventBus.publish('market.quote.updated', asset);
        this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
        const latestCandles = this.candles.getCandles(sym, '5m', 2);
        if (latestCandles.length > 0) {
          this.eventBus.publish('market.candle.updated', { symbol: sym, candles: latestCandles }, `market:${sym}`);
        }
      }
    }
    this.futures.refreshAllMarkPrices();
    this.futures.runLiquidationCheck();
    this.economy.syncLedgerMetrics(this.ledger);
    return result;
  }

  private triggerBotNewsReaction(news: NewsItem) {
    const reaction = this.bots.reactToNews(news, this.economy.state);
    for (const trade of reaction.spotTrades) {
      this.onTradeExecuted(trade);
    }
    for (const sym of reaction.affectedSpotSymbols) {
      const asset = this.matching.getAsset(sym);
      if (asset) {
        this.eventBus.publish('market.quote.updated', asset);
        this.eventBus.publish('market.orderbook.updated', this.matching.getOrderBook(sym), `market:${sym}`);
      }
    }
    this.futures.refreshAllMarkPrices();
    this.futures.runLiquidationCheck();
    this.economy.syncLedgerMetrics(this.ledger);
    return reaction;
  }

  public publishNewsAndReact(news: NewsItem) {
    this.economy.news.unshift(news);
    if (this.economy.news.length > 60) this.economy.news.pop();
    this.eventBus.publish('news.published', news);
    this.futuresBots.reactToNews(news);
    return this.triggerBotNewsReaction(news);
  }

  public getBotEcosystemOverview(): BotEcosystemOverview {
    return this.bots.getOverview(this.economy.state, this.economy.news, this.onlineHumanPlayerIds.size);
  }

  public getBotAgentTelemetry(agentId: string): BotAgentTelemetry | null {
    return this.bots.getAgentTelemetry(agentId);
  }

  public reconfigureBotEcosystem(options: {
    agentCount?: number;
    seed?: number;
    cpuBudgetMsPerTick?: number;
  }): BotEcosystemOverview {
    this.bots.configure(options);
    this.bootstrapWorld();
    return this.getBotEcosystemOverview();
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
      simulatedAgentsCount: this.getTotalSimulatedAgentsCount(),
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

  // ============================================================================
  // TRADING EMPIRE V4 — RISE OF BILLIONAIRES AUTHORITATIVE ENTRY POINTS
  // ============================================================================

  public runV4MacroAndOperatingCycle(options?: { forceEventTemplateId?: string; tickId?: string }) {
    this.v4MacroTickSeq += 1;
    const tickId = options?.tickId ?? `v4_tick_${this.v4MacroTickSeq}`;
    const clock = this.economy.getGameClock();

    const macroRes = this.macroV4.tickMacro({
      tickId,
      gameDay: clock.gameDay,
      baseEconomy: this.economy.state,
      forceTemplateId: options?.forceEventTemplateId,
      activeBusinessCount: this.businessEmpire.listBusinesses().length,
    });

    if (macroRes.startedEvent) {
      this.eventBus.publish('economy.event.started', macroRes.startedEvent);
    }
    for (const ended of macroRes.endedEvents) {
      this.eventBus.publish('economy.event.ended', ended);
    }
    for (const newsItem of macroRes.generatedNews) {
      this.economy.news.unshift(newsItem);
      if (this.economy.news.length > 80) this.economy.news.pop();
      this.eventBus.publish('news.published', newsItem);
    }

    const updatedBusinesses = this.businessEmpire.runOperatingCycle({
      tickId,
      gameDay: clock.gameDay,
      currentGameHourTotal: clock.gameHour + this.v4MacroTickSeq * 6,
      macro: this.macroV4.indicators,
    });

    for (const biz of updatedBusinesses) {
      this.eventBus.publish('business.revenue.updated', {
        businessId: biz.id,
        businessName: biz.businessName,
        revenueMinor: biz.revenueLastCycleMinor,
        expensesMinor: biz.operatingExpensesLastCycleMinor,
        netProfitMinor: biz.netProfitLastCycleMinor,
        companyCashMinor: biz.companyCashMinor,
        status: biz.status,
      });
      if (
        (this.macroV4.indicators.phase === 'RECESSION' || this.macroV4.indicators.phase === 'SLOWDOWN') &&
        biz.status === 'ACTIVE'
      ) {
        this.career.recordCounter(biz.ownerId, 'survivedRecessionWithBusiness');
      }
    }

    const updatedFunds = this.funds.markToMarketAndAccrueFees(this.macroV4.indicators);
    const luxuryRes = this.luxury.runMaintenanceAndDepreciationCycle();

    // Re-evaluate progression for all human players
    for (const rec of this.players.values()) {
      if (rec.role === 'PLAYER') {
        this.syncPlayerCareerAndNotify(rec.id);
      }
    }
    for (const pid of luxuryRes.affectedPlayerIds) {
      this.emitPlayerFinancialSync(pid);
    }

    return {
      tickId,
      macro: this.macroV4.getOverview(),
      startedEvents: macroRes.startedEvent ? [macroRes.startedEvent] : [],
      endedEvents: macroRes.endedEvents,
      businessesUpdated: updatedBusinesses.length,
      fundsUpdated: updatedFunds.length,
      luxuryMaintenanceCollectedMinor: luxuryRes.totalMaintenanceCollectedMinor,
    };
  }

  public getV4PlayerCareer(playerId: string) {
    const rec = this.players.get(playerId);
    if (!rec) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return this.syncPlayerCareerAndNotify(playerId);
  }

  public syncPlayerCareerAndNotify(playerId: string) {
    const rec = this.players.get(playerId);
    const profile = this.getPlayerProfile(playerId);
    if (!rec || !profile) return null;

    const counters = this.career.getCounters(playerId);
    const allBiz = this.businessEmpire.listBusinesses();
    const ownedBiz = allBiz.filter((b) => b.ownerId === playerId || b.founderId === playerId);
    const allHoldings = this.businessEmpire.listHoldings().filter((h) => h.founderId === playerId);
    const allProps = this.properties.listProperties().filter((p) => p.ownerId === playerId);
    const allFunds = this.funds.listFunds();
    const myLuxury = this.luxury.listPlayerAssets(playerId);

    const propCities = new Set(allProps.map((p) => p.cityCode ?? 'HCMC'));
    const luxCats = new Set(myLuxury.map((a) => a.category));
    const tradesCount = this.matching.listPlayerTrades(playerId, 100).length;

    const metrics: PlayerCareerMetricsSnapshot = {
      playerId,
      username: rec.username,
      netWorthMinor: profile.netWorthMinor,
      totalDebtMinor: profile.totalDebtMinor,
      stockValueMinor: profile.stockValueMinor,
      forexValueMinor: profile.forexValueMinor,
      savingsAndTermMinor: profile.wallet.savingsMinor + profile.wallet.termDepositMinor,
      propertyValueMinor: profile.propertyValueMinor,
      distinctHoldings: profile.holdings.filter((h) => h.availableQty + h.lockedQty > 0).length,
      tradesExecuted: tradesCount,
      businessesFounded: ownedBiz.length,
      maxBusinessLevel: ownedBiz.reduce((max, b) => Math.max(max, b.level), 0),
      profitableBusinessCycles: ownedBiz.reduce(
        (cnt, b) => cnt + b.financialHistory.filter((f) => f.netProfitMinor > 0).length,
        0,
      ),
      totalBusinessEmployees: ownedBiz.reduce((sum, b) => sum + b.employeeCount, 0),
      businessUpgradesCompleted:
        counters.businessUpgradesCompleted +
        ownedBiz.reduce((sum, b) => sum + Object.values(b.upgradeTree).reduce((s, r) => s + r, 0), 0),
      branchesOpened: ownedBiz.reduce((sum, b) => sum + b.branches.length, 0),
      franchisesActive: this.businessEmpire
        .listFranchises()
        .filter((f) => f.franchiseePlayerId === playerId || ownedBiz.some((b) => b.id === f.franchisorBusinessId))
        .length,
      holdingsCreated: allHoldings.length,
      iposCompleted: ownedBiz.filter((b) => b.isPublicIpo).length,
      hasManufacturingLv4: ownedBiz.some((b) => b.industry === 'MANUFACTURING' && b.level >= 4),
      hasTechLv4: ownedBiz.some((b) => b.industry === 'TECHNOLOGY' && b.level >= 4),
      hasRetailOrFnbLv4: ownedBiz.some((b) => (b.industry === 'RETAIL' || b.industry === 'FNB') && b.level >= 4),
      hasHospitalityLv4: ownedBiz.some((b) => b.industry === 'HOSPITALITY' && b.level >= 4),
      hasRealEstateCompany: ownedBiz.some((b) => b.industry === 'REAL_ESTATE'),
      dividendsReceived: counters.dividendsReceived,
      privateShareDeals: counters.privateShareDeals,
      governanceVotesCast: counters.governanceVotesCast,
      maDealsCompleted: counters.maDealsCompleted,
      maControllingDealsCompleted: counters.maControllingDealsCompleted,
      propertiesOwned: allProps.length,
      propertiesRented: allProps.filter((p) => p.isRented).length,
      propertyCitiesOwned: propCities.size,
      hasHcmcProperty: propCities.has('HCM'),
      hasHanoiProperty: propCities.has('HN'),
      hasCoastalProperty: propCities.has('DN'),
      fundsCreated: allFunds.filter((f) => f.founderId === playerId).length,
      fundSubscriptionsOrTrades: counters.fundSubscriptionsOrTrades,
      hasFundMembership: allFunds.some((f) => f.members.some((m) => m.playerId === playerId && m.units > 0)),
      hasFundManagedTrade: counters.hasFundManagedTrade,
      supercarsOwned: myLuxury.filter((a) => a.category === 'SUPERCAR').length,
      penthouseOwned: myLuxury.some((a) => a.category === 'LUXURY_RESIDENCE'),
      jetsOwned: myLuxury.filter((a) => a.category === 'PRIVATE_JET').length,
      yachtsOwned: myLuxury.filter((a) => a.category === 'YACHT').length,
      collectiblesOwned: myLuxury.filter((a) => a.category === 'COLLECTIBLE').length,
      luxuryCustomizations: counters.luxuryCustomizations,
      luxuryDistinctCategories: luxCats.size,
      survivedRecessionWithBusiness: counters.survivedRecessionWithBusiness,
      restructuredOrRescuedBusiness: counters.restructuredOrRescuedBusiness,
    };

    const delta = this.career.evaluatePlayerProgression(metrics);
    if (rec.role === 'PLAYER') {
      rec.title = delta.profile.equippedTitleName;
      if (delta.rankChanged) {
        this.eventBus.publish('player.rank.changed', {
          playerId,
          username: rec.username,
          from: delta.rankChanged.from,
          to: delta.rankChanged.to,
        });
      }
      for (const m of delta.newlyCompletedMissions) {
        this.eventBus.publish(
          'career.mission.completed',
          { playerId, mission: m },
          `player:${playerId}`,
        );
      }
      for (const tid of delta.newlyUnlockedTitleIds) {
        this.eventBus.publish(
          'achievement.unlocked',
          { playerId, titleId: tid },
          `player:${playerId}`,
        );
      }
    }

    return delta.profile;
  }

  // --- Business V4 Wrappers ---

  public createV4Business(
    playerId: string,
    payload: {
      businessTypeId: string;
      businessName: string;
      ticker: string;
      cityCode: V4CityCode;
      locationLabel?: string;
      linkedPropertyId?: string | null;
      businessModel?: BusinessModelType;
      initialCapitalCR: number;
      idempotencyKey?: string;
    },
  ) {
    const player = this.players.get(playerId);
    const profile = this.getPlayerProfile(playerId);
    if (!player || !profile) throw new DomainError('UNAUTHORIZED', undefined, 401);

    const biz = this.businessEmpire.createBusiness({
      founderId: playerId,
      founderName: player.username,
      founderNetWorthMinor: profile.netWorthMinor,
      businessModel: payload.businessModel ?? 'MASS_MARKET',
      businessTypeId: payload.businessTypeId,
      businessName: payload.businessName,
      ticker: payload.ticker,
      cityCode: payload.cityCode,
      locationLabel: payload.locationLabel,
      linkedPropertyId: payload.linkedPropertyId,
      initialCapitalCR: payload.initialCapitalCR,
      idempotencyKey: payload.idempotencyKey,
    });
    this.career.recordJourneyEvent(
      playerId,
      'BUSINESS',
      `Thành lập ${biz.businessName} (${biz.ticker})`,
      `Ngành ${biz.businessTypeName} tại ${biz.cityName} với vốn khởi đầu ${(biz.initialCapitalMinor / 100).toLocaleString('en-US')} CR.`,
    );
    this.eventBus.publish('business.created', biz);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public injectV4BusinessCapital(playerId: string, businessId: string, amountCR: number) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const prev = this.businessEmpire.getBusiness(businessId);
    const biz = this.businessEmpire.injectCapital(businessId, playerId, player.username, amountCR);
    if (prev && (prev.status === 'DISTRESSED' || prev.status === 'RESTRUCTURING')) {
      this.career.recordCounter(playerId, 'restructuredOrRescuedBusiness');
    }
    this.eventBus.publish('business.revenue.updated', biz);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public updateV4BusinessSettings(
    playerId: string,
    businessId: string,
    payload: {
      sellingPriceCR?: number;
      status?: 'ACTIVE' | 'SUSPENDED' | 'RESTRUCTURING';
      franchiseEnabled?: boolean;
      franchiseFeeCR?: number;
      franchiseRoyaltyPct?: number;
    },
  ) {
    const statusAction =
      payload.status === 'SUSPENDED'
        ? 'PAUSE'
        : payload.status === 'ACTIVE'
          ? 'RESUME'
          : payload.status === 'RESTRUCTURING'
            ? 'RESTRUCTURE'
            : undefined;
    const biz = this.businessEmpire.updateBusinessSettings({
      businessId,
      requesterId: playerId,
      sellingPriceCR: payload.sellingPriceCR,
      statusAction,
      enableFranchise: payload.franchiseEnabled,
      franchiseFeeCR: payload.franchiseFeeCR,
      franchiseRoyaltyPct: payload.franchiseRoyaltyPct,
    });
    if (payload.status === 'RESTRUCTURING') {
      this.career.recordCounter(playerId, 'restructuredOrRescuedBusiness');
    }
    this.eventBus.publish('business.revenue.updated', biz);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public manageV4BusinessEmployees(
    playerId: string,
    businessId: string,
    payload: {
      action: 'HIRE' | 'FIRE' | 'TRAIN' | 'SET_SALARY';
      role: EmployeeRole;
      count?: number;
      salaryCR?: number;
    },
  ) {
    const biz = this.businessEmpire.manageEmployees({
      businessId,
      requesterId: playerId,
      ...payload,
    });
    this.eventBus.publish('business.revenue.updated', biz);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public upgradeV4BusinessLevel(playerId: string, businessId: string) {
    const clock = this.economy.getGameClock();
    const biz = this.businessEmpire.upgradeBusinessLevel({
      businessId,
      requesterId: playerId,
      currentGameHourTotal: clock.gameHour + this.v4MacroTickSeq * 6,
    });
    this.career.recordCounter(playerId, 'businessUpgradesCompleted');
    this.career.recordJourneyEvent(
      playerId,
      'BUSINESS',
      `Nâng cấp ${biz.businessName} lên Level ${biz.pendingUpgrade?.targetLevel ?? biz.level + 1}`,
      'Đã thanh toán chi phí mở rộng từ tài khoản doanh nghiệp.',
    );
    this.eventBus.publish('business.upgraded', biz);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public purchaseV4UpgradeNode(playerId: string, businessId: string, nodeId: string) {
    const biz = this.businessEmpire.purchaseUpgradeNode({
      businessId,
      requesterId: playerId,
      nodeId,
    });
    this.career.recordCounter(playerId, 'businessUpgradesCompleted');
    this.eventBus.publish('business.upgraded', biz);
    this.syncPlayerCareerAndNotify(playerId);
    return biz;
  }

  public openV4BusinessBranch(
    playerId: string,
    businessId: string,
    cityCode: V4CityCode,
    locationLabel?: string,
  ) {
    const res = this.businessEmpire.openBranch({
      businessId,
      requesterId: playerId,
      cityCode,
      locationLabel,
    });
    this.career.recordJourneyEvent(
      playerId,
      'BUSINESS',
      `Mở chi nhánh ${res.business.businessName} tại ${res.branch.cityName}`,
      res.branch.locationLabel,
    );
    this.eventBus.publish('business.branch.opened', res);
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  public signV4Franchise(playerId: string, franchisorBusinessId: string, cityCode: V4CityCode) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const agreement = this.businessEmpire.signFranchiseAgreement({
      franchisorBusinessId,
      franchiseePlayerId: playerId,
      franchiseeName: player.username,
      cityCode,
    });
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return agreement;
  }

  public payV4Dividend(playerId: string, businessId: string, amountCR: number) {
    const biz = this.businessEmpire.distributeDividend(businessId, playerId, amountCR);
    for (const sh of biz.shareholders) {
      this.career.recordCounter(sh.playerId, 'dividendsReceived');
      this.emitPlayerFinancialSync(sh.playerId);
      this.syncPlayerCareerAndNotify(sh.playerId);
    }
    this.eventBus.publish('company.dividend.paid', { businessId: biz.id, businessName: biz.businessName, amountCR });
    return biz;
  }

  // --- Corporate, Private Shares, Governance, M&A, Holding & IPO Wrappers ---

  public raiseV4Capital(
    playerId: string,
    companyId: string,
    investorId: string,
    investmentCR: number,
  ) {
    const investor = this.players.get(investorId);
    if (!investor) throw new DomainError('UNAUTHORIZED', 'Không tìm thấy nhà đầu tư.', 404);
    const res = this.businessEmpire.raiseCapital({
      businessId: companyId,
      approvedByFounderId: playerId,
      investorId,
      investorName: investor.username,
      investmentCR,
    });
    this.career.recordCounter(investorId, 'privateShareDeals');
    this.eventBus.publish('company.shares.transferred', res);
    this.emitPlayerFinancialSync(investorId);
    this.syncPlayerCareerAndNotify(investorId);
    return res;
  }

  public createV4PrivateListing(
    playerId: string,
    payload: {
      companyId: string;
      offeringType: 'PRIMARY' | 'SECONDARY';
      shares: number;
      pricePerShareCR: number;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return this.businessEmpire.createPrivateShareListing({
      businessId: payload.companyId,
      sellerId: playerId,
      sellerName: player.username,
      offeringType: payload.offeringType,
      shares: payload.shares,
      pricePerShareCR: payload.pricePerShareCR,
    });
  }

  public buyV4PrivateListing(playerId: string, listingId: string, shares?: number, _idempotencyKey?: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const existingListing = this.businessEmpire.listPrivateListings().find((l) => l.id === listingId);
    const targetShares = shares ?? existingListing?.sharesAvailable ?? 1;
    const res = this.businessEmpire.buyPrivateShareListing({
      listingId,
      buyerId: playerId,
      buyerName: player.username,
      shares: targetShares,
    });
    this.career.recordCounter(playerId, 'privateShareDeals');
    this.career.recordJourneyEvent(
      playerId,
      'INVESTMENT',
      `Mua ${targetShares.toLocaleString('en-US')} cổ phần ${res.business.businessName}`,
      `Giao dịch ${res.listing.offeringType === 'PRIMARY' ? 'phát hành mới (Primary)' : 'chuyển nhượng thứ cấp (Secondary)'}.`,
    );
    this.eventBus.publish('company.shares.transferred', res);
    this.emitPlayerFinancialSync(playerId);
    this.emitPlayerFinancialSync(res.listing.sellerId);
    this.syncPlayerCareerAndNotify(playerId);
    return { ...res, company: res.business };
  }

  public createV4GovernanceProposal(
    playerId: string,
    companyId: string,
    payload: {
      type: GovernanceProposalType;
      title: string;
      description: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const prop = this.businessEmpire.createGovernanceProposal({
      businessId: companyId,
      proposerId: playerId,
      proposerName: player.username,
      ...payload,
    });
    this.career.recordCounter(playerId, 'governanceVotesCast');
    this.syncPlayerCareerAndNotify(playerId);
    return prop;
  }

  public voteV4GovernanceProposal(
    playerId: string,
    companyId: string,
    proposalId: string,
    vote: 'FOR' | 'AGAINST',
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.businessEmpire.voteOnProposal({
      businessId: companyId,
      proposalId,
      voterId: playerId,
      voterName: player.username,
      vote,
    });
    this.career.recordCounter(playerId, 'governanceVotesCast');
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  public submitV4MaOffer(
    playerId: string,
    payload: {
      targetCompanyId: string;
      targetPct: 10 | 25 | 51 | 75 | 100;
      offerPricePerShareCR: number;
      dealType?: MaDealType;
      buyerHoldingId?: string | null;
      idempotencyKey?: string;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const offer = this.businessEmpire.submitAcquisitionOffer({
      buyerId: playerId,
      buyerName: player.username,
      ...payload,
    });
    this.emitPlayerFinancialSync(playerId);

    // If target seller is an NPC agent and offer is fair (>= 1.05x current share valuation), NPC evaluates and auto-accepts transparently
    const targetOwner = this.players.get(offer.sellerId);
    const targetBiz = this.businessEmpire.getBusiness(offer.targetCompanyId);
    if (targetOwner && targetOwner.role !== 'PLAYER' && targetBiz && targetBiz.totalIssuedShares > 0) {
      const fairPerShare = targetBiz.valuationMinor / targetBiz.totalIssuedShares;
      if (offer.offerPricePerShareMinor >= fairPerShare * 1.05) {
        const settled = this.respondV4MaOffer(offer.sellerId, offer.id, 'ACCEPT');
        return settled.offer;
      }
    }
    return offer;
  }

  public respondV4MaOffer(playerId: string, offerId: string, decision: 'ACCEPT' | 'REJECT' | 'CANCEL') {
    const res = this.businessEmpire.respondAcquisitionOffer({
      offerId,
      responderId: playerId,
      decision,
    });
    this.emitPlayerFinancialSync(res.offer.buyerId);
    this.emitPlayerFinancialSync(res.offer.sellerId);
    if (decision === 'ACCEPT' && res.business) {
      this.career.recordCounter(res.offer.buyerId, 'maDealsCompleted');
      if (res.offer.targetPct >= 51) {
        this.career.recordCounter(res.offer.buyerId, 'maControllingDealsCompleted');
      }
      this.career.recordJourneyEvent(
        res.offer.buyerId,
        'FINANCE',
        `Hoàn tất M&A ${res.offer.targetPct}% ${res.offer.targetCompanyName}`,
        `Thanh toán ký quỹ ${(res.offer.totalOfferMinor / 100).toLocaleString('en-US')} CR thành công.`,
      );
      this.eventBus.publish('company.acquisition.completed', res);
      this.syncPlayerCareerAndNotify(res.offer.buyerId);
      this.syncPlayerCareerAndNotify(res.offer.sellerId);
    }
    return { ...res, company: res.business };
  }

  public createV4Holding(playerId: string, name: string, ticker: string, _initialCashCR = 0) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const holding = this.businessEmpire.createHoldingCompany({
      founderId: playerId,
      founderName: player.username,
      name,
      ticker,
    });
    this.career.recordJourneyEvent(
      playerId,
      'BUSINESS',
      `Thành lập Tập đoàn mẹ ${holding.name} (${holding.ticker})`,
      'Sẵn sàng hợp nhất công ty con theo sơ đồ sở hữu.',
    );
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return holding;
  }

  public attachV4Subsidiary(playerId: string, holdingId: string, businessId: string) {
    const holding = this.businessEmpire.attachSubsidiaryToHolding(holdingId, businessId, playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return holding;
  }

  public launchV4Ipo(playerId: string, businessId: string, offeringPriceCR?: number) {
    const biz = this.businessEmpire.getBusiness(businessId);
    const defaultShares = Math.max(1_000, Math.floor((biz?.totalIssuedShares ?? 10_000) * 0.25));
    const defaultPriceCR =
      offeringPriceCR && offeringPriceCR >= 1
        ? offeringPriceCR
        : Math.max(
            2,
            Math.round(((biz?.valuationMinor ?? 200_000 * 100) / Math.max(biz?.totalIssuedShares ?? 10_000, 1)) / 100),
          );
    const res = this.businessEmpire.launchIpo({
      businessId,
      requesterId: playerId,
      offeringShares: defaultShares,
      ipoPriceCR: defaultPriceCR,
    });
    this.career.recordJourneyEvent(
      playerId,
      'INVESTMENT',
      `Niêm yết IPO thành công: ${res.listedAsset.symbol}`,
      `${res.business.businessName} chính thức giao dịch công khai trên sàn ESE.`,
    );
    this.eventBus.publish('market.quote.updated', res.listedAsset);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return { ...res, company: res.business, asset: res.listedAsset };
  }

  // --- Investment Fund V4 Wrappers ---

  public createV4Fund(
    playerId: string,
    payload: {
      name: string;
      code: string;
      fundType: FundType;
      description?: string;
      investmentObjective?: string;
      managementFeeAnnualPct?: number;
      redemptionFeePct?: number;
      maxSinglePositionPct?: number;
      minCashReservePct?: number;
      initialCapitalCR: number;
      isPublic?: boolean;
      logoColor?: string;
      idempotencyKey?: string;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const fund = this.funds.createFund({
      founderId: playerId,
      founderName: player.username,
      ...payload,
    });
    this.career.recordJourneyEvent(
      playerId,
      'FINANCE',
      `Thành lập quỹ đầu tư ${fund.name} (${fund.code})`,
      `Vốn khởi tạo ${payload.initialCapitalCR.toLocaleString('en-US')} CR — Không đòn bẩy.`,
    );
    this.eventBus.publish('fund.created', fund);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return fund;
  }

  public subscribeV4Fund(playerId: string, fundId: string, amountCR: number, idempotencyKey?: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.funds.subscribeFund({
      fundId,
      playerId,
      playerName: player.username,
      amountCR,
      idempotencyKey,
    });
    this.career.recordCounter(playerId, 'fundSubscriptionsOrTrades');
    this.eventBus.publish('fund.subscription.completed', {
      fundId: res.fund.id,
      fundCode: res.fund.code,
      playerId,
      unitsIssued: res.unitsIssued,
      amountCR,
    });
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  public redeemV4Fund(playerId: string, fundId: string, units: number, idempotencyKey?: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.funds.requestRedemption({
      fundId,
      playerId,
      playerName: player.username,
      units,
      idempotencyKey,
    });
    if (res.settledImmediately) {
      this.eventBus.publish('fund.redemption.completed', {
        fundId: res.fund.id,
        fundCode: res.fund.code,
        playerId,
        request: res.request,
      });
    }
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  public executeV4FundTrade(
    playerId: string,
    fundId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    amountCR: number,
  ) {
    const fund = this.funds.executeFundTrade({
      fundId,
      managerId: playerId,
      symbol,
      side,
      amountCR,
    });
    this.career.recordCounter(playerId, 'fundSubscriptionsOrTrades');
    this.career.recordCounter(playerId, 'hasFundManagedTrade');
    this.syncPlayerCareerAndNotify(playerId);
    return fund;
  }

  public createV4FundProposal(
    playerId: string,
    fundId: string,
    payload: {
      type: FundGovernanceProposal['type'];
      title: string;
      description: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const prop = this.funds.createFundProposal({
      fundId,
      proposerId: playerId,
      proposerName: player.username,
      ...payload,
    });
    this.career.recordCounter(playerId, 'governanceVotesCast');
    this.syncPlayerCareerAndNotify(playerId);
    return prop;
  }

  public voteV4FundProposal(playerId: string, fundId: string, proposalId: string, vote: 'FOR' | 'AGAINST') {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.funds.voteFundProposal({
      fundId,
      proposalId,
      voterId: playerId,
      voterName: player.username,
      vote,
    });
    this.career.recordCounter(playerId, 'governanceVotesCast');
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  // --- Luxury Club V4 Wrappers ---

  public buyV4LuxuryFromShowroom(
    playerId: string,
    catalogId: string,
    exteriorColorHex?: string,
    exteriorColorName?: string,
    idempotencyKey?: string,
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const asset = this.luxury.purchaseFromShowroom({
      playerId,
      playerName: player.username,
      catalogId,
      exteriorColorHex,
      exteriorColorName,
      idempotencyKey,
    });
    this.career.recordJourneyEvent(
      playerId,
      'LIFESTYLE',
      `Sở hữu ${asset.modelName}`,
      `Bổ sung vào Empire Luxury Club (${asset.segmentLabel}).`,
    );
    this.eventBus.publish('luxury.asset.purchased', asset);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return asset;
  }

  public customizeV4LuxuryAsset(
    playerId: string,
    assetId: string,
    payload: {
      exteriorColorHex: string;
      exteriorColorName: string;
      exteriorTrim: OwnedLuxuryAsset['exteriorTrim'];
    },
  ) {
    const asset = this.luxury.customizeAsset({ assetId, playerId, ...payload });
    this.career.recordCounter(playerId, 'luxuryCustomizations');
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return asset;
  }

  public buyV4LuxuryResale(playerId: string, listingId: string, idempotencyKey?: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.luxury.buyResaleListing({
      listingId,
      buyerId: playerId,
      buyerName: player.username,
      idempotencyKey,
    });
    this.eventBus.publish('luxury.asset.sold', res);
    this.emitPlayerFinancialSync(playerId);
    this.emitPlayerFinancialSync(res.sellerId);
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  // =========================================================================
  // PROJECT CO-FOUNDER — MULTIPLAYER ENTREPRENEURSHIP & GOVERNANCE WRAPPERS
  // =========================================================================

  public getCoFounderCapitalHub(playerId: string | null, worldMode: WorldMode = 'ONLINE'): CoFounderCapitalHubPayload {
    const knownPlayers: CoFounderCapitalHubPayload['knownPlayers'] = [];
    for (const rec of this.players.values()) {
      if (rec.role === 'PLAYER') {
        knownPlayers.push({
          playerId: rec.id,
          username: rec.username,
          title: rec.title,
          isNpc: false,
        });
      } else if (worldMode === 'CAREER' && (rec.role === 'INVESTOR_BOT' || rec.role === 'MARKET_MAKER')) {
        // Career Mode explicitly allows inviting real finite-budget NPC investors (never fabricated in ONLINE mode)
        knownPlayers.push({
          playerId: rec.id,
          username: rec.username,
          title: `${rec.title} (NPC Career)`,
          isNpc: true,
        });
      }
    }

    const projects = this.cofounder.listProjects(worldMode, playerId);
    const myContributions = playerId
      ? projects.flatMap((p) => p.contributions.filter((c) => c.contributorId === playerId))
      : [];

    return {
      worldMode,
      projects,
      capitalRounds: this.cofounder.listCapitalRounds(worldMode),
      privateListings: this.businessEmpire
        .listPrivateListings()
        .filter((l) => this.cofounder.getCompanyWorldMode(l.companyId) === worldMode),
      jointVentures: this.cofounder.listJointVentures(worldMode),
      funds: this.funds.listFunds(),
      catalog: BUSINESS_CATALOG,
      myInvites: playerId ? this.cofounder.listInvitesForPlayer(playerId, worldMode) : [],
      myContributions,
      knownPlayers: knownPlayers.slice(0, 40),
      featureFlags: {
        empireConnectNativeApiReady: true,
        bigUpdateUnifiedPersistenceReady: true,
        beginnerModeAdapterReady: true,
      },
    };
  }

  public getCompanyHeadquarters(companyId: string, playerId: string | null) {
    return this.cofounder.getCompanyHeadquarters(companyId, playerId);
  }

  public getMyCoFounderInvestments(playerId: string, worldMode: WorldMode = 'ONLINE') {
    return this.cofounder.getMyInvestments(playerId, worldMode);
  }

  public createCoFounderProject(
    playerId: string,
    payload: {
      worldMode?: WorldMode;
      businessName: string;
      ticker: string;
      logoColor?: string;
      businessTypeId: string;
      businessModel?: BusinessModelType;
      cityCode: V4CityCode;
      businessGoal: string;
      businessPlan: string;
      riskDisclosure?: string;
      targetCapitalCR: number;
      initialTotalShares: number;
      minContributionCR: number;
      visibility: CapitalProjectVisibility;
      deadlineGameDay?: number;
      founderInitialCommitCR?: number;
      founderInitialRole?: CompanyRole;
      policy?: Partial<CapitalProjectPolicy>;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const clock = this.economy.getGameClock();
    const project = this.cofounder.createCapitalProject({
      founderId: playerId,
      founderName: player.username,
      worldMode: payload.worldMode ?? 'ONLINE',
      businessName: sanitizePlainText(payload.businessName).slice(0, 64),
      ticker: sanitizePlainText(payload.ticker).slice(0, 10).toUpperCase(),
      logoColor: payload.logoColor,
      businessTypeId: payload.businessTypeId,
      businessModel: payload.businessModel,
      cityCode: payload.cityCode,
      businessGoal: sanitizePlainText(payload.businessGoal).slice(0, 180),
      businessPlan: sanitizePlainText(payload.businessPlan).slice(0, 600),
      riskDisclosure: payload.riskDisclosure ? sanitizePlainText(payload.riskDisclosure).slice(0, 280) : undefined,
      targetCapitalCR: payload.targetCapitalCR,
      initialTotalShares: payload.initialTotalShares,
      minContributionCR: payload.minContributionCR,
      visibility: payload.visibility,
      deadlineGameDay: payload.deadlineGameDay ?? clock.gameDay + 14,
      founderInitialCommitCR: payload.founderInitialCommitCR,
      founderInitialRole: payload.founderInitialRole,
      policy: payload.policy,
    });
    this.eventBus.publish('cofounder.project.updated', project);
    this.emitPlayerFinancialSync(playerId);
    return project;
  }

  public inviteCoFounder(
    inviterId: string,
    payload: {
      projectId: string;
      inviteeId?: string;
      inviteeUsername?: string;
      proposedRole: CompanyRole;
      proposedContributionCR: number;
      inviteChannel: CoFounderInvite['inviteChannel'];
      message?: string;
    },
  ) {
    const inviter = this.players.get(inviterId);
    if (!inviter) throw new DomainError('UNAUTHORIZED', undefined, 401);

    let invitee: PlayerRecord | undefined;
    if (payload.inviteeId) {
      invitee = this.players.get(payload.inviteeId);
    } else if (payload.inviteeUsername) {
      const normalized = payload.inviteeUsername.trim().toLowerCase();
      for (const rec of this.players.values()) {
        if (rec.username.toLowerCase() === normalized) {
          invitee = rec;
          break;
        }
      }
    }
    if (!invitee) {
      throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy người chơi được mời theo Username hoặc Player ID.', 404);
    }

    const project = this.cofounder.getProject(payload.projectId);
    if (!project) throw new DomainError('PROJECT_NOT_FOUND', undefined, 404);
    if (project.worldMode === 'ONLINE' && invitee.role !== 'PLAYER') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Trong chế độ Online Multiplayer chỉ có thể mời người chơi thật làm đồng sáng lập.',
        400,
      );
    }

    const invite = this.cofounder.inviteCoFounder({
      projectId: payload.projectId,
      inviterId,
      inviterName: inviter.username,
      inviteeId: invitee.id,
      inviteeName: invitee.username,
      proposedRole: payload.proposedRole,
      proposedContributionCR: payload.proposedContributionCR,
      inviteChannel: payload.inviteChannel,
      message: payload.message ? sanitizePlainText(payload.message).slice(0, 240) : undefined,
    });
    this.eventBus.publish('cofounder.invite.received', invite, `player:${invitee.id}`);
    this.eventBus.publish('cofounder.project.updated', this.cofounder.getProject(payload.projectId));
    return invite;
  }

  public respondCoFounderInvite(
    playerId: string,
    payload: {
      inviteId: string;
      decision: 'ACCEPT' | 'REJECT' | 'COUNTER_PROPOSE';
      counterContributionCR?: number;
      counterRole?: CompanyRole;
      counterNote?: string;
    },
  ) {
    const invite = this.cofounder.respondCoFounderInvite({
      inviteId: payload.inviteId,
      responderId: playerId,
      decision: payload.decision,
      counterContributionCR: payload.counterContributionCR,
      counterRole: payload.counterRole,
      counterNote: payload.counterNote ? sanitizePlainText(payload.counterNote).slice(0, 240) : undefined,
    });
    this.eventBus.publish('cofounder.project.updated', this.cofounder.getProject(invite.projectId));
    return invite;
  }

  public commitCapitalToCoFounderProject(
    playerId: string,
    payload: {
      projectId: string;
      amountCR: number;
      worldMode?: WorldMode;
      inviteCode?: string;
      proposedRole?: CompanyRole;
      idempotencyKey?: string;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const result = this.cofounder.commitCapitalToProject({
      projectId: payload.projectId,
      contributorId: playerId,
      contributorName: player.username,
      amountCR: payload.amountCR,
      isNpc: player.role !== 'PLAYER',
      worldMode: payload.worldMode,
      inviteCode: payload.inviteCode,
      proposedRole: payload.proposedRole,
      idempotencyKey: payload.idempotencyKey,
    });
    this.eventBus.publish('cofounder.commitment.updated', {
      projectId: result.project.id,
      contribution: result.contribution,
      committedCapitalMinor: result.project.committedCapitalMinor,
      targetCapitalMinor: result.project.targetCapitalMinor,
      status: result.project.status,
    });
    this.eventBus.publish('cofounder.project.updated', result.project);
    this.emitPlayerFinancialSync(playerId);
    return result;
  }

  /**
   * Career Mode Only: Invite a real finite-budget NPC investor from the world to commit real CR into escrow.
   * Strictly forbidden in ONLINE mode.
   */
  public commitCareerNpcToProject(
    requesterId: string,
    payload: {
      projectId: string;
      npcId?: string;
      amountCR: number;
    },
  ) {
    const project = this.cofounder.getProject(payload.projectId);
    if (!project) throw new DomainError('PROJECT_NOT_FOUND', undefined, 404);
    if (project.worldMode !== 'CAREER') {
      throw new DomainError(
        'CROSS_WORLD_TRANSFER_FORBIDDEN',
        'Chỉ được gọi nhà đầu tư NPC trong chế độ Career. Online Multiplayer chỉ nhận vốn từ người chơi thật.',
        403,
      );
    }
    if (project.founderId !== requesterId) {
      throw new DomainError('FORBIDDEN', 'Chỉ nhà sáng lập dự án mới có thể mời NPC đầu tư trong Career Mode.', 403);
    }

    let npc: PlayerRecord | undefined;
    if (payload.npcId) {
      const candidate = this.players.get(payload.npcId);
      if (candidate && (candidate.role === 'INVESTOR_BOT' || candidate.role === 'MARKET_MAKER')) {
        npc = candidate;
      }
    } else {
      for (const rec of this.players.values()) {
        if (rec.role === 'INVESTOR_BOT' || rec.role === 'MARKET_MAKER') {
          const wallet = this.ledger.wallets.getWallet(rec.id);
          if (wallet && wallet.availableMinor >= toMinor(payload.amountCR)) {
            npc = rec;
            break;
          }
        }
      }
    }

    if (!npc) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Không có nhà đầu tư NPC nào đủ vốn CR khả dụng cho khoản góp này.', 400);
    }

    const result = this.cofounder.commitCapitalToProject({
      projectId: payload.projectId,
      contributorId: npc.id,
      contributorName: npc.username,
      amountCR: payload.amountCR,
      isNpc: true,
      worldMode: 'CAREER',
      proposedRole: 'BOARD_MEMBER',
    });
    this.eventBus.publish('cofounder.commitment.updated', {
      projectId: result.project.id,
      contribution: result.contribution,
      committedCapitalMinor: result.project.committedCapitalMinor,
      targetCapitalMinor: result.project.targetCapitalMinor,
      status: result.project.status,
    });
    this.eventBus.publish('cofounder.project.updated', result.project);
    return result;
  }

  public approveOrRejectCoFounderContribution(
    founderId: string,
    projectId: string,
    contributionId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    const project = this.cofounder.approveOrRejectContribution({
      projectId,
      contributionId,
      founderId,
      decision,
    });
    this.eventBus.publish('cofounder.project.updated', project);
    const contrib = project.contributions.find((c) => c.contributionId === contributionId);
    if (contrib) {
      this.emitPlayerFinancialSync(contrib.contributorId);
    }
    return project;
  }

  public withdrawCoFounderCommitment(playerId: string, projectId: string, contributionId: string) {
    const project = this.cofounder.withdrawCommitment({
      projectId,
      contributionId,
      contributorId: playerId,
    });
    this.eventBus.publish('cofounder.project.updated', project);
    this.emitPlayerFinancialSync(playerId);
    return project;
  }

  public cancelOrExpireCoFounderProject(
    requesterId: string,
    projectId: string,
    reason: 'CANCELLED' | 'EXPIRED' = 'CANCELLED',
  ) {
    const result = this.cofounder.cancelOrExpireProject({
      projectId,
      requesterId,
      reason,
    });
    this.eventBus.publish('cofounder.project.updated', result.project);
    const affected = new Set(result.project.contributions.map((c) => c.contributorId));
    for (const pid of affected) {
      this.emitPlayerFinancialSync(pid);
    }
    return result;
  }

  public activateCoFounderProject(requesterId: string, projectId: string, idempotencyKey?: string) {
    const res = this.cofounder.activateProject({
      projectId,
      requesterId,
      idempotencyKey,
    });
    this.eventBus.publish('cofounder.project.updated', res.project);
    this.eventBus.publish('cofounder.company.activated', {
      projectId: res.project.id,
      company: res.company,
      shareholderIds: res.company.shareholders.map((s) => s.playerId),
    });
    this.eventBus.publish('business.created', res.company);

    for (const sh of res.company.shareholders) {
      if (this.players.get(sh.playerId)?.role === 'PLAYER') {
        this.career.recordJourneyEvent(
          sh.playerId,
          'BUSINESS',
          `Đồng sáng lập ${res.company.businessName} (${res.company.ticker})`,
          `Sở hữu ${sh.ownershipPct.toFixed(2)}% cổ phần (${sh.shares.toLocaleString('en-US')} cp) qua Capital Hub.`,
        );
        this.emitPlayerFinancialSync(sh.playerId);
        this.syncPlayerCareerAndNotify(sh.playerId);
      }
    }
    return res;
  }

  public shareCoFounderProjectToEmpireConnect(playerId: string, projectId: string, note?: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const project = this.cofounder.getProject(projectId);
    if (!project) throw new DomainError('PROJECT_NOT_FOUND', undefined, 404);

    const pct = Math.round((project.committedCapitalMinor / Math.max(1, project.targetCapitalMinor)) * 100);
    const cleanNote = note ? sanitizePlainText(note).slice(0, 140) : 'Đang tìm đồng sáng lập cùng góp vốn';
    const text = `[Capital Hub · ${project.ticker}] ${project.businessName} (${project.cityName}) — Tiến độ vốn ${pct}% · Mã mời: ${project.inviteCode} · ${cleanNote}`;

    const chatMsg: ChatMessage = {
      id: `chat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      channel: 'MARKET',
      senderId: playerId,
      senderName: player.username,
      senderTitle: player.title,
      content: text,
      timestamp: new Date().toISOString(),
      reportedBy: [],
    };
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > 200) {
      this.chatMessages = this.chatMessages.slice(-200);
    }
    this.eventBus.publish('chat.message', chatMsg);
    return chatMsg;
  }

  public assignCoFounderCompanyRole(
    actorId: string,
    payload: {
      companyId: string;
      targetPlayerId: string;
      role: CompanyRole;
      action: 'GRANT' | 'REVOKE';
    },
  ) {
    const actor = this.players.get(actorId);
    const target = this.players.get(payload.targetPlayerId);
    if (!actor) throw new DomainError('UNAUTHORIZED', undefined, 401);
    if (!target) throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy cổ đông mục tiêu.', 404);
    return this.cofounder.assignCompanyRole({
      companyId: payload.companyId,
      actorId,
      actorName: actor.username,
      targetPlayerId: payload.targetPlayerId,
      targetPlayerName: target.username,
      role: payload.role,
      action: payload.action,
    });
  }

  public attemptUnauthorizedCompanyWithdrawal(actorId: string, companyId: string): never {
    const actor = this.players.get(actorId);
    if (!actor) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return this.businessEmpire.attemptUnauthorizedCompanyWithdrawal(companyId, actorId);
  }

  public createCoFounderBoardProposal(
    playerId: string,
    payload: {
      companyId: string;
      type: BoardProposalType;
      title: string;
      description: string;
      rationale: string;
      expectedImpact: string;
      estimatedCostCR?: number;
      payload?: Record<string, unknown>;
      durationHours?: number;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const proposal = this.cofounder.createBoardProposal({
      companyId: payload.companyId,
      proposerId: playerId,
      proposerName: player.username,
      type: payload.type,
      title: sanitizePlainText(payload.title).slice(0, 120),
      description: sanitizePlainText(payload.description).slice(0, 400),
      rationale: sanitizePlainText(payload.rationale).slice(0, 300),
      expectedImpact: sanitizePlainText(payload.expectedImpact).slice(0, 240),
      estimatedCostCR: payload.estimatedCostCR,
      payload: payload.payload,
      durationHours: payload.durationHours,
    });
    this.eventBus.publish('board.proposal.created', proposal);
    return proposal;
  }

  public voteCoFounderBoardProposal(
    playerId: string,
    proposalId: string,
    choice: 'FOR' | 'AGAINST' | 'ABSTAIN',
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const proposal = this.cofounder.voteBoardProposal({
      proposalId,
      voterId: playerId,
      voterName: player.username,
      choice,
    });
    this.career.recordCounter(playerId, 'governanceVotesCast');
    this.eventBus.publish('board.proposal.voted', proposal);
    this.syncPlayerCareerAndNotify(playerId);
    return proposal;
  }

  public executeCoFounderBoardProposal(playerId: string, proposalId: string) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const clock = this.economy.getGameClock();
    const res = this.cofounder.executeBoardProposal({
      proposalId,
      executorId: playerId,
      executorName: player.username,
      currentGameHourTotal: clock.gameDay * 24 + clock.gameHour,
    });
    this.eventBus.publish('board.proposal.executed', {
      proposal: res.proposal,
      company: res.company,
      dividendRecord: res.dividendRecord ?? null,
    });
    this.eventBus.publish('business.revenue.updated', res.company);
    if (res.dividendRecord) {
      this.eventBus.publish('company.dividend.paid', res.dividendRecord);
      for (const payout of res.dividendRecord.payouts) {
        this.emitPlayerFinancialSync(payout.playerId);
      }
    }
    this.emitPlayerFinancialSync(playerId);
    return res;
  }

  public createCoFounderCapitalRound(
    playerId: string,
    payload: {
      companyId: string;
      roundType: CapitalRoundType;
      preMoneyValuationCR: number;
      targetRaiseCR: number;
      useOfProceeds: string;
      preemptiveRightsEnabled?: boolean;
      visibility?: CapitalProjectVisibility;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const round = this.cofounder.createCapitalRound({
      companyId: payload.companyId,
      requesterId: playerId,
      requesterName: player.username,
      roundType: payload.roundType,
      preMoneyValuationCR: payload.preMoneyValuationCR,
      targetRaiseCR: payload.targetRaiseCR,
      useOfProceeds: sanitizePlainText(payload.useOfProceeds).slice(0, 300),
      preemptiveRightsEnabled: payload.preemptiveRightsEnabled,
      visibility: payload.visibility,
    });
    this.eventBus.publish('capital.round.updated', round);
    return round;
  }

  public investCoFounderCapitalRound(
    playerId: string,
    payload: {
      roundId: string;
      amountCR: number;
      worldMode?: WorldMode;
      idempotencyKey?: string;
    },
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const res = this.cofounder.investInCapitalRound({
      roundId: payload.roundId,
      investorId: playerId,
      investorName: player.username,
      amountCR: payload.amountCR,
      worldMode: payload.worldMode,
      idempotencyKey: payload.idempotencyKey,
    });
    this.eventBus.publish('capital.round.updated', res.round);
    this.eventBus.publish('business.revenue.updated', res.company);
    this.emitPlayerFinancialSync(playerId);
    this.syncPlayerCareerAndNotify(playerId);
    return res;
  }

  public createCoFounderJointVenture(
    playerId: string,
    payload: {
      creatorCompanyId: string;
      partnerCompanyIds: string[];
      jvName: string;
      ticker: string;
      businessTypeId: string;
      cityCode: V4CityCode;
      purpose: string;
      partnerContributionsCR: Array<{ companyId: string; amountCR: number }>;
      worldMode?: WorldMode;
    },
  ) {
    const jv = this.cofounder.createJointVenture({
      creatorPlayerId: playerId,
      creatorCompanyId: payload.creatorCompanyId,
      partnerCompanyIds: payload.partnerCompanyIds,
      jvName: sanitizePlainText(payload.jvName).slice(0, 64),
      ticker: sanitizePlainText(payload.ticker).slice(0, 10).toUpperCase(),
      businessTypeId: payload.businessTypeId,
      cityCode: payload.cityCode,
      purpose: sanitizePlainText(payload.purpose).slice(0, 240),
      partnerContributionsCR: payload.partnerContributionsCR,
      worldMode: payload.worldMode,
    });
    this.eventBus.publish('jv.updated', jv);
    return jv;
  }

  public approveCoFounderJointVenture(playerId: string, jvId: string, partnerCompanyId: string) {
    const res = this.cofounder.approveAndActivateJointVenture({
      jvId,
      partnerCompanyId,
      approverPlayerId: playerId,
    });
    this.eventBus.publish('jv.updated', res.jv);
    if (res.company) {
      this.eventBus.publish('cofounder.company.activated', {
        projectId: res.jv.id,
        company: res.company,
        shareholderIds: res.company.shareholders.map((s) => s.playerId),
      });
      this.eventBus.publish('business.created', res.company);
    }
    return res;
  }

  public postCoFounderDiscussion(
    playerId: string,
    companyId: string,
    content: string,
    channel: 'SHAREHOLDER_ROOM' | 'EMPIRE_CONNECT_SHARE' = 'SHAREHOLDER_ROOM',
  ) {
    const player = this.players.get(playerId);
    if (!player) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return this.cofounder.postShareholderDiscussion({
      companyId,
      authorId: playerId,
      authorName: player.username,
      content: sanitizePlainText(content).slice(0, 400),
      channel,
    });
  }
}
