import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

function leaderboardDevPlugin(): Plugin {
  let devStore = [
    { id: 'comm-1', name: 'வீரமணி (Veera)', score: 18450, distance: 1240, tokens: 185, timestamp: 1715000000000 },
    { id: 'comm-2', name: 'Delivery_Boy_1', score: 15200, distance: 1080, tokens: 142, timestamp: 1715050000000 },
    { id: 'comm-3', name: 'Chennai_Express', score: 13950, distance: 990, tokens: 135, timestamp: 1715100000000 },
    { id: 'comm-4', name: 'Delivery_Boy_2', score: 12100, distance: 880, tokens: 110, timestamp: 1715150000000 },
    { id: 'comm-5', name: 'Madurai_Veeran', score: 9800, distance: 740, tokens: 92, timestamp: 1715200000000 },
    { id: 'comm-6', name: 'Kovai_Rider', score: 8150, distance: 620, tokens: 78, timestamp: 1715250000000 },
    { id: 'comm-7', name: 'Santhai_Surfer', score: 6900, distance: 530, tokens: 64, timestamp: 1715300000000 },
    { id: 'comm-8', name: 'Tanjore_King', score: 5400, distance: 410, tokens: 52, timestamp: 1715350000000 },
    { id: 'comm-9', name: 'Auto_Annan', score: 4200, distance: 340, tokens: 38, timestamp: 1715400000000 },
    { id: 'comm-10', name: 'Tea_Kada_Boy', score: 3100, distance: 260, tokens: 25, timestamp: 1715450000000 },
  ];

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
