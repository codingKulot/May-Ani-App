import { afterAll, describe, expect, test } from 'bun:test';
import { clientIp, dailyQuota, envCount, memoryCounters, parseTrustProxy, phDay } from '../server/limits.mjs';
import { OFF, signUpUser, startMongo, startServer, type Srv } from './support/server';

/**
 * Going online safely: the daily allowance for paid AI (server/limits.mjs, logged-in accounts only), the caller's real address behind a proxy
 * (TRUST_PROXY), and the security headers on every answer. AI calls go to FAKE Anthropic and Gemini servers on 127.0.0.1,
 * so no real key or credit is used; the account tests use a throwaway MongoDB.
 */

declare const Bun: {
  serve(o: { port: number; hostname: string; fetch(req: Request): Response | Promise<Response> }): { port: number; stop(force?: boolean): void };
};

// ------------------------------------------------------------------ pure parts
const req = (remoteAddress: string, xff?: string) => ({ socket: { remoteAddress }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } });

describe('the caller\'s address (TRUST_PROXY)', () => {
  test('off by default: a made-up X-Forwarded-For is ignored', () => {
    expect(parseTrustProxy('')).toEqual({ mode: 'off' });
    expect(parseTrustProxy('off')).toEqual({ mode: 'off' });
    expect(clientIp(req('203.0.113.9', '1.1.1.1'), parseTrustProxy(''))).toBe('203.0.113.9');
    expect(clientIp(req('::ffff:203.0.113.9'), parseTrustProxy(''))).toBe('203.0.113.9');
  });

  test('loopback: a proxy on this computer passes on the real address', () => {
    const t = parseTrustProxy('loopback');
    expect(clientIp(req('127.0.0.1', '198.51.100.7'), t)).toBe('198.51.100.7');
    expect(clientIp(req('::1', '198.51.100.7'), t)).toBe('198.51.100.7');
    // the left part of the header can be typed by anyone: the right-most address that is not our proxy wins
    expect(clientIp(req('127.0.0.1', '6.6.6.6, 198.51.100.7'), t)).toBe('198.51.100.7');
    // a request that did not come through the proxy keeps its own address, whatever the header says
    expect(clientIp(req('203.0.113.9', '6.6.6.6'), t)).toBe('203.0.113.9');
    expect(clientIp(req('127.0.0.1'), t)).toBe('127.0.0.1');
  });

  test('a list of proxy addresses, and a number of proxies in front', () => {
    const list = parseTrustProxy('10.0.0.5, loopback');
    expect(clientIp(req('10.0.0.5', '198.51.100.7, 127.0.0.1'), list)).toBe('198.51.100.7');
    expect(clientIp(req('10.9.9.9', '1.1.1.1'), parseTrustProxy('2'))).toBe('10.9.9.9');
    expect(clientIp(req('10.9.9.9', '6.6.6.6, 198.51.100.7, 10.0.0.1'), parseTrustProxy('2'))).toBe('198.51.100.7');
    expect(clientIp(req('10.9.9.9', '6.6.6.6, 198.51.100.7'), parseTrustProxy('1'))).toBe('198.51.100.7');
  });
});

describe('daily allowance', () => {
  const limits = { account: 2, total: 3 };
  const ok = async (p: Promise<{ ok: boolean }>) => (await p).ok;

  test('the day changes at midnight in the Philippines (UTC+8)', () => {
    expect(phDay(Date.parse('2026-10-18T15:59:59Z'))).toBe('2026-10-18');
    expect(phDay(Date.parse('2026-10-18T16:00:00Z'))).toBe('2026-10-19');
  });

  test('per account, and in total for the whole server', async () => {
    const q = dailyQuota(limits);
    expect(await ok(q.take('u1'))).toBe(true);
    expect(await ok(q.take('u1'))).toBe(true);
    expect(await q.take('u1')).toEqual({ ok: false, reason: 'account', limit: 2 });
    expect(await ok(q.take('u2'))).toBe(true);
    expect(await q.take('u3')).toEqual({ ok: false, reason: 'total', limit: 3 });
  });

  test('a use that cost nothing is given back, once', async () => {
    const q = dailyQuota(limits);
    const t = await q.take('u1');
    if (!t.ok) throw new Error('should be allowed');
    await t.release();
    await t.release();
    expect(await ok(q.take('u1'))).toBe(true);
    expect(await ok(q.take('u1'))).toBe(true);
    expect(await ok(q.take('u1'))).toBe(false);
  });

  test('a refused use does not count: the next account still gets the rest of the total', async () => {
    const q = dailyQuota({ account: 1, total: 2 });
    expect(await ok(q.take('u1'))).toBe(true);
    for (let i = 0; i < 5; i++) expect(await ok(q.take('u1'))).toBe(false);
    expect(await ok(q.take('u2'))).toBe(true);
  });

  test('two uses at the same moment never both get the last one', async () => {
    const q = dailyQuota({ account: 10, total: 3 });
    const all = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((u) => q.take(u)));
    expect(all.filter((t) => t.ok).length).toBe(3);
  });

  test('everything starts again the next Philippine day', async () => {
    let now = Date.parse('2026-10-18T15:00:00Z');
    const clock = () => now;
    const q = dailyQuota({ account: 1, total: 10 }, { counters: memoryCounters(clock), now: clock });
    expect(await ok(q.take('u1'))).toBe(true);
    expect(await ok(q.take('u1'))).toBe(false);
    now = Date.parse('2026-10-18T16:00:01Z');
    expect(await ok(q.take('u1'))).toBe(true);
  });

  test('0 means none; numbers from .env fall back to the default when missing or wrong', async () => {
    expect(await dailyQuota({ account: 0, total: 10 }).take('u1')).toEqual({ ok: false, reason: 'account', limit: 0 });
    const env = { A: '7', B: '', C: 'ten', D: '-1', E: '2.5', F: '0' };
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => envCount(env, k, 5))).toEqual([7, 5, 5, 5, 5, 0, 5]);
  });
});

describe('counters with an end time', () => {
  test('a plain counter ends a fixed time after its first count; a sliding one after its latest', async () => {
    let now = 0;
    const c = memoryCounters(() => now);
    expect(await c.add('plain', { ttlMs: 100 })).toBe(1);
    expect(await c.add('slide', { ttlMs: 100, sliding: true })).toBe(1);
    now = 80;
    expect(await c.add('plain', { ttlMs: 100 })).toBe(2);
    expect(await c.add('slide', { ttlMs: 100, sliding: true })).toBe(2);
    now = 150; // the plain one ended at 100, the sliding one ends at 180
    expect(await c.count('plain')).toBe(0);
    expect(await c.count('slide')).toBe(2);
    expect(await c.add('plain', { ttlMs: 100 })).toBe(1);
    await c.undo('slide');
    expect(await c.count('slide')).toBe(1);
    await c.clear('slide');
    expect(await c.count('slide')).toBe(0);
    await c.undo('slide'); // never below 0
    expect(await c.count('slide')).toBe(0);
  });
});

// ------------------------------------------------------------------ the real server with fake AI services
const KEY = 'sk-ant-test-not-a-real-key';
let anthropic: () => Response = () => okAnswer();
function okAnswer() {
  return Response.json({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'text', text: JSON.stringify({ subject: 'plant', seen: 'A leaf', results: [] }) }],
  });
}
const fakeAnthropic = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => anthropic() });
const fakeGemini = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  fetch: () => Response.json({ outputs: [{ type: 'image', mime_type: 'image/png', data: `iVBOR${'A'.repeat(200)}` }] }),
});
const AI = { ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeAnthropic.port}`, AI_RATE_PER_MIN: '1000' };

const mongo = await startMongo('limits tests');
const servers: Srv[] = [];
/** The real server with fake AI services and the throwaway MongoDB (each test gets its own database name). */
let dbs = 0;
async function server(env: Record<string, string>) {
  const s = await startServer({ ...AI, ...(mongo ? { MONGODB_URI: mongo.getUri(), MONGODB_DB: `may_ani_limits_${++dbs}` } : {}), ...env });
  servers.push(s);
  return s;
}

/** One call with the login and, for proxy tests, X-Forwarded-For. */
async function ask(s: Srv, path: string, body: unknown, h: { token?: string; xff?: string } = {}) {
  const r = await fetch(s.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(h.token ? { authorization: `Bearer ${h.token}` } : {}), ...(h.xff ? { 'x-forwarded-for': h.xff } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const CHECK = { kind: 'plant', description: 'yellow leaves with brown spots' };
const check = (s: Srv, h: Parameters<typeof ask>[3] = {}) => ask(s, '/api/ai/diagnose', CHECK, h);
const PICTURE = { prompt: 'A raised vegetable bed made of coco lumber on the open ground in this photo, realistic.', image: { mediaType: 'image/jpeg', data: `/9j/${'A'.repeat(400)}` } };

afterAll(async () => {
  for (const s of servers) s.stop();
  fakeAnthropic.stop(true);
  fakeGemini.stop(true);
  await mongo?.stop();
});

describe('AI needs a login', () => {
  test('without accounts on the server, nobody can use AI', async () => {
    const s = await startServer({ ...AI });
    servers.push(s);
    const r = await check(s);
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('accounts_off');
  });

  test.skipIf(!mongo)('without a login, or with a wrong one, AI and pictures answer 401', async () => {
    const s = await server({ GEMINI_API_KEY: 'test-not-a-real-key', GEMINI_BASE_URL: `http://127.0.0.1:${fakeGemini.port}` });
    for (const token of [undefined, 'not-a-real-login-token-at-all']) {
      const r = await check(s, { token });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('login');
      expect((await ask(s, '/api/ai/render', PICTURE, { token })).status).toBe(401);
    }
  }, 30_000);
});

describe.skipIf(!mongo)('daily allowance on the real server', () => {
  test('each account runs out on its own, with a clear message', async () => {
    const s = await server({ AI_DAILY_ACCOUNT: '2' });
    const juan = await signUpUser(s, 'Juan');
    const ana = await signUpUser(s, 'Ana');
    expect((await check(s, { token: juan.token })).status).toBe(200);
    expect((await check(s, { token: juan.token })).status).toBe(200);
    const third = await check(s, { token: juan.token });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('ai_quota');
    expect(third.body.error).toContain('You have used your 2 AI checks for today');
    expect((await check(s, { token: ana.token })).status).toBe(200);
    expect((await fetch(`${s.url}/api/health`).then((r) => r.json()) as any).daily).toEqual({ ai: 2, pictures: 100000 });
  }, 30_000);

  test('the whole server stops at its daily total', async () => {
    const s = await server({ AI_DAILY_TOTAL: '1' });
    expect((await check(s, { token: (await signUpUser(s)).token })).status).toBe(200);
    const r = await check(s, { token: (await signUpUser(s)).token });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('ai_daily_cap');
    expect(r.body.error).toContain('midnight (Philippine time)');
  }, 30_000);

  test('a check that cost nothing (no AI credit) does not use up the allowance; a bad request is not counted', async () => {
    const s = await server({ AI_DAILY_ACCOUNT: '1' });
    const { token } = await signUpUser(s);
    anthropic = () => Response.json({ type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low' } }, { status: 400 });
    try {
      expect((await check(s, { token })).body.code).toBe('ai_billing');
    } finally {
      anthropic = () => okAnswer();
    }
    expect((await ask(s, '/api/ai/diagnose', { kind: 'plant' }, { token })).status).toBe(400); // nothing to check
    expect((await check(s, { token })).status).toBe(200);
    expect((await check(s, { token })).status).toBe(429);
  }, 30_000);

  test('AI pictures have their own allowance', async () => {
    const s = await server({ GEMINI_API_KEY: 'test-not-a-real-key', GEMINI_BASE_URL: `http://127.0.0.1:${fakeGemini.port}`, PICTURES_DAILY_ACCOUNT: '1' });
    const { token } = await signUpUser(s);
    expect((await ask(s, '/api/ai/render', PICTURE, { token })).status).toBe(200);
    const r = await ask(s, '/api/ai/render', PICTURE, { token });
    expect(r.status).toBe(429);
    expect(r.body.error).toContain('AI pictures');
    expect((await check(s, { token })).status).toBe(200); // photo checks are counted separately
  }, 30_000);
});

describe('the caller\'s address on the real server', () => {
  // Rate limits count per address. With AI_RATE_PER_MIN=1 a second call from the same address is refused (429) before the
  // login is even checked; from another address it reaches the login check (503 here, as accounts are off).
  test('without TRUST_PROXY, a made-up X-Forwarded-For does not get a fresh limit', async () => {
    const s = await startServer({ ...AI, AI_RATE_PER_MIN: '1' });
    servers.push(s);
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(503);
    expect((await check(s, { xff: '198.51.100.2' })).status).toBe(429);
  });

  test('with TRUST_PROXY=loopback, each user behind the proxy is counted on their own', async () => {
    const s = await startServer({ ...AI, AI_RATE_PER_MIN: '1', TRUST_PROXY: 'loopback' });
    servers.push(s);
    expect(s.log()).toContain('proxy: trusted (127.0.0.1, ::1)');
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(503);
    expect((await check(s, { xff: '198.51.100.2' })).status).toBe(503);
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(429);
  });
});

describe('security headers', () => {
  const NEEDED = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];

  test('on API answers, files, refusals and CORS checks; no HSTS on plain http', async () => {
    const s = await startServer({});
    servers.push(s);
    const answers = [
      await fetch(`${s.url}/api/health`),
      await fetch(`${s.url}/..%2F.env`), // refused (403)
      await fetch(`${s.url}/api/nothing-here`), // 404
      await fetch(`${s.url}/api/ai/diagnose`, { method: 'OPTIONS' }),
    ];
    for (const r of answers) {
      for (const h of NEEDED) expect({ url: r.url, h, has: r.headers.has(h) }).toEqual({ url: r.url, h, has: true });
      expect(r.headers.has('strict-transport-security')).toBe(false);
    }
    const csp = answers[0].headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(answers[0].headers.get('x-content-type-options')).toBe('nosniff');
    expect(answers[3].headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  test('a real website with https gets HSTS and upgrades plain http', async () => {
    const s = await startServer({ APP_URL: 'https://may-ani.example', MONGODB_URI: OFF });
    servers.push(s);
    const r = await fetch(`${s.url}/api/health`);
    expect(r.headers.get('strict-transport-security')).toBe('max-age=15552000');
    expect(r.headers.get('content-security-policy')).toContain('upgrade-insecure-requests');
    expect(s.log()).toContain('Tip: set ALLOWED_ORIGIN=https://may-ani.example');
  });
});
