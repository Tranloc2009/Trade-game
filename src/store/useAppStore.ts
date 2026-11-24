import { create } from 'zustand';
import type {
  FuturesContract,
  FuturesFundingSettlementEvent,
  FuturesLiquidationEvent,
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
  OrderBookSnapshot,
  PlayerProfile,
  RealtimeEnvelope,
  Timeframe,
  Trade,
  WorldSnapshot,
} from '../../shared/contracts/types';

export type NavPage =
  | 'overview'
  | 'exchange'
  | 'forex'
  | 'futures'
  | 'portfolio'
  | 'property'
  | 'business'
  | 'banking'
  | 'social'
  | 'leaderboard'
  | 'news'
  | 'entertainment'
  | 'settings';

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

// Non-sensitive UI preferences ONLY (financial state is NEVER stored in localStorage)
const UI_PREFS_KEY = 'trading_empire_ui_prefs_v1';

interface UiPrefs {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: string[];
  propertyWatchlist: string[];
}

function loadUiPrefs(): UiPrefs {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) {
      return {
        theme: 'dark',
        sidebarCollapsed: false,
        watchlist: ['NOVA', 'BTC-SIM', 'ETH-SIM', 'NEXB'],
        propertyWatchlist: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : ['NOVA', 'BTC-SIM', 'ETH-SIM', 'NEXB'],
      propertyWatchlist: Array.isArray(parsed.propertyWatchlist) ? parsed.propertyWatchlist : [],
    };
  } catch {
    return {
      theme: 'dark',
      sidebarCollapsed: false,
      watchlist: ['NOVA', 'BTC-SIM', 'ETH-SIM', 'NEXB'],
      propertyWatchlist: [],
    };
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
  exchangeClassFilter: 'ALL' | 'CRYPTO' | 'STOCK';
  selectedSymbol: string;
  selectedForexSymbol: string;
  selectedFuturesSymbol: string;
  timeframe: Timeframe;
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: string[];
  propertyWatchlist: string[];

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
  propertySyncSeq: number;

  // Actions
  setActivePage: (page: NavPage) => void;
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
  togglePropertyWatchlist: (propertyId: string) => void;
  setSession: (token: string | null, player: PlayerProfile | null) => void;
  setPlayer: (player: PlayerProfile | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  applyWorldSnapshot: (snapshot: WorldSnapshot) => void;
  setOrderBook: (book: OrderBookSnapshot) => void;
  setRecentTrades: (symbol: string, trades: Trade[]) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  applyRealtimeEnvelope: (envelope: RealtimeEnvelope) => boolean; // returns true if sequence gap detected
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
  markNotificationsRead: () => void;
}

const initialPrefs =
  typeof window !== 'undefined'
    ? loadUiPrefs()
    : {
        theme: 'dark' as const,
        sidebarCollapsed: false,
        watchlist: ['NOVA', 'BTC-SIM', 'ETH-SIM', 'NEXB'],
        propertyWatchlist: [],
      };

export const useAppStore = create<AppState>((set, get) => ({
  activePage: 'overview',
  exchangeClassFilter: 'ALL',
  selectedSymbol: 'NOVA',
  selectedForexSymbol: 'EUR-SIM/USD-SIM',
  selectedFuturesSymbol: 'BTC-SIM/CR-PERP',
  timeframe: '5m',
  theme: initialPrefs.theme,
  sidebarCollapsed: initialPrefs.sidebarCollapsed,
  watchlist: initialPrefs.watchlist,
  propertyWatchlist: initialPrefs.propertyWatchlist,

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
  propertySyncSeq: 0,

  setActivePage: (page) => set({ activePage: page }),

  openAssetInExchange: (symbol, marketClass) =>
    set({
      selectedSymbol: symbol,
      exchangeClassFilter: marketClass ?? 'ALL',
      activePage: 'exchange',
    }),

  openForexPair: (symbol) =>
    set({
      selectedForexSymbol: symbol,
      activePage: 'forex',
    }),

  openFuturesContract: (symbol) =>
    set({
      selectedFuturesSymbol: symbol,
      activePage: 'futures',
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
      saveUiPrefs({
        theme: next,
        sidebarCollapsed: state.sidebarCollapsed,
        watchlist: state.watchlist,
        propertyWatchlist: state.propertyWatchlist,
      });
      return { theme: next };
    }),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      saveUiPrefs({
        theme: state.theme,
        sidebarCollapsed: next,
        watchlist: state.watchlist,
        propertyWatchlist: state.propertyWatchlist,
      });
      return { sidebarCollapsed: next };
    }),

  toggleWatchlist: (symbol) =>
    set((state) => {
      const exists = state.watchlist.includes(symbol);
      const next = exists ? state.watchlist.filter((s) => s !== symbol) : [...state.watchlist, symbol];
      saveUiPrefs({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        watchlist: next,
        propertyWatchlist: state.propertyWatchlist,
      });
      return { watchlist: next };
    }),

  togglePropertyWatchlist: (propertyId) =>
    set((state) => {
      const exists = state.propertyWatchlist.includes(propertyId);
      const next = exists
        ? state.propertyWatchlist.filter((id) => id !== propertyId)
        : [...state.propertyWatchlist, propertyId];
      saveUiPrefs({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        watchlist: state.watchlist,
        propertyWatchlist: next,
      });
      return { propertyWatchlist: next };
    }),

  setSession: (token, player) => set({ token, player }),
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

  setChatMessages: (messages) => set({ chatMessages: messages }),

  applyRealtimeEnvelope: (envelope) => {
    const state = get();
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

      case 'market.trade.executed': {
        const trade = envelope.payload as Trade;
        set((s) => {
          const existing = s.recentTradesBySymbol[trade.symbol] ?? [];
          if (existing.some((t) => t.id === trade.id)) {
            return { lastSequenceNumber: nextSeq };
          }
          const updatedList = [trade, ...existing].slice(0, 60);
          return {
            lastSequenceNumber: nextSeq,
            lastRealtimeTradeSeq: s.lastRealtimeTradeSeq + 1,
            recentTradesBySymbol: {
              ...s.recentTradesBySymbol,
              [trade.symbol]: updatedList,
            },
          };
        });
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
        set((s) => {
          const existing = s.futuresRecentTradesBySymbol[trade.symbol] ?? [];
          if (existing.some((t) => t.id === trade.id)) {
            return { lastSequenceNumber: nextSeq };
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

      case 'futures.candle.updated': {
        const payload = envelope.payload as { symbol: string; candles: Record<Timeframe, Candle> };
        set({ lastSequenceNumber: nextSeq, futuresLiveCandleTick: payload });
        break;
      }

      case 'futures.position.updated': {
        const posPayload = envelope.payload as { playerId?: string } | null;
        const isSelf = Boolean(state.player && posPayload?.playerId === state.player.id);
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

      case 'property.sold':
      case 'property.listed':
      case 'property.updated':
      case 'auction.bid_placed':
      case 'auction.ended': {
        set((s) => ({
          lastSequenceNumber: nextSeq,
          propertySyncSeq: s.propertySyncSeq + 1,
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
