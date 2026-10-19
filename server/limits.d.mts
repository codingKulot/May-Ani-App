// Types for server/limits.mjs, so the TypeScript tests can import it (the server itself is plain JavaScript).

export type Trust = { mode: 'off' } | { mode: 'hops'; hops: number } | { mode: 'ips'; ips: Set<string> };
export function parseTrustProxy(value: string | undefined): Trust;
export function describeTrust(t: Trust): string;
export function clientIp(req: { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }, trust?: Trust): string;
export function phDay(now?: number): string;

export interface Counters {
  add(key: string, o: { ttlMs: number; sliding?: boolean }): Promise<number>;
  undo(key: string): Promise<void>;
  count(key: string): Promise<number>;
  clear(key: string): Promise<void>;
}
export function memoryCounters(now?: () => number): Counters;
export function mongoCounters(database: unknown, now?: () => number): Counters;

export interface Limits { account: number; total: number }
export type Ticket = { ok: true; release(): Promise<void> } | { ok: false; reason: 'total' | 'account'; limit: number };
export function dailyQuota(limits: Limits, o?: { counters?: Counters; kind?: string; now?: () => number }): { take(userId: string): Promise<Ticket> };
export function envCount(env: Record<string, string | undefined>, name: string, fallback: number): number;
