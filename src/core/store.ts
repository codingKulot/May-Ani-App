import { useSyncExternalStore } from 'react';
import type { AppState } from '@/types';
import { setCustomItems } from '@/data/catalog';

const KEY = 'may-ani.state.v1';
/** A saved copy that could not be read is moved here, so the app never overwrites (and loses) it. */
export const DAMAGED_KEY = 'may-ani.state.damaged';
const VERSION = 1;

export const initialState = (): AppState => ({
  version: VERSION,
  profile: null,
  farms: [],
  plans: [],
  tasks: [],
  expenses: [],
  sales: [],
  production: [],
  permitProgress: {},
  permitSector: 'agriculture',
  chats: [],
  contacts: [],
  chatRead: {},
  marketOverrides: {},
  watchlist: [],
  healthLog: [],
  customItems: [],
  materialPrices: {},
  settings: { apiBase: '', marketFeedUrl: '', units: 'metric' },
});

/** The parts of the browser's localStorage the store uses (tests pass a fake one). */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's storage, or null when there is none (tests) or it is blocked: then even reading `localStorage` throws. */
function storage(): SaveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Set at start-up when the saved data could not be read and the app started empty. The Welcome screen shows it. */
export let startupProblem = '';
/** The unreadable saved data, when it could not even be copied to DAMAGED_KEY (no space): this session can still download it. */
let damagedInMemory: string | null = null;

/** Reads the saved app state. Saved data that cannot be read is moved to DAMAGED_KEY, never overwritten. */
export function loadFrom(store: SaveStorage | null): AppState {
  let raw: string | null = null;
  try {
    raw = store?.getItem(KEY) ?? null;
  } catch {
    return initialState(); // storage switched off in this browser: work in memory
  }
  if (!raw) return initialState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return repair(parsed.version !== VERSION ? migrate(parsed) : parsed);
  } catch {
    keepDamaged(store!, raw);
    return initialState();
  }
}

/** Add migrations here when the persisted shape changes. */
function migrate(old: AppState): AppState {
  return { ...old, version: VERSION };
}

/** Fills keys added after this user's state was saved, and puts back any list that is not a list (pages expect lists). */
function repair(saved: AppState): AppState {
  const fresh = initialState() as unknown as Record<string, unknown>;
  const out = { ...fresh, ...saved } as unknown as Record<string, unknown>;
  for (const k of Object.keys(fresh)) if (Array.isArray(fresh[k]) && !Array.isArray(out[k])) out[k] = fresh[k];
  return out as unknown as AppState;
}

function keepDamaged(store: SaveStorage, raw: string) {
  try {
    store.setItem(DAMAGED_KEY, raw);
    store.removeItem(KEY);
  } catch {
    damagedInMemory = raw; // no room for a second copy: keep it for this session's "Download it"
  }
  startupProblem = 'Your saved data could not be read, so May-Ani started empty. A copy was kept: after you continue, Settings > Your data can download it.';
}

/** The saved data that could not be read at some start-up, if it is still kept (to download, or to delete). */
export function damagedCopy(): string | null {
  try {
    return storage()?.getItem(DAMAGED_KEY) ?? damagedInMemory;
  } catch {
    return damagedInMemory;
  }
}

export function forgetDamagedCopy() {
  damagedInMemory = null;
  try { storage()?.removeItem(DAMAGED_KEY); } catch { /* nothing to remove */ }
}

let state: AppState = loadFrom(storage());
setCustomItems(state.customItems);
const listeners = new Set<() => void>();

// ---------- "not saved" warning: the phone is full or storage is switched off ----------
let saveProblem = '';
const saveListeners = new Set<() => void>();

function setSaveProblem(msg: string) {
  if (msg === saveProblem) return;
  saveProblem = msg;
  saveListeners.forEach((l) => l());
}

/** Saves the state; exported with `to` for tests. Tells useSaveProblem when saving fails, and when it works again. */
export function persist(to?: SaveStorage | null) {
  if (to === undefined) {
    if (typeof window === 'undefined') return; // outside a browser (tests): nothing to save to
    to = storage();
  }
  try {
    if (!to) throw new Error('storage blocked');
    to.setItem(KEY, JSON.stringify(state));
    setSaveProblem('');
  } catch (e) {
    // Keep working in memory, but say so: otherwise the latest changes vanish when the app is closed.
    const full = /quota/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);
    setSaveProblem(full
      ? 'This phone has no space left for May-Ani, so your latest changes are NOT saved. Free up space, or download a backup in Settings > Your data.'
      : 'May-Ani cannot save on this phone (storage is switched off or blocked), so your changes are lost when you close the app. Download a backup in Settings > Your data.');
  }
}

/** The current "not saved" warning, '' when saving works. */
export const getSaveProblem = () => saveProblem;

/** The "not saved" warning for the banner in Shell. */
export function useSaveProblem(): string {
  return useSyncExternalStore((cb) => { saveListeners.add(cb); return () => saveListeners.delete(cb); }, getSaveProblem);
}

/**
 * Asks the browser not to clear May-Ani's data when space runs low (Chrome decides by itself, without asking the user).
 * Without it, a browser may delete a website's data; for a guest that is their only copy.
 */
export async function askToKeepData() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* an extra safety, never required */
  }
}

export const getState = () => state;

export function setState(updater: (s: AppState) => AppState) {
  state = updater(state);
  setCustomItems(state.customItems);
  persist();
  listeners.forEach((l) => l());
}

export function resetState() {
  state = initialState();
  persist();
  forgetDamagedCopy(); // "Delete all my data" deletes that copy too
  listeners.forEach((l) => l());
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Subscribe a component to the whole app state. */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
