import { applyH, type Mat3, type Pt } from './geometry';
import type { BuildDesign } from './designs';

/**
 * PLACEMENT GUIDE, not a picture. Marks where each bed, bag, trellis and rack would stand on the floor
 * area the user marked on their photo: flat translucent footprints with numbers, nothing drawn to look
 * real (no fake plants, walls or shadows). For a realistic image use the AI picture (services/build/prompt.ts
 * builds its prompt, server/index.mjs /api/ai/render produces it).
 * Pure and deterministic, so it can be unit-tested.
 */

export type Prim =
  | { k: 'poly'; pts: Pt[]; fill: string; opacity: number; stroke?: string; sw?: number }
  | { k: 'line'; a: Pt; b: Pt; stroke: string; sw: number; opacity: number; dash?: string }
  | { k: 'ellipse'; c: Pt; rx: number; ry: number; fill: string; opacity: number; stroke?: string; sw?: number };

export interface Marker { n: number; at: Pt; itemId?: string; label: string }
export interface Scene { prims: Prim[]; markers: Marker[] }

export const GUIDE_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];
const colorOf = (i: number) => GUIDE_COLORS[((i % GUIDE_COLORS.length) + GUIDE_COLORS.length) % GUIDE_COLORS.length];

export function renderScene(design: BuildDesign, H: Mat3, _imgW: number, _imgH: number, colorIndex: (itemId?: string) => number, nameOf: (itemId?: string) => string = (i) => i ?? ''): Scene {
  const P = (x: number, y: number): Pt => applyH(H, { x, y });
  const prims: Prim[] = [];
  const markers: Marker[] = [];
  const seen = new Set<string>();
  const mark = (at: Pt, itemId: string | undefined, label: string) => { markers.push({ n: markers.length + 1, at, itemId, label }); };
  const ok = (p: Pt) => Number.isFinite(p.x) && Number.isFinite(p.y);

  for (const s of design.structures) {
    if (s.type === 'bed') {
      const pts = [P(s.x, s.y), P(s.x + s.w, s.y), P(s.x + s.w, s.y + s.l), P(s.x, s.y + s.l)];
      if (!pts.every(ok)) continue;
      const c = colorOf(colorIndex(s.itemId));
      prims.push({ k: 'poly', pts, fill: c, opacity: 0.4, stroke: '#ffffff', sw: 3 });
      mark(P(s.x + s.w / 2, s.y + s.l / 2), s.itemId, `${nameOf(s.itemId) || 'Bed'} · ${s.w.toFixed(1)} × ${s.l.toFixed(1)} m`);
    } else if (s.type === 'bag') {
      const pts = Array.from({ length: 14 }, (_, i) => P(s.cx + s.r * Math.cos((i / 14) * Math.PI * 2), s.cy + s.r * Math.sin((i / 14) * Math.PI * 2)));
      if (!pts.every(ok)) continue;
      const c = colorOf(colorIndex(s.itemId));
      prims.push({ k: 'poly', pts, fill: c, opacity: 0.5, stroke: '#ffffff', sw: 2 });
      if (s.itemId && !seen.has(s.itemId)) { seen.add(s.itemId); mark(P(s.cx, s.cy), s.itemId, `${nameOf(s.itemId)} in grow bags`); }
    } else if (s.type === 'trellis') {
      const a = P(s.x1, s.y1), b = P(s.x2, s.y2);
      if (ok(a) && ok(b)) prims.push({ k: 'line', a, b, stroke: '#ffffff', sw: 5, opacity: 0.95, dash: '14 8' });
    } else {
      const pts = [P(s.x, s.y), P(s.x + s.w, s.y), P(s.x + s.w, s.y + s.d), P(s.x, s.y + s.d)];
      if (!pts.every(ok)) continue;
      prims.push({ k: 'poly', pts, fill: '#64748b', opacity: 0.45, stroke: '#ffffff', sw: 3 });
      mark(P(s.x + s.w / 2, s.y + s.d / 2), undefined, `Vertical rack · ${s.w.toFixed(1)} × ${s.d.toFixed(1)} m, ${s.tiers} tiers`);
    }
  }
  return { prims, markers };
}
