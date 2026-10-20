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

  // ---------------- FRUITS (added 20 October 2026) ----------------
  // ESTIMATES like everything here, not sourced figures. Trees and other perennials: `daysToHarvest` = planting (grafted or
  // marcotted seedling, sucker, cutting) to the first real harvest; `cycleDays` 365 = one harvest season a year once bearing;
  // `yieldKgPerSqm` = kg per sqm per year at bearing age (young trees give less); costs are per sqm of orchard, spacing included
  // (`perPlantSqm` = one tree, mat or post). The planner warns that income from trees starts only after the waiting years.
  { id: 'mango', name: 'Mango', localName: 'Mangga (carabao)', sector: 'fruits', category: 'Fruit tree', emoji: '🥭', perPlantSqm: 64,
    daysToHarvest: 1300, cycleDays: 365, minAreaSqm: 64, startupCostPerSqm: 8, opCostPerSqmMonth: 2.5,
    yieldKgPerSqm: 1.2, farmGatePerKg: 55, waterLPerSqmDay: 1.5, difficulty: 2, areaKind: 'orchard',
    notes: 'Grafted seedlings bear after about 3 to 4 years, more each year after. About 8 x 8 m per tree. Flower induction, spraying and fruit bagging decide the harvest.' },
  { id: 'banana', name: 'Banana', localName: 'Saging (lakatan, saba)', sector: 'fruits', category: 'Fruit crop', emoji: '🍌', perPlantSqm: 9,
    daysToHarvest: 330, cycleDays: 365, minAreaSqm: 9, startupCostPerSqm: 11, opCostPerSqmMonth: 2.8,
    yieldKgPerSqm: 1.4, farmGatePerKg: 35, waterLPerSqmDay: 4, difficulty: 1, areaKind: 'orchard',
    notes: 'First bunch about 10 to 12 months after planting, then about one bunch per mat a year. About 3 x 3 m per mat. Use clean suckers or tissue-culture plantlets against bunchy top and Panama disease.' },
  { id: 'papaya', name: 'Papaya', sector: 'fruits', category: 'Fruit crop', emoji: '🍈', perPlantSqm: 6,
    daysToHarvest: 270, cycleDays: 365, minAreaSqm: 6, startupCostPerSqm: 13, opCostPerSqmMonth: 3.3,
    yieldKgPerSqm: 4.5, farmGatePerKg: 18, waterLPerSqmDay: 3, difficulty: 2, areaKind: 'orchard',
    notes: 'Fruits within about 8 to 10 months. About 2.5 x 2.5 m per tree. Ringspot virus is common: start with healthy seedlings, remove sick trees and replant every 2 to 3 years. Hates standing water.' },
  { id: 'calamansi', name: 'Calamansi', sector: 'fruits', category: 'Fruit tree', emoji: '🍋', perPlantSqm: 12,
    daysToHarvest: 550, cycleDays: 365, minAreaSqm: 12, startupCostPerSqm: 15, opCostPerSqmMonth: 2.8,
    yieldKgPerSqm: 1.7, farmGatePerKg: 40, waterLPerSqmDay: 2, difficulty: 1, areaKind: 'orchard',
    notes: 'Marcotted or grafted trees bear in about 1 to 2 years. About 3 x 4 m per tree. Steady local demand; prices swing with the season.' },
  { id: 'pineapple', name: 'Pineapple', localName: 'Pinya', sector: 'fruits', category: 'Fruit crop', emoji: '🍍', perPlantSqm: 0.2,
    daysToHarvest: 480, cycleDays: 540, minAreaSqm: 10, startupCostPerSqm: 30, opCostPerSqmMonth: 1.5,
    yieldKgPerSqm: 3, farmGatePerKg: 18, waterLPerSqmDay: 1, difficulty: 1, areaKind: 'orchard',
    notes: 'First fruit about 14 to 18 months after planting suckers, about 5 plants per sqm in double rows. Drought tolerant; needs well-drained soil. Flower forcing (ask your DA technician) times the harvest.' },
  { id: 'dragon_fruit', name: 'Dragon fruit', localName: 'Pitaya', sector: 'fruits', category: 'Fruit crop', emoji: '🌵', perPlantSqm: 7.5,
    daysToHarvest: 450, cycleDays: 365, minAreaSqm: 8, startupCostPerSqm: 120, opCostPerSqmMonth: 5.5,
    yieldKgPerSqm: 1.6, farmGatePerKg: 80, waterLPerSqmDay: 1, difficulty: 2, areaKind: 'orchard',
    notes: 'Climbing cactus: 4 cuttings on a strong post with a ring on top, about 2.5 x 3 m per post. Fruits in about 12 to 18 months. Hates standing water; flowers open at night.' },
  { id: 'lanzones', name: 'Lanzones', sector: 'fruits', category: 'Fruit tree', emoji: '🍇', perPlantSqm: 36, shadeTolerant: true,
    daysToHarvest: 2000, cycleDays: 365, minAreaSqm: 36, startupCostPerSqm: 11, opCostPerSqmMonth: 1.4,
    yieldKgPerSqm: 1.4, farmGatePerKg: 50, waterLPerSqmDay: 2, difficulty: 3, areaKind: 'orchard',
    notes: 'Slow: grafted trees take about 5 to 7 years to bear (from seed, much longer). About 6 x 6 m per tree. Likes humid, partly shaded spots when young, e.g. under coconut. A long-term investment.' },
  { id: 'rambutan', name: 'Rambutan', sector: 'fruits', category: 'Fruit tree', emoji: '🍒', perPlantSqm: 64,
    daysToHarvest: 1280, cycleDays: 365, minAreaSqm: 64, startupCostPerSqm: 8, opCostPerSqmMonth: 1.6,
    yieldKgPerSqm: 1.1, farmGatePerKg: 40, waterLPerSqmDay: 2, difficulty: 2, areaKind: 'orchard',
    notes: 'Grafted trees bear after about 3 to 4 years. About 8 x 8 m per tree. Prices drop in the peak season, so plan your buyers.' },
  { id: 'guava', name: 'Guava', localName: 'Bayabas', sector: 'fruits', category: 'Fruit tree', emoji: '🍐', perPlantSqm: 16,
    daysToHarvest: 400, cycleDays: 365, minAreaSqm: 16, startupCostPerSqm: 12, opCostPerSqmMonth: 2.1,
    yieldKgPerSqm: 1.9, farmGatePerKg: 40, waterLPerSqmDay: 2, difficulty: 1, areaKind: 'orchard',
    notes: 'Hardy and early: marcotted trees bear in about a year. About 4 x 4 m per tree. Bag the fruits against fruit flies and prune after each harvest.' },
  { id: 'watermelon', name: 'Watermelon', localName: 'Pakwan', sector: 'fruits', category: 'Fruit crop', emoji: '🍉', perPlantSqm: 2,
    daysToHarvest: 70, cycleDays: 90, minAreaSqm: 20, startupCostPerSqm: 25, opCostPerSqmMonth: 8,
    yieldKgPerSqm: 2, farmGatePerKg: 20, waterLPerSqmDay: 4, difficulty: 2, areaKind: 'orchard',
    notes: 'Short-season vine (about 70 days), best in the dry season with full sun and well-drained soil. Rotate fields to avoid wilt.' },

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

const CUSTOM_EMOJI: Record<Sector, string> = { crops: '🌱', fruits: '🌳', fish: '🐟', livestock: '🐾' };
const CUSTOM_NOUN: Record<Sector, string> = { crops: 'crops', fruits: 'fruits', fish: 'fish', livestock: 'animals' };

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
  const maxDays = input.sector === 'fruits' ? 3650 : 1000; // fruit trees can take years to bear
  if (input.daysToHarvest !== undefined && !(input.daysToHarvest >= 7 && input.daysToHarvest <= maxDays)) return { ok: false, error: `Days to harvest should be between 7 and ${maxDays.toLocaleString()}.` };
  if (input.yieldKgPerSqm !== undefined && !(input.yieldKgPerSqm > 0 && input.yieldKgPerSqm <= 100)) return { ok: false, error: 'Yield per sqm should be more than 0 and at most 100 kg.' };

  const sectorBase = CATALOG.filter((c) => c.sector === input.sector);
  const days = Math.round(input.daysToHarvest ?? median(sectorBase.map((c) => c.daysToHarvest)));
  // a fruit that takes more than a year is estimated from the fruit trees (spacing, costs, yield); a quicker one from the other fruits
  const base = input.sector === 'fruits' ? sectorBase.filter((c) => (c.category === 'Fruit tree') === days > 365) : sectorBase;
  const med = (f: (c: CatalogItem) => number) => median(base.map(f));
  const cycleRatio = med((c) => c.cycleDays / c.daysToHarvest);
  // a fruit that takes more than a year to bear is a tree or other perennial: one harvest season a year once bearing
  const cycleDays = input.sector === 'fruits' && days > 365 ? 365 : Math.max(days + 7, Math.round(days * cycleRatio));
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
      emoji: CUSTOM_EMOJI[input.sector],
      daysToHarvest: days,
      cycleDays,
      minAreaSqm: Math.round(med((c) => c.minAreaSqm)),
      startupCostPerSqm: Math.round(med((c) => c.startupCostPerSqm)),
      opCostPerSqmMonth: Math.round(med((c) => c.opCostPerSqmMonth)),
      yieldKgPerSqm: round1(input.yieldKgPerSqm ?? med((c) => c.yieldKgPerSqm)),
      farmGatePerKg: Math.round(input.farmGatePerKg * 100) / 100,
      waterLPerSqmDay: round1(med((c) => c.waterLPerSqmDay)),
      difficulty: 2,
      areaKind: base[0].areaKind,
      maxAreaSqm: base.some((c) => c.maxAreaSqm) ? Math.round(median(base.filter((c) => c.maxAreaSqm).map((c) => c.maxAreaSqm!))) : undefined,
      perPlantSqm: input.sector === 'fruits' ? Math.round(med((c) => c.perPlantSqm ?? c.minAreaSqm)) : undefined,
      notes: `Your own item. Costs, water use and anything you left blank are estimated from typical ${CUSTOM_NOUN[input.sector]}. Check them with your DA, BFAR or LGU technician and update with your real figures.`,
      custom: true,
    },
  };
}

/** Every type, in the order the app shows them (and the order of `PlanInput.sectors`). */
export const SECTORS: readonly Sector[] = ['crops', 'fruits', 'fish', 'livestock'];

export const SECTOR_LABEL: Record<Sector, string> = {
  crops: 'Vegetables & crops',
  fruits: 'Fruits',
  fish: 'Fish & aquaculture',
  livestock: 'Livestock & poultry',
};

export const SECTOR_SHORT: Record<Sector, string> = {
  crops: 'Vegetables',
  fruits: 'Fruits',
  fish: 'Fish',
  livestock: 'Livestock',
};

export const isSector = (v: unknown): v is Sector => SECTORS.includes(v as Sector);

/**
 * The types of a plan (or farm): `sectors` when present, otherwise the single `sector` that plans made before
 * 20 October 2026 have. Always one or more, without duplicates, in SECTORS order.
 */
export function planSectors(p: { sector?: unknown; sectors?: unknown }): Sector[] {
  const list = Array.isArray(p.sectors) ? p.sectors.filter(isSector) : [];
  const picked = list.length ? list : isSector(p.sector) ? [p.sector] : [];
  const out = SECTORS.filter((s) => picked.includes(s));
  return out.length ? out : ['crops'];
}

/** "Vegetables & crops", or "Vegetables + Fruits + Fish" for a mix. */
export const sectorsLabel = (sectors: Sector[]) => (sectors.length === 1 ? SECTOR_LABEL[sectors[0]] : sectors.map((s) => SECTOR_SHORT[s]).join(' + '));

const PLANT_UNIT: Record<string, string> = { banana: 'mat', dragon_fruit: 'post' };
/** A fruit tree: built in as one, or the user's own fruit that takes more than a year to bear. */
const isFruitTree = (i: CatalogItem) => i.category === 'Fruit tree' || (i.custom === true && i.sector === 'fruits' && i.daysToHarvest > 365);

/**
 * Where the trees (mats, posts, plants) of a fruit go in a block of the site plan: one per square cell of the usual spacing,
 * at least one. The drawing and the "about N trees" text both use this, so they always agree.
 */
export function plantSpots(item: CatalogItem, r: { x: number; y: number; w: number; h: number }): { x: number; y: number; rad: number }[] {
  if (!item.perPlantSqm) return [];
  // rows and columns rounded to the nearest whole tree, so the real spacing stays close to the usual one
  const step = Math.sqrt(item.perPlantSqm);
  const cols = Math.max(1, Math.round(r.w / step));
  const rows = Math.max(1, Math.round(r.h / step));
  const gx = r.w / cols;
  const gy = r.h / rows;
  const rad = Math.min(gx, gy) * 0.32;
  const out: { x: number; y: number; rad: number }[] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push({ x: r.x + gx * (i + 0.5), y: r.y + gy * (j + 0.5), rad });
  return out;
}

/**
 * Fruits: "about 3 trees" (or mats, posts, plants) at the item's usual spacing; '' for other items.
 * With the item's drawn blocks it counts what fits in them; without, it estimates from the area.
 */
export function plantsLabel(item: CatalogItem, areaSqm: number, blocks: { x: number; y: number; w: number; h: number }[] = []): string {
  if (!item.perPlantSqm) return '';
  const n = blocks.length
    ? blocks.reduce((t, b) => t + plantSpots(item, b).length, 0)
    : Math.max(1, Math.floor(areaSqm / item.perPlantSqm + 1e-6));
  const unit = PLANT_UNIT[item.id] ?? (isFruitTree(item) ? 'tree' : 'plant');
  return `about ${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;
}

/** "about 9 months", "about 3½ years": how long until the first harvest, in words a grower uses. */
export function waitLabel(days: number): string {
  if (days < 120) return `about ${Math.round(days)} days`;
  if (days < 540) return `about ${Math.round(days / 30)} months`;
  const half = Math.round((days / 365) * 2) / 2;
  return `about ${Math.floor(half)}${half % 1 ? '½' : ''} years`;
}
