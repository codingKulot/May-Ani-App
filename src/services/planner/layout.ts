import type { CatalogItem, LayoutRect, LayoutSpec, Sector } from '@/types';
import { clamp } from '@/lib/format';

/**
 * Geometry for the generated site plan. Units are metres, origin top-left, north is up.
 * The LOW side (where water leaves / drainage canal runs) is always the south edge; users rotate
 * the plan to match their real slope. All areas used for costing come from the rectangles drawn
 * here, so what is priced is exactly what is shown.
 */

export interface AllocTarget { item: CatalogItem; areaSqm: number }
export interface LayoutFlags { tank: boolean; pump: boolean; power: boolean }

const MARGIN = 0.4;
const CANAL_H = 0.5;
const BED_W = 1.0;
const PATH_W = 0.4;
const CROSS_PATH = 0.6;
const BED_MODE_MAX_SQM = 600;

const r1 = (n: number) => Math.round(n * 10) / 10;
export const rectArea = (r: { w: number; h: number }) => r.w * r.h;

export function plotDims(sector: Sector, areaSqm: number): { widthM: number; lengthM: number } {
  if (sector === 'crops' && areaSqm <= BED_MODE_MAX_SQM) {
    const cols = clamp(Math.round(Math.sqrt(areaSqm) / (BED_W + PATH_W)), 1, 60);
    // exact width for `cols` beds: two margins + beds + paths between them
    const w = r1(2 * MARGIN + cols * BED_W + (cols - 1) * PATH_W);
    return { widthM: w, lengthM: r1(areaSqm / w) };
  }
  const length = Math.sqrt(areaSqm * 1.33);
  return { widthM: r1(areaSqm / length), lengthM: r1(length) };
}

function utilityHeight(areaSqm: number): number {
  if (areaSqm < 60) return 0; // tiny plots: tank/pump sit outside the planted area
  return areaSqm < 150 ? 1.3 : 1.8;
}

interface Region { x0: number; y0: number; x1: number; y1: number }

function workRegion(widthM: number, lengthM: number, areaSqm: number): Region {
  const x0 = MARGIN;
  const x1 = Math.max(x0 + 0.5, widthM - MARGIN);
  const y0 = MARGIN + utilityHeight(areaSqm);
  const y1 = Math.max(y0 + 0.5, lengthM - CANAL_H - 0.3);
  return { x0, y0, x1, y1 };
}

export interface CropGrid { cols: number; rows: number; bedLen: number; bedW: number; slots: { x: number; y: number }[]; capacitySqm: number }

/** Bed grid for small crop plots (raised beds with paths). */
export function cropGrid(areaSqm: number): CropGrid {
  const { widthM, lengthM } = plotDims('crops', areaSqm);
  const reg = workRegion(widthM, lengthM, areaSqm);
  const availW = reg.x1 - reg.x0;
  const availH = reg.y1 - reg.y0;
  const bedW = Math.min(BED_W, availW);
  const cols = Math.max(1, Math.floor((availW + PATH_W) / (bedW + PATH_W) + 1e-6));
  // spread the length evenly over the fewest rows that keep beds <= 6 m, so no strip is left empty
  const rows = Math.max(1, Math.ceil((availH + CROSS_PATH) / (6 + CROSS_PATH) - 1e-6));
  const bedLen = Math.floor(clamp((availH + CROSS_PATH) / rows - CROSS_PATH, 0.5, 6) * 10) / 10;
  const slots: { x: number; y: number }[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      slots.push({ x: r1(reg.x0 + c * (bedW + PATH_W)), y: r1(reg.y0 + r * (bedLen + CROSS_PATH)) });
    }
  }
  return { cols, rows, bedLen, bedW, slots, capacitySqm: slots.length * bedW * bedLen };
}

/** How many sqm of production area a plot of this size can host. */
export function productionCapacity(sector: Sector, areaSqm: number, outdoorRun: boolean): number {
  if (sector === 'crops') {
    if (areaSqm <= BED_MODE_MAX_SQM) return cropGrid(areaSqm).capacitySqm;
    return areaSqm * (areaSqm <= 2000 ? 0.72 : 0.85);
  }
  const { widthM, lengthM } = plotDims(sector, areaSqm);
  const reg = workRegion(widthM, lengthM, areaSqm);
  const regionArea = (reg.x1 - reg.x0) * (reg.y1 - reg.y0);
  if (sector === 'fish') return regionArea * 0.8;
  return regionArea * (outdoorRun ? 0.38 : 0.55);
}

export function buildLayout(
  sector: Sector,
  areaSqm: number,
  allocs: AllocTarget[],
  flags: LayoutFlags,
): LayoutSpec {
  const { widthM, lengthM } = plotDims(sector, areaSqm);
  const rects: LayoutRect[] = [];

  // drainage canal on the low (south) side
  rects.push({ x: 0, y: r1(lengthM - CANAL_H), w: widthM, h: CANAL_H, kind: 'canal', label: 'Drainage canal' });

  // utilities in the north-west / north-east corners
  const uh = utilityHeight(areaSqm);
  if (uh > 0) {
    if (flags.tank) rects.push({ x: MARGIN, y: MARGIN, w: Math.min(1.2, uh - 0.1), h: Math.min(1.2, uh - 0.1), kind: 'tank', label: 'Water tank' });
    if (flags.pump) rects.push({ x: MARGIN + 1.4, y: MARGIN, w: 0.6, h: 0.6, kind: 'pump', label: 'Pump' });
    if (flags.power) rects.push({ x: r1(widthM - MARGIN - 0.7), y: MARGIN, w: 0.7, h: 0.7, kind: 'power', label: 'Power / solar' });
  }

  const reg = workRegion(widthM, lengthM, areaSqm);
  const availW = reg.x1 - reg.x0;
  const availH = reg.y1 - reg.y0;
  const total = allocs.reduce((s, a) => s + a.areaSqm, 0) || 1;

  if (sector === 'crops' && areaSqm <= BED_MODE_MAX_SQM) {
    const g = cropGrid(areaSqm);
    const bedArea = g.bedW * g.bedLen;
    let remaining = Math.min(g.slots.length, Math.max(1, Math.round(total / bedArea)));
    let slotIdx = 0;
    allocs.forEach((a, i) => {
      const want = Math.max(1, Math.round(a.areaSqm / bedArea));
      const n = i === allocs.length - 1 ? remaining : Math.min(want, remaining - (allocs.length - 1 - i));
      for (let k = 0; k < n && slotIdx < g.slots.length; k++, slotIdx++) {
        const s = g.slots[slotIdx];
        rects.push({ x: s.x, y: s.y, w: g.bedW, h: g.bedLen, kind: 'bed', itemId: a.item.id, label: a.item.name });
      }
      remaining -= n;
    });
  } else if (sector === 'crops') {
    // large fields: full-width blocks separated by 1 m access paths
    const gap = 1;
    const usableH = availH - gap * (allocs.length - 1);
    let y = reg.y0;
    allocs.forEach((a) => {
      const h = Math.min(usableH * (a.areaSqm / total), (a.areaSqm / availW));
      rects.push({ x: reg.x0, y: r1(y), w: r1(availW), h: r1(Math.max(0.5, h)), kind: 'bed', itemId: a.item.id, label: a.item.name });
      y += Math.max(0.5, h) + gap;
    });
  } else if (sector === 'fish') {
    const dike = 0.7;
    const pondsPer = allocs.map((a) => clamp(Math.round(a.areaSqm / 300), 1, 4));
    const nTotal = pondsPer.reduce((s, n) => s + n, 0);
    const cols = nTotal <= 1 ? 1 : 2;
    const rows = Math.ceil(nTotal / cols);
    const cellW = (availW - (cols - 1) * dike) / cols;
    const cellH = (availH - (rows - 1) * dike) / rows;
    // scale ponds down so total water area matches the target allocation
    const s = Math.min(1, Math.sqrt(total / (nTotal * cellW * cellH)));
    const pw = r1(cellW * s);
    const ph = r1(cellH * s);
    let idx = 0;
    allocs.forEach((a, i) => {
      for (let k = 0; k < pondsPer[i]; k++, idx++) {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        rects.push({
          x: r1(reg.x0 + c * (cellW + dike)), y: r1(reg.y0 + r * (cellH + dike)),
          w: pw, h: ph, kind: 'pond', itemId: a.item.id, label: `${a.item.name} pond`,
        });
      }
    });
  } else {
    // livestock: house (+ outdoor run) per species, stacked top to bottom
    const gap = 0.6;
    const parts = allocs.map((a) => {
      const run = a.item.id !== 'broiler';
      const houseH = a.areaSqm / availW;
      return { a, run, houseH, runH: run ? houseH * 1.5 : 0 };
    });
    const totalH = parts.reduce((s, p) => s + p.houseH + p.runH + gap, -gap);
    const k = totalH > availH ? availH / totalH : 1;
    let y = reg.y0;
    parts.forEach((p) => {
      const hh = r1(Math.max(0.5, p.houseH * k));
      rects.push({ x: reg.x0, y: r1(y), w: r1(availW), h: hh, kind: 'house', itemId: p.a.item.id, label: `${p.a.item.name} house` });
      y += hh;
      if (p.run) {
        const rh = r1(Math.max(0.5, p.runH * k));
        rects.push({ x: reg.x0, y: r1(y), w: r1(availW), h: rh, kind: 'run', itemId: p.a.item.id, label: 'Fenced run' });
        y += rh;
      }
      y += gap * k;
    });
  }

  const legendMap = new Map<string, number>();
  for (const r of rects) {
    if (r.itemId && (r.kind === 'bed' || r.kind === 'pond' || r.kind === 'house')) {
      legendMap.set(r.itemId, (legendMap.get(r.itemId) ?? 0) + rectArea(r));
    }
  }
  return {
    widthM,
    lengthM,
    rects,
    lowSide: 'S',
    legend: [...legendMap.entries()].map(([itemId, a]) => ({ itemId, areaSqm: r1(a) })),
  };
}

/** Actual production area (sqm) per catalog item, measured from the drawn rectangles. */
export function measuredAreas(layout: LayoutSpec): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of layout.legend) m.set(l.itemId, l.areaSqm);
  return m;
}
