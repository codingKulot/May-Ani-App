// Chat between May-Ani accounts: farmers, suppliers, buyers and experts (logged-in users only).
// Everyone in the chat is an account: their chat id is "acct-<account id>", the same on every phone, with the account's name
// and role. Every call needs the account login (Authorization: Bearer <login token>), so nobody can read the list of people,
// write to them or pretend to be someone without logging in. There is no separate chat password.
//
// Stored in MongoDB, so every copy of the server shares it (until 19 October 2026 it was a file, server/data.json):
//   chat_profiles { _id: chat id, name, role, blurb, createdAt, updatedAt }   people who opened Community
//   chat_messages { _id: message id, from, to, text, at }                     `at` is the database's clock: one clock for all
//   chat_tickets  { _id: SHA-256 of the ticket, chatId, expiresAt }           one-time tickets for the live stream
//   chat_reads    { _id: "<me>|<with>", me, with, at }                         read up to here, per account (not per phone)
//
// Live messages (server-sent events): the browser's EventSource cannot send the login header, so the stream opens with a
// ticket from POST /api/chat/ticket: random, for one connection only, valid for one minute. The login token never goes into a
// web address. A new message goes at once to the receiver's streams on this copy of the server. Every copy that has open
// streams also checks the database every POLL_MS for new messages to its connected people, so a message sent through another
// copy arrives within about two seconds. (With many copies or very busy chat, Redis pub/sub replaces this check: see
// docs/ARCHITECTURE.md.)

import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { dbProblem } from './db.mjs';

export const ACCOUNT_CHAT = 'acct-';
const isAccountChat = (id) => typeof id === 'string' && id.startsWith(ACCOUNT_CHAT) && id.length <= 64;
const chatIdOf = (user) => `${ACCOUNT_CHAT}${String(user._id)}`;
const ROLES = ['farmer', 'supplier', 'buyer', 'expert'];
const STREAMS_PER_USER = 5; // a few phones and tabs at once (per copy of the server); older connections close first
const TICKET_MS = 60_000;
const HISTORY = 500; // messages a phone gets at once
const DIRECTORY_MAX = 1000; // people in the contact list (a search on the server comes later: docs/ARCHITECTURE.md)
const CHAT_BODY = 16 * 1024; // a chat message is at most 2000 characters
const POLL_MS = 1500;
const OVERLAP_MS = 5000; // each check looks this far back again: a message saved a moment late is still found
const POLL_BATCH = 2000;
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const toWire = (m) => ({ id: m._id, from: m.from, to: m.to, text: m.text, at: new Date(m.at).toISOString() });
const NOT_JOINED = 'Open Community once to join the chat.';

/**
 * The chat. `database` is from server/db.mjs, `kit` the HTTP helpers, `loggedIn(req, res)` answers the logged-in account
 * (or answers 401/503 itself and returns null). Answers { routes, importFile, closeStreams, openStreams }.
 */
export function chatService({ database, kit: { json, readJson, limited, cors }, loggedIn, log = console, pollMs = POLL_MS }) {
  const profiles = database.collection('chat_profiles');
  const messages = database.collection('chat_messages');
  const tickets = database.collection('chat_tickets');
  const reads = database.collection('chat_reads');
  database.index('chat_messages', { from: 1, at: -1 }, { name: 'by_sender' });
  database.index('chat_messages', { to: 1, at: -1 }, { name: 'by_receiver' });
  database.index('chat_messages', { at: 1 }, { name: 'by_time' });
  database.index('chat_profiles', { updatedAt: -1 }, { name: 'recent' });
  database.index('chat_tickets', { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expire' });
  database.index('chat_reads', { me: 1 }, { name: 'by_reader' });

  // ---------------------------------------------------------------- live streams on this copy of the server
  const streams = new Map(); // chat id -> Set<res>
  const pings = new Map(); // res -> keep-alive timer
  const delivered = new Map(); // message id -> when it went out here, so no message is sent twice

  function endStream(res) {
    clearInterval(pings.get(res));
    pings.delete(res);
    for (const [id, set] of streams) if (set.delete(res) && set.size === 0) streams.delete(id);
    if (!res.writableEnded) res.end();
  }

  function deliver(msg) {
    delivered.set(msg.id, Date.now());
    for (const r of streams.get(msg.to) ?? []) r.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  }

  /** Tells the reader's other phones and tabs on this copy at once; copies elsewhere learn it with the next history load. */
  function deliverRead(me, mark) {
    for (const r of streams.get(me) ?? []) r.write(`event: read\ndata: ${JSON.stringify(mark)}\n\n`);
  }

  // ---------------------------------------------------------------- messages sent through other copies
  let cursor = null; // the newest message time seen (database clock)
  let catchingUp = false; // the last check was full: the next one continues without looking back
  let timer = null;
  let stopped = false;
  let lastProblem = 0;

  const pollSoon = () => {
    if (timer || stopped || streams.size === 0) return;
    timer = setTimeout(poll, pollMs);
    timer.unref?.();
  };

  async function poll() {
    timer = null;
    if (streams.size === 0) { cursor = null; return; }
    try {
      if (!cursor) cursor = (await messages.find({}, { projection: { at: 1 } }).sort({ at: -1 }).limit(1).next())?.at ?? new Date(0);
      const since = catchingUp ? cursor : new Date(cursor.getTime() - OVERLAP_MS);
      const found = await messages.find({ at: { $gt: since } }).sort({ at: 1 }).limit(POLL_BATCH).toArray();
      catchingUp = found.length === POLL_BATCH;
      for (const m of found) {
        if (m.at > cursor) cursor = m.at;
        if (!delivered.has(m._id) && streams.has(m.to)) deliver(toWire(m));
      }
    } catch (e) {
      if (Date.now() - lastProblem > 60_000) {
        lastProblem = Date.now();
        log.error(`Chat: new messages could not be checked (${dbProblem(e) || e.message}). Trying again.`);
      }
    }
    const old = Date.now() - 4 * OVERLAP_MS;
    for (const [id, at] of delivered) if (at < old) delivered.delete(id);
    pollSoon();
  }

  // ---------------------------------------------------------------- routes
  /** Joins the chat as the logged-in account (or updates its name, role and place) and answers { id }: this user's chat id. */
  async function register(req, res) {
    if (limited(req, 'reg', 20)) return json(res, 429, { error: 'Too many requests.' });
    const account = await loggedIn(req, res);
    if (!account) return;
    const b = await readJson(req, CHAT_BODY);
    const id = chatIdOf(account);
    await database.ensureIndexes();
    const now = new Date();
    await profiles.updateOne(
      { _id: id },
      { $set: { name: str(account.name, 60), role: ROLES.includes(account.role) ? account.role : 'farmer', blurb: str(b.blurb, 140), updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    json(res, 200, { ok: true, id });
  }

  /** Everyone who joined the chat (accounts only, the most recently active first). Needs a login. */
  async function directory(req, res) {
    if (!(await loggedIn(req, res))) return;
    const found = await profiles.find({ _id: { $regex: `^${ACCOUNT_CHAT}` } }, { projection: { name: 1, role: 1, blurb: 1 } })
      .sort({ updatedAt: -1 }).limit(DIRECTORY_MAX).toArray();
    json(res, 200, { users: found.map((u) => ({ id: u._id, name: u.name, role: u.role, blurb: u.blurb })) });
  }

  /** The logged-in user's last HISTORY messages with other accounts, oldest first. */
  async function history(req, res) {
    const account = await loggedIn(req, res);
    if (!account) return;
    const me = chatIdOf(account);
    const found = await messages.find({ $or: [{ from: me }, { to: me }] }).sort({ at: -1 }).limit(HISTORY).toArray();
    const list = found.reverse().filter((m) => isAccountChat(m.from) && isAccountChat(m.to) && m.from !== m.to).map(toWire);
    const marks = await reads.find({ me }, { projection: { with: 1, at: 1 } }).toArray();
    json(res, 200, { messages: list, reads: Object.fromEntries(marks.map((r) => [r.with, new Date(r.at).toISOString()])) });
  }

  /**
   * "I have read my conversation with `with` up to `at`" (the time of its newest message). Kept per account, so a
   * conversation read on one phone or tab is read on all of them. A mark only moves forward, and never past the server's clock.
   */
  async function read(req, res) {
    if (limited(req, 'read', 120)) return json(res, 429, { error: 'Too many requests.' });
    const account = await loggedIn(req, res);
    if (!account) return;
    const b = await readJson(req, CHAT_BODY);
    const me = chatIdOf(account);
    const other = str(b.with, 64);
    const when = typeof b.at === 'string' ? new Date(b.at) : null;
    if (!isAccountChat(other) || other === me || !when || Number.isNaN(when.getTime())) return json(res, 400, { error: 'Bad read mark' });
    const id = `${me}|${other}`;
    await reads.updateOne({ _id: id }, { $max: { at: new Date(Math.min(when.getTime(), Date.now())) }, $setOnInsert: { me, with: other } }, { upsert: true });
    const saved = await reads.findOne({ _id: id }, { projection: { at: 1 } });
    const mark = { with: other, at: new Date(saved.at).toISOString() };
    deliverRead(me, mark);
    json(res, 200, mark);
  }

  async function send(req, res) {
    if (limited(req, 'send', 60)) return json(res, 429, { error: 'Slow down a little.' });
    const account = await loggedIn(req, res);
    if (!account) return;
    const b = await readJson(req, CHAT_BODY);
    const from = chatIdOf(account); // always the logged-in account: nobody can send in someone else's name
    const to = str(b.to, 64);
    const text = str(b.text, 2000).trim();
    const joined = new Set((await profiles.find({ _id: { $in: [from, to] } }, { projection: { _id: 1 } }).toArray()).map((p) => p._id));
    if (!joined.has(from)) return json(res, 409, { error: NOT_JOINED });
    if (!isAccountChat(to) || !joined.has(to) || to === from) return json(res, 404, { error: 'Recipient not found' });
    if (!text) return json(res, 400, { error: 'Message is empty' });
    const saved = await messages.findOneAndUpdate(
      { _id: randomBytes(8).toString('hex') },
      { $setOnInsert: { from, to, text }, $currentDate: { at: true } },
      { upsert: true, returnDocument: 'after' },
    );
    const msg = toWire(saved);
    deliver(msg);
    json(res, 200, { id: msg.id, at: msg.at });
  }

  /** A one-time ticket for the live stream (see the top of this file). */
  async function ticket(req, res) {
    if (limited(req, 'ticket', 30)) return json(res, 429, { error: 'Too many requests.' });
    const account = await loggedIn(req, res);
    if (!account) return;
    const id = chatIdOf(account);
    if (!(await profiles.findOne({ _id: id }, { projection: { _id: 1 } }))) return json(res, 409, { error: NOT_JOINED });
    const t = randomBytes(24).toString('base64url');
    await tickets.insertOne({ _id: sha256(t), chatId: id, expiresAt: new Date(Date.now() + TICKET_MS) });
    json(res, 200, { ticket: t });
  }

  /** Live messages for the user named by a one-time ticket (server-sent events). */
  async function stream(req, res, url) {
    let gone = false;
    res.on('close', () => { gone = true; endStream(res); }); // the phone went away, or the stream was ended here
    const given = url.searchParams.get('ticket') || '';
    // Used up whatever happens, on whichever copy of the server it is used.
    const t = given && given.length <= 100 ? await tickets.findOneAndDelete({ _id: sha256(given) }) : null;
    const ok = t && t.expiresAt.getTime() > Date.now() && (await profiles.findOne({ _id: t.chatId }, { projection: { _id: 1 } }));
    if (gone) return;
    if (!ok) return json(res, 401, { error: 'Please connect again.' });
    // X-Accel-Buffering: a proxy in front (nginx and others) must pass each message on at once, not collect them.
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...cors() });
    res.write(': connected\n\n');
    if (!streams.has(t.chatId)) streams.set(t.chatId, new Set());
    const mine = streams.get(t.chatId);
    if (mine.size >= STREAMS_PER_USER) endStream(mine.values().next().value);
    mine.add(res);
    pings.set(res, setInterval(() => res.write(': ping\n\n'), 25_000));
    pollSoon();
  }

  // ---------------------------------------------------------------- the chat file from before MongoDB
  /**
   * Moves the chat of server/data.json (the store until 19 October 2026) into MongoDB, once: accounts and their messages
   * only (guests and phone ids from before log-in-only are left out). Safe to repeat: what is already there is not changed.
   * The file is then renamed to data.json.imported-<time>, never deleted. A file that cannot be read is moved aside.
   */
  async function importFile(file) {
    if (!file || !existsSync(file)) return;
    let saved;
    try {
      saved = JSON.parse(await readFile(file, 'utf8'));
      if (!saved || typeof saved.users !== 'object' || !saved.users || Array.isArray(saved.users) || !Array.isArray(saved.messages)) throw new Error('not chat data');
    } catch (e) {
      const aside = `${file}.damaged-${Date.now()}`;
      await rename(file, aside).catch(() => {});
      log.error(`Chat: ${file} could not be read (${e.message}). It was moved to ${aside}; nothing was taken from it.`);
      return;
    }
    const date = (v) => (Number.isNaN(Date.parse(v)) ? new Date() : new Date(v));
    const people = Object.values(saved.users).filter((u) => u && isAccountChat(u.id)).map((u) => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $setOnInsert: { name: str(u.name, 60), role: ROLES.includes(u.role) ? u.role : 'farmer', blurb: str(u.blurb, 140), createdAt: date(u.createdAt), updatedAt: date(u.createdAt) } },
        upsert: true,
      },
    }));
    const notes = saved.messages
      .filter((m) => m && MESSAGE_ID.test(String(m.id)) && isAccountChat(m.from) && isAccountChat(m.to) && m.from !== m.to && typeof m.text === 'string' && !Number.isNaN(Date.parse(m.at)))
      .map((m) => ({ updateOne: { filter: { _id: m.id }, update: { $setOnInsert: { from: m.from, to: m.to, text: str(m.text, 2000), at: new Date(m.at) } }, upsert: true } }));
    try {
      await database.ensureIndexes();
      for (let i = 0; i < people.length; i += 1000) await profiles.bulkWrite(people.slice(i, i + 1000), { ordered: false });
      for (let i = 0; i < notes.length; i += 1000) await messages.bulkWrite(notes.slice(i, i + 1000), { ordered: false });
    } catch (e) {
      log.error(`Chat: the old chat file ${file} could not be moved into MongoDB yet (${dbProblem(e) || e.message}). The file is kept; the next start tries again.`);
      return;
    }
    const done = `${file}.imported-${Date.now()}`;
    try {
      await rename(file, done);
      log.info(`Chat: ${people.length} people and ${notes.length} messages from ${path.basename(file)} are now in MongoDB. The file was renamed to ${path.basename(done)}.`);
    } catch (e) {
      log.error(`Chat: ${file} was copied into MongoDB but could not be renamed (${e.message}). Copying it again at the next start changes nothing.`);
    }
  }

  /** Ends every live stream on this copy (when the server stops): phones reconnect, to another copy if there is one. */
  function closeStreams() {
    stopped = true;
    clearTimeout(timer);
    timer = null;
    for (const set of [...streams.values()]) for (const r of [...set]) endStream(r);
  }

  return {
    routes: {
      'POST /api/chat/register': register, 'GET /api/chat/directory': directory, 'GET /api/chat/history': history,
      'POST /api/chat/send': send, 'POST /api/chat/read': read, 'POST /api/chat/ticket': ticket, 'GET /api/chat/stream': stream,
    },
    importFile,
    closeStreams,
    openStreams: () => pings.size,
  };
}
