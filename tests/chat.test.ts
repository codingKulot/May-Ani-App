import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getState, resetState, setState } from '@/core/store';
import { markRead, toLocal, totalUnread, unreadCounts } from '@/services/chat';
import { chatListTime, dayLabel } from '@/lib/format';
import type { ChatContact, ChatMessage } from '@/types';
import { call, signUpUser, startMongo, startServer, type Srv } from './support/server';

/**
 * Chat is for logged-in users only: which side a message goes on, unread counts, and the server's rules (every call needs the
 * account login, the sender is always the logged-in account, old guest entries are hidden, live stream by one-time ticket).
 * The server tests use a throwaway MongoDB.
 */

// ------------------------------------------------------------------ the app's side
const msg = (id: string, contactId: string, from: 'me' | 'them', at: string): ChatMessage => ({ id, contactId, from, text: id, at });
const person = (id: string): ChatContact => ({ id, name: id, kind: 'person', blurb: '' });

describe('which side a message goes on', () => {
  test('sent by me on the right, from anyone else on the left, filed under the other person', () => {
    expect(toLocal({ id: 'm1', from: 'acct-me', to: 'acct-u2', text: 'Hi', at: 't' }, 'acct-me')).toEqual({ id: 'm1', contactId: 'acct-u2', from: 'me', text: 'Hi', at: 't' });
    expect(toLocal({ id: 'm2', from: 'acct-u2', to: 'acct-me', text: 'Hello', at: 't' }, 'acct-me')).toEqual({ id: 'm2', contactId: 'acct-u2', from: 'them', text: 'Hello', at: 't' });
  });
});

describe('unread messages', () => {
  beforeEach(() => resetState());
  const contacts = [person('u1'), person('u2')];

  test('messages from them newer than the last read one are unread; my own never are', () => {
    const chats = [
      msg('a', 'u1', 'them', '2026-10-18T01:00:00Z'), msg('b', 'u1', 'them', '2026-10-18T02:00:00Z'),
      msg('c', 'u1', 'me', '2026-10-18T03:00:00Z'), msg('d', 'u2', 'them', '2026-10-18T04:00:00Z'),
    ];
    expect([...unreadCounts({ chats, chatRead: {}, contacts })]).toEqual([['u1', 2], ['u2', 1]]);
    expect([...unreadCounts({ chats, chatRead: { u1: '2026-10-18T01:00:00Z' }, contacts })]).toEqual([['u1', 1], ['u2', 1]]);
    expect(totalUnread({ chats, chatRead: { u1: '2026-10-18T03:00:00Z' }, contacts })).toBe(1);
  });

  test('someone no longer in the chat never leaves a count that cannot be cleared', () => {
    expect(totalUnread({ chats: [msg('a', 'gone', 'them', '2026-10-18T01:00:00Z')], chatRead: {}, contacts })).toBe(0);
  });

  test('opening a conversation reads it up to its newest message, and only that one', () => {
    setState((s) => ({ ...s, contacts, chats: [msg('a', 'u1', 'them', '2026-10-18T01:00:00Z'), msg('b', 'u2', 'them', '2026-10-18T02:00:00Z')] }));
    markRead('u1');
    expect(getState().chatRead).toEqual({ u1: '2026-10-18T01:00:00Z' });
    expect(totalUnread(getState())).toBe(1);
  });
});

describe('chat times', () => {
  const now = new Date('2026-10-18T10:00:00');
  test('day separators and list times read like a messaging app', () => {
    expect(dayLabel('2026-10-18T08:00:00', now)).toBe('Today');
    expect(dayLabel('2026-10-17T08:00:00', now)).toBe('Yesterday');
    expect(dayLabel('2026-10-03T08:00:00', now)).toBe('October 3');
    expect(dayLabel('2025-12-31T08:00:00', now)).toBe('December 31, 2025');
    expect(chatListTime('2026-10-18T08:05:00', now)).toMatch(/^8:05\s?AM$/i);
    expect(chatListTime('2026-10-17T08:00:00', now)).toBe('Yesterday');
    expect(chatListTime('2026-10-03T08:00:00', now)).toBe('Oct 3');
  });
});

// ------------------------------------------------------------------ the server's side
const mongo = await startMongo('chat tests');
// Chat data from before guest mode was removed: a guest and a phone id, which must stay hidden.
const dir = mkdtempSync(join(tmpdir(), 'may-ani-chat-'));
writeFileSync(join(dir, 'data.json'), JSON.stringify({
  users: { 'phone-old-guest': { id: 'phone-old-guest', name: 'Old Guest', role: 'farmer', blurb: '', token: 'x'.repeat(48) } },
  messages: [],
}));
const srv: Srv | null = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: 'may_ani_chat_test' }, dir) : null;
afterAll(async () => { srv?.stop(); await mongo?.stop(); rmSync(dir, { recursive: true, force: true }); });

const chat = (method: string, path: string, token?: string, body?: unknown) => call(srv!, method, path, body, token);
const join_ = (token: string, blurb = 'Davao City') => chat('POST', '/api/chat/register', token, { blurb });

/** Reads a live stream until `want` shows up (or a few seconds pass). */
async function readStream(url: string, want: string) {
  const ctl = new AbortController();
  const r = await fetch(url, { signal: ctl.signal });
  if (r.status !== 200) return { status: r.status, text: '' };
  const reader = r.body!.getReader();
  let text = '';
  const until = Date.now() + 5000;
  while (!text.includes(want) && Date.now() < until) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  ctl.abort();
  return { status: 200, text };
}

describe.skipIf(!mongo)('chat on the server (logged-in users only)', () => {
  test('without a login nobody can join, list people, read or send', async () => {
    expect((await chat('POST', '/api/chat/register', undefined, { blurb: 'x' })).status).toBe(401);
    expect((await chat('GET', '/api/chat/directory')).status).toBe(401);
    expect((await chat('GET', '/api/chat/history')).status).toBe(401);
    expect((await chat('POST', '/api/chat/send', undefined, { to: 'acct-x', text: 'Buy my fertilizer' })).status).toBe(401);
    expect((await chat('POST', '/api/chat/ticket')).status).toBe(401);
    expect((await chat('GET', '/api/chat/directory', 'not-a-real-login-token-at-all')).status).toBe(401);
  });

  test('an account has one chat id with its own name on every phone; old guests are not listed', async () => {
    const maria = await signUpUser(srv!, 'Maria Santos');
    const first = await join_(maria.token);
    const again = await join_(maria.token, 'Tagum City');
    expect(first.body.id).toBe(`acct-${maria.id}`);
    expect(again.body.id).toBe(first.body.id);
    const users = (await chat('GET', '/api/chat/directory', maria.token)).body.users as { id: string; name: string; blurb: string }[];
    expect(users.find((u) => u.id === first.body.id)).toEqual({ id: first.body.id, name: 'Maria Santos', role: 'farmer', blurb: 'Tagum City' });
    expect(users.some((u) => u.id === 'phone-old-guest')).toBe(false);
    expect(users.every((u) => u.id.startsWith('acct-'))).toBe(true);
  }, 30_000);

  test('messages go from the logged-in account only, to accounts only, and land on the right side', async () => {
    const juan = await signUpUser(srv!, 'Juan');
    const ana = await signUpUser(srv!, 'Ana');
    const juanId = (await join_(juan.token)).body.id;
    const anaId = (await join_(ana.token)).body.id;

    // "from" in the body is ignored: the sender is always whoever is logged in
    const sent = await chat('POST', '/api/chat/send', juan.token, { from: anaId, to: anaId, text: 'Naa pa moy talong?' });
    expect(sent.status).toBe(200);
    expect((await chat('POST', '/api/chat/send', juan.token, { to: 'phone-old-guest', text: 'hi' })).status).toBe(404);
    expect((await chat('POST', '/api/chat/send', juan.token, { to: juanId, text: 'me' })).status).toBe(404);

    const anas = (await chat('GET', '/api/chat/history', ana.token)).body.messages.map((m: any) => toLocal(m, anaId));
    expect(anas.map((m: ChatMessage) => [m.text, m.from, m.contactId])).toEqual([['Naa pa moy talong?', 'them', juanId]]);
    const juans = (await chat('GET', '/api/chat/history', juan.token)).body.messages.map((m: any) => toLocal(m, juanId));
    expect(juans.map((m: ChatMessage) => [m.text, m.from, m.contactId])).toEqual([['Naa pa moy talong?', 'me', anaId]]);
  }, 30_000);

  test('the live stream opens with a one-time ticket, never with the login token in the address', async () => {
    const pedro = await signUpUser(srv!, 'Pedro');
    const rosa = await signUpUser(srv!, 'Rosa');
    await join_(pedro.token);
    const rosaId = (await join_(rosa.token)).body.id;
    expect((await chat('POST', '/api/chat/ticket', await signUpUser(srv!, 'Not Joined').then((u) => u.token))).status).toBe(409);

    const { ticket } = (await chat('POST', '/api/chat/ticket', rosa.token)).body;
    const url = `${srv!.url}/api/chat/stream?ticket=${encodeURIComponent(ticket)}`;
    const live = readStream(url, 'Sige, salamat');
    await new Promise((r) => setTimeout(r, 300));
    await chat('POST', '/api/chat/send', pedro.token, { to: rosaId, text: 'Sige, salamat' });
    const got = await live;
    expect(got.status).toBe(200);
    expect(got.text).toContain('event: message');
    expect(got.text).toContain('Sige, salamat');
    expect((await fetch(url)).status).toBe(401); // the same ticket again
    expect((await fetch(`${srv!.url}/api/chat/stream?ticket=made-up`)).status).toBe(401);
    expect((await fetch(`${srv!.url}/api/chat/stream?userId=${rosaId}&token=${rosa.token}`)).status).toBe(401); // the old way
  }, 30_000);
});
