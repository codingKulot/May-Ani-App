import { afterAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ApiError } from '@/services/ai';
import { logInProblems, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, signUpProblems, toFormErrors } from '@/services/auth';

/**
 * Accounts, end to end: a throwaway MongoDB (mongodb-memory-server runs the real mongod program) and the real server
 * process, talked to over HTTP. It never touches the owner's database: MONGODB_URI is always set here, and set values
 * win over the .env file. Values that must be "off" are a single space, because Windows may drop empty variables.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OFF = ' ';

interface Srv { url: string; log: () => string; stop: () => void }

async function startServer(env: Record<string, string>): Promise<Srv> {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const dir = mkdtempSync(join(tmpdir(), 'may-ani-test-'));
  let log = '';
  const proc = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_FILE: join(dir, 'data.json'), ANTHROPIC_API_KEY: OFF, GEMINI_API_KEY: OFF, OPENAI_API_KEY: OFF, SMTP_USER: OFF, SMTP_PASSWORD: OFF, AUTH_RATE_PER_MIN: '1000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const stop = () => { proc.kill(); rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 100 && proc.exitCode === null; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, log: () => log, stop };
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  stop();
  throw new Error(`The server did not start:\n${log}`);
}

const call = async (srv: Srv, method: string, path: string, body?: unknown, token?: string) => {
  const r = await fetch(srv.url + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const PLACE = { name: 'San Jose', province: 'Nueva Ecija', lat: 15.79, lon: 120.99 };
const PASSWORD = 'Tatlong kalabaw sa bukid';
let n = 0;
const newUser = (over: Record<string, unknown> = {}) => ({ name: 'Juan Dela Cruz', email: `juan${++n}@example.com`, password: PASSWORD, role: 'farmer', location: PLACE, ...over });

// ------------------------------------------------------------------ rules shared by app and server
describe('the app and the server agree on the rules', () => {
  const serverAuth = readFileSync(new URL('../server/auth.mjs', import.meta.url), 'utf8');
  const constIn = (name: string) => Number(new RegExp(`export const ${name} = (\\d+)`).exec(serverAuth)?.[1]);
  test('same password and name limits', () => {
    expect(constIn('PASSWORD_MIN')).toBe(PASSWORD_MIN);
    expect(constIn('PASSWORD_MAX')).toBe(PASSWORD_MAX);
    expect(constIn('NAME_MAX')).toBe(NAME_MAX);
  });
});

describe('form checks in the app', () => {
  test('a good sign-up has no problems', () => {
    expect(signUpProblems({ name: 'Juan', email: ' Juan@Gmail.com ', password: PASSWORD })).toEqual({});
  });
  test('each problem is reported on its own field', () => {
    const p = signUpProblems({ name: '  ', email: 'juan@gmail', password: 'short' });
    expect(Object.keys(p).sort()).toEqual(['email', 'name', 'password']);
    expect(signUpProblems({ name: 'J', email: 'j@x.ph', password: 'x'.repeat(PASSWORD_MAX + 1) }).password).toContain('at most');
  });
  test('password length counts letters, not bytes (ñ is one letter)', () => {
    expect(signUpProblems({ name: 'J', email: 'j@x.ph', password: 'ñññññññ' }).password).toBeDefined();
    expect(signUpProblems({ name: 'J', email: 'j@x.ph', password: 'ññññññññ' }).password).toBeUndefined();
  });
  test('log-in needs both fields', () => {
    expect(logInProblems('', 'x').form).toBeDefined();
    expect(logInProblems('a@b.co', '')).toEqual({ form: 'Enter your email and password.' });
    expect(logInProblems('a@b.co', 'x')).toEqual({});
  });
  test('server refusals land on the right field; network failures get a plain message', () => {
    expect(toFormErrors(new ApiError('taken', 409, 'email'))).toEqual({ email: 'taken' });
    expect(toFormErrors(new ApiError('nope', 401))).toEqual({ form: 'nope' });
    expect(toFormErrors(new TypeError('Failed to fetch')).form).toContain('Could not reach');
  });
});

// ------------------------------------------------------------------ server without a database
describe('server without a database', () => {
  test('says accounts are off and refuses sign-up politely', async () => {
    const srv = await startServer({ MONGODB_URI: OFF });
    try {
      expect((await call(srv, 'GET', '/api/health')).body.accounts).toBe(false);
      const r = await call(srv, 'POST', '/api/auth/signup', newUser());
      expect(r.status).toBe(503);
      expect(r.body.error).toContain('not set up');
      expect(srv.log()).toContain('accounts: OFF');
    } finally { srv.stop(); }
  });
  test('a database that cannot be reached gives 503, not a crash', async () => {
    const srv = await startServer({ MONGODB_URI: 'mongodb://127.0.0.1:9/', MONGODB_TIMEOUT_MS: '600' });
    try {
      const r = await call(srv, 'POST', '/api/auth/login', { email: 'a@b.co', password: PASSWORD });
      expect(r.status).toBe(503);
      expect(r.body.error).toContain('cannot be reached');
      expect((await call(srv, 'GET', '/api/health')).status).toBe(200); // the rest of the server keeps working
    } finally { srv.stop(); }
  }, 15_000);
  test('a malformed database address switches accounts off with the reason', async () => {
    const srv = await startServer({ MONGODB_URI: 'http://user:Secret123@example.com' });
    try {
      expect((await call(srv, 'GET', '/api/health')).body.accounts).toBe(false);
      expect(srv.log()).toContain('accounts: OFF - Invalid scheme');
      expect(srv.log()).not.toContain('Secret123');
    } finally { srv.stop(); }
  });
});

// ------------------------------------------------------------------ real MongoDB
const mongo = await MongoMemoryServer.create().catch((e: Error) => {
  console.warn(`\n[auth tests] SKIPPED the MongoDB tests: a test database could not start (${e.message}).
On Windows this usually means the Microsoft Visual C++ Redistributable (x64) is missing: https://aka.ms/vs/17/release/vc_redist.x64.exe\n`);
  return null;
});
const DB = 'may_ani_test';
const srv = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: DB }) : null;
const client = mongo ? new MongoClient(mongo.getUri()) : null;
const db = client?.db(DB);

afterAll(async () => {
  srv?.stop();
  await client?.close();
  await mongo?.stop();
});

describe.skipIf(!mongo)('accounts on a real MongoDB', () => {
  const s = srv!;
  const signUp = (over: Record<string, unknown> = {}) => call(s, 'POST', '/api/auth/signup', newUser(over));
  const logIn = (email: string, password: string) => call(s, 'POST', '/api/auth/login', { email, password });

  test('health says accounts are on', async () => {
    expect((await call(s, 'GET', '/api/health')).body.accounts).toBe(true);
    expect(s.log()).toContain('accounts: on (MongoDB)');
  });

  test('sign-up returns a login and the profile, never the password', async () => {
    const r = await signUp({ email: '  Maria.Santos@Example.COM ', name: '  Maria Santos ', role: 'supplier' });
    expect(r.status).toBe(201);
    expect(r.body.token.length).toBeGreaterThanOrEqual(40);
    expect(r.body.user).toMatchObject({ email: 'maria.santos@example.com', name: 'Maria Santos', role: 'supplier', location: PLACE });
    expect(JSON.stringify(r.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');
  });

  test('the database keeps only a password hash and a token hash', async () => {
    const r = await signUp();
    const user = await db!.collection('users').findOne({ email: r.body.user.email });
    expect(user!.passwordHash).toStartWith('scrypt$15$8$3$');
    expect(JSON.stringify(user)).not.toContain(PASSWORD);
    const sessions = await db!.collection('sessions').find({ userId: user!._id }).toArray();
    expect(sessions.length).toBe(1);
    expect(sessions[0].tokenHash).toBe(await sha256(r.body.token));
    expect(JSON.stringify(sessions)).not.toContain(r.body.token);
  });

  test('the same password gives a different hash for each account (salted)', async () => {
    const a = await signUp(); const b = await signUp();
    const users = db!.collection('users');
    const ha = (await users.findOne({ email: a.body.user.email }))!.passwordHash;
    const hb = (await users.findOne({ email: b.body.user.email }))!.passwordHash;
    expect(ha).not.toBe(hb);
  });

  test('one account per email, whatever the capital letters', async () => {
    expect((await signUp({ email: 'pedro@example.com' })).status).toBe(201);
    const again = await signUp({ email: 'PEDRO@example.com' });
    expect(again.status).toBe(409);
    expect(again.body.field).toBe('email');
    expect(await db!.collection('users').countDocuments({ email: 'pedro@example.com' })).toBe(1);
  });

  test('bad sign-ups are refused with a reason on the right field', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ name: '   ' }, 'name'],
      [{ email: 'not-an-email' }, 'email'],
      [{ email: 'juan@gmail' }, 'email'],
      [{ password: 'short' }, 'password'],
      [{ password: 'password123' }, 'password'],
      [{ password: '12345678' }, 'password'],
      [{ password: 'aaaaaaaaaaaa' }, 'password'],
      [{ email: 'kalabaw123@example.com', password: 'kalabaw123' }, 'password'],
      [{ password: 'x'.repeat(PASSWORD_MAX + 1) }, 'password'],
    ];
    for (const [over, field] of cases) {
      const r = await signUp(over);
      expect({ over, status: r.status, field: r.body.field }).toEqual({ over, status: 400, field });
    }
  });

  test('unknown role and broken location fall back safely instead of being stored', async () => {
    const r = await signUp({ role: 'admin', location: { name: 'X', lat: '15', lon: 120 } });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('farmer');
    expect(r.body.user.location).toBeNull();
  });

  test('database tricks in the email or password are refused', async () => {
    await signUp({ email: 'target@example.com' });
    expect((await call(s, 'POST', '/api/auth/login', { email: { $ne: '' }, password: { $ne: '' } })).status).toBe(400);
    expect((await call(s, 'POST', '/api/auth/login', { email: 'target@example.com', password: { $gt: '' } })).status).toBe(400);
    expect((await call(s, 'POST', '/api/auth/signup', { ...newUser(), email: { $gt: '' } })).body.field).toBe('email');
    expect((await call(s, 'POST', '/api/auth/login', '{not json')).status).toBe(400);
  });

  test('log in with the right password; email capitals and spaces do not matter', async () => {
    const su = await signUp({ email: 'rosa@example.com' });
    const r = await logIn('  ROSA@example.com', PASSWORD);
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(su.body.user.id);
    expect(r.body.token).not.toBe(su.body.token);
  });

  test('wrong password and unknown email get the same answer (nobody can test who has an account)', async () => {
    await signUp({ email: 'lito@example.com' });
    const wrong = await logIn('lito@example.com', 'Wrong password 1');
    const unknown = await logIn('nobody-here@example.com', PASSWORD);
    expect(wrong).toEqual({ status: 401, body: { error: 'Wrong email or password.' } });
    expect(unknown).toEqual(wrong);
  });

  test('/me needs a valid login', async () => {
    const su = await signUp();
    expect((await call(s, 'GET', '/api/auth/me')).status).toBe(401);
    expect((await call(s, 'GET', '/api/auth/me', undefined, 'x'.repeat(43))).status).toBe(401);
    const me = await call(s, 'GET', '/api/auth/me', undefined, su.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(su.body.user.email);
  });

  test('profile changes are saved to the account', async () => {
    const { body: { token } } = await signUp();
    const place = { name: 'Lucena', province: 'Quezon', lat: 13.94, lon: 121.62 };
    const r = await call(s, 'POST', '/api/auth/profile', { name: 'Juan D.', role: 'buyer', location: place }, token);
    expect(r.status).toBe(200);
    expect((await call(s, 'GET', '/api/auth/me', undefined, token)).body.user).toMatchObject({ name: 'Juan D.', role: 'buyer', location: place });
    expect((await call(s, 'POST', '/api/auth/profile', { name: ' ' }, token)).body.field).toBe('name');
    expect((await call(s, 'POST', '/api/auth/profile', { role: 'admin' }, token)).body.field).toBe('role');
    expect((await call(s, 'POST', '/api/auth/profile', { location: { name: 'X', lat: 99, lon: 0 } }, token)).body.field).toBe('location');
    expect((await call(s, 'POST', '/api/auth/profile', { name: 'Hacker' })).status).toBe(401);
  });

  test('log out ends only that phone\'s session', async () => {
    const su = await signUp({ email: 'two-phones@example.com' });
    const other = await logIn('two-phones@example.com', PASSWORD);
    expect((await call(s, 'POST', '/api/auth/logout', {}, su.body.token)).status).toBe(200);
    expect((await call(s, 'GET', '/api/auth/me', undefined, su.body.token)).status).toBe(401);
    expect((await call(s, 'GET', '/api/auth/me', undefined, other.body.token)).status).toBe(200);
  });

  test('expired sessions are refused', async () => {
    const { body: { token } } = await signUp();
    await db!.collection('sessions').updateOne({ tokenHash: await sha256(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(s, 'GET', '/api/auth/me', undefined, token)).status).toBe(401);
  });

  test('five wrong passwords lock that email for a while (other emails are not affected)', async () => {
    await signUp({ email: 'locked@example.com' });
    await signUp({ email: 'free@example.com' });
    for (let i = 0; i < 5; i++) expect((await logIn('locked@example.com', `Wrong password ${i}`)).status).toBe(401);
    const blocked = await logIn('locked@example.com', PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain('15 minutes');
    expect((await logIn('free@example.com', PASSWORD)).status).toBe(200);
  }, 15_000);

  test('the database has the safety indexes', async () => {
    const users = await db!.collection('users').indexes();
    expect(users.find((i: any) => i.name === 'email_unique')?.unique).toBe(true);
    const sessions = await db!.collection('sessions').indexes();
    expect(sessions.find((i: any) => i.name === 'expire')?.expireAfterSeconds).toBe(0);
    expect(sessions.find((i: any) => i.name === 'token_unique')?.unique).toBe(true);
  });

  test('oversized requests are refused', async () => {
    const r = await call(s, 'POST', '/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) });
    expect(r.status).toBe(413);
  });
});
