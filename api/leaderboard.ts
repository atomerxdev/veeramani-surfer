/**
 * Vercel Serverless Function: /api/leaderboard
 *
 * Provides a public online leaderboard API without authentication.
 * Handles GET (fetch rankings) and POST (submit score with anti-cheat validation).
 * Automatically interfaces with Upstash Redis / Vercel KV if environment variables
 * are provided, with an in-memory/edge fallback.
 */

interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  distance: number;
  tokens: number;
  timestamp: number;
  rank?: number;
}

interface ScoreSubmission {
  deviceId: string;
  name: string;
  score: number;
  distance: number;
  tokens: number;
  runTimeSeconds: number;
  signature?: string;
}

const DEFAULT_COMMUNITY_SCORES: LeaderboardEntry[] = [
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

// In-memory global store for edge runtime
let globalLeaderboardStore: LeaderboardEntry[] = [...DEFAULT_COMMUNITY_SCORES];

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Runner';
  let clean = raw.replace(/<[^>]*>/g, '').replace(/[<>'"&\\/]/g, '').trim();
  clean = clean.replace(/[^\w\s\-\u0B80-\u0BFF]/g, '').trim();
  clean = clean.replace(/\s+/g, ' ');
  if (clean.length < 2) return clean.length > 0 ? `${clean}_runner` : 'Runner';
  if (clean.length > 15) clean = clean.slice(0, 15).trim();
  return clean || 'Runner';
}

function validatePayload(sub: ScoreSubmission): { valid: boolean; reason?: string } {
  const { score, distance, tokens, runTimeSeconds } = sub;
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(distance) ||
    !Number.isFinite(tokens) ||
    !Number.isFinite(runTimeSeconds)
  ) {
    return { valid: false, reason: 'Invalid numeric fields' };
  }
  if (score < 0 || distance < 0 || tokens < 0) {
    return { valid: false, reason: 'Negative score/distance' };
  }
  if (runTimeSeconds > 2) {
    const avgSpeed = distance / runTimeSeconds;
    if (avgSpeed > 38) {
      return { valid: false, reason: 'Speed exceeds maximum allowed physics threshold' };
    }
  }
  const maxPossible = Math.ceil((distance * 1 + tokens * 10) * 4 * 1.08) + 10;
  if (score > maxPossible && score > 50) {
    return { valid: false, reason: 'Score exceeds theoretical formula maximum' };
  }
  return { valid: true };
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check for Upstash / Vercel KV environment variables
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (req.method === 'GET') {
    if (kvUrl && kvToken) {
      try {
        const response = await fetch(`${kvUrl}/get/santhai_leaderboard`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            return res.status(200).json({ success: true, entries: parsed });
          }
        }
      } catch {
        /* fallback to in-memory */
      }
    }

    const ranked = globalLeaderboardStore.map((e, index) => ({
      ...e,
      rank: index + 1,
    }));
    return res.status(200).json({ success: true, entries: ranked.slice(0, 50) });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, reason: 'Invalid payload' });
    }

    const sub = body as ScoreSubmission;
    const validation = validatePayload(sub);
    if (!validation.valid) {
      return res.status(400).json({ success: false, reason: validation.reason });
    }

    const cleanName = sanitizeName(sub.name);
    const newEntry: LeaderboardEntry = {
      id: sub.deviceId || `dev-${Date.now()}`,
      name: cleanName,
      score: Math.floor(sub.score),
      distance: Math.floor(sub.distance),
      tokens: Math.floor(sub.tokens),
      timestamp: Date.now(),
    };

    let entries = [...globalLeaderboardStore];

    // If Upstash KV configured, fetch live state first
    if (kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/santhai_leaderboard`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (kvRes.ok) {
          const kvData = await kvRes.json();
          if (kvData.result) {
            entries = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
          }
        }
      } catch {
        /* fallback */
      }
    }

    // Upsert by deviceId
    const existingIndex = entries.findIndex((e) => e.id === newEntry.id);
    if (existingIndex >= 0) {
      if (newEntry.score > entries[existingIndex].score) {
        entries[existingIndex] = newEntry;
      }
    } else {
      entries.push(newEntry);
    }

    entries.sort((a, b) => b.score - a.score);
    const topEntries = entries.slice(0, 50);
    globalLeaderboardStore = topEntries;

    // Persist to Upstash KV if configured
    if (kvUrl && kvToken) {
      try {
        await fetch(`${kvUrl}/set/santhai_leaderboard`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kvToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(topEntries),
        });
      } catch {
        /* fallback */
      }
    }

    const rank = topEntries.findIndex((e) => e.id === newEntry.id) + 1;
    return res.status(200).json({
      success: true,
      rank: rank > 0 ? rank : undefined,
      entries: topEntries,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
