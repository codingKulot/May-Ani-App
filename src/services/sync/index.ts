import { useSyncExternalStore } from 'react';
import { getState, setState, subscribe } from '@/core/store';
import { ApiError, call } from '@/services/ai';
import { clearSession, sessionToken } from '@/services/auth';
import { emptyMeta, pendingCount, planLink, syncOnce, type SyncIO, type SyncMeta, type SyncResponse } from './engine';
import type { WireRecord } from './records';

/**
 * Keeps this phone's farm data and the account in step (rules in ./engine.ts, server in server/sync.mjs).
 *   * A sync runs 2 seconds after a change, when the app opens or comes back to the front, when the internet returns,
 *     and every 5 minutes while the app is open. Offline, changes wait safely on the phone.
 *   * What this phone knows about the account (`SyncMeta`) has its own localStorage key, never in the app state or backups.
 */

export { SYNC_MAX_BYTES } from './records';

const META_KEY = 'may-ani.sync.v1';
const CHANGE_DELAY = 2000;
const PULL_EVERY = 5 * 60_000;

export type SyncState = 'off' | 'saving' | 'saved' | 'offline' | 'error' | 'too_big';

export interface SyncStatus {
  state: SyncState;
  /** when this phone last finished a sync with the account (ms) */
  lastSyncedAt?: number;
  /** changes on this phone that are not in the account yet */
  pending: number;
  message?: string;
  /** how much of the account's space is used, in bytes */
  bytes?: number;
}

// ------------------------------------------------------------------ status (for the Settings screen)
let status: SyncStatus = { state: 'off', pending: 0 };
const watchers = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  watchers.forEach((w) => w());
};
export const getSyncStatus = () => status;
const watchStatus = (cb: () => void) => { watchers.add(cb); return () => { watchers.delete(cb); }; };
export const useSyncStatus = (): SyncStatus => useSyncExternalStore(watchStatus, getSyncStatus);

// ------------------------------------------------------------------ what this phone knows about the account
let cached: SyncMeta | null | undefined;
function meta(): SyncMeta | null {
  if (cached !== undefined) return cached;
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
    cached = m && m.v === 1 && typeof m.accountId === 'string' && m.recs && m.dels && m.pending ? m : null;
  } catch {
    cached = null;
  }
  return cached ?? null;
}
function setMeta(m: SyncMeta | null) {
  cached = m;
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch { /* storage full or unavailable: it is rebuilt on the next sync */ }
}

// ------------------------------------------------------------------ network
class Cancelled extends Error {}
class Offline extends Error {}

const send = (body: { since: number; changes: WireRecord[] }) =>
  call<SyncResponse>('/api/sync', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${sessionToken()}` } }, 45_000);

const linkedAccount = (): string | null => {
  const a = getState().profile?.account;
  return a && sessionToken() ? a.id : null;
};

/** Bumped when this phone forgets its link (log out, delete all data): a sync still on its way is then ignored. */
let gen = 0;

function io(myGen: number): SyncIO {
  return {
    read: getState,
    write: (fn) => { if (gen === myGen) setState(fn); },
    send: async (body) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Offline();
      setStatus({ state: 'saving' });
      const out = await send(body);
      if (gen !== myGen) throw new Cancelled();
      return out;
    },
    now: Date.now,
  };
}

// ------------------------------------------------------------------ the loop
let running: Promise<void> | null = null;
let again = false;
let wantPull = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let onLoginEnded: (() => void) | undefined;

function schedule(ms: number, pull = false) {
  wantPull ||= pull;
  clearTimeout(timer);
  timer = setTimeout(() => { void runSync(); }, ms);
}

function retryLater() {
  failures++;
  schedule(Math.min(5 * 60_000, 15_000 * 2 ** (failures - 1)), true);
}

async function round() {
  const accountId = linkedAccount();
  if (!accountId) { setStatus({ state: 'off', pending: 0, message: undefined }); return; }
  const myGen = gen;
  const pull = wantPull;
  wantPull = false;
  const before = meta();
  try {
    const out = await syncOnce(io(myGen), before, accountId, pull);
    if (gen !== myGen) return;
    setMeta(out.meta);
    failures = 0;
    if (out.more) again = true;
    setStatus({
      state: 'saved',
      lastSyncedAt: out.meta.lastSyncedAt,
      pending: pendingCount(out.meta),
      bytes: out.meta.bytes,
      message: out.bad ? `${out.bad} item(s) from your account could not be read and were left out.` : undefined,
    });
  } catch (e) {
    if (gen !== myGen || e instanceof Cancelled) return;
    if (before && before.accountId === accountId) setMeta(before); // keeps what the scan noticed, with its times
    const pending = before?.accountId === accountId ? pendingCount(before) : status.pending;
    if (e instanceof ApiError && e.status === 401) {
      // The login ended (expired or logged out elsewhere). The data stays here and the link info is kept for the next log-in.
      clearSession();
      setState((s) => (s.profile?.account ? { ...s, profile: { ...s.profile, account: undefined } } : s));
      setStatus({ state: 'off', pending: 0, message: undefined });
      onLoginEnded?.();
    } else if (e instanceof ApiError && e.status === 413) {
      setStatus({ state: 'too_big', pending, message: e.message }); // tried again after the next change (for example a deleted plan)
    } else if (e instanceof ApiError) {
      setStatus({ state: 'error', pending, message: e.message });
      retryLater();
    } else {
      setStatus({ state: 'offline', pending, message: undefined }); // no internet, or the server did not answer in time
      retryLater();
    }
  }
}

function runSync(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await round(); } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Sync now (the "Save now" button, and right after log-in). Resolves when it is done; the outcome is in the status. */
export function syncNow(): Promise<void> {
  clearTimeout(timer);
  wantPull = true;
  return runSync();
}

/** Starts the automatic syncing. Call once when the app starts. */
export function startSync(opts: { onLoginEnded?: () => void } = {}) {
  onLoginEnded = opts.onLoginEnded;
  if (started) return;
  started = true;
  const m = meta();
  const id = linkedAccount();
  setStatus(id ? { state: 'saving', pending: m?.accountId === id ? pendingCount(m) : 0, lastSyncedAt: m?.accountId === id ? m.lastSyncedAt : undefined, bytes: m?.bytes } : { state: 'off', pending: 0 });
  let last = getState();
  subscribe(() => {
    const s = getState();
    if (s === last) return;
    last = s;
    if (linkedAccount()) schedule(CHANGE_DELAY);
    else if (status.state !== 'off') setStatus({ state: 'off', pending: 0, message: undefined });
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => schedule(0, true));
    document.addEventListener('visibilitychange', () => {
      // back in front: get the other phones' changes; going to the back: send what is waiting before the phone pauses the app
      if (document.visibilityState === 'visible') schedule(0, true);
      else if (timer !== undefined && linkedAccount()) schedule(0);
    });
    setInterval(() => { if (document.visibilityState === 'visible' && linkedAccount()) schedule(0, true); }, PULL_EVERY);
  }
  schedule(0, true);
}
let started = false;

/**
 * Right after log-in or sign-up, before the profile is linked: gets the account's data and says whether to ask the person
 * (both this phone and the account have records). null = this phone is already linked to this account, a normal sync follows.
 * Throws when the server cannot be reached; the first automatic sync then links the phone ("combine").
 */
export async function prepareLink(accountId: string): Promise<null | { phoneOnly: number; inAccount: number; ask: boolean; finish(choice: 'combine' | 'account'): void }> {
  if (meta()?.accountId === accountId) return null;
  const myGen = gen;
  const plan = planLink(io(myGen), accountId, await send({ since: 0, changes: [] }));
  return {
    phoneOnly: plan.phoneOnly,
    inAccount: plan.inAccount,
    ask: plan.ask,
    finish: (choice) => {
      if (gen !== myGen) return;
      setMeta(plan.finish(choice));
      setStatus({ state: 'saving', pending: pendingCount(cached ?? null), lastSyncedAt: cached?.lastSyncedAt });
    },
  };
}

/** Before logging out: tries to send what is not in the account yet. True when everything on this phone is in the account. */
export async function flushSync(): Promise<boolean> {
  const id = linkedAccount();
  if (!id) return true;
  await syncNow();
  const m = meta();
  return status.state === 'saved' && m?.accountId === id && pendingCount(m) === 0;
}

/** Log out or "Delete all my data": this phone forgets its link to the account (the account itself keeps its data). */
export function forgetSync() {
  gen++;
  clearTimeout(timer);
  setMeta(null);
  failures = 0;
  setStatus({ state: 'off', pending: 0, lastSyncedAt: undefined, message: undefined, bytes: undefined });
}

export { emptyMeta };
