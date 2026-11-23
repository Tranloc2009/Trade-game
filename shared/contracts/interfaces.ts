import type {
  Asset,
  Candle,
  CompanyFundamentals,
  EconomyEvent,
  Holding,
  LedgerEntry,
  Loan,
  NewsItem,
  Order,
  OrderBookSnapshot,
  PlayerCompany,
  PlayerProfile,
  Property,
  PropertyAuction,
  RealtimeEnvelope,
  Timeframe,
  Trade,
  Wallet,
} from './types';

/**
 * Service & Repository Contracts designed for clean backend handoff.
 * Prototype uses InMemory adapters; production backend can swap in PostgreSQL/Redis/Auth adapters
 * without changing domain logic or React presentation components.
 */

export interface AuthSession {
  token: string;
  playerId: string;
  username: string;
  createdAt: string;
  isDemoGuest: boolean;
}

export interface IAuthProvider {
  createGuestSession(username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM'): AuthSession;
  verifyToken(token: string | undefined): AuthSession | null;
  revokeToken(token: string): void;
}

export interface IWorldRepository {
  getWorldId(): string;
  getStateVersion(): number;
  incrementStateVersion(): number;
}

export interface IPlayerRepository {
  findById(playerId: string): PlayerProfile | undefined;
  findByUsername(username: string): PlayerProfile | undefined;
  listAll(): PlayerProfile[];
  save(player: PlayerProfile): void;
}

export interface IWalletRepository {
  getWallet(playerId: string): Wallet | undefined;
  saveWallet(wallet: Wallet): void;
  getHolding(playerId: string, symbol: string): Holding | undefined;
  listHoldings(playerId: string): Holding[];
  saveHolding(playerId: string, holding: Holding): void;
}

export interface ILedgerRepository {
  append(entries: LedgerEntry[]): void;
  listByAccount(accountId: string, limit?: number, offset?: number): LedgerEntry[];
  listAll(limit?: number, offset?: number): LedgerEntry[];
  count(): number;
}

export interface IOrderRepository {
  findById(orderId: string): Order | undefined;
  findByIdempotencyKey(playerId: string, key: string): Order | undefined;
  listByPlayer(playerId: string, symbol?: string): Order[];
  listOpenBySymbol(symbol: string): Order[];
  save(order: Order): void;
  count(): number;
}

export interface ITradeRepository {
  hasSettled(tradeId: string): boolean;
  save(trade: Trade): void;
  listBySymbol(symbol: string, limit?: number): Trade[];
  listByPlayer(playerId: string, limit?: number): Trade[];
  count(): number;
}

export interface IAssetRepository {
  findBySymbol(symbol: string): Asset | undefined;
  listAll(): Asset[];
  save(asset: Asset): void;
}

export interface IMarketDataProvider {
  getOrderBook(symbol: string): OrderBookSnapshot | undefined;
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Candle[];
  recordTradeTick(trade: Trade): void;
}

export interface IPropertyRepository {
  findById(propertyId: string): Property | undefined;
  listAll(): Property[];
  save(property: Property): void;
  findAuctionById(auctionId: string): PropertyAuction | undefined;
  listAuctions(): PropertyAuction[];
  saveAuction(auction: PropertyAuction): void;
}

export interface ICompanyRepository {
  findById(companyId: string): PlayerCompany | undefined;
  listAll(): PlayerCompany[];
  save(company: PlayerCompany): void;
}

export interface ILoanRepository {
  findById(loanId: string): Loan | undefined;
  listByPlayer(playerId: string): Loan[];
  listAll(): Loan[];
  save(loan: Loan): void;
}

export interface IEventBus {
  publish<T>(eventType: RealtimeEnvelope<T>['eventType'], payload: T, room?: string): RealtimeEnvelope<T>;
  subscribe(listener: (envelope: RealtimeEnvelope, room?: string) => void): () => void;
  getSequenceNumber(): number;
}

export interface IRealtimeTransport {
  broadcast<T>(envelope: RealtimeEnvelope<T>, room?: string): void;
  getActiveConnectionCount(): number;
  getOnlinePlayerIds(): string[];
}

export interface INewsProvider {
  generateFromEvent(event: EconomyEvent): NewsItem;
  generateCorporateEarningsNews(symbol: string, companyName: string, fundamentals: CompanyFundamentals): NewsItem;
}

// ============================================================================
// External API Provider Interfaces (DISABLED by default in prototype)
// Never overwrites simulated in-game trades or order book prices.
// ============================================================================

export type DataOriginTag = 'SIMULATED_IN_GAME_MARKET_DATA' | 'LIVE_EXTERNAL_REFERENCE_DATA';

export interface ExternalReferenceQuote {
  symbol: string;
  referencePrice: number;
  currency: string;
  origin: 'LIVE_EXTERNAL_REFERENCE_DATA';
  fetchedAt: string;
}

export interface ExternalCryptoPriceProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  fetchReferenceQuote(symbol: string): Promise<ExternalReferenceQuote | null>;
}

export interface ExternalStockMarketDataProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  fetchReferenceQuote(symbol: string): Promise<ExternalReferenceQuote | null>;
}

export interface ExternalNewsProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  fetchHeadlines(limit: number): Promise<NewsItem[]>;
}

export interface ExternalAIAnalysisProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  summarizeMarketState(symbol: string): Promise<string | null>;
}

export interface ExternalAuthenticationProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  verifyExternalIdentity(token: string): Promise<{ userId: string; email?: string } | null>;
}
