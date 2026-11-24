import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './server/api/routes';
import { createExternalProviderRegistry } from './server/adapters/ExternalProviders';
import { env } from './server/config/env';
import { WorldEngine } from './server/engine/WorldEngine';
import { SocketGateway } from './server/realtime/SocketGateway';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = env.port;
const IS_PROD = env.isProduction;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Strict JSON parsing with malformed body protection (TEST 20)
  app.use(express.json({ limit: '256kb' }));
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        ok: false,
        apiVersion: '1.0.0',
        serverTimestamp: new Date().toISOString(),
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu JSON gửi lên máy chủ không hợp lệ.',
        },
      });
      return;
    }
    next(err);
  });

  // Resolve optional external providers (falls back cleanly to internal simulated/guest services)
  const providers = createExternalProviderRegistry(env);

  // Boot single authoritative WORLD-01 simulation engine
  const world = new WorldEngine({
    worldId: env.worldId,
    worldName: `${env.worldId}: GLOBAL ECONOMY`,
    calendarMode: env.calendarMode,
    enableBackgroundLoops: true,
    devToolsEnabled: env.devToolsEnabled,
    providers,
  });

  // Boot strictly isolated WORLD-PRACTICE simulation engine (100,000 CR practice sandbox)
  // Separate Ledger, MatchingEngine, FuturesEngine, and sessions — NEVER shares order books or balances with WORLD-01
  const practiceWorld = new WorldEngine({
    worldId: 'WORLD-PRACTICE',
    worldName: 'PHÒNG LUYỆN TẬP (100,000 CR)',
    calendarMode: env.calendarMode,
    enableBackgroundLoops: true,
    devToolsEnabled: true,
    providers,
  });

  // Attach authoritative Socket.IO gateway on same HTTP server/port for WORLD-01
  new SocketGateway(httpServer, world);

  // Mount REST APIs (WORLD-01 & strictly isolated WORLD-PRACTICE)
  app.use('/api/practice', createApiRouter(practiceWorld));
  app.use('/api', createApiRouter(world));

  // Mount Vite middleware in development, or serve built dist/ in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Trading Empire] Authoritative WORLD-01 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Trading Empire] Failed to boot server:', err);
  process.exit(1);
});
