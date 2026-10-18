import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { DEFAULT_PLACE } from '@/data/places';
import { generateDesigns } from '@/services/build/designs';
import { plotToPhoto, type Quad } from '@/services/build/geometry';
import { renderScene, type Prim } from '@/services/build/render';
import type { PlanInput } from '@/types';

const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'municipal', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const plan = generatePlan({ name: '', sector: 'crops', areaSqm: 45, capital: 20000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family', site, photoCount: 0, preferred: ['pechay', 'kangkong', 'sitaw', 'patola'] });
const designs = generateDesigns({ layout: plan.layout, allocations: plan.allocations, surface: 'hard', sunlight: 'full' });
const quad: Quad = [{ x: 0.3, y: 0.45 }, { x: 0.78, y: 0.45 }, { x: 0.97, y: 0.92 }, { x: 0.04, y: 0.92 }];
const W = 1152, Hh = 1536;
const H = plotToPhoto(quad, plan.layout.widthM, plan.layout.lengthM, W, Hh)!;
const pts = (p: Prim) => (p.k === 'poly' ? p.pts : p.k === 'line' ? [p.a, p.b] : [p.c]);

describe('placement guide', () => {
  test('draws every design with finite coordinates', () => {
    for (const d of designs) {
      const s = renderScene(d, H, W, Hh, () => 0);
      expect(s.prims.length).toBeGreaterThan(0);
      for (const p of s.prims) for (const q of pts(p)) { expect(Number.isFinite(q.x)).toBe(true); expect(Number.isFinite(q.y)).toBe(true); }
    }
  });

  test('stays inside the marked floor area (no fake heights above it)', () => {
    for (const d of designs) {
      const s = renderScene(d, H, W, Hh, () => 0);
      const all = s.prims.flatMap(pts);
      expect(Math.min(...all.map((q) => q.y))).toBeGreaterThanOrEqual(quad[0].y * Hh - 4);
      expect(Math.max(...all.map((q) => q.y))).toBeLessThanOrEqual(quad[2].y * Hh + 4);
    }
  });

  test('flat footprints only: no fake plants, walls or shadows', () => {
    const s = renderScene(designs[0], H, W, Hh, () => 0);
    expect(s.prims.every((p) => p.k !== 'ellipse')).toBe(true);
    expect(s.prims.filter((p) => p.k === 'poly').every((p) => p.opacity <= 0.5)).toBe(true);
  });

  test('one numbered marker per crop bed, numbered from 1 with no gaps', () => {
    const s = renderScene(designs[0], H, W, Hh, () => 0, (i) => i ?? '');
    const beds = plan.layout.rects.filter((r) => r.kind === 'bed').length;
    expect(s.markers.length).toBe(beds);
    expect(s.markers.map((m) => m.n)).toEqual(Array.from({ length: beds }, (_, i) => i + 1));
  });

  test('is deterministic', () => {
    expect(JSON.stringify(renderScene(designs[1], H, W, Hh, () => 0))).toBe(JSON.stringify(renderScene(designs[1], H, W, Hh, () => 0)));
  });
});
