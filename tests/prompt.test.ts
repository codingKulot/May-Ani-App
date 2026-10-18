import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { DEFAULT_PLACE } from '@/data/places';
import { catalogById } from '@/data/catalog';
import { generateDesigns } from '@/services/build/designs';
import { buildImagePrompt, MAX_PROMPT } from '@/services/build/prompt';
import type { PlanInput } from '@/types';

const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'municipal', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const plan = generatePlan({ name: '', sector: 'crops', areaSqm: 45, capital: 20000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family', site, photoCount: 0, preferred: ['pechay', 'kangkong', 'sitaw', 'patola'] });
const designs = generateDesigns({ layout: plan.layout, allocations: plan.allocations, surface: 'hard', sunlight: 'full' });
const nameOf = (id: string) => catalogById(id)?.name ?? id;
const make = (i: number, extra = {}) => buildImagePrompt({ design: designs[i], surface: 'hard', nameOf, reuse: [], onSite: [], ...extra });

describe('buildImagePrompt', () => {
  test('uses the design real numbers', () => {
    const bed = designs[0].structures.find((s) => s.type === 'bed');
    if (bed?.type !== 'bed') throw new Error('no bed');
    const p = make(0);
    expect(p).toContain(`${Math.round(bed.w * 100) / 100} m wide`);
    expect(p).toContain('raised garden bed');
    expect(p).toContain('concrete or tiles');
  });
  test('describes bags for the container design and a rack for the vertical one', () => {
    expect(make(1)).toContain('grow bag');
    expect(make(2)).toContain('vertical rack');
  });
  test('mentions reused materials and existing items only when chosen', () => {
    expect(make(0)).not.toContain('reused materials');
    const p = make(0, { reuse: ['wood pallets'], onSite: ['gravel'] });
    expect(p).toContain('wood pallets');
    expect(p).toContain('Keep these existing items in place: gravel');
  });
  test('forbids people and text, stays within the limit, is deterministic', () => {
    for (let i = 0; i < 3; i++) {
      const p = make(i, { reuse: Array(30).fill('wood pallets') });
      expect(p.length).toBeLessThanOrEqual(MAX_PROMPT);
      expect(p).toContain('Do not add people');
      expect(p).toBe(make(i, { reuse: Array(30).fill('wood pallets') }));
    }
  });
});
