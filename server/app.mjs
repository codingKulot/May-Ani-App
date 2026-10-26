// Puts the server together from its parts and runs it. server/index.mjs starts it; tests can create one in their own process.
//   server/config.mjs  settings          server/http.mjs   answers, limits, headers, log     server/db.mjs  MongoDB
//   server/auth.mjs    accounts           server/reset.mjs  "forgot your password?"            server/mail.mjs email
//   server/sync.mjs    farm data sync     server/ai.mjs     Claude                              server/images.mjs pictures
//   server/chat.mjs    chat               server/static.mjs the built app                       server/limits.mjs counters
// Everything that must be the same for every copy of the server is in MongoDB, so several copies can run side by side behind
// a load balancer (see docs/ARCHITECTURE.md). Each copy keeps only its own live chat connections and per-minute limits.

import http from 'node:http';
import { accountStore, authRoutes } from './auth.mjs';
import { aiRoutes, allowance } from './ai.mjs';
import { chatService } from './chat.mjs';
import { dbProblem, openDatabase } from './db.mjs';
import { httpKit, logRequest, makeLog, requestId, securityHeaders } from './http.mjs';
import { imageProvider, imageRoutes } from './images.mjs';
import { dailyQuota, describeTrust, memoryCounters, mongoCounters } from './limits.mjs';
import { mailProblem, openMailer } from './mail.mjs';
import { resetRoutes } from './reset.mjs';
import { staticFiles } from './static.mjs';
import { syncRoutes } from './sync.mjs';

const ACCOUNTS_OFF = 'Accounts are not set up on this server yet, so nobody can log in. The server owner needs to add MONGODB_URI to the .env file.';
const DB_DOWN = 'The account database cannot be reached right now. Please try again in a minute.';

/**
 * Builds the server from `config` (server/config.mjs). Nothing listens yet: call listen(). Answers
 * { server, listen(port?), announce(), shutdown(), log }.
 */
export async function createApp(config, { log = makeLog({ format: config.logFormat, instance: config.instance }), chatPollMs } = {}) {
  const kit = httpKit(config);
  const { json } = kit;
  const helpers = { ...kit, log };

  // ---------------------------------------------------------------- the database: accounts, farm data, chat, shared counters
  let accountsOff = config.mongo.uri ? '' : 'OFF - add MONGODB_URI to the .env file';
  const database = config.mongo.uri
    ? await openDatabase(config.mongo.uri, config.mongo.db, config.mongo.timeoutMs).catch((e) => {
      accountsOff = `OFF - ${e.message}`; // a bad address or missing driver; the message never contains the password
      return null;
    })
    : null;
  const accounts = database ? accountStore(database) : null;
  const counters = database ? mongoCounters(database) : memoryCounters();

  // ---------------------------------------------------------------- email for "forgot your password?" links
  let emailOff = config.appUrl ? '' : 'OFF - APP_URL must be a web address, like http://192.168.1.20:8787';
  const mailer = config.appUrl ? await openMailer(config.mailEnv).catch((e) => { emailOff = `OFF - ${e.message}`; return null; }) : null;
  if (!mailer && !emailOff) emailOff = 'OFF - add SMTP_USER and SMTP_PASSWORD to the .env file';

  // ---------------------------------------------------------------- who is logged in
  // May-Ani is for logged-in users only (no guest mode since 18 October 2026): AI and chat need an account login on every call.
  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

  /** The logged-in account behind a request. Otherwise answers (401 not logged in, 503 accounts off or database down) and returns null. */
  async function loggedIn(req, res) {
    if (!accounts) {
      json(res, 503, { error: ACCOUNTS_OFF, code: 'accounts_off' });
      return null;
    }
    let user = null;
    try {
      user = await accounts.userForToken(bearer(req));
    } catch (e) {
      log.error(`Accounts: ${dbProblem(e) || 'the login could not be checked.'} (${e.message})`);
      json(res, 503, { error: DB_DOWN, code: 'accounts_down' });
      return null;
    }
    if (!user) json(res, 401, { error: 'Please log in again.', code: 'login' });
    return user;
  }

  // ---------------------------------------------------------------- the parts
  const routes = {};
  const handleAuth = accounts
    ? authRoutes(accounts, helpers, {
      perMinute: config.perMinute.auth,
      counters,
      extend: ({ unlock }) => resetRoutes(accounts, helpers, {
        mailer, appUrl: config.appUrl, unlock, forgotPerMinute: config.perMinute.reset, resetPerMinute: config.perMinute.auth, counters,
      }),
    })
    : (_req, res) => json(res, 503, { error: ACCOUNTS_OFF });
  const handleSync = accounts
    ? syncRoutes(accounts, helpers, { perMinute: config.perMinute.sync, dbProblem })
    : (_req, res) => json(res, 503, { error: 'Accounts are not set up on this server yet, so farm data cannot be saved to an account. It is safe on this phone.' });

  const quotas = {
    ai: dailyQuota(config.daily.ai, { counters, kind: 'ai' }),
    pictures: dailyQuota(config.daily.pictures, { counters, kind: 'pictures' }),
  };
  const gate = allowance({ loggedIn, quotas, json, log });
  Object.assign(routes, aiRoutes({ ai: config.anthropic, kit, gate, log }), imageRoutes({ images: config.images, kit, gate, log }));

  // Chat needs accounts (everyone in it is an account), so it lives in the same database.
  const chat = database ? chatService({ database, kit, loggedIn, log, pollMs: chatPollMs }) : null;
  if (chat) Object.assign(routes, chat.routes);
  else {
    for (const r of ['POST /api/chat/register', 'GET /api/chat/directory', 'GET /api/chat/history', 'POST /api/chat/send', 'POST /api/chat/read', 'POST /api/chat/ticket', 'GET /api/chat/stream']) {
      routes[r] = (_req, res) => json(res, 503, { error: ACCOUNTS_OFF, code: 'accounts_off' });
    }
  }
  const serveStatic = staticFiles({ distDir: config.distDir, json });
  const headers = securityHeaders(config.appUrl);

  // ---------------------------------------------------------------- health checks for hosting platforms and load balancers
  let stopping = false;
  /** Ready for traffic: not stopping, and MongoDB answers (without it nobody can log in). */
  async function ready(res) {
    if (stopping) return json(res, 503, { ready: false, reason: 'stopping' });
    if (!database) return json(res, 503, { ready: false, reason: 'accounts_off' });
    try {
      await Promise.race([database.ping(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000).unref?.())]);
      json(res, 200, { ready: true });
    } catch {
      json(res, 503, { ready: false, reason: 'database' });
    }
  }

  // ---------------------------------------------------------------- router
  const inFlight = new Set(); // requests being answered (not live streams), so stopping can wait for them
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    // Only the path and query are used. The Host header is never trusted (a broken one, like "exa mple", used to crash the
    // whole server here; links in emails come from APP_URL), so the address is read against a fixed base.
    let url;
    try { url = new URL(req.url || '/', 'http://localhost'); } catch { url = null; }
    const id = requestId(req, config.trust);
    if (!url) {
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      return json(res, 400, { error: 'Bad address' });
    }
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.setHeader('X-Request-Id', id);
    if (stopping) res.setHeader('Connection', 'close');
    logRequest(log, req, res, url.pathname, id, started);
    const route = `${req.method} ${url.pathname}`;
    const tracked = route !== 'GET /api/chat/stream';
    if (tracked) { inFlight.add(res); res.on('close', () => inFlight.delete(res)); }
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, kit.cors()); return res.end(); }
      if (url.pathname === '/api/live') return json(res, 200, { live: true });
      if (url.pathname === '/api/ready') return await ready(res);
      if (url.pathname === '/api/health') {
        // The app's list of what this server offers. `daily`: AI uses per account per day, so the app can tell people before
        // they run out. Chat and AI need accounts.
        return json(res, 200, {
          ai: !!config.anthropic.key, chat: !!accounts, accounts: !!accounts, reset: !!(accounts && mailer),
          model: config.anthropic.key ? config.anthropic.model : undefined, render: imageProvider(config.images),
          daily: { ai: config.daily.ai.account, pictures: config.daily.pictures.account },
        });
      }
      if (url.pathname.startsWith('/api/auth/')) return await handleAuth(req, res, url);
      if (url.pathname === '/api/sync') return await handleSync(req, res);
      const fn = routes[route];
      if (fn) return await fn(req, res, url);
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url);
      json(res, 405, { error: 'Method not allowed' });
    } catch (e) {
      // The database went away in the middle of a request: say so plainly instead of "Server error".
      const problem = dbProblem(e);
      if (problem) {
        log.error(`Database: ${problem} (${e.message}) (request ${id})`);
        if (!res.headersSent) json(res, 503, { error: DB_DOWN, code: 'accounts_down' });
        return;
      }
      const status = e.status || 500;
      if (status === 500) log.error(`Server error (request ${id}): ${e.stack || e.message}`);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Server error' : e.message, ...(e.aiCode && status !== 500 ? { code: e.aiCode } : {}) });
    }
  });
  // A load balancer keeps idle connections open for up to about 60 seconds; this server must keep them a little longer, or
  // the balancer may send a request on a connection that is just being closed.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // ---------------------------------------------------------------- start and stop
  function listen(port = config.port) {
    return new Promise((ok, no) => {
      const fail = (e) => no(e);
      server.once('error', fail);
      server.listen(port, () => { server.off('error', fail); ok(server.address().port); });
    });
  }

  /** The startup lines: what is on and off, and why. Then checks MongoDB and email, and moves old chat data into MongoDB. */
  function announce(port) {
    const ai = config.anthropic;
    log.info(`May-Ani server on http://localhost:${port}  |  AI: ${ai.key ? `on (${ai.model})` : 'OFF - add ANTHROPIC_API_KEY to the .env file'}  |  pictures: ${imageProvider(config.images) ?? 'OFF - add GEMINI_API_KEY or OPENAI_API_KEY'}  |  chat: ${accounts ? 'on' : 'OFF - needs accounts'}  |  accounts: ${accounts ? 'on (MongoDB)' : accountsOff}  |  email: ${mailer ? `on (${mailer.host}), reset links open ${config.appUrl}` : emailOff}`);
    if (!accounts) log.error('Warning: May-Ani is for logged-in users only, and accounts are OFF, so nobody can log in or use the app. Add MONGODB_URI to the .env file.');
    const day = (k) => `${config.daily[k].account} per account, ${config.daily[k].total} in total`;
    log.info(`Daily limits: AI checks ${day('ai')}; pictures ${day('pictures')}.  |  proxy: ${config.trust.mode === 'off' ? 'none (TRUST_PROXY off)' : `trusted (${describeTrust(config.trust)})`}`);
    if (config.allowedOrigin === '*' && config.appUrl.startsWith('https:')) {
      log.info(`Tip: set ALLOWED_ORIGIN=${new URL(config.appUrl).origin} in the .env file, so other websites cannot use this server from their pages.`);
    }
    accounts?.check().then(
      () => { log.info('Accounts: connected to MongoDB.'); return chat?.importFile(config.dataFile); },
      (e) => log.error(`Accounts: cannot use MongoDB yet. ${dbProblem(e) || ''} (${e.message}) Sign-up and log-in will keep retrying.`),
    );
    mailer?.verify().then(
      () => log.info(`Email: logged in to ${mailer.host}. Password reset emails can be sent.`),
      (e) => log.error(`Email: cannot send yet. ${mailProblem(e, mailer.port)}`),
    );
  }

  /**
   * Stops cleanly (a deploy or Ctrl+C): no new connections, /api/ready says 503, live chat streams end (phones reconnect,
   * to another copy if there is one), requests already running get up to config.shutdownMs, then the database closes.
   */
  let stopped = null;
  function shutdown() {
    stopped ??= (async () => {
      stopping = true;
      const closed = new Promise((ok) => server.close(() => ok()));
      server.closeIdleConnections?.();
      chat?.closeStreams();
      const until = Date.now() + config.shutdownMs;
      while (inFlight.size > 0 && Date.now() < until) await new Promise((ok) => setTimeout(ok, 50));
      server.closeAllConnections?.();
      await Promise.race([closed, new Promise((ok) => setTimeout(ok, 1000))]);
      kit.stop();
      await Promise.allSettled([database?.close(), mailer?.close()]);
    })();
    return stopped;
  }

  return { server, listen, announce, shutdown, log, waiting: () => inFlight.size };
}
