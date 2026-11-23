import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalProviderRegistry } from '../adapters/ExternalProviders';
import { ENV_DEFAULTS, parseEnv } from '../config/env';
import { WorldEngine } from '../engine/WorldEngine';

test('ENV 01: Empty environment uses all safe prototype fallback defaults without throwing', () => {
  const cfg = parseEnv({});

  assert.equal(cfg.port, 3000);
  assert.equal(cfg.nodeEnv, 'development');
  assert.equal(cfg.worldId, ENV_DEFAULTS.TRADING_EMPIRE_WORLD_ID);
  assert.equal(cfg.worldId, 'WORLD-01');
  assert.equal(cfg.calendar, 'SIMULATED');
  assert.equal(cfg.calendarMode, 'ACCELERATED');
  assert.equal(cfg.devToolsRaw, 'true');
  assert.equal(cfg.devToolsEnabled, true);
  assert.equal(cfg.providers.crypto, 'disabled');
  assert.equal(cfg.providers.stock, 'disabled');
  assert.equal(cfg.providers.news, 'disabled');
  assert.equal(cfg.providers.aiAnalysis, 'disabled');
  assert.equal(cfg.providers.auth, 'guest');
});

test('ENV 02: Blank or whitespace env vars safely fall back to prototype defaults', () => {
  const cfg = parseEnv({
    PORT: '',
    TRADING_EMPIRE_WORLD_ID: '   ',
    TRADING_EMPIRE_CALENDAR: '',
    TRADING_EMPIRE_DEV_TOOLS: '   ',
    EXTERNAL_CRYPTO_PROVIDER: '',
    EXTERNAL_STOCK_PROVIDER: ' ',
    EXTERNAL_NEWS_PROVIDER: '',
    EXTERNAL_AI_ANALYSIS_PROVIDER: '',
    EXTERNAL_AUTH_PROVIDER: '',
  });

  assert.equal(cfg.port, 3000);
  assert.equal(cfg.worldId, 'WORLD-01');
  assert.equal(cfg.calendar, 'SIMULATED');
  assert.equal(cfg.devToolsEnabled, true);
  assert.equal(cfg.providers.crypto, 'disabled');
  assert.equal(cfg.providers.stock, 'disabled');
  assert.equal(cfg.providers.news, 'disabled');
  assert.equal(cfg.providers.aiAnalysis, 'disabled');
  assert.equal(cfg.providers.auth, 'guest');
});

test('ENV 03: Disabled/guest providers resolve cleanly to internal simulated adapters with zero external secrets', async () => {
  const cfg = parseEnv({});
  const registry = createExternalProviderRegistry(cfg);
  const summary = registry.getStatusSummary();

  assert.equal(summary.crypto.activeMode, 'simulated');
  assert.equal(summary.crypto.externalEnabled, false);
  assert.equal(summary.stock.activeMode, 'simulated');
  assert.equal(summary.stock.externalEnabled, false);
  assert.equal(summary.news.activeMode, 'simulated');
  assert.equal(summary.news.externalEnabled, false);
  assert.equal(summary.aiAnalysis.activeMode, 'disabled');
  assert.equal(summary.aiAnalysis.externalEnabled, false);
  assert.equal(summary.auth.activeMode, 'guest');
  assert.equal(summary.auth.externalEnabled, false);

  assert.equal(await registry.crypto.fetchReferenceQuote('BTC-SIM'), null);
  assert.equal(await registry.stock.fetchReferenceQuote('NOVA'), null);
  assert.deepEqual(await registry.news.fetchHeadlines(5), []);
  assert.equal(await registry.aiAnalysis.summarizeMarketState('NOVA'), null);
  assert.equal(await registry.auth.verifyExternalIdentity('any-token'), null);

  const world = new WorldEngine({
    worldId: cfg.worldId,
    calendarMode: cfg.calendarMode,
    devToolsEnabled: cfg.devToolsEnabled,
    enableBackgroundLoops: false,
    providers: registry,
  });
  assert.equal(world.worldId, 'WORLD-01');
  assert.equal(world.providers.getStatusSummary().auth.activeMode, 'guest');
});
