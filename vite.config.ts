import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

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

        if (req.method === 'GET') {
          const ranked = devStore.map((e, index) => ({ ...e, rank: index + 1 }));
          res.end(JSON.stringify({ success: true, entries: ranked }));
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
