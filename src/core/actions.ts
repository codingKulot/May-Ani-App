import { getState, resetState, setState, uid } from './store';
import type {
  AppState, Expense, ExpenseCategory, Farm, GeoPlace, HealthLogEntry, PlanInput, PlanResult, ProductionRecord,
  PlanBuild, Profile, Sale, SavedPlan, Task, CatalogItem } from '@/types';
import { isoDate } from '@/lib/format';
import { deletePhotos } from '@/lib/photoStore';
import { saveFile } from '@/lib/download';
import { buildFarm, type FarmFormInput } from '@/services/farmForm';
import { DEFAULT_PLACE } from '@/data/places';
import { logOut } from '@/services/auth';
import { forgetSync } from '@/services/sync';
import { LIST_COLLECTIONS, PREF_IDS, cleanBackup, type PrefId } from '@/services/sync/records';

/** All state mutations live here so pages stay declarative and the rules are in one testable place. */

export function createProfile(name: string, location: GeoPlace, role: Profile['role'], guest = false): Profile {
  const profile: Profile = { id: uid(), name: name.trim() || 'Farmer', location, guest, role, createdAt: new Date().toISOString() };
  setState((s) => ({ ...s, profile }));
  return profile;
}

export function updateProfile(patch: Partial<Profile>) {
  setState((s) => (s.profile ? { ...s, profile: { ...s.profile, ...patch, guest: false } } : s));
}

/**
 * After sign-up or log-in: the account's name, role and location become the profile.
 * Farms, plans and records already on this device are kept (a guest who signs up keeps everything). The forms first
 * bring in the account's farm data (services/sync prepareLink); once the profile is linked, syncing runs by itself.
 */
export function signInWithAccount(a: { id: string; email: string; name: string; role: Profile['role']; location: GeoPlace | null; createdAt: string }): Profile {
  const current = getState().profile;
  const profile: Profile = {
    id: current?.id ?? uid(),
    name: a.name,
    role: a.role,
    location: a.location ?? current?.location ?? DEFAULT_PLACE,
    guest: false,
    createdAt: current?.createdAt ?? a.createdAt,
    account: { id: a.id, email: a.email },
  };
  setState((s) => ({ ...s, profile }));
  return profile;
}

/** Log out on this device: the profile goes, farm data stays on the device (Settings has "Delete all my data" for that). */
export function signOutLocal() {
  setState((s) => ({ ...s, profile: null }));
}

/** The server no longer accepts this login: keep using the app locally, without the account link. */
export function unlinkAccount() {
  setState((s) => (s.profile?.account ? { ...s, profile: { ...s.profile, account: undefined } } : s));
}

export function addFarm(f: Omit<Farm, 'id' | 'createdAt'>): Farm {
  const farm: Farm = { ...f, id: uid(), createdAt: new Date().toISOString() };
  setState((s) => ({ ...s, farms: [...s.farms, farm], activeFarmId: s.activeFarmId ?? farm.id }));
  return farm;
}

/** "I already have a farm": saves the farm plus what is already growing on it as production records. */
export function addExistingFarm(input: FarmFormInput): Farm {
  const { farm: fields, records } = buildFarm(input);
  const farm = addFarm(fields);
  if (records.length) setState((s) => ({ ...s, production: [...s.production, ...records.map((r) => ({ ...r, id: uid(), farmId: farm.id }))] }));
  return farm;
}

export function removeFarm(id: string) {
  setState((s) => ({
    ...s,
    farms: s.farms.filter((f) => f.id !== id),
    activeFarmId: s.activeFarmId === id ? s.farms.find((f) => f.id !== id)?.id : s.activeFarmId,
    tasks: s.tasks.filter((t) => t.farmId !== id),
    expenses: s.expenses.filter((t) => t.farmId !== id),
    sales: s.sales.filter((t) => t.farmId !== id),
    production: s.production.filter((t) => t.farmId !== id),
    plans: s.plans.map((p) => (p.farmId === id ? { ...p, farmId: undefined } : p)),
  }));
}

export function setActiveFarm(id: string) {
  setState((s) => ({ ...s, activeFarmId: id }));
}

export function savePlanDraft(input: PlanInput, result: PlanResult): SavedPlan {
  const plan: SavedPlan = { id: uid(), createdAt: new Date().toISOString(), input, result };
  setState((s) => ({ ...s, plans: [plan, ...s.plans] }));
  return plan;
}

/** "Save Plan": turns a plan into a farm (once) and seeds production records + first tasks. */
export function savePlanAsFarm(planId: string): Farm | null {
  const plan = getState().plans.find((p) => p.id === planId);
  if (!plan) return null;
  if (plan.farmId) return getState().farms.find((f) => f.id === plan.farmId) ?? null;
  const farm = addFarm({
    name: plan.result.title,
    sector: plan.input.sector,
    areaSqm: plan.input.areaSqm,
    location: plan.input.location,
    planId: plan.id,
  });
  const today = isoDate();
  setState((s) => ({
    ...s,
    plans: s.plans.map((p) => (p.id === planId ? { ...p, farmId: farm.id } : p)),
    production: [
      ...s.production,
      ...plan.result.allocations.map<ProductionRecord>((a) => ({ id: uid(), farmId: farm.id, itemId: a.itemId, areaSqm: a.areaSqm, plantedOn: today })),
    ],
    tasks: [
      ...s.tasks,
      { id: uid(), farmId: farm.id, title: 'Check permits with your LGU', date: today, done: false },
      { id: uid(), farmId: farm.id, title: 'Prepare the site and dig drainage', date: today, done: false },
    ],
  }));
  return farm;
}

export function deletePlan(id: string) {
  setState((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
  void deletePhotos(id);
}

const EMPTY_BUILD: PlanBuild = { recyclables: [], onSite: [], notes: [] };

/** Saves the user's choices in the Build studio (corners, design, recyclables...). */
export function updatePlanBuild(planId: string, patch: Partial<PlanBuild>) {
  setState((s) => ({
    ...s,
    plans: s.plans.map((p) => (p.id === planId ? { ...p, build: { ...EMPTY_BUILD, ...p.build, ...patch } } : p)),
  }));
}

/** Sets (or, with null, clears) the user's own price for a building material. */
export function setMaterialPrice(materialId: string, price: number | null) {
  setState((s) => {
    const next = { ...s.materialPrices };
    if (price === null || !Number.isFinite(price) || price <= 0) delete next[materialId];
    else next[materialId] = Math.round(price * 100) / 100;
    return { ...s, materialPrices: next };
  });
}

export function addTask(t: Omit<Task, 'id' | 'done'>) {
  setState((s) => ({ ...s, tasks: [...s.tasks, { ...t, id: uid(), done: false }] }));
}
export function toggleTask(id: string) {
  setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
}
export function deleteTask(id: string) {
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
}

export function addExpense(e: { date: string; category: ExpenseCategory; note: string; amount: number; farmId?: string }) {
  if (!(e.amount > 0)) return;
  setState((s) => ({ ...s, expenses: [{ ...e, id: uid() } as Expense, ...s.expenses] }));
}
export function deleteExpense(id: string) {
  setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
}

export function addSale(x: Omit<Sale, 'id'>) {
  if (!(x.kg > 0) || !(x.pricePerKg > 0)) return;
  setState((s) => ({ ...s, sales: [{ ...x, id: uid() }, ...s.sales] }));
}
export function deleteSale(id: string) {
  setState((s) => ({ ...s, sales: s.sales.filter((x) => x.id !== id) }));
}

export function addProduction(r: Omit<ProductionRecord, 'id'>) {
  setState((s) => ({ ...s, production: [...s.production, { ...r, id: uid() }] }));
}
export function recordHarvest(id: string, kg: number, date = isoDate()) {
  setState((s) => ({
    ...s,
    production: s.production.map((p) => (p.id === id ? { ...p, harvestedKg: (p.harvestedKg ?? 0) + kg, harvestedOn: date } : p)),
  }));
}
export function deleteProduction(id: string) {
  setState((s) => ({ ...s, production: s.production.filter((p) => p.id !== id) }));
}

export function togglePermit(id: string) {
  setState((s) => ({ ...s, permitProgress: { ...s.permitProgress, [id]: !s.permitProgress[id] } }));
}

export function logHealth(e: Omit<HealthLogEntry, 'id' | 'date' | 'resolved'>) {
  setState((s) => ({ ...s, healthLog: [{ ...e, id: uid(), date: isoDate(), resolved: false }, ...s.healthLog] }));
}
export function resolveHealth(id: string) {
  setState((s) => ({ ...s, healthLog: s.healthLog.map((h) => (h.id === id ? { ...h, resolved: !h.resolved } : h)) }));
}

export function toggleWatch(itemId: string) {
  setState((s) => ({ ...s, watchlist: s.watchlist.includes(itemId) ? s.watchlist.filter((x) => x !== itemId) : [...s.watchlist, itemId] }));
}
export function setPriceOverride(itemId: string, o: { retailPerKg?: number; farmGatePerKg?: number } | null) {
  setState((s) => {
    const next = { ...s.marketOverrides };
    if (o) next[itemId] = o; else delete next[itemId];
    return { ...s, marketOverrides: next };
  });
}

export function updateSettings(patch: Partial<AppState['settings']>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function exportData(): string {
  return JSON.stringify(getState(), null, 2);
}

/** Saves a backup file of everything on this phone (photos are not in it). */
export function downloadBackup() {
  saveFile(`may-ani-backup-${isoDate()}.json`, exportData(), 'application/json');
}

/**
 * Restores a backup file. Only farm data comes in, checked item by item (services/sync/records.ts cleanBackup); this phone's
 * profile, login and settings stay as they are. Lists in the file replace the same lists on this phone; the rest is kept.
 * `skipped` counts damaged items that were left out.
 */
export function importData(json: string): { ok: boolean; error?: string; skipped?: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'This file could not be read.' };
  }
  const file = parsed as Record<string, unknown> | null;
  if (!file || typeof file !== 'object' || !Array.isArray(file.farms) || !Array.isArray(file.plans)) {
    return { ok: false, error: 'This file is not a May-Ani backup.' };
  }
  const { patch, skipped } = cleanBackup(file);
  setState((s) => {
    const next = { ...s, ...patch };
    if (!next.farms.some((f) => f.id === next.activeFarmId)) next.activeFarmId = next.farms[0]?.id;
    return next;
  });
  return { ok: true, skipped };
}

/** Deletes everything on this phone and logs out. The account and the farm data saved in it are not deleted. */
export function wipeAllData() {
  void logOut();
  forgetSync(); // first, so the emptied phone is never sent to the account as "everything was deleted"
  resetState();
}

// ---------- derived selectors ----------
/** Per preference that follows the account: does it hold something the user chose? (Typed by PrefId, so a new preference must be added here.) */
const PREF_HAS_DATA: Record<PrefId, (s: AppState) => boolean> = {
  permitProgress: (s) => Object.values(s.permitProgress).some(Boolean),
  permitSector: () => false, // always has a value; not something to back up on its own
  marketOverrides: (s) => Object.keys(s.marketOverrides).length > 0,
  watchlist: (s) => s.watchlist.length > 0,
  materialPrices: (s) => Object.keys(s.materialPrices).length > 0,
};

/**
 * True when there is farm data worth backing up or deleting: anything in the lists that follow the account
 * (services/sync/records.ts) or a preference the user set. Chat is left out (sample contacts, or a copy of the server's).
 */
export const hasUserData = (s: AppState): boolean =>
  LIST_COLLECTIONS.some((c) => (s[c]?.length ?? 0) > 0) || PREF_IDS.some((p) => PREF_HAS_DATA[p](s));

export const farmScoped = <T extends { farmId?: string }>(items: T[], farmId?: string): T[] =>
  farmId ? items.filter((i) => !i.farmId || i.farmId === farmId) : items;

// ---------- custom items (things the user adds beyond the built-in catalog) ----------
export function addCustomItem(item: CatalogItem) {
  setState((s) => (s.customItems.some((c) => c.id === item.id) ? s : { ...s, customItems: [...s.customItems, item] }));
}

/** Returns false (and keeps the item) if a saved plan, record or sale still refers to it. */
export function removeCustomItem(id: string): boolean {
  const s = getState();
  const used =
    s.plans.some((p) => p.result.allocations.some((a) => a.itemId === id)) ||
    s.production.some((p) => p.itemId === id) ||
    s.sales.some((x) => x.itemId === id);
  if (used) return false;
  setState((st) => ({ ...st, customItems: st.customItems.filter((c) => c.id !== id), watchlist: st.watchlist.filter((w) => w !== id) }));
  return true;
}
