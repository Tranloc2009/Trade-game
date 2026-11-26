import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';
import { WorldEngine } from '../engine/WorldEngine';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarizeMs(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avgMs: Number((sum / Math.max(1, sorted.length)).toFixed(3)),
    p50Ms: Number(percentile(sorted, 50).toFixed(3)),
    p95Ms: Number(percentile(sorted, 95).toFixed(3)),
    p99Ms: Number(percentile(sorted, 99).toFixed(3)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
  };
}

async function runBenchmarks() {
  const elHistogram = monitorEventLoopDelay({ resolution: 10 });
  elHistogram.enable();

  const cpuStart = process.cpuUsage();
  const memStart = process.memoryUsage();
  const benchStartMs = performance.now();

  // 1. Single World — Multi-Symbol + Multi-NPC + 10 Simulated Online Players
  const world = new WorldEngine({ enableBackgroundLoops: false, botAgentCount: 24 });

  let totalEventsEmitted = 0;
  const candleLatenciesMs: number[] = [];
  let lastOrderStartMs = 0;
  let waitingForCandle = false;

  world.eventBus.subscribe((env) => {
    totalEventsEmitted += 1;
    if (env.eventType === 'market.candle.updated' && waitingForCandle) {
      candleLatenciesMs.push(performance.now() - lastOrderStartMs);
      waitingForCandle = false;
    }
  });

  // Scenario A: 1 Player -> 20 rapid Market orders across 4 symbols (within real SecurityGuard anti-spam limit)
  const { profile: soloPlayer } = world.loginGuest('BenchSoloPlayer');
  const symbols = ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'NOVA'];
  const soloOrderAckMs: number[] = [];
  const soloStart = performance.now();
  for (let i = 0; i < 20; i++) {
    const sym = symbols[i % symbols.length];
    const qty = sym === 'BTC-SIM' ? 0.01 : sym === 'ETH-SIM' ? 0.05 : sym === 'SOL-SIM' ? 1 : 2;
    const side = Math.floor(i / symbols.length) % 2 === 1 ? 'SELL' : 'BUY';
    const t0 = performance.now();
    lastOrderStartMs = t0;
    waitingForCandle = true;
    world.placeOrder(soloPlayer.id, {
      symbol: sym,
      side,
      type: 'MARKET',
      quantity: qty,
      idempotencyKey: `bench_solo_${i}`,
    });
    soloOrderAckMs.push(performance.now() - t0);
    waitingForCandle = false;
  }
  const soloElapsedSec = (performance.now() - soloStart) / 1000;
  const soloOrdersPerSec = Number((20 / Math.max(0.001, soloElapsedSec)).toFixed(1));

  // Scenario B: 20 Simulated Online Players trading concurrently across Spot, Forex & Futures (200 orders total)
  const players = Array.from({ length: 20 }, (_, idx) => world.loginGuest(`BenchOnline_${idx}`).profile);
  for (const p of players) {
    world.acknowledgeFuturesRisk(p.id);
  }
  const multiPlayerAckMs: number[] = [];
  const multiStart = performance.now();
  const totalMultiOrders = 200;
  for (let i = 0; i < totalMultiOrders; i++) {
    const p = players[i % players.length];
    const t0 = performance.now();
    if (i % 5 === 0) {
      world.placeFuturesOrder(p.id, {
        symbol: 'BTC-SIM/CR-PERP',
        side: i % 2 === 0 ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: 0.01,
        leverage: 5,
        idempotencyKey: `bench_mp_fut_${i}`,
      });
    } else if (i % 5 === 1) {
      world.placeOrder(p.id, {
        symbol: 'USD-SIM/CR',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50,
        idempotencyKey: `bench_mp_fx_${i}`,
      });
    } else {
      const sym = symbols[i % symbols.length];
      const qty = sym === 'BTC-SIM' ? 0.01 : sym === 'ETH-SIM' ? 0.05 : sym === 'SOL-SIM' ? 1 : 2;
      world.placeOrder(p.id, {
        symbol: sym,
        side: 'BUY',
        type: 'MARKET',
        quantity: qty,
        idempotencyKey: `bench_mp_spot_${i}`,
      });
    }
    multiPlayerAckMs.push(performance.now() - t0);
  }
  const multiElapsedSec = (performance.now() - multiStart) / 1000;
  const multiOrdersPerSec = Number((totalMultiOrders / Math.max(0.001, multiElapsedSec)).toFixed(1));

  // Scenario C: High-frequency Market Quote Ticks (60 ticks simulating 1 minute of 1s cadence)
  world.setActiveWatchedSymbols(['BTC-SIM', 'ETH-SIM', 'EUR-SIM/USD-SIM'], ['BTC-SIM/CR-PERP']);
  const fastTickDurationsMs: number[] = [];
  for (let i = 0; i < 60; i++) {
    const t0 = performance.now();
    const res = world.marketMakers.runFastLiquidityTick(world.economy.state, ['BTC-SIM', 'ETH-SIM']);
    for (const tr of res.trades) {
      world.eventBus.publish('market.trade.executed', tr, `market:${tr.symbol}`);
    }
    if (i % 2 === 0) {
      world.forexBots.runForexTick('EUR-SIM/USD-SIM');
    } else {
      world.futuresBots.runFuturesTick(world.economy.state, 'BTC-SIM/CR-PERP');
      world.futures.refreshAllMarkPrices();
    }
    fastTickDurationsMs.push(performance.now() - t0);
  }

  // Scenario D: Autonomous Bot Simulation Tick (20 ticks with bounded maxAgentsPerTick = 10)
  const botSimTickDurationsMs: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    world.runAutonomousBotTick({ maxAgentsPerTick: 10 });
    botSimTickDurationsMs.push(performance.now() - t0);
  }

  // Scenario E: 5 Active Isolated Career Saves running Career Fast Market Ticks
  const careerManager = new CareerWorldManager(world, { enableTimers: false, storagePath: null });
  const careerSaveIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const login = careerManager.loginOrRegisterAccount({
      username: `BenchCareer_${i}`,
      password: 'Password123!',
      preferredInitialMode: 'CAREER',
    });
    const saveId = login.account.preferences.activeCareerSaveId!;
    careerSaveIds.push(saveId);
  }
  const careerTickDurationsMs: number[] = [];
  for (let round = 0; round < 10; round++) {
    const t0 = performance.now();
    for (const saveId of careerSaveIds) {
      const save = careerManager.getSaveById(saveId)!;
      save.world.runCareerFastMarketTick('BTC-SIM', 'BTC-SIM/CR-PERP');
    }
    careerTickDurationsMs.push(performance.now() - t0);
  }
  careerManager.dispose();

  const totalElapsedSec = (performance.now() - benchStartMs) / 1000;
  const cpuEnd = process.cpuUsage(cpuStart);
  const memEnd = process.memoryUsage();
  elHistogram.disable();

  const report = {
    measuredAt: new Date().toISOString(),
    totalDurationSec: Number(totalElapsedSec.toFixed(3)),
    soloOrderAck: { ...summarizeMs(soloOrderAckMs), ordersPerSec: soloOrdersPerSec },
    multiPlayer10OrderAck: { ...summarizeMs(multiPlayerAckMs), ordersPerSec: multiOrdersPerSec },
    candleEmitLatency: summarizeMs(candleLatenciesMs),
    fastQuoteTick1s: summarizeMs(fastTickDurationsMs),
    botSimTick3s: summarizeMs(botSimTickDurationsMs),
    fiveCareerSavesCombinedTick: summarizeMs(careerTickDurationsMs),
    eventBusMessagesTotal: totalEventsEmitted,
    eventBusMessagesPerSec: Number((totalEventsEmitted / Math.max(0.001, totalElapsedSec)).toFixed(1)),
    ledgerConservationDiscrepancyCRMinor: world.ledger.auditCurrencyConservation('CR').discrepancyMinor,
    ledgerIntegrityValid: world.ledger.auditCurrencyConservation('CR').discrepancyMinor === 0,
    cpuUsageMs: {
      userMs: Number((cpuEnd.user / 1000).toFixed(1)),
      systemMs: Number((cpuEnd.system / 1000).toFixed(1)),
    },
    memoryMB: {
      rssStart: Number((memStart.rss / (1024 * 1024)).toFixed(1)),
      rssEnd: Number((memEnd.rss / (1024 * 1024)).toFixed(1)),
      heapUsedEnd: Number((memEnd.heapUsed / (1024 * 1024)).toFixed(1)),
    },
    eventLoopDelayMs: {
      meanMs: Number((elHistogram.mean / 1e6).toFixed(3)),
      p95Ms: Number((elHistogram.percentile(95) / 1e6).toFixed(3)),
      maxMs: Number((elHistogram.max / 1e6).toFixed(3)),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

runBenchmarks().catch((err) => {
  console.error(err);
  process.exit(1);
});
