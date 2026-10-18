/**
 * Building-materials price catalog (PHP).
 *
 * Honesty rules for this file:
 *  - `basis: 'sourced'` means the range comes from a published Philippine price list that is cited in `sources`.
 *    Those lists are quarterly national averages (VAT-exclusive, pick-up), not today's quote at your store.
 *  - `basis: 'estimate'` means no verifiable Philippine price source was found for that garden-specific item.
 *    The range is a typical retail range and the UI labels it so. Users can override any price ("my price").
 *  - Nothing here is a live feed. `PRICES_AS_OF` tells the user how old the sourced data is.
 */

export interface PriceSource { name: string; url: string; asOf: string }
export type PriceBasis = 'sourced' | 'estimate';

export interface Material {
  id: string;
  name: string;
  /** what one priced unit is, e.g. "bd.ft", "pc", "kg" */
  unit: string;
  min: number;
  max: number;
  basis: PriceBasis;
  sources?: PriceSource[];
  note?: string;
}

export const SRC_PHILCON: PriceSource = {
  name: 'PhilCon Prices: Construction Material Prices Philippines 2026 (Q1 2026, national average, VAT-exclusive, pick-up)',
  url: 'https://philconprices.com/construction-material-prices/',
  asOf: 'Q1 2026',
};
export const SRC_PROJECTCOSTING: PriceSource = {
  name: 'ProjectCostingPh: Material Price List (updated Mar 2026)',
  url: 'https://projectcostingph.com/material-price-list/',
  asOf: 'Mar 2026',
};
export const SRC_PSA_INDEX: PriceSource = {
  name: 'PSA: Construction Materials Retail Price Index, June 2026 (+1.8% year-on-year)',
  url: 'https://psa.gov.ph/content/construction-materials-retail-price-index-national-capital-region-2012100-june-2026',
  asOf: 'Jun 2026',
};

export const PRICES_AS_OF = 'Q1 2026 (construction items) · typical retail ranges (garden items)';
export const PRICE_FRESHNESS_NOTE =
  'The PSA reports construction-material retail prices rose only about 1.8% from a year earlier (June 2026), so the Q1 2026 lists are still a close guide. Garden-specific items are estimates. Always confirm with your local hardware or garden store, and enter "my price" where you have a quote.';

const EST = 'No verified Philippine price list found for this item. Typical retail range; confirm at your local store.';

export const MATERIALS: Material[] = [
  // ---- sourced: construction items ----
  { id: 'lumber_coco', name: 'Coco lumber (framing)', unit: 'bd.ft', min: 34.73, max: 38.32, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING], note: 'Cheapest; shorter life outdoors. Good lumber lasts longer.' },
  { id: 'lumber_good', name: 'Good lumber (framing)', unit: 'bd.ft', min: 70, max: 76.63, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING] },
  { id: 'pvc_half', name: 'PVC pipe 1/2" (usually 3 m)', unit: 'pc', min: 86.6, max: 106.34, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING], note: 'The source lists the price per pipe length without stating it; 3 m is the usual length.' },
  { id: 'tie_wire', name: 'GI tie wire #16', unit: 'kg', min: 87.22, max: 108, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING] },
  { id: 'nails', name: 'Common wire nails, assorted', unit: 'kg', min: 87.49, max: 102.67, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING] },
  { id: 'screws_2in', name: 'Tek screws 2" (box of 50)', unit: 'box', min: 89.29, max: 89.29, basis: 'sourced', sources: [SRC_PROJECTCOSTING], note: 'Single source.' },
  { id: 'sand', name: 'Sand', unit: 'cu.m', min: 1116.67, max: 1926.67, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING], note: 'Delivery is extra.' },
  { id: 'gravel', name: 'Natural gravel', unit: 'cu.m', min: 856, max: 1291, basis: 'sourced', sources: [SRC_PHILCON, SRC_PROJECTCOSTING], note: 'Delivery is extra.' },
  { id: 'bamboo_stake', name: 'Bamboo stake (1.52 m)', unit: 'pc', min: 14.43, max: 15.33, basis: 'sourced', sources: [SRC_PHILCON] },
  { id: 'poly_sheet', name: 'Polyethylene sheet (plastic cover)', unit: 'lm', min: 49.28, max: 52.32, basis: 'sourced', sources: [SRC_PHILCON], note: 'Price per linear metre.' },

  // ---- estimates: garden-specific items ----
  { id: 'grow_bag', name: 'Grow bag 12" (about 19 L)', unit: 'pc', min: 10, max: 30, basis: 'estimate', note: EST },
  { id: 'topsoil', name: 'Garden topsoil / loam', unit: 'cu.m', min: 900, max: 1800, basis: 'estimate', note: EST },
  { id: 'compost', name: 'Compost / vermicast', unit: 'kg', min: 10, max: 25, basis: 'estimate', note: EST },
  { id: 'cocopeat', name: 'Cocopeat (compressed)', unit: 'kg', min: 20, max: 40, basis: 'estimate', note: EST },
  { id: 'shade_net', name: 'Shade net 50%', unit: 'sqm', min: 25, max: 60, basis: 'estimate', note: EST },
  { id: 'trellis_net', name: 'Trellis netting (1.8 m wide)', unit: 'lm', min: 8, max: 20, basis: 'estimate', note: EST },
  { id: 'bamboo_pole', name: 'Bamboo pole (about 3 m)', unit: 'pc', min: 40, max: 100, basis: 'estimate', note: EST },
  { id: 'drip_kit', name: 'Drip irrigation kit (about 10 m)', unit: 'set', min: 250, max: 650, basis: 'estimate', note: EST },
  { id: 'garden_hose', name: 'Garden hose 1/2" (15 m)', unit: 'pc', min: 350, max: 800, basis: 'estimate', note: EST },
  { id: 'drum_200l', name: 'Plastic drum 200 L (water storage)', unit: 'pc', min: 1300, max: 2500, basis: 'estimate', note: EST },
  { id: 'seeds', name: 'Vegetable seeds (1 pack)', unit: 'pack', min: 20, max: 70, basis: 'estimate', note: EST },
  { id: 'twine', name: 'Nylon twine', unit: 'roll', min: 40, max: 90, basis: 'estimate', note: EST },
];

const byId = new Map(MATERIALS.map((m) => [m.id, m]));
export const materialById = (id: string): Material | undefined => byId.get(id);

export const midPrice = (m: Material) => Math.round(((m.min + m.max) / 2) * 100) / 100;

/** The unit price used in totals: the user's own price if they set one, else the middle of the range. */
export function unitPrice(m: Material, overrides: Record<string, number> = {}): number {
  const o = overrides[m.id];
  return Number.isFinite(o) && o > 0 ? o : midPrice(m);
}
