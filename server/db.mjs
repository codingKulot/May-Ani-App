// The one MongoDB connection of the server (set MONGODB_URI). Everything that must be the same for every copy of the server
// lives in this database: accounts and logins (server/auth.mjs), farm data (server/sync.mjs), chat (server/chat.mjs) and the
// shared counters for lockouts and the daily AI allowance (server/limits.mjs).
//   * Connects lazily: the server starts even when the database is down, and every request tries again.
//   * Each part registers the indexes it needs; they are created once, before the first use.

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

/** Throws only if the driver is missing or the address is not a valid MongoDB address (the message never has the password). */
export async function openDatabase(uri, dbName, timeoutMs = 8000) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs, appName: 'may-ani' });
  const db = client.db(dbName);
  const wanted = []; // [collection, keys, options]
  let ready = null;

  return {
    collection: (name) => db.collection(name),
    /** An index a collection needs. Call while setting up, before requests come in. */
    index(collection, keys, options) {
      wanted.push([collection, keys, options]);
      ready = null;
    },
    /** Creates the registered indexes (once; again after a failure). Creating an index that exists does nothing. */
    ensureIndexes: () =>
      (ready ??= Promise.all(wanted.map(([c, k, o]) => db.collection(c).createIndex(k, o))).catch((e) => { ready = null; throw e; })),
    /** Resolves when MongoDB answers. */
    ping: () => db.command({ ping: 1 }),
    close: () => client.close(),
  };
}
