import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Starts the real server (server/index.mjs) as its own process on a random port, for end-to-end tests.
 * Keys and email are switched off unless a test sets them, so a test never uses the owner's real keys, database or Gmail
 * from the .env file (values set here win over the file). "Off" is a single space, because Windows may drop empty variables.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const OFF = ' ';

export interface Srv { url: string; port: number; log: () => string; stop: () => void }

/** Tests make many AI calls: the daily allowance (server/limits.mjs) is set high unless a test sets its own. */
const NO_DAILY_LIMITS: Record<string, string> = Object.fromEntries(
  ['AI', 'PICTURES'].flatMap((k) => ['ACCOUNT', 'TOTAL'].map((w) => [`${k}_DAILY_${w}`, '100000'])),
);

/**
 * A throwaway MongoDB (mongodb-memory-server runs the real mongod program) for tests that need logged-in users, or null with
 * a warning when it cannot start on this PC (then those tests are skipped). It never touches the owner's database.
 */
export async function startMongo(label: string): Promise<MongoMemoryServer | null> {
  return MongoMemoryServer.create().catch((e: Error) => {
    console.warn(`\n[${label}] SKIPPED the tests that need a test database: it could not start (${e.message}).
On Windows this usually means the Microsoft Visual C++ Redistributable (x64) is missing: https://aka.ms/vs/17/release/vc_redist.x64.exe\n`);
    return null;
  });
}

let users = 0;
/** Signs up a new account on a test server; answers its login token and account id. */
export async function signUpUser(srv: Srv, name = 'Juan Dela Cruz'): Promise<{ token: string; id: string }> {
  const r = await call(srv, 'POST', '/api/auth/signup', { name, email: `user${++users}.${Date.now()}@example.com`, password: 'Tatlong kalabaw sa bukid' });
  if (r.status !== 201) throw new Error(`Sign-up failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.token, id: r.body.user.id };
}

/** `dataDir`: a folder for the chat data file (data.json), when a test wants to look at it; otherwise a temporary one. */
export async function startServer(env: Record<string, string>, dataDir?: string): Promise<Srv> {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'may-ani-test-'));
  let log = '';
  const proc = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(port), DATA_FILE: join(dir, 'data.json'), ANTHROPIC_API_KEY: OFF, GEMINI_API_KEY: OFF, OPENAI_API_KEY: OFF,
      MONGODB_URI: OFF, SMTP_USER: OFF, SMTP_PASSWORD: OFF, PRICES_FETCH: 'off', AUTH_RATE_PER_MIN: '1000', RESET_RATE_PER_MIN: '1000', ...NO_DAILY_LIMITS, ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const stop = () => { proc.kill(); if (!dataDir) rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 100 && proc.exitCode === null; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, port, log: () => log, stop };
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  stop();
  throw new Error(`The server did not start:\n${log}`);
}

export const call = async (srv: Srv, method: string, path: string, body?: unknown, token?: string) => {
  const r = await fetch(srv.url + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};

/** A POST with a made-up Host header (fetch does not allow setting Host). */
export const postWithHost = (srv: Srv, path: string, body: unknown, host: string) =>
  new Promise<{ status: number; body: any }>((ok, no) => {
    const data = JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: srv.port, path, method: 'POST', headers: { host, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => { try { ok({ status: res.statusCode ?? 0, body: JSON.parse(text) }); } catch (e) { no(e); } });
    });
    req.on('error', no);
    req.end(data);
  });

export const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
