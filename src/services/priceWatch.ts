import { BUNDLED_NCR, WATCH_BULLETINS, WATCH_MARKETS, ncrWatch } from '@/data/priceWatch';
import type { NcrList, WatchBulletin, WatchMarket, WatchRow } from '@/data/priceWatch';
import { call } from '@/services/ai';
import { daysBetween, isoDate } from '@/lib/format';
import { haversineKm } from '@/lib/geo';
import type { LatLon } from '@/lib/geo';
import type { Sector } from '@/types';

/**
 * Prices at the DA-checked public market nearest the user (Sourced, from DA Price Watch bulletins in `data/priceWatch.ts`).
 * Not live: each bulletin has its own date, and the app always says how old it is.
 */

/** Markets farther than this are not shown: their prices say little about the user's own market. */
export const NEARBY_KM = 150;
/** Older than this, the app warns that prices have probably moved. */
export const FRESH_DAYS = 14;

export interface NearbyMarket {
  market: WatchMarket;
  km: number;
  bulletin: WatchBulletin;
}

/** The newest bulletin of a market (bulletins may be added over time), or undefined. */
export function latestBulletin(marketId: string, bulletins: WatchBulletin[] = WATCH_BULLETINS): WatchBulletin | undefined {
  return bulletins.filter((b) => b.market === marketId).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
}

/** DA-checked markets within `NEARBY_KM` of the user, nearest first. Only markets with a bulletin. */
export function nearbyMarkets(at: LatLon, maxKm = NEARBY_KM, markets: WatchMarket[] = WATCH_MARKETS, bulletins: WatchBulletin[] = WATCH_BULLETINS): NearbyMarket[] {
  return markets
    .map((market) => ({ market, km: haversineKm(at, market), bulletin: latestBulletin(market.id, bulletins)! }))
    .filter((m) => m.bulletin && m.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}

/** Every place with a DA-checked market, for the "not covered yet" message. */
export const coveredPlaces = (markets: WatchMarket[] = WATCH_MARKETS): string[] => [...markets.filter((m) => !m.area && !m.id.startsWith('ncr')).map((m) => m.place), 'Metro Manila (34 markets)'];

/** Whole days since the bulletin's date (0 = today). */
export function bulletinAgeDays(b: Pick<WatchBulletin, 'asOf'>, today = isoDate()): number {
  return Math.max(0, daysBetween(b.asOf, today));
}

/** "today", "3 days old", "about 5 months old". */
export function ageLabel(days: number): string {
  if (days <= 0) return 'from today';
  if (days === 1) return '1 day old';
  if (days < 30) return `${days} days old`;
  const months = Math.round(days / 30.4);
  return months <= 1 ? 'about 1 month old' : months < 12 ? `about ${months} months old` : 'more than a year old';
}

/** The unit DA uses: eggs are priced per piece; cooking oil per bottle (the size is in the label, or not printed); everything else per kilo. */
export function rowUnit(label: string): 'piece' | 'kg' | '' {
  if (/^chicken egg/i.test(label)) return 'piece';
  if (/\boil\b/i.test(label)) return '';
  return 'kg';
}

/** The markets shown for the user's location: the 3 nearest DA-checked markets within `NEARBY_KM`. */
export const TOP_MARKETS = 3;
export const topMarkets = (at: LatLon, markets?: WatchMarket[], bulletins?: WatchBulletin[]): NearbyMarket[] =>
  nearbyMarkets(at, NEARBY_KM, markets, bulletins).filter((m) => !m.market.area).slice(0, TOP_MARKETS);

/** An area-wide list (DA Bantay Presyo, Metro Manila) within reach of the user, shown next to the top markets. */
export const nearbyArea = (at: LatLon, markets?: WatchMarket[], bulletins?: WatchBulletin[]): NearbyMarket | undefined =>
  nearbyMarkets(at, NEARBY_KM, markets, bulletins).find((m) => m.market.area);

/** Every DA list the app has: DA Davao's bulletins plus the Metro Manila list (the server's newest, else the bundled copy). */
export function watchData(ncr: NcrList = BUNDLED_NCR): { markets: WatchMarket[]; bulletins: WatchBulletin[] } {
  const n = ncrWatch(ncr);
  return { markets: [...WATCH_MARKETS, ...n.markets], bulletins: [...WATCH_BULLETINS, ...n.bulletins] };
}

const isList = (j: any): j is NcrList => typeof j?.asOf === 'string' && Array.isArray(j?.area) && Array.isArray(j?.markets);

/**
 * The newest Metro Manila list: the server's (it reads DA's PDF every few hours) when it is reachable and newer than the bundled
 * copy, else the bundled copy. Never fails.
 */
export async function loadNcrList(): Promise<NcrList> {
  try {
    const j = await call<unknown>('/api/prices/ncr', undefined, 8000);
    if (isList(j) && j.asOf > BUNDLED_NCR.asOf) return j;
  } catch { /* offline or no list on the server yet: the bundled copy */ }
  return BUNDLED_NCR;
}

/** The app's four farm types, plus "other" for sugar and cooking oil. */
export type PriceCategory = Sector | 'other';

/** Which of the app's categories a DA group belongs to (rice, corn, legumes, vegetables and spices are crops). */
export function groupCategory(groupName: string): PriceCategory {
  const g = groupName.toLowerCase();
  if (g.includes('fruit')) return 'fruits';
  if (g.includes('fish')) return 'fish';
  if (g.includes('livestock') || g.includes('poultry')) return 'livestock';
  if (g.includes('other')) return 'other';
  return 'crops';
}

/**
 * Which DA row stands for a catalog item, best match first. Only where they are the same thing sold the same way
 * (lettuce is left out: DA checks iceberg lettuce, the catalog means leaf lettuce; broiler retail is the dressed whole chicken).
 */
const ITEM_ROWS: Record<string, RegExp[]> = {
  ampalaya: [/^ampalaya$/i, /^bittergourd \(ampalaya\)$/i],
  talong: [/^eggplant( \(talong\))?$/i],
  kamatis: [/^tomato( \(kamatis\))?$/i],
  sitaw: [/^(pole )?sitao$/i, /^string beans \(sitao\)$/i],
  pechay: [/^(native pechay|pechay native|pechay tagalog)$/i],
  sili: [/^chill?i \(red(, local)?\)(, local)?$/i, /^chili \(siling labuyo\)$/i, /^red chili \(local\)$/i],
  corn: [/^corn \(yellow\)$/i],
  rice: [/^local rice, regular milled$/i, /^regular milled \(local\)$/i],
  tilapia: [/^tilapia$/i],
  bangus: [/^bangus, medium$/i, /^bangus, large$/i, /^milkfish \(bangus\)$/i, /^bangus$/i],
  broiler: [/^(fresh )?whole chicken(, local)?$/i],
  banana: [/^banana \(lakatan\)$/i],
  mango: [/^mango \((carabao|cebu)\)$/i],
  papaya: [/^papaya$/i],
  calamansi: [/^calamansi$/i],
  watermelon: [/^watermelon$/i],
};

export interface ItemRange {
  label: string;
  low: number;
  high: number;
  prevailing: number;
}

/** The DA range for a catalog item in this bulletin, or null when DA does not check it there. */
export function itemRange(itemId: string, b: WatchBulletin): ItemRange | null {
  const rows: WatchRow[] = b.groups.flatMap((g) => g.rows);
  for (const re of ITEM_ROWS[itemId] ?? []) {
    const r = rows.find(([label]) => re.test(label));
    if (r) return { label: r[0], low: r[1], high: r[2], prevailing: r[3] };
  }
  return null;
}

/** "₱90–₱100", or one price when low and high are the same. Centavos only where DA used them (eggs). */
export function rangeText(low: number, high: number): string {
  const p = (n: number) => `₱${Number.isInteger(n) ? n.toLocaleString('en-PH') : n.toFixed(2)}`;
  return low === high ? p(low) : `${p(low)}–${p(high)}`;
}
