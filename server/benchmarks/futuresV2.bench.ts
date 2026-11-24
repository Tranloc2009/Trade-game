import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { fromPriceInt, type FuturesContract } from '../../shared/contracts/futures';
import { toMinor } from '../../shared/contracts/money';
import { WorldEngine } from '../engine/WorldEngine';

interface LatencyStats {
  count: number;
  totalMs: number;
  throughputOpsPerSec: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
}

interface BenchmarkResult {
  workload: string;
  stats: LatencyStats;
  notes?: string;
}

function calcStats(samplesMs: number[], totalWallMs?: number): LatencyStats {
  if (samplesMs.length === 0) {
    return {
      count: 0,
      totalMs: 0,
      throughputOpsPerSec: 0,
      minMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      meanMs: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const wall = totalWallMs ?? sum;
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    count: sorted.length,
    totalMs: Number(wall.toFixed(3)),
    throughputOpsPerSec: wall > 0 ? Math.round((sorted.length / wall) * 1000) : 0,
    minMs: Number(sorted[0].toFixed(4)),
    p50Ms: Number(pct(0.5).toFixed(4)),
    p95Ms: Number(pct(0.95).toFixed(4)),
    p99Ms: Number(pct(0.99).toFixed(4)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(4)),
    meanMs: Number((sum / sorted.length).toFixed(4)),
  };
}

function snapPriceCR(contract: FuturesContract, rawPriceInt: number): number {
  const snapped = Math.max(
    contract.priceTickInt,
    Math.round(rawPriceInt / contract.priceTickInt) * contract.priceTickInt,
  );
  return fromPriceInt(snapped, contract.priceScale);
}

function createBenchWorld(): WorldEngine {
  return new WorldEngine({
    worldId: 'WORLD-BENCH',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
}

function clearBotOrders(world: WorldEngine, symbol: string): void {
  for (const bot of world.getFuturesOverview().bots) {
    world.futures.cancelAllPlayerOrdersForSymbol(bot.id, symbol);
  }
}

function fundBenchTrader(world: WorldEngine, name: string, capitalCR = 5_000_000): string {
  const profile = world.loginGuest(name, 'CUSTOM').profile;
  world.acknowledgeFuturesRisk(profile.id);
  const extra = toMinor(capitalCR - 100_000);
  if (extra > 0) {
    world.ledger.issueCurrency(profile.id, 'CR', extra, `bench_fund_${name}`, 'Benchmark trader capital');
  }
  return profile.id;
}

function runEmptyBookWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'NOVA/CR-PERP';
  clearBotOrders(world, symbol);
  const traderId = fundBenchTrader(world, 'BenchEmpty');
  const contract = world.futures.getContract(symbol)!;
  const baseInt = contract.markPriceInt;

  const samples: number[] = [];
  const tStart = performance.now();
  const N = 1_000;
  for (let i = 0; i < N; i++) {
    const offset = ((i % 40) + 1) * contract.priceTickInt;
    const side = i % 2 === 0 ? 'BUY' : 'SELL';
    const priceInt = side === 'BUY' ? baseInt - offset : baseInt + offset;
    const t0 = performance.now();
    world.futures.placeOrder({
      playerId: traderId,
      playerName: 'BenchEmpty',
      symbol,
      side,
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, priceInt),
      quantity: 1,
      leverage: 2,
    });
    samples.push(performance.now() - t0);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '1. Empty Book Insert (1,000 resting limits)',
    stats: calcStats(samples, wall),
  };
}

function runDeepBookWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'ETH-SIM/CR-PERP';
  clearBotOrders(world, symbol);
  const makerA = fundBenchTrader(world, 'BenchDeepA', 20_000_000);
  const makerB = fundBenchTrader(world, 'BenchDeepB', 20_000_000);
  const contract = world.futures.getContract(symbol)!;
  const baseInt = contract.markPriceInt;

  // Pre-seed 600 resting orders across 150 bid levels & 150 ask levels
  const seedIds: string[] = [];
  for (let i = 0; i < 300; i++) {
    const level = (i % 150) + 1;
    const bidRes = world.futures.placeOrder({
      playerId: makerA,
      playerName: 'BenchDeepA',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, baseInt - level * contract.priceTickInt),
      quantity: 0.1,
      leverage: 2,
    });
    seedIds.push(bidRes.order.id);
    const askRes = world.futures.placeOrder({
      playerId: makerB,
      playerName: 'BenchDeepB',
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, baseInt + level * contract.priceTickInt),
      quantity: 0.1,
      leverage: 2,
    });
    seedIds.push(askRes.order.id);
  }

  const samples: number[] = [];
  const tStart = performance.now();
  for (let i = 0; i < 500; i++) {
    const level = ((i * 7) % 150) + 1;
    const t0 = performance.now();
    const placed = world.futures.placeOrder({
      playerId: makerA,
      playerName: 'BenchDeepA',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, baseInt - level * contract.priceTickInt),
      quantity: 0.1,
      leverage: 2,
    });
    samples.push(performance.now() - t0);

    const t1 = performance.now();
    world.futures.cancelOrder(placed.order.id, makerA);
    samples.push(performance.now() - t1);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '2. Deep Book (600 resting, 500 ins + 500 cancel)',
    stats: calcStats(samples, wall),
  };
}

function runHeavyMarketOrdersWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'SOL-SIM/CR-PERP';
  clearBotOrders(world, symbol);
  const maker = fundBenchTrader(world, 'BenchMM', 50_000_000);
  const taker = fundBenchTrader(world, 'BenchTaker', 50_000_000);
  const contract = world.futures.getContract(symbol)!;
  const baseInt = contract.markPriceInt;

  // Seed deep two-sided liquidity
  for (let lvl = 1; lvl <= 25; lvl++) {
    world.futures.placeOrder({
      playerId: maker,
      playerName: 'BenchMM',
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, baseInt + lvl * contract.priceTickInt),
      quantity: 200,
      leverage: 2,
    });
    world.futures.placeOrder({
      playerId: maker,
      playerName: 'BenchMM',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, baseInt - lvl * contract.priceTickInt),
      quantity: 200,
      leverage: 2,
    });
  }

  const samples: number[] = [];
  const tStart = performance.now();
  for (let i = 0; i < 600; i++) {
    const side = i % 2 === 0 ? 'BUY' : 'SELL';
    const t0 = performance.now();
    world.futures.placeOrder({
      playerId: taker,
      playerName: 'BenchTaker',
      symbol,
      side,
      type: 'MARKET',
      quantity: 1,
      leverage: 5,
    });
    samples.push(performance.now() - t0);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '3. Heavy Market Orders (600 live matched trades)',
    stats: calcStats(samples, wall),
  };
}

function runFrequentCancelWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'BTC-SIM/CR-PERP';
  clearBotOrders(world, symbol);
  const trader = fundBenchTrader(world, 'BenchCancel', 25_000_000);
  const contract = world.futures.getContract(symbol)!;
  const baseInt = contract.markPriceInt;

  const samples: number[] = [];
  const tStart = performance.now();
  for (let i = 0; i < 500; i++) {
    const price = snapPriceCR(contract, baseInt - ((i % 30) + 2) * contract.priceTickInt);
    const t0 = performance.now();
    const res = world.futures.placeOrder({
      playerId: trader,
      playerName: 'BenchCancel',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: price,
      quantity: 0.05,
      leverage: 2,
    });
    const t1 = performance.now();
    world.futures.cancelOrder(res.order.id, trader);
    const t2 = performance.now();
    samples.push(t1 - t0, t2 - t1);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '4. Frequent Cancel Storm (500 place + 500 cancel)',
    stats: calcStats(samples, wall),
  };
}

function runPartialFillStormWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'NOVA/CR-PERP';
  clearBotOrders(world, symbol);
  const maker = fundBenchTrader(world, 'BenchMakerPF', 20_000_000);
  const taker = fundBenchTrader(world, 'BenchTakerPF', 20_000_000);
  const contract = world.futures.getContract(symbol)!;
  const baseInt = contract.markPriceInt;

  const samples: number[] = [];
  const tStart = performance.now();
  for (let wave = 0; wave < 20; wave++) {
    // Place 20 small resting asks
    for (let j = 0; j < 20; j++) {
      world.futures.placeOrder({
        playerId: maker,
        playerName: 'BenchMakerPF',
        symbol,
        side: 'SELL',
        type: 'LIMIT',
        priceCR: snapPriceCR(contract, baseInt + (j % 5 + 1) * contract.priceTickInt),
        quantity: 2,
        leverage: 2,
      });
    }
    // Sweep them in one multi-fill market order (20 fills per sweep)
    const t0 = performance.now();
    world.futures.placeOrder({
      playerId: taker,
      playerName: 'BenchTakerPF',
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 40,
      leverage: 3,
    });
    samples.push(performance.now() - t0);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '5. Partial Fill Storm (20 sweeps x 20 makers = 400 fills)',
    stats: calcStats(samples, wall),
  };
}

function runMultiMarketMultiUserWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const contracts = world.futures.listContracts();
  const traders: string[] = [];
  for (let u = 0; u < 20; u++) {
    traders.push(fundBenchTrader(world, `BenchUser_${u}`, 2_000_000));
  }

  const samples: number[] = [];
  const tStart = performance.now();
  const N = 1_000;
  for (let i = 0; i < N; i++) {
    const contract = contracts[i % contracts.length];
    const traderId = traders[i % traders.length];
    const side = i % 2 === 0 ? 'BUY' : 'SELL';
    const isMarket = i % 4 === 0;
    const offset = ((i % 10) + 1) * contract.priceTickInt;
    const priceInt = side === 'BUY' ? contract.markPriceInt - offset : contract.markPriceInt + offset;

    const t0 = performance.now();
    try {
      world.futures.placeOrder({
        playerId: traderId,
        playerName: `BenchUser_${i % traders.length}`,
        symbol: contract.symbol,
        side,
        type: isMarket ? 'MARKET' : 'LIMIT',
        priceCR: isMarket ? undefined : snapPriceCR(contract, priceInt),
        quantity: contract.minQty,
        leverage: 3,
      });
    } catch {
      // Ignore occasional self-trade/slippage rejections in stress mix
    }
    samples.push(performance.now() - t0);
  }
  const wall = performance.now() - tStart;
  return {
    workload: `6. Multi-Market (${contracts.length} mkts) & Multi-User (20 users, 1,000 ops)`,
    stats: calcStats(samples, wall),
  };
}

function runHighBotActivityWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const samples: number[] = [];
  const tStart = performance.now();
  for (let i = 0; i < 120; i++) {
    const t0 = performance.now();
    world.devSimulateFuturesTick();
    samples.push(performance.now() - t0);
  }
  const wall = performance.now() - tStart;
  return {
    workload: '7. High Bot Activity (120 full bot ticks + mark sync)',
    stats: calcStats(samples, wall),
  };
}

function runLiquidationCascadeWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'ETH-SIM/CR-PERP';
  clearBotOrders(world, symbol);
  const mm = fundBenchTrader(world, 'BenchLiqMM', 50_000_000);
  const contract = world.futures.getContract(symbol)!;
  const entryInt = contract.markPriceInt;

  // Seed asks for opening 15 longs
  world.futures.placeOrder({
    playerId: mm,
    playerName: 'BenchLiqMM',
    symbol,
    side: 'SELL',
    type: 'LIMIT',
    priceCR: snapPriceCR(contract, entryInt),
    quantity: 30,
    leverage: 2,
  });

  const victims: string[] = [];
  for (let i = 0; i < 15; i++) {
    const uid = fundBenchTrader(world, `Victim_${i}`, 200_000);
    victims.push(uid);
    world.futures.placeOrder({
      playerId: uid,
      playerName: `Victim_${i}`,
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      leverage: 10,
    });
  }

  // Crash index by -9.5% and seed multi-level bids for liquidation execution
  const crashInt = Math.round(entryInt * 0.905);
  world.futures.markEngine.applyConfirmedSpotMove(contract, crashInt);
  world.futures.refreshContractMarkPrice(symbol);
  for (let lvl = 0; lvl < 15; lvl++) {
    world.futures.placeOrder({
      playerId: mm,
      playerName: 'BenchLiqMM',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, crashInt - lvl * contract.priceTickInt * 2),
      quantity: 3,
      leverage: 2,
    });
  }

  const t0 = performance.now();
  const liqRes = world.futures.runLiquidationCheck(symbol);
  const elapsed = performance.now() - t0;

  const conservation = world.ledger.auditCurrencyConservation('CR');
  return {
    workload: `8. Liquidation Cascade (15 10x positions -> ${liqRes.liquidations.length} liquidated)`,
    stats: calcStats([elapsed], elapsed),
    notes: `CR discrepancy=${conservation.discrepancyMinor}`,
  };
}

function runUltraDeep5000BookWorkload(): BenchmarkResult {
  const world = createBenchWorld();
  const symbol = 'BTC-SIM/CR-PERP';
  clearBotOrders(world, symbol);
  const contract = world.futures.getContract(symbol)!;
  const makerA = fundBenchTrader(world, 'Deep5kA', 500_000_000);
  const makerB = fundBenchTrader(world, 'Deep5kB', 500_000_000);

  // Preload 5,000 resting orders across 250 bid + 250 ask levels
  const seedT0 = performance.now();
  for (let i = 0; i < 2500; i++) {
    const offset = (i % 250) + 1;
    world.futures.placeOrder({
      playerId: makerA,
      playerName: 'Deep5kA',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, contract.markPriceInt - offset * contract.priceTickInt * 2),
      quantity: 0.01,
      leverage: 10,
    });
    world.futures.placeOrder({
      playerId: makerB,
      playerName: 'Deep5kB',
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, contract.markPriceInt + offset * contract.priceTickInt * 2),
      quantity: 0.01,
      leverage: 10,
    });
  }
  const seedWall = performance.now() - seedT0;

  // Measure 1,000 ops (500 resting insert + 500 cancel) on top of 5,000-order book
  const latencies: number[] = [];
  const wallT0 = performance.now();
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    const placed = world.futures.placeOrder({
      playerId: makerA,
      playerName: 'Deep5kA',
      symbol,
      side: 'BUY',
      type: 'LIMIT',
      priceCR: snapPriceCR(contract, contract.markPriceInt - ((i % 40) + 1) * contract.priceTickInt * 2),
      quantity: 0.01,
      leverage: 10,
    });
    latencies.push(performance.now() - t0);

    const t1 = performance.now();
    world.futures.cancelOrder(placed.order.id, makerA);
    latencies.push(performance.now() - t1);
  }
  const wallMs = performance.now() - wallT0;
  const m = world.futures.getEngineMetrics();
  return {
    workload: '9. Ultra-Deep Book (5,000 resting, 500 ins + 500 cancel)',
    stats: calcStats(latencies, wallMs),
    notes: `seed5k=${seedWall.toFixed(1)}ms | stageP95(val=${m.validationP95Ms}ms match=${m.matchingP95Ms}ms settle=${m.settlementP95Ms}ms)`,
  };
}

function main(): void {
  const cpus = os.cpus();
  console.log('======================================================================');
  console.log('TRADING EMPIRE — FUTURES ENGINE V2 BENCHMARK');
  console.log('======================================================================');
  console.log(`Timestamp : ${new Date().toISOString()}`);
  console.log(`Node.js   : ${process.version}`);
  console.log(`Platform  : ${os.platform()} ${os.arch()} (${os.release()})`);
  console.log(`CPU       : ${cpus[0]?.model ?? 'unknown'} x${cpus.length}`);
  console.log(`Memory    : ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total`);
  console.log('----------------------------------------------------------------------');

  const results: BenchmarkResult[] = [
    runEmptyBookWorkload(),
    runDeepBookWorkload(),
    runHeavyMarketOrdersWorkload(),
    runFrequentCancelWorkload(),
    runPartialFillStormWorkload(),
    runMultiMarketMultiUserWorkload(),
    runHighBotActivityWorkload(),
    runLiquidationCascadeWorkload(),
    runUltraDeep5000BookWorkload(),
  ];

  for (const r of results) {
    const s = r.stats;
    console.log(
      `${r.workload}\n` +
        `   ops=${s.count} | wall=${s.totalMs}ms | throughput=${s.throughputOpsPerSec} ops/s | ` +
        `P50=${s.p50Ms}ms | P95=${s.p95Ms}ms | P99=${s.p99Ms}ms | max=${s.maxMs}ms` +
        (r.notes ? ` | ${r.notes}` : ''),
    );
  }
  console.log('======================================================================');
}

main();
