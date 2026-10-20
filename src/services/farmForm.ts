import type { Farm, GeoPlace, LandTenure, ProductionRecord, Sector, WaterSource } from '@/types';
import { SECTORS, catalogById, planSectors } from '@/data/catalog';

/** "I already have a farm" form: labels, unit conversion and validation (no UI, so it can be unit tested). */

export const TENURE_LABEL: Record<LandTenure, string> = {
  owned: 'I own it',
  family: 'Family land',
  rented: 'Rented / leased',
  tenant: 'Tenant / sharecrop',
  cooperative: 'Co-op / group',
};

/** Same choices as the planner's water source, so farms and plans speak the same language. */
export const WATER_LABEL: Record<WaterSource, string> = {
  rain: 'Rain only',
  stream: 'Irrigation canal, river or spring',
  well: 'Well / deep well',
  municipal: 'Piped (water district / LGU)',
  none: 'No water source yet',
};

export type AreaUnit = 'sqm' | 'ha';
export const SQM_PER_HA = 10_000;
export const toSqm = (value: number, unit: AreaUnit) => Math.round(unit === 'ha' ? value * SQM_PER_HA : value);

/** Crops and fruits are grown; fish and livestock are raised. */
const GROWN: readonly Sector[] = ['crops', 'fruits'];

export const areaFieldLabel = (sectors: readonly Sector[]) =>
  sectors.length > 1 ? 'Whole farm area' : sectors[0] === 'fish' ? 'Pond / tank area' : sectors[0] === 'livestock' ? 'Pen and yard area' : 'Farm area';

const NAME_HINT: Record<Sector, string> = { crops: "e.g. Lola's vegetable plot", fruits: 'e.g. Mango orchard sa bukid', fish: 'e.g. Tilapia ponds sa likod', livestock: 'e.g. Backyard piggery' };
export const nameHint = (sectors: readonly Sector[]) => (sectors.length === 1 ? NAME_HINT[sectors[0]] : 'e.g. Family farm sa bukid');

const ITEMS_TITLE: Record<Sector, string> = { crops: 'What are you growing now?', fruits: 'What fruits are you growing now?', fish: 'What are you raising now?', livestock: 'What animals do you have now?' };
/** Heading of the "what is on the farm now" lines; a mix of grown and raised types gets both words. */
export function itemsTitle(sectors: readonly Sector[]): string {
  if (sectors.length === 1) return ITEMS_TITLE[sectors[0]];
  const grown = sectors.some((s) => GROWN.includes(s));
  const raised = sectors.some((s) => !GROWN.includes(s));
  return grown && raised ? 'What are you growing and raising now?' : grown ? 'What are you growing now?' : raised ? 'What are you raising now?' : 'What are you growing or raising now?';
}

const STARTED_LABEL: Record<Sector, string> = { crops: 'Planted on', fruits: 'Planted on', fish: 'Stocked on', livestock: 'Started on' };
/** Date label of one line, from that line's item (a mixed farm has planted, stocked and started lines side by side). */
export const startedLabel = (itemId: string, fallback: Sector) => STARTED_LABEL[catalogById(itemId)?.sector ?? fallback];

/** Same words as the planner's type message. */
export const NO_FARM_TYPE = 'Choose at least one: vegetables & crops, fruits, fish or livestock.';

export interface FarmLine {
  itemId: string;
  areaSqm: number;
  startedOn: string;
  /** form only, never saved: keeps each row's boxes with its line when a line above it is removed */
  row?: number;
}

export interface FarmFormInput {
  name: string;
  /** one or more types, in SECTORS order (empty only while the user has turned them all off) */
  sectors: Sector[];
  area: number;
  unit: AreaUnit;
  location: GeoPlace;
  barangay?: string;
  tenure?: LandTenure;
  waterSource?: WaterSource;
  sinceYear?: number;
  notes?: string;
  lines: FarmLine[];
}

export type FarmFormErrors = Partial<Record<'name' | 'sectors' | 'area' | 'sinceYear' | 'lines', string>>;

/**
 * Turns one type on or off (the list stays in SECTORS order). Turning a type off removes the lines of its items,
 * so a farm never gets records of a type it does not have.
 */
export function toggleFarmSector(f: FarmFormInput, id: Sector): FarmFormInput {
  const sectors = f.sectors.includes(id) ? f.sectors.filter((x) => x !== id) : SECTORS.filter((x) => x === id || f.sectors.includes(x));
  const kept = (itemId: string) => { const sec = catalogById(itemId)?.sector; return sec !== undefined && sectors.includes(sec); };
  return { ...f, sectors, lines: f.lines.filter((l) => kept(l.itemId)) };
}

export function checkFarmForm(f: FarmFormInput, today = new Date()): FarmFormErrors {
  const e: FarmFormErrors = {};
  const sqm = toSqm(f.area, f.unit);
  if (!f.name.trim()) e.name = 'Give your farm a name.';
  if (!f.sectors.length) e.sectors = NO_FARM_TYPE;
  if (!(sqm > 0)) e.area = 'Enter the area.';
  const year = today.getFullYear();
  if (f.sinceYear !== undefined && f.sinceYear !== 0 && (f.sinceYear < 1900 || f.sinceYear > year)) e.sinceYear = `Use a year from 1900 to ${year}.`;
  const lines = f.lines.filter((l) => l.itemId);
  if (lines.some((l) => !(l.areaSqm > 0))) e.lines = 'Enter the area for each item, or remove it.';
  else if (sqm > 0 && lines.reduce((t, l) => t + l.areaSqm, 0) > sqm) e.lines = 'The items add up to more than the farm area.';
  else if (lines.some((l) => l.startedOn > isoDay(today))) e.lines = 'Start dates cannot be in the future.';
  return e;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Turns a valid form into the farm fields and its production records (records get the farm id later). */
export function buildFarm(f: FarmFormInput): { farm: Omit<Farm, 'id' | 'createdAt'>; records: Omit<ProductionRecord, 'id' | 'farmId'>[] } {
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined);
  // Same shape as a mixed plan saved as a farm: `sector` is the first type, `sectors` only when there is more than one.
  const sectors = planSectors({ sectors: f.sectors });
  return {
    farm: {
      name: f.name.trim(),
      sector: sectors[0],
      ...(sectors.length > 1 ? { sectors } : {}),
      areaSqm: toSqm(f.area, f.unit),
      location: f.location,
      barangay: clean(f.barangay),
      tenure: f.tenure,
      waterSource: f.waterSource,
      sinceYear: f.sinceYear || undefined,
      notes: clean(f.notes),
    },
    records: f.lines.filter((l) => l.itemId && l.areaSqm > 0).map((l) => ({ itemId: l.itemId, areaSqm: Math.round(l.areaSqm), plantedOn: l.startedOn })),
  };
}
