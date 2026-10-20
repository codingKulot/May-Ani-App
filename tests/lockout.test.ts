import { afterAll, describe, expect, test } from 'bun:test';
import { startMongo, startServer, type Srv } from './support/server';

/**
 * The wrong-password lockout (review of 20 October 2026). Before, 5 wrong passwords from anyone locked the email itself, so a
 * stranger could keep a farmer out of their own account; and tries sent at the same moment were all checked. Now:
 *   * 5 wrong tries lock only the address they came from (for that email); the owner elsewhere still logs in;
 *   * 50 wrong tries from all addresses together lock the email for an hour;
 *   * every try is counted before the password is checked.
 * Different addresses are simulated with X-Forwarded-For (TRUST_PROXY=loopback: the test talks to the server through 127.0.0.1).
 * Throwaway MongoDB only.
 */

const mongo = await startMongo('lockout tests');
const PASSWORD = 'Tatlong kalabaw sa bukid';
const srv: Srv | null = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: 'may_ani_lockout_test', TRUST_PROXY: 'loopback' }) : null;
let n = 0;

afterAll(async () => { srv?.stop(); await mongo?.stop(); });

const post = async (path: string, body: unknown, from = '198.51.100.1') => {
  const r = await fetch(srv!.url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': from }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};
const newAccount = async () => {
  const email = `farmer${++n}.${Date.now()}@example.com`;
  expect((await post('/api/auth/signup', { name: 'Juan', email, password: PASSWORD })).status).toBe(201);
  return email;
};
const logIn = (email: string, password: string, from?: string) => post('/api/auth/login', { email, password }, from);

describe.skipIf(!mongo)('wrong-password lockout', () => {
  test('a stranger\'s wrong tries lock only the stranger, not the owner', async () => {
    const email = await newAccount();
    for (let i = 0; i < 5; i++) expect((await logIn(email, `wrong ${i}`, '203.0.113.66')).status).toBe(401);
    const stranger = await logIn(email, PASSWORD, '203.0.113.66');
    expect(stranger.status).toBe(429); // even the right password is refused from the guessing address
    expect(stranger.body.error).toContain('15 minutes');
    expect((await logIn(email, PASSWORD, '198.51.100.20')).status).toBe(200); // the owner, at home
  }, 30_000);

  test('a right password forgets the earlier wrong tries of that address', async () => {
    const email = await newAccount();
    for (let i = 0; i < 4; i++) expect((await logIn(email, `typo ${i}`)).status).toBe(401);
    expect((await logIn(email, PASSWORD)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await logIn(email, `typo again ${i}`)).status).toBe(401); // a fresh count, not locked
    expect((await logIn(email, PASSWORD)).status).toBe(200);
  }, 30_000);

  test('30 guesses sent at the same moment: at most 5 passwords are checked', async () => {
    const email = await newAccount();
    const all = await Promise.all(Array.from({ length: 30 }, (_, i) => logIn(email, `guess ${i}`, '203.0.113.77')));
    expect(all.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    expect(all.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(25);
  }, 60_000);

  test('one address alone cannot lock the email, however often it tries', async () => {
    const email = await newAccount();
    for (let i = 0; i < 60; i++) await logIn(email, `again ${i}`, '203.0.113.88'); // 5 checked, 55 refused
    expect((await logIn(email, PASSWORD, '198.51.100.21')).status).toBe(200);
  }, 60_000);

  test('guessing spread over many addresses locks the email for an hour', async () => {
    const email = await newAccount();
    for (let a = 0; a < 10; a++) for (let i = 0; i < 5; i++) expect((await logIn(email, `spread ${a}-${i}`, `192.0.2.${a + 1}`)).status).toBe(401);
    const r = await logIn(email, PASSWORD, '198.51.100.22'); // the 51st try for this email
    expect(r.status).toBe(429);
    expect(r.body.error).toContain('an hour');
  }, 90_000);
});
