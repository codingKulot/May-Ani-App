// Who is asking, and how much they may still use today.
//   * clientIp(req, trust): the caller's IP address. Behind a reverse proxy (Cloudflare Tunnel, Caddy, nginx, a hosting
//     platform) every request arrives from the proxy, so all users would share one address, one rate limit and one lockout.
//     With TRUST_PROXY set, the address is read from X-Forwarded-For instead: from the right, because anyone can type
//     whatever they like into the left part of that header.
//   * mongoCounters / memoryCounters: counters with an end time, shared by every copy of the server when kept in MongoDB.
//   * dailyQuota(limits, { counters }): counts paid AI uses (photo checks, pictures) per account, plus a total for the whole
//     server, per Philippine calendar day. Only logged-in users may use AI. In MongoDB the counts survive a restart.

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

// ------------------------------------------------------------------ counters shared by every copy of the server
// The limits that protect accounts and money must be the same for every copy of the server and survive a restart, so they
// are counted in MongoDB (collection `limits`: { _id: key, n, expiresAt }, removed by a TTL index once expired):
// the wrong-password lockout, "forgot password" emails per address, and the daily AI allowance.
// Every counter has an end time. A plain counter ends `ttlMs` after its first count; a `sliding` one `ttlMs` after its latest.
// An ended counter starts again from 0. All methods are async and give the same answers for both kinds of store.

/** Counters in MongoDB (the server's database from server/db.mjs). Each change is one atomic database update. */
export function mongoCounters(database, now = () => Date.now()) {
  const limits = database.collection('limits');
  database.index('limits', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expire' });
  return {
    /** Counts one more and answers the new count. */
    async add(key, { ttlMs, sliding = false }) {
      await database.ensureIndexes();
      const at = new Date(now());
      const end = new Date(at.getTime() + ttlMs);
      const live = { $gt: ['$expiresAt', at] }; // false for a new or ended counter: it starts again
      const update = [{ $set: { n: { $cond: [live, { $add: ['$n', 1] }, 1] }, expiresAt: sliding ? end : { $cond: [live, '$expiresAt', end] } } }];
      for (let attempt = 0; ; attempt++) {
        try {
          const doc = await limits.findOneAndUpdate({ _id: key }, update, { upsert: true, returnDocument: 'after' });
          return doc?.n ?? 1;
        } catch (e) {
          if (e?.code !== 11000 || attempt > 2) throw e; // two first counts at the same moment: the second one tries again
        }
      }
    },
    /** Takes one back (a use that was refused or cost nothing). Never below 0, and never on an ended counter. */
    async undo(key) {
      await limits.updateOne({ _id: key, expiresAt: { $gt: new Date(now()) }, n: { $gt: 0 } }, { $inc: { n: -1 } });
    },
    async count(key) {
      const doc = await limits.findOne({ _id: key, expiresAt: { $gt: new Date(now()) } });
      return doc?.n ?? 0;
    },
    async clear(key) {
      await limits.deleteOne({ _id: key });
    },
    /** Removes every counter whose key starts with `prefix` (letters, digits, ":" and "-" only). */
    async clearPrefix(prefix) {
      if (!/^[A-Za-z0-9:-]+$/.test(prefix)) throw new Error('clearPrefix: unsafe prefix');
      await limits.deleteMany({ _id: { $regex: `^${prefix}` } });
    },
  };
}

/** The same counters in this process's memory: for the unit tests (one copy of the server, starts empty). */
export function memoryCounters(now = () => Date.now()) {
  const all = new Map(); // key -> { n, expiresAt }
  const live = (key) => { const c = all.get(key); return c && c.expiresAt > now() ? c : undefined; };
  return {
    async add(key, { ttlMs, sliding = false }) {
      const c = live(key);
      const n = (c?.n ?? 0) + 1;
      all.set(key, { n, expiresAt: c && !sliding ? c.expiresAt : now() + ttlMs });
      return n;
    },
    async undo(key) {
      const c = live(key);
      if (c && c.n > 0) c.n--;
    },
    async count(key) {
      return live(key)?.n ?? 0;
    },
    async clear(key) {
      all.delete(key);
    },
    async clearPrefix(prefix) {
      for (const k of [...all.keys()]) if (k.startsWith(prefix)) all.delete(k);
    },
  };
}

// ------------------------------------------------------------------ daily allowance for paid AI
const DAY_KEEP_MS = 2 * 86_400_000; // a day's counters are kept a little longer than the day, then removed

/**
 * Daily allowance for one kind of paid use (`kind`: ai or pictures; only logged-in accounts may use AI). `limits`:
 * { account, total } uses per Philippine day (0 = none), counted in `counters` (shared by every copy of the server).
 * take(userId) answers { ok: true, release() } (release gives the use back, for failures that cost nothing) or
 * { ok: false, reason: 'total' | 'account', limit }. A use is counted first and given back when it went over the limit,
 * so two requests at the same moment can never both get the last one.
 */
export function dailyQuota(limits, { counters = memoryCounters(), kind = 'ai', now = () => Date.now() } = {}) {
  return {
    async take(userId) {
      const day = phDay(now());
      const total = `${kind}:${day}:total`;
      const mine = `${kind}:${day}:account:${userId}`;
      if ((await counters.add(total, { ttlMs: DAY_KEEP_MS })) > limits.total) {
        await counters.undo(total);
        return { ok: false, reason: 'total', limit: limits.total };
      }
      if ((await counters.add(mine, { ttlMs: DAY_KEEP_MS })) > limits.account) {
        await Promise.all([counters.undo(mine), counters.undo(total)]);
        return { ok: false, reason: 'account', limit: limits.account };
      }
      let released = false;
      return {
        ok: true,
        async release() {
          if (released) return;
          released = true;
          await Promise.all([counters.undo(mine), counters.undo(total)]);
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
