import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createApiRouter } from '../api/routes';
import { WorldEngine } from '../engine/WorldEngine';

async function jsonReq(
  baseUrl: string,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe('V5 Server-Side Admin Authorization for Online Dev/QA Routes', () => {
  let server: http.Server;
  let baseUrl = '';
  let world: WorldEngine;

  before(async () => {
    world = new WorldEngine({ devToolsEnabled: true, enableBackgroundLoops: false });
    const app = express();
    app.use(express.json());
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

  after(async () => {
    world.stopBackgroundLoops();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('blocks unauthenticated requests and ordinary players from Online dev/QA routes with HTTP 403', async () => {
    const login = await jsonReq(baseUrl, '/api/auth/guest', {
      method: 'POST',
      body: { username: 'NormalPlayer', preset: 'CUSTOM' },
    });
    assert.equal(login.status, 201);
    const playerToken = login.body.data.token as string;
    const playerHeaders = { Authorization: `Bearer ${playerToken}` };

    const protectedCalls = [
      { method: 'POST', path: '/api/v4/dev/advance-cycle', body: { cycles: 1 } },
      { method: 'GET', path: '/api/v4/dev/balance-simulation?days=30' },
      { method: 'POST', path: '/api/dev/simulate-bot-tick', body: {} },
      { method: 'POST', path: '/api/dev/reset', body: {} },
      { method: 'POST', path: '/api/forex/dev/trigger-policy', body: {} },
      { method: 'POST', path: '/api/futures/dev/settle-funding', body: {} },
      { method: 'POST', path: '/api/futures/dev/simulate-tick', body: {} },
      { method: 'GET', path: '/api/diagnostics' },
    ];

    for (const call of protectedCalls) {
      const res = await jsonReq(baseUrl, call.path, {
        method: call.method,
        headers: playerHeaders,
        body: call.body,
      });
      assert.equal(res.status, 403, `Expected 403 for ordinary player calling ${call.method} ${call.path}`);
      assert.equal(res.body.ok, false);
    }
  });

  it('allows authenticated admin via first-run operator claim to access protected QA routes', async () => {
    const statusBefore = await jsonReq(baseUrl, '/api/admin/status');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.body.data.authorized, false);

    // Reject weak passcode
    const weakClaim = await jsonReq(baseUrl, '/api/admin/claim', {
      method: 'POST',
      body: { passcode: '123' },
    });
    assert.equal(weakClaim.status, 400);

    // Claim valid operator passcode
    const claim = await jsonReq(baseUrl, '/api/admin/claim', {
      method: 'POST',
      body: { passcode: 'OperatorPass2026!' },
    });
    assert.equal(claim.status, 201);
    const adminToken = claim.body.data.token as string;
    assert.ok(adminToken.startsWith('adm_'));

    // Second claim must fail with 403
    const duplicateClaim = await jsonReq(baseUrl, '/api/admin/claim', {
      method: 'POST',
      body: { passcode: 'AnotherPass2026!' },
    });
    assert.equal(duplicateClaim.status, 403);

    // Protected route succeeds with X-Admin-Token
    const diag = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(diag.status, 200);
    assert.equal(diag.body.ok, true);

    const advance = await jsonReq(baseUrl, '/api/v4/dev/advance-cycle', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
      body: { cycles: 1 },
    });
    assert.equal(advance.status, 200);
    assert.equal(advance.body.data.cyclesExecuted, 1);

    // Logout revokes token
    await jsonReq(baseUrl, '/api/admin/logout', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
    });
    const afterLogout = await jsonReq(baseUrl, '/api/diagnostics', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(afterLogout.status, 403);
  });
});
