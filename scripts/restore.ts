// Brings a backup made by scripts/backup.ts back into a MongoDB database.
//   bun scripts/restore.ts <backup> <database> [--force]
//     <backup>    a folder name in backups/ (like 2026-10-19-2000), "latest", or the path of a backup folder
//     <database>  the database to fill, like may_ani_restored. Which MongoDB: MONGODB_URI in .env.
//     --force     only then is a database that already holds data changed: each collection in the backup is replaced by the
//                 backup's copy (other collections, like logins, are left as they are). Stop the server first.
// Safest: restore into a NEW database name, look at it, then point MONGODB_DB in .env at it and restart the server.
// The database address holds a password and is never printed.

import { createReadStream, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { BSON, type Collection, type Db, type Document, type MongoClient } from 'mongodb';
import { loadConfig, loadEnvFile } from '../server/config.mjs';
import { dbProblem } from '../server/db.mjs';
import { backupRoot, connect, hideSecret, listBackups, readManifest, type Manifest } from './backup';

const { EJSON } = BSON;

/** A database name MongoDB accepts on every system (no dots, slashes or spaces). */
export const DATABASE = /^[A-Za-z0-9_-]{1,63}$/;

/** Thrown when the database already has data and --force was not given. */
export class NotEmpty extends Error {}

/** The collections of `db` that hold at least one document. */
export async function collectionsWithData(db: Db): Promise<string[]> {
  const names = (await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  const full: string[] = [];
  for (const n of names.sort()) if (await db.collection(n).findOne({}, { projection: { _id: 1 } })) full.push(n);
  return full;
}

/**
 * Restores the backup in `dir` into `db`. Refuses (NotEmpty) when `db` already has data, unless `force`: then each collection in
 * the backup is dropped and filled from the backup. Checks every count and recreates the indexes.
 */
export async function restoreBackup(db: Db, dir: string, { force = false } = {}): Promise<Manifest> {
  const manifest = readManifest(dir);
  for (const c of manifest.collections) {
    if (!existsSync(join(dir, `${c.name}.jsonl`))) throw new Error(`The backup is incomplete: ${c.name}.jsonl is missing.`);
  }
  const full = await collectionsWithData(db);
  if (full.length && !force) {
    throw new NotEmpty(`The database "${db.databaseName}" already has data (${full.join(', ')}). Nothing was changed.`);
  }
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  try {
    for (const c of manifest.collections) {
      if (existing.has(c.name)) await db.collection(c.name).drop();
      const collection = db.collection(c.name);
      const count = await insertLines(collection, join(dir, `${c.name}.jsonl`));
      const stored = await collection.countDocuments();
      if (count !== c.count || stored !== c.count) {
        throw new Error(`${c.name}: the backup lists ${c.count} documents, the file has ${count} and the database now has ${stored}.`);
      }
      const indexes = c.indexes.filter((i) => i.name !== '_id_');
      if (indexes.length) await db.command({ createIndexes: c.name, indexes });
      else await db.createCollection(c.name).catch(() => {}); // an empty collection still comes back (with documents it exists already)
    }
  } catch (e) {
    (e as { partly?: boolean }).partly = true; // the database was changed before this went wrong
    throw e;
  }
  return manifest;
}

/** Reads a .jsonl file one line at a time and inserts the documents in batches (1000 documents or about 8 MB). */
async function insertLines(collection: Collection, file: string): Promise<number> {
  let batch: Document[] = [];
  let bytes = 0;
  let count = 0;
  let lineNo = 0;
  const flush = async () => {
    if (batch.length) await collection.insertMany(batch, { ordered: true });
    batch = [];
    bytes = 0;
  };
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    lineNo++;
    if (!line.trim()) continue;
    let doc: unknown;
    try { doc = EJSON.parse(line, { relaxed: false }); } catch { doc = null; }
    // The line itself is never shown: it can hold personal data.
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${file}, line ${lineNo}, is damaged.`);
    batch.push(doc as Document);
    bytes += line.length;
    count++;
    if (batch.length >= 1000 || bytes >= 8 << 20) await flush();
  }
  await flush();
  return count;
}

/** "latest", a backup folder name in `root`, or a path. */
export function findBackup(arg: string, root: string): string {
  if (arg === 'latest') {
    const newest = listBackups(root).at(-1);
    if (!newest) throw new Error(`There is no backup in ${root} yet.`);
    return join(root, newest);
  }
  return existsSync(join(root, arg)) ? join(root, arg) : resolve(arg);
}

// ------------------------------------------------------------------ bun scripts/restore.ts

async function main(args: string[]): Promise<number> {
  const force = args.includes('--force');
  const [from, target, ...extra] = args.filter((a) => a !== '--force');
  if (!from || !target || extra.length || from.startsWith('-') || target.startsWith('-')) {
    console.error('Usage: bun scripts/restore.ts <backup> <database> [--force]\n  <backup>    a folder in backups/ (like 2026-10-19-2000), "latest", or a path\n  <database>  the database to restore into, like may_ani_restored');
    return 2;
  }
  if (!DATABASE.test(target)) {
    console.error(`Restore NOT done: "${target}" cannot be a database name (use letters, numbers, _ and -, at most 63).`);
    return 1;
  }
  loadEnvFile();
  const { mongo } = loadConfig(process.env).config;
  if (!mongo.uri) {
    console.error('Restore NOT done: MONGODB_URI is not set in .env, so there is no database to restore into.');
    return 1;
  }

  let client: MongoClient | null = null;
  try {
    const dir = findBackup(from, backupRoot(process.env.BACKUP_DIR));
    const manifest = readManifest(dir);
    if (force && target === mongo.db) console.log(`"${target}" is the database the server uses: the server should be stopped while this runs.`);
    console.log(`Restoring backup ${basename(dir)} (made from database "${manifest.database}") into database "${target}"...`);
    client = connect(mongo, 'may-ani-restore');
    await restoreBackup(client.db(target), dir, { force });
    console.log(`Restored: ${manifest.collections.map((c) => `${c.name} ${c.count}`).join(', ') || 'no collections'}.`);
    if (target !== mongo.db) console.log(`To use it: set MONGODB_DB=${target} in .env and restart the server. Everyone logs in again.`);
    return 0;
  } catch (e) {
    const err = e as Error;
    const tip = e instanceof NotEmpty
      ? '\nRestore into a new database name, or add --force to replace the collections in the backup.'
      : (e as { partly?: boolean }).partly
        ? `\nThe database "${target}" may now be partly filled: fix the problem, then run this again with --force.`
        : '';
    console.error(`Restore ${(e as { partly?: boolean }).partly ? 'FAILED' : 'NOT done'}: ${hideSecret(dbProblem(err) || err.message || String(err), mongo.uri)}${tip}`);
    return 1;
  } finally {
    await client?.close().catch(() => {});
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
