import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { IRealtimeTransport } from '../../shared/contracts/interfaces';
import type { RealtimeEnvelope } from '../../shared/contracts/types';
import { WorldEngine } from '../engine/WorldEngine';

/**
 * Authoritative Socket.IO Realtime Gateway.
 * Tracks strictly genuine connected clients and online human players (zero fake counters).
 * Supports per-market room subscriptions (`market:<SYMBOL>`) and per-player private rooms (`player:<ID>`).
 */
export class SocketGateway implements IRealtimeTransport {
  private readonly io: SocketIOServer;
  private readonly world: WorldEngine;
  private socketPlayerMap = new Map<string, string>();

  constructor(httpServer: HttpServer, world: WorldEngine) {
    this.world = world;
    this.io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.bindWorldEvents();
    this.bindSocketHandlers();
  }

  private bindWorldEvents(): void {
    this.world.eventBus.subscribe((envelope, room) => {
      this.broadcast(envelope, room);
    });
  }

  private bindSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const token =
        (typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined) ||
        (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : undefined);

      this.attachSession(socket, token);

      socket.on('auth:identify', (newToken: string) => {
        this.attachSession(socket, newToken);
      });

      socket.on('market:subscribe', (symbol: string) => {
        if (typeof symbol !== 'string' || symbol.length > 24) return;
        const normalized = symbol.toUpperCase();
        // Leave previous market rooms so client only receives subscribed market book/candles
        for (const room of socket.rooms) {
          if (room.startsWith('market:')) {
            socket.leave(room);
          }
        }
        socket.join(`market:${normalized}`);
        this.syncWatchedSymbols();
        // Immediately send authoritative order book snapshot for subscribed symbol
        try {
          const book = this.world.matching.getOrderBook(normalized);
          socket.emit('world:event', {
            eventId: `sync_book_${Date.now()}`,
            eventType: 'market.orderbook.updated',
            worldId: this.world.worldId,
            marketId: normalized,
            sequenceNumber: this.world.eventBus.getSequenceNumber(),
            serverTimestamp: new Date().toISOString(),
            payload: book,
          } satisfies RealtimeEnvelope);
        } catch {
          // Invalid symbol ignored safely
        }
      });

      socket.on('market:unsubscribe', (symbol?: string) => {
        if (typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 24) {
          socket.leave(`market:${symbol.toUpperCase()}`);
        } else {
          for (const room of socket.rooms) {
            if (room.startsWith('market:')) {
              socket.leave(room);
            }
          }
        }
        this.syncWatchedSymbols();
      });

      socket.on('futures:subscribe', (symbol: string) => {
        if (typeof symbol !== 'string' || symbol.length > 24) return;
        const normalized = symbol.toUpperCase();
        for (const room of socket.rooms) {
          if (room.startsWith('futures:')) {
            socket.leave(room);
          }
        }
        socket.join(`futures:${normalized}`);
        this.syncWatchedSymbols();
        try {
          const book = this.world.futures.getOrderBook(normalized);
          socket.emit('world:event', {
            eventId: `sync_fbook_${Date.now()}`,
            eventType: 'futures.orderbook.updated',
            worldId: this.world.worldId,
            marketId: normalized,
            sequenceNumber: this.world.eventBus.getSequenceNumber(),
            serverTimestamp: new Date().toISOString(),
            payload: book,
          } satisfies RealtimeEnvelope);
        } catch {
          // Invalid futures symbol ignored safely
        }
      });

      socket.on('futures:unsubscribe', (symbol?: string) => {
        if (typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 24) {
          socket.leave(`futures:${symbol.toUpperCase()}`);
        } else {
          for (const room of socket.rooms) {
            if (room.startsWith('futures:')) {
              socket.leave(room);
            }
          }
        }
        this.syncWatchedSymbols();
      });

      socket.on('futures:resync', (symbol?: string) => {
        const playerId = this.socketPlayerMap.get(socket.id) ?? null;
        if (typeof symbol === 'string' && symbol.length <= 24) {
          const normalized = symbol.toUpperCase();
          try {
            const book = this.world.futures.getOrderBook(normalized);
            socket.emit('world:event', {
              eventId: `resync_fbook_${Date.now()}`,
              eventType: 'futures.orderbook.updated',
              worldId: this.world.worldId,
              marketId: normalized,
              sequenceNumber: this.world.eventBus.getSequenceNumber(),
              serverTimestamp: new Date().toISOString(),
              payload: book,
            } satisfies RealtimeEnvelope);
          } catch {
            // Invalid symbol ignored safely
          }
        }
        if (playerId) {
          this.emitPlayerOrdersSync(socket, playerId);
          this.emitPlayerFuturesSync(socket, playerId);
        }
      });

      socket.on('orders:resync', () => {
        const playerId = this.socketPlayerMap.get(socket.id) ?? null;
        if (playerId) {
          this.emitPlayerOrdersSync(socket, playerId);
        }
      });

      socket.on('connect:resync', () => {
        const playerId = this.socketPlayerMap.get(socket.id) ?? null;
        if (playerId) {
          try {
            socket.emit('world:event', {
              eventId: `sync_conn_${Date.now()}`,
              eventType: 'notification.created',
              worldId: this.world.worldId,
              sequenceNumber: this.world.eventBus.getSequenceNumber(),
              serverTimestamp: new Date().toISOString(),
              payload: { resync: true, playerId },
            } satisfies RealtimeEnvelope);
          } catch {
            // Safe ignore if player not bootstrapped
          }
        }
      });

      socket.on('world:request_snapshot', () => {
        const playerId = this.socketPlayerMap.get(socket.id) ?? null;
        socket.emit('world:event', {
          eventId: `sync_snap_${Date.now()}`,
          eventType: 'world.snapshot',
          worldId: this.world.worldId,
          sequenceNumber: this.world.eventBus.getSequenceNumber(),
          serverTimestamp: new Date().toISOString(),
          payload: this.world.getWorldSnapshot(playerId),
        } satisfies RealtimeEnvelope);
        if (playerId) {
          this.emitPlayerOrdersSync(socket, playerId);
          this.emitPlayerFuturesSync(socket, playerId);
        }
      });

      socket.on('disconnect', () => {
        const prevPlayer = this.socketPlayerMap.get(socket.id);
        this.socketPlayerMap.delete(socket.id);
        this.syncPresence();
        this.syncWatchedSymbols();
        if (prevPlayer) {
          this.world.eventBus.publish('player.left', {
            playerId: prevPlayer,
            onlineHumanPlayers: this.getOnlinePlayerIds().length,
          });
        }
      });
    });
  }

  private emitPlayerOrdersSync(socket: Socket, playerId: string): void {
    try {
      const orders = this.world.matching.listPlayerOrders(playerId);
      socket.emit('world:event', {
        eventId: `sync_ord_${Date.now()}`,
        eventType: 'orders.synced',
        worldId: this.world.worldId,
        sequenceNumber: this.world.eventBus.getSequenceNumber(),
        serverTimestamp: new Date().toISOString(),
        payload: { playerId, orders },
      } satisfies RealtimeEnvelope);
    } catch {
      // Player not initialized yet
    }
  }

  private emitPlayerFuturesSync(socket: Socket, playerId: string): void {
    try {
      const account = this.world.getFuturesAccount(playerId);
      const seq = this.world.eventBus.getSequenceNumber();
      const nowIso = new Date().toISOString();
      socket.emit('world:event', {
        eventId: `sync_facc_${Date.now()}`,
        eventType: 'futures.account.synced',
        worldId: this.world.worldId,
        sequenceNumber: seq,
        serverTimestamp: nowIso,
        payload: { playerId, account },
      } satisfies RealtimeEnvelope);
      for (const pos of account.positions) {
        socket.emit('world:event', {
          eventId: `resync_fpos_${Date.now()}_${pos.symbol}`,
          eventType: 'futures.position.updated',
          worldId: this.world.worldId,
          marketId: pos.symbol,
          sequenceNumber: seq,
          serverTimestamp: nowIso,
          payload: { playerId, symbol: pos.symbol, position: pos },
        } satisfies RealtimeEnvelope);
      }
    } catch {
      // Player not initialized yet
    }
  }

  private attachSession(socket: Socket, token: string | undefined): void {
    const prevPlayer = this.socketPlayerMap.get(socket.id);
    if (prevPlayer) {
      socket.leave(`player:${prevPlayer}`);
    }

    const session = this.world.auth.verifyToken(token);
    if (session) {
      this.socketPlayerMap.set(socket.id, session.playerId);
      socket.join(`player:${session.playerId}`);
      this.emitPlayerOrdersSync(socket, session.playerId);
      this.emitPlayerFuturesSync(socket, session.playerId);
    } else {
      this.socketPlayerMap.delete(socket.id);
    }

    this.syncPresence();
    this.world.eventBus.publish('world.status', {
      gameClock: this.world.economy.getGameClock(),
      economy: this.world.economy.state,
      onlineHumanPlayers: this.getOnlinePlayerIds().length,
      simulatedAgentsCount: this.world.getDiagnostics().simulatedAgentsCount,
    });
  }

  private syncPresence(): void {
    const activeConnections = this.io.engine.clientsCount;
    const onlinePlayerIds = this.getOnlinePlayerIds();
    this.world.setRealtimePresence(activeConnections, onlinePlayerIds);
  }

  private syncWatchedSymbols(): void {
    const spotSymbols: string[] = [];
    const futuresSymbols: string[] = [];
    const rooms = this.io.sockets.adapter.rooms;
    for (const [roomName, sockets] of rooms.entries()) {
      if (sockets.size === 0) continue;
      if (roomName.startsWith('market:')) {
        spotSymbols.push(roomName.slice('market:'.length));
      } else if (roomName.startsWith('futures:')) {
        futuresSymbols.push(roomName.slice('futures:'.length));
      }
    }
    this.world.setActiveWatchedSymbols(spotSymbols, futuresSymbols);
  }

  public broadcast<T>(envelope: RealtimeEnvelope<T>, room?: string): void {
    if (room) {
      this.io.to(room).emit('world:event', envelope);
    } else {
      this.io.emit('world:event', envelope);
    }
  }

  public getActiveConnectionCount(): number {
    return this.io.engine.clientsCount;
  }

  public getOnlinePlayerIds(): string[] {
    return Array.from(new Set(this.socketPlayerMap.values()));
  }
}
