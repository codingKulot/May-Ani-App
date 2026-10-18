// Who is asking, and how much they may still use today.
//   * clientIp(req, trust): the caller's IP address. Behind a reverse proxy (Cloudflare Tunnel, Caddy, nginx, a hosting
//     platform) every request arrives from the proxy, so all users would share one address, one rate limit and one lockout.
//     With TRUST_PROXY set, the address is read from X-Forwarded-For instead: from the right, because anyone can type
//     whatever they like into the left part of that header.
//   * dailyQuota(limits): counts paid AI uses (photo checks, pictures) per account, per guest phone and per guest IP address,
//     plus a total for the whole server, per Philippine calendar day. Kept in memory: restarting the server starts the counts again.

const norm = (ip) => {
  const s = String(ip ?? '').trim().slice(0, 64);
  return s.startsWith('::ffff:') ? s.slice(7) : s; // an IPv4 address seen through IPv6
};
const LOOPBACK = ['127.0.0.1', '::1'];

/**
 * TRUST_PROXY from .env:
 *   empty / off   the server is reached directly (the default): X-Forwarded-For is ignored
 *   loopback      a proxy on this same computer (Cloudflare Tunnel, Caddy, nginx)
 *   1, 2, ...     that many proxies always stand in front (hosting platforms whose proxy addresses change). Only when the
 *                 server cannot be reached around the proxy, or anyone could fake their address.
 *   a list        the proxies' own IP addresses, comma-separated (may include "loopback")
 */
export function parseTrustProxy(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s || s === 'off' || s === 'false' || s === '0') return { mode: 'off' };
  if (/^\d+$/.test(s)) return { mode: 'hops', hops: Math.min(Number(s), 10) };
  const ips = new Set();
  for (const part of s.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part === 'loopback') LOOPBACK.forEach((ip) => ips.add(ip));
    else ips.add(norm(part));
  }
  return { mode: 'ips', ips };
}

export const describeTrust = (t) => (t.mode === 'off' ? '' : t.mode === 'hops' ? `${t.hops} in front` : [...t.ips].join(', '));

/** The caller's IP address (see parseTrustProxy). */
export function clientIp(req, trust = { mode: 'off' }) {
  const peer = norm(req.socket?.remoteAddress) || 'unknown';
  if (trust.mode === 'off') return peer;
  const fwd = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map(norm).filter(Boolean).slice(-20);
  // With N proxies in front the header holds at least N addresses; fewer means the request did not come through them all.
  if (trust.mode === 'hops') return fwd.length >= trust.hops ? fwd[fwd.length - trust.hops] : peer;
  if (!trust.ips.has(peer)) return peer; // not sent by our proxy, so the header may be made up
  for (let i = fwd.length - 1; i >= 0; i--) if (!trust.ips.has(fwd[i])) return fwd[i];
  return fwd[0] || peer;
}

/** Today's date in the Philippines (UTC+8, no daylight saving time): daily limits start again at midnight there. */
export const phDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * Daily allowance for one kind of paid use. `limits`: { guest, guestPerIp, account, total } uses per day (0 = none).
 * take(who) with who = { userId } for a logged-in account, or { device, ip } for a guest (device may be '').
 * Answers { ok: true, release() } (release gives the use back, for failures that cost nothing) or
 * { ok: false, reason: 'total' | 'account' | 'device' | 'ip', limit }.
 */
export function dailyQuota(limits, now = () => Date.now()) {
  let day = phDay(now());
  const used = new Map();
  const count = (k) => used.get(k) ?? 0;
  const roll = () => {
    const d = phDay(now());
    if (d !== day) { day = d; used.clear(); }
  };
  return {
    take(who) {
      roll();
      const checks = who.userId
        ? [[`account:${who.userId}`, limits.account, 'account']]
        : [[`device:${who.device || `ip:${who.ip}`}`, limits.guest, 'device'], [`ip:${who.ip}`, limits.guestPerIp, 'ip']];
      if (count('total') >= limits.total) return { ok: false, reason: 'total', limit: limits.total };
      for (const [key, limit, reason] of checks) if (count(key) >= limit) return { ok: false, reason, limit };
      const keys = ['total', ...checks.map(([key]) => key)];
      for (const k of keys) used.set(k, count(k) + 1);
      const takenOn = day;
      let released = false;
      return {
        ok: true,
        release() {
          if (released || takenOn !== day) return;
          released = true;
          for (const k of keys) used.set(k, Math.max(0, count(k) - 1));
        },
      };
    },
  };
}

/** A whole number of uses per day from .env: missing, empty or nonsense gives the default; 0 is allowed (none). */
export function envCount(env, name, fallback) {
  const raw = String(env[name] ?? '').trim();
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 0 ? n : fallback;
}
