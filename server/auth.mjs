// Accounts for May-Ani: sign up, log in, log out, profile. Stored in MongoDB (set MONGODB_URI).
//   * Passwords are never stored. Only a scrypt hash is kept (OWASP setting: N=2^15, r=8, p=3, 16-byte salt).
//   * A login gives the app a random session token. The database keeps only the SHA-256 of that token,
//     so someone who copies the database still cannot log in as anyone.
//   * Sessions expire after SESSION_DAYS of not being used (MongoDB deletes them with a TTL index).
// Collections: users { email (unique, lower case), name, role, location, passwordHash, createdAt, updatedAt, lastLoginAt, passwordChangedAt }
//              sessions { tokenHash (unique), userId, createdAt, expiresAt }
//              appdata { _id: userId, rev, bytes, records, updatedAt }: the farm data that follows the account (see server/sync.mjs)
//              password_resets { tokenHash (unique), userId, createdAt, expiresAt }: "forgot password" links (see server/reset.mjs)

import { scrypt as scryptCb, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Keep PASSWORD_MIN, PASSWORD_MAX and NAME_MAX in sync with src/services/auth.ts (a unit test checks this).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 60;
const ROLES = ['farmer', 'supplier', 'buyer', 'expert'];
const SESSION_DAYS = 60;
const DAY_MS = 86_400_000;
const MAX_FAILS = 5; // wrong passwords in a row for one email ...
const LOCK_MS = 15 * 60_000; // ... locks that email for 15 minutes
const AUTH_BODY = 16 * 1024;

// ------------------------------------------------------------------ passwords
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, keylen: 64 };

const scrypt = (password, salt, { N, r, p, keylen }) =>
  new Promise((ok, no) => scryptCb(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 256 * N * r }, (e, key) => (e ? no(e) : ok(key))));

/** "scrypt$15$8$3$<salt>$<hash>" (the settings travel with the hash, so they can be raised later without breaking old accounts). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', Math.log2(SCRYPT.N), SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, logN, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), { N: 2 ** Number(logN), r: Number(r), p: Number(p), keylen: want.length });
  return got.length === want.length && timingSafeEqual(got, want);
}

// ------------------------------------------------------------------ validation
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const validEmail = (email) => email.length <= 254 && EMAIL_RE.test(email);

// The most common passwords (world lists plus Filipino favourites). A short list on purpose: it only stops the worst ones.
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  '12341234', '11223344', 'qwertyui', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'abcdefgh', 'abcd1234', 'abc12345', 'iloveyou',
  'iloveyou1', 'letmein1', 'welcome1', 'admin123', 'sunshine', 'princess', 'football', 'mahalkita', 'mahalkoikaw', 'pilipinas',
  'philippines', 'maganda1', 'mayani123', 'may-ani123',
]);

/** Empty string when the password is fine, otherwise a short reason a farmer can act on. */
export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || !password) return 'Enter a password.';
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const low = password.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(password) || (email && (low === email || low === email.split('@')[0]))) {
    return 'This password is too easy to guess. Try a short sentence you will remember, like "Tatlong kalabaw sa bukid".';
  }
  return '';
}

function cleanPlace(v) {
  if (!v || typeof v !== 'object') return null;
  const name = str(v.name, 80).trim();
  const province = str(v.province, 80).trim();
  const { lat, lon } = v;
  if (!name || typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name, province, lat, lon };
}

const publicUser = (u) => ({
  id: String(u._id),
  email: u.email,
  name: u.name,
  role: u.role,
  location: u.location ?? null,
  createdAt: new Date(u.createdAt).toISOString(),
});

// ------------------------------------------------------------------ database
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** For errors that mean "the database is unreachable or refuses us": a hint for the server log. Otherwise ''. */
export function dbProblem(e) {
  const name = e?.name ?? '';
  if (e?.code === 18 || e?.code === 8000 || /Authentication/i.test(e?.codeName ?? '') || /bad auth|authentication failed/i.test(e?.message ?? '')) {
    return 'MongoDB refused the username or password in MONGODB_URI.';
  }
  if (/^Mongo(ServerSelection|Network|NotConnected|Topology|ServerClosed)/.test(name)) {
    return 'MongoDB is not reachable (is it running? On Atlas, is this computer\'s IP address allowed under Network Access?).';
  }
  return '';
}

/**
 * Connects lazily: the server starts even when the database is down, and every request tries again.
 * Throws only if the driver is missing or the address is not a valid MongoDB address.
 */
export async function openAccounts(uri, dbName, timeoutMs = 8000) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs, appName: 'may-ani' });
  const db = client.db(dbName);
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const appdata = db.collection('appdata');
  const resets = db.collection('password_resets');

  let ready = null;
  const ensureIndexes = () =>
    (ready ??= Promise.all([
      users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
      sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_unique' }),
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expire' }),
      sessions.createIndex({ userId: 1 }, { name: 'by_user' }),
      resets.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_unique' }),
      resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expire' }),
      resets.createIndex({ userId: 1 }, { name: 'by_user' }),
    ]).catch((e) => { ready = null; throw e; }));

  const expiry = () => new Date(Date.now() + SESSION_DAYS * DAY_MS);

  return {
    /** Resolves when MongoDB answers and the indexes exist. */
    check: async () => { await ensureIndexes(); await db.command({ ping: 1 }); },
    async createUser(doc) {
      await ensureIndexes();
      const now = new Date();
      const user = { ...doc, createdAt: now, updatedAt: now, lastLoginAt: now };
      try {
        const r = await users.insertOne(user);
        return { ...user, _id: r.insertedId };
      } catch (e) {
        if (e?.code === 11000) throw Object.assign(new Error('email taken'), { emailTaken: true });
        throw e;
      }
    },
    async findUserByEmail(email) {
      await ensureIndexes();
      return users.findOne({ email: String(email) });
    },
    async noteLogin(userId) {
      await users.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
    },
    async updateUser(userId, patch) {
      return users.findOneAndUpdate({ _id: userId }, { $set: { ...patch, updatedAt: new Date() } }, { returnDocument: 'after' });
    },
    /** Returns the raw token for the app. Only its hash is saved. */
    async createSession(userId) {
      await ensureIndexes();
      const token = randomBytes(32).toString('base64url');
      await sessions.insertOne({ tokenHash: sha256(token), userId, createdAt: new Date(), expiresAt: expiry() });
      return token;
    },
    /** The user behind a token, or null. Using a session pushes its expiry forward (at most once a day). */
    async userForToken(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      const s = await sessions.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
      if (!s) return null;
      const user = await users.findOne({ _id: s.userId });
      if (!user) return null;
      if (user.passwordChangedAt && s.createdAt < user.passwordChangedAt) return null; // a login from before a password reset
      if (s.expiresAt.getTime() - Date.now() < (SESSION_DAYS - 1) * DAY_MS) await sessions.updateOne({ _id: s._id }, { $set: { expiresAt: expiry() } });
      return user;
    },
    async deleteSession(token) {
      if (typeof token === 'string' && token) await sessions.deleteOne({ tokenHash: sha256(token) });
    },
    /** A one-time "forgot password" link token for the user. Only its hash is saved. The user's older links stop working. */
    async createResetToken(userId, minutes) {
      await ensureIndexes();
      await resets.deleteMany({ userId });
      const token = randomBytes(32).toString('base64url');
      await resets.insertOne({ tokenHash: sha256(token), userId, createdAt: new Date(), expiresAt: new Date(Date.now() + minutes * 60_000) });
      return token;
    },
    async dropResetToken(token) {
      await resets.deleteOne({ tokenHash: sha256(token) });
    },
    /** The user a reset link belongs to while the link is valid, or null. Does not use the link up. */
    async userForResetToken(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      const r = await resets.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
      return r ? users.findOne({ _id: r.userId }) : null;
    },
    /**
     * Uses up the link (once only, even when two requests race), saves the new password hash and ends every session of the user.
     * False when the link was used or expired in the meantime.
     */
    async resetPassword(token, userId, passwordHash) {
      const link = await resets.findOneAndDelete({ tokenHash: sha256(token), userId, expiresAt: { $gt: new Date() } });
      if (!link) return false;
      const now = new Date();
      await users.updateOne({ _id: userId }, { $set: { passwordHash, passwordChangedAt: now, updatedAt: now } });
      await Promise.all([sessions.deleteMany({ userId }), resets.deleteMany({ userId })]);
      return true;
    },
    /** The account's farm data document, or null when nothing was saved yet. */
    async loadAppData(userId) {
      return appdata.findOne({ _id: userId });
    },
    /** Saves only if the document is still at `prevRev` (another phone may have saved in between). Returns false if it was not. */
    async saveAppData(userId, prevRev, { rev, records, bytes }) {
      const fields = { rev, records, bytes, updatedAt: new Date() };
      if (prevRev === 0) {
        try {
          await appdata.insertOne({ _id: userId, ...fields });
          return true;
        } catch (e) {
          if (e?.code === 11000) return false;
          throw e;
        }
      }
      const r = await appdata.updateOne({ _id: userId, rev: prevRev }, { $set: fields });
      return r.matchedCount === 1;
    },
    close: () => client.close(),
  };
}

// ------------------------------------------------------------------ HTTP handlers
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

/**
 * Builds the /api/auth/* handler. `helpers` are the server's own json/readJson/limited functions.
 * `perMinute` is the per-IP limit for sign-up and log-in attempts.
 * `extend` adds more /api/auth/* routes (server/reset.mjs). It gets `unlock(email)`, which ends a wrong-password lockout.
 */
export function authRoutes(store, { json, readJson, limited }, perMinute = 20, extend = () => ({})) {
  const fails = new Map(); // email -> { n, until }
  setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.until < now && now - v.at > LOCK_MS) fails.delete(k); }, 60_000).unref();
  const lockedOut = (email) => { const f = fails.get(email); return !!f && f.n >= MAX_FAILS && f.until > Date.now(); };
  const noteFail = (email) => {
    const f = fails.get(email);
    const n = f && Date.now() - f.at < LOCK_MS ? f.n + 1 : 1;
    fails.set(email, { n, at: Date.now(), until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
  };
  // Checking a password for an email that has no account costs the same time, so response time does not reveal who has an account.
  let dummyHash = null;
  const dummy = () => (dummyHash ??= hashPassword(randomBytes(12).toString('hex')));

  const tooMany = (req, res) => {
    if (!limited(req, 'auth', perMinute)) return false;
    json(res, 429, { error: 'Too many tries. Please wait a minute and try again.' });
    return true;
  };

  async function signup(req, res) {
    if (tooMany(req, res)) return;
    const b = await readJson(req, AUTH_BODY);
    const name = str(b.name, NAME_MAX).trim();
    const email = normalizeEmail(b.email);
    if (!name) return json(res, 400, { error: 'Enter your name.', field: 'name' });
    if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address, like juan@gmail.com.', field: 'email' });
    const problem = passwordProblem(b.password, email);
    if (problem) return json(res, 400, { error: problem, field: 'password' });
    const user = await store.createUser({
      email,
      name,
      role: ROLES.includes(b.role) ? b.role : 'farmer',
      location: cleanPlace(b.location),
      passwordHash: await hashPassword(b.password),
    }).catch((e) => {
      if (e.emailTaken) return null;
      throw e;
    });
    if (!user) return json(res, 409, { error: 'An account with this email already exists. Log in instead.', field: 'email' });
    const token = await store.createSession(user._id);
    json(res, 201, { token, user: publicUser(user) });
  }

  async function login(req, res) {
    if (tooMany(req, res)) return;
    const b = await readJson(req, AUTH_BODY);
    const email = normalizeEmail(b.email);
    const password = typeof b.password === 'string' ? b.password : '';
    if (!email || !password) return json(res, 400, { error: 'Enter your email and password.' });
    if (lockedOut(email)) return json(res, 429, { error: 'Too many wrong passwords for this email. Please wait 15 minutes and try again.' });
    const user = validEmail(email) ? await store.findUserByEmail(email) : null;
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummy()));
    if (!user || !ok) {
      noteFail(email);
      return json(res, 401, { error: 'Wrong email or password.' });
    }
    fails.delete(email);
    await store.noteLogin(user._id);
    const token = await store.createSession(user._id);
    json(res, 200, { token, user: publicUser(user) });
  }

  async function me(req, res) {
    const user = await store.userForToken(bearer(req));
    if (!user) return json(res, 401, { error: 'Please log in again.' });
    json(res, 200, { user: publicUser(user) });
  }

  async function profile(req, res) {
    const user = await store.userForToken(bearer(req));
    if (!user) return json(res, 401, { error: 'Please log in again.' });
    const b = await readJson(req, AUTH_BODY);
    const patch = {};
    if (b.name !== undefined) {
      const name = str(b.name, NAME_MAX).trim();
      if (!name) return json(res, 400, { error: 'Enter your name.', field: 'name' });
      patch.name = name;
    }
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) return json(res, 400, { error: 'Unknown role.', field: 'role' });
      patch.role = b.role;
    }
    if (b.location !== undefined) {
      const location = cleanPlace(b.location);
      if (!location) return json(res, 400, { error: 'That location could not be read.', field: 'location' });
      patch.location = location;
    }
    const updated = Object.keys(patch).length ? await store.updateUser(user._id, patch) : user;
    json(res, 200, { user: publicUser(updated ?? user) });
  }

  async function logout(req, res) {
    await store.deleteSession(bearer(req));
    json(res, 200, { ok: true });
  }

  const routes = {
    'POST /api/auth/signup': signup, 'POST /api/auth/login': login, 'GET /api/auth/me': me, 'POST /api/auth/profile': profile, 'POST /api/auth/logout': logout,
    ...extend({ unlock: (email) => fails.delete(email) }),
  };

  return async function handleAuth(req, res, url) {
    const fn = routes[`${req.method} ${url.pathname}`];
    if (!fn) return json(res, 404, { error: 'Not found' });
    try {
      await fn(req, res);
    } catch (e) {
      const problem = dbProblem(e);
      if (!problem) throw e;
      console.error(`Accounts: ${problem} (${e.message})`);
      if (!res.headersSent) json(res, 503, { error: 'The account database cannot be reached right now. Please try again in a minute.' });
    }
  };
}
