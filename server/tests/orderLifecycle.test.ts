import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { io as socketClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  applyFuturesOrderEventToAccount,
  applyFuturesPositionEventToAccount,
  applyOrderEventToList,
  calcOrderFillProgressPct,
  filterOpenFuturesOrders,
  filterOpenOrders,
  isFuturesOrderOpen,
  isOrderOpen,
  reconcileOrdersWithServer,
  sanitizeFuturesAccount,
} from '../../shared/contracts/orderLifecycle';
import { toMinor, fromMinor } from '../../shared/contracts/money';
import { fromPriceInt, type FuturesContract } from '../../shared/contracts/futures';
import type { Asset, Order, RealtimeEnvelope } from '../../shared/contracts/types';
import { createApiRouter } from '../api/routes';
import { WorldEngine } from '../engine/WorldEngine';
import { SocketGateway } from '../realtime/SocketGateway';

const BTC_PERP = 'BTC-SIM/CR-PERP';
const ETH_PERP = 'ETH-SIM/CR-PERP';

interface CapturedEvent {
  envelope: RealtimeEnvelope;
  room?: string;
}

function createWorldWithEventCapture() {
  const world = new WorldEngine({
    worldId: 'ORDER-LIFECYCLE-TEST',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
  const events: CapturedEvent[] = [];
  world.eventBus.subscribe((envelope, room) => {
    events.push({ envelope, room });
  });
  return { world, events };
}

function createLiveServerFixture() {
  const world = new WorldEngine({
    worldId: 'ORDER-LIFECYCLE-LIVE',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(world));
  const httpServer = http.createServer(app);
  const gateway = new SocketGateway(httpServer, world);
  return { world, app, httpServer, gateway };
}

function snapSpotPriceCR(asset: Asset, rawPriceMinor: number): number {
  const scale = asset.priceScale ?? 100;
  const snapped = Math.max(
    asset.priceTickMinor,
    Math.round(rawPriceMinor / asset.priceTickMinor) * asset.priceTickMinor,
  );
  return Number((snapped / scale).toFixed(asset.priceDecimals ?? 2));
}

function snapFuturesPriceCR(contract: FuturesContract, rawPriceInt: number): number {
  const snapped = Math.max(
    contract.priceTickInt,
    Math.round(rawPriceInt / contract.priceTickInt) * contract.priceTickInt,
  );
  return Number(fromPriceInt(snapped, contract.priceScale).toFixed(contract.priceDecimals));
}

async function startServer(httpServer: http.Server): Promise<string> {
  return new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        resolve(`http://127.0.0.1:${addr.port}`);
      } else {
        throw new Error('Failed to bind ephemeral port');
      }
    });
  });
}

async function waitForSocketEvent(
  socket: ClientSocket,
  predicate: (env: RealtimeEnvelope) => boolean,
  timeoutMs = 3000,
): Promise<RealtimeEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('world:event', handler);
      reject(new Error('Timed out waiting for realtime event'));
    }, timeoutMs);

    const handler = (env: RealtimeEnvelope) => {
      if (predicate(env)) {
        clearTimeout(timer);
        socket.off('world:event', handler);
        resolve(env);
      }
    };
    socket.on('world:event', handler);
  });
}

test('TEST 01: Market Order fills completely and disappears from Open Orders (Stock, Crypto Spot, Forex)', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T01');

  // 1) Stock Market BUY (NOVA)
  const stockRes = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 5,
    idempotencyKey: 't01_stock_buy',
  });
  assert.equal(stockRes.order.status, 'FILLED');
  assert.equal(stockRes.order.filledQuantity, 5);
  assert.equal(stockRes.order.remainingQuantity, 0);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);
  assert.equal(
    world.matching.listPlayerOrders(player.id).some((o) => o.id === stockRes.order.id && o.status === 'FILLED'),
    true,
  );
  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'order.filled' &&
        (e.envelope.payload as Order).id === stockRes.order.id,
    ),
    'Must emit order.filled to player private room',
  );

  // 2) Crypto Spot Market BUY (BTC-SIM)
  const cryptoRes = world.placeOrder(player.id, {
    symbol: 'BTC-SIM',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 0.01,
    idempotencyKey: 't01_crypto_buy',
  });
  assert.equal(cryptoRes.order.status, 'FILLED');
  assert.equal(cryptoRes.order.remainingQuantity, 0);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);

  // 3) Forex Market BUY (USD-SIM/CR)
  const fxRes = world.placeOrder(player.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 100,
    idempotencyKey: 't01_fx_buy',
  });
  assert.equal(fxRes.order.status, 'FILLED');
  assert.equal(fxRes.order.remainingQuantity, 0);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);

  // Frontend filterOpenOrders must also exclude all 3 filled orders
  assert.equal(filterOpenOrders(world.matching.listPlayerOrders(player.id)).length, 0);
  assert.equal(world.matching.listPlayerOrders(player.id).length, 3);
  world.stopBackgroundLoops();
});

test('TEST 02: Limit Order fills completely and disappears immediately after server confirmation', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T02');

  const nova = world.matching.getAsset('NOVA')!;
  const book = world.matching.getOrderBook('NOVA', 5);
  assert.ok(book.bestAskMinor !== null, 'NOVA order book must have asks');
  const aggressivePriceCR = snapSpotPriceCR(nova, Math.round(book.bestAskMinor! * 1.05));

  const res = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: aggressivePriceCR,
    quantity: 5,
    idempotencyKey: 't02_limit_cross',
  });

  assert.equal(res.order.status, 'FILLED');
  assert.equal(res.order.filledQuantity, 5);
  assert.equal(res.order.remainingQuantity, 0);
  assert.equal(isOrderOpen(res.order), false);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);

  const filledEvt = events.find(
    (e) =>
      e.room === `player:${player.id}` &&
      e.envelope.eventType === 'order.filled' &&
      (e.envelope.payload as Order).id === res.order.id,
  );
  assert.ok(filledEvt, 'Crossing Limit Order must emit order.filled');

  const updatedList = applyOrderEventToList([], res.order);
  assert.equal(filterOpenOrders(updatedList).length, 0);
  assert.equal(updatedList.length, 1);
  world.stopBackgroundLoops();
});

test('TEST 03 & TEST 04: Limit Order partially fills (stays open with remaining qty & progress), then remaining fills and disappears automatically', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: alice } = world.loginGuest('Alice_T0304');
  const { profile: bob } = world.loginGuest('Bob_T0304');

  // Give Bob NOVA shares so Bob can sell directly into Alice's resting bid
  world.ledger.grantInitialAsset(bob.id, 'NOVA', 'STOCK', 50, toMinor(50));

  const nova = world.matching.getAsset('NOVA')!;
  const book = world.matching.getOrderBook('NOVA', 5);
  assert.ok(book.bestBidMinor !== null && book.bestAskMinor !== null);
  const restingPriceMinor =
    book.bestAskMinor! - book.bestBidMinor! >= nova.priceTickMinor * 2
      ? book.bestBidMinor! + nova.priceTickMinor
      : book.bestBidMinor!;
  const restingPriceCR = snapSpotPriceCR(nova, restingPriceMinor);

  const aliceBid = world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: restingPriceCR,
    quantity: 20,
    idempotencyKey: 't03_alice_bid',
  });
  assert.equal(aliceBid.order.status, 'OPEN');
  assert.equal(aliceBid.order.remainingQuantity, 20);
  assert.equal(world.matching.listPlayerOpenOrders(alice.id).length, 1);

  let aliceClientOrders: Order[] = [aliceBid.order];

  // TEST 03: Bob sells 8 shares into Alice's resting bid -> partial fill
  const bobSell1 = world.placeOrder(bob.id, {
    symbol: 'NOVA',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'IOC',
    priceCR: restingPriceCR,
    quantity: 8,
    idempotencyKey: 't03_bob_sell_1',
  });
  assert.equal(bobSell1.order.status, 'FILLED');

  const partialEvt = events.find(
    (e) =>
      e.room === `player:${alice.id}` &&
      e.envelope.eventType === 'order.partially_filled' &&
      (e.envelope.payload as Order).id === aliceBid.order.id,
  );
  assert.ok(partialEvt, 'Alice must receive order.partially_filled event');

  const partialOrder = partialEvt!.envelope.payload as Order;
  assert.equal(partialOrder.status, 'PARTIALLY_FILLED');
  assert.equal(partialOrder.filledQuantity, 8);
  assert.equal(partialOrder.remainingQuantity, 12);
  assert.equal(calcOrderFillProgressPct(partialOrder.filledQuantity, partialOrder.quantity), 40);

  aliceClientOrders = applyOrderEventToList(aliceClientOrders, partialOrder);
  const openAfterPartial = filterOpenOrders(aliceClientOrders);
  assert.equal(openAfterPartial.length, 1);
  assert.equal(openAfterPartial[0].remainingQuantity, 12);
  assert.equal(world.matching.listPlayerOpenOrders(alice.id).length, 1);
  assert.equal(world.matching.listPlayerOpenOrders(alice.id)[0].remainingQuantity, 12);

  // TEST 04: Bob sells the remaining 12 shares -> Alice's order fills completely and disappears
  const bobSell2 = world.placeOrder(bob.id, {
    symbol: 'NOVA',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'IOC',
    priceCR: restingPriceCR,
    quantity: 12,
    idempotencyKey: 't04_bob_sell_2',
  });
  assert.equal(bobSell2.order.status, 'FILLED');

  const filledEvt = events.find(
    (e) =>
      e.room === `player:${alice.id}` &&
      e.envelope.eventType === 'order.filled' &&
      (e.envelope.payload as Order).id === aliceBid.order.id,
  );
  assert.ok(filledEvt, 'Alice must receive order.filled when remainder fills');

  const filledOrder = filledEvt!.envelope.payload as Order;
  assert.equal(filledOrder.status, 'FILLED');
  assert.equal(filledOrder.filledQuantity, 20);
  assert.equal(filledOrder.remainingQuantity, 0);
  assert.equal(calcOrderFillProgressPct(filledOrder.filledQuantity, filledOrder.quantity), 100);

  aliceClientOrders = applyOrderEventToList(aliceClientOrders, filledOrder);
  assert.equal(filterOpenOrders(aliceClientOrders).length, 0, 'Filled order must disappear from Open Orders');
  assert.equal(aliceClientOrders.length, 1, 'Filled order must remain in Order History');
  assert.equal(world.matching.listPlayerOpenOrders(alice.id).length, 0);
  assert.equal(world.ledger.requireWallet(alice.id).lockedMinor, 0, 'All locked CR for Alice must be cleared');
  world.stopBackgroundLoops();
});

test('TEST 05: Cancel order succeeds and releases exact locked funds/assets/margin across Spot, Forex, and Futures', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T05');
  world.futures.acknowledgeRisk(player.id);

  const initialAvail = world.ledger.requireWallet(player.id).availableMinor;
  const nova = world.matching.getAsset('NOVA')!;
  const book = world.matching.getOrderBook('NOVA', 5);
  const deepBidCR = snapSpotPriceCR(nova, Math.round(book.bestBidMinor! * 0.85));

  // 1) Spot Limit BUY -> Cancel -> exact CR refunded
  const placed = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: deepBidCR,
    quantity: 10,
    idempotencyKey: 't05_spot_buy',
  });
  assert.equal(placed.order.status, 'OPEN');
  assert.ok(world.ledger.requireWallet(player.id).lockedMinor > 0);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 1);

  const cancelled = world.cancelOrder(player.id, placed.order.id);
  assert.equal(cancelled.order.status, 'CANCELLED');
  assert.equal(cancelled.order.remainingQuantity, 0);
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);
  assert.equal(world.ledger.requireWallet(player.id).lockedMinor, 0);
  assert.equal(world.ledger.requireWallet(player.id).availableMinor, initialAvail);
  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'order.cancelled' &&
        (e.envelope.payload as Order).id === placed.order.id,
    ),
  );

  // 2) Forex Limit BUY on USD-SIM/CR -> Cancel -> exact CR refunded
  const fxAsset = world.matching.getAsset('USD-SIM/CR')!;
  const fxBook = world.matching.getOrderBook('USD-SIM/CR', 5);
  const deepFxRate = snapSpotPriceCR(fxAsset, Math.round(fxBook.bestBidMinor! * 0.94));
  const fxPlaced = world.placeOrder(player.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: deepFxRate,
    quantity: 200,
    idempotencyKey: 't05_fx_buy',
  });
  assert.equal(fxPlaced.order.status, 'OPEN');
  const fxCancelled = world.cancelOrder(player.id, fxPlaced.order.id);
  assert.equal(fxCancelled.order.status, 'CANCELLED');
  assert.equal(fxCancelled.order.remainingQuantity, 0);
  assert.equal(world.ledger.requireWallet(player.id).lockedMinor, 0);
  assert.equal(world.ledger.requireWallet(player.id).availableMinor, initialAvail);

  // 3) Futures Limit BUY -> Cancel -> exact margin + fee reserve refunded
  const fContract = world.futures.getContract(BTC_PERP)!;
  const deepFutPrice = snapFuturesPriceCR(fContract, Math.round(fContract.markPriceInt * 0.92));
  const fPlaced = world.placeFuturesOrder(player.id, {
    symbol: BTC_PERP,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    marginMode: 'ISOLATED',
    leverage: 5,
    priceCR: deepFutPrice,
    quantity: 0.05,
    idempotencyKey: 't05_fut_buy',
  });
  assert.equal(fPlaced.order.status, 'OPEN');
  assert.equal(world.futures.getPlayerAccountSummary(player.id).openOrders.length, 1);

  const fCancelled = world.cancelFuturesOrder(player.id, fPlaced.order.id);
  assert.equal(fCancelled.order.status, 'CANCELLED');
  assert.equal(fCancelled.order.remainingQtyInt, 0);
  assert.equal(world.futures.getPlayerAccountSummary(player.id).openOrders.length, 0);
  assert.equal(world.ledger.requireWallet(player.id).availableMinor, initialAvail);
  world.stopBackgroundLoops();
});

test('TEST 06: Expired orders automatically transition to EXPIRED, unlock funds, and disappear from Open Orders', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T06');
  world.futures.acknowledgeRisk(player.id);

  const initialAvail = world.ledger.requireWallet(player.id).availableMinor;
  const nova = world.matching.getAsset('NOVA')!;
  const book = world.matching.getOrderBook('NOVA', 5);
  const deepBidCR = snapSpotPriceCR(nova, Math.round(book.bestBidMinor! * 0.85));

  // Spot order with 1s TTL
  const spotOrder = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: deepBidCR,
    quantity: 10,
    ttlSeconds: 1,
    idempotencyKey: 't06_spot_exp',
  });
  assert.equal(spotOrder.order.status, 'OPEN');

  // Futures order with 1s TTL
  const fContract = world.futures.getContract(BTC_PERP)!;
  const deepFutPrice = snapFuturesPriceCR(fContract, Math.round(fContract.markPriceInt * 0.92));
  const futOrder = world.placeFuturesOrder(player.id, {
    symbol: BTC_PERP,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    marginMode: 'ISOLATED',
    leverage: 3,
    priceCR: deepFutPrice,
    quantity: 0.02,
    ttlSeconds: 1,
    idempotencyKey: 't06_fut_exp',
  });
  assert.equal(futOrder.order.status, 'OPEN');
  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 1);
  assert.equal(world.futures.listPlayerOpenOrders(player.id).length, 1);

  // Advance clock beyond TTL and expire stale orders
  const expired = world.expireStaleOrders(Date.now() + 5_000);
  assert.equal(expired.expiredSpot.length, 1);
  assert.equal(expired.expiredFutures.length, 1);

  assert.equal(world.matching.listPlayerOpenOrders(player.id).length, 0);
  assert.equal(world.futures.listPlayerOpenOrders(player.id).length, 0);
  assert.equal(world.ledger.requireWallet(player.id).lockedMinor, 0);
  assert.equal(world.ledger.requireWallet(player.id).availableMinor, initialAvail);

  const histSpot = world.matching.listPlayerOrders(player.id).find((o) => o.id === spotOrder.order.id);
  assert.equal(histSpot?.status, 'EXPIRED');
  assert.equal(histSpot?.remainingQuantity, 0);

  const futSummary = world.futures.getPlayerAccountSummary(player.id);
  assert.equal(futSummary.openOrders.length, 0);
  assert.equal(futSummary.orderHistory.find((o) => o.id === futOrder.order.id)?.status, 'EXPIRED');
  assert.equal(futSummary.orderHistory.find((o) => o.id === futOrder.order.id)?.remainingQtyInt, 0);

  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'order.expired' &&
        (e.envelope.payload as Order).id === spotOrder.order.id,
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'futures.order.expired',
    ),
  );
  world.stopBackgroundLoops();
});

test('TEST 07: Futures Long fills and moves cleanly to Open Positions (strict separation from Open Orders)', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T07');
  world.futures.acknowledgeRisk(player.id);

  const res = world.placeFuturesOrder(player.id, {
    symbol: BTC_PERP,
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 5,
    quantity: 0.05,
    idempotencyKey: 't07_long_market',
  });

  const account = world.futures.getPlayerAccountSummary(player.id);
  assert.equal(res.order.status, 'FILLED');
  assert.equal(res.order.remainingQtyInt, 0);
  assert.equal(res.order.remainingQuantity, 0);
  assert.equal(isFuturesOrderOpen(res.order), false);

  // Strict separation: Open Orders empty, Open Positions has 1 LONG, Order History & Trade History preserved
  assert.equal(account.openOrders.length, 0);
  assert.equal(account.positions.length, 1);
  assert.equal(account.positions[0].side, 'LONG');
  assert.equal(account.positions[0].symbol, BTC_PERP);
  assert.ok(account.positions[0].marginMinor > 0);
  assert.ok(account.positions[0].entryPriceInt > 0);
  assert.ok(account.orderHistory.some((o) => o.id === res.order.id && o.status === 'FILLED'));
  assert.ok(account.tradeHistory.length >= 1);

  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'futures.order.filled',
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'futures.position.updated',
    ),
  );
  world.stopBackgroundLoops();
});

test('TEST 08: Futures Short fills and moves cleanly to Open Positions (strict separation from Open Orders)', () => {
  const { world, events } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T08');
  world.futures.acknowledgeRisk(player.id);

  const res = world.placeFuturesOrder(player.id, {
    symbol: ETH_PERP,
    side: 'SELL',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 5,
    quantity: 0.5,
    idempotencyKey: 't08_short_market',
  });

  const account = world.futures.getPlayerAccountSummary(player.id);
  assert.equal(res.order.status, 'FILLED');
  assert.equal(res.order.remainingQtyInt, 0);
  assert.equal(account.openOrders.length, 0);
  assert.equal(account.positions.length, 1);
  assert.equal(account.positions[0].side, 'SHORT');
  assert.equal(account.positions[0].symbol, ETH_PERP);
  assert.ok(account.positions[0].marginMinor > 0);
  assert.ok(account.orderHistory.some((o) => o.id === res.order.id && o.status === 'FILLED'));
  assert.ok(account.tradeHistory.length >= 1);
  assert.ok(
    events.some(
      (e) =>
        e.room === `player:${player.id}` &&
        e.envelope.eventType === 'futures.order.filled',
    ),
  );
  world.stopBackgroundLoops();
});

test('TEST 09: Two players trade with each other over live HTTP + Socket.IO and both UIs update immediately (even across symbols)', async () => {
  const { world, httpServer } = createLiveServerFixture();
  const baseUrl = await startServer(httpServer);

  let aliceSock: ClientSocket | null = null;
  let bobSock: ClientSocket | null = null;

  try {
    const aliceGuest = world.loginGuest('Alice_T09');
    const bobGuest = world.loginGuest('Bob_T09');
    world.ledger.grantInitialAsset(bobGuest.profile.id, 'NOVA', 'STOCK', 50, toMinor(50));

    aliceSock = socketClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: aliceGuest.session.token },
    });
    bobSock = socketClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: bobGuest.session.token },
    });

    await Promise.all([
      new Promise<void>((res) => aliceSock!.once('connect', res)),
      new Promise<void>((res) => bobSock!.once('connect', res)),
    ]);

    // Subscribe Alice to BTC-SIM (a DIFFERENT symbol from NOVA!) to prove private player:<id> room still delivers NOVA fill
    aliceSock.emit('market:subscribe', 'BTC-SIM');
    bobSock.emit('market:subscribe', 'NOVA');
    await new Promise((r) => setTimeout(r, 80));

    const nova = world.matching.getAsset('NOVA')!;
    const book = world.matching.getOrderBook('NOVA', 5);
    const restingPriceMinor =
      book.bestAskMinor! - book.bestBidMinor! >= nova.priceTickMinor * 2
        ? book.bestBidMinor! + nova.priceTickMinor
        : book.bestBidMinor!;
    const restingPriceCR = snapSpotPriceCR(nova, restingPriceMinor);

    // Alice places resting Limit BUY on NOVA via REST
    const aliceOrderResp = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceGuest.session.token}`,
      },
      body: JSON.stringify({
        symbol: 'NOVA',
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        priceCR: restingPriceCR,
        quantity: 6,
        idempotencyKey: 't09_alice_rest',
      }),
    });
    assert.equal(aliceOrderResp.status, 201);
    const aliceOrderJson = (await aliceOrderResp.json()) as { ok: boolean; data: { order: Order } };
    const aliceOrder = aliceOrderJson.data.order;
    assert.equal(aliceOrder.status, 'OPEN');

    let aliceUiOrders: Order[] = [aliceOrder];
    let bobUiOrders: Order[] = [];

    // Prepare listeners for BOTH players BEFORE Bob executes crossing sell
    const aliceFillPromise = waitForSocketEvent(
      aliceSock,
      (env) => env.eventType === 'order.filled' && (env.payload as Order).id === aliceOrder.id,
    );
    const bobFillPromise = waitForSocketEvent(
      bobSock,
      (env) => env.eventType === 'order.filled' && (env.payload as Order).playerId === bobGuest.profile.id,
    );

    // Bob sells 6 NOVA matching Alice's resting order
    const bobOrderResp = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobGuest.session.token}`,
      },
      body: JSON.stringify({
        symbol: 'NOVA',
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'IOC',
        priceCR: restingPriceCR,
        quantity: 6,
        idempotencyKey: 't09_bob_cross',
      }),
    });
    assert.equal(bobOrderResp.status, 201);

    const [aliceFillEvt, bobFillEvt] = await Promise.all([aliceFillPromise, bobFillPromise]);
    aliceUiOrders = applyOrderEventToList(aliceUiOrders, aliceFillEvt.payload as Order);
    bobUiOrders = applyOrderEventToList(bobUiOrders, bobFillEvt.payload as Order);

    // Both players immediately have 0 open orders without F5!
    assert.equal(filterOpenOrders(aliceUiOrders).length, 0);
    assert.equal(filterOpenOrders(bobUiOrders).length, 0);
    assert.equal(aliceUiOrders[0].status, 'FILLED');
    assert.equal(bobUiOrders[0].status, 'FILLED');

    // Verify GET /api/orders/open returns empty for both
    const aliceOpenRes = await fetch(`${baseUrl}/api/orders/open`, {
      headers: { Authorization: `Bearer ${aliceGuest.session.token}` },
    });
    const aliceOpenJson = (await aliceOpenRes.json()) as { ok: boolean; data: Order[] };
    assert.equal(aliceOpenJson.data.length, 0);
  } finally {
    aliceSock?.disconnect();
    bobSock?.disconnect();
    world.stopBackgroundLoops();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test('TEST 10: Reconnect does NOT make filled orders reappear in Open Orders', async () => {
  const { world, httpServer } = createLiveServerFixture();
  const baseUrl = await startServer(httpServer);

  let aliceSock: ClientSocket | null = null;
  try {
    const aliceGuest = world.loginGuest('Alice_T10');
    const bobGuest = world.loginGuest('Bob_T10');
    world.ledger.grantInitialAsset(bobGuest.profile.id, 'NOVA', 'STOCK', 50, toMinor(50));

    aliceSock = socketClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: aliceGuest.session.token },
    });
    await new Promise<void>((res) => aliceSock!.once('connect', res));

    const nova = world.matching.getAsset('NOVA')!;
    const book = world.matching.getOrderBook('NOVA', 5);
    const restingPriceMinor =
      book.bestAskMinor! - book.bestBidMinor! >= nova.priceTickMinor * 2
        ? book.bestBidMinor! + nova.priceTickMinor
        : book.bestBidMinor!;
    const restingPriceCR = snapSpotPriceCR(nova, restingPriceMinor);

    const placed = world.placeOrder(aliceGuest.profile.id, {
      symbol: 'NOVA',
      side: 'BUY',
      type: 'LIMIT',
      timeInForce: 'GTC',
      priceCR: restingPriceCR,
      quantity: 5,
      idempotencyKey: 't10_alice_rest',
    });
    let aliceStaleCache: Order[] = [placed.order];
    assert.equal(filterOpenOrders(aliceStaleCache).length, 1);

    // Alice loses connection
    aliceSock.disconnect();

    // While Alice is disconnected, Bob fills Alice's order
    const bobFill = world.placeOrder(bobGuest.profile.id, {
      symbol: 'NOVA',
      side: 'SELL',
      type: 'LIMIT',
      timeInForce: 'IOC',
      priceCR: restingPriceCR,
      quantity: 5,
      idempotencyKey: 't10_bob_fill_offline',
    });
    assert.equal(bobFill.order.status, 'FILLED');

    // Alice reconnects and executes authoritative server resync (matching realtime.ts reconnect handler)
    aliceSock.connect();
    await new Promise<void>((res) => aliceSock!.once('connect', res));

    const [openResp, allResp] = await Promise.all([
      fetch(`${baseUrl}/api/orders/open`, {
        headers: { Authorization: `Bearer ${aliceGuest.session.token}` },
      }),
      fetch(`${baseUrl}/api/orders`, {
        headers: { Authorization: `Bearer ${aliceGuest.session.token}` },
      }),
    ]);
    const openJson = (await openResp.json()) as { ok: boolean; data: Order[] };
    const allJson = (await allResp.json()) as { ok: boolean; data: Order[] };

    assert.equal(openJson.data.length, 0, '/api/orders/open must be empty after reconnect');
    aliceStaleCache = reconcileOrdersWithServer(aliceStaleCache, allJson.data, { authoritative: true });
    assert.equal(filterOpenOrders(aliceStaleCache).length, 0, 'Filled order must NOT reappear after reconnect');
    assert.equal(aliceStaleCache[0].status, 'FILLED');
    assert.equal(aliceStaleCache[0].remainingQuantity, 0);
  } finally {
    aliceSock?.disconnect();
    world.stopBackgroundLoops();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test('TEST 11: Duplicate events and duplicate idempotencyKey do NOT create duplicate trades or corrupt state', () => {
  const { world } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T11');

  const availBefore = world.ledger.requireWallet(player.id).availableMinor;

  // Duplicate idempotencyKey on server
  const res1 = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 4,
    idempotencyKey: 'dup_key_11',
  });
  const availAfter1 = world.ledger.requireWallet(player.id).availableMinor;
  const tradesAfter1 = world.matching.listTrades('NOVA', 100).length;

  const res2 = world.placeOrder(player.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 4,
    idempotencyKey: 'dup_key_11',
  });
  assert.equal(res2.order.id, res1.order.id);
  assert.equal(world.ledger.requireWallet(player.id).availableMinor, availAfter1);
  assert.ok(availAfter1 < availBefore);
  assert.equal(world.matching.listTrades('NOVA', 100).length, tradesAfter1);

  // Duplicate frontend realtime events applied repeatedly must be strictly idempotent
  let list: Order[] = [];
  list = applyOrderEventToList(list, res1.order);
  list = applyOrderEventToList(list, res1.order);
  list = applyOrderEventToList(list, res1.order);
  assert.equal(list.length, 1);
  assert.equal(filterOpenOrders(list).length, 0);
  world.stopBackgroundLoops();
});

test('TEST 12: Stale order stuck in frontend cache is reconciled accurately from server and cannot revert FILLED -> OPEN', () => {
  const now = new Date().toISOString();
  const staleOpen: Order = {
    id: 'ord_stuck_12',
    worldId: 'W',
    playerId: 'p1',
    playerName: 'Alice',
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceMinor: toMinor(50),
    quantity: 10,
    filledQuantity: 0,
    remainingQuantity: 10,
    avgExecutionPriceMinor: 0,
    status: 'OPEN',
    lockedFundsMinor: toMinor(501),
    lockedAssetQty: 0,
    feesPaidMinor: 0,
    createdSeq: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const serverFilled: Order = {
    ...staleOpen,
    filledQuantity: 10,
    remainingQuantity: 0,
    avgExecutionPriceMinor: toMinor(50),
    status: 'FILLED',
    lockedFundsMinor: 0,
    version: 2,
    updatedAt: new Date(Date.now() + 100).toISOString(),
  };

  // 1) Authoritative server fetch reconciles stuck OPEN order to FILLED and clears Open Orders
  const reconciled = reconcileOrdersWithServer([staleOpen], [serverFilled], { authoritative: true });
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].status, 'FILLED');
  assert.equal(filterOpenOrders(reconciled).length, 0);

  // 2) Delayed out-of-order stale OPEN event arriving AFTER FILLED must NOT revert status back to OPEN
  const afterStaleEvent = applyOrderEventToList(reconciled, staleOpen);
  assert.equal(afterStaleEvent[0].status, 'FILLED');
  assert.equal(afterStaleEvent[0].remainingQuantity, 0);
  assert.equal(filterOpenOrders(afterStaleEvent).length, 0);

  // 3) Malformed cached order with status OPEN but remainingQuantity === 0 must be filtered out
  const zeroRemCorrupt: Order = { ...staleOpen, id: 'ord_corrupt', remainingQuantity: 0, filledQuantity: 10 };
  assert.equal(isOrderOpen(zeroRemCorrupt), false);
  assert.equal(filterOpenOrders([zeroRemCorrupt]).length, 0);
});

test('TEST 13: Untriggered Futures Stop Loss and Take Profit (PENDING_TRIGGER) are NOT erroneously deleted', () => {
  const { world } = createWorldWithEventCapture();
  const { profile: player } = world.loginGuest('Alice_T13');
  world.futures.acknowledgeRisk(player.id);

  const contract = world.futures.getContract(BTC_PERP)!;
  const slCR = snapFuturesPriceCR(contract, Math.round(contract.markPriceInt * 0.95));
  const tpCR = snapFuturesPriceCR(contract, Math.round(contract.markPriceInt * 1.06));

  // Open LONG with attached SL (-5%) and TP (+6%)
  const res = world.placeFuturesOrder(player.id, {
    symbol: BTC_PERP,
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 3,
    quantity: 0.05,
    stopLossCR: slCR,
    takeProfitCR: tpCR,
    idempotencyKey: 't13_long_sltp',
  });

  const account = world.futures.getPlayerAccountSummary(player.id);
  assert.equal(res.order.status, 'FILLED');
  assert.equal(account.positions.length, 1);
  assert.equal(account.positions[0].side, 'LONG');

  // Entry order must be GONE from openOrders, while SL & TP (PENDING_TRIGGER) MUST remain intact!
  const openOrders = account.openOrders;
  assert.equal(openOrders.some((o) => o.id === res.order.id), false, 'Filled entry order must not be in openOrders');
  assert.equal(openOrders.length, 2, 'Both untriggered SL and TP must remain in openOrders');
  assert.ok(openOrders.some((o) => o.type === 'STOP_MARKET' && o.status === 'PENDING_TRIGGER'));
  assert.ok(openOrders.some((o) => o.type === 'TAKE_PROFIT_MARKET' && o.status === 'PENDING_TRIGGER'));

  // Frontend sanitizeFuturesAccount & filterOpenFuturesOrders & applyFuturesOrderEventToAccount must keep SL/TP
  const sanitized = sanitizeFuturesAccount(account);
  assert.equal(sanitized.openOrders.length, 2);
  assert.equal(filterOpenFuturesOrders(sanitized.openOrders).length, 2);

  // Re-applying filled entry order event or position update must not erase untriggered SL/TP
  const afterEntryEvt = applyFuturesOrderEventToAccount(sanitized, res.order);
  assert.equal(afterEntryEvt.openOrders.length, 2);
  const afterPosEvt = applyFuturesPositionEventToAccount(afterEntryEvt, BTC_PERP, account.positions[0]);
  assert.equal(afterPosEvt.openOrders.length, 2);
  world.stopBackgroundLoops();
});

test('TEST 14: Zero balance, margin, or double-entry Ledger errors across full order lifecycle', () => {
  const { world } = createWorldWithEventCapture();
  const { profile: alice } = world.loginGuest('Alice_T14');
  const { profile: bob } = world.loginGuest('Bob_T14');
  world.futures.acknowledgeRisk(alice.id);
  world.ledger.grantInitialAsset(bob.id, 'NOVA', 'STOCK', 100, toMinor(50));

  // Execute mixed Stock, Crypto, Forex, Futures fills, cancels, and expirations
  world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 5,
    idempotencyKey: 't14_1',
  });
  world.placeOrder(alice.id, {
    symbol: 'BTC-SIM',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 0.01,
    idempotencyKey: 't14_2',
  });
  world.placeOrder(alice.id, {
    symbol: 'USD-SIM/CR',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 100,
    idempotencyKey: 't14_3',
  });

  // Resting order that gets cancelled
  const nova = world.matching.getAsset('NOVA')!;
  const book = world.matching.getOrderBook('NOVA', 5);
  const deepBidCR = snapSpotPriceCR(nova, Math.round(book.bestBidMinor! * 0.85));
  const toCancel = world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: deepBidCR,
    quantity: 10,
    idempotencyKey: 't14_4',
  });
  world.cancelOrder(alice.id, toCancel.order.id);

  // Resting order that expires
  world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    priceCR: deepBidCR,
    quantity: 10,
    ttlSeconds: 1,
    idempotencyKey: 't14_5',
  });
  world.expireStaleOrders(Date.now() + 5_000);

  // Futures open & close
  world.placeFuturesOrder(alice.id, {
    symbol: BTC_PERP,
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 3,
    quantity: 0.05,
    idempotencyKey: 't14_6',
  });
  const accOpen = world.futures.getPlayerAccountSummary(alice.id);
  assert.equal(accOpen.positions.length, 1);
  world.closeFuturesPosition(alice.id, accOpen.positions[0].id, {
    type: 'MARKET',
    quantity: 0.05,
    idempotencyKey: 't14_7',
  });

  // Verify exact CR conservation across double-entry Ledger (discrepancyMinor === 0)
  const audit = world.ledger.auditCurrencyConservation('CR');
  assert.equal(
    audit.discrepancyMinor,
    0,
    `CR conservation drift detected: issued=${audit.issuedMinor}, totalWallet=${audit.totalWalletMinor}, feeRev=${audit.feeRevenueMinor}, diff=${audit.discrepancyMinor}`,
  );

  // Verify no negative balances and zero stuck locked balances once all orders & positions are closed
  const aliceWallet = world.ledger.requireWallet(alice.id);
  const bobWallet = world.ledger.requireWallet(bob.id);
  assert.ok(aliceWallet.availableMinor >= 0);
  assert.equal(aliceWallet.lockedMinor, 0, 'Alice must have 0 locked CR after all orders/positions resolved');
  assert.ok(bobWallet.availableMinor >= 0);
  assert.equal(bobWallet.lockedMinor, 0);
  assert.equal(world.matching.listPlayerOpenOrders(alice.id).length, 0);
  assert.equal(world.futures.listPlayerOpenOrders(alice.id).length, 0);
  assert.equal(world.futures.getPlayerAccountSummary(alice.id).positions.length, 0);
  assert.equal(world.futures.getPlayerAccountSummary(alice.id).openOrderMarginMinor, 0);
  assert.equal(world.futures.getPlayerAccountSummary(alice.id).isolatedPositionMarginMinor, 0);
  world.stopBackgroundLoops();
});
