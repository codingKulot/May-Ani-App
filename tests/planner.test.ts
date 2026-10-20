import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { rectArea } from '@/services/planner/layout';
import { gardenPart } from '@/services/build/garden';
import { generateDesigns } from '@/services/build/designs';
import { DEFAULT_PLACE } from '@/data/places';
import { CATALOG, catalogById, planSectors, plantSpots, plantsLabel, waitLabel } from '@/data/catalog';
import type { PlanInput, LayoutRect, Sector } from '@/types';

const site: PlanInput['site'] = {
  slope: 'gentle', waterSource: 'well', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false,
};
const mk = (o: Partial<PlanInput> = {}): PlanInput => ({
  name: '', sector: 'crops', areaSqm: 20, capital: 5000, location: DEFAULT_PLACE, experience: 'beginner',
  goal: 'family_sell', site, photoCount: 0, ...o,
});

const overlap = (a: LayoutRect, b: LayoutRect) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

const SCENARIOS: [string, Partial<PlanInput>][] = [
  ['backyard veg', {}],
  ['tiny veg', { areaSqm: 5, capital: 500 }],
  ['small farm', { areaSqm: 500, capital: 60000, experience: 'intermediate' }],
  ['hectare', { areaSqm: 10000, capital: 150000, experience: 'intermediate' }],
  ['fish tanks', { sector: 'fish', areaSqm: 100, capital: 30000 }],
  ['brackish fishpond', { sector: 'fish', areaSqm: 5000, capital: 600000, experience: 'intermediate', site: { ...site, brackishWater: true } }],
  ['livestock', { sector: 'livestock', areaSqm: 30, capital: 15000 }],
  ['big livestock', { sector: 'livestock', areaSqm: 400, capital: 400000, experience: 'intermediate' }],
  ['shaded', { areaSqm: 60, capital: 20000, site: { ...site, sunlight: 'shaded' } }],
  // fruits (20 October 2026)
  ['fruit garden', { sector: 'fruits', sectors: ['fruits'], areaSqm: 200, capital: 30000 }],
  ['tiny fruit', { sector: 'fruits', areaSqm: 20, capital: 5000 }],
  ['fruit orchard', { sector: 'fruits', areaSqm: 5000, capital: 300000, experience: 'intermediate' }],
  // mixed plans: one plot, one budget
  ['veg + fruit', { sector: 'crops', sectors: ['crops', 'fruits'], areaSqm: 100, capital: 20000 }],
  ['veg + fish', { sector: 'crops', sectors: ['crops', 'fish'], areaSqm: 200, capital: 40000 }],
  ['fruit + livestock', { sector: 'fruits', sectors: ['fruits', 'livestock'], areaSqm: 1000, capital: 80000, experience: 'intermediate' }],
  ['all four', { sector: 'crops', sectors: ['crops', 'fruits', 'fish', 'livestock'], areaSqm: 400, capital: 100000 }],
  ['all four, tiny', { sector: 'crops', sectors: ['crops', 'fruits', 'fish', 'livestock'], areaSqm: 20, capital: 5000 }],
  ['big mix', { sector: 'crops', sectors: ['crops', 'fruits', 'fish', 'livestock'], areaSqm: 20000, capital: 2000000, experience: 'intermediate' }],
];
const PROD_KINDS = ['bed', 'pond', 'house', 'orchard'];

describe('planner invariants', () => {
  for (const [label, o] of SCENARIOS) {
    const input = mk(o);
    const r = generatePlan(input);

    test(`${label}: produces a plan with allocations`, () => {
      expect(r.allocations.length).toBeGreaterThan(0);
      expect(r.usedAreaSqm).toBeGreaterThan(0);
    });

    test(`${label}: layout stays inside the plot and production rects never overlap`, () => {
      const { widthM, lengthM, rects } = r.layout;
      for (const x of rects) {
        expect(x.x).toBeGreaterThanOrEqual(-1e-6);
        expect(x.y).toBeGreaterThanOrEqual(-1e-6);
        expect(x.x + x.w).toBeLessThanOrEqual(widthM + 0.11);
        expect(x.y + x.h).toBeLessThanOrEqual(lengthM + 0.11);
      }
      const prod = rects.filter((x) => [...PROD_KINDS, 'run'].includes(x.kind));
      for (let i = 0; i < prod.length; i++) for (let j = i + 1; j < prod.length; j++) {
        expect(overlap(prod[i], prod[j])).toBe(false);
      }
    });

    test(`${label}: priced area equals drawn area`, () => {
      const drawn = r.layout.rects
        .filter((x) => PROD_KINDS.includes(x.kind))
        .reduce((s, x) => s + rectArea(x), 0);
      expect(Math.abs(drawn - r.usedAreaSqm)).toBeLessThan(0.6);
    });

    test(`${label}: cost lines add up and are positive`, () => {
      const total = r.cost.breakdown.reduce((s, l) => s + l.amount, 0);
      expect(total).toBe(r.cost.initial);
      expect(r.cost.breakdown.every((l) => l.amount > 0)).toBe(true);
      expect(r.cost.monthlyIncomeMax).toBeGreaterThanOrEqual(r.cost.monthlyIncomeMin);
    });

    test(`${label}: respects the capital or says clearly that it does not`, () => {
      if (r.cost.initial > input.capital) {
        expect(r.warnings.some((w) => w.includes('below the estimated minimum'))).toBe(true);
      }
    });

    test(`${label}: only recommends items of the chosen types`, () => {
      for (const a of r.allocations) {
        const item = CATALOG.find((c) => c.id === a.itemId);
        expect(planSectors(input)).toContain(item!.sector);
      }
    });
  }
});

describe('planner behaviour', () => {
  test('a ₱5,000 20 sqm backyard garden fits the budget with a sensible start-up cost', () => {
    const r = generatePlan(mk());
    expect(r.cost.initial).toBeLessThanOrEqual(5000);
    expect(r.cost.initial).toBeGreaterThan(1500);
    expect(r.allocations.length).toBeGreaterThanOrEqual(2);
    expect(r.phased).toBe(false);
  });

  test('beginners only get easy options', () => {
    for (const sector of ['crops', 'fish', 'livestock'] as const) {
      const r = generatePlan(mk({ sector, areaSqm: sector === 'crops' ? 40 : 60, capital: 80000 }));
      for (const a of r.allocations) expect(CATALOG.find((c) => c.id === a.itemId)!.difficulty).toBe(1);
    }
  });

  test('brackish sites never get freshwater-only species, and bangus needs brackish water', () => {
    const brackish = generatePlan(mk({ sector: 'fish', areaSqm: 5000, capital: 600000, experience: 'intermediate', site: { ...site, brackishWater: true } }));
    expect(brackish.allocations.some((a) => a.itemId === 'hito' || a.itemId === 'ulang')).toBe(false);
    const fresh = generatePlan(mk({ sector: 'fish', areaSqm: 5000, capital: 600000, experience: 'intermediate' }));
    expect(fresh.allocations.some((a) => a.itemId === 'bangus')).toBe(false);
  });

  test('small capital on a big plot produces a phased plan, not an overspend', () => {
    const r = generatePlan(mk({ areaSqm: 10000, capital: 150000, experience: 'intermediate' }));
    expect(r.phased).toBe(true);
    expect(r.cost.initial).toBeLessThanOrEqual(150000);
    expect(r.warnings[0]).toContain('Start with this phase');
  });

  test('hectare-scale farms do not recommend leafy micro-crops', () => {
    const r = generatePlan(mk({ areaSqm: 10000, capital: 500000, experience: 'intermediate' }));
    for (const a of r.allocations) expect(CATALOG.find((c) => c.id === a.itemId)!.category).not.toBe('Leafy vegetable');
  });

  test('shade removes sun-hungry fruiting crops', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 20000, experience: 'intermediate', site: { ...site, sunlight: 'shaded' } }));
    for (const a of r.allocations) expect(CATALOG.find((c) => c.id === a.itemId)!.category).toBe('Leafy vegetable');
  });

  test('water, drainage and electrical sections are always filled in for real plans', () => {
    const r = generatePlan(mk({ sector: 'fish', areaSqm: 300, capital: 80000, experience: 'intermediate' }));
    expect(r.water.demandLPerDay).toBeGreaterThan(0);
    expect(r.water.steps.length).toBeGreaterThan(0);
    expect(r.drainage.steps.length).toBeGreaterThan(0);
    expect(r.electrical.totalW).toBeGreaterThan(0);
    expect(r.electrical.steps.length).toBeGreaterThan(0);
  });

  test('flood-prone and steep sites add specific drainage steps', () => {
    const r = generatePlan(mk({ areaSqm: 100, capital: 30000, site: { ...site, floodProne: true, slope: 'steep' } }));
    expect(r.drainage.steps.join(' ')).toContain('Flood-prone');
    expect(r.drainage.steps.join(' ')).toContain('Steep slope');
  });

  test('preferred crops are honoured when feasible', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 30000, experience: 'intermediate', preferred: ['ampalaya'] }));
    expect(r.allocations.some((a) => a.itemId === 'ampalaya')).toBe(true);
  });

  test('picked items are used exactly, with no extras added', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 30000, preferred: ['okra', 'sitaw'] }));
    expect(r.allocations.map((a) => a.itemId).sort()).toEqual(['okra', 'sitaw']);
  });

  test('a picked item that does not suit the site stays in, with a plain warning', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 30000, experience: 'beginner', preferred: ['talong'] }));
    expect(r.allocations.map((a) => a.itemId)).toEqual(['talong']);
    expect(r.warnings.some((w) => w.startsWith('You picked Talong, but it is rated harder'))).toBe(true);
    const fish = generatePlan(mk({ sector: 'fish', areaSqm: 5000, capital: 600000, experience: 'intermediate', preferred: ['bangus'] }));
    expect(fish.allocations.map((a) => a.itemId)).toEqual(['bangus']);
    expect(fish.warnings.some((w) => w.includes('needs brackish'))).toBe(true);
  });

  test('picks that do not fit are named in a warning', () => {
    const many = ['kangkong', 'pechay', 'sitaw', 'okra', 'patola', 'talong', 'ampalaya', 'kamatis', 'sili'];
    const r = generatePlan(mk({ areaSqm: 10, capital: 3000, experience: 'advanced', preferred: many }));
    expect(r.allocations.length).toBeGreaterThan(0);
    expect(r.allocations.length).toBeLessThan(many.length);
    expect(r.allocations.every((a) => many.includes(a.itemId))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('Not enough space or capital for everything you picked'))).toBe(true);
  });

  test('picks from another sector are ignored, so suggestions still work', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 30000, preferred: ['tilapia'] }));
    expect(r.allocations.length).toBeGreaterThan(0);
    expect(r.allocations.every((a) => a.itemId !== 'tilapia')).toBe(true);
  });

  test('is deterministic', () => {
    expect(generatePlan(mk({ areaSqm: 120, capital: 20000 }))).toEqual(generatePlan(mk({ areaSqm: 120, capital: 20000 })));
  });
});

// ------------------------------------------------------------------ fruits and mixed plans (20 October 2026)
const ALL: Sector[] = ['crops', 'fruits', 'fish', 'livestock'];
const sectorOf = (id: string) => catalogById(id)!.sector;

describe('fruits', () => {
  test('the catalog has the Philippine fruits, each a complete fruit item', () => {
    const ids = ['mango', 'banana', 'papaya', 'calamansi', 'pineapple', 'dragon_fruit', 'lanzones', 'rambutan', 'guava', 'watermelon'];
    for (const id of ids) {
      const i = catalogById(id)!;
      expect(i.sector).toBe('fruits');
      expect(i.areaKind).toBe('orchard');
      expect(i.perPlantSqm).toBeGreaterThan(0);
      expect(i.minAreaSqm).toBeGreaterThan(0);
      expect(i.farmGatePerKg).toBeGreaterThan(0);
      if (i.category === 'Fruit tree') expect(i.cycleDays).toBe(365); // trees: one harvest season a year once bearing
    }
  });

  test('trees that take years warn about the wait, and payback includes it', () => {
    const r = generatePlan(mk({ sector: 'fruits', areaSqm: 1000, capital: 200000, experience: 'intermediate', preferred: ['mango'] }));
    expect(r.allocations.map((a) => a.itemId)).toEqual(['mango']);
    expect(r.warnings.some((w) => w.startsWith('Mango (about 3½ years): no harvest for more than a year'))).toBe(true);
    expect(r.cost.paybackMonths ?? Infinity).toBeGreaterThan(1300 / 30);
    expect(r.schedule.find((x) => x.title === 'First Mango harvest')!.week).toBeGreaterThan(52);
  });

  test('beginners get easy fruits that bear within about a year and a half', () => {
    const r = generatePlan(mk({ sector: 'fruits', areaSqm: 300, capital: 60000 }));
    expect(r.allocations.length).toBeGreaterThan(0);
    for (const a of r.allocations) {
      expect(catalogById(a.itemId)!.difficulty).toBe(1);
      expect(catalogById(a.itemId)!.daysToHarvest).toBeLessThan(600);
    }
  });

  test('a shaded site only gets shade-tolerant fruit trees', () => {
    const r = generatePlan(mk({ sector: 'fruits', areaSqm: 300, capital: 90000, experience: 'advanced', site: { ...site, sunlight: 'shaded' } }));
    expect(r.allocations.map((a) => a.itemId)).toEqual(['lanzones']);
  });

  test('tree counts and waiting times read naturally', () => {
    expect(plantsLabel(catalogById('mango')!, 128)).toBe('about 2 trees');
    expect(plantsLabel(catalogById('mango')!, 20)).toBe('about 1 tree');
    expect(plantsLabel(catalogById('banana')!, 27)).toBe('about 3 mats');
    expect(plantsLabel(catalogById('pineapple')!, 10)).toBe('about 50 plants');
    expect(plantsLabel(catalogById('pechay')!, 10)).toBe('');
    expect(waitLabel(25)).toBe('about 25 days');
    expect(waitLabel(270)).toBe('about 9 months');
    expect(waitLabel(1300)).toBe('about 3½ years');
    expect(waitLabel(2000)).toBe('about 5½ years');
  });

  test('the tree count in the text is the number of trees drawn', () => {
    const r = generatePlan(mk({ sector: 'crops', sectors: ['crops', 'fruits'], areaSqm: 300, capital: 100000, preferred: ['papaya', 'mango'], experience: 'advanced' }));
    for (const a of r.allocations.filter((x) => sectorOf(x.itemId) === 'fruits')) {
      const item = catalogById(a.itemId)!;
      const blocks = r.layout.rects.filter((x) => x.itemId === a.itemId && x.kind === 'orchard');
      const drawn = blocks.reduce((t, b) => t + plantSpots(item, b).length, 0);
      expect(plantsLabel(item, a.areaSqm, blocks)).toBe(`about ${drawn} ${item.category === 'Fruit tree' ? 'tree' : 'plant'}${drawn === 1 ? '' : 's'}`);
      expect(r.schedule.find((x) => x.title === `Plant ${item.name}`)!.detail).toContain(`about ${drawn} `);
      // every tree sits inside its block
      for (const b of blocks) for (const p of plantSpots(item, b)) {
        expect(p.x).toBeGreaterThan(b.x);
        expect(p.x).toBeLessThan(b.x + b.w);
        expect(p.y).toBeGreaterThan(b.y);
        expect(p.y).toBeLessThan(b.y + b.h);
      }
    }
  });

  test('orchards are drawn as orchard blocks with one legend entry per fruit', () => {
    const r = generatePlan(mk({ sector: 'fruits', areaSqm: 500, capital: 100000 }));
    const orchards = r.layout.rects.filter((x) => x.kind === 'orchard');
    expect(orchards.length).toBe(r.allocations.length);
    expect(r.layout.legend.map((l) => l.itemId).sort()).toEqual(r.allocations.map((a) => a.itemId).sort());
  });
});

describe('mixed plans', () => {
  const mix = (sectors: Sector[], o: Partial<PlanInput> = {}) => mk({ sector: sectors[0], sectors, ...o });

  test('every chosen type gets its own items, its own even share of land and its own strip of the plot', () => {
    const r = generatePlan(mix(ALL, { areaSqm: 400, capital: 100000 }));
    expect(new Set(r.allocations.map((a) => sectorOf(a.itemId)))).toEqual(new Set(ALL));
    expect(r.split!.zones.map((z) => z.sector)).toEqual(ALL);
    for (const z of r.split!.zones) expect(z.landSqm).toBe(100);
    const zones = r.layout.zones!;
    expect(zones.map((z) => z.sector)).toEqual(ALL);
    for (const x of r.layout.rects.filter((x) => x.itemId)) {
      const z = zones.find((zz) => zz.sector === sectorOf(x.itemId!))!;
      expect(x.x).toBeGreaterThanOrEqual(z.x - 0.11);
      expect(x.y).toBeGreaterThanOrEqual(z.y - 0.11);
      expect(x.x + x.w).toBeLessThanOrEqual(z.x + z.w + 0.11);
      expect(x.y + x.h).toBeLessThanOrEqual(z.y + z.h + 0.11);
    }
  });

  test('the budget split adds up to the start-up cost, and shared costs are counted once', () => {
    for (const sectors of [['crops', 'fruits'], ['crops', 'fish'], ['fruits', 'livestock'], ALL] as Sector[][]) {
      const r = generatePlan(mix(sectors, { areaSqm: 600, capital: 150000, experience: 'intermediate' }));
      const split = r.split!;
      expect(split.zones.reduce((t, z) => t + z.initial, 0) + split.shared).toBe(r.cost.initial);
      expect(split.shared).toBeGreaterThan(0);
      expect(r.layout.rects.filter((x) => x.kind === 'tank').length).toBeLessThanOrEqual(1);
      expect(r.layout.rects.filter((x) => x.kind === 'canal').length).toBe(1);
      for (const label of ['Water system (tank, pump, piping)', 'Drainage canals', 'Tools & equipment', 'Contingency (10%)']) {
        expect(r.cost.breakdown.filter((b) => b.label === label).length).toBe(1);
      }
      // one set-up line per type
      expect(r.cost.breakdown.length).toBeGreaterThanOrEqual(sectors.length);
    }
  });

  test('one budget: the whole mix fits the capital, or the plan says plainly that it does not', () => {
    const fits = generatePlan(mix(['crops', 'fish'], { areaSqm: 200, capital: 40000 }));
    expect(fits.cost.initial).toBeLessThanOrEqual(40000);
    const short = generatePlan(mix(ALL, { areaSqm: 20, capital: 5000 }));
    expect(short.cost.initial).toBeGreaterThan(5000);
    expect(short.warnings[0]).toContain('for this mix');
    expect(short.warnings.some((w) => w.includes('very little room'))).toBe(true);
  });

  test('picks are used per type; a type with no picks gets suggestions', () => {
    const r = generatePlan(mix(['crops', 'fruits'], { areaSqm: 200, capital: 50000, preferred: ['kangkong', 'pechay'] }));
    const crops = r.allocations.filter((a) => sectorOf(a.itemId) === 'crops').map((a) => a.itemId).sort();
    expect(crops).toEqual(['kangkong', 'pechay']);
    expect(r.allocations.some((a) => sectorOf(a.itemId) === 'fruits')).toBe(true);
  });

  test('picks of a type that is not chosen are ignored', () => {
    const r = generatePlan(mk({ areaSqm: 60, capital: 30000, preferred: ['mango', 'goat'] }));
    expect(r.allocations.length).toBeGreaterThan(0);
    expect(r.allocations.every((a) => sectorOf(a.itemId) === 'crops')).toBe(true);
  });

  test('a type where nothing suits the site is left out with a warning, and the others get the land', () => {
    const r = generatePlan(mix(['crops', 'fish'], { areaSqm: 4000, capital: 900000, experience: 'intermediate', site: { ...site, sunlight: 'shaded' } }));
    expect(r.allocations.length).toBeGreaterThan(0);
    expect(r.allocations.every((a) => sectorOf(a.itemId) === 'fish')).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('Vegetables left out'))).toBe(true);
  });

  test('water, drainage and power cover every type', () => {
    const r = generatePlan(mix(ALL, { areaSqm: 800, capital: 300000, experience: 'intermediate' }));
    for (const word of ['Vegetables:', 'Fruits:', 'Fish:', 'Livestock:']) {
      expect(r.water.steps.some((x) => x.startsWith(word))).toBe(true);
      expect(r.drainage.steps.some((x) => x.startsWith(word))).toBe(true);
    }
    const loads = r.electrical.loadsW.map((l) => l.label).join(' ');
    expect(loads).toContain('Aeration');
    expect(loads).toContain('House lighting');
    expect(r.schedule.some((x) => x.title.startsWith('Plant '))).toBe(true);
    expect(r.schedule.some((x) => x.title.startsWith('Stock '))).toBe(true);
    expect(r.schedule.some((x) => x.title.startsWith('Start '))).toBe(true);
  });

  test('is deterministic and does not depend on the order the types were tapped', () => {
    const a = generatePlan(mix(['crops', 'fruits', 'fish'], { areaSqm: 300, capital: 80000 }));
    expect(generatePlan(mix(['crops', 'fruits', 'fish'], { areaSqm: 300, capital: 80000 }))).toEqual(a);
    expect(generatePlan(mk({ sector: 'fish', sectors: ['fish', 'fruits', 'crops'], areaSqm: 300, capital: 80000 }))).toEqual(a);
  });

  test('titles name the mix', () => {
    expect(generatePlan(mix(['crops', 'fruits'], { areaSqm: 100, capital: 20000 })).title).toBe('Backyard Vegetable & Fruit Farm');
    expect(generatePlan(mix(ALL, { areaSqm: 400, capital: 100000 })).title).toBe('Small Mixed Farm');
  });
});

describe('plans made before mixes existed', () => {
  test('a plan with only the old single type reads as that type', () => {
    expect(planSectors({ sector: 'fish' })).toEqual(['fish']);
    expect(planSectors({ sector: 'fish', sectors: [] })).toEqual(['fish']);
    expect(planSectors({ sector: 'crops', sectors: ['fish', 'crops', 'fish'] })).toEqual(['crops', 'fish']);
    expect(planSectors({ sector: 'trees', sectors: ['nope'] })).toEqual(['crops']);
    expect(planSectors({})).toEqual(['crops']);
  });

  test('regenerating an old plan gives the same result as choosing that one type now', () => {
    for (const sector of ['crops', 'fish', 'livestock'] as const) {
      const old = mk({ sector, areaSqm: 300, capital: 80000 });
      expect(generatePlan(old)).toEqual(generatePlan({ ...old, sectors: [sector] }));
      expect(generatePlan(old).split).toBeUndefined();
      expect(generatePlan(old).layout.zones).toBeUndefined();
    }
  });
});

describe('build ideas for mixed plans', () => {
  test('a vegetable plan uses its whole layout, as before', () => {
    const input = mk({ areaSqm: 45, capital: 20000 });
    const r = generatePlan(input);
    expect(gardenPart(input, r)!.layout).toBe(r.layout);
  });

  test('a mixed plan gets ideas for its vegetable beds only, on a plot of their own', () => {
    const input = mk({ sector: 'crops', sectors: ['crops', 'fruits', 'fish'], areaSqm: 300, capital: 100000 });
    const r = generatePlan(input);
    const g = gardenPart(input, r)!;
    expect(g.part).toBe(true);
    expect(g.layout.rects.length).toBeGreaterThan(0);
    for (const x of g.layout.rects) {
      expect(x.kind).toBe('bed');
      expect(sectorOf(x.itemId!)).toBe('crops');
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.y).toBeGreaterThanOrEqual(0);
      expect(x.x + x.w).toBeLessThanOrEqual(g.layout.widthM + 0.01);
      expect(x.y + x.h).toBeLessThanOrEqual(g.layout.lengthM + 0.01);
    }
    expect(g.allocations.every((a) => sectorOf(a.itemId) === 'crops')).toBe(true);
    expect(generateDesigns({ layout: g.layout, allocations: g.allocations, surface: 'soil', sunlight: 'full' }).length).toBe(3);
  });

  test('plans without vegetables get no build ideas', () => {
    const input = mk({ sector: 'fruits', sectors: ['fruits', 'fish'], areaSqm: 300, capital: 100000 });
    expect(gardenPart(input, generatePlan(input))).toBeNull();
  });
});

describe('every combination of types makes a plan', () => {
  const combos: Sector[][] = [];
  for (let m = 1; m < 16; m++) combos.push(ALL.filter((_, i) => m & (1 << i)));
  const sizes: [number, number, PlanInput['experience']][] = [[50, 15000, 'beginner'], [400, 120000, 'intermediate'], [5000, 800000, 'advanced']];
  for (const sectors of combos) for (const [areaSqm, capital, experience] of sizes) {
    test(`${sectors.join(' + ')} on ${areaSqm} sqm`, () => {
      const input = mk({ sector: sectors[0], sectors, areaSqm, capital, experience });
      const r = generatePlan(input);
      expect(r.allocations.length).toBeGreaterThan(0);
      expect(r.cost.breakdown.reduce((t, l) => t + l.amount, 0)).toBe(r.cost.initial);
      expect(Number.isFinite(r.cost.initial) && r.cost.initial > 0).toBe(true);
      if (r.cost.initial > capital) expect(r.warnings[0]).toContain('below the estimated minimum');
      for (const a of r.allocations) expect(sectors).toContain(sectorOf(a.itemId));
      // every chosen type is in the plan, or the plan says why it was left out
      for (const sec of sectors) {
        const there = r.allocations.some((a) => sectorOf(a.itemId) === sec);
        if (!there) expect(r.warnings.some((w) => w.includes('left out'))).toBe(true);
      }
      if (r.split) {
        expect(r.split.zones.reduce((t, z) => t + z.initial, 0) + r.split.shared).toBe(r.cost.initial);
        expect(sectors.length).toBeGreaterThan(1);
      }
      const drawn = r.layout.rects.filter((x) => PROD_KINDS.includes(x.kind)).reduce((t, x) => t + rectArea(x), 0);
      expect(Math.abs(drawn - r.usedAreaSqm)).toBeLessThan(0.6);
      const prod = r.layout.rects.filter((x) => [...PROD_KINDS, 'run'].includes(x.kind));
      for (let i = 0; i < prod.length; i++) for (let j = i + 1; j < prod.length; j++) expect(overlap(prod[i], prod[j])).toBe(false);
      for (const x of r.layout.rects) {
        expect(x.x + x.w).toBeLessThanOrEqual(r.layout.widthM + 0.11);
        expect(x.y + x.h).toBeLessThanOrEqual(r.layout.lengthM + 0.11);
      }
    });
  }
});
