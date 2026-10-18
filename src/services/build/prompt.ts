import type { BuildDesign, Structure, Surface } from './designs';

/**
 * The text sent to the image model together with the user's photo. Built from the design's real numbers
 * (bed sizes, counts, crops, materials), so the picture shows what the materials list and the build steps describe.
 * Pure and deterministic. Limited to MAX_PROMPT characters; the server enforces the same limit.
 */
export const MAX_PROMPT = 2400;

export interface PromptInput {
  design: BuildDesign;
  surface: Surface;
  nameOf: (itemId: string) => string;
  /** plain names of the things the user chose to reuse, e.g. "wooden pallets" */
  reuse: string[];
  /** plain names of things already on the site, e.g. "shade net" */
  onSite: string[];
}

const m = (n: number) => `${Math.round(n * 100) / 100} m`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

function describeStructures(ss: Structure[]): string[] {
  const out: string[] = [];
  const beds = ss.filter((s): s is Extract<Structure, { type: 'bed' }> => s.type === 'bed');
  const groups = new Map<string, { n: number; w: number; l: number; h: number }>();
  for (const b of beds) {
    const k = `${m(b.w)}|${m(b.l)}|${m(b.h)}`;
    const g = groups.get(k);
    if (g) g.n++; else groups.set(k, { n: 1, w: b.w, l: b.l, h: b.h });
  }
  for (const g of groups.values()) out.push(`${plural(g.n, 'raised garden bed')} with a wooden frame, each ${m(g.w)} wide, ${m(g.l)} long and ${m(g.h)} high, filled with dark soil`);
  const bags = ss.filter((s): s is Extract<Structure, { type: 'bag' }> => s.type === 'bag');
  if (bags.length) out.push(`${plural(bags.length, 'black fabric grow bag')}, each about ${m(bags[0].r * 2)} across and ${m(bags[0].h)} high, in tidy rows`);
  const trellis = ss.filter((s) => s.type === 'trellis');
  if (trellis.length) out.push(`${plural(trellis.length, 'trellis')} made of bamboo poles with white net, about ${m((trellis[0] as Extract<Structure, { type: 'trellis' }>).h)} high, with climbing vines on it`);
  const racks = ss.filter((s): s is Extract<Structure, { type: 'rack' }> => s.type === 'rack');
  for (const r of racks) out.push(`a vertical rack with ${r.tiers} tiers, ${m(r.w)} wide, ${m(r.d)} deep and ${m(r.h)} high, holding small pots and planters`);
  return out;
}

export function buildImagePrompt(i: PromptInput): string {
  const { design } = i;
  const crops = design.plants.map((p) => i.nameOf(p.itemId)).filter(Boolean);
  const parts = [
    'Edit this photograph of a real backyard in the Philippines. Keep the camera angle, perspective, ground, walls, fences, sky, lighting and everything already in the photo exactly as it is.',
    `Add a finished, healthy small vegetable garden using the "${design.title}" design: ${describeStructures(design.structures).join('; ')}.`,
    crops.length ? `The plants growing are ${list([...new Set(crops)])}, shown as leafy, realistic, well spaced plants.` : '',
    i.surface === 'hard' ? 'The garden stands directly on the existing concrete or tiles.' : i.surface === 'gravel' ? 'The garden stands on the existing gravel.' : 'The garden stands on the existing soil or grass.',
    design.bom.some((b) => b.materialId === 'shade_net') || i.onSite.includes('shade net') ? 'A green shade net is stretched above the garden on poles.' : '',
    design.bom.some((b) => b.materialId === 'drip_kit') ? 'A thin black drip irrigation line runs along the rows.' : '',
    i.reuse.length ? `Frames and containers look homemade, partly built from reused materials such as ${list(i.reuse)}.` : '',
    i.onSite.length ? `Keep these existing items in place: ${list(i.onSite)}.` : '',
    'Photorealistic, natural daylight, correct scale and perspective, objects resting on the ground with soft contact shadows, same color grading as the original photo.',
    'Do not add people, animals, text, labels, logos, watermarks or measurement lines. Do not change or remove anything else in the scene.',
  ];
  return parts.filter(Boolean).join(' ').slice(0, MAX_PROMPT);
}
