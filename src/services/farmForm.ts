import type { Farm, GeoPlace, LandTenure, ProductionRecord, Sector, WaterSource } from '@/types';

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

export const areaFieldLabel = (sector: Sector) =>
  sector === 'fish' ? 'Pond / tank area' : sector === 'livestock' ? 'Pen and yard area' : 'Farm area';

export interface FarmLine { itemId: string; areaSqm: number; startedOn: string }

export interface FarmFormInput {
  name: string;
  sector: Sector;
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

export type FarmFormErrors = Partial<Record<'name' | 'area' | 'sinceYear' | 'lines', string>>;

export function checkFarmForm(f: FarmFormInput, today = new Date()): FarmFormErrors {
  const e: FarmFormErrors = {};
  const sqm = toSqm(f.area, f.unit);
  if (!f.name.trim()) e.name = 'Give your farm a name.';
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
  return {
    farm: {
      name: f.name.trim(),
      sector: f.sector,
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
