import test from 'node:test';
import assert from 'node:assert/strict';
import type { FuturesOrder } from '../../shared/contracts/futures';
import type { Order } from '../../shared/contracts/types';
import {
  buildFuturesPreviewContextKey,
  formatFuturesOrderFeedback,
  formatSpotOrderFeedback,
  isPreviewResponseCurrent,
  sanitizeLeverageChoice,
} from './tradeExecutionFeedback';

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: 'ord_1',
    worldId: 'WORLD-01',
    playerId: 'p1',
    playerName: 'Alice',
    symbol: 'BTC-SIM',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    priceMinor: 0,
    quantity: 10,
    filledQuantity: 10,
    remainingQuantity: 0,
    avgExecutionPriceMinor: 50000_00,
    lockedFundsMinor: 0,
    lockedAssetQty: 0,
    feesPaidMinor: 500_00,
    status: 'FILLED',
    createdSeq: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFuturesOrder(overrides: Partial<FuturesOrder>): FuturesOrder {
  return {
    id: 'ford_1',
    worldId: 'WORLD-01',
    playerId: 'p1',
    playerName: 'Alice',
    symbol: 'BTC-SIM/CR-PERP',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    marginMode: 'ISOLATED',
    leverage: 10,
    priceInt: 0,
    triggerPriceInt: null,
    triggerSource: null,
    triggerDirection: null,
    quantity: 2,
    qtyInt: 2000,
    filledQuantity: 2,
    filledQtyInt: 2000,
    remainingQuantity: 0,
    remainingQtyInt: 0,
    avgExecutionPriceInt: 50000_00,
    lockedMarginMinor: 0,
    lockedFeeReserveMinor: 0,
    feesPaidMinor: 100_00,
    realizedPnlMinor: 0,
    attachedStopLossInt: null,
    attachedTakeProfitInt: null,
    parentOrderId: null,
    reduceOnly: false,
    postOnly: false,
    isLiquidationOrder: false,
    status: 'FILLED',
    rejectReason: null,
    version: 1,
    createdSeq: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('formatSpotOrderFeedback accurately distinguishes FILLED, IOC partial, 0-fill cancelled, and GTC resting', () => {
  const filled = formatSpotOrderFeedback({ order: makeOrder({ status: 'FILLED' }), trades: [] });
  assert.equal(filled.tone, 'success');
  assert.equal(filled.isFillSuccess, true);

  // Market IOC partial fill (cancelled remainder) must NEVER say remaining is in Open Orders
  const iocPartial = formatSpotOrderFeedback({
    order: makeOrder({
      type: 'MARKET',
      timeInForce: 'IOC',
      status: 'CANCELLED',
      quantity: 10,
      filledQuantity: 4,
      remainingQuantity: 0,
    }),
    trades: [],
  });
  assert.equal(iocPartial.tone, 'warning');
  assert.ok(iocPartial.description.includes('hủy'));
  assert.equal(iocPartial.description.includes('Lệnh đang mở'), false);

  // Zero-fill IOC must NOT claim filled or open
  const zeroFill = formatSpotOrderFeedback({
    order: makeOrder({
      type: 'MARKET',
      timeInForce: 'IOC',
      status: 'CANCELLED',
      quantity: 10,
      filledQuantity: 0,
      remainingQuantity: 0,
    }),
    trades: [],
  });
  assert.equal(zeroFill.isFillSuccess, false);
  assert.ok(zeroFill.title.includes('không khớp'));

  // GTC partial fill accurately mentions remaining in Open Orders
  const gtcPartial = formatSpotOrderFeedback({
    order: makeOrder({
      type: 'LIMIT',
      timeInForce: 'GTC',
      status: 'PARTIALLY_FILLED',
      priceMinor: 50000_00,
      quantity: 10,
      filledQuantity: 4,
      remainingQuantity: 6,
    }),
    trades: [],
  });
  assert.ok(gtcPartial.description.includes('Lệnh đang mở'));
});

test('formatFuturesOrderFeedback never says opened position when 0 filled or cancelled', () => {
  const zeroFill = formatFuturesOrderFeedback({
    order: makeFuturesOrder({ status: 'CANCELLED', filledQuantity: 0, remainingQuantity: 0 }),
    trades: [],
    side: 'BUY',
    leverage: 10,
    priceScale: 100,
    priceDecimals: 2,
  });
  assert.equal(zeroFill.isFillSuccess, false);
  assert.equal(zeroFill.title.includes('Đã mở vị thế'), false);
  assert.ok(zeroFill.description.includes('Chưa có vị thế'));

  const filled = formatFuturesOrderFeedback({
    order: makeFuturesOrder({ status: 'FILLED', filledQuantity: 2 }),
    trades: [],
    side: 'BUY',
    leverage: 20,
    priceScale: 100,
    priceDecimals: 2,
  });
  assert.equal(filled.tone, 'success');
  assert.ok(filled.title.includes('Đã mở vị thế LONG'));
});

test('preview context key and staleness guard reject out-of-order responses across leverage/margin/symbol/world changes', () => {
  const keyOld = buildFuturesPreviewContextKey({
    worldId: 'WORLD-01',
    playerId: 'p1',
    symbol: 'BTC-SIM/CR-PERP',
    side: 'BUY',
    leverage: 2,
    marginInput: '500',
  });
  const keyNew = buildFuturesPreviewContextKey({
    worldId: 'WORLD-01',
    playerId: 'p1',
    symbol: 'BTC-SIM/CR-PERP',
    side: 'BUY',
    leverage: 20,
    marginInput: '1000',
  });
  assert.notEqual(keyOld, keyNew);
  assert.equal(
    isPreviewResponseCurrent({ requestSeq: 1, latestSeq: 2, requestContextKey: keyOld, currentContextKey: keyNew }),
    false,
  );
  assert.equal(
    isPreviewResponseCurrent({ requestSeq: 2, latestSeq: 2, requestContextKey: keyNew, currentContextKey: keyNew }),
    true,
  );
});

test('sanitizeLeverageChoice enforces identical contract caps and rejects NaN/Infinity/negative', () => {
  const allowed = [1, 2, 3, 5, 10, 20, 25, 50];
  assert.equal(sanitizeLeverageChoice(25, allowed), 25);
  assert.equal(sanitizeLeverageChoice(50, allowed), 50);
  assert.equal(sanitizeLeverageChoice(125, allowed), 50);
  assert.equal(sanitizeLeverageChoice(Number.NaN, allowed), 1);
  assert.equal(sanitizeLeverageChoice(Number.POSITIVE_INFINITY, allowed), 1);
  assert.equal(sanitizeLeverageChoice(-5, allowed), 1);
});
