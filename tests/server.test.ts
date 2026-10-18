import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { call, signUpUser, sleep, startMongo, startServer } from './support/server';

/** Small server safety fixes from the October 2026 review: static files, broken addresses, chat data file, picture errors. */

const mongo = await startMongo('server tests'); // chat and pictures need a logged-in user
afterAll(async () => { await mongo?.stop(); });
const withDb = (): Record<string, string> => (mongo ? { MONGODB_URI: mongo.getUri(), MONGODB_DB: 'may_ani_server_test' } : {});

declare const Bun: {
  serve(o: { port: number; hostname: string; fetch(req: Request): Response | Promise<Response> }): { port: number; stop(force?: boolean): void };
};

describe('static files', () => {
  test('a folder next to dist (like dist-old) cannot be read, and a broken %-code is a bad request', async () => {
    const srv = await startServer({});
    try {
      expect((await fetch(`${srv.url}/..%2Fdist-old%2Fsecret.txt`)).status).toBe(403);
      expect((await fetch(`${srv.url}/..%2F.env`)).status).toBe(403);
      expect((await fetch(`${srv.url}/%E0%A4%A`)).status).toBe(400);
      expect(srv.log()).not.toContain('URIError'); // answered, not crashed into the 500 handler
    } finally {
      srv.stop();
    }
  }, 30_000);
});

describe('chat data file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'may-ani-chat-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test.skipIf(!mongo)('a damaged file is moved aside, never overwritten, and new chat data is saved whole', async () => {
    writeFileSync(join(dir, 'data.json'), '{"users":{"u1":{"id":"u1"');
    const srv = await startServer(withDb(), dir);
    try {
      const aside = readdirSync(dir).filter((f) => f.startsWith('data.json.damaged-'));
      expect(aside.length).toBe(1);
      expect(readFileSync(join(dir, aside[0]), 'utf8')).toBe('{"users":{"u1":{"id":"u1"');
      expect(srv.log()).toContain('could not be read');

      const juan = await signUpUser(srv, 'Juan');
      const r = await call(srv, 'POST', '/api/chat/register', { blurb: 'Davao City' }, juan.token);
      expect(r.status).toBe(200);
      await sleep(1200); // saves are grouped for half a second
      const saved = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'));
      expect(saved.users[r.body.id].name).toBe('Juan');
      expect(JSON.stringify(saved)).not.toContain(juan.token); // the login token is never written to the chat file
      expect(existsSync(join(dir, 'data.json.tmp'))).toBe(false);
    } finally {
      srv.stop();
    }
  }, 30_000);
});

describe('starting twice', () => {
  test('a port that is already in use gets a plain explanation, not a crash report', async () => {
    const busy = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('taken') });
    const dir = mkdtempSync(join(tmpdir(), 'may-ani-port-'));
    try {
      const OFF = ' ';
      const proc = spawn(process.execPath, ['server/index.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, PORT: String(busy.port), DATA_FILE: join(dir, 'data.json'), ANTHROPIC_API_KEY: OFF, GEMINI_API_KEY: OFF, OPENAI_API_KEY: OFF, MONGODB_URI: OFF, SMTP_USER: OFF, SMTP_PASSWORD: OFF },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => (out += d));
      for (let i = 0; i < 100 && proc.exitCode === null; i++) await sleep(100);
      expect(proc.exitCode).toBe(1);
      expect(out).toContain(`port ${busy.port} is already in use`);
      expect(out).toContain('Ctrl+C');
      expect(out).not.toContain('emitError'); // no stack trace
    } finally {
      busy.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('picture errors', () => {
  const fake = Bun.serve({
    port: 0, hostname: '127.0.0.1',
    fetch: () => Response.json({ error: { message: 'API key of project 4711 (owner@example.test) is not valid' } }, { status: 400 }),
  });
  afterAll(() => fake.stop(true));

  test.skipIf(!mongo)("the provider's own words stay in the server log", async () => {
    const srv = await startServer({ ...withDb(), GEMINI_API_KEY: 'test-not-a-real-key', GEMINI_BASE_URL: `http://127.0.0.1:${fake.port}` });
    try {
      const { token } = await signUpUser(srv);
      const r = await call(srv, 'POST', '/api/ai/render', {
        prompt: 'A raised vegetable bed made of coco lumber on the open ground in this photo, realistic.',
        image: { mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(400) },
      }, token);
      expect(r.status).toBe(502);
      expect(r.body.error).toContain('error 400');
      expect(r.body.error).not.toContain('4711');
      expect(srv.log()).toContain('4711');
    } finally {
      srv.stop();
    }
  });
});
