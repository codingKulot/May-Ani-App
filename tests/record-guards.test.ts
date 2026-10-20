import { describe, expect, test } from 'bun:test';
import { DEFAULT_PLACE } from '@/data/places';
import { generatePlan } from '@/services/planner';
import { planNameProblem } from '@/services/planner/name';
import { cleanBackup, validRecord } from '@/services/sync/records';
import type { PlanInput, SavedPlan } from '@/types';

/**
 * Plans from the account or a backup file are checked down to the entries of their lists (review of 20 October 2026).
 * Before, a plan without a name passed the check and then crashed the Planner on every phone of the account.
 */

const input: PlanInput = {
  name: 'Backyard garden', sector: 'crops', areaSqm: 20, capital: 5000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family_sell',
  site: { slope: 'flat', sunlight: 'full', waterSource: 'municipal', power: 'grid', floodProne: false, brackishWater: false, cool: false },
  preferred: [], photoCount: 0,
} as PlanInput;
const good = (): SavedPlan => ({ id: 'p1', createdAt: '2026-10-20T00:00:00.000Z', input: structuredClone(input), result: generatePlan(input) });
const asRecord = (d: unknown) => ({ c: 'plans', id: 'p1', t: 1, d });

describe('plan checks', () => {
  test('a plan the app made passes, also a mixed one', () => {
    expect(validRecord(asRecord(good()))).toBe(true);
    const mixedInput = { ...input, sectors: ['crops', 'fruits', 'fish'] } as PlanInput;
    expect(validRecord(asRecord({ ...good(), input: mixedInput, result: generatePlan(mixedInput) }))).toBe(true);
  });

  const broken: [string, (p: any) => void][] = [
    ['no name', (p) => { delete p.input.name; }],
    ['a name that is a number', (p) => { p.input.name = 7; }],
    ['an empty entry in allocations', (p) => { p.result.allocations = [null]; }],
    ['an allocation without an area', (p) => { delete p.result.allocations[0].areaSqm; }],
    ['a cost line that is text', (p) => { p.result.cost.breakdown = ['₱100']; }],
    ['payback as text', (p) => { p.result.cost.paybackMonths = 'soon'; }],
    ['a drawing block without a size', (p) => { delete p.result.layout.rects[0].w; }],
    ['a schedule step without a title', (p) => { delete p.result.schedule[0].title; }],
    ['a warning that is an object', (p) => { p.result.warnings = [{}]; }],
    ['picks that are not text', (p) => { p.input.preferred = [1]; }],
  ];
  for (const [label, damage] of broken) {
    test(`refused: ${label}`, () => {
      const p = good();
      damage(p);
      expect(validRecord(asRecord(p))).toBe(false);
      const { patch, skipped } = cleanBackup({ farms: [], plans: [p, good()].map((x, i) => ({ ...x, id: `p${i}` })) });
      expect(patch.plans?.length).toBe(1);
      expect(skipped).toBe(1);
    });
  }
});

describe('a plan without a name already on the phone', () => {
  test('does not stop the name check (the Planner keeps working)', () => {
    const p = good();
    delete (p.input as any).name;
    expect(() => planNameProblem('Tilapia pond', [p])).not.toThrow();
    expect(planNameProblem('Tilapia pond', [p])).toBeNull();
    expect(planNameProblem(p.result.title, [p])?.existing?.id).toBe('p1'); // still matched by its title
  });

  test('a plan made without a name gets a made-up title', () => {
    expect(generatePlan({ ...input, name: undefined } as any).title).toBe('Backyard Vegetable Garden');
  });
});
