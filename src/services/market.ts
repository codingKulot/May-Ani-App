import { allItems } from '@/data/catalog';
import type { MarketPrice, MarketSnapshot, Settings } from '@/types';

/**
 * Market prices - IMPORTANT: there is no free, stable public API for live Philippine farm-gate
 * prices, so this module is built around a provider seam:
 *
 *   1. A "feed" provider: set Settings -> Market feed URL to any JSON endpoint returning
 *        { "asOf": "2026-10-17", "label": "DA Bantay Presyo (Nueva Ecija)",
 *          "prices": [{ "itemId": "talong", "retailPerKg": 90, "farmGatePerKg": 48, "trend7d": 2.5 }] }
 *      (item ids = data/catalog.ts). Use it with a scraper/ETL of DA Bantay Presyo or your own survey.
 *   2. Reference estimates (bundled) used when no feed is configured - clearly labelled NOT LIVE.
 *   3. Manual overrides: users can type the prices they actually see in their local market.
 */

// retail = typical wet-market price; farm-gate = what a grower typically receives (PHP/kg).
// Livestock farm-gate is live weight; retail is dressed meat / eggs.
const REFERENCE: Record<string, [retail: number, farmGate: number]> = {
  kangkong: [40, 22], pechay: [60, 35], lettuce: [160, 90], sitaw: [90, 50], okra: [80, 45],
  patola: [70, 40], talong: [85, 45], ampalaya: [110, 60], kamatis: [80, 40], sili: [220, 120],
  corn: [28, 14], rice: [50, 20], tilapia: [160, 110], hito: [170, 110], bangus: [190, 150],
  ulang: [700, 450], native_chicken: [320, 220], broiler: [190, 95], itik: [170, 130], goat: [450, 180],
};

export function referenceSnapshot(): MarketSnapshot {
  return {
    asOf: '',
    source: 'reference',
    sourceLabel: 'Planning reference estimates (not live prices)',
    prices: allItems().map((c) => {
      const [retail, farm] = REFERENCE[c.id] ?? [c.farmGatePerKg * 1.6, c.farmGatePerKg];
      return { itemId: c.id, retailPerKg: retail, farmGatePerKg: farm, trend7d: 0 };
    }),
  };
}

export function parseFeed(j: any): MarketSnapshot {
  const list: any[] = Array.isArray(j?.prices) ? j.prices : [];
  const prices: MarketPrice[] = list
    .filter((p) => typeof p?.itemId === 'string' && Number(p.retailPerKg) > 0 && Number(p.farmGatePerKg) > 0)
    .map((p) => ({
      itemId: p.itemId,
      retailPerKg: Number(p.retailPerKg),
      farmGatePerKg: Number(p.farmGatePerKg),
      trend7d: Number.isFinite(Number(p.trend7d)) ? Number(p.trend7d) : 0,
    }));
  if (prices.length === 0) throw new Error('Feed has no usable prices');
  return {
    asOf: String(j.asOf ?? ''),
    source: 'feed',
    sourceLabel: String(j.label ?? 'Custom market feed'),
    prices,
  };
}

export function applyOverrides(
  snap: MarketSnapshot,
  overrides: Record<string, { retailPerKg?: number; farmGatePerKg?: number }>,
): MarketSnapshot {
  const hasAny = Object.keys(overrides).length > 0;
  return {
    ...snap,
    source: hasAny && snap.source === 'reference' ? 'manual' : snap.source,
    prices: snap.prices.map((p) => {
      const o = overrides[p.itemId];
      return o ? { ...p, retailPerKg: o.retailPerKg ?? p.retailPerKg, farmGatePerKg: o.farmGatePerKg ?? p.farmGatePerKg } : p;
    }),
  };
}

export async function loadMarket(settings: Pick<Settings, 'marketFeedUrl'>, signal?: AbortSignal): Promise<{ snapshot: MarketSnapshot; error?: string }> {
  if (!settings.marketFeedUrl.trim()) return { snapshot: referenceSnapshot() };
  try {
    const res = await fetch(settings.marketFeedUrl.trim(), { signal });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    return { snapshot: parseFeed(await res.json()) };
  } catch (e) {
    return { snapshot: referenceSnapshot(), error: `Could not load your market feed (${(e as Error).message}). Showing reference estimates instead.` };
  }
}

export interface PriceGap {
  gapPesos: number;
  /** share of the retail price that reaches the grower */
  farmerSharePct: number;
}

export function priceGap(p: Pick<MarketPrice, 'retailPerKg' | 'farmGatePerKg'>): PriceGap {
  return {
    gapPesos: Math.max(0, p.retailPerKg - p.farmGatePerKg),
    farmerSharePct: p.retailPerKg > 0 ? Math.round((p.farmGatePerKg / p.retailPerKg) * 100) : 0,
  };
}

/** What a sale is worth at several outlets, for the "where should I sell" helper. */
export function sellingOptions(p: MarketPrice, kg: number) {
  const direct = p.farmGatePerKg + (p.retailPerKg - p.farmGatePerKg) * 0.4; // direct-to-consumer captures part of the gap
  return [
    { label: 'Farm-gate / trader', perKg: p.farmGatePerKg, total: p.farmGatePerKg * kg },
    { label: 'Direct to carinderia / store', perKg: Math.round(direct), total: Math.round(direct) * kg },
    { label: 'Retail (own stall / online)', perKg: p.retailPerKg, total: p.retailPerKg * kg },
  ];
}
