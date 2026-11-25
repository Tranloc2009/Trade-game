import { create } from 'zustand';
import type {
  GlossaryLanguage,
  TradingExperienceMode,
  WorldMode,
} from '../../shared/contracts/beginner';
import type {
  AccountOverviewPayload,
  CareerStoryState,
  GamePlayMode,
} from '../../shared/contracts/careerStory';
import type {
  FuturesContract,
  FuturesFundingSettlementEvent,
  FuturesLiquidationEvent,
  FuturesOrder,
  FuturesOrderBookSnapshot,
  FuturesOverviewSnapshot,
  FuturesPosition,
  FuturesTrade,
} from '../../shared/contracts/futures';
import type {
  Asset,
  Candle,
  ChatMessage,
  EconomyState,
  ForexOverviewSnapshot,
  GameClock,
  NewsItem,
  Order,
  OrderBookSnapshot,
  PlayerProfile,
  RealtimeEnvelope,
  Timeframe,
  Trade,
  WorldSnapshot,
} from '../../shared/contracts/types';
import {
  applyFuturesOrderToQueryCache,
  applyFuturesPositionToQueryCache,
  applyFuturesTradeToQueryCache,
  applySpotOrderToQueryCache,
  queryClient,
} from '../lib/queryClient';

// Bounded deduplication set for incoming realtime event IDs (prevents duplicate mutations on redelivery)
const MAX_SEEN_EVENT_IDS = 600;
const seenEventIds = new Set<string>();

function markEventSeen(eventId: string | undefined): boolean {
  if (!eventId) return false;
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const oldest = seenEventIds.values().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }
  return false;
}

export function resetSeenRealtimeEvents(): void {
  seenEventIds.clear();
}

import {
  resolveCanonicalNavigation,
  type BusinessTycoonTab,
  type LifestyleTab,
  type MyAssetsTab,
  type MyEmpireTab,
  type NavPage,
  type UnifiedExchangeTab,
  type WorldTab,
} from '../lib/navigation';

export type {
  BusinessTycoonTab,
  LifestyleTab,
  MyAssetsTab,
  MyEmpireTab,
  NavPage,
  UnifiedExchangeTab,
  WorldTab,
};

export const resolveLegacyPageRedirect = resolveCanonicalNavigation;

export interface GameFeedbackEvent {
  id: string;
  kind: 'COMPANY_OPENING' | 'UPGRADE' | 'DEAL_SUCCESS' | 'FAILURE';
  title: string;
  subtitle?: string;
  summary?: string;
  imageUrl?: string;
  metrics?: Array<{
    label: string;
    value: string;
    tone?: 'default' | 'neutral' | 'accent' | 'positive' | 'negative';
  }>;
  npcQuote?: {
    npcId?: 'minh_quan' | 'gia_han' | 'duc_huy' | 'hoang_nam' | 'thao_linh';
    name: string;
    message: string;
  };
  nextObjective?: string;
  ctaLabel?: string;
  ctaTargetPage?: NavPage;
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'polling';

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  read: boolean;
}

// Non-sensitive UI preferences ONLY (financial state & auth tokens are NEVER stored in localStorage)
const UI_PREFS_KEY = 'trading_empire_ui_prefs_v2';

interface UiPrefs {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: string[];
  tradingMode: TradingExperienceMode;
  glossaryLang: GlossaryLanguage;
  tutorialCompletedIds: string[];
  futuresIntroSeen: boolean;
  careerSoundMuted: boolean;
  careerTypewriterEnabled: boolean;
  careerSubtitlesEnabled: boolean;
  reducedMotionPref: boolean;
}

const DEFAULT_UI_PREFS: UiPrefs = {
  theme: 'dark',
  sidebarCollapsed: false,
  watchlist: ['NOVA', 'BTC-SIM', 'ETH-SIM', 'DOGX-SIM'],
  tradingMode: 'BEGINNER',
  glossaryLang: 'vi',
  tutorialCompletedIds: [],
  futuresIntroSeen: false,
  careerSoundMuted: false,
  careerTypewriterEnabled: true,
  careerSubtitlesEnabled: true,
  reducedMotionPref: false,
};

function resolveInitialTradingModeFromUrl(): TradingExperienceMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const modeParam = new URLSearchParams(window.location.search).get('mode')?.toLowerCase();
    if (modeParam === 'pro') return 'PRO';
    if (modeParam === 'beginner') return 'BEGINNER';
  } catch {
    // ignore
  }
  return null;
}

function loadUiPrefs(): UiPrefs {
  const urlMode = resolveInitialTradingModeFromUrl();
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY) ?? window.localStorage.getItem('trading_empire_ui_prefs_v1');
    if (!raw) {
      return { ...DEFAULT_UI_PREFS, tradingMode: urlMode ?? DEFAULT_UI_PREFS.tradingMode };
    }
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : DEFAULT_UI_PREFS.watchlist,
      tradingMode:
        urlMode ?? (parsed.tradingMode === 'PRO' || parsed.tradingMode === 'BEGINNER' ? parsed.tradingMode : 'BEGINNER'),
      glossaryLang: parsed.glossaryLang === 'en' ? 'en' : 'vi',
      tutorialCompletedIds: Array.isArray(parsed.tutorialCompletedIds) ? parsed.tutorialCompletedIds : [],
      futuresIntroSeen: Boolean(parsed.futuresIntroSeen),
      careerSoundMuted: Boolean(parsed.careerSoundMuted),
      careerTypewriterEnabled:
        typeof parsed.careerTypewriterEnabled === 'boolean' ? parsed.careerTypewriterEnabled : true,
      careerSubtitlesEnabled:
        typeof parsed.careerSubtitlesEnabled === 'boolean' ? parsed.careerSubtitlesEnabled : true,
      reducedMotionPref: Boolean(parsed.reducedMotionPref),
    };
  } catch {
    return { ...DEFAULT_UI_PREFS, tradingMode: urlMode ?? DEFAULT_UI_PREFS.tradingMode };
  }
}

function saveUiPrefs(prefs: UiPrefs): void {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

interface AppState {
  // Navigation & UI Prefs
  activePage: NavPage;
  exchangeTab: UnifiedExchangeTab;
  empireTab: MyEmpireTab;
  assetsTab: MyAssetsTab;
  lifestyleTab: LifestyleTab;
  worldTab: WorldTab;
  businessCreationIntent: boolean;
  businessTabIntent: BusinessTycoonTab | null;
  exchangeClassFilter: 'ALL' | 'CRYPTO' | 'STOCK';
  selectedSymbol: string;
  selectedForexSymbol: string;
  selectedFuturesSymbol: string;
  timeframe: Timeframe;
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: string[];
  tradingMode: TradingExperienceMode;
  worldMode: WorldMode;
  glossaryLang: GlossaryLanguage;
  glossaryDrawerOpen: boolean;
  tutorialOpen: boolean;
  tutorialActiveLessonId: string;
  tutorialCompletedIds: string[];
  futuresIntroSeen: boolean;

  // Project Immersion — Account Mode & Career Story State
  playMode: GamePlayMode;
  modeSwitching: boolean;
  modeSwitchError: string | null;
  accountOverview: AccountOverviewPayload | null;
  careerStory: CareerStoryState | null;
  activeCareerSaveId: string | null;
  careerSoundMuted: boolean;
  careerTypewriterEnabled: boolean;
  careerSubtitlesEnabled: boolean;
  reducedMotionPref: boolean;
  mainMenuOpen: boolean;
  phoneOpen: boolean;
  journalOpen: boolean;
  endingModalOpen: boolean;
  gameFeedback: GameFeedbackEvent | null;

  // Session & Connection (in-memory only)
  token: string | null;
  player: PlayerProfile | null;
  connectionState: ConnectionState;
  lastSequenceNumber: number;
  isDemoTemporaryServer: boolean;

  // Shared Authoritative World State
  worldId: string;
  worldName: string;
  onlineHumanPlayers: number;
  simulatedAgentsCount: number;
  gameClock: GameClock | null;
  economy: EconomyState | null;
  assets: Asset[];
  forexOverview: ForexOverviewSnapshot | null;
  futuresOverview: FuturesOverviewSnapshot | null;
  orderBooks: Record<string, OrderBookSnapshot>;
  recentTradesBySymbol: Record<string, Trade[]>;
  liveCandleTick: { symbol: string; candles: Record<Timeframe, Candle> } | null;
  futuresOrderBooks: Record<string, FuturesOrderBookSnapshot>;
  futuresRecentTradesBySymbol: Record<string, FuturesTrade[]>;
  futuresLiveCandleTick: { symbol: string; candles: Record<Timeframe, Candle> } | null;
  futuresSyncSeq: number;
  news: NewsItem[];
  chatMessages: ChatMessage[];
  notifications: NotificationItem[];
  toasts: ToastItem[];
  lastRealtimeTradeSeq: number;
  orderSyncSeq: number;
  v4SyncSeq: number;
  connectSyncSeq: number;
  cofounderSyncSeq: number;
  selectedHqCompanyId: string | null;
  connectUnreadNotifications: number;
  connectUnreadMessages: number;

  // Actions
  setActivePage: (page: NavPage) => void;
  setExchangeTab: (tab: UnifiedExchangeTab) => void;
  setEmpireTab: (tab: MyEmpireTab) => void;
  setAssetsTab: (tab: MyAssetsTab) => void;
  setLifestyleTab: (tab: LifestyleTab) => void;
  setWorldTab: (tab: WorldTab) => void;
  openBusinessCreationWizard: () => void;
  clearBusinessCreationIntent: () => void;
  openBusinessWorkspaceTab: (tab: BusinessTycoonTab) => void;
  clearBusinessTabIntent: () => void;
  clearBusinessIntents: () => void;
  openCompanyHq: (companyId: string) => void;
  setSelectedHqCompanyId: (companyId: string | null) => void;
  setConnectUnreadCounts: (notifications: number, messages: number) => void;
  openAssetInExchange: (symbol: string, marketClass?: 'CRYPTO' | 'STOCK') => void;
  openForexPair: (symbol: string) => void;
  openFuturesContract: (symbol: string) => void;
  setExchangeClassFilter: (filter: 'ALL' | 'CRYPTO' | 'STOCK') => void;
  setSelectedSymbol: (symbol: string) => void;
  setSelectedForexSymbol: (symbol: string) => void;
  setSelectedFuturesSymbol: (symbol: string) => void;
  setForexOverview: (overview: ForexOverviewSnapshot) => void;
  setFuturesOverview: (overview: FuturesOverviewSnapshot) => void;
  setFuturesOrderBook: (book: FuturesOrderBookSnapshot) => void;
  setFuturesRecentTrades: (symbol: string, trades: FuturesTrade[]) => void;
  setTimeframe: (tf: Timeframe) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleWatchlist: (symbol: string) => void;
  setTradingMode: (mode: TradingExperienceMode) => void;
  setWorldMode: (mode: WorldMode) => void;
  setGlossaryLang: (lang: GlossaryLanguage) => void;
  setGlossaryDrawerOpen: (open: boolean) => void;
  setTutorialOpen: (open: boolean) => void;
  setTutorialActiveLessonId: (lessonId: string) => void;
  completeTutorialLesson: (lessonId: string) => void;
  markFuturesIntroSeen: () => void;
  setPlayMode: (mode: GamePlayMode) => void;
  setModeSwitching: (switching: boolean, error?: string | null) => void;
  setAccountOverview: (overview: AccountOverviewPayload | null) => void;
  setCareerStory: (story: CareerStoryState | null) => void;
  setActiveCareerSaveId: (saveId: string | null) => void;
  toggleCareerSoundMuted: () => void;
  toggleCareerTypewriter: () => void;
  toggleCareerSubtitles: () => void;
  toggleReducedMotion: () => void;
  setMainMenuOpen: (open: boolean) => void;
  setPhoneOpen: (open: boolean) => void;
  setJournalOpen: (open: boolean) => void;
  setEndingModalOpen: (open: boolean) => void;
  showGameFeedback: (event: Omit<GameFeedbackEvent, 'id'>) => void;
  dismissGameFeedback: () => void;
  clearWorldCachesForModeSwitch: () => void;
  setSession: (token: string | null, player: PlayerProfile | null) => void;
  setPlayer: (player: PlayerProfile | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  applyWorldSnapshot: (snapshot: WorldSnapshot) => void;
  setOrderBook: (book: OrderBookSnapshot) => void;
  setRecentTrades: (symbol: string, trades: Trade[]) => void;
  upsertSpotOrder: (order: Order) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  applyRealtimeEnvelope: (envelope: RealtimeEnvelope) => boolean; // returns true if sequence gap detected
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
  markNotificationsRead: () => void;
}

const initialPrefs: UiPrefs = typeof window !== 'undefined' ? loadUiPrefs() : DEFAULT_UI_PREFS;

function persistFromState(s: AppState, overrides: Partial<UiPrefs> = {}): void {
  saveUiPrefs({
    theme: overrides.theme ?? s.theme,
    sidebarCollapsed: overrides.sidebarCollapsed ?? s.sidebarCollapsed,
    watchlist: overrides.watchlist ?? s.watchlist,
    tradingMode: overrides.tradingMode ?? s.tradingMode,
    glossaryLang: overrides.glossaryLang ?? s.glossaryLang,
    tutorialCompletedIds: overrides.tutorialCompletedIds ?? s.tutorialCompletedIds,
    futuresIntroSeen: overrides.futuresIntroSeen ?? s.futuresIntroSeen,
    careerSoundMuted: overrides.careerSoundMuted ?? s.careerSoundMuted,
    careerTypewriterEnabled: overrides.careerTypewriterEnabled ?? s.careerTypewriterEnabled,
    careerSubtitlesEnabled: overrides.careerSubtitlesEnabled ?? s.careerSubtitlesEnabled,
    reducedMotionPref: overrides.reducedMotionPref ?? s.reducedMotionPref,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  activePage: 'overview',
  exchangeTab: 'spot',
  empireTab: 'business',
  assetsTab: 'portfolio',
  lifestyleTab: 'rank',
  worldTab: 'connect',
  businessCreationIntent: false,
  businessTabIntent: null,
  exchangeClassFilter: 'ALL',
  selectedSymbol: 'NOVA',
  selectedForexSymbol: 'EUR-SIM/USD-SIM',
  selectedFuturesSymbol: 'BTC-SIM/CR-PERP',
  timeframe: '5m',
  theme: initialPrefs.theme,
  sidebarCollapsed: initialPrefs.sidebarCollapsed,
  watchlist: initialPrefs.watchlist,
  tradingMode: initialPrefs.tradingMode,
  worldMode: 'LIVE',
  glossaryLang: initialPrefs.glossaryLang,
  glossaryDrawerOpen: false,
  tutorialOpen: false,
  tutorialActiveLessonId: 'lesson_1_cr_wallet',
  tutorialCompletedIds: initialPrefs.tutorialCompletedIds,
  futuresIntroSeen: initialPrefs.futuresIntroSeen,

  playMode: 'ONLINE',
  modeSwitching: false,
  modeSwitchError: null,
  accountOverview: null,
  careerStory: null,
  activeCareerSaveId: null,
  careerSoundMuted: initialPrefs.careerSoundMuted,
  careerTypewriterEnabled: initialPrefs.careerTypewriterEnabled,
  careerSubtitlesEnabled: initialPrefs.careerSubtitlesEnabled,
  reducedMotionPref: initialPrefs.reducedMotionPref,
  mainMenuOpen: false,
  phoneOpen: false,
  journalOpen: false,
  endingModalOpen: false,
  gameFeedback: null,

  token: null,
  player: null,
  connectionState: 'connecting',
  lastSequenceNumber: 0,
  isDemoTemporaryServer: true,

  worldId: 'WORLD-01',
  worldName: 'WORLD-01: GLOBAL ECONOMY',
  onlineHumanPlayers: 0,
  simulatedAgentsCount: 14,
  gameClock: null,
  economy: null,
  assets: [],
  forexOverview: null,
  futuresOverview: null,
  orderBooks: {},
  recentTradesBySymbol: {},
  liveCandleTick: null,
  futuresOrderBooks: {},
  futuresRecentTradesBySymbol: {},
  futuresLiveCandleTick: null,
  futuresSyncSeq: 0,
  news: [],
  chatMessages: [],
  notifications: [],
  toasts: [],
  lastRealtimeTradeSeq: 0,
  orderSyncSeq: 0,
  v4SyncSeq: 0,
  connectSyncSeq: 0,
  cofounderSyncSeq: 0,
  selectedHqCompanyId: null,
  connectUnreadNotifications: 0,
  connectUnreadMessages: 0,

  setActivePage: (page) =>
    set((state) => {
      const resolved = resolveCanonicalNavigation(page);
      return {
        activePage: resolved.activePage,
        exchangeTab: resolved.exchangeTab ?? state.exchangeTab,
        empireTab: resolved.empireTab ?? state.empireTab,
        assetsTab: resolved.assetsTab ?? state.assetsTab,
        lifestyleTab: resolved.lifestyleTab ?? state.lifestyleTab,
        worldTab: resolved.worldTab ?? state.worldTab,
      };
    }),
  setExchangeTab: (exchangeTab) => set({ activePage: 'unified_exchange', exchangeTab }),
  setEmpireTab: (empireTab) => set({ activePage: 'my_empire', empireTab }),
  setAssetsTab: (assetsTab) => set({ activePage: 'my_assets', assetsTab }),
  setLifestyleTab: (lifestyleTab) => set({ activePage: 'lifestyle', lifestyleTab }),
  setWorldTab: (worldTab) => set({ activePage: 'world', worldTab }),
  openBusinessCreationWizard: () =>
    set({
      activePage: 'my_empire',
      empireTab: 'business',
      businessCreationIntent: true,
    }),
  clearBusinessCreationIntent: () => set({ businessCreationIntent: false }),
  openBusinessWorkspaceTab: (tab) =>
    set({
      activePage: 'my_empire',
      empireTab: 'business',
      businessTabIntent: tab,
    }),
  clearBusinessTabIntent: () => set({ businessTabIntent: null }),
  clearBusinessIntents: () => set({ businessCreationIntent: false, businessTabIntent: null }),
  openCompanyHq: (companyId) =>
    set({ selectedHqCompanyId: companyId, activePage: 'my_empire', empireTab: 'hq' }),
  setSelectedHqCompanyId: (selectedHqCompanyId) => set({ selectedHqCompanyId }),
  setConnectUnreadCounts: (connectUnreadNotifications, connectUnreadMessages) =>
    set({ connectUnreadNotifications, connectUnreadMessages }),

  openAssetInExchange: (symbol, marketClass) =>
    set({
      selectedSymbol: symbol,
      exchangeClassFilter: marketClass ?? 'ALL',
      activePage: 'unified_exchange',
      exchangeTab: 'spot',
    }),

  openForexPair: (symbol) =>
    set({
      selectedForexSymbol: symbol,
      activePage: 'unified_exchange',
      exchangeTab: 'forex',
    }),

  openFuturesContract: (symbol) =>
    set({
      selectedFuturesSymbol: symbol,
      activePage: 'unified_exchange',
      exchangeTab: 'futures',
    }),

  setExchangeClassFilter: (filter) => set({ exchangeClassFilter: filter }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSelectedForexSymbol: (symbol) => set({ selectedForexSymbol: symbol }),
  setSelectedFuturesSymbol: (symbol) => set({ selectedFuturesSymbol: symbol }),
  setForexOverview: (forexOverview) => set({ forexOverview }),
  setFuturesOverview: (futuresOverview) => set({ futuresOverview }),
  setFuturesOrderBook: (book) =>
    set((state) => ({
      futuresOrderBooks: { ...state.futuresOrderBooks, [book.symbol]: book },
    })),
  setFuturesRecentTrades: (symbol, trades) =>
    set((state) => ({
      futuresRecentTradesBySymbol: { ...state.futuresRecentTradesBySymbol, [symbol]: trades },
    })),
  setTimeframe: (tf) => set({ timeframe: tf }),

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      persistFromState(state, { theme: next });
      return { theme: next };
    }),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      persistFromState(state, { sidebarCollapsed: next });
      return { sidebarCollapsed: next };
    }),

  toggleWatchlist: (symbol) =>
    set((state) => {
      const exists = state.watchlist.includes(symbol);
      const next = exists ? state.watchlist.filter((s) => s !== symbol) : [...state.watchlist, symbol];
      persistFromState(state, { watchlist: next });
      return { watchlist: next };
    }),

  setTradingMode: (tradingMode) =>
    set((state) => {
      persistFromState(state, { tradingMode });
      return { tradingMode };
    }),

  setWorldMode: (worldMode) =>
    set({
      worldMode,
      orderBooks: {},
      recentTradesBySymbol: {},
      futuresOrderBooks: {},
      futuresRecentTradesBySymbol: {},
      forexOverview: null,
      futuresOverview: null,
      liveCandleTick: null,
      futuresLiveCandleTick: null,
    }),

  setGlossaryLang: (glossaryLang) =>
    set((state) => {
      persistFromState(state, { glossaryLang });
      return { glossaryLang };
    }),

  setGlossaryDrawerOpen: (glossaryDrawerOpen) => set({ glossaryDrawerOpen }),
  setTutorialOpen: (tutorialOpen) => set({ tutorialOpen }),
  setTutorialActiveLessonId: (tutorialActiveLessonId) => set({ tutorialActiveLessonId }),

  completeTutorialLesson: (lessonId) =>
    set((state) => {
      if (state.tutorialCompletedIds.includes(lessonId)) return state;
      const next = [...state.tutorialCompletedIds, lessonId];
      persistFromState(state, { tutorialCompletedIds: next });
      return { tutorialCompletedIds: next };
    }),

  markFuturesIntroSeen: () =>
    set((state) => {
      persistFromState(state, { futuresIntroSeen: true });
      return { futuresIntroSeen: true };
    }),

  setPlayMode: (playMode) => set({ playMode }),
  setModeSwitching: (modeSwitching, modeSwitchError = null) => set({ modeSwitching, modeSwitchError }),
  setAccountOverview: (accountOverview) => set({ accountOverview }),
  setCareerStory: (careerStory) => set({ careerStory }),
  setActiveCareerSaveId: (activeCareerSaveId) => set({ activeCareerSaveId }),
  toggleCareerSoundMuted: () =>
    set((state) => {
      const next = !state.careerSoundMuted;
      persistFromState(state, { careerSoundMuted: next });
      return { careerSoundMuted: next };
    }),
  toggleCareerTypewriter: () =>
    set((state) => {
      const next = !state.careerTypewriterEnabled;
      persistFromState(state, { careerTypewriterEnabled: next });
      return { careerTypewriterEnabled: next };
    }),
  toggleCareerSubtitles: () =>
    set((state) => {
      const next = !state.careerSubtitlesEnabled;
      persistFromState(state, { careerSubtitlesEnabled: next });
      return { careerSubtitlesEnabled: next };
    }),
  toggleReducedMotion: () =>
    set((state) => {
      const next = !state.reducedMotionPref;
      persistFromState(state, { reducedMotionPref: next });
      return { reducedMotionPref: next };
    }),
  setMainMenuOpen: (mainMenuOpen) => set({ mainMenuOpen }),
  // Unified overlay mutual exclusion: Phone and Journal never stack unintentionally
  setPhoneOpen: (phoneOpen) =>
    set((state) => ({
      phoneOpen,
      journalOpen: phoneOpen ? false : state.journalOpen,
    })),
  setJournalOpen: (journalOpen) =>
    set((state) => ({
      journalOpen,
      phoneOpen: journalOpen ? false : state.phoneOpen,
    })),
  setEndingModalOpen: (endingModalOpen) => set({ endingModalOpen }),
  showGameFeedback: (event) =>
    set({
      gameFeedback: {
        ...event,
        id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      },
    }),
  dismissGameFeedback: () => set({ gameFeedback: null }),
  clearWorldCachesForModeSwitch: () => {
    resetSeenRealtimeEvents();
    set({
      orderBooks: {},
      recentTradesBySymbol: {},
      futuresOrderBooks: {},
      futuresRecentTradesBySymbol: {},
      forexOverview: null,
      futuresOverview: null,
      liveCandleTick: null,
      futuresLiveCandleTick: null,
      chatMessages: [],
      lastSequenceNumber: 0,
    });
  },

  setSession: (token, player) => {
    resetSeenRealtimeEvents();
    set({ token, player });
  },
  setPlayer: (player) => set({ player }),
  setConnectionState: (connectionState) => set({ connectionState }),

  applyWorldSnapshot: (snapshot) =>
    set((state) => ({
      worldId: snapshot.worldId,
      worldName: snapshot.worldName,
      isDemoTemporaryServer: snapshot.isDemoTemporaryServer,
      lastSequenceNumber: snapshot.sequenceNumber,
      onlineHumanPlayers: snapshot.onlineHumanPlayers,
      simulatedAgentsCount: snapshot.simulatedAgentsCount,
      gameClock: snapshot.gameClock,
      economy: snapshot.economy,
      assets: snapshot.assets,
      news: snapshot.news,
      player: snapshot.player ?? state.player,
    })),

  setOrderBook: (book) =>
    set((state) => ({
      orderBooks: { ...state.orderBooks, [book.symbol]: book },
    })),

  setRecentTrades: (symbol, trades) =>
    set((state) => ({
      recentTradesBySymbol: { ...state.recentTradesBySymbol, [symbol]: trades },
    })),

  upsertSpotOrder: (order) => {
    const player = get().player;
    if (player && order.playerId === player.id) {
      applySpotOrderToQueryCache(player.id, order);
    }
    set((state) => ({ orderSyncSeq: state.orderSyncSeq + 1 }));
  },

  setChatMessages: (messages) => set({ chatMessages: messages }),

  applyRealtimeEnvelope: (envelope) => {
    const state = get();
    // Strict World isolation: NEVER apply WORLD-01 Socket.IO events while user is inside CAREER MODE or WORLD-PRACTICE!
    if (
      state.playMode === 'CAREER' ||
      state.worldMode === 'PRACTICE' ||
      (envelope.worldId && envelope.worldId !== state.worldId && envelope.eventType !== 'world.snapshot')
    ) {
      return false;
    }

    // Idempotency guard: ignore duplicate event deliveries cleanly
    if (envelope.eventType !== 'world.snapshot' && markEventSeen(envelope.eventId)) {
      return false;
    }

    const gapDetected =
      state.lastSequenceNumber > 0 &&
      envelope.sequenceNumber > state.lastSequenceNumber + 25 &&
      envelope.eventType !== 'world.snapshot';

    const nextSeq = Math.max(state.lastSequenceNumber, envelope.sequenceNumber);

    switch (envelope.eventType) {
      case 'world.snapshot': {
        state.applyWorldSnapshot(envelope.payload as WorldSnapshot);
        return false;
      }

      case 'world.status': {
        const p = envelope.payload as {
          gameClock: GameClock;
          economy: EconomyState;
          onlineHumanPlayers: number;
          simulatedAgentsCount: number;
        };
        set({
          lastSequenceNumber: nextSeq,
          gameClock: p.gameClock,
          economy: p.economy,
          onlineHumanPlayers: p.onlineHumanPlayers,
          simulatedAgentsCount: p.simulatedAgentsCount,
        });
        break;
      }

      case 'player.joined':
      case 'player.left': {
        const p = envelope.payload as { onlineHumanPlayers: number };
        set({ lastSequenceNumber: nextSeq, onlineHumanPlayers: p.onlineHumanPlayers });
        break;
      }

      case 'market.quote.updated': {
        const updatedAsset = envelope.payload as Asset;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          assets: s.assets.map((a) => (a.symbol === updatedAsset.symbol ? updatedAsset : a)),
        }));
        break;
      }

      case 'market.orderbook.updated': {
        const book = envelope.payload as OrderBookSnapshot;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          orderBooks: { ...s.orderBooks, [book.symbol]: book },
        }));
        break;
      }

      case 'market.trade.executed':
      case 'trade.executed': {
        const trade = envelope.payload as Trade;
        const involvesSelf = Boolean(
          state.player && (trade.buyerId === state.player.id || trade.sellerId === state.player.id),
        );
        set((s) => {
          const existing = s.recentTradesBySymbol[trade.symbol] ?? [];
          if (existing.some((t) => t.id === trade.id)) {
            return {
              lastSequenceNumber: nextSeq,
              orderSyncSeq: involvesSelf ? s.orderSyncSeq + 1 : s.orderSyncSeq,
            };
          }
          const updatedList = [trade, ...existing].slice(0, 60);
          return {
            lastSequenceNumber: nextSeq,
            lastRealtimeTradeSeq: s.lastRealtimeTradeSeq + 1,
            orderSyncSeq: involvesSelf ? s.orderSyncSeq + 1 : s.orderSyncSeq,
            recentTradesBySymbol: {
              ...s.recentTradesBySymbol,
              [trade.symbol]: updatedList,
            },
          };
        });
        if (involvesSelf && state.player) {
          void queryClient.invalidateQueries({ queryKey: ['playerOrders', state.player.id] });
        }
        break;
      }

      case 'order.created':
      case 'order.partially_filled':
      case 'order.filled':
      case 'order.cancelled':
      case 'order.expired': {
        const order = envelope.payload as Order;
        if (state.player && order && order.playerId === state.player.id) {
          applySpotOrderToQueryCache(state.player.id, order);
          set((s) => ({
            lastSequenceNumber: nextSeq,
            orderSyncSeq: s.orderSyncSeq + 1,
          }));
        } else {
          set({ lastSequenceNumber: nextSeq });
        }
        break;
      }

      case 'market.candle.updated': {
        const payload = envelope.payload as { symbol: string; candles: Record<Timeframe, Candle> };
        set({ lastSequenceNumber: nextSeq, liveCandleTick: payload });
        break;
      }

      case 'portfolio.updated': {
        const profile = envelope.payload as PlayerProfile;
        if (state.player && profile.id === state.player.id) {
          set({ lastSequenceNumber: nextSeq, player: profile });
        }
        break;
      }

      case 'balance.updated': {
        const payload = envelope.payload as { playerId: string; wallet: PlayerProfile['wallet'] };
        if (state.player && payload.playerId === state.player.id) {
          set((s) => ({
            lastSequenceNumber: nextSeq,
            player: s.player ? { ...s.player, wallet: payload.wallet } : null,
          }));
        }
        break;
      }

      case 'news.published': {
        const item = envelope.payload as NewsItem;
        set((s) => {
          if (s.news.some((n) => n.id === item.id)) return { lastSequenceNumber: nextSeq };
          const notif: NotificationItem = {
            id: item.id,
            title: 'Bản tin kinh tế WORLD-01',
            detail: item.headline,
            timestamp: item.publishedAt,
            read: false,
          };
          return {
            lastSequenceNumber: nextSeq,
            news: [item, ...s.news].slice(0, 60),
            notifications: [notif, ...s.notifications].slice(0, 25),
          };
        });
        break;
      }

      case 'chat.message': {
        const msg = envelope.payload as ChatMessage;
        set((s) => {
          if (s.chatMessages.some((m) => m.id === msg.id)) return { lastSequenceNumber: nextSeq };
          return {
            lastSequenceNumber: nextSeq,
            chatMessages: [...s.chatMessages, msg].slice(-120),
          };
        });
        break;
      }

      case 'forex.central_bank.updated': {
        const overview = envelope.payload as ForexOverviewSnapshot;
        set({ lastSequenceNumber: nextSeq, forexOverview: overview });
        break;
      }

      case 'futures.quote.updated': {
        const updatedContract = envelope.payload as FuturesContract;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresOverview: s.futuresOverview
            ? {
                ...s.futuresOverview,
                contracts: s.futuresOverview.contracts.map((c) =>
                  c.symbol === updatedContract.symbol ? updatedContract : c,
                ),
              }
            : s.futuresOverview,
        }));
        break;
      }

      case 'futures.orderbook.updated': {
        const book = envelope.payload as FuturesOrderBookSnapshot;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresOrderBooks: { ...s.futuresOrderBooks, [book.symbol]: book },
        }));
        break;
      }

      case 'futures.trade.executed': {
        const trade = envelope.payload as FuturesTrade;
        const involvesSelf = Boolean(
          state.player && (trade.buyerId === state.player.id || trade.sellerId === state.player.id),
        );
        if (involvesSelf && state.player) {
          applyFuturesTradeToQueryCache(state.player.id, trade);
        }
        set((s) => {
          const existing = s.futuresRecentTradesBySymbol[trade.symbol] ?? [];
          if (existing.some((t) => t.id === trade.id)) {
            return {
              lastSequenceNumber: nextSeq,
              futuresSyncSeq: involvesSelf ? s.futuresSyncSeq + 1 : s.futuresSyncSeq,
            };
          }
          return {
            lastSequenceNumber: nextSeq,
            futuresSyncSeq: involvesSelf ? s.futuresSyncSeq + 1 : s.futuresSyncSeq,
            futuresRecentTradesBySymbol: {
              ...s.futuresRecentTradesBySymbol,
              [trade.symbol]: [trade, ...existing].slice(0, 60),
            },
          };
        });
        break;
      }

      case 'futures.order.created':
      case 'futures.order.partially_filled':
      case 'futures.order.filled':
      case 'futures.order.cancelled':
      case 'futures.order.expired': {
        const fOrder = envelope.payload as FuturesOrder;
        if (state.player && fOrder && fOrder.playerId === state.player.id) {
          applyFuturesOrderToQueryCache(state.player.id, fOrder);
          set((s) => ({
            lastSequenceNumber: nextSeq,
            futuresSyncSeq: s.futuresSyncSeq + 1,
          }));
        } else {
          set({ lastSequenceNumber: nextSeq });
        }
        break;
      }

      case 'futures.candle.updated': {
        const payload = envelope.payload as { symbol: string; candles: Record<Timeframe, Candle> };
        set({ lastSequenceNumber: nextSeq, futuresLiveCandleTick: payload });
        break;
      }

      case 'futures.position.updated': {
        const posPayload = envelope.payload as {
          playerId?: string;
          symbol?: string;
          position?: FuturesPosition | null;
        } | null;
        const isSelf = Boolean(state.player && posPayload?.playerId === state.player.id);
        if (isSelf && state.player && posPayload?.symbol) {
          applyFuturesPositionToQueryCache(state.player.id, posPayload.symbol, posPayload.position ?? null);
        }
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresSyncSeq: isSelf ? s.futuresSyncSeq + 1 : s.futuresSyncSeq,
        }));
        break;
      }

      case 'futures.funding.settled': {
        const evt = envelope.payload as FuturesFundingSettlementEvent;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresSyncSeq: s.futuresSyncSeq + 1,
          futuresOverview: s.futuresOverview
            ? {
                ...s.futuresOverview,
                recentFundingSettlements: [
                  evt,
                  ...s.futuresOverview.recentFundingSettlements.filter((f) => f.id !== evt.id),
                ].slice(0, 30),
              }
            : s.futuresOverview,
        }));
        break;
      }

      case 'futures.liquidation.executed': {
        const liq = envelope.payload as FuturesLiquidationEvent;
        const isSelf = state.player && liq.playerId === state.player.id;
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresSyncSeq: s.futuresSyncSeq + 1,
          futuresOverview: s.futuresOverview
            ? {
                ...s.futuresOverview,
                recentLiquidations: [
                  liq,
                  ...s.futuresOverview.recentLiquidations.filter((l) => l.id !== liq.id),
                ].slice(0, 30),
              }
            : s.futuresOverview,
        }));
        if (isSelf) {
          state.pushToast({
            tone: 'error',
            title: `Thanh lý vị thế ${liq.symbol}`,
            description: liq.note,
          });
        }
        break;
      }

      case 'futures.margin_call': {
        const pos = envelope.payload as FuturesPosition;
        const isSelf = Boolean(state.player && pos.playerId === state.player.id);
        set((s) => ({
          lastSequenceNumber: nextSeq,
          futuresSyncSeq: isSelf ? s.futuresSyncSeq + 1 : s.futuresSyncSeq,
        }));
        if (isSelf) {
          state.pushToast({
            tone: 'warning',
            title: `Cảnh báo Margin Call: ${pos.symbol}`,
            description: `Tỷ lệ ký quỹ đạt ${pos.marginRatioPct.toFixed(1)}%. Hãy bổ sung ký quỹ hoặc giảm vị thế trước khi chạm 100%.`,
          });
        }
        break;
      }

      case 'cofounder.project.updated':
      case 'cofounder.invite.received':
      case 'cofounder.commitment.updated':
      case 'cofounder.company.activated':
      case 'board.proposal.created':
      case 'board.proposal.voted':
      case 'board.proposal.executed':
      case 'capital.round.updated':
      case 'jv.updated': {
        set((s) => ({
          lastSequenceNumber: nextSeq,
          cofounderSyncSeq: s.cofounderSyncSeq + 1,
          v4SyncSeq: s.v4SyncSeq + 1,
        }));
        break;
      }

      case 'business.created':
      case 'business.upgraded':
      case 'business.branch.opened':
      case 'business.revenue.updated':
      case 'company.shares.transferred':
      case 'company.dividend.paid':
      case 'company.acquisition.completed':
      case 'fund.created':
      case 'fund.subscription.completed':
      case 'fund.redemption.completed':
      case 'luxury.asset.purchased':
      case 'luxury.asset.sold':
      case 'career.mission.completed':
      case 'player.rank.changed': {
        set((s) => ({
          lastSequenceNumber: nextSeq,
          v4SyncSeq: s.v4SyncSeq + 1,
        }));
        break;
      }

      case 'friend.requested':
      case 'friend.accepted':
      case 'friend.removed':
      case 'message.created':
      case 'message.read':
      case 'club.created':
      case 'club.member.joined':
      case 'club.member.removed':
      case 'club.announcement.created':
      case 'post.created':
      case 'post.updated':
      case 'post.deleted':
      case 'comment.created':
      case 'notification.created':
      case 'achievement.unlocked':
      case 'achievement.shared': {
        set((s) => ({
          lastSequenceNumber: nextSeq,
          connectSyncSeq: s.connectSyncSeq + 1,
        }));
        break;
      }

      default:
        set({ lastSequenceNumber: nextSeq });
    }

    return gapDetected;
  },

  pushToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  markNotificationsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
}));
