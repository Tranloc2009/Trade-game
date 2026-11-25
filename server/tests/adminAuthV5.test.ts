import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createCareerImmersionRouter } from '../api/careerRoutes';
import { createApiRouter } from '../api/routes';
import { WorldEngine } from '../engine/WorldEngine';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';
import { adminAuth } from '../security/AdminAuth';

async function jsonReq(
  baseUrl: string,
  reqPath: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: any; rawText: string }> {
  const res = await fetch(`${baseUrl}${reqPath}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const rawText = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = null;
  }
  return { status: res.status, body, rawText };
}

const ALL_PROTECTED_ADMIN_QA_ROUTES = [
  { method: 'GET', path: '/api/diagnostics' },
  { method: 'POST', path: '/api/dev/simulate-bot-tick', body: {} },
  { method: 'POST', path: '/api/dev/reset', body: {} },
  { method: 'POST', path: '/api/bots/dev/tick', body: { ticks: 1 } },
  { method: 'POST', path: '/api/bots/dev/configure', body: { agentCount: 16 } },
  { method: 'POST', path: '/api/forex/dev/trigger-policy', body: {} },
  { method: 'POST', path: '/api/futures/dev/settle-funding', body: {} },
  { method: 'POST', path: '/api/futures/dev/simulate-tick', body: {} },
  { method: 'POST', path: '/api/v4/dev/advance-cycle', body: { cycles: 1 } },
  { method: 'GET', path: '/api/v4/dev/balance-simulation?days=30' },
];

describe('Server-Side ADMIN_DEV_SECRET & Admin/QA Authorization', () => {
  let server: http.Server;
  let baseUrl = '';
  let world: WorldEngine;
  let careerManager: CareerWorldManager;
  let tmpDir = '';
  const originalSecret = process.env.ADMIN_DEV_SECRET;

  before(async () => {
    delete process.env.ADMIN_DEV_SECRET;
    adminAuth.clearAllForTests();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-admin-auth-test-'));
    world = new WorldEngine({ devToolsEnabled: true, enableBackgroundLoops: false });
    careerManager = new CareerWorldManager(world, {
      enableTimers: false,
      storagePath: path.join(tmpDir, 'career-state.json'),
    });

    const app = express();
    app.use(express.json());
    app.use('/api', createCareerImmersionRouter(careerManager));
    app.use('/api', createApiRouter(world));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    delete process.env.ADMIN_DEV_SECRET;
    adminAuth.clearAllForTests();
  });

  after(async () => {
    if (originalSecret === undefined) {
      delete process.env.ADMIN_DEV_SECRET;
    } else {
      process.env.ADMIN_DEV_SECRET = originalSecret;
    }
    adminAuth.clearAllForTests();
    careerManager.dispose();
    world.stopBackgroundLoops();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('disables ALL Admin/QA routes (403) when ADMIN_DEV_SECRET is unset while Career and Online gameplay work normally', async () => {
    const statusRes = await jsonReq(baseUrl, '/api/admin/status');
    assert.equal(statusRes.status, 200);
    assert.deepEqual(statusRes.body.data, { adminEnabled: false, authenticated: false });

    // No first-run claim backdoor exists
    const claimRes = await jsonReq(baseUrl, '/api/admin/claim', {
      method: 'POST',
      body: { passcode: 'OperatorPass2026!' },
    });
    assert.equal(claimRes.status, 404);

    // Admin login must be disabled with 403 when env secret is unset
    const adminLoginRes = await jsonReq(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { secret: 'AnyAttemptedSecret123' },
    });
    assert.equal(adminLoginRes.status, 403);
    assert.equal(adminLoginRes.body.ok, false);

    // Online gameplay works normally without ADMIN_DEV_SECRET
    const onlineLogin = await jsonReq(baseUrl, '/api/auth/guest', {
      method: 'POST',
      body: { username: 'NormalOnlinePlayer', preset: 'CUSTOM' },
    });
    assert.equal(onlineLogin.status, 201);
    const playerToken = onlineLogin.body.data.token as string;
    const playerHeaders = { Authorization: `Bearer ${playerToken}` };

    const snapshot = await jsonReq(baseUrl, '/api/world/snapshot', { headers: playerHeaders });
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.ok, true);

    const markets = await jsonReq(baseUrl, '/api/markets');
    assert.equal(markets.status, 200);
    assert.ok(Array.isArray(markets.body.data) && markets.body.data.length > 0);

    // Career gameplay works normally without ADMIN_DEV_SECRET
    const careerLogin = await jsonReq(baseUrl, '/api/account/login', {
      method: 'POST',
      body: {
        username: 'CareerFounder',
        password: 'CareerPassword2026',
        preset: 'CUSTOM',
        preferredInitialMode: 'CAREER',
      },
    });
    assert.equal(careerLogin.status, 201);
    const careerToken = careerLogin.body.data.careerToken as string;
    const careerHeaders = { Authorization: `Bearer ${careerToken}` };

    const careerState = await jsonReq(baseUrl, '/api/career/state', { headers: careerHeaders });
    assert.equal(careerState.status, 200);
    assert.equal(careerState.body.ok, true);

    const careerCycle = await jsonReq(baseUrl, '/api/career/clock/advance-cycle', {
      method: 'POST',
      headers: careerHeaders,
      body: {},
    });
    assert.equal(careerCycle.status, 200);
    assert.equal(careerCycle.body.ok, true);

    // Every single Admin/QA route must return 403 for unauthenticated & ordinary players
    for (const call of ALL_PROTECTED_ADMIN_QA_ROUTES) {
      const unauth = await jsonReq(baseUrl, call.path, { method: call.method, body: call.body });
      assert.equal(unauth.status, 403, `Expected 403 unauth for ${call.method} ${call.path}`);

      const asPlayer = await jsonReq(baseUrl, call.path, {
        method: call.method,
        headers: playerHeaders,
        body: call.body,
      });
      assert.equal(asPlayer.status, 403, `Expected 403 ordinary player for ${call.method} ${call.path}`);
      assert.equal(asPlayer.body.ok, false);
    }
  });

  it('enforces server-side ADMIN_DEV_SECRET authorization, never leaks secret, and revokes on logout or unset', async () => {
    const testSecret = 'SuperStrongBackendOnlySecret_2026!';
    process.env.ADMIN_DEV_SECRET = testSecret;

    const statusBefore = await jsonReq(baseUrl, '/api/admin/status');
    assert.equal(statusBefore.status, 200);
    assert.deepEqual(statusBefore.body.data, { adminEnabled: true, authenticated: false });
    assert.ok(!statusBefore.rawText.includes(testSecret), 'Secret must never appear in status response');

    // Ordinary player still gets 403 on protected routes
    const playerLogin = await jsonReq(baseUrl, '/api/auth/guest', {
      method: 'POST',
      body: { username: 'OrdinaryUser', preset: 'CUSTOM' },
    });
    const playerHeaders = { Authorization: `Bearer ${playerLogin.body.data.token}` };
    const forbiddenDiag = await jsonReq(baseUrl, '/api/diagnostics', { headers: playerHeaders });
    assert.equal(forbiddenDiag.status, 403);

    // Wrong secret fails with 403 and never leaks secret
    const wrongLogin = await jsonReq(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { secret: 'WrongSecretValue123' },
    });
    assert.equal(wrongLogin.status, 403);
    assert.ok(!wrongLogin.rawText.includes(testSecret));

    // Valid secret grants opaque session token (not the secret itself)
    const validLogin = await jsonReq(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { secret: testSecret },
    });
    assert.equal(validLogin.status, 200);
    const adminToken = validLogin.body.data.token as string;
    assert.ok(adminToken.startsWith('adm_'));
    assert.ok(!validLogin.rawText.includes(testSecret), 'Secret must never be echoed in login response');

    // Authenticated admin can call protected QA routes with X-Admin-Token
    const diag = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(diag.status, 200);
    assert.equal(diag.body.ok, true);
    assert.ok(!diag.rawText.includes(testSecret));

    const advance = await jsonReq(baseUrl, '/api/v4/dev/advance-cycle', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
      body: { cycles: 1 },
    });
    assert.equal(advance.status, 200);
    assert.equal(advance.body.data.cyclesExecuted, 1);

    // Backend header X-Admin-Secret also works when exact match
    const diagByHeader = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Secret': testSecret },
    });
    assert.equal(diagByHeader.status, 200);

    // Unsetting ADMIN_DEV_SECRET immediately disables existing admin session
    delete process.env.ADMIN_DEV_SECRET;
    const afterUnset = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(afterUnset.status, 403);

    // Restore secret and test explicit logout revocation
    process.env.ADMIN_DEV_SECRET = testSecret;
    const logoutRes = await jsonReq(baseUrl, '/api/admin/logout', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(afterLogout.status, 403);
  });

  it('blocks all Admin/QA routes when devToolsEnabled is false even if ADMIN_DEV_SECRET is configured', async () => {
    const prodSecret = 'ProductionBlockedSecret_2026!';
    process.env.ADMIN_DEV_SECRET = prodSecret;

    const prodWorld = new WorldEngine({ devToolsEnabled: false, enableBackgroundLoops: false });
    const prodApp = express();
    prodApp.use(express.json());
    prodApp.use('/api', createApiRouter(prodWorld));

    let prodServer!: http.Server;
    let prodUrl = '';
    await new Promise<void>((resolve) => {
      prodServer = prodApp.listen(0, '127.0.0.1', () => {
        const addr = prodServer.address();
        if (addr && typeof addr === 'object') {
          prodUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    try {
      const loginRes = await jsonReq(prodUrl, '/api/admin/login', {
        method: 'POST',
        body: { secret: prodSecret },
      });
      assert.equal(loginRes.status, 403);

      const diagRes = await jsonReq(prodUrl, '/api/diagnostics', {
        headers: { 'X-Admin-Secret': prodSecret },
      });
      assert.equal(diagRes.status, 403);

      const v4AdvanceRes = await jsonReq(prodUrl, '/api/v4/dev/advance-cycle', {
        method: 'POST',
        headers: { 'X-Admin-Secret': prodSecret },
        body: { cycles: 1 },
      });
      assert.equal(v4AdvanceRes.status, 403);
    } finally {
      prodWorld.stopBackgroundLoops();
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
    }
  });
});
