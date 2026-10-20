import { describe, expect, test, afterEach } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { DEFAULT_PLACE } from '@/data/places';
import { CATALOG, allItems, buildCustomItem, catalogById, itemsFor, plantsLabel, setCustomItems } from '@/data/catalog';
import { referenceSnapshot } from '@/services/market';
import type { PlanInput, Sector } from '@/types';

const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'well', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const mk = (o: Partial<PlanInput> = {}): PlanInput => ({
  name: '', sector: 'crops', areaSqm: 200, capital: 40000, location: DEFAULT_PLACE, experience: 'beginner',
  goal: 'family_sell', site, photoCount: 0, ...o,
});
afterEach(() => setCustomItems([]));

describe('buildCustomItem', () => {
  test('a fruit of your own: a tree that takes over a year bears once a year; a short-season fruit keeps its own cycle', () => {
    const tree = buildCustomItem({ name: 'Pomelo', sector: 'fruits', farmGatePerKg: 60, daysToHarvest: 1100 });
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(tree.item.sector).toBe('fruits');
    expect(tree.item.cycleDays).toBe(365);
    expect(tree.item.perPlantSqm).toBeGreaterThan(0);
    expect(tree.item.emoji).toBe('🌳');
    expect(tree.item.notes).toContain('typical fruits');
    // estimated from the fruit trees: tree spacing, counted in trees
    expect(tree.item.perPlantSqm).toBe(36);
    expect(plantsLabel(tree.item, 72)).toBe('about 2 trees');
    const melon = buildCustomItem({ name: 'Melon', sector: 'fruits', farmGatePerKg: 40, daysToHarvest: 75 });
    expect(melon.ok && melon.item.cycleDays).toBeGreaterThan(75);
    // the same name may exist in another type (a vegetable "Calamansi" added before Fruits existed stays valid)
    expect(buildCustomItem({ name: 'Mango', sector: 'crops', farmGatePerKg: 80 }).ok).toBe(true);
    expect(buildCustomItem({ name: 'Mango', sector: 'fruits', farmGatePerKg: 80 }).ok).toBe(false);
  });

  test('builds a complete item from just a name and a price', () => {
    const r = buildCustomItem({ name: '  Calamansi ', sector: 'crops', farmGatePerKg: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.name).toBe('Calamansi');
    expect(r.item.custom).toBe(true);
    expect(r.item.id).toBe('custom-calamansi');
    for (const k of ['daysToHarvest', 'cycleDays', 'minAreaSqm', 'startupCostPerSqm', 'opCostPerSqmMonth', 'yieldKgPerSqm', 'waterLPerSqmDay'] as const) {
      expect(r.item[k]).toBeGreaterThan(0);
    }
    expect(r.item.cycleDays).toBeGreaterThan(r.item.daysToHarvest);
  });

  test('uses the grower\'s own days and yield when given', () => {
    const r = buildCustomItem({ name: 'Mango', sector: 'crops', farmGatePerKg: 80, daysToHarvest: 120, yieldKgPerSqm: 3.5 });
    expect(r.ok && r.item.daysToHarvest).toBe(120);
    expect(r.ok && r.item.yieldKgPerSqm).toBe(3.5);
  });

  test('area kind follows the sector', () => {
    const kind = (s: Sector) => { const r = buildCustomItem({ name: 'Thing', sector: s, farmGatePerKg: 100 }); return r.ok ? r.item.areaKind : null; };
    expect(kind('crops')).toBe('bed');
    expect(kind('fruits')).toBe('orchard');
    expect(kind('fish')).toBe('pond');
    expect(kind('livestock')).toBe('house');
  });

  test('rejects bad input with a readable message', () => {
    const bad = (o: object) => buildCustomItem({ name: 'Okra2', sector: 'crops', farmGatePerKg: 50, ...o });
    expect(bad({ name: ' ' }).ok).toBe(false);
    expect(bad({ name: 'x'.repeat(41) }).ok).toBe(false);
    expect(bad({ farmGatePerKg: 0 }).ok).toBe(false);
    expect(bad({ farmGatePerKg: -5 }).ok).toBe(false);
    expect(bad({ farmGatePerKg: 99999 }).ok).toBe(false);
    expect(bad({ daysToHarvest: 2 }).ok).toBe(false);
    expect(bad({ yieldKgPerSqm: 0 }).ok).toBe(false);
    const r = bad({ farmGatePerKg: 0 });
    expect(!r.ok && r.error.length).toBeGreaterThan(5);
  });

  test('refuses a duplicate of a built-in item (any letter case) in the same sector', () => {
    expect(buildCustomItem({ name: 'PECHAY', sector: 'crops', farmGatePerKg: 40 }).ok).toBe(false);
  });

  test('ids stay unique when two names reduce to the same slug', () => {
    const a = buildCustomItem({ name: 'Star fruit', sector: 'crops', farmGatePerKg: 50 });
    if (!a.ok) throw new Error('a');
    setCustomItems([a.item]);
    const b = buildCustomItem({ name: 'Star-fruit', sector: 'crops', farmGatePerKg: 50 });
    expect(b.ok && b.item.id).toBe('custom-star-fruit-2');
  });
});

describe('custom items are visible everywhere the catalog is', () => {
  test('registry feeds catalogById, itemsFor, allItems and market prices', () => {
    const r = buildCustomItem({ name: 'Cassava', sector: 'crops', farmGatePerKg: 18 });
    if (!r.ok) throw new Error('build');
    expect(catalogById(r.item.id)).toBeUndefined();
    setCustomItems([r.item]);
    expect(catalogById(r.item.id)?.name).toBe('Cassava');
    expect(itemsFor('crops').some((i) => i.id === r.item.id)).toBe(true);
    expect(itemsFor('fish').some((i) => i.id === r.item.id)).toBe(false);
    expect(allItems().length).toBe(CATALOG.length + 1);
    const p = referenceSnapshot().prices.find((x) => x.itemId === r.item.id);
    expect(p && p.retailPerKg).toBeGreaterThan(p!.farmGatePerKg);
  });
});

describe('planner includes a custom favourite', () => {
  const cases: [string, Sector, Partial<PlanInput>][] = [
    ['crop, small farm', 'crops', { areaSqm: 200, capital: 40000 }],
    ['crop, backyard', 'crops', { areaSqm: 20, capital: 5000 }],
    ['crop, hectare', 'crops', { areaSqm: 10000, capital: 150000, experience: 'intermediate' }],
    ['fish, pond', 'fish', { areaSqm: 500, capital: 120000, experience: 'intermediate' }],
    ['livestock, house', 'livestock', { areaSqm: 100, capital: 90000 }],
    ['fruit, orchard', 'fruits', { areaSqm: 500, capital: 100000 }],
    ['fruit, in a mix with vegetables', 'fruits', { sector: 'crops', sectors: ['crops', 'fruits'], areaSqm: 300, capital: 80000 }],
  ];
  for (const [label, sector, o] of cases) {
    test(label, () => {
      const r = buildCustomItem({ name: 'My Special', sector, farmGatePerKg: 120 });
      if (!r.ok) throw new Error('build');
      setCustomItems([r.item]);
      const plan = generatePlan(mk({ sector, ...o, preferred: [r.item.id] }));
      expect(plan.allocations.every((a) => a.itemId === r.item.id || (o.sectors ?? [sector]).includes(catalogById(a.itemId)!.sector))).toBe(true);
      expect(plan.allocations.some((a) => a.itemId === r.item.id)).toBe(true);
      expect(plan.cost.initial).toBeGreaterThan(0);
      expect(Number.isFinite(plan.cost.initial)).toBe(true);
      expect(plan.cost.initial).toBeLessThanOrEqual((o.capital ?? 40000) * 1.001);
    });
  }

  test('without picking it, a custom item is just another candidate (plan still valid)', () => {
    const r = buildCustomItem({ name: 'Nothing special', sector: 'crops', farmGatePerKg: 55 });
    if (!r.ok) throw new Error('build');
    setCustomItems([r.item]);
    const plan = generatePlan(mk());
    expect(plan.allocations.length).toBeGreaterThan(0);
  });
});
