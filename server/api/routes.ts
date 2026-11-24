import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  API_CONTRACT_VERSION,
  ERROR_MESSAGES_VI,
  type ApiFailure,
  type ApiSuccess,
  type ErrorCode,
  type Timeframe,
} from '../../shared/contracts/types';
import {
  BankTransferSchema,
  ChatMessageSchema,
  CompanyActionSchema,
  CreateCompanySchema,
  EntertainmentPlaySchema,
  FuturesAcknowledgeRiskSchema,
  FuturesAddMarginSchema,
  FuturesClosePositionSchema,
  GuestLoginSchema,
  ListPropertySchema,
  LoanRepaySchema,
  LoanRequestSchema,
  PlaceAuctionBidSchema,
  PlaceFuturesOrderSchema,
  PlaceOrderSchema,
  PreviewFuturesOrderSchema,
  PreviewOrderSchema,
} from '../../shared/schemas/validation';
import { z } from 'zod';
import { ALL_CURRENCIES } from '../../shared/contracts/money';
import { DomainError } from '../domain/DomainError';
import { WorldEngine } from '../engine/WorldEngine';

const TriggerCentralBankSchema = z.object({
  currency: z.enum(ALL_CURRENCIES as unknown as [string, ...string[]]).optional(),
});

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = {
    ok: true,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    data,
  };
  res.status(status).json(body);
}

function fail(res: Response, code: ErrorCode, message?: string, status = 400, details?: unknown): void {
  const body: ApiFailure = {
    ok: false,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    error: {
      code,
      message: message || ERROR_MESSAGES_VI[code],
      details,
    },
  };
  res.status(status).json(body);
}

const VALID_TIMEFRAMES = new Set<Timeframe>(['1m', '5m', '15m', '1h', '4h', '1D']);

export function createApiRouter(world: WorldEngine): Router {
  const router = Router();

  const resolvePlayerId = (req: Request): string | null => {
    const authHeader = req.header('authorization');
    const session = world.auth.verifyToken(authHeader);
    return session?.playerId ?? null;
  };

  const requirePlayerId = (req: Request): string => {
    const playerId = resolvePlayerId(req);
    if (!playerId) {
      throw new DomainError('UNAUTHORIZED', undefined, 401);
    }
    return playerId;
  };

  // Health & World Info
  router.get('/health', (_req, res) => {
    ok(res, {
      status: 'HEALTHY',
      worldId: world.worldId,
      isDemoTemporaryServer: true,
      devToolsEnabled: world.devToolsEnabled,
      providers: world.providers.getStatusSummary(),
      uptimeSeconds: world.getDiagnostics().uptimeSeconds,
    });
  });

  router.get('/world', (_req, res) => {
    ok(res, {
      worldId: world.worldId,
      worldName: world.worldName,
      isDemoTemporaryServer: true,
      gameClock: world.economy.getGameClock(),
      economy: world.economy.state,
      onlineHumanPlayers: world.getOnlineHumanPlayersCount(),
    });
  });

  router.get('/world/snapshot', (req, res) => {
    const playerId = resolvePlayerId(req);
    ok(res, world.getWorldSnapshot(playerId));
  });

  // Guest Authentication (Demo Session)
  router.post('/auth/guest', (req, res, next) => {
    try {
      const parsed = GuestLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400, parsed.error.flatten());
      }
      const { session, profile } = world.loginGuest(parsed.data.username, parsed.data.preset);
      ok(res, { token: session.token, isDemoGuest: true, profile }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    const authHeader = req.header('authorization');
    if (authHeader) world.auth.revokeToken(authHeader);
    ok(res, { loggedOut: true });
  });

  // Markets & Exchange Data
  router.get('/markets', (req, res) => {
    const marketClass = typeof req.query.class === 'string' ? req.query.class.toUpperCase() : undefined;
    let assets = world.matching.listAssets();
    if (marketClass === 'CRYPTO' || marketClass === 'STOCK' || marketClass === 'FOREX') {
      assets = assets.filter((a) => a.marketClass === marketClass);
    }
    ok(res, assets);
  });

  // Empire Forex Exchange (EFX) Macro, Central Banks, Calendar, Currency Strength & AI FX Agents
  router.get('/forex/overview', (_req, res) => {
    ok(res, world.getForexOverview());
  });

  router.post('/forex/dev/trigger-policy', (req, res, next) => {
    try {
      if (!world.devToolsEnabled) throw new DomainError('FORBIDDEN_IN_PRODUCTION', undefined, 403);
      const parsed = TriggerCentralBankSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', 'Mã tiền tệ không hợp lệ.', 400);
      }
      const currency = parsed.data.currency as (typeof ALL_CURRENCIES)[number] | undefined;
      ok(res, world.triggerCentralBankEvent(currency));
    } catch (err) {
      next(err);
    }
  });

  // Empire Futures Exchange (Perpetual Futures — Isolated Margin, CR-Settled)
  router.get('/futures/overview', (_req, res) => {
    ok(res, world.getFuturesOverview());
  });

  router.get('/futures/contracts/:symbol/orderbook', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const depth = Math.min(30, Math.max(5, Number(req.query.depth) || 15));
      ok(res, world.futures.getOrderBook(symbol, depth));
    } catch (err) {
      next(err);
    }
  });

  router.get('/futures/contracts/:symbol/trades', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      if (!world.futures.getContract(symbol)) throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 40));
      ok(res, world.futures.listTrades(symbol, limit));
    } catch (err) {
      next(err);
    }
  });

  router.get('/futures/contracts/:symbol/candles', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      if (!world.futures.getContract(symbol)) throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
      const tfRaw = typeof req.query.timeframe === 'string' ? req.query.timeframe : '5m';
      const timeframe: Timeframe = VALID_TIMEFRAMES.has(tfRaw as Timeframe) ? (tfRaw as Timeframe) : '5m';
      const limit = Math.min(240, Math.max(20, Number(req.query.limit) || 100));
      ok(res, {
        symbol,
        timeframe,
        candles: world.futures.candles.getCandles(symbol, timeframe, limit),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/futures/account', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.getFuturesAccount(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/acknowledge-risk', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FuturesAcknowledgeRiskSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', 'Bạn cần xác nhận đã đọc và hiểu rõ cảnh báo rủi ro đòn bẩy.', 400);
      }
      const ack = world.acknowledgeFuturesRisk(playerId);
      ok(res, { ...ack, account: world.getFuturesAccount(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/preview', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PreviewFuturesOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400, parsed.error.flatten());
      }
      const preview = world.futures.previewOrder({
        playerId,
        symbol: parsed.data.symbol.toUpperCase(),
        side: parsed.data.side,
        type: parsed.data.type,
        leverage: parsed.data.leverage,
        marginCR: parsed.data.marginCR,
        quantity: parsed.data.quantity,
        priceCR: parsed.data.priceCR,
        maxSlippageBps: parsed.data.maxSlippageBps,
      });
      ok(res, preview);
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/orders', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PlaceFuturesOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400, parsed.error.flatten());
      }
      const headerIdem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const result = world.placeFuturesOrder(playerId, {
        symbol: parsed.data.symbol.toUpperCase(),
        side: parsed.data.side,
        type: parsed.data.type,
        timeInForce: parsed.data.timeInForce,
        marginMode: parsed.data.marginMode,
        leverage: parsed.data.leverage,
        priceCR: parsed.data.priceCR,
        triggerPriceCR: parsed.data.triggerPriceCR,
        triggerSource: parsed.data.triggerSource,
        quantity: parsed.data.quantity,
        reduceOnly: parsed.data.reduceOnly,
        postOnly: parsed.data.postOnly,
        stopLossCR: parsed.data.stopLossCR,
        takeProfitCR: parsed.data.takeProfitCR,
        maxSlippageBps: parsed.data.maxSlippageBps,
        expiresAt: parsed.data.expiresAt,
        ttlSeconds: parsed.data.ttlSeconds,
        idempotencyKey: headerIdem,
      });
      ok(
        res,
        {
          ...result,
          account: world.getFuturesAccount(playerId),
          profile: world.getPlayerProfile(playerId),
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  });

  router.get('/futures/orders/open', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : undefined;
      ok(res, world.futures.listPlayerOpenOrders(playerId, symbol));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/futures/orders/:id', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const result = world.cancelFuturesOrder(playerId, req.params.id);
      ok(res, {
        ...result,
        account: world.getFuturesAccount(playerId),
        profile: world.getPlayerProfile(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/positions/:id/margin', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FuturesAddMarginSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const position = world.addFuturesPositionMargin(playerId, req.params.id, parsed.data.amountCR);
      ok(res, {
        position,
        account: world.getFuturesAccount(playerId),
        profile: world.getPlayerProfile(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/positions/:id/close', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FuturesClosePositionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const headerIdem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const result = world.closeFuturesPosition(playerId, req.params.id, {
        ...parsed.data,
        idempotencyKey: headerIdem,
      });
      ok(res, {
        ...result,
        account: world.getFuturesAccount(playerId),
        profile: world.getPlayerProfile(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/dev/settle-funding', (req, res, next) => {
    try {
      if (!world.devToolsEnabled) throw new DomainError('FORBIDDEN_IN_PRODUCTION', undefined, 403);
      const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.toUpperCase() : undefined;
      ok(res, world.devSettleFuturesFunding(symbol));
    } catch (err) {
      next(err);
    }
  });

  router.post('/futures/dev/simulate-tick', (req, res, next) => {
    try {
      if (!world.devToolsEnabled) throw new DomainError('FORBIDDEN_IN_PRODUCTION', undefined, 403);
      const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.toUpperCase() : undefined;
      ok(res, world.devSimulateFuturesTick(symbol));
    } catch (err) {
      next(err);
    }
  });

  router.get('/markets/:symbol', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const asset = world.matching.getAsset(symbol);
      if (!asset) throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
      ok(res, asset);
    } catch (err) {
      next(err);
    }
  });

  router.get('/markets/:symbol/orderbook', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const depth = Math.min(30, Math.max(5, Number(req.query.depth) || 15));
      ok(res, world.matching.getOrderBook(symbol, depth));
    } catch (err) {
      next(err);
    }
  });

  router.get('/markets/:symbol/trades', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      if (!world.matching.getAsset(symbol)) throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 40));
      ok(res, world.matching.listTrades(symbol, limit));
    } catch (err) {
      next(err);
    }
  });

  router.get('/markets/:symbol/candles', (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      if (!world.matching.getAsset(symbol)) throw new DomainError('ASSET_NOT_FOUND', undefined, 404);
      const tfRaw = typeof req.query.timeframe === 'string' ? req.query.timeframe : '5m';
      const timeframe: Timeframe = VALID_TIMEFRAMES.has(tfRaw as Timeframe) ? (tfRaw as Timeframe) : '5m';
      const limit = Math.min(240, Math.max(20, Number(req.query.limit) || 100));
      ok(res, {
        symbol,
        timeframe,
        candles: world.candles.getCandles(symbol, timeframe, limit),
      });
    } catch (err) {
      next(err);
    }
  });

  // Orders (Authoritative Matching Engine)
  router.post('/orders/preview', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PreviewOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400, parsed.error.flatten());
      }
      const preview = world.matching.previewOrder({
        playerId,
        symbol: parsed.data.symbol.toUpperCase(),
        side: parsed.data.side,
        type: parsed.data.type,
        priceCR: parsed.data.priceCR,
        quantity: parsed.data.quantity,
        amountQuote: parsed.data.amountQuote,
        maxSlippageBps: parsed.data.maxSlippageBps,
      });
      ok(res, preview);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-account', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const profile = world.resetPracticePlayer(playerId);
      ok(res, { reset: true, profile, account: world.getFuturesAccount(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PlaceOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400, parsed.error.flatten());
      }
      const headerIdem = req.header('idempotency-key') || parsed.data.idempotencyKey;
      const result = world.placeOrder(playerId, {
        symbol: parsed.data.symbol.toUpperCase(),
        side: parsed.data.side,
        type: parsed.data.type,
        timeInForce: parsed.data.timeInForce,
        priceCR: parsed.data.priceCR,
        quantity: parsed.data.quantity,
        maxSlippageBps: parsed.data.maxSlippageBps,
        expiresAt: parsed.data.expiresAt,
        ttlSeconds: parsed.data.ttlSeconds,
        idempotencyKey: headerIdem,
      });
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/open', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : undefined;
      ok(res, world.matching.listPlayerOpenOrders(playerId, symbol));
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : undefined;
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
      if (statusFilter === 'open') {
        ok(res, world.matching.listPlayerOpenOrders(playerId, symbol));
        return;
      }
      ok(res, world.matching.listPlayerOrders(playerId, symbol));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/orders/:id', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const result = world.cancelOrder(playerId, req.params.id);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // Portfolio, Wallet & Double-Entry Ledger
  router.get('/portfolio', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const profile = world.getPlayerProfile(playerId);
      if (!profile) throw new DomainError('UNAUTHORIZED', undefined, 401);
      ok(res, {
        profile,
        recentTrades: world.matching.listPlayerTrades(playerId, 50),
        ownedProperties: world.properties.listProperties().filter((p) => p.ownerId === playerId),
        ownedCompanies: world.business.listCompanies().filter((c) => c.founderId === playerId),
        loans: world.banking.listPlayerLoans(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/wallet', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.ledger.requireWallet(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/ledger', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      ok(res, world.ledger.ledger.listByAccount(playerId, limit, offset));
    } catch (err) {
      next(err);
    }
  });

  // Empire Property Market & Land Auctions
  router.get('/properties', (_req, res) => {
    ok(res, {
      properties: world.properties.listProperties(),
      auctions: world.properties.listAuctions(),
    });
  });

  router.get('/properties/:id', (req, res, next) => {
    try {
      const prop = world.properties.getProperty(req.params.id);
      if (!prop) throw new DomainError('PROPERTY_NOT_FOUND', undefined, 404);
      ok(res, prop);
    } catch (err) {
      next(err);
    }
  });

  router.post('/properties/:id/listings', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ListPropertySchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const prop = world.listProperty(playerId, req.params.id, parsed.data.listingPriceCR);
      ok(res, { property: prop, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/properties/:id/listings', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const prop = world.properties.cancelListing(req.params.id, playerId);
      world.eventBus.publish('property.listed', prop);
      ok(res, { property: prop });
    } catch (err) {
      next(err);
    }
  });

  router.post('/properties/:id/buy', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const result = world.buyProperty(playerId, req.params.id);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/properties/:id/rent', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const prop = world.properties.toggleRent(req.params.id, playerId);
      ok(res, { property: prop });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auctions/:id/bids', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PlaceAuctionBidSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.placeAuctionBid(playerId, req.params.id, parsed.data.bidAmountCR);
      ok(res, { ...result, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // Empire Business Network
  router.get('/companies', (_req, res) => {
    ok(res, world.business.listCompanies());
  });

  router.post('/companies', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const company = world.createCompany(playerId, parsed.data);
      ok(res, { company, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/expand', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const company = world.business.expandCompany(req.params.id, playerId);
      world.eventBus.publish('company.updated', company);
      ok(res, { company, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/dividend', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CompanyActionSchema.safeParse(req.body);
      if (!parsed.success || !parsed.data.amountCR) {
        return fail(res, 'VALIDATION_ERROR', 'Vui lòng nhập số CR cổ tức hợp lệ.', 400);
      }
      const company = world.business.distributeDividend(req.params.id, playerId, parsed.data.amountCR);
      world.eventBus.publish('company.updated', company);
      ok(res, { company, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // Empire Bank
  router.get('/banking', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const profile = world.getPlayerProfile(playerId);
      if (!profile) throw new DomainError('UNAUTHORIZED', undefined, 401);
      ok(res, {
        wallet: profile.wallet,
        loans: world.banking.listPlayerLoans(playerId),
        rates: {
          policyRatePct: world.economy.state.policyInterestRatePct,
          savingsRatePct: world.economy.state.savingsInterestRatePct,
          termDepositRatePct: Number((world.economy.state.savingsInterestRatePct + 1.4).toFixed(2)),
          loanRatePct: world.economy.state.loanInterestRatePct,
        },
        maxLoanRemainingMinor: Math.max(
          0,
          Math.max(2_500_000, Math.floor(profile.netWorthMinor * 0.4)) - profile.totalDebtMinor,
        ),
        economy: world.economy.state,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/banking/savings/deposit', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BankTransferSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      world.banking.depositSavings(playerId, parsed.data.amountCR);
      ok(res, { profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/banking/savings/withdraw', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BankTransferSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      world.banking.withdrawSavings(playerId, parsed.data.amountCR);
      ok(res, { profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/banking/term-deposit', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BankTransferSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const clock = world.economy.getGameClock();
      world.banking.openTermDeposit(playerId, parsed.data.amountCR, clock.gameDay);
      ok(res, { profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/banking/loans', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = LoanRequestSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const profile = world.getPlayerProfile(playerId);
      if (!profile) throw new DomainError('UNAUTHORIZED', undefined, 401);
      const loan = world.banking.applyForLoan({
        playerId,
        principalCR: parsed.data.principalCR,
        termGameDays: parsed.data.termGameDays,
        currentGameDay: world.economy.getGameClock().gameDay,
        borrowerNetWorthMinor: profile.netWorthMinor,
        economy: world.economy.state,
      });
      ok(res, { loan, profile: world.getPlayerProfile(playerId) }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/banking/loans/:id/repay', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = LoanRepaySchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const loan = world.banking.repayLoan(req.params.id, playerId, parsed.data.amountCR);
      ok(res, { loan, profile: world.getPlayerProfile(playerId) });
    } catch (err) {
      next(err);
    }
  });

  // Economy, News, Leaderboard & Social Chat
  router.get('/economy', (_req, res) => {
    world.economy.syncLedgerMetrics(world.ledger);
    ok(res, {
      gameClock: world.economy.getGameClock(),
      economy: world.economy.state,
    });
  });

  router.get('/news', (_req, res) => {
    ok(res, world.economy.news);
  });

  router.get('/leaderboard', (req, res) => {
    const scopeRaw = typeof req.query.scope === 'string' ? req.query.scope.toUpperCase() : 'PLAYERS';
    const scope = scopeRaw === 'AGENTS' || scopeRaw === 'ALL' ? scopeRaw : 'PLAYERS';
    ok(res, world.getLeaderboard(scope));
  });

  router.get('/chat', (req, res) => {
    const channelRaw = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : undefined;
    const channel = channelRaw === 'WORLD' || channelRaw === 'MARKET' ? channelRaw : undefined;
    ok(res, world.listChatMessages(channel));
  });

  router.post('/chat', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ChatMessageSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const message = world.postChatMessage(playerId, parsed.data.channel, parsed.data.content);
      ok(res, message, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat/:id/report', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      world.reportChatMessage(playerId, req.params.id);
      ok(res, { reported: true });
    } catch (err) {
      next(err);
    }
  });

  // Entertainment Zone (Strictly isolated Entertainment Chips — ZERO CR conversion)
  router.post('/entertainment/play', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = EntertainmentPlaySchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      const outcome = world.playEntertainmentChips(playerId, parsed.data.wagerChips, parsed.data.targetMultiplier);
      ok(res, outcome);
    } catch (err) {
      next(err);
    }
  });

  router.post('/entertainment/refill', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const remainingChips = world.claimFreeEntertainmentChips(playerId);
      ok(res, { remainingChips });
    } catch (err) {
      next(err);
    }
  });

  // Diagnostics & Development QA Tools
  router.get('/diagnostics', (_req, res) => {
    ok(res, world.getDiagnostics());
  });

  router.post('/dev/simulate-bot-tick', (req, res, next) => {
    try {
      if (!world.devToolsEnabled) throw new DomainError('FORBIDDEN_IN_PRODUCTION', undefined, 403);
      const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.toUpperCase() : undefined;
      const result = world.devSimulateBotTick(symbol);
      ok(res, { tradesExecuted: result.trades.length, affectedSymbols: result.affectedSymbols });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dev/reset', (_req, res, next) => {
    try {
      if (!world.devToolsEnabled) throw new DomainError('FORBIDDEN_IN_PRODUCTION', undefined, 403);
      world.auth.reset();
      world.bootstrapWorld();
      ok(res, { reset: true, diagnostics: world.getDiagnostics() });
    } catch (err) {
      next(err);
    }
  });

  // Malformed JSON / Domain Error handler
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      return fail(res, err.code, err.message, err.statusCode, err.details);
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return fail(res, 'VALIDATION_ERROR', 'JSON payload không hợp lệ.', 400);
    }
    console.error('[API Error]', err);
    return fail(res, 'SERVER_ERROR', ERROR_MESSAGES_VI.SERVER_ERROR, 500);
  });

  return router;
}
