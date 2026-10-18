import { useSyncExternalStore } from 'react';
import type { AppState } from '@/types';
import { setCustomItems } from '@/data/catalog';

const KEY = 'may-ani.state.v1';
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
  marketOverrides: {},
  watchlist: [],
  healthLog: [],
  customItems: [],
  materialPrices: {},
  settings: { apiBase: '', marketFeedUrl: '', units: 'metric' },
});

function load(): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== VERSION) return migrate(parsed);
    // forward-compatible: fill any keys added after this user's state was saved
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

/** Add migrations here when the persisted shape changes. */
function migrate(old: AppState): AppState {
  return { ...initialState(), ...old, version: VERSION };
}

let state: AppState = load();
setCustomItems(state.customItems);
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: keep working in memory */
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
