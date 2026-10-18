import { describe, expect, test } from 'bun:test';
import { generatePlan } from '@/services/planner';
import { DEFAULT_PLACE } from '@/data/places';
import { MATERIALS, materialById, unitPrice, midPrice } from '@/data/materials';
import { RECYCLABLES, recyclableById } from '@/data/recyclables';
import {
  applyH, cameraOnPlot, defaultQuad, invertH, isValidQuad, liftPx, plotToPhoto, pxPerMetre, solveHomography, type Quad,
} from '@/services/build/geometry';
import {
  bdFt, frameBed, generateDesigns, mediaFor, packCuts, priceDesign, splitRun, STOCK_M, type BuildDesign, type DesignInput, type Structure,
} from '@/services/build/designs';
import type { PlanInput } from '@/types';

const site: PlanInput['site'] = { slope: 'gentle', waterSource: 'municipal', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false };
const mk = (o: Partial<PlanInput> = {}): PlanInput => ({
  name: '', sector: 'crops', areaSqm: 45, capital: 20000, location: DEFAULT_PLACE, experience: 'beginner', goal: 'family', site, photoCount: 0,
  preferred: ['pechay', 'kangkong', 'sitaw', 'patola'], ...o,
});
const input = (o: Partial<PlanInput> = {}, extra: Partial<DesignInput> = {}): DesignInput => {
  const r = generatePlan(mk(o));
  return { layout: r.layout, allocations: r.allocations, surface: 'hard', sunlight: 'full', ...extra };
};

describe('geometry', () => {
  const quad: Quad = [{ x: 0.3, y: 0.45 }, { x: 0.75, y: 0.45 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.9 }];

  test('homography maps the plot corners exactly onto the photo corners', () => {
    const H = plotToPhoto(quad, 5, 3.5, 1000, 800)!;
    expect(H).not.toBeNull();
    const corners = [[0, 0], [5, 0], [5, 3.5], [0, 3.5]];
    corners.forEach(([x, y], i) => {
      const p = applyH(H, { x, y });
      expect(p.x).toBeCloseTo(quad[i].x * 1000, 4);
      expect(p.y).toBeCloseTo(quad[i].y * 800, 4);
    });
  });

  test('inverse round-trips a point', () => {
    const H = plotToPhoto(quad, 5, 3.5, 1000, 800)!;
    const inv = invertH(H)!;
    const p = applyH(inv, applyH(H, { x: 2.2, y: 1.7 }));
    expect(p.x).toBeCloseTo(2.2, 6);
    expect(p.y).toBeCloseTo(1.7, 6);
  });

  test('perspective: a metre looks bigger near the camera than far away, and lift follows it', () => {
    const H = plotToPhoto(quad, 5, 3.5, 1000, 800)!;
    expect(pxPerMetre(H, 2.5, 3.4)).toBeGreaterThan(pxPerMetre(H, 2.5, 0.1));
    expect(liftPx(H, 2.5, 3, 0.3)).toBeGreaterThan(liftPx(H, 2.5, 0.5, 0.3));
    expect(liftPx(H, 2.5, 3, 0.6)).toBeCloseTo(2 * liftPx(H, 2.5, 3, 0.3), 6);
  });

  test('camera sits on the near side of the plot', () => {
    const H = plotToPhoto(quad, 5, 3.5, 1000, 800)!;
    const c = cameraOnPlot(H, 1000, 800)!;
    expect(c.y).toBeGreaterThan(3.5);
  });

  test('isValidQuad accepts the default and rejects bad shapes', () => {
    expect(isValidQuad(defaultQuad())).toBe(true);
    expect(isValidQuad(null)).toBe(false);
    const swapped: Quad = [quad[1], quad[0], quad[2], quad[3]]; // far edge left/right swapped
    expect(isValidQuad(swapped)).toBe(false);
    const bowtie: Quad = [quad[0], quad[1], quad[3], quad[2]]; // self-intersecting
    expect(isValidQuad(bowtie)).toBe(false);
    const tiny: Quad = [{ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.5 }, { x: 0.52, y: 0.52 }, { x: 0.5, y: 0.52 }];
    expect(isValidQuad(tiny)).toBe(false);
    const off: Quad = [{ x: -1, y: 0.4 }, { x: 0.8, y: 0.4 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(isValidQuad(off)).toBe(false);
    const nan: Quad = [{ x: NaN, y: 0.4 }, quad[1], quad[2], quad[3]];
    expect(isValidQuad(nan)).toBe(false);
  });

  test('plotToPhoto refuses invalid corners or sizes', () => {
    expect(plotToPhoto(quad, 0, 3, 100, 100)).toBeNull();
    expect(plotToPhoto([quad[1], quad[0], quad[2], quad[3]] as Quad, 5, 3, 100, 100)).toBeNull();
  });

  test('solveHomography returns null for degenerate input', () => {
    const p = { x: 1, y: 1 };
    expect(solveHomography([p, p, p, p], [p, p, p, p])).toBeNull();
  });
});

describe('cutting and lumber maths', () => {
  test('board feet: a 1x6x8ft board is 4 bd.ft', () => {
    expect(bdFt(1, 6, STOCK_M)).toBeCloseTo(4, 1);
    expect(bdFt(2, 2, STOCK_M)).toBeCloseTo(2.67, 1);
  });

  test('packCuts never overfills a stock piece and wastes little', () => {
    const cuts = [1.0, 1.0, 1.2, 1.2, 0.9, 0.9, 0.9, 2.4];
    const plan = packCuts(cuts);
    for (const bin of plan.bins) expect(bin.reduce((s, c) => s + c, 0)).toBeLessThanOrEqual(STOCK_M);
    expect(plan.bins.flat().length).toBe(cuts.length);
    expect(plan.pieces).toBeLessThanOrEqual(5);
    expect(plan.wasteM).toBeGreaterThanOrEqual(0);
  });

  test('packCuts rejects a cut longer than the stock; splitRun fixes it', () => {
    expect(() => packCuts([3])).toThrow();
    const parts = splitRun(4.8);
    expect(parts.length).toBe(2);
    expect(parts[0] + parts[1]).toBeCloseTo(4.8, 6);
    expect(() => packCuts(parts)).not.toThrow();
    expect(splitRun(1.2)).toEqual([1.2]);
  });

  test('frameBed: a 1.0 x 2.4 m bed has 8 boards and 6 posts; posts are shorter on hard floor', () => {
    const f = frameBed(1, 2.4, 'hard');
    expect(f.boards.length).toBe(8);
    expect(f.posts.length).toBe(6);
    expect(f.posts[0]).toBeCloseTo(0.28, 6);
    expect(frameBed(1, 2.4, 'soil').posts[0]).toBeCloseTo(0.4, 6);
    expect(frameBed(1, 4.8, 'soil').boards.length).toBe(4 * 2 + 4); // long sides split into 2 each
  });

  test('media mix volumes add back up to the litres needed (with the settling allowance)', () => {
    const m = mediaFor(1000);
    expect(m.litres).toBeCloseTo(1100, 0);
    expect(m.topsoilM3 * 1000 / 0.5).toBeCloseTo(m.litres, 0);
  });
});

describe('prices catalog', () => {
  test('every material has a sane range, and sourced items cite a source', () => {
    for (const m of MATERIALS) {
      expect(m.min).toBeGreaterThan(0);
      expect(m.max).toBeGreaterThanOrEqual(m.min);
      if (m.basis === 'sourced') {
        expect(m.sources?.length).toBeGreaterThan(0);
        for (const s of m.sources!) expect(s.url.startsWith('https://')).toBe(true);
      } else {
        expect(m.sources).toBeUndefined();
        expect(m.note).toBeTruthy();
      }
    }
  });

  test('unitPrice uses the middle of the range, or the user override', () => {
    const m = materialById('lumber_coco')!;
    expect(unitPrice(m)).toBe(midPrice(m));
    expect(unitPrice(m, { lumber_coco: 50 })).toBe(50);
    expect(unitPrice(m, { lumber_coco: -3 })).toBe(midPrice(m));
    expect(unitPrice(m, { lumber_coco: NaN })).toBe(midPrice(m));
  });

  test('recyclables only point at real materials, with coverage between 0 and 1', () => {
    for (const r of RECYCLABLES) {
      expect(r.techniques.length).toBeGreaterThan(0);
      for (const c of r.covers) {
        expect(materialById(c.materialId)).toBeDefined();
        expect(c.coverage).toBeGreaterThan(0);
        expect(c.coverage).toBeLessThanOrEqual(1);
      }
    }
  });
});

const inBounds = (s: Structure, W: number, L: number) => {
  const eps = 0.011;
  if (s.type === 'bed' || s.type === 'rack') {
    const w = s.w, l = s.type === 'bed' ? s.l : s.d;
    return s.x >= -eps && s.y >= -eps && s.x + w <= W + eps && s.y + l <= L + eps;
  }
  if (s.type === 'bag') return s.cx - s.r >= -eps && s.cy - s.r >= -eps && s.cx + s.r <= W + eps && s.cy + s.r <= L + eps;
  return [s.x1, s.x2].every((x) => x >= -eps && x <= W + eps) && [s.y1, s.y2].every((y) => y >= -eps && y <= L + eps);
};

describe('generateDesigns', () => {
  test('gives three buildable concepts for a small crop garden', () => {
    const inp = input();
    const ds = generateDesigns(inp);
    expect(ds.map((d) => d.id)).toEqual(['raised', 'containers', 'vertical']);
    for (const d of ds) {
      expect(d.steps.length).toBeGreaterThan(4);
      expect(d.bom.length).toBeGreaterThan(5);
      expect(d.pros.length).toBeGreaterThan(0);
      expect(d.plants.length).toBeGreaterThan(0);
      for (const b of d.bom) {
        expect(b.qty).toBeGreaterThan(0);
        expect(materialById(b.materialId)).toBeDefined();
        expect(b.unit).toBe(materialById(b.materialId)!.unit);
      }
      for (const s of d.structures) expect(inBounds(s, inp.layout.widthM, inp.layout.lengthM)).toBe(true);
    }
  });

  test('raised-bed lumber matches the cut plan and the bed footprints match the layout', () => {
    const inp = input();
    const d = generateDesigns(inp)[0];
    const beds = inp.layout.rects.filter((r) => r.kind === 'bed');
    expect(d.structures.filter((s) => s.type === 'bed').length).toBe(beds.length);
    const boards = d.bom.find((b) => b.id === 'boards')!;
    const pieces = Number(/buy (\d+) pcs/.exec(boards.label)![1]);
    expect(boards.qty).toBeCloseTo(pieces * 4, 1);
    const cutMetres = d.cutList.filter((c) => c.part === 'Frame board').reduce((s, c) => s + c.qty * c.lengthM, 0);
    expect(pieces * STOCK_M).toBeGreaterThanOrEqual(cutMetres);
  });

  test('containers: bag count in the BOM equals the bags drawn', () => {
    const d = generateDesigns(input())[1];
    expect(d.structures.filter((s) => s.type === 'bag').length).toBe(d.bom.find((b) => b.id === 'bags')!.qty);
  });

  test('hard floors add a liner; soil does not', () => {
    const hard = generateDesigns(input({}, { surface: 'hard' }))[0];
    const soil = generateDesigns(input({}, { surface: 'soil' }))[0];
    expect(hard.bom.some((b) => b.id === 'liner')).toBe(true);
    expect(soil.bom.some((b) => b.id === 'liner')).toBe(false);
  });

  test('climbing crops get a trellis; a leafy-only plan does not', () => {
    const withClimbers = generateDesigns(input({ preferred: ['sitaw', 'patola'] }))[0];
    expect(withClimbers.bom.some((b) => b.id === 'tnet')).toBe(true);
    const leafy = generateDesigns(input({ preferred: ['pechay', 'kangkong', 'lettuce'], areaSqm: 20 }))[0];
    if (!leafy.plants.some((p) => ['sitaw', 'patola', 'ampalaya'].includes(p.itemId))) expect(leafy.bom.some((b) => b.id === 'tnet')).toBe(false);
  });

  test('works from a tiny garden to the largest bed-mode plot; other sectors give no designs', () => {
    for (const a of [12, 25, 45, 120, 300, 600]) {
      const inp = input({ areaSqm: a, capital: Math.max(8000, a * 600) });
      const ds = generateDesigns(inp);
      expect(ds.length).toBe(3);
      for (const d of ds) for (const s of d.structures) expect(inBounds(s, inp.layout.widthM, inp.layout.lengthM)).toBe(true);
    }
    const fish = generatePlan(mk({ sector: 'fish', areaSqm: 500, capital: 150000 }));
    expect(generateDesigns({ layout: fish.layout, allocations: fish.allocations, surface: 'soil', sunlight: 'full' })).toEqual([]);
  });

  test('the same input always gives the same design (deterministic)', () => {
    const a = JSON.stringify(generateDesigns(input()));
    const b = JSON.stringify(generateDesigns(input()));
    expect(a).toBe(b);
  });
});

describe('priceDesign', () => {
  const design = (): BuildDesign => generateDesigns(input())[0];

  test('totals equal the sum of the lines', () => {
    const p = priceDesign(design());
    expect(p.total).toBeCloseTo(p.lines.reduce((s, l) => s + l.cost, 0), 1);
    expect(p.totalNew).toBeCloseTo(p.lines.reduce((s, l) => s + l.fullCost, 0), 1);
    expect(p.saved).toBeCloseTo(p.totalNew - p.total, 1);
    expect(p.min).toBeLessThanOrEqual(p.total + 1);
    expect(p.max).toBeGreaterThanOrEqual(p.total - 1);
    expect(p.estimateShare).toBeGreaterThanOrEqual(0);
    expect(p.estimateShare).toBeLessThanOrEqual(100);
  });

  test('with no recyclables you buy everything', () => {
    const p = priceDesign(design());
    expect(p.saved).toBe(0);
    for (const l of p.lines) expect(l.cost).toBeCloseTo(l.fullCost, 0);
  });

  test('pallets cut the lumber bill by their coverage, and only the lumber', () => {
    const base = priceDesign(design());
    const withPallets = priceDesign(design(), { recyclables: ['pallets'] });
    const cov = recyclableById('pallets')!.covers.find((c) => c.materialId === 'lumber_coco')!.coverage;
    const b0 = base.lines.find((l) => l.id === 'boards')!;
    const b1 = withPallets.lines.find((l) => l.id === 'boards')!;
    expect(b1.buyQty).toBeCloseTo(b0.qty * (1 - cov), 1);
    expect(b1.reuse?.recyclableId).toBe('pallets');
    expect(withPallets.lines.find((l) => l.id === 'topsoil')!.cost).toBe(base.lines.find((l) => l.id === 'topsoil')!.cost);
    expect(withPallets.total).toBeLessThan(base.total);
  });

  test('two recyclables covering the same item are not double counted', () => {
    const d = generateDesigns(input())[1];
    const one = priceDesign(d, { recyclables: ['buckets'] });
    const two = priceDesign(d, { recyclables: ['buckets', 'rice_sacks', 'styro_boxes'] });
    expect(two.lines.find((l) => l.id === 'bags')!.buyQty).toBe(0);
    expect(one.lines.find((l) => l.id === 'bags')!.buyQty).toBe(0);
    expect(two.saved).toBeGreaterThanOrEqual(one.saved);
    expect(two.total).toBeGreaterThanOrEqual(0);
  });

  test('items already on site cost nothing; discrete units round up', () => {
    const d = design();
    const p = priceDesign(d, { onSite: ['shade_net'] });
    const shade = p.lines.find((l) => l.id === 'shade');
    if (shade) { expect(shade.cost).toBe(0); expect(shade.reuse?.kind).toBe('onsite'); }
    const partial = priceDesign(generateDesigns(input())[1], { recyclables: ['pet_bottles'] });
    const bags = partial.lines.find((l) => l.id === 'bags')!;
    expect(Number.isInteger(bags.buyQty)).toBe(true);
    expect(bags.buyQty).toBeLessThan(bags.qty);
  });

  test('"my price" overrides change the cost and mark the line', () => {
    const base = priceDesign(design());
    const over = priceDesign(design(), { overrides: { lumber_coco: 100 } });
    const l = over.lines.find((x) => x.id === 'boards')!;
    expect(l.overridden).toBe(true);
    expect(l.unitPrice).toBe(100);
    expect(over.total).toBeGreaterThan(base.total);
  });
});
