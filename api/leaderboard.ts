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

// In-memory global store for edge runtime
let globalLeaderboardStore: LeaderboardEntry[] = [];

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

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'veeramani-admin-2026';

function checkAdminAuth(req: any, body?: any): boolean {
  const headerKey = req.headers?.['x-admin-key'] || req.headers?.['X-Admin-Key'];
  if (headerKey && headerKey === ADMIN_SECRET) return true;

  const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    if (authHeader.slice(7).trim() === ADMIN_SECRET) return true;
  }

  if (req.query?.adminKey === ADMIN_SECRET || req.query?.key === ADMIN_SECRET) {
    return true;
  }

  if (body?.adminKey === ADMIN_SECRET || body?.key === ADMIN_SECRET) {
    return true;
  }

  return false;
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check for Upstash / Vercel KV environment variables
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  async function fetchLiveEntries(): Promise<LeaderboardEntry[]> {
    if (kvUrl && kvToken) {
      try {
        const response = await fetch(`${kvUrl}/get/santhai_leaderboard`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            if (Array.isArray(parsed)) return parsed;
          }
        }
      } catch {
        /* fallback to in-memory */
      }
    }
    return [...globalLeaderboardStore];
  }

  async function persistLiveEntries(entries: LeaderboardEntry[]): Promise<void> {
    globalLeaderboardStore = entries;
    if (kvUrl && kvToken) {
      try {
        await fetch(`${kvUrl}/set/santhai_leaderboard`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kvToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(entries),
        });
      } catch {
        /* fallback */
      }
    }
  }

  if (req.method === 'GET') {
    const entries = await fetchLiveEntries();
    const ranked = entries.map((e, index) => ({
      ...e,
      rank: index + 1,
    }));

    const isAdmin = checkAdminAuth(req);
    if (isAdmin) {
      const totalRuns = ranked.length;
      const topScore = ranked[0]?.score ?? 0;
      const topRunner = ranked[0]?.name ?? 'None';
      const avgDistance = totalRuns > 0 ? Math.round(ranked.reduce((s, e) => s + (e.distance || 0), 0) / totalRuns) : 0;
      const totalTokens = ranked.reduce((s, e) => s + (e.tokens || 0), 0);

      return res.status(200).json({
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
      });
    }

    return res.status(200).json({ success: true, entries: ranked.slice(0, 50) });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, reason: 'Invalid payload' });
    }

    // Verify admin passcode action
    if (body.action === 'verify-admin') {
      if (body.key === ADMIN_SECRET) {
        return res.status(200).json({ success: true, valid: true });
      }
      return res.status(401).json({ success: false, reason: 'Invalid administrative passcode' });
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

    let entries = await fetchLiveEntries();

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
    await persistLiveEntries(topEntries);

    const rank = topEntries.findIndex((e) => e.id === newEntry.id) + 1;
    return res.status(200).json({
      success: true,
      rank: rank > 0 ? rank : undefined,
      entries: topEntries,
    });
  }

  if (req.method === 'DELETE') {
    let body: any = {};
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    if (!checkAdminAuth(req, body)) {
      return res.status(401).json({ success: false, reason: 'Unauthorized admin access' });
    }

    const targetId = req.query?.id || body?.id;
    const purgeAll = req.query?.all === 'true' || body?.all === true;

    if (purgeAll) {
      await persistLiveEntries([]);
      return res.status(200).json({ success: true, purged: true, entries: [] });
    }

    if (!targetId || typeof targetId !== 'string') {
      return res.status(400).json({ success: false, reason: 'Missing entry id to delete' });
    }

    let entries = await fetchLiveEntries();
    const prevCount = entries.length;
    entries = entries.filter((e) => e.id !== targetId);

    if (entries.length === prevCount) {
      return res.status(404).json({ success: false, reason: 'Entry not found' });
    }

    await persistLiveEntries(entries);
    const ranked = entries.map((e, index) => ({ ...e, rank: index + 1 }));

    return res.status(200).json({
      success: true,
      deletedId: targetId,
      entries: ranked,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
