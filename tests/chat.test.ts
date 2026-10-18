import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getState, resetState, setState } from '@/core/store';
import { markRead, toLocal, totalUnread, unreadCounts } from '@/services/chat';
import { chatListTime, dayLabel } from '@/lib/format';
import type { ChatMessage } from '@/types';
import { startServer, type Srv } from './support/server';

/**
 * Chat: which side a message goes on, unread counts, and chat identity on the server (a logged-in user is the same person
 * on every phone; a guest's chat moves into the account at log-in). The server tests use a throwaway MongoDB.
 */

// ------------------------------------------------------------------ the app's side
const msg = (id: string, contactId: string, from: 'me' | 'them', at: string): ChatMessage => ({ id, contactId, from, text: id, at });

describe('which side a message goes on', () => {
  test('sent by me on the right, from anyone else on the left, filed under the other person', () => {
    expect(toLocal({ id: 'm1', from: 'acct-me', to: 'u2', text: 'Hi', at: 't' }, 'acct-me')).toEqual({ id: 'm1', contactId: 'u2', from: 'me', text: 'Hi', at: 't' });
    expect(toLocal({ id: 'm2', from: 'u2', to: 'acct-me', text: 'Hello', at: 't' }, 'acct-me')).toEqual({ id: 'm2', contactId: 'u2', from: 'them', text: 'Hello', at: 't' });
  });
});

describe('unread messages', () => {
  beforeEach(() => resetState());

  test('messages from them newer than the last read one are unread; my own never are', () => {
    const chats = [
      msg('a', 'u1', 'them', '2026-10-18T01:00:00Z'), msg('b', 'u1', 'them', '2026-10-18T02:00:00Z'),
      msg('c', 'u1', 'me', '2026-10-18T03:00:00Z'), msg('d', 'u2', 'them', '2026-10-18T04:00:00Z'),
    ];
    expect([...unreadCounts({ chats, chatRead: {} })]).toEqual([['u1', 2], ['u2', 1]]);
    expect([...unreadCounts({ chats, chatRead: { u1: '2026-10-18T01:00:00Z' } })]).toEqual([['u1', 1], ['u2', 1]]);
    expect(totalUnread({ chats, chatRead: { u1: '2026-10-18T03:00:00Z' } })).toBe(1);
  });

  test('opening a conversation reads it up to its newest message, and only that one', () => {
    setState((s) => ({ ...s, chats: [msg('a', 'u1', 'them', '2026-10-18T01:00:00Z'), msg('b', 'u2', 'them', '2026-10-18T02:00:00Z')] }));
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
const mongo = await MongoMemoryServer.create().catch((e: Error) => {
  console.warn(`\n[chat tests] SKIPPED the account chat tests: a test database could not start (${e.message}).\n`);
  return null;
});
const srv: Srv | null = mongo ? await startServer({ MONGODB_URI: mongo.getUri(), MONGODB_DB: 'may_ani_chat_test' }) : null;
afterAll(async () => { srv?.stop(); await mongo?.stop(); });

async function post(path: string, body: unknown, chatToken?: string) {
  const r = await fetch(srv!.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(chatToken ? { authorization: `Bearer ${chatToken}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const get = async (path: string, chatToken?: string) =>
  (await fetch(srv!.url + path, { headers: chatToken ? { authorization: `Bearer ${chatToken}` } : {} })).json() as Promise<any>;
const join = (id: string, name: string, extra: { session?: string; token?: string } = {}) =>
  post('/api/chat/register', { id, name, role: 'farmer', blurb: 'Davao City', session: extra.session }, extra.token);
let n = 0;
const signUp = async (name: string) => {
  const r = await post('/api/auth/signup', { name, email: `chat${++n}.${Date.now()}@example.com`, password: 'Tatlong kalabaw sa bukid' });
  return { session: r.body.token as string, accountId: r.body.user.id as string };
};
const directory = async () => ((await get('/api/chat/directory')).users as { id: string; name: string }[]);

describe.skipIf(!mongo)('chat identity on the server', () => {
  test('a guest is known by the phone\'s own id; a guest cannot take an account\'s chat id', async () => {
    const g = await join('phone-guest-1', 'Guest');
    expect(g.status).toBe(200);
    expect(g.body.id).toBe('phone-guest-1');
    expect((await join('acct-0123456789abcdef01234567', 'Pretender')).status).toBe(400);
    expect((await join('phone-guest-1', 'Thief')).status).toBe(409); // without its chat token
  });

  test('a logged-in user has one chat identity, with the account\'s name, on every phone', async () => {
    const { session, accountId } = await signUp('May Ani User One');
    const phoneA = await join('phone-a', 'whatever', { session });
    const phoneB = await join('phone-b', 'whatever', { session });
    expect(phoneA.body.id).toBe(`acct-${accountId}`);
    expect(phoneB.body.id).toBe(phoneA.body.id);
    expect(phoneB.body.token).toBe(phoneA.body.token);
    const listed = (await directory()).filter((u) => u.id === phoneA.body.id);
    expect(listed.map((u) => u.name)).toEqual(['May Ani User One']);
    expect((await join('acct-x', 'x', { session: 'not-a-real-login-token-at-all' })).status).toBe(400); // a wrong login is a guest
  }, 30_000);

  test('logging in moves the phone\'s guest chat into the account: messages keep their sides, the guest leaves the list', async () => {
    const friend = await join('phone-friend', 'Juan');
    const guest = await join('phone-guest-2', 'Guest');
    await post('/api/chat/send', { from: 'phone-guest-2', to: 'phone-friend', text: 'Hi from the guest' }, guest.body.token);
    await post('/api/chat/send', { from: 'phone-friend', to: 'phone-guest-2', text: 'Hello guest' }, friend.body.token);

    const { session } = await signUp('Maria');
    const me = await join('phone-guest-2', 'Guest', { session, token: guest.body.token });
    const acct = me.body.id as string;
    expect(acct.startsWith('acct-')).toBe(true);
    expect((await directory()).some((u) => u.id === 'phone-guest-2')).toBe(false);

    const mine = (await get(`/api/chat/history?userId=${acct}`, me.body.token)).messages.map((m: any) => toLocal(m, acct));
    expect(mine.map((m: ChatMessage) => [m.text, m.from, m.contactId])).toEqual([
      ['Hi from the guest', 'me', 'phone-friend'],
      ['Hello guest', 'them', 'phone-friend'],
    ]);
    const theirs = (await get('/api/chat/history?userId=phone-friend', friend.body.token)).messages.map((m: any) => toLocal(m, 'phone-friend'));
    expect(theirs.map((m: ChatMessage) => [m.text, m.from, m.contactId])).toEqual([
      ['Hi from the guest', 'them', acct],
      ['Hello guest', 'me', acct],
    ]);
  }, 30_000);

  test('a guest chat moves only for the phone that holds its chat token', async () => {
    const victim = await join('phone-guest-3', 'Guest');
    const { session } = await signUp('Somebody Else');
    await join('phone-guest-3', 'Guest', { session }); // no chat token for phone-guest-3
    expect((await directory()).some((u) => u.id === 'phone-guest-3')).toBe(true);
    expect((await join('phone-guest-3', 'Guest', { token: victim.body.token })).status).toBe(200);
  }, 30_000);
});
