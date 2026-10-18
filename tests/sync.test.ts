import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { initialState } from '@/core/store';
import { generatePlan } from '@/services/planner';
import { DEFAULT_PLACE } from '@/data/places';
import {
  applyRecords, collectRecords, keyOf, MAX_CHANGES, PREF_IDS, RECORD_MAX_BYTES, SYNC_COLLECTIONS, SYNC_MAX_BYTES, utf8Bytes, validRecord,
  type WireRecord,
} from '@/services/sync/records';
import { changesFrom, emptyMeta, planLink, scan, syncOnce, type SyncIO, type SyncMeta } from '@/services/sync/engine';
import { agoText, syncWords } from '@/components/SyncStatus';
import type { AppState, Expense, Farm, PlanInput, SavedPlan } from '@/types';
import { call, OFF, startServer as startTestServer } from './support/server';

/**
 * Farm data that follows the account. Pure rules first, then the real server process with a throwaway MongoDB
 * (mongodb-memory-server), like tests/auth.test.ts. It never touches the owner's database: MONGODB_URI is always set here.
 * "Phones" in these tests are plain objects that run the same sync engine as the app (src/services/sync/engine.ts).
 */

// ------------------------------------------------------------------ sample data
const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'well', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const planInput: PlanInput = { name: 'Backyard', sector: 'crops', areaSqm: 200, capital: 40000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family_sell', site, photoCount: 0 };
let seq = 0;
const nid = (p: string) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;
const farm = (name = 'Rice field'): Farm => ({ id: nid('farm'), name, sector: 'crops', areaSqm: 500, location: DEFAULT_PLACE, createdAt: '2026-10-01T00:00:00.000Z' });
const expense = (amount: number, farmId?: string): Expense => ({ id: nid('exp'), farmId, date: '2026-10-02', category: 'Seeds', note: 'seeds', amount });
const plan = (): SavedPlan => ({ id: nid('plan'), createdAt: new Date().toISOString(), input: planInput, result: generatePlan(planInput) });

/** A phone with a bit of everything that should follow the account. */
function fullState(): AppState {
  const f = farm();
  return {
    ...initialState(),
    farms: [f],
    activeFarmId: f.id,
    plans: [plan(), plan()],
    tasks: [{ id: nid('task'), farmId: f.id, title: 'Weed the beds', date: '2026-10-03', done: false }],
    expenses: [expense(300, f.id), expense(200, f.id), expense(100, f.id)], // newest first, as the app keeps them
    sales: [{ id: nid('sale'), farmId: f.id, date: '2026-10-04', itemId: 'pechay', kg: 10, pricePerKg: 40 }],
    production: [{ id: nid('prod'), farmId: f.id, itemId: 'pechay', areaSqm: 20, plantedOn: '2026-09-01' }],
    healthLog: [{ id: nid('hl'), farmId: f.id, date: '2026-10-05', kind: 'plant', title: 'Leaf spot', confidence: 60, source: 'rules', resolved: false }],
    customItems: [{
      id: 'custom-calamansi', name: 'Calamansi', sector: 'crops', category: 'My own', emoji: '🌱', daysToHarvest: 300, cycleDays: 900, minAreaSqm: 10,
      startupCostPerSqm: 50, opCostPerSqmMonth: 5, yieldKgPerSqm: 2, farmGatePerKg: 60, waterLPerSqmDay: 4, difficulty: 2, areaKind: 'bed', notes: '', custom: true,
    }],
    watchlist: ['pechay'],
    permitProgress: { 'brgy-clearance': true },
    materialPrices: { lumber_2x2: 85 },
    settings: { apiBase: 'https://phone-a.example', marketFeedUrl: '', units: 'metric' },
  };
}

/** The parts of the state that sync, for comparing two phones. */
const synced = (s: AppState) => ({
  farms: s.farms, plans: s.plans, tasks: s.tasks, expenses: s.expenses, sales: s.sales, production: s.production, healthLog: s.healthLog,
  customItems: s.customItems, permitProgress: s.permitProgress, permitSector: s.permitSector, marketOverrides: s.marketOverrides,
  watchlist: s.watchlist, materialPrices: s.materialPrices,
});

// ------------------------------------------------------------------ rules shared by app and server
describe('the app and the server agree on the sync rules', () => {
  const server = readFileSync(new URL('../server/sync.mjs', import.meta.url), 'utf8');
  const list = (name: string) => JSON.parse((new RegExp(`export const ${name} = (\\[[^\\]]*\\])`).exec(server)?.[1] ?? '[]').replace(/'/g, '"'));
  const num = (name: string) => {
    const expr = new RegExp(`export const ${name} = ([\\d\\s*]+);`).exec(server)?.[1] ?? 'NaN';
    return expr.split('*').reduce((a, b) => a * Number(b.trim()), 1);
  };
  test('same collections and settings', () => {
    expect(list('SYNC_COLLECTIONS')).toEqual([...SYNC_COLLECTIONS]);
    expect(list('PREF_IDS')).toEqual([...PREF_IDS]);
  });
  test('same limits', () => {
    expect(num('SYNC_MAX_BYTES')).toBe(SYNC_MAX_BYTES);
    expect(num('RECORD_MAX_BYTES')).toBe(RECORD_MAX_BYTES);
    expect(num('MAX_CHANGES')).toBe(MAX_CHANGES);
  });
  test('every synced collection exists in the app state, and device-only things are left out', () => {
    const s = initialState() as unknown as Record<string, unknown>;
    for (const c of SYNC_COLLECTIONS) if (c !== 'prefs') expect(Array.isArray(s[c])).toBe(true);
    for (const p of PREF_IDS) expect(p in s).toBe(true);
    const all = [...SYNC_COLLECTIONS, ...PREF_IDS] as string[];
    for (const deviceOnly of ['settings', 'profile', 'activeFarmId', 'chats', 'contacts']) expect(all).not.toContain(deviceOnly);
  });
});

// ------------------------------------------------------------------ pure rules (no server)
describe('records on the phone', () => {
  test('lists travel oldest first and settings travel as their own records; server address does not travel', () => {
    const s = fullState();
    const { records } = collectRecords(s);
    const expenseIds = [...records.values()].filter((r) => r.c === 'expenses').map((r) => r.id);
    expect(expenseIds).toEqual([...s.expenses].reverse().map((e) => e.id));
    expect(records.get('prefs/watchlist')!.d).toEqual({ id: 'watchlist', value: ['pechay'] });
    expect(JSON.stringify([...records.values()])).not.toContain('phone-a.example');
  });

  test('a record that is too big is flagged, not treated as deleted', () => {
    const s = { ...initialState(), farms: [{ ...farm(), notes: 'x'.repeat(RECORD_MAX_BYTES) }] };
    const { records, tooBig } = collectRecords(s);
    expect(records.has(keyOf('farms', s.farms[0].id))).toBe(false);
    expect(tooBig.has(keyOf('farms', s.farms[0].id))).toBe(true);
    const meta = emptyMeta('acc');
    meta.recs[keyOf('farms', s.farms[0].id)] = { h: 'old', t: 1 };
    scan(meta, s, 10);
    expect(meta.dels).toEqual({});
  });

  test('UTF-8 size is counted like the server counts it', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('ñ')).toBe(2);
    expect(utf8Bytes('₱')).toBe(3);
    expect(utf8Bytes('🌱')).toBe(4);
  });

  test('records from the account are checked before they enter the app', () => {
    const f = farm();
    expect(validRecord({ c: 'farms', id: f.id, t: 1, d: f })).toBe(true);
    expect(validRecord({ c: 'farms', id: f.id, t: 1, del: true })).toBe(true);
    expect(validRecord({ c: 'farms', id: f.id, t: 1, d: { ...f, location: null } })).toBe(false);
    expect(validRecord({ c: 'farms', id: 'other', t: 1, d: f })).toBe(false);
    expect(validRecord({ c: 'users', id: f.id, t: 1, d: f })).toBe(false);
    expect(validRecord({ c: 'plans', id: 'p', t: 1, d: { id: 'p', createdAt: 'x', input: planInput, result: { title: 'x' } } })).toBe(false);
    const p = plan();
    expect(validRecord({ c: 'plans', id: p.id, t: 1, d: p })).toBe(true);
    expect(validRecord({ c: 'prefs', id: 'watchlist', t: 1, d: { id: 'watchlist', value: ['a'] } })).toBe(true);
    expect(validRecord({ c: 'prefs', id: 'watchlist', t: 1, d: { id: 'watchlist', value: 'a' } })).toBe(false);
    expect(validRecord({ c: 'prefs', id: 'apiBase', t: 1, d: { id: 'apiBase', value: 'x' } })).toBe(false);
  });

  test('new items land where this phone would put them; changes keep their place; deletes remove', () => {
    const s = fullState();
    const newer = expense(999);
    const changed = { ...s.tasks[0], done: true };
    const extraFarm = farm('Fish pond');
    const recs: WireRecord[] = [
      { c: 'expenses', id: newer.id, t: 1, d: newer },
      { c: 'tasks', id: changed.id, t: 1, d: changed },
      { c: 'farms', id: extraFarm.id, t: 1, d: extraFarm },
      { c: 'sales', id: s.sales[0].id, t: 1, del: true },
      { c: 'prefs', id: 'watchlist', t: 1, d: { id: 'watchlist', value: ['tilapia'] } },
    ];
    const out = applyRecords(s, recs);
    expect(out.expenses.map((e) => e.id)).toEqual([newer.id, ...s.expenses.map((e) => e.id)]); // newest first
    expect(out.farms.map((f) => f.id)).toEqual([s.farms[0].id, extraFarm.id]); // farms are kept oldest first
    expect(out.tasks[0].done).toBe(true);
    expect(out.sales).toEqual([]);
    expect(out.watchlist).toEqual(['tilapia']);
    expect(s.sales.length).toBe(1); // pure: the old state is untouched
  });

  test('the active farm moves to a farm that still exists', () => {
    const s = fullState();
    const out = applyRecords(s, [{ c: 'farms', id: s.farms[0].id, t: 1, del: true }]);
    expect(out.activeFarmId).toBeUndefined();
    const other = farm('Second');
    expect(applyRecords({ ...s, activeFarmId: undefined }, [{ c: 'farms', id: other.id, t: 1, d: other }]).activeFarmId).toBe(s.farms[0].id);
  });

  test('noticing changes: new, changed and deleted records are marked, and times never go backwards', () => {
    const s = fullState();
    const meta = emptyMeta('acc');
    scan(meta, s, 1000);
    const all = Object.keys(meta.pending).length;
    expect(all).toBe(collectRecords(s).records.size);
    meta.pending = {};
    const fk = keyOf('farms', s.farms[0].id);
    meta.recs[fk].t = 5000; // this copy came from a phone whose clock is ahead
    const s2 = { ...s, farms: [{ ...s.farms[0], name: 'Renamed' }], sales: [] };
    scan(meta, s2, 2000);
    expect(Object.keys(meta.pending).sort()).toEqual([fk, keyOf('sales', s.sales[0].id)].sort());
    expect(meta.recs[fk].t).toBe(5001);
    expect(meta.dels[keyOf('sales', s.sales[0].id)]).toBe(2000);
  });
});

describe('sending in chunks', () => {
  test('one request carries about 1 MB at most; deletions go first; the rest waits for the next request', () => {
    const farms = Array.from({ length: 6 }, () => ({ ...farm(), notes: 'x'.repeat(250 * 1024) }));
    const s = { ...initialState(), farms };
    const meta = emptyMeta('acc');
    meta.recs['farms/gone'] = { h: 'x', t: 1 };
    const first = changesFrom(meta, scan(meta, s, 1000));
    expect(first.changes[0]).toMatchObject({ c: 'farms', id: 'gone', del: true });
    expect(first.changes.length).toBe(5); // the deletion and 4 farms of 250 KB
    expect(first.more).toBe(true);
    for (const ch of first.changes) delete meta.pending[keyOf(ch.c, ch.id)];
    const second = changesFrom(meta, scan(meta, s, 2000));
    expect(second.changes.map((c) => c.id)).toEqual([farms[4].id, farms[5].id, ...PREF_IDS]);
    expect(second.more).toBe(false);
  });
});

describe('sync words in Settings', () => {
  test('"2 min ago" and friends', () => {
    const now = Date.parse('2026-10-18T12:00:00+08:00');
    expect(agoText(now - 10_000, now)).toBe('just now');
    expect(agoText(now - 2 * 60_000, now)).toBe('2 min ago');
    expect(agoText(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(agoText(now - 5 * 3600_000, now)).toBe('5 hours ago');
    expect(agoText(now - 30 * 3600_000, now)).toBe('yesterday');
    expect(agoText(now - 9 * 86_400_000, now)).toStartWith('on ');
  });
  test('each state says what is going on', () => {
    const now = Date.now();
    expect(syncWords({ state: 'saved', pending: 0, lastSyncedAt: now - 120_000 }, now).text).toBe('Saved to your account 2 min ago.');
    expect(syncWords({ state: 'offline', pending: 3 }, now).text).toStartWith('Waiting for internet. 3 changes are safe on this phone');
    expect(syncWords({ state: 'too_big', pending: 1 }, now).badge).toBe('Account full');
    expect(syncWords({ state: 'off', pending: 0 }, now).tone).toBe('gray');
  });
});

// ------------------------------------------------------------------ server (tests/support/server.ts switches keys and email off)
const startServer = (env: Record<string, string>) => startTestServer({ SYNC_RATE_PER_MIN: '10000', ...env });

describe('server without a database', () => {
  test('sync is refused politely', async () => {
    const srv = await startServer({ MONGODB_URI: OFF });
    try {
      const r = await call(srv, 'POST', '/api/sync', { since: 0, changes: [] }, 'x'.repeat(43));
      expect(r.status).toBe(503);
      expect(r.body.error).toContain('safe on this phone');
    } finally { srv.stop(); }
  });
});

// ------------------------------------------------------------------ real MongoDB
const mongo = await MongoMemoryServer.create().catch((e: Error) => {
  console.warn(`\n[sync tests] SKIPPED the MongoDB tests: a test database could not start (${e.message}).
On Windows this usually means the Microsoft Visual C++ Redistributable (x64) is missing: https://aka.ms/vs/17/release/vc_redist.x64.exe\n`);
  return null;
});
const DB = 'may_ani_sync_test';
const srv = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: DB }) : null;
const client = mongo ? new MongoClient(mongo.getUri()) : null;
const db = client?.db(DB);

afterAll(async () => {
  srv?.stop();
  await client?.close();
  await mongo?.stop();
});

let users = 0;
async function account(): Promise<{ token: string; id: string }> {
  const r = await call(srv!, 'POST', '/api/auth/signup', { name: 'Juan', email: `sync${++users}-${Date.now()}@example.com`, password: 'Tatlong kalabaw sa bukid', role: 'farmer' });
  expect(r.status).toBe(201);
  return { token: r.body.token, id: r.body.user.id };
}
const save = (token: string, body: unknown) => call(srv!, 'POST', '/api/sync', body, token);
const rec = <T extends { id: string }>(c: string, d: T, t = Date.now() - 1000): WireRecord => ({ c: c as WireRecord['c'], id: d.id, t, d });

describe.skipIf(!mongo)('sync endpoint on a real MongoDB', () => {
  test('needs a valid login and POST', async () => {
    expect((await call(srv!, 'POST', '/api/sync', { since: 0, changes: [] })).status).toBe(401);
    expect((await call(srv!, 'POST', '/api/sync', { since: 0, changes: [] }, 'y'.repeat(43))).status).toBe(401);
    const { token } = await account();
    expect((await call(srv!, 'GET', '/api/sync', undefined, token)).status).toBe(405);
  });

  test('a new account starts empty', async () => {
    const { token } = await account();
    expect((await save(token, { since: 0, changes: [] })).body).toEqual({ rev: 0, records: [], bytes: 0, limit: SYNC_MAX_BYTES });
  });

  test('save and load: what one phone saves, another phone gets back exactly', async () => {
    const { token, id } = await account();
    const f = farm();
    const p = plan();
    const r = await save(token, { since: 0, changes: [rec('farms', f), rec('plans', p), rec('prefs', { id: 'watchlist', value: ['pechay'] })] });
    expect(r.status).toBe(200);
    expect(r.body.rev).toBe(1);
    expect(r.body.records).toEqual([]); // the phone's own accepted changes are not sent back
    const fresh = await save(token, { since: 0, changes: [] });
    expect(fresh.body.records.map((x: WireRecord) => x.d)).toEqual([f, p, { id: 'watchlist', value: ['pechay'] }]);
    // stored as JSON text under the user's id, so nothing the app sends can become a database operator
    const doc = await db!.collection('appdata').findOne({ rev: 1, 'records.id': f.id });
    expect(String(doc!._id)).toBe(id);
    expect(typeof doc!.records[0].d).toBe('string');
  });

  test('one account never sees another account\'s data', async () => {
    const a = await account();
    const b = await account();
    await save(a.token, { since: 0, changes: [rec('farms', farm('Secret farm'))] });
    const other = await save(b.token, { since: 0, changes: [] });
    expect(other.body.records).toEqual([]);
    expect(JSON.stringify(other.body)).not.toContain('Secret farm');
  });

  test('bad requests are refused with a reason, and nothing is saved', async () => {
    const { token } = await account();
    const f = farm();
    const cases: unknown[] = [
      '{not json',
      [],
      { since: -1, changes: [] },
      { since: 1.5, changes: [] },
      { since: 0, changes: 'x' },
      { since: 0, changes: [null] },
      { since: 0, changes: [{ ...rec('farms', f), c: 'users' }] },
      { since: 0, changes: [{ ...rec('farms', f), c: '$where' }] },
      { since: 0, changes: [{ ...rec('farms', f), id: '../../etc' }] },
      { since: 0, changes: [{ ...rec('farms', f), id: { $gt: '' } }] },
      { since: 0, changes: [rec('prefs', { id: 'apiBase', value: 'http://evil.example' })] },
      { since: 0, changes: [{ ...rec('farms', f), t: 'now' }] },
      { since: 0, changes: [{ ...rec('farms', f), t: -5 }] },
      { since: 0, changes: [{ ...rec('farms', f), d: [1, 2] }] },
      { since: 0, changes: [{ ...rec('farms', f), d: { ...f, id: 'other-id' } }] },
      { since: 0, changes: [{ c: 'farms', id: f.id, t: 1, del: true, d: f }] },
      { since: 0, changes: [rec('farms', f), rec('farms', f)] },
    ];
    for (const body of cases) {
      const r = await save(token, body);
      expect({ body, status: r.status, hasReason: typeof r.body.error === 'string' }).toEqual({ body, status: 400, hasReason: true });
    }
    expect((await save(token, { since: 0, changes: [] })).body.rev).toBe(0);
  });

  test('size limits: one big item, and the whole account (2 MB); deleting makes room again', async () => {
    const { token } = await account();
    const big = (kb: number) => ({ ...farm(), notes: 'x'.repeat(kb * 1024) });
    const one = await save(token, { since: 0, changes: [rec('farms', big(RECORD_MAX_BYTES / 1024 + 1))] });
    expect(one.status).toBe(413);
    expect(one.body.code).toBe('too_big');

    const nine = Array.from({ length: 9 }, () => big(220)); // about 1.9 MB
    expect((await save(token, { since: 0, changes: nine.map((d) => rec('farms', d)) })).status).toBe(200);
    const over = await save(token, { since: 1, changes: [rec('farms', big(220))] });
    expect(over.status).toBe(413);
    expect(over.body.error).toContain('too big for your account');
    expect((await save(token, { since: 0, changes: [] })).body.rev).toBe(1); // nothing half-saved

    const swap = await save(token, { since: 1, changes: [{ c: 'farms', id: nine[0].id, t: Date.now() - 500, del: true }, rec('farms', big(200))] });
    expect(swap.status).toBe(200);
    expect(swap.body.bytes).toBeLessThanOrEqual(SYNC_MAX_BYTES);
  }, 20_000);

  test('conflict rule: the later change wins; the losing phone gets the winner back; a tie keeps the account copy', async () => {
    const { token } = await account();
    const f = farm('First name');
    const t0 = Date.now() - 60_000;
    await save(token, { since: 0, changes: [rec('farms', f, t0)] });
    // an older change loses, and the answer carries the account's copy
    const older = await save(token, { since: 1, changes: [rec('farms', { ...f, name: 'Older' }, t0 - 1000)] });
    expect(older.body.rev).toBe(1);
    expect(older.body.records).toEqual([rec('farms', f, t0)]);
    // a tie keeps the account's copy too
    const tie = await save(token, { since: 1, changes: [rec('farms', { ...f, name: 'Same time' }, t0)] });
    expect(tie.body.records[0].d.name).toBe('First name');
    // a newer change wins
    const newer = await save(token, { since: 1, changes: [rec('farms', { ...f, name: 'Newer' }, t0 + 1000)] });
    expect(newer.body.rev).toBe(2);
    expect((await save(token, { since: 0, changes: [] })).body.records[0].d.name).toBe('Newer');
  });

  test('only what changed since the phone last synced comes back', async () => {
    const { token } = await account();
    const [a, b] = [farm('A'), farm('B')];
    await save(token, { since: 0, changes: [rec('farms', a)] });
    await save(token, { since: 1, changes: [rec('farms', b)] });
    const delta = await save(token, { since: 1, changes: [] });
    expect(delta.body.records.map((r: WireRecord) => r.id)).toEqual([b.id]);
    expect((await save(token, { since: 2, changes: [] })).body.records).toEqual([]);
  });

  test('a phone clock that runs ahead cannot win every future conflict', async () => {
    const { token } = await account();
    const f = farm();
    await save(token, { since: 0, changes: [rec('farms', f, Date.now() + 365 * 86_400_000)] });
    const stored = (await save(token, { since: 0, changes: [] })).body.records[0];
    expect(stored.t).toBeLessThanOrEqual(Date.now());
  });

  test('deletions are kept so other phones learn about them; very old ones are dropped', async () => {
    const { token } = await account();
    const [f, old] = [farm(), farm()];
    await save(token, { since: 0, changes: [rec('farms', f), rec('farms', old)] });
    await save(token, { since: 1, changes: [{ c: 'farms', id: f.id, t: Date.now(), del: true }, { c: 'farms', id: old.id, t: Date.now() - 200 * 86_400_000, del: true }] });
    const all = (await save(token, { since: 0, changes: [] })).body.records;
    expect(all.find((r: WireRecord) => r.id === f.id)).toMatchObject({ del: true });
    expect(all.find((r: WireRecord) => r.id === f.id).d).toBeUndefined();
    // the 200-day-old deletion lost to the newer copy (its time is older), so the farm stays
    expect(all.find((r: WireRecord) => r.id === old.id).d).toEqual(old);
  });

  test('two phones saving at the same moment both land', async () => {
    const { token } = await account();
    const farms = Array.from({ length: 6 }, (_, i) => farm(`Farm ${i}`));
    const results = await Promise.all(farms.map((f) => save(token, { since: 0, changes: [rec('farms', f)] })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const all = await save(token, { since: 0, changes: [] });
    expect(all.body.rev).toBe(6);
    expect(all.body.records.map((r: WireRecord) => r.id).sort()).toEqual(farms.map((f) => f.id).sort());
  });

  test('a phone that is ahead of the account (restored database) is told to start over', async () => {
    const { token } = await account();
    await save(token, { since: 0, changes: [rec('farms', farm())] });
    const r = await save(token, { since: 99, changes: [] });
    expect(r.body.reset).toBe(true);
    expect(r.body.records.length).toBe(1);
  });

  test('too many saves in a minute are slowed down', async () => {
    const limited = await startServer({ MONGODB_URI: mongo!.getUri(), MONGODB_DB: DB, SYNC_RATE_PER_MIN: '2' });
    try {
      const { token } = await account();
      const codes = [];
      for (let i = 0; i < 3; i++) codes.push((await call(limited, 'POST', '/api/sync', { since: 0, changes: [] }, token)).status);
      expect(codes).toEqual([200, 200, 429]);
    } finally { limited.stop(); }
  });
});

// ------------------------------------------------------------------ two phones, the app's own sync engine
interface Phone { state: AppState; meta: SyncMeta | null; token: string; accountId: string; offline?: boolean; skew?: number; duringFlight?: () => void }

const phoneIO = (p: Phone): SyncIO => ({
  read: () => p.state,
  write: (fn) => { p.state = fn(p.state); },
  now: () => Date.now() + (p.skew ?? 0),
  send: async (body) => {
    if (p.offline) throw new TypeError('Failed to fetch');
    const r = await save(p.token, body);
    if (r.status !== 200) throw new Error(`sync answered ${r.status}: ${JSON.stringify(r.body)}`);
    const during = p.duringFlight;
    p.duringFlight = undefined;
    during?.();
    return r.body;
  },
});

/** One sync like the app does it (repeats while there is more to send). Offline: the changes stay marked on the phone. */
async function sync(p: Phone) {
  for (let i = 0; i < 5; i++) {
    try {
      const out = await syncOnce(phoneIO(p), p.meta, p.accountId, true);
      p.meta = out.meta;
      if (!out.more) return out;
    } catch (e) {
      if (!p.offline) throw e;
      return null;
    }
  }
  return null;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const newPhone = (acc: { token: string; id: string }, state = initialState()): Phone => ({ state, meta: null, token: acc.token, accountId: acc.id });

describe.skipIf(!mongo)('two phones with the same account', () => {
  test('data made on phone A appears on phone B after logging in there (empty phone)', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    const out = await sync(a);
    expect(out!.sent).toBe(collectRecords(a.state).records.size);
    const b = newPhone(acc);
    await sync(b);
    expect(synced(b.state)).toEqual(synced(a.state)); // same records, same order
    expect(b.state.activeFarmId).toBe(a.state.farms[0].id);
    expect(b.state.settings.apiBase).toBe(''); // device settings stay on their own phone
  });

  test('edits and deletions travel both ways, and lists keep their order', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const b = newPhone(acc);
    await sync(b);
    // A: ticks a task, deletes an expense, adds a newer expense. B: renames the farm.
    const added = expense(777, a.state.farms[0].id);
    a.state = { ...a.state, tasks: a.state.tasks.map((t) => ({ ...t, done: true })), expenses: [added, ...a.state.expenses.slice(1)] };
    b.state = { ...b.state, farms: b.state.farms.map((f) => ({ ...f, name: 'Bukid ni Juan' })) };
    await sync(a); await sync(b); await sync(a);
    expect(synced(a.state)).toEqual(synced(b.state));
    expect(b.state.tasks[0].done).toBe(true);
    expect(b.state.expenses[0].id).toBe(added.id);
    expect(a.state.farms[0].name).toBe('Bukid ni Juan');
  });

  test('same record changed on both phones while one was offline: the later change wins, even if it reached the account first', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const b = newPhone(acc);
    await sync(b);
    a.offline = true;
    a.state = { ...a.state, farms: a.state.farms.map((f) => ({ ...f, name: 'A, offline, earlier' })) };
    await sync(a); // no internet: the change waits on phone A, with the time it was made
    await tick();
    b.state = { ...b.state, farms: b.state.farms.map((f) => ({ ...f, name: 'B, later' })) };
    await sync(b);
    a.offline = false;
    await sync(a);
    expect(a.state.farms[0].name).toBe('B, later');
    expect(synced(a.state)).toEqual(synced(b.state));

    // and the other way round: the offline phone made the later change, so it wins when it comes back
    b.state = { ...b.state, farms: b.state.farms.map((f) => ({ ...f, name: 'B, earlier' })) };
    await sync(b);
    a.offline = true;
    await tick();
    a.state = { ...a.state, farms: a.state.farms.map((f) => ({ ...f, name: 'A, offline, later' })) };
    await sync(a);
    a.offline = false;
    await sync(a); await sync(b);
    expect(b.state.farms[0].name).toBe('A, offline, later');
    expect(synced(a.state)).toEqual(synced(b.state));
  });

  test('a phone whose clock is behind still wins when it edits after seeing the latest copy', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const b = { ...newPhone(acc), skew: -3600_000 }; // one hour behind
    await sync(b);
    b.state = { ...b.state, tasks: b.state.tasks.map((t) => ({ ...t, title: 'Edited on the slow phone' })) };
    await sync(b); await sync(a);
    expect(a.state.tasks[0].title).toBe('Edited on the slow phone');
  });

  test('an edit made while a sync is on its way is kept and sent next time, not overwritten', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const b = newPhone(acc);
    await sync(b);
    b.state = { ...b.state, expenses: b.state.expenses.map((e) => ({ ...e, note: 'from B' })) };
    await sync(b);
    a.duringFlight = () => { a.state = { ...a.state, expenses: a.state.expenses.map((e, i) => (i === 0 ? { ...e, note: 'typed on A during the sync' } : e)) }; };
    await sync(a);
    expect(a.state.expenses[0].note).toBe('typed on A during the sync');
    expect(a.state.expenses[1].note).toBe('from B');
    await sync(a); await sync(b);
    expect(b.state.expenses[0].note).toBe('typed on A during the sync');
    expect(synced(a.state)).toEqual(synced(b.state));
  });

  test('first log-in on a phone that already has its own data: the person is asked; "keep both" keeps both', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const guestFarm = farm('Guest farm');
    const c = newPhone(acc, { ...initialState(), farms: [guestFarm], watchlist: ['tilapia'] });
    const plan1 = planLink(phoneIO(c), acc.id, (await save(acc.token, { since: 0, changes: [] })).body);
    expect(plan1.ask).toBe(true);
    expect(plan1.phoneOnly).toBe(1); // settings like the watch list are not counted
    expect(plan1.inAccount).toBe(collectRecords(a.state).records.size - PREF_IDS.length);
    c.meta = plan1.finish('combine');
    expect(c.state.farms.map((f) => f.name)).toEqual([a.state.farms[0].name, 'Guest farm']); // the account's first, then this phone's
    expect(c.state.watchlist).toEqual(['pechay']); // for things on both sides, the account's copy wins
    await sync(c); await sync(a);
    expect(a.state.farms.map((f) => f.id)).toContain(guestFarm.id);
    expect(synced(a.state)).toEqual(synced(c.state));
  });

  test('"use only my account" removes what was only on this phone', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const d = newPhone(acc, { ...initialState(), farms: [farm('Neighbour farm')], expenses: [expense(5)] });
    const link = planLink(phoneIO(d), acc.id, (await save(acc.token, { since: 0, changes: [] })).body);
    expect(link.phoneOnly).toBe(2);
    d.meta = link.finish('account');
    await sync(d);
    expect(synced(d.state)).toEqual(synced(a.state));
    await sync(a);
    expect(a.state.farms.map((f) => f.name)).not.toContain('Neighbour farm');
  });

  test('logging in again on the same phone with the same data asks nothing', async () => {
    const acc = await account();
    const a = newPhone(acc, fullState());
    await sync(a);
    const again = planLink(phoneIO({ ...a, meta: null }), acc.id, (await save(acc.token, { since: 0, changes: [] })).body);
    expect(again.ask).toBe(false);
    expect(again.phoneOnly).toBe(0);
  });

  test('a new account gets everything the phone has, without a question', async () => {
    const acc = await account();
    const guest = newPhone(acc, fullState());
    const link = planLink(phoneIO(guest), acc.id, (await save(acc.token, { since: 0, changes: [] })).body);
    expect(link.ask).toBe(false);
    guest.meta = link.finish('combine');
    await sync(guest);
    const b = newPhone(acc);
    await sync(b);
    expect(synced(b.state)).toEqual(synced(guest.state));
  });

  test('a phone with more data than an account holds saves what fits, then gets "too big" (not "no internet")', async () => {
    const acc = await account();
    const farms = Array.from({ length: 12 }, () => ({ ...farm(), notes: 'x'.repeat(220 * 1024) })); // about 2.6 MB
    const a = newPhone(acc, { ...initialState(), farms });
    const err = await sync(a).then(() => null, (e: Error) => e);
    expect(err?.message).toContain('413');
    expect(err?.message).toContain('too big for your account');
    const saved = (await save(acc.token, { since: 0, changes: [] })).body;
    expect(saved.bytes).toBeLessThanOrEqual(SYNC_MAX_BYTES);
    expect(saved.records.length).toBeGreaterThanOrEqual(8);
  }, 20_000);

  test('a broken record in the account is left out instead of crashing the phone', async () => {
    const acc = await account();
    const good = farm('Good');
    await save(acc.token, { since: 0, changes: [rec('farms', good), rec('farms', { id: 'broken-farm', name: 42 })] });
    const b = newPhone(acc);
    await sync(b);
    expect(b.state.farms).toEqual([good]);
  });

  test('a phone that was linked to another account starts over instead of mixing accounts', async () => {
    const first = await account();
    const second = await account();
    const a = newPhone(first, fullState());
    await sync(a);
    const sameDevice: Phone = { ...a, token: second.token, accountId: second.id }; // meta still says "first"
    await sync(sameDevice);
    expect(sameDevice.meta!.accountId).toBe(second.id);
    // the phone's data went to the second account as a "keep both" link, and the first account is unchanged
    const b = newPhone(second);
    await sync(b);
    expect(synced(b.state)).toEqual(synced(a.state));
  });
});
