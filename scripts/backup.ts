// A copy of May-Ani's MongoDB on this PC. The free Atlas plan (M0) keeps no backups of its own.
//   bun scripts/backup.ts          copies the database in .env (MONGODB_URI, MONGODB_DB) into backups/<date>-<time>/
//   bun scripts/backup.ts --all    also copies the short-lived collections (SHORT_LIVED below)
// Bring a backup back with scripts/restore.ts. README "Backing up your data" has the steps and a daily run with Task Scheduler.
//
// Each collection becomes <collection>.jsonl: one document per line in MongoDB Extended JSON (canonical), so ids, dates and
// number types (whole, decimal, long) come back exactly. manifest.json, written last, lists the collections, their counts
// and indexes. The backup is written into "<name>.partial" and renamed when complete, so a folder without ".partial" is always
// a whole backup. The newest BACKUP_KEEP (14) are kept; older ones are deleted, only inside the backup folder (BACKUP_DIR,
// default backups/) and only folders this script made (a backup name and a May-Ani manifest).
// Backups hold password hashes and personal data: keep them private (backups/ is in .gitignore and .dockerignore).
// The database address holds a password and is never printed.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BSON, MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { ROOT, loadConfig, loadEnvFile } from '../server/config.mjs';
import { dbProblem } from '../server/db.mjs';

const { EJSON } = BSON;

/** Left out unless --all: they live minutes to days and the server makes them again. After a restore everyone logs in again. */
export const SHORT_LIVED = [
  'sessions', // logins
  'password_resets', // "Forgot your password?" links (30 minutes)
  'chat_tickets', // one-time chat stream tickets (1 minute)
  'limits', // per-minute and daily counters
];
export const DEFAULT_KEEP = 14;
const FORMAT = 1;
const DAY_MS = 86_400_000;

/** "2026-10-19-2030", and "2026-10-19-2030-2" for a second backup in the same minute. */
const NAME = /^\d{4}-\d{2}-\d{2}-\d{4}(?:-(\d+))?$/;
const PARTIAL = /^\d{4}-\d{2}-\d{2}-\d{4}(?:-\d+)?\.partial$/;
/** A collection name that is safe as a file name and is not one of MongoDB's own. */
export const COLLECTION = /^(?!system\.)[A-Za-z0-9_][A-Za-z0-9_.-]{0,119}$/;

export interface Manifest {
  app: 'may-ani';
  format: number;
  createdAt: string;
  database: string;
  collections: { name: string; count: number; indexes: Record<string, unknown>[] }[];
}

/** The folder name: date and time in the Philippines (UTC+8, no daylight saving time), like the daily AI limits. */
export function backupName(now = Date.now()): string {
  const t = new Date(now + 8 * 3_600_000).toISOString(); // "2026-10-19T12:30:00.000Z", already moved to Philippine time
  return `${t.slice(0, 10)}-${t.slice(11, 13)}${t.slice(14, 16)}`;
}

/** BACKUP_KEEP: how many backups to keep, a whole number from 1. Empty means 14. Throws a plain sentence otherwise. */
export function parseKeep(value: string | undefined): number {
  const v = String(value ?? '').trim();
  if (!v) return DEFAULT_KEEP;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`BACKUP_KEEP must be a whole number from 1 (it is "${value}").`);
  return n;
}

/** Where backups go: BACKUP_DIR (a relative path is inside the project folder) or backups/ in the project folder. */
export const backupRoot = (dir?: string) => resolve(ROOT, String(dir ?? '').trim() || 'backups');

/** Hides the database address and its password in a message, in case a driver message ever repeats them. */
export function hideSecret(text: string, uri: string): string {
  const password = /^[^:]+:\/\/[^:@/]*:([^@/]+)@/.exec(uri)?.[1];
  let out = uri ? text.split(uri).join('<MONGODB_URI>') : text;
  for (const p of password ? [password, safeDecode(password)] : []) if (p.length >= 3) out = out.split(p).join('<password>');
  return out;
}
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** A MongoDB client for the scripts (it connects on first use). */
export function connect(mongo: { uri: string; timeoutMs: number }, appName: string): MongoClient {
  // The cast: without Node's type package the driver's types ask for every TLS option; these two are all that is set.
  return new MongoClient(mongo.uri, { serverSelectionTimeoutMS: mongo.timeoutMs, appName } as MongoClientOptions);
}

// ------------------------------------------------------------------ making a backup

/** Copies every collection of `db` (without SHORT_LIVED unless `all`) into a new folder in `root`. */
export async function backupDatabase(db: Db, root: string, { all = false, now = Date.now() } = {}) {
  mkdirSync(root, { recursive: true });
  const name = freeName(root, backupName(now));
  const partial = join(root, `${name}.partial`);
  mkdirSync(partial);
  try {
    const manifest: Manifest = { app: 'may-ani', format: FORMAT, createdAt: new Date(now).toISOString(), database: db.databaseName, collections: [] };
    for (const c of await collectionNames(db, all)) {
      const collection = db.collection(c);
      const indexes = (await collection.listIndexes().toArray()).map(({ v: _v, ns: _ns, ...index }) => index);
      // promoteValues: false keeps whole numbers, decimals and longs as their own types (otherwise all become JS numbers).
      const count = await writeLines(join(partial, `${c}.jsonl`), collection.find({}, { promoteValues: false }), (d) => EJSON.stringify(d, { relaxed: false }));
      manifest.collections.push({ name: c, count, indexes });
    }
    await writeLines(join(partial, 'manifest.json'), [manifest], (m) => EJSON.stringify(m, undefined, 2, { relaxed: true }));
    renameSync(partial, join(root, name));
    return { name, dir: join(root, name), manifest };
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    throw e;
  }
}

async function collectionNames(db: Db, all: boolean): Promise<string[]> {
  const names = (await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  for (const n of names) if (!COLLECTION.test(n)) throw new Error(`The collection "${n}" has a name that cannot be a file name.`);
  return names.filter((n) => all || !SHORT_LIVED.includes(n)).sort();
}

/** The backup name, or with -2, -3... when a backup of the same minute exists. */
function freeName(root: string, base: string): string {
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if (!existsSync(join(root, name)) && !existsSync(join(root, `${name}.partial`))) return name;
  }
}

/** Writes one line per item to a new file in pieces of about 1 MB, then makes sure it is on the disk. Answers the line count. */
async function writeLines<T>(file: string, items: AsyncIterable<T> | Iterable<T>, line: (item: T) => string): Promise<number> {
  const fd = openSync(file, 'wx');
  let count = 0;
  let chunk = '';
  try {
    for await (const item of items) {
      chunk += `${line(item)}\n`;
      count++;
      if (chunk.length >= 1 << 20) { writeSync(fd, chunk); chunk = ''; }
    }
    if (chunk) writeSync(fd, chunk);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return count;
}

// ------------------------------------------------------------------ the backups in a folder

/** The manifest of a backup folder, checked. Throws a plain sentence when the folder is not a whole May-Ani backup. */
export function readManifest(dir: string): Manifest {
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) throw new Error(`${dir} is not a complete May-Ani backup (it has no manifest.json).`);
  let m: Manifest;
  try { m = EJSON.parse(readFileSync(file, 'utf8'), { relaxed: true }) as Manifest; } catch { throw new Error(`${file} is damaged.`); }
  const seen = new Set<string>();
  const ok = m?.app === 'may-ani' && m.format === FORMAT && typeof m.database === 'string' && Array.isArray(m.collections) &&
    m.collections.every((c) => COLLECTION.test(c?.name) && !seen.has(c.name) && seen.add(c.name) && Number.isInteger(c.count) && c.count >= 0 && Array.isArray(c.indexes));
  if (!ok) throw new Error(`${file} is not a May-Ani backup manifest this version can read.`);
  return m;
}

/** The whole backups in `root`, oldest first: folders with a backup name and a May-Ani manifest. */
export function listBackups(root: string): string[] {
  if (!existsSync(root)) return [];
  const backups = readdirSync(root).filter((n) => {
    if (!NAME.test(n)) return false;
    try { readManifest(join(root, n)); return true; } catch { return false; }
  });
  return backups.sort((a, b) => (a.slice(0, 15) < b.slice(0, 15) ? -1 : a.slice(0, 15) > b.slice(0, 15) ? 1 : sameMinute(a) - sameMinute(b)));
}
const sameMinute = (name: string) => Number(NAME.exec(name)?.[1] ?? 1);

/**
 * Deletes all but the newest `keep` backups in `root`, and ".partial" folders of backups that stopped more than a day ago.
 * Nothing else in the folder is touched. Answers the names it deleted.
 */
export function pruneBackups(root: string, keep: number, now = Date.now()): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('At least one backup must be kept.');
  const old = listBackups(root).slice(0, -keep);
  const stale = existsSync(root) ? readdirSync(root).filter((n) => PARTIAL.test(n) && now - statSync(join(root, n)).mtimeMs > DAY_MS) : [];
  for (const n of [...old, ...stale]) rmSync(join(root, n), { recursive: true, force: true });
  return [...old, ...stale];
}

// ------------------------------------------------------------------ bun scripts/backup.ts

async function main(args: string[]): Promise<number> {
  if (args.some((a) => a !== '--all')) {
    console.error('Usage: bun scripts/backup.ts [--all]\n  --all  also copy logins, reset links, chat tickets and counters');
    return 2;
  }
  loadEnvFile();
  const { mongo } = loadConfig(process.env).config;
  if (!mongo.uri) {
    console.error('Backup NOT made: MONGODB_URI is not set in .env, so there is no database to copy.');
    return 1;
  }
  let keep: number;
  try { keep = parseKeep(process.env.BACKUP_KEEP); } catch (e) { console.error(`Backup NOT made: ${(e as Error).message}`); return 1; }
  const root = backupRoot(process.env.BACKUP_DIR);
  const shown = (dir: string) => (relative(ROOT, dir).startsWith('..') ? dir : relative(ROOT, dir));

  let client: MongoClient | null = null;
  try {
    client = connect(mongo, 'may-ani-backup');
    console.log(`Backing up database "${mongo.db}"...`);
    const { dir, manifest } = await backupDatabase(client.db(mongo.db), root, { all: args.includes('--all') });
    const counts = manifest.collections.map((c) => `${c.name} ${c.count}`).join(', ') || 'no collections yet';
    console.log(`Backup saved in ${shown(dir)} (${counts}).`);
    const deleted = pruneBackups(root, keep);
    console.log(`Keeping the newest ${keep} backups${deleted.length ? `; deleted the older ${deleted.join(', ')}` : ''}.`);
    return 0;
  } catch (e) {
    const err = e as Error;
    console.error(`Backup FAILED: ${hideSecret(dbProblem(err) || err.message || String(err), mongo.uri)}`);
    return 1;
  } finally {
    await client?.close().catch(() => {});
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
