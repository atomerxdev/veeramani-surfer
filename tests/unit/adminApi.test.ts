import { describe, expect, it } from 'vitest';
import handler from '../../api/leaderboard';

function createMockReq(options: {
  method?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
}) {
  return {
    method: options.method ?? 'GET',
    query: options.query ?? {},
    headers: options.headers ?? {},
    body: options.body ?? {},
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

describe('Admin API: api/leaderboard', () => {
  it('rejects verify-admin with incorrect passcode', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { action: 'verify-admin', key: 'wrong-passcode' },
    });
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toContain('passcode');
  });

  it('accepts verify-admin with correct default passcode', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { action: 'verify-admin', key: 'veeramani-admin-2026' },
    });
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.valid).toBe(true);
  });

  it('rejects DELETE requests without admin authorization header', async () => {
    const req = createMockReq({
      method: 'DELETE',
      query: { id: 'some-id' },
    });
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('submits a score, fetches telemetry stats as admin, and deletes it as admin', async () => {
    // 1. Submit score
    const subReq = createMockReq({
      method: 'POST',
      body: {
        deviceId: 'test-admin-device-99',
        name: 'AdminTestRunner',
        score: 5000,
        distance: 600,
        tokens: 80,
        runTimeSeconds: 40,
      },
    });
    const subRes = createMockRes();
    await handler(subReq, subRes);
    expect(subRes.statusCode).toBe(200);
    expect(subRes.body.success).toBe(true);

    // 2. Query as Admin with x-admin-key
    const getReq = createMockReq({
      method: 'GET',
      headers: { 'x-admin-key': 'veeramani-admin-2026' },
    });
    const getRes = createMockRes();
    await handler(getReq, getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.isAdmin).toBe(true);
    expect(getRes.body.stats).toBeDefined();
    expect(getRes.body.stats.totalRuns).toBeGreaterThanOrEqual(1);

    const found = getRes.body.entries.find((e: any) => e.id === 'test-admin-device-99');
    expect(found).toBeDefined();
    expect(found.name).toBe('AdminTestRunner');

    // 3. Delete specific entry as Admin
    const delReq = createMockReq({
      method: 'DELETE',
      headers: { 'x-admin-key': 'veeramani-admin-2026' },
      query: { id: 'test-admin-device-99' },
    });
    const delRes = createMockRes();
    await handler(delReq, delRes);
    expect(delRes.statusCode).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(delRes.body.deletedId).toBe('test-admin-device-99');

    // 4. Verify entry is gone
    const checkReq = createMockReq({
      method: 'GET',
      headers: { 'x-admin-key': 'veeramani-admin-2026' },
    });
    const checkRes = createMockRes();
    await handler(checkReq, checkRes);
    const afterDelete = checkRes.body.entries.find((e: any) => e.id === 'test-admin-device-99');
    expect(afterDelete).toBeUndefined();
  });

  it('purges all entries when all=true is specified with admin key', async () => {
    // Submit an entry
    const subReq = createMockReq({
      method: 'POST',
      body: {
        deviceId: 'purge-test-dev',
        name: 'PurgeTarget',
        score: 3000,
        distance: 400,
        tokens: 40,
        runTimeSeconds: 25,
      },
    });
    await handler(subReq, createMockRes());

    // Purge all
    const purgeReq = createMockReq({
      method: 'DELETE',
      headers: { 'x-admin-key': 'veeramani-admin-2026' },
      query: { all: 'true' },
    });
    const purgeRes = createMockRes();
    await handler(purgeReq, purgeRes);

    expect(purgeRes.statusCode).toBe(200);
    expect(purgeRes.body.purged).toBe(true);
    expect(purgeRes.body.entries).toHaveLength(0);
  });
});
