import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { forecastQuantities } from '@/services/forecast';
import { applyOverrides, referenceSnapshot } from '@/services/market';
import { DEFAULT_PLACE } from '@/data/places';
import { catalogById } from '@/data/catalog';
import type { PlanInput } from '@/types';

const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'well', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const mk = (o: Partial<PlanInput> = {}): PlanInput => ({
  name: '', sector: 'crops', areaSqm: 200, capital: 40000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family_sell', site, photoCount: 0, ...o,
});
const prices = referenceSnapshot().prices;

describe('forecastQuantities', () => {
  test('quantity = allocated area x yield, valued at both prices', () => {
    const plan = generatePlan(mk());
    const f = forecastQuantities(plan, prices, 'family_sell');
    expect(f.rows.length).toBe(plan.allocations.length);
    for (const [i, row] of f.rows.entries()) {
      const item = catalogById(plan.allocations[i].itemId)!;
      expect(row.kgExpected).toBeCloseTo(plan.allocations[i].areaSqm * item.yieldKgPerSqm, 6);
      expect(row.valueFarmGate).toBeCloseTo(row.kgExpected * row.farmGatePerKg, 6);
      expect(row.valueMarket).toBeCloseTo(row.kgExpected * row.marketPerKg, 6);
      expect(row.kgMin).toBeLessThan(row.kgExpected);
      expect(row.kgMax).toBeGreaterThan(row.kgExpected);
    }
  });

  test('totals add up and market value is at least farm-gate value', () => {
    const f = forecastQuantities(generatePlan(mk({ sector: 'fish', areaSqm: 500, capital: 120000, experience: 'intermediate' })), prices, 'commercial');
    expect(f.total.kgExpected).toBeCloseTo(f.rows.reduce((s, r) => s + r.kgExpected, 0), 6);
    expect(f.total.valueMarket).toBeGreaterThanOrEqual(f.total.valueFarmGate);
    expect(f.total.extraIfSoldAtMarket).toBeCloseTo(f.total.valueMarket - f.total.valueFarmGate, 6);
  });

  test('farmer share is a sensible percentage', () => {
    const f = forecastQuantities(generatePlan(mk()), prices, 'family');
    for (const r of f.rows) { expect(r.farmerSharePct).toBeGreaterThan(0); expect(r.farmerSharePct).toBeLessThanOrEqual(100); }
  });

  test('"my price" overrides flow through to the forecast', () => {
    const plan = generatePlan(mk());
    const id = plan.allocations[0].itemId;
    const base = forecastQuantities(plan, prices, 'family_sell').rows[0];
    const snap = applyOverrides(referenceSnapshot(), { [id]: { farmGatePerKg: base.farmGatePerKg * 2, retailPerKg: base.marketPerKg * 2 } });
    const over = forecastQuantities(plan, snap.prices, 'family_sell').rows[0];
    expect(over.valueFarmGate).toBeCloseTo(base.valueFarmGate * 2, 6);
    expect(over.valueMarket).toBeCloseTo(base.valueMarket * 2, 6);
    expect(over.kgExpected).toBeCloseTo(base.kgExpected, 6);
  });

  test('falls back to catalog price when the snapshot lacks the item; empty plan gives empty forecast', () => {
    const plan = generatePlan(mk());
    const f = forecastQuantities(plan, [], 'family');
    expect(f.rows[0].farmGatePerKg).toBe(catalogById(plan.allocations[0].itemId)!.farmGatePerKg);
    expect(f.rows[0].marketPerKg).toBeGreaterThan(f.rows[0].farmGatePerKg);
    expect(forecastQuantities({ allocations: [] }, prices, 'family').total.kgExpected).toBe(0);
  });

  test('more capital never lowers the expected quantity', () => {
    const q = (capital: number) => forecastQuantities(generatePlan(mk({ areaSqm: 2000, capital, experience: 'intermediate' })), prices, 'family_sell').total.kgExpected;
    const [a, b, c] = [q(20000), q(60000), q(200000)];
    expect(b).toBeGreaterThanOrEqual(a - 1e-6);
    expect(c).toBeGreaterThanOrEqual(b - 1e-6);
  });
});
