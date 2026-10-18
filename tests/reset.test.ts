import { afterAll, describe, expect, test } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ApiError } from '@/services/ai';
import { forgotProblems, isDeadResetLink, PASSWORD_MAX, resetProblems } from '@/services/auth';
import { call, postWithHost, sha256, sleep, startServer, type Srv } from './support/server';
import { startFakeSmtp, type Mail } from './support/fake-smtp';

/**
 * "Forgot your password?", end to end: a throwaway MongoDB, the real server process and a fake mail server
 * (tests/support/fake-smtp.ts) in place of Gmail. No real email is sent and the owner's database is never touched.
 */

const PASSWORD = 'Tatlong kalabaw sa bukid';
const NEW_PASSWORD = 'Apat na baka sa parang';
const SMTP_USER = 'may-ani.test@example.com';
const SMTP_PASSWORD = 'test-app-password';
const APP_URL = 'http://may-ani.test:8787'; // not the server's own address: links must use APP_URL, nothing else
const PLACE = { name: 'San Jose', province: 'Nueva Ecija', lat: 15.79, lon: 120.99 };
let n = 0;
const email = (tag = 'juan') => `${tag}${++n}@example.com`;
const tokenIn = (m: Mail) => /#\/reset\?token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1] ?? '';
/** Each of these hashes passwords several times (scrypt is slow on purpose), so allow more than the default 5 s on a busy PC. */
const slowTest = (name: string, fn: () => Promise<void>) => test(name, fn, 20_000);

// ------------------------------------------------------------------ app-side checks
describe('reset forms in the app', () => {
  test('the forgot form needs a real email address', () => {
    expect(forgotProblems(' Juan@Gmail.com ')).toEqual({});
    expect(forgotProblems('juan@gmail').email).toContain('valid email');
    expect(forgotProblems('').email).toBeDefined();
  });
  test('the new password follows the sign-up length rules', () => {
    expect(resetProblems(NEW_PASSWORD)).toEqual({});
    expect(resetProblems('short').password).toContain('at least');
    expect(resetProblems('x'.repeat(PASSWORD_MAX + 1)).password).toContain('at most');
  });
  test('an expired or used link is told apart from other refusals', () => {
    expect(isDeadResetLink(new ApiError('gone', 400, 'token'))).toBe(true);
    expect(isDeadResetLink(new ApiError('weak', 400, 'password'))).toBe(false);
    expect(isDeadResetLink(new TypeError('Failed to fetch'))).toBe(false);
  });
});

// ------------------------------------------------------------------ servers
const mongo = await MongoMemoryServer.create().catch((e: Error) => {
  console.warn(`\n[reset tests] SKIPPED the MongoDB tests: a test database could not start (${e.message}).
On Windows this usually means the Microsoft Visual C++ Redistributable (x64) is missing: https://aka.ms/vs/17/release/vc_redist.x64.exe\n`);
  return null;
});
const DB = 'may_ani_reset_test';
const smtp = await startFakeSmtp({ user: SMTP_USER, pass: SMTP_PASSWORD });
const mailEnv = (port: number) => ({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER, SMTP_PASSWORD, APP_URL });
const srv = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: DB, ...mailEnv(smtp.port) }) : null;
const client = mongo ? new MongoClient(mongo.getUri()) : null;
const db = client?.db(DB);
const extra: Srv[] = [];

afterAll(async () => {
  srv?.stop();
  for (const s of extra) s.stop();
  await smtp.stop();
  await client?.close();
  await mongo?.stop();
});

describe('server without email set up', () => {
  test('forgot says reset is off, the same for every email', async () => {
    const s = await startServer({ MONGODB_URI: 'mongodb://127.0.0.1:9/', MONGODB_TIMEOUT_MS: '600' });
    try {
      expect((await call(s, 'GET', '/api/health')).body.reset).toBe(false);
      expect(s.log()).toContain('email: OFF - add SMTP_USER and SMTP_PASSWORD');
      const a = await call(s, 'POST', '/api/auth/forgot', { email: 'someone@example.com' });
      const b = await call(s, 'POST', '/api/auth/forgot', { email: 'nobody@example.com' });
      expect(a.status).toBe(503);
      expect(a.body.error).toContain('not switched on');
      expect(b).toEqual(a);
    } finally { s.stop(); }
  });
});

// ------------------------------------------------------------------ real MongoDB + fake mail server
describe.skipIf(!mongo)('password reset on a real MongoDB with a fake mail server', () => {
  const s = srv!;
  const signUp = async (address: string, name = 'Juan Dela Cruz') => {
    const r = await call(s, 'POST', '/api/auth/signup', { name, email: address, password: PASSWORD, role: 'farmer', location: PLACE });
    expect(r.status).toBe(201);
    return r.body.token as string;
  };
  const logIn = (address: string, password: string) => call(s, 'POST', '/api/auth/login', { email: address, password });
  const forgot = (address: unknown) => call(s, 'POST', '/api/auth/forgot', { email: address });
  const reset = (token: unknown, password: unknown) => call(s, 'POST', '/api/auth/reset', { token, password });
  const resetMail = (address: string) => smtp.waitFor((m) => m.to.includes(address) && m.subject === 'Reset your May-Ani password');
  /** Asks for a link and returns the token from the email. */
  const linkFor = async (address: string) => {
    const before = smtp.mails.length;
    expect((await forgot(address)).status).toBe(200);
    const m = await smtp.waitFor((x) => smtp.mails.indexOf(x) >= before && x.to.includes(address) && x.subject.startsWith('Reset'));
    return tokenIn(m);
  };

  slowTest('health says reset is on, and the server logged in to the mail server', async () => {
    expect((await call(s, 'GET', '/api/health')).body.reset).toBe(true);
    expect(s.log()).toContain(`email: on (127.0.0.1), reset links open ${APP_URL}`);
    for (let i = 0; i < 40 && !s.log().includes('Email: logged in'); i++) await sleep(50);
    expect(s.log()).toContain('Email: logged in to 127.0.0.1');
    expect(s.log()).not.toContain(SMTP_PASSWORD);
  });

  slowTest('full reset: email with a link, new password works, old one does not', async () => {
    const address = email();
    await signUp(address);
    const r = await forgot(`  ${address.toUpperCase()} `);
    expect(r.status).toBe(200);
    expect(r.body.message).toContain('If an account uses this email');
    const m = await resetMail(address);
    expect(m.from).toBe(SMTP_USER);
    expect(m.text).toContain('Hello Juan Dela Cruz');
    expect(m.text).toContain(`${APP_URL}/#/reset?token=`);
    expect(m.html).toContain(`href="${APP_URL}/#/reset?token=`);
    const token = tokenIn(m);
    expect(token.length).toBeGreaterThanOrEqual(40);

    const done = await reset(token, NEW_PASSWORD);
    expect(done).toEqual({ status: 200, body: { ok: true, email: address } });
    expect((await logIn(address, PASSWORD)).status).toBe(401);
    expect((await logIn(address, NEW_PASSWORD)).status).toBe(200);
    const note = await smtp.waitFor((x) => x.to.includes(address) && x.subject === 'Your May-Ani password was changed');
    expect(note.text).toContain('Forgot your password?');
  });

  slowTest('the database keeps only the token hash, with a 30 minute expiry', async () => {
    const address = email();
    await signUp(address);
    const token = await linkFor(address);
    const user = await db!.collection('users').findOne({ email: address });
    const links = await db!.collection('password_resets').find({ userId: user!._id }).toArray();
    expect(links.length).toBe(1);
    expect(links[0].tokenHash).toBe(await sha256(token));
    expect(JSON.stringify(links)).not.toContain(token);
    const minutes = (links[0].expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  slowTest('a link works only once', async () => {
    const address = email();
    await signUp(address);
    const token = await linkFor(address);
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
    const again = await reset(token, 'Another fine password 2');
    expect(again.status).toBe(400);
    expect(again.body.field).toBe('token');
    expect((await logIn(address, NEW_PASSWORD)).status).toBe(200); // the second try changed nothing
  });

  slowTest('two resets racing with the same link: exactly one wins', async () => {
    const address = email();
    await signUp(address);
    const token = await linkFor(address);
    const results = await Promise.all([reset(token, 'First racing password'), reset(token, 'Second racing password')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  slowTest('an expired link is refused', async () => {
    const address = email();
    await signUp(address);
    const token = await linkFor(address);
    await db!.collection('password_resets').updateOne({ tokenHash: await sha256(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await reset(token, NEW_PASSWORD);
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('token');
    expect(r.body.error).toContain('expired');
    expect((await logIn(address, PASSWORD)).status).toBe(200); // password unchanged
  });

  slowTest('asking again replaces the older link', async () => {
    const address = email();
    await signUp(address);
    const first = await linkFor(address);
    const second = await linkFor(address);
    expect(first).not.toBe(second);
    expect((await reset(first, NEW_PASSWORD)).body.field).toBe('token');
    expect((await reset(second, NEW_PASSWORD)).status).toBe(200);
  });

  slowTest('a reset logs the account out on every phone, and later logins work', async () => {
    const address = email();
    const phone1 = await signUp(address);
    const phone2 = (await logIn(address, PASSWORD)).body.token;
    expect((await call(s, 'GET', '/api/auth/me', undefined, phone1)).status).toBe(200);
    const token = await linkFor(address);
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
    expect((await call(s, 'GET', '/api/auth/me', undefined, phone1)).status).toBe(401);
    expect((await call(s, 'GET', '/api/auth/me', undefined, phone2)).status).toBe(401);
    const user = await db!.collection('users').findOne({ email: address });
    expect(await db!.collection('sessions').countDocuments({ userId: user!._id })).toBe(0);
    expect(await db!.collection('password_resets').countDocuments({ userId: user!._id })).toBe(0);
    const fresh = (await logIn(address, NEW_PASSWORD)).body.token;
    expect((await call(s, 'GET', '/api/auth/me', undefined, fresh)).status).toBe(200);
  });

  slowTest('an old login that somehow survived the reset is still refused', async () => {
    const address = email();
    const old = await signUp(address);
    const user = await db!.collection('users').findOne({ email: address });
    const [session] = await db!.collection('sessions').find({ userId: user!._id }).toArray();
    expect((await reset(await linkFor(address), NEW_PASSWORD)).status).toBe(200);
    await db!.collection('sessions').insertOne(session); // as if deleting it had failed
    expect((await call(s, 'GET', '/api/auth/me', undefined, old)).status).toBe(401);
  });

  slowTest('a weak new password is refused and the link keeps working', async () => {
    const address = email('kalabaw');
    await signUp(address);
    const token = await linkFor(address);
    for (const weak of ['short', 'password123', address.split('@')[0], 'x'.repeat(PASSWORD_MAX + 1), '', 42]) {
      const r = await reset(token, weak);
      expect({ weak, status: r.status, field: r.body.field }).toEqual({ weak, status: 400, field: 'password' });
    }
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
  });

  slowTest('nobody can find out which emails have accounts', async () => {
    const known = email();
    await signUp(known);
    const unknown = email('nobody');
    const a = await forgot(known);
    const b = await forgot(unknown);
    expect(b).toEqual(a);
    await resetMail(known);
    await sleep(300);
    expect(smtp.mails.some((m) => m.to.includes(unknown))).toBe(false);
  });

  slowTest('the answer comes before the email is sent (so the time taken does not tell either)', async () => {
    const slow = await startFakeSmtp({ user: SMTP_USER, pass: SMTP_PASSWORD, delayMs: 1500 });
    const s2 = await startServer({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: DB, ...mailEnv(slow.port) });
    extra.push(s2);
    try {
      const address = email();
      expect((await call(s2, 'POST', '/api/auth/signup', { name: 'Ana', email: address, password: PASSWORD })).status).toBe(201);
      const t0 = Date.now();
      expect((await call(s2, 'POST', '/api/auth/forgot', { email: address })).status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(1000);
      await slow.waitFor((m) => m.to.includes(address));
    } finally { await slow.stop(); }
  });

  slowTest('too many requests for one email are refused, the same whether or not it has an account', async () => {
    const known = email();
    await signUp(known);
    const unknown = email('nobody');
    for (let i = 0; i < 3; i++) {
      expect((await forgot(known)).status).toBe(200);
      expect((await forgot(unknown)).status).toBe(200);
    }
    const a = await forgot(known);
    const b = await forgot(unknown);
    expect(a.status).toBe(429);
    expect(b).toEqual(a);
    expect((await forgot(email())).status).toBe(200); // other emails are not affected
  });

  slowTest('too many requests from one IP address are refused', async () => {
    const s2 = await startServer({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: DB, ...mailEnv(smtp.port), RESET_RATE_PER_MIN: '2' });
    extra.push(s2);
    const ask = () => call(s2, 'POST', '/api/auth/forgot', { email: email() });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
  });

  slowTest('a reset ends the wrong-password lockout', async () => {
    const address = email();
    await signUp(address);
    for (let i = 0; i < 5; i++) expect((await logIn(address, `Wrong password ${i}`)).status).toBe(401);
    expect((await logIn(address, PASSWORD)).status).toBe(429);
    expect((await reset(await linkFor(address), NEW_PASSWORD)).status).toBe(200);
    expect((await logIn(address, NEW_PASSWORD)).status).toBe(200);
  });

  slowTest('a faked Host header cannot change where the link points', async () => {
    const address = email();
    await signUp(address);
    const before = smtp.mails.length;
    expect((await postWithHost(s, '/api/auth/forgot', { email: address }, 'evil.example')).status).toBe(200);
    const m = await smtp.waitFor((x) => smtp.mails.indexOf(x) >= before && x.to.includes(address));
    expect(m.text).toContain(`${APP_URL}/#/reset?token=`);
    expect(m.raw).not.toContain('evil.example');
  });

  slowTest('names are shown as text in the email, never as HTML', async () => {
    const address = email();
    await signUp(address, '<a href="https://evil.example">Juan</a>');
    const before = smtp.mails.length;
    expect((await forgot(address)).status).toBe(200);
    const m = await smtp.waitFor((x) => smtp.mails.indexOf(x) >= before && x.to.includes(address));
    expect(m.html).not.toContain('<a href="https://evil.example"');
    expect(m.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Juan&lt;/a&gt;');
  });

  slowTest('bad requests and database tricks are refused', async () => {
    expect((await forgot('not-an-email')).body.field).toBe('email');
    expect((await forgot({ $ne: '' })).body.field).toBe('email');
    expect((await reset({ $ne: '' }, NEW_PASSWORD)).body.field).toBe('token');
    expect((await reset('x'.repeat(43), NEW_PASSWORD)).body.field).toBe('token');
    expect((await reset('', NEW_PASSWORD)).body.field).toBe('token');
    expect((await call(s, 'POST', '/api/auth/reset', '{not json')).status).toBe(400);
    expect((await call(s, 'POST', '/api/auth/forgot', { email: 'a@b.co', pad: 'x'.repeat(20_000) })).status).toBe(413);
  });

  slowTest('the reset links collection has its safety indexes', async () => {
    const idx = await db!.collection('password_resets').indexes();
    expect(idx.find((i: any) => i.name === 'expire')?.expireAfterSeconds).toBe(0);
    expect(idx.find((i: any) => i.name === 'token_unique')?.unique).toBe(true);
  });

  slowTest('when the mail server refuses the login: same answer, a hint in the log, and no usable link left behind', async () => {
    const s2 = await startServer({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: DB, ...mailEnv(smtp.port), SMTP_PASSWORD: 'wrong-password' });
    extra.push(s2);
    const address = email();
    expect((await call(s2, 'POST', '/api/auth/signup', { name: 'Ana', email: address, password: PASSWORD })).status).toBe(201);
    expect((await call(s2, 'POST', '/api/auth/forgot', { email: address })).status).toBe(200);
    for (let i = 0; i < 60 && !s2.log().includes('a password reset email could not be sent'); i++) await sleep(50);
    expect(s2.log()).toContain('a password reset email could not be sent. The mail server refused SMTP_USER and SMTP_PASSWORD');
    expect(s2.log()).toContain('Email: cannot send yet.');
    expect(s2.log()).not.toContain('wrong-password');
    const user = await db!.collection('users').findOne({ email: address });
    expect(await db!.collection('password_resets').countDocuments({ userId: user!._id })).toBe(0);
  });
});

describe('a server with email on but no database', () => {
  test('forgot gives 503 instead of pretending an email was sent', async () => {
    const s = await startServer({ MONGODB_URI: 'mongodb://127.0.0.1:9/', MONGODB_TIMEOUT_MS: '600', ...mailEnv(smtp.port) });
    try {
      const r = await call(s, 'POST', '/api/auth/forgot', { email: 'someone@example.com' });
      expect(r.status).toBe(503);
      expect(r.body.error).toContain('cannot be reached');
    } finally { s.stop(); }
  }, 15_000);
});
