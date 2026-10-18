import { catalogById } from '@/data/catalog';
import { priceGap } from '@/services/market';
import type { Goal, MarketPrice, PlanResult } from '@/types';

/**
 * Quantity forecast for a plan: how many kilos each item should produce per cycle, and what that is worth
 * at the farm-gate price (what a trader pays you at the farm) versus the market price (what buyers pay at retail).
 * Prices come from the same snapshot as the Market screen, so manual "my price" entries and feeds apply here too.
 * Ranges use the same assumptions as the plan's income estimate: 70% of typical yield at worst, 105-120% at best.
 */

export interface ForecastRow {
  itemId: string;
  name: string;
  emoji: string;
  areaSqm: number;
  /** kg per full cycle */
  kgMin: number;
  kgExpected: number;
  kgMax: number;
  cycleDays: number;
  daysToFirstHarvest: number;
  farmGatePerKg: number;
  marketPerKg: number;
  valueFarmGate: number;
  valueMarket: number;
  farmerSharePct: number;
}

export interface Forecast {
  rows: ForecastRow[];
  total: { kgExpected: number; kgMin: number; kgMax: number; valueFarmGate: number; valueMarket: number; extraIfSoldAtMarket: number };
}

export const BEST_CASE_MULT = (goal: Goal) => (goal === 'commercial' ? 1.05 : 1.2);
export const WORST_CASE_MULT = 0.7;

export function forecastQuantities(result: Pick<PlanResult, 'allocations'>, prices: MarketPrice[], goal: Goal): Forecast {
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const rows: ForecastRow[] = [];
  for (const a of result.allocations) {
    const item = catalogById(a.itemId);
    if (!item) continue;
    const price = byId.get(item.id);
    const farmGate = price?.farmGatePerKg ?? item.farmGatePerKg;
    const market = price?.retailPerKg ?? Math.round(farmGate * 1.6);
    const kg = a.areaSqm * item.yieldKgPerSqm;
    rows.push({
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      areaSqm: a.areaSqm,
      kgMin: kg * WORST_CASE_MULT,
      kgExpected: kg,
      kgMax: kg * BEST_CASE_MULT(goal),
      cycleDays: item.cycleDays,
      daysToFirstHarvest: item.daysToHarvest,
      farmGatePerKg: farmGate,
      marketPerKg: market,
      valueFarmGate: kg * farmGate,
      valueMarket: kg * market,
      farmerSharePct: priceGap({ retailPerKg: market, farmGatePerKg: farmGate }).farmerSharePct,
    });
  }
  const sum = (f: (r: ForecastRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const valueFarmGate = sum((r) => r.valueFarmGate);
  const valueMarket = sum((r) => r.valueMarket);
  return {
    rows,
    total: {
      kgExpected: sum((r) => r.kgExpected),
      kgMin: sum((r) => r.kgMin),
      kgMax: sum((r) => r.kgMax),
      valueFarmGate,
      valueMarket,
      extraIfSoldAtMarket: Math.max(0, valueMarket - valueFarmGate),
    },
  };
}
