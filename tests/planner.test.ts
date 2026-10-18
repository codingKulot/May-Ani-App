import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { rectArea } from '@/services/planner/layout';
import { DEFAULT_PLACE } from '@/data/places';
import { CATALOG } from '@/data/catalog';
import type { PlanInput, LayoutRect } from '@/types';

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
];

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
      const prod = rects.filter((x) => ['bed', 'pond', 'house', 'run'].includes(x.kind));
      for (let i = 0; i < prod.length; i++) for (let j = i + 1; j < prod.length; j++) {
        expect(overlap(prod[i], prod[j])).toBe(false);
      }
    });

    test(`${label}: priced area equals drawn area`, () => {
      const drawn = r.layout.rects
        .filter((x) => x.kind === 'bed' || x.kind === 'pond' || x.kind === 'house')
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

    test(`${label}: only recommends items that exist in the right sector`, () => {
      for (const a of r.allocations) {
        const item = CATALOG.find((c) => c.id === a.itemId);
        expect(item?.sector).toBe(input.sector);
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
