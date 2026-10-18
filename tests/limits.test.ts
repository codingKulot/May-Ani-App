import { afterAll, describe, expect, test } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { clientIp, dailyQuota, envCount, parseTrustProxy, phDay } from '../server/limits.mjs';
import { OFF, startServer, type Srv } from './support/server';

/**
 * Going online safely: the daily allowance for paid AI (server/limits.mjs), the caller's real address behind a proxy
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
  const limits = { guest: 2, guestPerIp: 3, account: 4, total: 6 };

  test('the day changes at midnight in the Philippines (UTC+8)', () => {
    expect(phDay(Date.parse('2026-10-18T15:59:59Z'))).toBe('2026-10-18');
    expect(phDay(Date.parse('2026-10-18T16:00:00Z'))).toBe('2026-10-19');
  });

  test('per guest phone, per address for all guests on it, per account, and in total', () => {
    const q = dailyQuota(limits);
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' })).toEqual({ ok: false, reason: 'device', limit: 2 });
    expect(q.take({ device: 'phone-b2', ip: '1.1.1.1' }).ok).toBe(true); // the third guest use on this address
    expect(q.take({ device: 'phone-c3', ip: '1.1.1.1' })).toEqual({ ok: false, reason: 'ip', limit: 3 });
    // an account has its own allowance, on any address
    for (let i = 0; i < 3; i++) expect(q.take({ userId: 'u1', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ userId: 'u1', ip: '2.2.2.2' })).toEqual({ ok: false, reason: 'total', limit: 6 });
  });

  test('a use that cost nothing is given back, once', () => {
    const q = dailyQuota(limits);
    const t = q.take({ device: '', ip: '1.1.1.1' });
    if (!t.ok) throw new Error('should be allowed');
    t.release();
    t.release();
    expect(q.take({ device: '', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ device: '', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ device: '', ip: '1.1.1.1' }).ok).toBe(false); // without a phone id, the address is the phone
  });

  test('everything starts again the next Philippine day', () => {
    let now = Date.parse('2026-10-18T15:00:00Z');
    const q = dailyQuota({ ...limits, guest: 1 }, () => now);
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' }).ok).toBe(true);
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' }).ok).toBe(false);
    now = Date.parse('2026-10-18T16:00:01Z');
    expect(q.take({ device: 'phone-a1', ip: '1.1.1.1' }).ok).toBe(true);
  });

  test('0 means none; numbers from .env fall back to the default when missing or wrong', () => {
    expect(dailyQuota({ ...limits, guest: 0 }).take({ device: 'phone-a1', ip: '1.1.1.1' })).toEqual({ ok: false, reason: 'device', limit: 0 });
    const env = { A: '7', B: '', C: 'ten', D: '-1', E: '2.5', F: '0' };
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => envCount(env, k, 5))).toEqual([7, 5, 5, 5, 5, 0, 5]);
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

const servers: Srv[] = [];
async function server(env: Record<string, string>) {
  const s = await startServer({ ...AI, ...env });
  servers.push(s);
  return s;
}

/** One call with the headers the app sends (phone id, login) and, for proxy tests, X-Forwarded-For. */
async function ask(s: Srv, path: string, body: unknown, h: { device?: string; token?: string; xff?: string } = {}) {
  const r = await fetch(s.url + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(h.device ? { 'x-device-id': h.device } : {}),
      ...(h.token ? { authorization: `Bearer ${h.token}` } : {}),
      ...(h.xff ? { 'x-forwarded-for': h.xff } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const CHECK = { kind: 'plant', description: 'yellow leaves with brown spots' };
const check = (s: Srv, h: Parameters<typeof ask>[3] = {}) => ask(s, '/api/ai/diagnose', CHECK, h);

const mongo = await MongoMemoryServer.create().catch((e: Error) => {
  console.warn(`\n[limits tests] SKIPPED the account allowance test: a test database could not start (${e.message}).\n`);
  return null;
});

afterAll(async () => {
  for (const s of servers) s.stop();
  fakeAnthropic.stop(true);
  fakeGemini.stop(true);
  await mongo?.stop();
});

describe('daily allowance on the real server', () => {
  test('a guest phone, then all guests on one address, run out with a clear message', async () => {
    const s = await server({ AI_DAILY_GUEST: '2', AI_DAILY_GUEST_PER_IP: '3' });
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200);
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200);
    const third = await check(s, { device: 'phone-aaaa1' });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('ai_quota');
    expect(third.body.error).toContain("This phone has used today's 2 free AI checks");
    expect(third.body.error).not.toContain('account'); // accounts are off on this server: nothing to sign up for
    expect((await check(s, { device: 'phone-bbbb2' })).status).toBe(200);
    const shared = await check(s, { device: 'phone-cccc3' });
    expect(shared.status).toBe(429);
    expect(shared.body.error).toContain('this internet connection');
    expect((await fetch(`${s.url}/api/health`).then((r) => r.json()) as any).daily).toEqual({ ai: { guest: 2 }, pictures: { guest: 100000 } });
  });

  test('the whole server stops at its daily total', async () => {
    const s = await server({ AI_DAILY_TOTAL: '1' });
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200);
    const r = await check(s, { device: 'phone-bbbb2' });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('ai_daily_cap');
    expect(r.body.error).toContain('midnight (Philippine time)');
  });

  test('a check that cost nothing (no AI credit) does not use up the allowance; a bad request is not counted', async () => {
    const s = await server({ AI_DAILY_GUEST: '1' });
    anthropic = () => Response.json({ type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low' } }, { status: 400 });
    try {
      expect((await check(s, { device: 'phone-aaaa1' })).body.code).toBe('ai_billing');
    } finally {
      anthropic = () => okAnswer();
    }
    expect((await ask(s, '/api/ai/diagnose', { kind: 'plant' }, { device: 'phone-aaaa1' })).status).toBe(400); // nothing to check
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200);
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(429);
  });

  test('AI pictures have their own allowance', async () => {
    const s = await server({ GEMINI_API_KEY: 'test-not-a-real-key', GEMINI_BASE_URL: `http://127.0.0.1:${fakeGemini.port}`, PICTURES_DAILY_GUEST: '1' });
    const picture = { prompt: 'A raised vegetable bed made of coco lumber on the open ground in this photo, realistic.', image: { mediaType: 'image/jpeg', data: `/9j/${'A'.repeat(400)}` } };
    expect((await ask(s, '/api/ai/render', picture, { device: 'phone-aaaa1' })).status).toBe(200);
    const r = await ask(s, '/api/ai/render', picture, { device: 'phone-aaaa1' });
    expect(r.status).toBe(429);
    expect(r.body.error).toContain('AI pictures');
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200); // photo checks are counted separately
  });

  test.skipIf(!mongo)('an account gets its own, bigger allowance', async () => {
    const s = await server({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: 'may_ani_limits_test', AI_DAILY_GUEST: '1', AI_DAILY_ACCOUNT: '2' });
    const signup = await ask(s, '/api/auth/signup', { name: 'Juan', email: 'juan.limits@example.com', password: 'Tatlong kalabaw sa bukid' });
    expect(signup.status).toBe(201);
    const token = signup.body.token as string;
    expect((await check(s, { device: 'phone-aaaa1' })).status).toBe(200);
    const guest = await check(s, { device: 'phone-aaaa1' });
    expect(guest.body.error).toContain('Create a free account in Settings to get 2 a day');
    expect((await check(s, { device: 'phone-aaaa1', token })).status).toBe(200);
    expect((await check(s, { device: 'phone-aaaa1', token })).status).toBe(200);
    const done = await check(s, { device: 'phone-aaaa1', token });
    expect(done.status).toBe(429);
    expect(done.body.error).toContain('You have used your 2 AI checks for today');
    expect((await check(s, { device: 'phone-aaaa1', token: 'not-a-real-login-token-at-all' })).status).toBe(429); // a wrong login counts as the guest
  }, 30_000);
});

describe('the caller\'s address on the real server', () => {
  test('without TRUST_PROXY, a made-up X-Forwarded-For does not get a fresh allowance', async () => {
    const s = await server({ AI_DAILY_GUEST_PER_IP: '1' });
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(200);
    expect((await check(s, { xff: '198.51.100.2' })).status).toBe(429);
  });

  test('with TRUST_PROXY=loopback, each user behind the proxy is counted on their own', async () => {
    const s = await server({ AI_DAILY_GUEST_PER_IP: '1', TRUST_PROXY: 'loopback' });
    expect(s.log()).toContain('proxy: trusted (127.0.0.1, ::1)');
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(200);
    expect((await check(s, { xff: '198.51.100.2' })).status).toBe(200);
    expect((await check(s, { xff: '198.51.100.1' })).status).toBe(429);
  });
});

describe('security headers', () => {
  const NEEDED = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];

  test('on API answers, files, refusals and CORS checks; no HSTS on plain http', async () => {
    const s = await server({});
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
    expect(answers[3].headers.get('access-control-allow-headers')).toContain('X-Device-Id');
  });

  test('a real website with https gets HSTS and upgrades plain http', async () => {
    const s = await server({ APP_URL: 'https://may-ani.example', MONGODB_URI: OFF });
    const r = await fetch(`${s.url}/api/health`);
    expect(r.headers.get('strict-transport-security')).toBe('max-age=15552000');
    expect(r.headers.get('content-security-policy')).toContain('upgrade-insecure-requests');
    expect(s.log()).toContain('Tip: set ALLOWED_ORIGIN=https://may-ani.example');
  });
});
