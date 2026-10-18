import type { Allocation, LayoutSpec } from '@/types';
import { catalogById } from '@/data/catalog';
import { materialById, unitPrice, type PriceBasis } from '@/data/materials';
import { recyclableById } from '@/data/recyclables';

/**
 * Deterministic "how to build it" engine. Given the plan's layout it produces three buildable concepts,
 * each with the structures to draw, a cut list, a bill of materials and measured steps. No AI involved:
 * the numbers must be reproducible and testable. (AI only reads the photo, see services/ai.ts.)
 */

export type DesignId = 'raised' | 'containers' | 'vertical';
export type Surface = 'soil' | 'hard' | 'gravel';

export type Structure =
  | { type: 'bed'; x: number; y: number; w: number; l: number; h: number; itemId?: string }
  | { type: 'bag'; cx: number; cy: number; r: number; h: number; itemId?: string }
  | { type: 'trellis'; x1: number; y1: number; x2: number; y2: number; h: number }
  | { type: 'rack'; x: number; y: number; w: number; d: number; h: number; tiers: number };

export interface CutRow { part: string; section: string; qty: number; lengthM: number; note?: string }

export interface BomLine {
  id: string;
  materialId: string;
  label: string;
  qty: number;
  unit: string;
  group: 'frame' | 'media' | 'water' | 'plants' | 'support' | 'shade' | 'hardware';
  note?: string;
}

export interface BuildStep {
  title: string;
  lines: string[];
  table?: { head: string[]; rows: string[][] };
}

export interface BuildDesign {
  id: DesignId;
  title: string;
  tagline: string;
  pros: string[];
  cons: string[];
  structures: Structure[];
  cutList: CutRow[];
  bom: BomLine[];
  steps: BuildStep[];
  plants: { itemId: string; count: number }[];
  growAreaSqm: number;
  notes: string[];
}

export interface DesignInput {
  layout: LayoutSpec;
  allocations: Allocation[];
  surface: Surface;
  sunlight: 'full' | 'partial' | 'shaded';
}

// ------------------------------------------------------------------ constants (all documented)
export const BOARD_THICK_IN = 1;
export const BOARD_WIDE_IN = 6;
/** two courses of 1x6 (actual ~140 mm each) */
export const BED_HEIGHT_M = 0.28;
/** a standard 8 ft (2.4384 m) piece of lumber */
export const STOCK_M = 8 * 0.3048;
const KERF_M = 0.003;
const POST_SPACING_M = 1.2;
const MEDIA_DEPTH_M = 0.15;
const FILLER_DEPTH_M = 0.1;
const SETTLE = 1.1;
/** litres of expanded cocopeat per kg of compressed cocopeat */
const COCO_L_PER_KG = 8;
/** kg per litre of finished compost */
const COMPOST_KG_PER_L = 0.6;
const MIX = { topsoil: 0.5, compost: 0.3, coco: 0.2 };
const BAG_D = 0.3;
const BAG_H = 0.3;
const BAG_PITCH = 0.4;
const BAG_L = Math.PI * (BAG_D / 2) ** 2 * (BAG_H - 0.03) * 1000;

export const M_TO_FT = 1 / 0.3048;
/** rounds to 2 places and never returns -0 */
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const ft = (m: number) => `${r1(m * M_TO_FT)} ft`;
const mt = (m: number) => `${r2(m)} m`;

export const bdFt = (thickIn: number, wideIn: number, lengthM: number) => (thickIn * wideIn * (lengthM * M_TO_FT)) / 12;

interface Spacing { a: number; b: number; perBag: number; climber?: boolean }
const SPACING: Record<string, Spacing> = {
  kangkong: { a: 10, b: 20, perBag: 6 }, pechay: { a: 15, b: 15, perBag: 5 }, lettuce: { a: 20, b: 20, perBag: 3 },
  sitaw: { a: 15, b: 50, perBag: 3, climber: true }, okra: { a: 40, b: 50, perBag: 1 }, patola: { a: 50, b: 100, perBag: 1, climber: true },
  talong: { a: 50, b: 60, perBag: 1 }, ampalaya: { a: 40, b: 60, perBag: 1, climber: true }, kamatis: { a: 45, b: 60, perBag: 1 }, sili: { a: 40, b: 50, perBag: 1 },
};
const DEFAULT_SPACING: Spacing = { a: 25, b: 25, perBag: 2 };
export const spacingFor = (itemId?: string): Spacing => (itemId && SPACING[itemId]) || DEFAULT_SPACING;
export const isClimber = (itemId?: string) => !!spacingFor(itemId).climber;
const nameOf = (itemId?: string) => (itemId ? catalogById(itemId)?.name ?? itemId : 'Mixed');
const isLeafy = (itemId?: string) => !!itemId && catalogById(itemId)?.category === 'Leafy vegetable';

// ------------------------------------------------------------------ cut optimisation
export interface CutPlan { stockM: number; pieces: number; wasteM: number; bins: number[][] }

/** First-fit-decreasing packing of cut lengths into stock pieces. Cuts longer than the stock must be split by the caller. */
export function packCuts(cuts: number[], stockM = STOCK_M, kerfM = KERF_M): CutPlan {
  const sorted = [...cuts].sort((a, b) => b - a);
  const bins: number[][] = [];
  const used: number[] = [];
  for (const c of sorted) {
    if (c > stockM + 1e-9) throw new Error(`Cut of ${c} m is longer than the ${stockM} m stock piece`);
    const i = used.findIndex((u) => u + c + kerfM <= stockM + 1e-9);
    if (i < 0) { bins.push([c]); used.push(c + kerfM); } else { bins[i].push(c); used[i] += c + kerfM; }
  }
  const total = used.reduce((s, u) => s + u, 0);
  return { stockM, pieces: bins.length, wasteM: r2(bins.length * stockM - total), bins };
}

/** Splits a run into equal pieces no longer than the stock length. */
export function splitRun(lengthM: number, stockM = STOCK_M): number[] {
  const n = Math.max(1, Math.ceil(lengthM / stockM - 1e-9));
  return Array.from({ length: n }, () => r2(lengthM / n));
}

// ------------------------------------------------------------------ shared building blocks
interface BedRect { x: number; y: number; w: number; l: number; itemId?: string }

function bedsOf(layout: LayoutSpec): BedRect[] {
  return layout.rects.filter((r) => r.kind === 'bed').map((r) => ({ x: r.x, y: r.y, w: r.w, l: r.h, itemId: r.itemId }));
}

interface FrameWood { boards: number[]; posts: number[]; runM: number }

/** Boards and posts for one framed bed (w x l metres). 2 courses of 1x6 on 2x2 posts. */
export function frameBed(w: number, l: number, surface: Surface): FrameWood {
  const courses = 2;
  const thick = (BOARD_THICK_IN * 25.4) / 1000;
  const longs = splitRun(l);
  const shorts = [r2(w - 2 * thick)];
  const boards: number[] = [];
  for (let c = 0; c < courses; c++) {
    for (let s = 0; s < 2; s++) { boards.push(...longs); boards.push(...shorts); }
  }
  const nInter = Math.max(0, Math.ceil(l / POST_SPACING_M) - 1);
  const postLen = surface === 'hard' ? BED_HEIGHT_M : 0.4;
  const posts = Array.from({ length: 4 + 2 * nInter }, () => postLen);
  const runM = courses * (2 * l + 2 * w);
  return { boards, posts, runM };
}

interface FrameTotals { cut: CutRow[]; boardPieces: number; postPieces: number; boardBdFt: number; postBdFt: number; runM: number; boardPlan: CutPlan; postPlan: CutPlan }

function frameTotals(beds: { w: number; l: number }[], surface: Surface): FrameTotals {
  const boards: number[] = [];
  const posts: number[] = [];
  let runM = 0;
  for (const b of beds) {
    const f = frameBed(b.w, b.l, surface);
    boards.push(...f.boards); posts.push(...f.posts); runM += f.runM;
  }
  const boardPlan = packCuts(boards);
  const postPlan = packCuts(posts);
  const tally = (arr: number[]) => {
    const m = new Map<number, number>();
    arr.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  };
  const cut: CutRow[] = [
    ...tally(boards).map(([len, qty]) => ({ part: 'Frame board', section: '1" x 6"', qty, lengthM: len })),
    ...tally(posts).map(([len, qty]) => ({ part: 'Corner / side post', section: '2" x 2"', qty, lengthM: len })),
  ];
  return {
    cut,
    boardPieces: boardPlan.pieces, postPieces: postPlan.pieces,
    boardBdFt: r2(boardPlan.pieces * bdFt(BOARD_THICK_IN, BOARD_WIDE_IN, STOCK_M)),
    postBdFt: r2(postPlan.pieces * bdFt(2, 2, STOCK_M)),
    runM, boardPlan, postPlan,
  };
}

interface MediaNeed { litres: number; topsoilM3: number; compostKg: number; cocoKg: number }
export function mediaFor(litres: number): MediaNeed {
  const L = litres * SETTLE;
  return {
    litres: r1(L),
    topsoilM3: r2((L * MIX.topsoil) / 1000),
    compostKg: r1(L * MIX.compost * COMPOST_KG_PER_L),
    cocoKg: r1((L * MIX.coco) / COCO_L_PER_KG),
  };
}

function plantsInBed(b: BedRect): number {
  const sp = spacingFor(b.itemId);
  if (sp.climber) return Math.max(1, Math.floor(b.l / (sp.a / 100)));
  return Math.max(1, Math.floor(((b.w * b.l * 10000) / (sp.a * sp.b)) * 0.85));
}

function tallyPlants(beds: BedRect[], perBed: (b: BedRect) => number): { itemId: string; count: number }[] {
  const m = new Map<string, number>();
  for (const b of beds) if (b.itemId) m.set(b.itemId, (m.get(b.itemId) ?? 0) + perBed(b));
  return [...m.entries()].map(([itemId, count]) => ({ itemId, count }));
}

const SEEDS_PER_PACK = 120;

function seedLines(plants: { itemId: string; count: number }[]): BomLine[] {
  return plants.map((p) => ({
    id: `seeds-${p.itemId}`, materialId: 'seeds', label: `${nameOf(p.itemId)} seeds`, qty: Math.max(1, Math.ceil(p.count / SEEDS_PER_PACK)), unit: 'pack', group: 'plants',
    note: `${p.count} plants (extra seeds cover seedlings that fail).`,
  }));
}

function mediaLines(m: MediaNeed, extra: { fillerM3?: number } = {}): BomLine[] {
  const lines: BomLine[] = [
    { id: 'topsoil', materialId: 'topsoil', label: 'Garden topsoil / loam', qty: m.topsoilM3, unit: 'cu.m', group: 'media', note: `${Math.round(MIX.topsoil * 100)}% of the mix` },
    { id: 'compost', materialId: 'compost', label: 'Compost / vermicast', qty: m.compostKg, unit: 'kg', group: 'media', note: `${Math.round(MIX.compost * 100)}% of the mix` },
    { id: 'cocopeat', materialId: 'cocopeat', label: 'Cocopeat or rice hull', qty: m.cocoKg, unit: 'kg', group: 'media', note: `${Math.round(MIX.coco * 100)}% of the mix, loosens the soil` },
  ];
  if (extra.fillerM3 && extra.fillerM3 > 0) lines.push({ id: 'filler', materialId: 'gravel', label: 'Coarse filler / drainage layer', qty: r2(extra.fillerM3), unit: 'cu.m', group: 'media', note: 'Bottom layer; broken tiles, stones or dry leaves also work' });
  return lines;
}

function irrigationLines(areaSqm: number): BomLine[] {
  return [
    { id: 'drip', materialId: 'drip_kit', label: 'Drip irrigation kit', qty: Math.max(1, Math.ceil(areaSqm / 8)), unit: 'set', group: 'water', note: 'One 10 m kit waters about 8 sqm of beds' },
    { id: 'hose', materialId: 'garden_hose', label: 'Garden hose 1/2" (15 m)', qty: 1, unit: 'pc', group: 'water', note: 'From the tap to the drip lines' },
  ];
}

function linerLine(beds: { w: number; l: number }[]): BomLine {
  return {
    id: 'liner', materialId: 'poly_sheet', label: 'Perforated plastic liner under beds',
    qty: r1(beds.reduce((s, b) => s + b.l + 0.2, 0)), unit: 'lm', group: 'hardware',
    note: 'Keeps soil in and off the floor (assumes a sheet at least 1.5 m wide)',
  };
}

function trellisLines(beds: BedRect[]): { lines: BomLine[]; structures: Structure[]; cut: CutRow[] } {
  const climbers = beds.filter((b) => isClimber(b.itemId));
  if (!climbers.length) return { lines: [], structures: [], cut: [] };
  let poles = 0, net = 0, wire = 0;
  const structures: Structure[] = [];
  for (const b of climbers) {
    poles += Math.ceil(b.l / POST_SPACING_M) + 1 + Math.ceil(b.l / 3); // posts + top bar pieces
    net += b.l; wire += 0.05 + b.l * 0.01;
    structures.push({ type: 'trellis', x1: r2(b.x + b.w / 2), y1: b.y, x2: r2(b.x + b.w / 2), y2: r2(b.y + b.l), h: 1.8 });
  }
  return {
    structures,
    cut: [{ part: 'Trellis post', section: 'bamboo or 2" x 2"', qty: climbers.reduce((s, b) => s + Math.ceil(b.l / POST_SPACING_M) + 1, 0), lengthM: 2.4, note: 'bury 0.4 m' }],
    lines: [
      { id: 'bamboo', materialId: 'bamboo_pole', label: 'Bamboo poles for trellis (posts and top bar)', qty: poles, unit: 'pc', group: 'support', note: 'Posts 2.4 m long, 1.2 m apart' },
      { id: 'tnet', materialId: 'trellis_net', label: 'Trellis netting', qty: r1(net), unit: 'lm', group: 'support', note: '1.8 m wide' },
      { id: 'wire', materialId: 'tie_wire', label: 'GI tie wire for lashing', qty: r2(wire), unit: 'kg', group: 'hardware' },
    ],
  };
}

function shadeLine(beds: BedRect[], sunlight: DesignInput['sunlight']): BomLine[] {
  if (sunlight === 'shaded') return [];
  const area = beds.filter((b) => isLeafy(b.itemId)).reduce((s, b) => s + b.w * b.l, 0);
  if (area <= 0) return [];
  return [{ id: 'shade', materialId: 'shade_net', label: 'Shade net 50% over leafy beds', qty: r1(area * 1.2), unit: 'sqm', group: 'shade', note: 'Cools leafy greens in the hot lowlands. Skip it if you already have one.' }];
}

function nailLine(runM: number): BomLine {
  return { id: 'nails', materialId: 'nails', label: 'Common nails 3"', qty: r2(runM * 0.055 * 1.15), unit: 'kg', group: 'hardware', note: 'About one nail per 15 cm of board run, plus 15% spare' };
}

function frameLumberLines(t: FrameTotals): BomLine[] {
  return [
    { id: 'boards', materialId: 'lumber_coco', label: `Frame boards 1" x 6" x 8 ft (buy ${t.boardPieces} pcs)`, qty: t.boardBdFt, unit: 'bd.ft', group: 'frame', note: `Cut plan wastes only ${t.boardPlan.wasteM} m. Switch to good lumber for a longer life.` },
    { id: 'posts', materialId: 'lumber_coco', label: `Posts 2" x 2" x 8 ft (buy ${t.postPieces} pcs)`, qty: t.postBdFt, unit: 'bd.ft', group: 'frame' },
  ];
}

function markingTable(beds: BedRect[]): BuildStep['table'] {
  return {
    head: ['#', 'Crop', 'East from NW corner', 'South from NW corner', 'Size (W x L)'],
    rows: beds.map((b, i) => [String(i + 1), nameOf(b.itemId), mt(b.x), mt(b.y), `${mt(b.w)} x ${mt(b.l)}`]),
  };
}

function squareUp(beds: BedRect[]): string {
  const b = beds[0];
  if (!b) return '';
  return `Square each corner: measure both diagonals and adjust until they match. For a ${mt(b.w)} x ${mt(b.l)} bed both read ${mt(Math.hypot(b.w, b.l))} (give or take 1 cm).`;
}

function surfaceLines(surface: Surface, beds: { w: number; l: number }[]): string[] {
  if (surface === 'hard') {
    return [
      'Sweep the floor and check where water runs. Put the low edge of every bed toward the drain side (south).',
      `Lay a plastic liner under each bed (${beds.length} sheet${beds.length > 1 ? 's' : ''}, each 0.2 m longer than the bed and 0.4 m wider). Poke 10 mm holes every 30 cm so water can leave, and turn the edges up 5 cm inside the frame.`,
      'Leave a 2 cm gap under one end of each frame (shim with 2 bottle caps) so drained water can escape across the floor.',
    ];
  }
  return [
    'Clear weeds and loosen the ground 10 cm deep with a fork, then lay flattened cardboard to smother grass.',
    'Check levels: lay a straight board across the bed with a water level on it. It should be level to within 2 cm over 1 m.',
  ];
}

// ------------------------------------------------------------------ Design A: raised frame beds
function designRaised(inp: DesignInput): BuildDesign {
  const beds = bedsOf(inp.layout);
  const { surface, sunlight } = inp;
  const fw = frameTotals(beds, surface);
  const area = beds.reduce((s, b) => s + b.w * b.l, 0);
  const media = mediaFor(beds.reduce((s, b) => s + b.w * b.l * MEDIA_DEPTH_M * 1000, 0));
  const filler = beds.reduce((s, b) => s + b.w * b.l * FILLER_DEPTH_M, 0);
  const tr = trellisLines(beds);
  const plants = tallyPlants(beds, plantsInBed);
  const bom: BomLine[] = [
    ...frameLumberLines(fw), nailLine(fw.runM),
    ...(surface === 'hard' ? [linerLine(beds)] : []),
    ...mediaLines(media, { fillerM3: filler }),
    ...irrigationLines(area), ...tr.lines, ...shadeLine(beds, sunlight), ...seedLines(plants),
  ];
  const structures: Structure[] = [...beds.map((b) => ({ type: 'bed' as const, x: b.x, y: b.y, w: b.w, l: b.l, h: BED_HEIGHT_M, itemId: b.itemId })), ...tr.structures];
  const first = beds[0];
  const steps: BuildStep[] = [
    { title: 'Prepare the ground', lines: surfaceLines(surface, beds) },
    {
      title: 'Mark the layout',
      lines: [
        'Stand at the north-west corner of your area (the far-left corner in your photo). Measure from there and mark each bed corner with a peg or chalk.',
        squareUp(beds),
      ].filter(Boolean),
      table: markingTable(beds),
    },
    {
      title: 'Cut the lumber',
      lines: [
        `Buy ${fw.boardPieces} pieces of 1" x 6" x 8 ft (2.44 m) boards and ${fw.postPieces} pieces of 2" x 2" x 8 ft posts. The cut plan below keeps waste to ${fw.boardPlan.wasteM} m of board.`,
        `Each bed is two courses high (2 x 140 mm = ${mt(BED_HEIGHT_M)}). Boards longer than 2.44 m are joined in the middle over a post.`,
        'Measure twice, cut once. Mark each cut with a square and saw on the waste side of the line (the saw takes about 3 mm).',
      ],
      table: { head: ['Part', 'Section', 'Qty', 'Length'], rows: fw.cut.map((c) => [c.part, c.section, String(c.qty), `${mt(c.lengthM)} (${ft(c.lengthM)})`]) },
    },
    {
      title: 'Build each frame',
      lines: [
        `Stand the posts at the 4 corners${first && first.l > POST_SPACING_M ? ` and every ${mt(POST_SPACING_M)} along the long sides` : ''}, inside the frame.`,
        'Nail the lower board of each side to the posts with 2 x 3" nails per post, then nail the upper board directly on top of it.',
        surface === 'hard'
          ? `Posts are ${mt(BED_HEIGHT_M)} tall and rest on the floor.`
          : `Posts are 0.40 m long: drive each 12 cm into the ground so the frame cannot tip.`,
        'Check the frame is square (equal diagonals) before moving on.',
      ],
    },
    {
      title: 'Fill the beds',
      lines: [
        `Bottom ${mt(FILLER_DEPTH_M)}: coarse filler (gravel, broken tiles, branches, coco husk).`,
        `Top ${mt(MEDIA_DEPTH_M)}: mix ${Math.round(MIX.topsoil * 100)}% topsoil, ${Math.round(MIX.compost * 100)}% compost and ${Math.round(MIX.coco * 100)}% cocopeat or rice hull. Wet the cocopeat first: 1 kg swells to about ${COCO_L_PER_KG} L.`,
        `The finished soil sits about 3 cm below the rim. In total you need ${media.litres} L of mix (${media.topsoilM3} cu.m topsoil, ${media.compostKg} kg compost, ${media.cocoKg} kg cocopeat).`,
      ],
    },
    {
      title: 'Set up watering',
      lines: [
        `Run 2 drip lines along each bed, 25 cm in from each side (the beds are ${first ? mt(first.w) : '1.0 m'} wide). Place a dripper every 30 cm.`,
        'Connect to the tap with the hose, flush the lines for 30 seconds, then close the ends and test for leaks.',
        'Water for 10 minutes in the morning at first; check that the soil is damp 5 cm down.',
      ],
    },
    ...(tr.lines.length ? [{
      title: 'Put up the trellis for climbing crops',
      lines: [
        'Sink bamboo or 2" x 2" posts 40 cm into the ground (or fix to a heavy base on hard floors), 2.4 m long, 1.2 m apart along the centre of each climbing bed.',
        'Lash a top bar at 1.8 m high with tie wire (figure-eight lashing). Hang the netting from the top bar down to 10 cm above the soil.',
        'Brace each end post with a diagonal 1.2 m long.',
      ],
    }] : []),
    ...(bom.some((b) => b.id === 'shade') ? [{
      title: 'Shade the leafy beds',
      lines: ['Raise the shade net on posts 1.8 m high, 30 cm wider than the beds on every side. Pull it tight and tie every 50 cm.'],
    }] : []),
    {
      title: 'Plant',
      lines: ['Sow or transplant at these spacings. Water in well.'],
      table: {
        head: ['Crop', 'Spacing', 'Plants'],
        rows: plants.map((p) => { const sp = spacingFor(p.itemId); return [nameOf(p.itemId), sp.climber ? `${sp.a} cm apart along the trellis` : `${sp.a} x ${sp.b} cm`, String(p.count)]; }),
      },
    },
  ];
  return {
    id: 'raised', title: 'Raised garden beds', tagline: 'Framed beds 1 m wide with paths between. The classic, easiest to tend.',
    pros: ['Best plant capacity per square metre', 'Easy to reach every plant from the path', 'Works on soil, gravel or tiled floors with a liner'],
    cons: ['Needs the most wood and the most soil', 'Frames take a weekend to build'],
    structures, cutList: [...fw.cut, ...tr.cut], bom, steps, plants, growAreaSqm: r1(area),
    notes: [`Lumber is priced by board foot. A 1" x 6" x 8 ft board is ${r2(bdFt(1, 6, STOCK_M))} bd.ft.`],
  };
}

// ------------------------------------------------------------------ Design B: grow bags and recycled containers
function designContainers(inp: DesignInput): BuildDesign {
  const beds = bedsOf(inp.layout);
  const { surface, sunlight } = inp;
  const structures: Structure[] = [];
  const perCrop = new Map<string, number>();
  const rowsTable: string[][] = [];
  let bags = 0;
  const plants: { itemId: string; count: number }[] = [];
  beds.forEach((b, bi) => {
    const nx = Math.max(1, Math.floor(b.w / BAG_PITCH + 1e-6));
    const ny = Math.max(1, Math.floor(b.l / BAG_PITCH + 1e-6));
    const offX = (b.w - nx * BAG_PITCH) / 2 + BAG_PITCH / 2;
    const offY = (b.l - ny * BAG_PITCH) / 2 + BAG_PITCH / 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        structures.push({ type: 'bag', cx: r2(b.x + offX + i * BAG_PITCH), cy: r2(b.y + offY + j * BAG_PITCH), r: BAG_D / 2, h: BAG_H, itemId: b.itemId });
        bags++;
        if (b.itemId) perCrop.set(b.itemId, (perCrop.get(b.itemId) ?? 0) + 1);
      }
    }
    rowsTable.push([String(bi + 1), nameOf(b.itemId), mt(b.x + offX), mt(b.y + offY), `${nx} across x ${ny} along`]);
  });
  for (const [itemId, n] of perCrop) plants.push({ itemId, count: n * spacingFor(itemId).perBag });
  const media = mediaFor(bags * BAG_L);
  const tr = trellisLines(beds);
  const area = bags * Math.PI * (BAG_D / 2) ** 2;
  const bom: BomLine[] = [
    { id: 'bags', materialId: 'grow_bag', label: 'Grow bags 12" (about 19 L each)', qty: bags, unit: 'pc', group: 'frame', note: 'Or use buckets, styrofoam boxes or sacks you already have' },
    ...mediaLines(media),
    ...irrigationLines(Math.max(1, bags * 0.16)), ...tr.lines, ...shadeLine(beds, sunlight), ...seedLines(plants),
  ];
  const steps: BuildStep[] = [
    { title: 'Prepare the ground', lines: surfaceLines(surface, []).slice(0, surface === 'hard' ? 1 : 2) },
    {
      title: 'Mark where the containers go',
      lines: [`Containers are ${mt(BAG_D)} wide and set ${mt(BAG_PITCH)} apart centre to centre, so you can reach every plant. Measure from the north-west corner of the area (far-left corner in your photo).`],
      table: { head: ['Area', 'Crop', 'First container: east', 'First container: south', 'Grid'], rows: rowsTable },
    },
    {
      title: 'Prepare the containers',
      lines: [
        'Bought grow bags need no work. For buckets, boxes or sacks: drill or poke 6 drainage holes of 8 to 10 mm in the base, evenly spaced.',
        'Stand each container on 2 small blocks (3 cm high) so water can drain out from under it.',
        `Each ${mt(BAG_D)} container holds about ${Math.round(BAG_L)} L of soil mix.`,
      ],
    },
    {
      title: 'Fill the containers',
      lines: [
        `Mix ${Math.round(MIX.topsoil * 100)}% topsoil, ${Math.round(MIX.compost * 100)}% compost and ${Math.round(MIX.coco * 100)}% cocopeat or rice hull (wet the cocopeat first).`,
        `Fill to 3 cm below the rim. In total you need ${media.litres} L (${media.topsoilM3} cu.m topsoil, ${media.compostKg} kg compost, ${media.cocoKg} kg cocopeat).`,
      ],
    },
    {
      title: 'Set up watering',
      lines: [
        'Run the drip line past each row of containers and place one dripper in each container (or use a bottle drip emitter).',
        'Containers dry out faster than beds. Check by pushing a finger 5 cm in; water when it is dry. Mulch with dry leaves to slow drying.',
      ],
    },
    ...(tr.lines.length ? [{ title: 'Trellis for climbing crops', lines: ['Set 2.4 m posts 40 cm deep (or in a heavy bucket of concrete or sand on hard floors) behind each climbing row, 1.2 m apart. Lash a top bar at 1.8 m and hang the netting.'] }] : []),
    {
      title: 'Plant',
      lines: ['Plant at these numbers per container.'],
      table: { head: ['Crop', 'Per container', 'Containers', 'Plants'], rows: plants.map((p) => [nameOf(p.itemId), String(spacingFor(p.itemId).perBag), String(perCrop.get(p.itemId) ?? 0), String(p.count)]) },
    },
  ];
  return {
    id: 'containers', title: 'Grow bags and recycled containers', tagline: 'No frames. Bags, buckets, boxes or sacks set out in rows. Cheapest to start and easy to move.',
    pros: ['No carpentry', 'Great on tiles, concrete and rooftops', 'Uses buckets, sacks and styrofoam boxes you already have'],
    cons: ['Fewer plants per square metre than beds', 'Dries out faster; needs closer watering'],
    structures, cutList: [...tr.cut], bom, steps, plants, growAreaSqm: r1(area),
    notes: [`${bags} containers of ${mt(BAG_D)} fit in the same footprint as the beds.`],
  };
}

// ------------------------------------------------------------------ Design C: vertical + compact
function designVertical(inp: DesignInput): BuildDesign {
  const W = inp.layout.widthM;
  const { surface, sunlight } = inp;
  const beds = bedsOf(inp.layout);
  const minY = beds.length ? Math.min(...beds.map((b) => b.y)) : 0.5;
  const minX = beds.length ? Math.min(...beds.map((b) => b.x)) : 0.4;
  const L = inp.layout.lengthM;
  const runW = Math.max(1, r1(Math.min(W - 0.8, 6)));
  const troughL = runW;
  const troughW = 0.35;
  const rackD = 0.35;
  const rackW = Math.min(2.4, Math.max(1.2, r1(runW / 2)));
  const rackTiers = 3;
  const cropIds = [...new Set(beds.map((b) => b.itemId).filter(Boolean))] as string[];
  const climbers = cropIds.filter(isClimber);
  const leafy = cropIds.filter(isLeafy);
  const others = cropIds.filter((c) => !isClimber(c) && !isLeafy(c));
  const troughItem = climbers[0] ?? others[0] ?? cropIds[0];
  const rackItem = leafy[0] ?? cropIds.find((c) => c !== troughItem);
  const centre: BedRect[] = [];
  // two small beds in the middle for the remaining crops
  const CANAL_CLEAR = 0.6;
  const centreW = 1.0;
  const cy = r1(minY + troughW + 0.9);
  // leave room for the rack below the beds (0.5 m walkway) and the drainage canal at the south edge
  const availL = L - CANAL_CLEAR - cy - 0.5 - rackD - 0.2;
  const centreL = Math.max(0.8, Math.min(2.4, r1(runW / 2), r1(availL)));
  const gapX = 0.5;
  const nCentre = runW >= 2 * centreW + gapX + 0.4 ? 2 : 1;
  for (let i = 0; i < nCentre; i++) centre.push({ x: r1(minX + 0.4 + i * (centreW + gapX)), y: cy, w: centreW, l: centreL, itemId: (i === 0 ? others[0] ?? leafy[0] : others[1] ?? others[0] ?? leafy[0]) ?? troughItem });
  const rackY = r1(Math.min(cy + centreL + 0.5, L - CANAL_CLEAR - rackD));
  const structures: Structure[] = [
    { type: 'trellis', x1: r1(minX), y1: r1(minY), x2: r1(minX + runW), y2: r1(minY), h: 1.8 },
    { type: 'bed', x: r1(minX), y: r1(minY + 0.15), w: runW, l: troughW, h: BED_HEIGHT_M, itemId: troughItem },
    { type: 'rack', x: r1(minX + runW - rackW), y: rackY, w: rackW, d: rackD, h: 1.4, tiers: rackTiers },
    ...centre.map((b) => ({ type: 'bed' as const, x: b.x, y: b.y, w: b.w, l: b.l, h: BED_HEIGHT_M, itemId: b.itemId })),
  ];
  const frameBeds = [{ w: troughW, l: troughL }, ...centre.map((b) => ({ w: b.w, l: b.l }))];
  const fw = frameTotals(frameBeds, surface);
  // rack: 4 posts 1.5 m + 3 shelves (1x6, two boards wide) + 2 side rails per tier
  const rackShelfBoards = rackTiers * 2 * 1; // two 1x6 boards per shelf
  const rackPosts = 4;
  const rackPostPlan = packCuts(Array.from({ length: rackPosts }, () => 1.5));
  const rackShelfLen = rackW;
  const rackShelfPlan = packCuts(Array.from({ length: rackShelfBoards }, () => rackShelfLen));
  const rackBd = r2(rackShelfPlan.pieces * bdFt(1, 6, STOCK_M) + rackPostPlan.pieces * bdFt(2, 2, STOCK_M));
  const climbLen = runW;
  const trellisPoles = Math.ceil(climbLen / POST_SPACING_M) + 1 + Math.ceil(climbLen / 3);
  const area = troughL * troughW + centre.reduce((s, b) => s + b.w * b.l, 0) + rackTiers * rackW * rackD * 0.8;
  const media = mediaFor(frameBeds.reduce((s, b) => s + b.w * b.l * MEDIA_DEPTH_M * 1000, 0) + rackTiers * rackW * rackD * 0.12 * 1000);
  const plants: { itemId: string; count: number }[] = [];
  const add = (itemId: string | undefined, count: number) => { if (!itemId || count <= 0) return; const e = plants.find((p) => p.itemId === itemId); if (e) e.count += count; else plants.push({ itemId, count }); };
  add(troughItem, Math.max(1, Math.floor(climbLen / (spacingFor(troughItem).a / 100))));
  add(rackItem, Math.floor((rackTiers * rackW * rackD * 10000) / (spacingFor(rackItem).a * spacingFor(rackItem).b)) * 1);
  centre.forEach((b) => add(b.itemId, plantsInBed(b)));
  const bom: BomLine[] = [
    ...frameLumberLines(fw),
    { id: 'rack', materialId: 'lumber_coco', label: `Rack: posts and shelf boards`, qty: rackBd, unit: 'bd.ft', group: 'frame', note: `${rackPosts} posts 1.5 m high, ${rackShelfBoards} shelf boards ${mt(rackShelfLen)} long` },
    nailLine(fw.runM + rackShelfBoards * rackShelfLen),
    ...(surface === 'hard' ? [linerLine(frameBeds)] : []),
    ...mediaLines(media),
    { id: 'bamboo', materialId: 'bamboo_pole', label: 'Bamboo poles for the trellis wall', qty: trellisPoles, unit: 'pc', group: 'support', note: 'Posts 2.4 m long, 1.2 m apart, plus a top bar' },
    { id: 'tnet', materialId: 'trellis_net', label: 'Trellis netting', qty: r1(climbLen), unit: 'lm', group: 'support', note: '1.8 m wide' },
    { id: 'wire', materialId: 'tie_wire', label: 'GI tie wire for lashing', qty: r2(0.08 + climbLen * 0.01), unit: 'kg', group: 'hardware' },
    ...irrigationLines(area), ...shadeLine([...centre, { x: minX + runW - rackW, y: rackY, w: rackW, l: rackD, itemId: rackItem }], sunlight), ...seedLines(plants),
  ];
  const steps: BuildStep[] = [
    { title: 'Prepare the ground', lines: surfaceLines(surface, frameBeds) },
    {
      title: 'Mark the layout',
      lines: [`Measure from the north-west corner of your area (far-left corner in the photo). The trellis wall runs along the back (north) edge for ${mt(runW)}.`],
      table: {
        head: ['Part', 'East', 'South', 'Size'],
        rows: [
          ['Trellis planter', mt(minX), mt(minY + 0.15), `${mt(troughL)} x ${mt(troughW)}`],
          ...centre.map((b, i) => [`Bed ${i + 1} (${nameOf(b.itemId)})`, mt(b.x), mt(b.y), `${mt(b.w)} x ${mt(b.l)}`]),
          ['Tiered rack', mt(minX + runW - rackW), mt(rackY), `${mt(rackW)} x ${mt(rackD)}, ${mt(1.4)} high`],
        ],
      },
    },
    {
      title: 'Cut the lumber',
      lines: [`Buy ${fw.boardPieces + rackShelfPlan.pieces} pieces of 1" x 6" x 8 ft and ${fw.postPieces + rackPostPlan.pieces} pieces of 2" x 2" x 8 ft. The planter and beds use the same two-course frame as the raised-bed design.`],
      table: { head: ['Part', 'Section', 'Qty', 'Length'], rows: [...fw.cut.map((c) => [c.part, c.section, String(c.qty), `${mt(c.lengthM)} (${ft(c.lengthM)})`]), ['Rack shelf board', '1" x 6"', String(rackShelfBoards), `${mt(rackShelfLen)} (${ft(rackShelfLen)})`], ['Rack post', '2" x 2"', String(rackPosts), `1.5 m (${ft(1.5)})`]] },
    },
    {
      title: 'Build the trellis wall',
      lines: [
        `Set ${Math.ceil(climbLen / POST_SPACING_M) + 1} posts, 2.4 m long, 40 cm deep, 1.2 m apart along the back edge (on hard floor, fix each post in a heavy bucket of sand and stones).`,
        'Lash a top bar at 1.8 m with tie wire. Hang the netting from the top bar to 10 cm above the planter soil.',
        'Brace each end post with a diagonal 1.2 m long. Keep the wall facing the sun for fruiting vines.',
      ],
    },
    {
      title: 'Build the planter, beds and rack',
      lines: [
        `Frame the planter (${mt(troughL)} x ${mt(troughW)}) and the ${centre.length} bed${centre.length > 1 ? 's' : ''} like the raised-bed design: two courses of 1" x 6" boards on 2" x 2" posts, ${mt(BED_HEIGHT_M)} high.`,
        `Rack: 4 posts ${mt(1.5)} high, ${rackTiers} shelves spaced 40 cm apart (at 0.3 m, 0.7 m and 1.1 m), each shelf two 1" x 6" boards laid side by side with a 1 cm gap. Put pots, bottle planters or trays on it.`,
      ],
    },
    { title: 'Fill and water', lines: [`Fill ${mt(MEDIA_DEPTH_M)} deep with ${Math.round(MIX.topsoil * 100)}% topsoil, ${Math.round(MIX.compost * 100)}% compost and ${Math.round(MIX.coco * 100)}% cocopeat. You need ${media.litres} L in total. Run drip lines along the planter and beds; hang bottle drippers over the rack.`] },
    {
      title: 'Plant',
      lines: ['Climbers go at the base of the trellis; leafy crops on the rack; the rest in the beds.'],
      table: { head: ['Crop', 'Where', 'Plants'], rows: plants.map((p) => [nameOf(p.itemId), p.itemId === troughItem ? 'Trellis planter' : p.itemId === rackItem ? 'Tiered rack' : 'Bed', String(p.count)]) },
    },
  ];
  return {
    id: 'vertical', title: 'Vertical and compact', tagline: 'A trellis wall, a tiered rack and two small beds. Grows up instead of out.',
    pros: ['Uses wall and air space, so it suits tiny yards', 'Climbers stay clean and easy to pick', 'Shaded floor stays free for walking'],
    cons: ['Grows fewer crop types than the full bed layout', 'Needs sturdy posts against wind'],
    structures, cutList: [...fw.cut, { part: 'Rack shelf board', section: '1" x 6"', qty: rackShelfBoards, lengthM: rackShelfLen }, { part: 'Rack post', section: '2" x 2"', qty: rackPosts, lengthM: 1.5 }], bom, steps, plants, growAreaSqm: r1(area),
    notes: ['This concept covers a smaller area than the full plan, so it grows fewer crops. Use it where space or budget is tight.'],
  };
}

export function generateDesigns(inp: DesignInput): BuildDesign[] {
  if (!bedsOf(inp.layout).length) return [];
  return [designRaised(inp), designContainers(inp), designVertical(inp)];
}

// ------------------------------------------------------------------ pricing
export interface Reuse { kind: 'recycled' | 'onsite'; recyclableId?: string; label: string; how: string; coverage: number }
export interface PricedLine extends BomLine {
  unitPrice: number;
  unitMin: number;
  unitMax: number;
  basis: PriceBasis;
  buyQty: number;
  fullCost: number;
  cost: number;
  reuse?: Reuse;
  overridden: boolean;
}
export interface PricedDesign {
  lines: PricedLine[];
  totalNew: number;
  total: number;
  saved: number;
  min: number;
  max: number;
  estimateShare: number;
}

const DISCRETE_UNITS = new Set(['pc', 'set', 'box', 'pack', 'roll']);

export function priceDesign(design: BuildDesign, opts: { overrides?: Record<string, number>; recyclables?: string[]; onSite?: string[] } = {}): PricedDesign {
  const overrides = opts.overrides ?? {};
  const have = (opts.recyclables ?? []).map((id) => recyclableById(id)).filter((r): r is NonNullable<typeof r> => !!r);
  const onSite = new Set(opts.onSite ?? []);
  const lines: PricedLine[] = [];
  for (const b of design.bom) {
    const m = materialById(b.materialId);
    if (!m) continue;
    const up = unitPrice(m, overrides);
    const overridden = Number.isFinite(overrides[m.id]) && overrides[m.id] > 0;
    let reuse: Reuse | undefined;
    if (onSite.has(m.id)) {
      reuse = { kind: 'onsite', label: 'Already on your site', how: 'You already have this, so there is nothing to buy.', coverage: 1 };
    } else {
      for (const r of have) {
        const c = r.covers.find((x) => x.materialId === m.id);
        if (c && c.coverage > 0 && (!reuse || c.coverage > reuse.coverage)) reuse = { kind: 'recycled', recyclableId: r.id, label: r.label, how: c.how, coverage: c.coverage };
      }
    }
    const cov = reuse?.coverage ?? 0;
    const raw = b.qty * (1 - cov);
    const buyQty = DISCRETE_UNITS.has(b.unit) ? Math.max(0, Math.ceil(raw - 1e-9)) + 0 : Math.max(0, r2(raw));
    const fullCost = b.qty * up;
    lines.push({
      ...b, unitPrice: up, unitMin: overridden ? up : m.min, unitMax: overridden ? up : m.max, basis: m.basis,
      buyQty, fullCost: r2(fullCost), cost: r2(buyQty * up), reuse, overridden,
    });
  }
  const totalNew = r2(lines.reduce((s, l) => s + l.fullCost, 0));
  const total = r2(lines.reduce((s, l) => s + l.cost, 0));
  const min = r2(lines.reduce((s, l) => s + l.buyQty * l.unitMin, 0));
  const max = r2(lines.reduce((s, l) => s + l.buyQty * l.unitMax, 0));
  const est = lines.filter((l) => l.basis === 'estimate').reduce((s, l) => s + l.cost, 0);
  return { lines, totalNew, total, saved: r2(totalNew - total), min, max, estimateShare: total > 0 ? Math.round((est / total) * 100) : 0 };
}
