import type { AppState } from '@/types';

/**
 * Which parts of the app state follow the account, and how they travel: as separate records ("farms/<id>", "prefs/watchlist"...),
 * so two phones can change different things without overwriting each other. Not synced: the profile (the account has it),
 * settings like the server address (they belong to one phone), the active farm, chat, and photos (IndexedDB, too big).
 */

// Keep these in sync with server/sync.mjs (a unit test checks this).
export const SYNC_COLLECTIONS = ['farms', 'plans', 'tasks', 'expenses', 'sales', 'production', 'healthLog', 'customItems', 'prefs'] as const;
export const PREF_IDS = ['permitProgress', 'permitSector', 'marketOverrides', 'watchlist', 'materialPrices'] as const;
export const SYNC_MAX_BYTES = 2 * 1024 * 1024;
export const RECORD_MAX_BYTES = 256 * 1024;
export const MAX_CHANGES = 5000;
/** One request carries at most about this much, so a slow connection or a full account gets a clear answer. */
export const CHUNK_BYTES = 1024 * 1024;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];
export type ListCollection = Exclude<SyncCollection, 'prefs'>;
export type PrefId = (typeof PREF_IDS)[number];
export const LIST_COLLECTIONS = SYNC_COLLECTIONS.filter((c): c is ListCollection => c !== 'prefs');

/** New items go at the front of these lists (newest first) and at the end of the others, as in core/actions.ts. */
const NEWEST_FIRST: ReadonlySet<ListCollection> = new Set(['plans', 'expenses', 'sales', 'healthLog']);

type Data = Record<string, any>;

/** A record as it travels to and from the server. `t` is when it was last changed (ms). */
export interface WireRecord {
  c: SyncCollection;
  id: string;
  t: number;
  d?: Data;
  del?: true;
}

/** A record as it is on this phone right now. `h` is a hash of its JSON, used to notice changes; `bytes` is its size. */
export interface LocalRecord {
  c: SyncCollection;
  id: string;
  d: Data;
  h: string;
  bytes: number;
}

export const keyOf = (c: string, id: string) => `${c}/${id}`;
export const splitKey = (k: string): [SyncCollection, string] => {
  const i = k.indexOf('/');
  return [k.slice(0, i) as SyncCollection, k.slice(i + 1)];
};
export const isPrefKey = (k: string) => k.startsWith('prefs/');

/** cyrb53: a fast 53-bit hash of a string. Only used to notice that a record changed, never for security. */
export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Size of a string in UTF-8 bytes (what the server counts), without making a copy. */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } // a pair of UTF-16 units is one 4-byte character
    else n += 3;
  }
  return n;
}

const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * Everything on this phone that follows the account, oldest first (the order the account keeps, so a new phone gets
 * the lists in the same order). `tooBig` lists records that exist but cannot be sent; they must not be taken as deleted.
 */
export function collectRecords(s: AppState): { records: Map<string, LocalRecord>; tooBig: Set<string> } {
  const records = new Map<string, LocalRecord>();
  const tooBig = new Set<string>();
  const add = (c: SyncCollection, d: Data) => {
    const json = JSON.stringify(d);
    const k = keyOf(c, d.id);
    const bytes = utf8Bytes(json);
    if (bytes > RECORD_MAX_BYTES) tooBig.add(k);
    else records.set(k, { c, id: d.id, d, h: hash(json), bytes });
  };
  for (const c of LIST_COLLECTIONS) {
    const list = (s[c] ?? []) as Data[];
    for (const item of NEWEST_FIRST.has(c) ? [...list].reverse() : list) {
      if (item && typeof item.id === 'string' && ID_RE.test(item.id)) add(c, item);
    }
  }
  for (const p of PREF_IDS) add('prefs', { id: p, value: s[p] });
  return { records, tooBig };
}

// ------------------------------------------------------------------ checks for records coming from the account
// The server only checks the envelope (collection, id, size). These checks stop a broken or very old record from crashing a page.
const isObj = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPlace = (v: unknown) => isObj(v) && isStr(v.name) && isNum(v.lat) && isNum(v.lon);
const SECTORS = ['crops', 'fish', 'livestock'];
const ITEM_NUMBERS = ['daysToHarvest', 'cycleDays', 'minAreaSqm', 'startupCostPerSqm', 'opCostPerSqmMonth', 'yieldKgPerSqm', 'farmGatePerKg', 'waterLPerSqmDay'];

const GUARDS: Record<ListCollection, (d: Data) => boolean> = {
  farms: (d) => isStr(d.name) && SECTORS.includes(d.sector) && isNum(d.areaSqm) && isPlace(d.location) && isStr(d.createdAt),
  plans: (d) => {
    const r = d.result;
    return isStr(d.createdAt) && isObj(d.input) && SECTORS.includes(d.input.sector) && isPlace(d.input.location) && isObj(d.input.site)
      && isObj(r) && isStr(r.title) && Array.isArray(r.allocations) && isObj(r.cost) && isObj(r.layout) && Array.isArray(r.layout.rects)
      && isObj(r.water) && isObj(r.drainage) && isObj(r.electrical) && Array.isArray(r.schedule) && Array.isArray(r.warnings) && Array.isArray(r.assumptions);
  },
  tasks: (d) => isStr(d.title) && isStr(d.date) && isBool(d.done),
  expenses: (d) => isStr(d.date) && isStr(d.category) && isStr(d.note) && isNum(d.amount),
  sales: (d) => isStr(d.date) && isStr(d.itemId) && isNum(d.kg) && isNum(d.pricePerKg),
  production: (d) => isStr(d.itemId) && isNum(d.areaSqm) && isStr(d.plantedOn),
  healthLog: (d) => isStr(d.date) && ['plant', 'animal', 'fish'].includes(d.kind) && isStr(d.title) && isNum(d.confidence) && isBool(d.resolved),
  customItems: (d) => isStr(d.name) && SECTORS.includes(d.sector) && ITEM_NUMBERS.every((k) => isNum(d[k])),
};

const PREF_GUARDS: Record<PrefId, (v: unknown) => boolean> = {
  permitProgress: (v) => isObj(v) && Object.values(v).every(isBool),
  permitSector: (v) => ['agriculture', 'aquaculture', 'livestock', 'processing'].includes(v as string),
  marketOverrides: (v) => isObj(v) && Object.values(v).every(isObj),
  watchlist: (v) => Array.isArray(v) && v.every(isStr),
  materialPrices: (v) => isObj(v) && Object.values(v).every(isNum),
};

/** True when a record from the account is safe to put into the app. */
export function validRecord(r: unknown): r is WireRecord {
  if (!isObj(r) || !SYNC_COLLECTIONS.includes(r.c) || !isStr(r.id) || !isNum(r.t)) return false;
  if (r.del === true) return r.d === undefined;
  if (!isObj(r.d) || r.d.id !== r.id) return false;
  if (r.c === 'prefs') return (PREF_IDS as readonly string[]).includes(r.id) && PREF_GUARDS[r.id as PrefId](r.d.value);
  return GUARDS[r.c as ListCollection](r.d);
}

/**
 * The part of a backup file that is safe to restore: only the farm data that follows the account (never the profile,
 * the login or settings such as the server address), each item checked like a record from the account, so a damaged or
 * doctored file cannot crash a page or point the app at someone else's server. `skipped` counts the items left out.
 */
export function cleanBackup(file: Data): { patch: Partial<AppState>; skipped: number } {
  const patch: Data = {};
  let skipped = 0;
  for (const c of LIST_COLLECTIONS) {
    if (!Array.isArray(file[c])) continue;
    const seen = new Set<string>();
    patch[c] = file[c].filter((d: unknown) => {
      const ok = isObj(d) && isStr(d.id) && ID_RE.test(d.id) && !seen.has(d.id) && GUARDS[c](d);
      if (ok) seen.add(d.id); else skipped++;
      return ok;
    });
  }
  for (const p of PREF_IDS) {
    if (!(p in file)) continue;
    if (PREF_GUARDS[p](file[p])) patch[p] = file[p]; else skipped++;
  }
  return { patch: patch as Partial<AppState>, skipped };
}

/** Puts records from the account into the app state (pure). New items land where this phone would have put them. */
export function applyRecords(s: AppState, recs: WireRecord[]): AppState {
  if (!recs.length) return s;
  const next: Data = { ...s };
  for (const c of LIST_COLLECTIONS) {
    const mine = recs.filter((r) => r.c === c);
    if (!mine.length) continue;
    const body = new Map<string, Data>(((s[c] ?? []) as Data[]).map((x) => [x.id, x]));
    const head = new Map<string, Data>(); // new newest-first items, in the order they arrive
    for (const r of mine) {
      if (r.del) { body.delete(r.id); head.delete(r.id); continue; }
      if (body.has(r.id)) body.set(r.id, r.d!);
      else if (NEWEST_FIRST.has(c)) head.set(r.id, r.d!);
      else body.set(r.id, r.d!);
    }
    next[c] = [...[...head.values()].reverse(), ...body.values()];
  }
  for (const r of recs) if (r.c === 'prefs' && !r.del && r.d) next[r.id] = r.d.value;
  const out = next as AppState;
  if (out.farms !== s.farms && !out.farms.some((f) => f.id === out.activeFarmId)) out.activeFarmId = out.farms[0]?.id;
  return out;
}
