import type { AppState } from '@/types';
import {
  applyRecords, CHUNK_BYTES, collectRecords, hash, isPrefKey, keyOf, LIST_COLLECTIONS, MAX_CHANGES, splitKey, validRecord, type LocalRecord,
  type WireRecord,
} from './records';

/**
 * The sync rules, without any timers, storage or network (those are in ./index.ts), so tests can run two "phones" side by side.
 *
 * Conflict rule, in plain words:
 *   1. Each record (one farm, one task, one expense...) is synced on its own, with the time it was last changed.
 *   2. A change made on this phone is sent to the account. If the same record was also changed on another phone,
 *      the later change wins (a tie keeps the account's copy). The losing phone takes the winner.
 *   3. A record this phone has not changed since the last sync always takes the account's copy.
 *   4. Deleting is a change too, so a record deleted on one phone is deleted on the others.
 *   5. First log-in on a phone: for records on both sides the account's copy wins; records only in the account are added;
 *      records only on this phone are added to the account ("combine"), or removed from this phone if the person chose
 *      "use only my account". The person is asked only when both sides have records.
 */

export interface SyncMeta {
  v: 1;
  /** the account this phone's data is linked to */
  accountId: string;
  /** the account's save number this phone has caught up with */
  since: number;
  /** what this phone last knew of each record: hash of its content and when it changed */
  recs: Record<string, { h: string; t: number }>;
  /** records deleted on this phone (with the time) until the account confirms */
  dels: Record<string, number>;
  /** records changed on this phone that the account has not confirmed yet */
  pending: Record<string, true>;
  lastSyncedAt?: number;
  /** how much of the account's limit is used */
  bytes?: number;
}

export interface SyncResponse {
  rev: number;
  records: unknown[];
  bytes: number;
  limit: number;
  reset?: boolean;
}

export interface SyncIO {
  read(): AppState;
  write(fn: (s: AppState) => AppState): void;
  send(body: { since: number; changes: WireRecord[] }): Promise<SyncResponse>;
  now(): number;
}

export const emptyMeta = (accountId: string): SyncMeta => ({ v: 1, accountId, since: 0, recs: {}, dels: {}, pending: {} });

export const pendingCount = (meta: SyncMeta | null) => (meta ? Object.keys(meta.pending).length : 0);

/** Notices what changed on this phone since the last look and marks it to be sent. Changes `meta` in place. */
export function scan(meta: SyncMeta, s: AppState, now: number): Map<string, LocalRecord> {
  const { records, tooBig } = collectRecords(s);
  for (const [k, r] of records) {
    const m = meta.recs[k];
    if (!m) {
      meta.recs[k] = { h: r.h, t: Math.max(now, (meta.dels[k] ?? 0) + 1) };
      delete meta.dels[k];
      meta.pending[k] = true;
    } else if (m.h !== r.h) {
      // never older than the copy it replaces, even if this phone's clock is behind
      meta.recs[k] = { h: r.h, t: Math.max(now, m.t + 1) };
      meta.pending[k] = true;
    }
  }
  for (const k of Object.keys(meta.recs)) {
    if (records.has(k) || tooBig.has(k)) continue;
    meta.dels[k] = Math.max(now, meta.recs[k].t + 1);
    delete meta.recs[k];
    meta.pending[k] = true;
  }
  return records;
}

/**
 * The changes to send in one request: deletions first (they free space), then changed records oldest first,
 * up to about CHUNK_BYTES or MAX_CHANGES. `more` says that others are still waiting for the next request.
 */
export function changesFrom(meta: SyncMeta, records: Map<string, LocalRecord>): { changes: WireRecord[]; more: boolean } {
  const changes: WireRecord[] = [];
  let bytes = 0;
  let more = false;
  const room = (n: number) => {
    if (changes.length && (changes.length >= MAX_CHANGES || bytes + n > CHUNK_BYTES)) { more = true; return false; }
    bytes += n;
    return true;
  };
  for (const k of Object.keys(meta.pending)) {
    if (records.has(k)) continue;
    if (meta.dels[k] === undefined) {
      if (!meta.recs[k]) delete meta.pending[k]; // nothing left to send (for example a record that became too big)
      continue;
    }
    if (!room(100)) break;
    const [c, id] = splitKey(k);
    changes.push({ c, id, t: meta.dels[k], del: true });
  }
  for (const [k, r] of records) {
    if (!meta.pending[k] || more) continue;
    if (!room(r.bytes + 100)) break;
    changes.push({ c: r.c, id: r.id, t: meta.recs[k].t, d: r.d });
  }
  return { changes, more };
}

/** Takes the account's answer: confirms what was sent and puts other phones' changes into the app. Changes `meta` in place. */
export function applyResponse(io: Pick<SyncIO, 'read' | 'write' | 'now'>, meta: SyncMeta, sent: WireRecord[], res: SyncResponse) {
  const now = io.now();
  scan(meta, io.read(), now); // edits made while the request was on its way stay pending
  for (const ch of sent) {
    const k = keyOf(ch.c, ch.id);
    const same = ch.del ? meta.dels[k] === ch.t : meta.recs[k]?.t === ch.t;
    if (!same) continue;
    delete meta.pending[k];
    if (ch.del) delete meta.dels[k];
  }
  const take: WireRecord[] = [];
  let bad = 0;
  for (const r of res.records) {
    if (!validRecord(r)) { bad++; continue; }
    const k = keyOf(r.c, r.id);
    if (meta.pending[k]) {
      const mine = meta.recs[k]?.t ?? meta.dels[k] ?? 0;
      if (r.t < mine) continue; // this phone's change is newer: it stays and is sent next time
      delete meta.pending[k];
    }
    take.push(r);
    delete meta.dels[k];
    if (r.del) delete meta.recs[k];
    else meta.recs[k] = { h: hash(JSON.stringify(r.d)), t: r.t };
  }
  if (take.length) io.write((s) => applyRecords(s, take));
  meta.since = res.rev;
  meta.bytes = res.bytes;
  meta.lastSyncedAt = now;
  return { received: take.length, bad };
}

export interface LinkPlan {
  /** records only on this phone (settings like the permit checklist are not counted) */
  phoneOnly: number;
  /** records already in the account (settings not counted) */
  inAccount: number;
  /** both sides have records, so the person should choose */
  ask: boolean;
  finish(choice: 'combine' | 'account'): SyncMeta;
}

const withoutLists = (s: AppState): AppState => ({ ...s, ...Object.fromEntries(LIST_COLLECTIONS.map((c) => [c, []])) });

/** First sync of this phone with an account. `res` is the account's full data (asked with since = 0). */
export function planLink(io: Pick<SyncIO, 'read' | 'write' | 'now'>, accountId: string, res: SyncResponse): LinkPlan {
  const { records } = collectRecords(io.read());
  const remote = new Map<string, WireRecord>();
  for (const r of res.records) if (validRecord(r)) remote.set(keyOf(r.c, r.id), r);
  const phoneOnlyKeys = [...records.keys()].filter((k) => !remote.has(k));
  const phoneOnly = phoneOnlyKeys.filter((k) => !isPrefKey(k)).length;
  const inAccount = [...remote.values()].filter((r) => !r.del && r.c !== 'prefs').length;
  return {
    phoneOnly,
    inAccount,
    ask: phoneOnly > 0 && inAccount > 0,
    finish(choice) {
      const now = io.now();
      const meta = emptyMeta(accountId);
      // The account's copy wins for everything it has (a record it has deleted stays deleted here too).
      const fromAccount = [...remote.values()].filter((r) => !r.del);
      for (const r of fromAccount) meta.recs[keyOf(r.c, r.id)] = { h: hash(JSON.stringify(r.d)), t: r.t };
      const fromPhone: WireRecord[] = [];
      for (const [k, r] of collectRecords(io.read()).records) {
        if (remote.has(k) || (choice === 'account' && !isPrefKey(k))) continue;
        fromPhone.push({ c: r.c, id: r.id, t: now, d: r.d });
        meta.recs[k] = { h: r.h, t: now };
        meta.pending[k] = true;
      }
      // Lists are rebuilt in the account's order and then this phone's own records, which is also the order
      // the other phones will see once these records reach them.
      io.write((s) => applyRecords(applyRecords(withoutLists(s), fromAccount), fromPhone));
      meta.since = res.rev;
      meta.bytes = res.bytes;
      meta.lastSyncedAt = now;
      return meta;
    },
  };
}

export interface SyncOutcome {
  meta: SyncMeta;
  /** false when there was nothing to send and no reason to ask, so the network was not used */
  used: boolean;
  sent: number;
  received: number;
  /** records from the account that failed the checks and were left out */
  bad: number;
  /** more is waiting to be sent: run again */
  more: boolean;
}

/**
 * One round: link the phone if needed, send this phone's changes, take the account's changes.
 * With nothing to send and `pull` false it does not use the network. Always save the returned `meta`.
 */
export async function syncOnce(io: SyncIO, meta: SyncMeta | null, accountId: string, pull: boolean): Promise<SyncOutcome> {
  let linked = false;
  if (!meta || meta.accountId !== accountId) {
    // First sync for this account on this phone, and nobody to ask (that happens in the log-in form): combine, nothing is lost.
    meta = planLink(io, accountId, await io.send({ since: 0, changes: [] })).finish('combine');
    linked = true;
  }
  const { changes, more } = changesFrom(meta, scan(meta, io.read(), io.now()));
  if (!changes.length && (linked || !pull)) return { meta, used: linked, sent: 0, received: 0, bad: 0, more: false };
  const res = await io.send({ since: meta.since, changes });
  if (res.reset) {
    // The account lost its data (for example a database restored from an old copy): this phone sends everything it has again.
    return { meta: emptyMeta(accountId), used: true, sent: 0, received: 0, bad: 0, more: true };
  }
  const { received, bad } = applyResponse(io, meta, changes, res);
  return { meta, used: true, sent: changes.length, received, bad, more };
}
