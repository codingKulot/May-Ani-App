import type { CatalogItem, Sector } from '@/types';

/**
 * Starter catalog. ALL numbers are planning ESTIMATES for the Philippines (PHP) meant to be
 * edited/overridden as real data comes in (see services/market.ts for prices). They are
 * deliberately conservative. Adding a new crop/fish/animal = add one object here.
 */
export const CATALOG: CatalogItem[] = [
  // ---------------- CROPS ----------------
  { id: 'kangkong', name: 'Kangkong', localName: 'Water spinach', sector: 'crops', category: 'Leafy vegetable', maxAreaSqm: 800, emoji: '🥬',
    daysToHarvest: 25, cycleDays: 45, minAreaSqm: 5, startupCostPerSqm: 30, opCostPerSqmMonth: 14,
    yieldKgPerSqm: 4.0, farmGatePerKg: 22, waterLPerSqmDay: 6, difficulty: 1, areaKind: 'bed',
    notes: 'Fast, forgiving, re-grows after cutting. Great first crop.' },
  { id: 'pechay', name: 'Pechay', localName: 'Pak choi', sector: 'crops', category: 'Leafy vegetable', maxAreaSqm: 800, emoji: '🥬',
    daysToHarvest: 28, cycleDays: 35, minAreaSqm: 5, startupCostPerSqm: 35, opCostPerSqmMonth: 22,
    yieldKgPerSqm: 2.5, farmGatePerKg: 35, waterLPerSqmDay: 5, difficulty: 1, areaKind: 'bed',
    notes: 'Quick turnaround; watch for flea beetles and caterpillars.' },
  { id: 'lettuce', name: 'Lettuce', sector: 'crops', category: 'Leafy vegetable', maxAreaSqm: 800, emoji: '🥗',
    daysToHarvest: 42, cycleDays: 50, minAreaSqm: 10, startupCostPerSqm: 55, opCostPerSqmMonth: 32,
    yieldKgPerSqm: 2.0, farmGatePerKg: 90, waterLPerSqmDay: 5, difficulty: 2, prefersCool: true, areaKind: 'bed',
    notes: 'Best in cool highland areas or the cooler months; shade net helps in lowlands.' },
  { id: 'sitaw', name: 'Sitaw', localName: 'String beans', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🫛',
    daysToHarvest: 55, cycleDays: 100, minAreaSqm: 10, startupCostPerSqm: 45, opCostPerSqmMonth: 15,
    yieldKgPerSqm: 2.5, farmGatePerKg: 50, waterLPerSqmDay: 4, difficulty: 1, areaKind: 'bed',
    notes: 'Needs a trellis. Fixes nitrogen, good for soil. Steady harvests.' },
  { id: 'okra', name: 'Okra', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🌿',
    daysToHarvest: 50, cycleDays: 110, minAreaSqm: 10, startupCostPerSqm: 40, opCostPerSqmMonth: 15,
    yieldKgPerSqm: 2.0, farmGatePerKg: 45, waterLPerSqmDay: 4, difficulty: 1, areaKind: 'bed',
    notes: 'Heat tolerant. Harvest every 1-2 days once pods start.' },
  { id: 'patola', name: 'Patola', localName: 'Sponge gourd', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🥒',
    daysToHarvest: 60, cycleDays: 120, minAreaSqm: 10, startupCostPerSqm: 50, opCostPerSqmMonth: 15,
    yieldKgPerSqm: 3.0, farmGatePerKg: 40, waterLPerSqmDay: 5, difficulty: 1, areaKind: 'bed',
    notes: 'Vines on a trellis; productive for months.' },
  { id: 'talong', name: 'Talong', localName: 'Eggplant', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🍆',
    daysToHarvest: 75, cycleDays: 150, minAreaSqm: 10, startupCostPerSqm: 55, opCostPerSqmMonth: 22,
    yieldKgPerSqm: 5.0, farmGatePerKg: 45, waterLPerSqmDay: 5, difficulty: 2, areaKind: 'bed',
    notes: 'Strong market demand. Watch for fruit & shoot borer.' },
  { id: 'ampalaya', name: 'Ampalaya', localName: 'Bitter gourd', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🥒',
    daysToHarvest: 70, cycleDays: 130, minAreaSqm: 10, startupCostPerSqm: 60, opCostPerSqmMonth: 20,
    yieldKgPerSqm: 2.5, farmGatePerKg: 60, waterLPerSqmDay: 5, difficulty: 2, areaKind: 'bed',
    notes: 'Good price; needs trellis and fruit bagging for quality.' },
  { id: 'kamatis', name: 'Kamatis', localName: 'Tomato', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🍅',
    daysToHarvest: 70, cycleDays: 130, minAreaSqm: 15, startupCostPerSqm: 70, opCostPerSqmMonth: 30,
    yieldKgPerSqm: 5.0, farmGatePerKg: 40, waterLPerSqmDay: 5, difficulty: 2, areaKind: 'bed',
    notes: 'Price swings are large. Rain shelter reduces disease.' },
  { id: 'sili', name: 'Sili', localName: 'Chili', sector: 'crops', category: 'Fruiting vegetable', maxAreaSqm: 2500, emoji: '🌶️',
    daysToHarvest: 75, cycleDays: 180, minAreaSqm: 10, startupCostPerSqm: 60, opCostPerSqmMonth: 25,
    yieldKgPerSqm: 2.0, farmGatePerKg: 120, waterLPerSqmDay: 4, difficulty: 2, areaKind: 'bed',
    notes: 'High value per kg, long harvest window.' },
  { id: 'corn', name: 'Corn', localName: 'Mais', sector: 'crops', category: 'Field crop', emoji: '🌽',
    daysToHarvest: 100, cycleDays: 110, minAreaSqm: 2000, startupCostPerSqm: 1.8, opCostPerSqmMonth: 1.2,
    yieldKgPerSqm: 0.55, farmGatePerKg: 14, waterLPerSqmDay: 3, difficulty: 2, areaKind: 'bed',
    notes: 'Field crop for hectares; thin margins, depends on yield and price.' },
  { id: 'rice', name: 'Rice', localName: 'Palay', sector: 'crops', category: 'Field crop', emoji: '🌾',
    daysToHarvest: 110, cycleDays: 120, minAreaSqm: 3000, startupCostPerSqm: 2.5, opCostPerSqmMonth: 1.8,
    yieldKgPerSqm: 0.45, farmGatePerKg: 20, waterLPerSqmDay: 12, difficulty: 2, areaKind: 'bed',
    notes: 'Needs irrigation or reliable rain. Join a cooperative for better inputs and buyers.' },

  // ---------------- FISH ----------------
  { id: 'tilapia', name: 'Tilapia', sector: 'fish', category: 'Freshwater fish', emoji: '🐟',
    daysToHarvest: 120, cycleDays: 150, minAreaSqm: 20, startupCostPerSqm: 150, opCostPerSqmMonth: 25,
    yieldKgPerSqm: 1.5, farmGatePerKg: 110, waterLPerSqmDay: 25, difficulty: 1, areaKind: 'pond',
    notes: 'Hardy and easy to sell. Feed is the biggest cost; manage water quality.' },
  { id: 'hito', name: 'Hito', localName: 'Catfish', freshOnly: true, sector: 'fish', category: 'Freshwater fish', emoji: '🐟',
    daysToHarvest: 100, cycleDays: 120, minAreaSqm: 15, startupCostPerSqm: 200, opCostPerSqmMonth: 68,
    yieldKgPerSqm: 4.0, farmGatePerKg: 110, waterLPerSqmDay: 30, difficulty: 2, areaKind: 'pond',
    notes: 'Tolerates crowding and low oxygen; needs cover to stop escapes.' },
  { id: 'bangus', name: 'Bangus', localName: 'Milkfish', sector: 'fish', category: 'Brackish-water fish', emoji: '🐟',
    daysToHarvest: 120, cycleDays: 150, minAreaSqm: 2000, startupCostPerSqm: 60, opCostPerSqmMonth: 9,
    yieldKgPerSqm: 0.6, farmGatePerKg: 150, waterLPerSqmDay: 20, difficulty: 2, needsBrackish: true, areaKind: 'pond',
    notes: 'Brackish/coastal pond. Larger area and a fishpond lease or title are needed.' },
  { id: 'ulang', name: 'Ulang', localName: 'Freshwater prawn', freshOnly: true, sector: 'fish', category: 'Freshwater prawn', emoji: '🦐',
    daysToHarvest: 130, cycleDays: 150, minAreaSqm: 100, startupCostPerSqm: 120, opCostPerSqmMonth: 12,
    yieldKgPerSqm: 0.3, farmGatePerKg: 450, waterLPerSqmDay: 20, difficulty: 3, areaKind: 'pond',
    notes: 'High price, demanding water quality. Not for first-timers.' },

  // ---------------- LIVESTOCK ----------------
  { id: 'native_chicken', name: 'Native chicken', localName: 'Manok na native', sector: 'livestock', category: 'Poultry', emoji: '🐓',
    daysToHarvest: 150, cycleDays: 160, minAreaSqm: 10, startupCostPerSqm: 450, opCostPerSqmMonth: 45,
    yieldKgPerSqm: 2.6, farmGatePerKg: 220, waterLPerSqmDay: 2, difficulty: 1, areaKind: 'house',
    notes: 'Low feed cost with free-range foraging; premium price.' },
  { id: 'broiler', name: 'Broiler chicken', sector: 'livestock', category: 'Poultry', emoji: '🍗',
    daysToHarvest: 35, cycleDays: 42, minAreaSqm: 20, startupCostPerSqm: 1800, opCostPerSqmMonth: 1100,
    yieldKgPerSqm: 18, farmGatePerKg: 95, waterLPerSqmDay: 4, difficulty: 2, areaKind: 'house',
    notes: 'Fast cycle but high working capital and disease risk. Best with a contract buyer.' },
  { id: 'itik', name: 'Itik', localName: 'Layer ducks', sector: 'livestock', category: 'Poultry', emoji: '🦆',
    daysToHarvest: 140, cycleDays: 365, minAreaSqm: 15, startupCostPerSqm: 700, opCostPerSqmMonth: 215,
    yieldKgPerSqm: 28, farmGatePerKg: 130, waterLPerSqmDay: 5, difficulty: 2, areaKind: 'house',
    notes: 'Egg production (balut / salted egg market). Eggs counted by weight here.' },
  { id: 'goat', name: 'Goat', localName: 'Kambing', sector: 'livestock', category: 'Ruminant', emoji: '🐐',
    daysToHarvest: 150, cycleDays: 180, minAreaSqm: 12, startupCostPerSqm: 1200, opCostPerSqmMonth: 170,
    yieldKgPerSqm: 8.3, farmGatePerKg: 180, waterLPerSqmDay: 3, difficulty: 2, areaKind: 'house',
    notes: 'Raised slatted house, forage-based. Needs deworming and clean housing.' },
];

// ---------- user-added items ----------
// The store pushes the user's custom items in here (setCustomItems) so every lookup below - the planner,
// market, records and health screens - sees built-in and custom items through one door.
let custom: CatalogItem[] = [];
export const setCustomItems = (items: CatalogItem[]) => { custom = items ?? []; };

/** Built-in catalog followed by the user's own items. Prefer this over CATALOG when listing choices. */
export const allItems = (): CatalogItem[] => (custom.length ? [...CATALOG, ...custom] : CATALOG);

export const catalogById = (id: string): CatalogItem | undefined => allItems().find((c) => c.id === id);

export const itemsFor = (sector: Sector): CatalogItem[] => allItems().filter((c) => c.sector === sector);

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface CustomItemInput {
  name: string;
  sector: Sector;
  /** what a grower is paid per kg (live weight for livestock) - the one number we cannot guess */
  farmGatePerKg: number;
  /** optional: days from planting/stocking to first harvest */
  daysToHarvest?: number;
  /** optional: kg harvested per sqm per cycle */
  yieldKgPerSqm?: number;
}

export type CustomItemCheck = { ok: true; item: CatalogItem } | { ok: false; error: string };

/**
 * Turns a few facts the grower knows (name, price, optionally days and yield) into a full catalog item.
 * Everything else is the MEDIAN of the built-in items in the same sector, so a custom item behaves like a
 * typical one rather than an outlier. The note says so, because these are estimates.
 */
export function buildCustomItem(input: CustomItemInput, existing: CatalogItem[] = allItems()): CustomItemCheck {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return { ok: false, error: 'Type the name of what you want to grow or raise.' };
  if (name.length > 40) return { ok: false, error: 'Please use a shorter name (40 letters or fewer).' };
  if (existing.some((c) => c.sector === input.sector && c.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `${name} is already on the list. Tap it to select it.` };
  }
  if (!(input.farmGatePerKg > 0) || input.farmGatePerKg > 5000) return { ok: false, error: 'Enter the price per kilo you expect to be paid (₱1 to ₱5,000).' };
  if (input.daysToHarvest !== undefined && !(input.daysToHarvest >= 7 && input.daysToHarvest <= 1000)) return { ok: false, error: 'Days to harvest should be between 7 and 1,000.' };
  if (input.yieldKgPerSqm !== undefined && !(input.yieldKgPerSqm > 0 && input.yieldKgPerSqm <= 100)) return { ok: false, error: 'Yield per sqm should be more than 0 and at most 100 kg.' };

  const base = CATALOG.filter((c) => c.sector === input.sector);
  const med = (f: (c: CatalogItem) => number) => median(base.map(f));
  const days = Math.round(input.daysToHarvest ?? med((c) => c.daysToHarvest));
  const cycleRatio = med((c) => c.cycleDays / c.daysToHarvest);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  let id = `custom-${slug}`;
  for (let n = 2; existing.some((c) => c.id === id); n++) id = `custom-${slug}-${n}`;

  return {
    ok: true,
    item: {
      id,
      name,
      sector: input.sector,
      category: 'My own',
      emoji: input.sector === 'crops' ? '🌱' : input.sector === 'fish' ? '🐟' : '🐾',
      daysToHarvest: days,
      cycleDays: Math.max(days + 7, Math.round(days * cycleRatio)),
      minAreaSqm: Math.round(med((c) => c.minAreaSqm)),
      startupCostPerSqm: Math.round(med((c) => c.startupCostPerSqm)),
      opCostPerSqmMonth: Math.round(med((c) => c.opCostPerSqmMonth)),
      yieldKgPerSqm: round1(input.yieldKgPerSqm ?? med((c) => c.yieldKgPerSqm)),
      farmGatePerKg: Math.round(input.farmGatePerKg * 100) / 100,
      waterLPerSqmDay: round1(med((c) => c.waterLPerSqmDay)),
      difficulty: 2,
      areaKind: base[0].areaKind,
      maxAreaSqm: base.some((c) => c.maxAreaSqm) ? Math.round(median(base.filter((c) => c.maxAreaSqm).map((c) => c.maxAreaSqm!))) : undefined,
      notes: `Your own item. Costs, water use and anything you left blank are estimated from typical ${input.sector === 'crops' ? 'crops' : input.sector === 'fish' ? 'fish' : 'animals'}. Check them with your DA, BFAR or LGU technician and update with your real figures.`,
      custom: true,
    },
  };
}

export const SECTOR_LABEL: Record<Sector, string> = {
  crops: 'Vegetables & crops',
  fish: 'Fish & aquaculture',
  livestock: 'Livestock & poultry',
};

export const SECTOR_SHORT: Record<Sector, string> = {
  crops: 'Vegetables',
  fish: 'Fish',
  livestock: 'Livestock',
};
