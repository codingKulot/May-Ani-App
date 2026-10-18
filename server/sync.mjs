// Farm data that follows the account: farms, plans, tasks, money records, harvests, health log, own items and a few choices.
// The app sends what changed on the phone and gets back what changed elsewhere (POST /api/sync, needs a login).
//   * One MongoDB document per account in collection `appdata` (_id = the user's id), holding a list of records.
//   * Each record: { c: collection, id, t: when it was changed (ms), s: the save number that wrote it, d: the record as JSON text }
//     or, for something deleted, { c, id, t, s, del: true }. Deleted marks are kept 180 days so other phones learn about it.
//   * The record itself is stored as JSON text, so nothing the app sends can become a database key or operator.
//   * Conflict rule (same record changed on two phones): the change with the later time wins; a tie keeps the account's copy.
//     The losing phone gets the winning copy back in the same answer.
//   * Size: at most SYNC_MAX_BYTES per account. A save that would go over is refused as a whole, nothing is half-saved.

// Keep these in sync with src/services/sync/records.ts (a unit test checks this).
export const SYNC_COLLECTIONS = ['farms', 'plans', 'tasks', 'expenses', 'sales', 'production', 'healthLog', 'customItems', 'prefs'];
export const PREF_IDS = ['permitProgress', 'permitSector', 'marketOverrides', 'watchlist', 'materialPrices'];
export const SYNC_MAX_BYTES = 2 * 1024 * 1024;
export const RECORD_MAX_BYTES = 256 * 1024;
export const MAX_CHANGES = 5000;

const BODY_MAX = 3 * 1024 * 1024; // the records plus the JSON around them
const RECORD_OVERHEAD = 40; // collection name, id, times
const TOMBSTONE_MS = 180 * 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const SAVE_TRIES = 5;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const keyOf = (r) => `${r.c}/${r.id}`;
const sizeOf = (r) => RECORD_OVERHEAD + r.id.length + (r.d ? Buffer.byteLength(r.d) : 0);
export const totalBytes = (records) => records.reduce((n, r) => n + sizeOf(r), 0);

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const tooBig = (message) => Object.assign(new Error(message), { status: 413, tooBig: true });

/** Checks the request and turns it into clean changes. Throws a 400 (or 413) error with a reason. */
export function cleanRequest(body, now = Date.now()) {
  if (!isPlainObject(body)) throw bad('Send an object.');
  const since = body.since ?? 0;
  if (!Number.isSafeInteger(since) || since < 0) throw bad('"since" must be a whole number.');
  const raw = body.changes ?? [];
  if (!Array.isArray(raw)) throw bad('"changes" must be a list.');
  if (raw.length > MAX_CHANGES) throw tooBig(`Too many changes at once (at most ${MAX_CHANGES}).`);
  const seen = new Set();
  const changes = raw.map((ch, i) => {
    const where = `Change ${i + 1}`;
    if (!isPlainObject(ch)) throw bad(`${where} is not an object.`);
    if (!SYNC_COLLECTIONS.includes(ch.c)) throw bad(`${where}: unknown collection.`);
    if (typeof ch.id !== 'string' || !ID_RE.test(ch.id)) throw bad(`${where}: the id is not valid.`);
    if (ch.c === 'prefs' && !PREF_IDS.includes(ch.id)) throw bad(`${where}: unknown setting.`);
    if (typeof ch.t !== 'number' || !Number.isFinite(ch.t) || ch.t <= 0) throw bad(`${where}: the time is not valid.`);
    const key = keyOf(ch);
    if (seen.has(key)) throw bad(`${where}: the same record was sent twice.`);
    seen.add(key);
    const t = Math.min(Math.round(ch.t), now); // a phone clock that runs ahead cannot win every future conflict
    if (ch.del === true) {
      if (ch.d !== undefined) throw bad(`${where}: a deleted record cannot have data.`);
      return { c: ch.c, id: ch.id, t, del: true };
    }
    if (!isPlainObject(ch.d)) throw bad(`${where}: the record must be an object.`);
    if (ch.d.id !== ch.id) throw bad(`${where}: the record id does not match.`);
    const d = JSON.stringify(ch.d);
    if (Buffer.byteLength(d) > RECORD_MAX_BYTES) throw tooBig(`${where} is too big (at most ${RECORD_MAX_BYTES / 1024} KB per item).`);
    return { c: ch.c, id: ch.id, t, d };
  });
  return { since, changes };
}

/**
 * Applies changes to the stored records. Pure: returns the new list and what to tell the phone.
 * `lost` are account copies that beat (or tied with) the phone's change; the phone must take them.
 */
export function mergeChanges(records, changes, rev, now = Date.now()) {
  const next = records.slice();
  const index = new Map(next.map((r, i) => [keyOf(r), i]));
  const accepted = new Set();
  const lost = [];
  for (const ch of changes) {
    const key = keyOf(ch);
    const i = index.get(key);
    if (i !== undefined && !(ch.t > next[i].t)) { lost.push(next[i]); continue; }
    const rec = ch.del ? { c: ch.c, id: ch.id, t: ch.t, s: rev, del: true } : { c: ch.c, id: ch.id, t: ch.t, s: rev, d: ch.d };
    if (i === undefined) { index.set(key, next.length); next.push(rec); } else next[i] = rec;
    accepted.add(key);
  }
  const kept = next.filter((r) => !(r.del && r.t < now - TOMBSTONE_MS));
  return { records: kept, accepted, lost, bytes: totalBytes(kept) };
}

const toWire = (r) => (r.del ? { c: r.c, id: r.id, t: r.t, del: true } : { c: r.c, id: r.id, t: r.t, d: JSON.parse(r.d) });

/** What the phone has not seen yet: everything saved after `since`, minus its own accepted changes, plus the copies that beat it. */
function answerFor(records, since, accepted, lost) {
  const out = new Map();
  for (const r of records) if (r.s > since && !accepted.has(keyOf(r))) out.set(keyOf(r), r);
  for (const r of lost) out.set(keyOf(r), r);
  return [...out.values()].map(toWire);
}

/**
 * Builds the /api/sync handler. `store` is the accounts store from auth.mjs (userForToken, loadAppData, saveAppData).
 * `helpers` are the server's own json/readJson/limited functions.
 */
export function syncRoutes(store, { json, readJson, limited }, { perMinute = 120, dbProblem = () => '' } = {}) {
  async function sync(req, res) {
    if (limited(req, 'sync', perMinute)) return json(res, 429, { error: 'Too many saves in a minute. Please wait a little.' });
    const user = await store.userForToken((req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim());
    if (!user) return json(res, 401, { error: 'Please log in again.' });
    let body;
    try {
      body = await readJson(req, BODY_MAX);
    } catch (e) {
      if (e.status === 413) return json(res, 413, { error: 'Your farm data is too big to save to your account in one go.', code: 'too_big', limit: SYNC_MAX_BYTES });
      throw e;
    }
    const now = Date.now();
    let since, changes;
    try {
      ({ since, changes } = cleanRequest(body, now));
    } catch (e) {
      if (!e.status) throw e;
      return json(res, e.status, { error: e.message, ...(e.tooBig ? { code: 'too_big', limit: SYNC_MAX_BYTES } : {}) });
    }

    for (let attempt = 0; attempt < SAVE_TRIES; attempt++) {
      const doc = await store.loadAppData(user._id);
      const rev = doc?.rev ?? 0;
      const records = doc?.records ?? [];
      // The account was reset (for example a restored database): the phone must start over and send everything again.
      if (since > rev) return json(res, 200, { rev, records: records.map(toWire), bytes: totalBytes(records), limit: SYNC_MAX_BYTES, reset: true });
      const merged = mergeChanges(records, changes, rev + 1, now);
      if (merged.accepted.size === 0) {
        return json(res, 200, { rev, records: answerFor(records, since, merged.accepted, merged.lost), bytes: totalBytes(records), limit: SYNC_MAX_BYTES });
      }
      if (merged.bytes > SYNC_MAX_BYTES && merged.bytes > totalBytes(records)) {
        return json(res, 413, {
          error: `Your farm data is too big for your account (${(merged.bytes / 1048576).toFixed(1)} MB, the limit is ${SYNC_MAX_BYTES / 1048576} MB). Delete old plans or records you no longer need.`,
          code: 'too_big', bytes: merged.bytes, limit: SYNC_MAX_BYTES,
        });
      }
      // Saved only if nobody else saved in between (two phones at the same moment); otherwise read again and redo the merge.
      if (await store.saveAppData(user._id, rev, { rev: rev + 1, records: merged.records, bytes: merged.bytes })) {
        return json(res, 200, { rev: rev + 1, records: answerFor(merged.records, since, merged.accepted, merged.lost), bytes: merged.bytes, limit: SYNC_MAX_BYTES });
      }
    }
    json(res, 409, { error: 'Your account was busy saving from another phone. Please try again.' });
  }

  return async function handleSync(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
    try {
      await sync(req, res);
    } catch (e) {
      const problem = dbProblem(e);
      if (!problem) throw e;
      console.error(`Sync: ${problem} (${e.message})`);
      if (!res.headersSent) json(res, 503, { error: 'The account database cannot be reached right now. Your changes are safe on this phone.' });
    }
  };
}
