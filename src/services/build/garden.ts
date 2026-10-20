import { planSectors } from '@/data/catalog';
import { BED_MODE_MAX_SQM } from '@/services/planner/layout';
import type { Allocation, LayoutSpec, PlanInput, PlanResult } from '@/types';

const MARGIN = 0.4;
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface GardenPart {
  layout: LayoutSpec;
  allocations: Allocation[];
  /** true when this is the vegetable part of a mixed plan */
  part: boolean;
  /** land of the vegetable part (sqm) */
  areaSqm: number;
}

/**
 * What the build ideas (Layout > "3 ideas for your site") work on: the vegetable garden.
 * A vegetable plan: its whole layout, as before. A mixed plan: only its raised beds, moved onto a plot of their own
 * (the vegetable strip plus the usual margin), when that part is small enough for raised beds (600 sqm or less).
 * Fruit orchards, ponds and animal houses are not part of it. Plans without vegetables: null.
 */
export function gardenPart(input: PlanInput, result: PlanResult): GardenPart | null {
  const sectors = planSectors(input);
  if (!sectors.includes('crops')) return null;
  if (sectors.length === 1) return { layout: result.layout, allocations: result.allocations, part: false, areaSqm: input.areaSqm };
  const land = input.areaSqm / sectors.length;
  const zone = result.layout.zones?.find((z) => z.sector === 'crops');
  const beds = result.layout.rects.filter((r) => r.kind === 'bed'); // fruits are 'orchard', so these are the vegetables
  if (land > BED_MODE_MAX_SQM || !zone || !beds.length) return null;
  const crops = new Set(beds.map((b) => b.itemId));
  return {
    layout: {
      widthM: r1(zone.w + 2 * MARGIN),
      lengthM: r1(zone.h + 2 * MARGIN),
      rects: beds.map((b) => ({ ...b, x: r1(b.x - zone.x + MARGIN), y: r1(b.y - zone.y + MARGIN) })),
      lowSide: result.layout.lowSide,
      legend: result.layout.legend.filter((l) => crops.has(l.itemId)),
    },
    allocations: result.allocations.filter((a) => crops.has(a.itemId)),
    part: true,
    areaSqm: Math.round(land),
  };
}
