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
        if (typeof symbol !== 'string' || symbol.length > 16) return;
        // Leave previous market rooms so client only receives subscribed market book/candles
        for (const room of socket.rooms) {
          if (room.startsWith('market:')) {
            socket.leave(room);
          }
        }
        socket.join(`market:${symbol}`);
        // Immediately send authoritative order book snapshot for subscribed symbol
        try {
          const book = this.world.matching.getOrderBook(symbol);
          socket.emit('world:event', {
            eventId: `sync_book_${Date.now()}`,
            eventType: 'market.orderbook.updated',
            worldId: this.world.worldId,
            sequenceNumber: this.world.eventBus.getSequenceNumber(),
            serverTimestamp: new Date().toISOString(),
            payload: book,
          } satisfies RealtimeEnvelope);
        } catch {
          // Invalid symbol ignored safely
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
      });

      socket.on('disconnect', () => {
        const prevPlayer = this.socketPlayerMap.get(socket.id);
        this.socketPlayerMap.delete(socket.id);
        this.syncPresence();
        if (prevPlayer) {
          this.world.eventBus.publish('player.left', {
            playerId: prevPlayer,
            onlineHumanPlayers: this.getOnlinePlayerIds().length,
          });
        }
      });
    });
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
    } else {
      this.socketPlayerMap.delete(socket.id);
    }

    this.syncPresence();
    this.world.eventBus.publish('world.status', {
      gameClock: this.world.economy.getGameClock(),
      economy: this.world.economy.state,
      onlineHumanPlayers: this.getOnlinePlayerIds().length,
      simulatedAgentsCount: 4,
    });
  }

  private syncPresence(): void {
    const activeConnections = this.io.engine.clientsCount;
    const onlinePlayerIds = this.getOnlinePlayerIds();
    this.world.setRealtimePresence(activeConnections, onlinePlayerIds);
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
