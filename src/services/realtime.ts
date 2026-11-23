import { io, type Socket } from 'socket.io-client';
import type { RealtimeEnvelope } from '../../shared/contracts/types';
import { useAppStore } from '../store/useAppStore';
import { WorldService } from './api';

/**
 * Authoritative Socket.IO Realtime Client with automatic reconnect,
 * room-scoped market subscription, sequence gap detection, and HTTP snapshot fallback.
 */
class RealtimeClient {
  private socket: Socket | null = null;
  private subscribedSymbol: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  connect(token: string | null): void {
    const store = useAppStore.getState();

    if (this.socket) {
      if (token) {
        this.socket.auth = { token };
        this.socket.emit('auth:identify', token);
      }
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    store.setConnectionState('connecting');

    this.socket = io(window.location.origin, {
      path: '/socket.io',
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.stopPollingFallback();
      const s = useAppStore.getState();
      s.setConnectionState('connected');
      if (s.token) {
        this.socket?.emit('auth:identify', s.token);
      }
      // Request fresh authoritative snapshot on connect / reconnect
      this.socket?.emit('world:request_snapshot');
      if (this.subscribedSymbol) {
        this.socket?.emit('market:subscribe', this.subscribedSymbol);
      }
    });

    this.socket.on('disconnect', () => {
      useAppStore.getState().setConnectionState('reconnecting');
      this.startPollingFallback();
    });

    this.socket.on('connect_error', () => {
      useAppStore.getState().setConnectionState('polling');
      this.startPollingFallback();
    });

    this.socket.on('world:event', (envelope: RealtimeEnvelope) => {
      const gap = useAppStore.getState().applyRealtimeEnvelope(envelope);
      if (gap) {
        this.requestSnapshot();
      }
    });
  }

  identify(token: string): void {
    if (this.socket) {
      this.socket.auth = { token };
      if (this.socket.connected) {
        this.socket.emit('auth:identify', token);
      }
    } else {
      this.connect(token);
    }
  }

  subscribeMarket(symbol: string): void {
    this.subscribedSymbol = symbol;
    if (this.socket?.connected) {
      this.socket.emit('market:subscribe', symbol);
    }
  }

  requestSnapshot(): void {
    if (this.socket?.connected) {
      this.socket.emit('world:request_snapshot');
    } else {
      WorldService.getSnapshot()
        .then((snap) => useAppStore.getState().applyWorldSnapshot(snap))
        .catch(() => {});
    }
  }

  forceReconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    } else {
      this.connect(useAppStore.getState().token);
    }
  }

  disconnect(): void {
    this.stopPollingFallback();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private startPollingFallback(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      WorldService.getSnapshot()
        .then((snap) => useAppStore.getState().applyWorldSnapshot(snap))
        .catch(() => {});
    }, 5_000);
  }

  private stopPollingFallback(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();
