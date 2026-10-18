// Types for server/limits.mjs, so the TypeScript tests can import it (the server itself is plain JavaScript).

export type Trust = { mode: 'off' } | { mode: 'hops'; hops: number } | { mode: 'ips'; ips: Set<string> };
export function parseTrustProxy(value: string | undefined): Trust;
export function describeTrust(t: Trust): string;
export function clientIp(req: { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }, trust?: Trust): string;
export function phDay(now?: number): string;

export interface Limits { account: number; total: number }
export type Ticket = { ok: true; release(): void } | { ok: false; reason: 'total' | 'account'; limit: number };
export function dailyQuota(limits: Limits, now?: () => number): { take(userId: string): Ticket };
export function envCount(env: Record<string, string | undefined>, name: string, fallback: number): number;
