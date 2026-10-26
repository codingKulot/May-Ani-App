// Types for server/prices.mjs, so the TypeScript tests can import it (the server itself is plain JavaScript).

export type Row = [label: string, low: number, high: number, prevailing: number];
export interface Group { name: string; rows: Row[] }
export interface PriceList { asOf: string; area: Group[]; markets: { name: string; groups: Group[] }[] }
export interface KeptList extends PriceList { url: string; fetchedAt: string }

export const DA_BASE_URL: string;
export function bantayPresyoUrl(isoDay: string, base?: string): string;
export function manilaDay(now?: number): string;
export function itemGroup(label: string): string;
export function parseBantayPresyo(bytes: ArrayBuffer | Uint8Array): Promise<PriceList>;

type Log = { info(m: string): void; warn(m: string): void; error(m: string): void };
export function priceLists(o?: {
  database?: unknown; log?: Log; base?: string; everyMs?: number; retryMs?: number; lookBackDays?: number; timeoutMs?: number; tries?: number;
  fetchImpl?: typeof fetch; now?: () => number;
}): { load(): Promise<KeptList | null>; refresh(): Promise<boolean>; latest(): KeptList | null; start(): void; stop(): void };
export function priceRoutes(lists: ReturnType<typeof priceLists>, kit: { json(res: any, status: number, body: unknown): void }): Record<string, (req: any, res: any) => Promise<void>>;
