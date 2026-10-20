import { afterAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BSON, MongoClient, type Db } from 'mongodb';
import { backupDatabase, backupName, hideSecret, listBackups, parseKeep, pruneBackups, readManifest, SHORT_LIVED } from '../scripts/backup';
import { NotEmpty, restoreBackup } from '../scripts/restore';
import { OFF, startMongo } from './support/server';

// Database backups (scripts/backup.ts, scripts/restore.ts) on a THROWAWAY MongoDB only: every database and script run here gets
// its MongoDB address from the test, never from the owner's .env.

const { Binary, Decimal128, Double, EJSON, Int32, Long, ObjectId } = BSON;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const temp = () => mkdtempSync(join(tmpdir(), 'may-ani-backup-'));
const temps: string[] = [];
const tempDir = () => { const d = temp(); temps.push(d); return d; };

const mongo = await startMongo('backup tests');
const client = mongo ? new MongoClient(mongo.getUri()) : null;

afterAll(async () => {
  await client?.close();
  await mongo?.stop();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** Every document of a collection, in canonical Extended JSON (so a number that changed type shows as a difference). */
const dump = async (db: Db, name: string) =>
  (await db.collection(name).find({}, { promoteValues: false }).sort({ _id: 1 }).toArray()).map((d) => EJSON.stringify(d, { relaxed: false }));
const indexesOf = async (db: Db, name: string) =>
  (await db.collection(name).listIndexes().toArray()).map(({ v: _v, ns: _ns, ...i }) => i).sort((a, b) => String(a.name).localeCompare(String(b.name)));

/** The server's own string ids (account ids, chat ids, counter keys). */
type StringId = { _id: string; [field: string]: unknown };

/** A database shaped like May-Ani's, with every kind of value that must survive a backup. */
async function fill(db: Db) {
  const userId = new ObjectId();
  await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  await db.collection('users').insertMany([
    { _id: userId, email: 'ana@example.com', name: 'Ana Dela Cruz', hash: 'scrypt$32768$8$3$c2FsdA$aGFzaA', createdAt: new Date('2026-10-01T02:03:04.005Z') },
    { _id: new ObjectId(), email: 'pedro@example.com', name: 'Pedro Peñaflor 🐟', hash: 'scrypt$x', createdAt: new Date(0), passwordChangedAt: null },
  ]);
  await db.collection<StringId>('appdata').insertOne({
    _id: userId.toHexString(),
    rev: new Int32(7),
    bytes: Long.fromString('9007199254740993'), // more than a JS number can hold exactly
    ratio: new Double(5), // a decimal-type number that happens to be whole
    price: Decimal128.fromString('1500.50'),
    odd: [new Double(-0), new Double(NaN), new Double(Infinity), true, null, 'Bukid ni Juan, Nueva Écija'],
    picture: new Binary(new Uint8Array([0, 1, 2, 255])),
    records: [{ c: 'farms', id: 'farm-1', t: 1_760_000_000_000, d: JSON.stringify({ id: 'farm-1', name: 'Palayan "sa" ilog\nlinya 2' }) }],
    big: 'x'.repeat(1_500_000), // bigger than one 1 MB write
  });
  await db.collection<StringId>('chat_profiles').insertOne({ _id: 'acct-1', name: 'Ana', role: 'farmer', updatedAt: new Date() });
  await db.collection('chat_messages').createIndex({ from: 1, at: -1 }, { name: 'by_sender' });
  await db.collection('chat_messages').insertMany(
    Array.from({ length: 2500 }, (_, i) => ({ from: 'acct-1', to: 'acct-2', text: `Magkano ang tilapia? #${i}`, at: new Date(1_760_000_000_000 + i) })),
  );
  await db.createCollection('empty_one');
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expire' });
  await db.collection('sessions').insertOne({ tokenHash: 'abc', userId, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.collection<StringId>('limits').insertOne({ _id: 'ai:2026-10-19:total', n: 3, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.collection('password_resets').insertOne({ tokenHash: 'def', userId, expiresAt: new Date(Date.now() + 60_000) });
  await db.collection('chat_tickets').insertOne({ hash: 'ghi', expiresAt: new Date(Date.now() + 60_000) });
}

/** Runs one of the scripts as the owner would, with the test's own database address and backup folder. */
function run(script: 'backup' | 'restore', args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const proc = spawn(process.execPath, [`scripts/${script}.ts`, ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (out += d));
    proc.on('close', (code) => done({ code, out }));
  });
}

describe('backup names and settings', () => {
  test('folder names use Philippine time (UTC+8)', () => {
    expect(backupName(Date.UTC(2026, 9, 19, 16, 5))).toBe('2026-10-20-0005');
    expect(backupName(Date.UTC(2026, 11, 31, 3, 59))).toBe('2026-12-31-1159');
  });

  test('BACKUP_KEEP is a whole number from 1, 14 when empty', () => {
    expect(parseKeep(undefined)).toBe(14);
    expect(parseKeep(' ')).toBe(14);
    expect(parseKeep(' 3 ')).toBe(3);
    for (const bad of ['0', '-1', '2.5', 'abc', '1e400']) expect(() => parseKeep(bad)).toThrow('BACKUP_KEEP');
  });

  test('the database address and its password never show in a message', () => {
    const uri = 'mongodb+srv://ronilo:S3cret%40pw@cluster0.abc.mongodb.net/?retryWrites=true';
    const text = hideSecret(`failed for ${uri} (password S3cret@pw, raw S3cret%40pw)`, uri);
    expect(text).not.toContain('S3cret');
    expect(text).toContain('<MONGODB_URI>');
  });

  test('backups/ is kept out of git and out of container images', () => {
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/)).toContain('backups/');
    expect(readFileSync(join(ROOT, '.dockerignore'), 'utf8').split(/\r?\n/)).toContain('backups');
  });
});

describe('keeping the newest backups', () => {
  /** A finished backup folder as backup.ts leaves it (only the manifest matters for keeping). */
  const fake = (root: string, name: string) => {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'manifest.json'), JSON.stringify({ app: 'may-ani', format: 1, createdAt: '', database: 'may_ani', collections: [] }));
  };

  test('keeps N, deletes only older backups it made', () => {
    const root = tempDir();
    const names = ['2026-10-15-2000', '2026-10-16-2000', '2026-10-17-2000', '2026-10-17-2000-2', '2026-10-17-2000-10', '2026-10-18-0900'];
    for (const n of [...names].reverse()) fake(root, n);
    mkdirSync(join(root, '2026-10-01-2000')); // a backup name, but no manifest: not ours to delete
    mkdirSync(join(root, 'my notes'));
    writeFileSync(join(root, '2026-10-02-2000'), 'a file, not a folder');
    expect(listBackups(root)).toEqual(names); // oldest first; "-10" after "-2"
    expect(pruneBackups(root, 3)).toEqual(names.slice(0, 3));
    expect(listBackups(root)).toEqual(names.slice(3));
    for (const kept of ['2026-10-01-2000', 'my notes', '2026-10-02-2000']) expect(existsSync(join(root, kept))).toBe(true);
    expect(pruneBackups(root, 3)).toEqual([]);
    expect(pruneBackups(root, 14)).toEqual([]);
    expect(() => pruneBackups(root, 0)).toThrow();
    expect(listBackups(join(root, 'missing'))).toEqual([]);
  });

  test('a stopped backup (".partial") is removed after a day, not while it may still be running', () => {
    const root = tempDir();
    mkdirSync(join(root, '2026-10-18-2000.partial'));
    expect(pruneBackups(root, 1)).toEqual([]);
    expect(pruneBackups(root, 1, Date.now() + 2 * 86_400_000)).toEqual(['2026-10-18-2000.partial']);
    expect(readdirSync(root)).toEqual([]);
  });

  test('a damaged or foreign manifest is not a backup', () => {
    const root = tempDir();
    for (const [name, text] of [['2026-10-10-2000', '{not json'], ['2026-10-11-2000', '{"app":"other","format":1,"collections":[]}'],
      ['2026-10-12-2000', '{"app":"may-ani","format":1,"database":"x","collections":[{"name":"../x","count":1,"indexes":[]}]}']]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'manifest.json'), text);
      expect(() => readManifest(join(root, name))).toThrow();
    }
    expect(listBackups(root)).toEqual([]);
    expect(pruneBackups(root, 1)).toEqual([]);
  });
});

describe.skipIf(!mongo)('backup and restore on a throwaway MongoDB', () => {
  test('backup then restore into a fresh database gives identical documents and indexes', async () => {
    const source = client!.db('may_ani_backup_source');
    await fill(source);
    const root = tempDir();
    const { name, dir, manifest } = await backupDatabase(source, root);
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(readdirSync(root)).toEqual([name]); // the ".partial" folder became the backup
    expect(manifest.database).toBe('may_ani_backup_source');
    expect(manifest.collections.map((c) => [c.name, c.count])).toEqual([['appdata', 1], ['chat_messages', 2500], ['chat_profiles', 1], ['empty_one', 0], ['users', 2]]);
    for (const s of SHORT_LIVED) expect(existsSync(join(dir, `${s}.jsonl`))).toBe(false);
    expect(readFileSync(join(dir, 'appdata.jsonl'), 'utf8')).toContain('"$numberDouble":"5.0"'); // the type is in the file

    const target = client!.db('may_ani_backup_target');
    await restoreBackup(target, dir);
    for (const c of manifest.collections) {
      expect(await dump(target, c.name)).toEqual(await dump(source, c.name));
      expect(await indexesOf(target, c.name)).toEqual(await indexesOf(source, c.name));
    }
    const names = (await target.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
    expect(names).toEqual(['appdata', 'chat_messages', 'chat_profiles', 'empty_one', 'users']);
    const user = await target.collection('users').findOne({ email: 'pedro@example.com' });
    expect(user?.name).toBe('Pedro Peñaflor 🐟');
    // the unique email index works again
    await expect(target.collection('users').insertOne({ email: 'ana@example.com' })).rejects.toThrow();
  }, 60_000);

  test('--all also copies logins, reset links, chat tickets and counters', async () => {
    const source = client!.db('may_ani_backup_source');
    const { dir, manifest } = await backupDatabase(source, tempDir(), { all: true });
    for (const s of SHORT_LIVED) expect(manifest.collections.find((c) => c.name === s)?.count).toBe(1);
    const target = client!.db('may_ani_backup_all');
    await restoreBackup(target, dir);
    for (const c of manifest.collections) expect(await dump(target, c.name)).toEqual(await dump(source, c.name));
    expect((await indexesOf(target, 'sessions')).find((i) => i.name === 'expire')?.expireAfterSeconds).toBe(0);
  }, 60_000);

  test('two backups in the same minute get their own folders', async () => {
    const db = client!.db('may_ani_backup_source');
    const root = tempDir();
    const now = Date.UTC(2026, 9, 19, 12, 0);
    const a = await backupDatabase(db, root, { now });
    const b = await backupDatabase(db, root, { now });
    expect([a.name, b.name]).toEqual(['2026-10-19-2000', '2026-10-19-2000-2']);
    expect(listBackups(root)).toEqual([a.name, b.name]);
  }, 60_000);

  test('restore refuses a database that has data unless forced, and then replaces only what is in the backup', async () => {
    const source = client!.db('may_ani_backup_source');
    const { dir } = await backupDatabase(source, tempDir());
    const target = client!.db('may_ani_backup_busy');
    await target.collection('users').insertOne({ email: 'new@example.com' });
    await target.collection('sessions').insertOne({ tokenHash: 'keep-me' });

    await expect(restoreBackup(target, dir)).rejects.toBeInstanceOf(NotEmpty);
    expect(await target.collection('users').countDocuments()).toBe(1); // nothing changed

    await restoreBackup(target, dir, { force: true });
    expect(await dump(target, 'users')).toEqual(await dump(source, 'users'));
    expect(await dump(target, 'chat_messages')).toEqual(await dump(source, 'chat_messages'));
    expect(await target.collection('sessions').countDocuments({ tokenHash: 'keep-me' })).toBe(1); // not in the backup: left alone
  }, 60_000);

  test('a damaged backup is refused with the line number, never the line', async () => {
    const source = client!.db('may_ani_backup_source');
    const { dir } = await backupDatabase(source, tempDir());
    const file = join(dir, 'users.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n');

    writeFileSync(file, `${lines[0]}\n{"email":"secret@example.com", broken\n`);
    const err = await restoreBackup(client!.db('may_ani_backup_bad1'), dir).catch((e: Error) => e);
    expect(String(err)).toContain('line 2');
    expect(String(err)).not.toContain('secret@example.com');

    writeFileSync(file, `${lines[0]}\n`); // one document missing
    await expect(restoreBackup(client!.db('may_ani_backup_bad2'), dir)).rejects.toThrow('the backup lists 2 documents, the file has 1');

    rmSync(file);
    await expect(restoreBackup(client!.db('may_ani_backup_bad3'), dir)).rejects.toThrow('users.jsonl is missing');
    rmSync(join(dir, 'manifest.json'));
    await expect(restoreBackup(client!.db('may_ani_backup_bad3'), dir)).rejects.toThrow('not a complete May-Ani backup');
  }, 60_000);

  test('the scripts as the owner runs them: keep N, restore latest, refuse without --force, never print the address', async () => {
    const root = tempDir();
    const env = { MONGODB_URI: mongo!.getUri(), MONGODB_DB: 'may_ani_backup_source', BACKUP_DIR: root, BACKUP_KEEP: '2' };
    for (let i = 0; i < 3; i++) {
      const r = await run('backup', [], env);
      expect(r.code).toBe(0);
      expect(r.out).toContain('Backup saved in');
      expect(r.out).not.toContain(mongo!.getUri());
    }
    expect(listBackups(root).length).toBe(2); // the third run deleted the oldest

    const restored = await run('restore', ['latest', 'may_ani_backup_cli'], env);
    expect(restored.code).toBe(0);
    expect(restored.out).toContain('Restored: appdata 1, chat_messages 2500, chat_profiles 1, empty_one 0, users 2.');
    expect(await dump(client!.db('may_ani_backup_cli'), 'appdata')).toEqual(await dump(client!.db('may_ani_backup_source'), 'appdata'));

    const again = await run('restore', [listBackups(root)[0], 'may_ani_backup_cli'], env);
    expect(again.code).toBe(1);
    expect(again.out).toContain('already has data');
    expect(again.out).toContain('--force');
    expect((await run('restore', [join(root, listBackups(root)[0]), 'may_ani_backup_cli', '--force'], env)).code).toBe(0);

    for (const r of [await run('restore', ['latest', 'bad.name'], env), await run('restore', ['latest'], env), await run('backup', ['--everything'], env)]) {
      expect(r.code).not.toBe(0);
      expect(r.code).not.toBeNull();
    }
    const noDb = await run('backup', [], { ...env, MONGODB_URI: OFF });
    expect(noDb.code).toBe(1);
    expect(noDb.out).toContain('MONGODB_URI is not set');
    const badKeep = await run('backup', [], { ...env, BACKUP_KEEP: '0' });
    expect(badKeep.code).toBe(1);
    expect(listBackups(root).length).toBe(2);
  }, 120_000);
});

describe('when MongoDB cannot be reached', () => {
  test('the backup is a plain failure, and no half backup is left', async () => {
    const root = tempDir();
    const r = await run('backup', [], { MONGODB_URI: 'mongodb://127.0.0.1:1/', MONGODB_DB: 'x', MONGODB_TIMEOUT_MS: '1500', BACKUP_DIR: root, BACKUP_KEEP: '2' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Backup FAILED: MongoDB is not reachable');
    expect(readdirSync(root)).toEqual([]);
  }, 30_000);
});
