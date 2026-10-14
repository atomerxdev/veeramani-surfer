import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'veeramani-admin-2026';

function leaderboardDevPlugin(): Plugin {
  let devStore: Array<{
    id: string;
    name: string;
    score: number;
    distance: number;
    tokens: number;
    timestamp: number;
  }> = [];

  return {
    name: 'leaderboard-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const headerKey = req.headers?.['x-admin-key'];
        const authHeader = req.headers?.['authorization'];
        const queryKey = url.searchParams.get('adminKey') || url.searchParams.get('key');
        const isAdmin =
          headerKey === ADMIN_SECRET ||
          (typeof authHeader === 'string' && authHeader.replace(/^Bearer\s+/, '') === ADMIN_SECRET) ||
          queryKey === ADMIN_SECRET;

        if (req.method === 'GET') {
          const ranked = devStore.map((e, index) => ({ ...e, rank: index + 1 }));

          if (isAdmin) {
            const totalRuns = ranked.length;
            const topScore = ranked[0]?.score ?? 0;
            const topRunner = ranked[0]?.name ?? 'None';
            const avgDistance = totalRuns > 0 ? Math.round(ranked.reduce((s, e) => s + (e.distance || 0), 0) / totalRuns) : 0;
            const totalTokens = ranked.reduce((s, e) => s + (e.tokens || 0), 0);

            res.end(
              JSON.stringify({
                success: true,
                isAdmin: true,
                entries: ranked,
                stats: {
                  totalRuns,
                  topScore,
                  topRunner,
                  avgDistance,
                  totalTokens,
                },
              }),
            );
            return;
          }

          res.end(JSON.stringify({ success: true, entries: ranked.slice(0, 50) }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const sub = JSON.parse(body);

              // Admin passcode verification
              if (sub.action === 'verify-admin') {
                if (sub.key === ADMIN_SECRET) {
                  res.end(JSON.stringify({ success: true, valid: true }));
                } else {
                  res.statusCode = 401;
                  res.end(JSON.stringify({ success: false, reason: 'Invalid administrative passcode' }));
                }
                return;
              }

              const newEntry = {
                id: sub.deviceId || `dev-${Date.now()}`,
                name: sub.name || 'Runner',
                score: Math.floor(sub.score || 0),
                distance: Math.floor(sub.distance || 0),
                tokens: Math.floor(sub.tokens || 0),
                timestamp: Date.now(),
              };
              const existingIdx = devStore.findIndex((e) => e.id === newEntry.id);
              if (existingIdx >= 0) {
                if (newEntry.score > devStore[existingIdx].score) {
                  devStore[existingIdx] = newEntry;
                }
              } else {
                devStore.push(newEntry);
              }
              devStore.sort((a, b) => b.score - a.score);
              const rank = devStore.findIndex((e) => e.id === newEntry.id) + 1;
              res.end(JSON.stringify({ success: true, rank, entries: devStore.slice(0, 50) }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, reason: 'Invalid JSON' }));
            }
          });
          return;
        }

        if (req.method === 'DELETE') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', () => {
            let parsedBody: any = {};
            try {
              if (body) parsedBody = JSON.parse(body);
            } catch {
              /* ignore */
            }

            const isAuthorized =
              isAdmin || parsedBody.adminKey === ADMIN_SECRET || parsedBody.key === ADMIN_SECRET;
            if (!isAuthorized) {
              res.statusCode = 401;
              res.end(JSON.stringify({ success: false, reason: 'Unauthorized admin access' }));
              return;
            }

            const targetId = url.searchParams.get('id') || parsedBody.id;
            const purgeAll = url.searchParams.get('all') === 'true' || parsedBody.all === true;

            if (purgeAll) {
              devStore = [];
              res.end(JSON.stringify({ success: true, purged: true, entries: [] }));
              return;
            }

            if (!targetId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, reason: 'Missing id parameter' }));
              return;
            }

            const prevLen = devStore.length;
            devStore = devStore.filter((e) => e.id !== targetId);
            if (devStore.length === prevLen) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, reason: 'Entry not found' }));
              return;
            }

            const ranked = devStore.map((e, index) => ({ ...e, rank: index + 1 }));
            res.end(JSON.stringify({ success: true, deletedId: targetId, entries: ranked }));
          });
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

export default defineConfig({
  // Relative base so the production bundle can be served from any static path.
  base: './',
  plugins: [leaderboardDevPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
