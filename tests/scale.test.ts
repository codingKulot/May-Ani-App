import { afterAll, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createApp, type Log } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { call, signUpUser, sleep, startMongo, startServer, type Srv } from './support/server';

/**
 * Ready to grow (October 2026 architecture review): several copies of the server can run side by side on one MongoDB, because
 * everything they must agree on is in the database: chat, stream tickets, the wrong-password lockout and the daily AI
 * allowance (which also survives a restart). Plus the old chat file moved into MongoDB once, a clean stop, health checks,
 * and compressed, well-cached app files. Everything runs on a throwaway MongoDB and fake AI servers on 127.0.0.1.
 */

declare const Bun: {
  serve(o: { port: number; hostname: string; fetch(req: Request): Response | Promise<Response> }): { port: number; stop(force?: boolean): void };
};

const mongo = await startMongo('scale tests');
const servers: Srv[] = [];
const temp: string[] = [];
let aiDelayMs = 0;
const fakeAnthropic = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  fetch: async () => {
    if (aiDelayMs) await sleep(aiDelayMs);
    return Response.json({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'text', text: JSON.stringify({ subject: 'plant', seen: 'A leaf', results: [] }) }],
    });
  },
});
const AI = { ANTHROPIC_API_KEY: 'sk-ant-test-not-a-real-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeAnthropic.port}`, AI_RATE_PER_MIN: '1000' };
const CHECK = { kind: 'plant', description: 'yellow leaves with brown spots' };

afterAll(async () => {
  for (const s of servers) s.stop();
  fakeAnthropic.stop(true);
  await mongo?.stop();
  for (const d of temp) rmSync(d, { recursive: true, force: true });
});

let dbs = 0;
/** Two (or more) copies of the real server on the same throwaway database. */
async function copies(n: number, env: Record<string, string> = {}, dataDir?: string) {
  const db = `may_ani_scale_${++dbs}`;
  const out: Srv[] = [];
  for (let i = 0; i < n; i++) out.push(await another(db, env, dataDir));
  return { db, list: out };
}
async function another(db: string, env: Record<string, string> = {}, dataDir?: string) {
  const s = await startServer({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: db, ...env }, dataDir);
  servers.push(s);
  return s;
}

/** Reads a live stream until `want` shows up, the stream ends, or a few seconds pass. */
async function readStream(url: string, want: string, ms = 6000) {
  const ctl = new AbortController();
  const r = await fetch(url, { signal: ctl.signal });
  if (r.status !== 200) return { status: r.status, text: '', ended: true };
  const reader = r.body!.getReader();
  let text = '';
  let ended = false;
  const until = Date.now() + ms;
  while (!text.includes(want) && Date.now() < until) {
    const next = await Promise.race([reader.read(), sleep(until - Date.now()).then(() => null)]);
    if (!next) break;
    if (next.done) { ended = true; break; }
    text += new TextDecoder().decode(next.value);
  }
  ctl.abort();
  return { status: 200, text, ended };
}

const ticketUrl = async (srv: Srv, token: string) =>
  `${srv.url}/api/chat/stream?ticket=${encodeURIComponent((await call(srv, 'POST', '/api/chat/ticket', undefined, token)).body.ticket)}`;

// ------------------------------------------------------------------ several copies of the server
describe.skipIf(!mongo)('two copies of the server on one database', () => {
  test('a message sent through one copy arrives live on a stream opened on the other; a ticket works once, on any copy', async () => {
    const { list: [a, b] } = await copies(2);
    const pedro = await signUpUser(a, 'Pedro');
    const rosa = await signUpUser(a, 'Rosa');
    await call(a, 'POST', '/api/chat/register', { blurb: 'Tagum' }, pedro.token);
    const rosaId = (await call(b, 'POST', '/api/chat/register', { blurb: 'Davao' }, rosa.token)).body.id;

    const { ticket } = (await call(a, 'POST', '/api/chat/ticket', undefined, rosa.token)).body;
    const onB = `${b.url}/api/chat/stream?ticket=${encodeURIComponent(ticket)}`;
    const live = readStream(onB, 'Naa pa moy talong?');
    await sleep(300);
    expect((await call(a, 'POST', '/api/chat/send', { to: rosaId, text: 'Naa pa moy talong?' }, pedro.token)).status).toBe(200);
    const got = await live;
    expect(got.status).toBe(200);
    expect(got.text).toContain('event: message');
    expect(got.text).toContain('Naa pa moy talong?');
    expect((await fetch(`${a.url}/api/chat/stream?ticket=${encodeURIComponent(ticket)}`)).status).toBe(401); // used up on B

    // both copies show the same conversation
    for (const s of [a, b]) {
      const texts = (await call(s, 'GET', '/api/chat/history', undefined, rosa.token)).body.messages.map((m: { text: string }) => m.text);
      expect(texts).toEqual(['Naa pa moy talong?']);
    }
  }, 60_000);

  test('a message is never delivered twice when sender and receiver use the same copy', async () => {
    const { list: [a] } = await copies(1);
    const ana = await signUpUser(a, 'Ana');
    const ben = await signUpUser(a, 'Ben');
    await call(a, 'POST', '/api/chat/register', {}, ana.token);
    const benId = (await call(a, 'POST', '/api/chat/register', {}, ben.token)).body.id;
    const live = readStream(await ticketUrl(a, ben.token), 'never-there', 4500); // read for a while: the check runs twice
    await sleep(300);
    await call(a, 'POST', '/api/chat/send', { to: benId, text: 'Isang beses lang' }, ana.token);
    const got = await live;
    expect(got.text.split('Isang beses lang').length - 1).toBe(1);
  }, 60_000);

  test('wrong passwords on different copies add up to one lockout', async () => {
    const { list: [a, b] } = await copies(2);
    const email = `locked.${Date.now()}@example.com`;
    expect((await call(a, 'POST', '/api/auth/signup', { name: 'Lito', email, password: 'Tatlong kalabaw sa bukid' })).status).toBe(201);
    for (let i = 0; i < 5; i++) {
      const s = i % 2 ? b : a;
      expect((await call(s, 'POST', '/api/auth/login', { email, password: `Wrong password ${i}` })).status).toBe(401);
    }
    for (const s of [a, b]) {
      const r = await call(s, 'POST', '/api/auth/login', { email, password: 'Tatlong kalabaw sa bukid' });
      expect(r.status).toBe(429);
      expect(r.body.error).toContain('15 minutes');
    }
  }, 60_000);

  test('the daily AI allowance is shared by every copy and survives a restart', async () => {
    const env = { ...AI, AI_DAILY_ACCOUNT: '2' };
    const { db, list: [a, b] } = await copies(2, env);
    const { token } = await signUpUser(a);
    expect((await call(a, 'POST', '/api/ai/diagnose', CHECK, token)).status).toBe(200);
    expect((await call(b, 'POST', '/api/ai/diagnose', CHECK, token)).status).toBe(200);
    expect((await call(a, 'POST', '/api/ai/diagnose', CHECK, token)).body.code).toBe('ai_quota');
    a.stop();
    b.stop();
    const again = await another(db, env);
    const r = await call(again, 'POST', '/api/ai/diagnose', CHECK, token);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('ai_quota');
  }, 60_000);
});

// ------------------------------------------------------------------ the chat file from before MongoDB
describe.skipIf(!mongo)('the old chat file', () => {
  test('accounts and their messages move into MongoDB once; guests stay out; the file is kept under a new name', async () => {
    const first = await copies(1);
    const [a] = first.list;
    const maria = await signUpUser(a, 'Maria');
    const ana = await signUpUser(a, 'Ana');
    const dir = mkdtempSync(join(tmpdir(), 'may-ani-import-'));
    temp.push(dir);
    const m = `acct-${maria.id}`;
    const n = `acct-${ana.id}`;
    writeFileSync(join(dir, 'data.json'), JSON.stringify({
      users: {
        [m]: { id: m, name: 'Maria', role: 'farmer', blurb: 'Tagum', createdAt: '2026-10-18T01:00:00.000Z' },
        [n]: { id: n, name: 'Ana', role: 'buyer', blurb: '', createdAt: '2026-10-18T01:00:00.000Z' },
        'phone-old-guest': { id: 'phone-old-guest', name: 'Old Guest', role: 'farmer', blurb: '', token: 'x'.repeat(48) },
      },
      messages: [
        { id: 'a1b2c3d4e5f60708', from: n, to: m, text: 'Lumang mensahe', at: '2026-10-18T02:00:00.000Z' },
        { id: 'a1b2c3d4e5f60709', from: 'phone-old-guest', to: m, text: 'Buy my fertilizer', at: '2026-10-18T03:00:00.000Z' },
      ],
    }));

    const waitForImport = async (count: number) => {
      for (let i = 0; i < 100 && readdirSync(dir).filter((f) => f.startsWith('data.json.imported-')).length < count; i++) await sleep(100);
      return readdirSync(dir).filter((f) => f.startsWith('data.json.imported-'));
    };
    const c = await another(first.db, {}, dir);
    const imported = await waitForImport(1);
    expect(imported.length).toBe(1);
    expect(existsSync(join(dir, 'data.json'))).toBe(false);
    expect(c.log()).toContain('2 people and 1 messages');
    const history = async (srv: Srv) => (await call(srv, 'GET', '/api/chat/history', undefined, maria.token)).body.messages.map((x: { text: string }) => x.text);
    expect(await history(c)).toEqual(['Lumang mensahe']);
    const people = (await call(c, 'GET', '/api/chat/directory', undefined, maria.token)).body.users.map((u: { id: string }) => u.id);
    expect(people.sort()).toEqual([m, n].sort());

    // The same file again (a copy put back by hand): nothing doubles.
    copyFileSync(join(dir, imported[0]), join(dir, 'data.json'));
    c.stop();
    const d = await another(first.db, {}, dir);
    await waitForImport(2);
    expect(await history(d)).toEqual(['Lumang mensahe']);
  }, 60_000);
});

// ------------------------------------------------------------------ one copy in this test's own process
const lines: string[] = [];
const quiet: Log = { format: 'text', info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) };

/** A server in this process, so the test can stop it the way a deploy does (Windows cannot send SIGTERM to another process). */
async function inProcess(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'may-ani-app-'));
  temp.push(dir);
  const { config, problems } = loadConfig({
    PORT: '0', DATA_FILE: join(dir, 'data.json'), AUTH_RATE_PER_MIN: '1000', ...AI,
    ...(mongo ? { MONGODB_URI: mongo.getUri(), MONGODB_DB: `may_ani_scale_app_${++dbs}` } : {}), ...extra,
  });
  expect(problems).toEqual([]);
  config.distDir = join(dir, 'dist');
  const app = await createApp(config, { log: quiet });
  const port = await app.listen(0);
  const srv: Srv = { url: `http://127.0.0.1:${port}`, port, log: () => lines.join('\n'), stop: () => void app.shutdown() };
  return { app, srv, dir, config };
}

describe('logs', () => {
  test('LOG_FORMAT=json writes one JSON line per request, with an id and without the part after "?"', async () => {
    const s = await startServer({ LOG_FORMAT: 'json', MONGODB_URI: ' ' });
    servers.push(s);
    const r = await fetch(`${s.url}/api/chat/stream?ticket=secret-ticket-123`);
    const id = r.headers.get('x-request-id');
    await sleep(300);
    const entries = s.log().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
    expect(entries.some((e) => e.msg.startsWith('May-Ani server on'))).toBe(true);
    const line = entries.find((e) => e.id === id);
    // accounts are off here, so the stream answers 503: a server-side problem, logged as an error
    expect(line).toMatchObject({ level: 'error', msg: 'request', method: 'GET', path: '/api/chat/stream', status: 503 });
    expect(typeof line.ms).toBe('number');
    expect(s.log()).not.toContain('secret-ticket-123');
  }, 30_000);

  test('the default text log stays quiet about ordinary requests', async () => {
    const s = await startServer({});
    servers.push(s);
    await fetch(`${s.url}/api/health`);
    await sleep(200);
    expect(s.log()).not.toContain('/api/health');
  }, 30_000);
});

describe('settings', () => {
  test('a wrong PORT or LOG_FORMAT stops the start with a plain sentence', () => {
    expect(loadConfig({ PORT: 'eighty' }).problems[0]).toContain('PORT must be a whole number');
    expect(loadConfig({ LOG_FORMAT: 'xml' }).problems[0]).toContain('LOG_FORMAT must be text or json');
    expect(loadConfig({}).problems).toEqual([]);
  });
});

describe.skipIf(!mongo)('stopping cleanly and health checks', () => {
  test('live and ready answer; a request already running is finished, live streams end, then the server is gone', async () => {
    const { app, srv } = await inProcess();
    expect((await fetch(`${srv.url}/api/live`)).status).toBe(200);
    const ready = await fetch(`${srv.url}/api/ready`);
    expect(ready.status).toBe(200);
    expect(ready.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);

    const lea = await signUpUser(srv, 'Lea');
    await call(srv, 'POST', '/api/chat/register', {}, lea.token);
    const stream = readStream(await ticketUrl(srv, lea.token), 'never-there', 8000);
    await sleep(300);

    aiDelayMs = 800;
    try {
      const slow = call(srv, 'POST', '/api/ai/diagnose', CHECK, lea.token);
      await sleep(200);
      expect(app.waiting()).toBe(1);
      const t0 = Date.now();
      await app.shutdown();
      expect((await slow).status).toBe(200); // finished, not cut off
      expect(Date.now() - t0).toBeLessThan(5000);
      expect((await stream).ended).toBe(true); // the phone reconnects (to another copy, if there is one)
      expect(await fetch(`${srv.url}/api/live`).then(() => 'answered', () => 'gone')).toBe('gone');
    } finally {
      aiDelayMs = 0;
    }
  }, 60_000);

  test('a chat message far bigger than any real one is refused before it is read', async () => {
    const { app, srv } = await inProcess();
    try {
      const { token } = await signUpUser(srv, 'Noel');
      const r = await call(srv, 'POST', '/api/chat/send', { to: 'acct-x', text: 'x'.repeat(40_000) }, token);
      expect(r.status).toBe(413);
    } finally {
      await app.shutdown();
    }
  }, 30_000);
});

// ------------------------------------------------------------------ the app's files
/** A GET that shows the raw answer (fetch would quietly unpack compressed bodies). */
const raw = (port: number, path: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; size: number }>((ok, no) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let size = 0;
      res.on('data', (c) => (size += c.length));
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, size }));
    });
    req.on('error', no);
    req.end();
  });

describe('app files', () => {
  test('compressed when the browser accepts it, cached a year when the name has a hash, 304 when unchanged', async () => {
    const { app, srv, config } = await inProcess({ MONGODB_URI: ' ' });
    try {
      const js = 'console.log("May-Ani");\n'.repeat(400);
      const dist = config.distDir;
      mkdirSync(dist);
      writeFileSync(join(dist, 'index.html'), `<!doctype html><title>May-Ani</title>${'<!-- app -->'.repeat(100)}`);
      writeFileSync(join(dist, 'chunk-abc123.js'), js);
      writeFileSync(join(dist, 'chunk-abc123.js.br'), brotliCompressSync(js));
      writeFileSync(join(dist, 'chunk-abc123.js.gz'), gzipSync(js));

      const br = await raw(srv.port, '/chunk-abc123.js', { 'accept-encoding': 'gzip, deflate, br' });
      expect(br.status).toBe(200);
      expect(br.headers['content-encoding']).toBe('br');
      expect(br.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(br.headers.vary).toBe('Accept-Encoding');
      expect(br.size).toBeLessThan(js.length / 4);

      expect((await raw(srv.port, '/chunk-abc123.js', { 'accept-encoding': 'gzip' })).headers['content-encoding']).toBe('gzip');
      expect((await raw(srv.port, '/chunk-abc123.js', { 'accept-encoding': 'gzip;q=0, br;q=0' })).headers['content-encoding']).toBeUndefined();
      const plain = await raw(srv.port, '/chunk-abc123.js');
      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(plain.size).toBe(js.length);

      const again = await raw(srv.port, '/chunk-abc123.js', { 'if-none-match': String(plain.headers.etag) });
      expect(again.status).toBe(304);
      expect(again.size).toBe(0);

      const page = await raw(srv.port, '/');
      expect(page.status).toBe(200);
      expect(page.headers['cache-control']).toBe('no-cache');
      expect((await raw(srv.port, '/some/page')).headers['content-type']).toContain('text/html'); // an app address gets the app
      expect((await raw(srv.port, '/chunk-old999.js')).status).toBe(404); // an old file is a real 404, not HTML
      expect((await raw(srv.port, '/..%2Fdist-old%2Fsecret.txt')).status).toBe(403);
    } finally {
      await app.shutdown();
    }
  }, 30_000);
});
