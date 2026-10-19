// Small HTTP building blocks shared by every part of the server: JSON answers, CORS, reading a request body with a size
// limit, the per-minute rate limiter, security headers, request ids and the log.

import { randomBytes } from 'node:crypto';
import { clientIp } from './limits.mjs';

export const MAX_BODY = 12 * 1024 * 1024; // a few downscaled photos; routes without photos pass a much smaller limit

// ------------------------------------------------------------------ log
/**
 * The server log. "text" (the default) prints plain sentences for a person reading the terminal. "json" prints one JSON object
 * per line, which hosting platforms and log tools can search and count. Messages never contain keys, passwords or tokens.
 */
export function makeLog({ format = 'text', instance = '' } = {}) {
  const line = (level, msg, extra) => {
    if (format === 'json') {
      const out = JSON.stringify({ time: new Date().toISOString(), level, msg, instance, ...extra });
      (level === 'error' || level === 'warn' ? console.error : console.log)(out);
    } else if (level === 'error' || level === 'warn') console.error(msg);
    else console.log(msg);
  };
  return {
    format,
    info: (msg, extra) => line('info', msg, extra),
    warn: (msg, extra) => line('warn', msg, extra),
    error: (msg, extra) => line('error', msg, extra),
  };
}

// ------------------------------------------------------------------ answers and request bodies
export function httpKit({ allowedOrigin = '*', trust = { mode: 'off' } } = {}) {
  const cors = () => ({
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });

  const json = (res, code, body, extra = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors(), ...extra });
    res.end(JSON.stringify(body));
  };

  /** The request body as JSON. A body over `max` bytes is a 413, broken JSON a 400. */
  async function readJson(req, max = MAX_BODY) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > max) throw Object.assign(new Error('Request too large'), { status: 413 });
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  }

  // Per IP and bucket, in this server's memory on purpose: it is the first guard against floods and must not cost a database
  // call. With several copies of the server each copy counts on its own; the limits that protect accounts and money
  // (login lockout, reset emails, daily AI allowance) are shared in MongoDB instead (see server/limits.mjs).
  const hits = new Map();
  function limited(req, bucket, max, windowMs = 60_000) {
    const key = `${bucket}:${clientIp(req, trust)}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return false; }
    h.n++;
    return h.n > max;
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > 120_000) hits.delete(k); }, 60_000);
  sweep.unref?.();

  return { json, cors, readJson, limited, stop: () => clearInterval(sweep) };
}

// ------------------------------------------------------------------ security headers
/**
 * Sent with every answer: they tell the browser what this site may do, so an injected script, a page that frames the app, or a
 * mislabelled file can do much less harm. The app's own outside services: Open-Meteo (weather, places), USGS (earthquakes),
 * OpenStreetMap tiles (map). "https:" in connect-src allows a market price feed or server address set in Settings.
 * A new outside service in the app must be added here.
 */
export function securityHeaders(appUrl) {
  const https = appUrl.startsWith('https:');
  return {
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob: https://tile.openstreetmap.org",
      "connect-src 'self' https:", "font-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'",
      "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", ...(https ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Other sites see only "may-ani.example", never the page or anything after it (OpenStreetMap needs at least that much).
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Only on a real website with HTTPS: browsers then refuse plain http for this site for 180 days.
    ...(https ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
  };
}

// ------------------------------------------------------------------ request ids and the request log
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * An id for one request, sent back as X-Request-Id and written in the log, so a problem someone reports can be found.
 * Behind a trusted proxy the proxy's own id is kept (when it looks like an id), so both logs match.
 */
export function requestId(req, trust) {
  const given = String(req.headers['x-request-id'] ?? '');
  return trust.mode !== 'off' && REQUEST_ID.test(given) ? given : randomBytes(8).toString('hex');
}

const SLOW_MS = 10_000;

/**
 * Writes one line per API request when it ends. "json" logs every API request; "text" (a person reading the terminal) only
 * server errors and slow requests. The path is written WITHOUT the part after "?": the chat stream ticket travels there.
 */
export function logRequest(log, req, res, path, id, started) {
  if (!path.startsWith('/api/')) return;
  res.on('close', () => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const stream = path === '/api/chat/stream';
    if (log.format === 'json') {
      log[status >= 500 ? 'error' : 'info']('request', { id, method: req.method, path, status, ms, ...(res.writableFinished ? {} : { aborted: true }) });
    } else if (status >= 500 || (ms > SLOW_MS && !stream)) {
      log[status >= 500 ? 'error' : 'warn'](`${status >= 500 ? 'Server error' : 'Slow request'}: ${req.method} ${path} answered ${status} after ${ms} ms (request ${id}).`);
    }
  });
}
