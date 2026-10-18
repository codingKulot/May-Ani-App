import { useSyncExternalStore } from 'react';
import { getState, setState, uid } from '@/core/store';
import type { AppState, ChatContact, ChatMessage } from '@/types';
import { ApiError, chatApi, serverStatus, type DirectoryUser, type ServerMessage } from './ai';

/**
 * Chat between logged-in May-Ani users (server/index.mjs /api/chat/*). Everyone in it is a real account ("acct-<id>", the same
 * on every phone, with the account's name); every call carries the login, and there are no guests or sample contacts.
 * Without the server (no signal), the conversations already on this phone stay readable and sending waits for the connection.
 * Once this phone has joined (opened Community), the connection stays open on every page, so new messages show as unread
 * counts, a short notice and, when allowed, a phone notification (App.tsx). Phones that never opened Community do not connect,
 * so nobody is listed in the directory without choosing to chat.
 * The UI only talks to this module and the app state, so a different backend can replace it without UI changes.
 */

export function addLocalMessage(contactId: string, from: 'me' | 'them', text: string, at = new Date().toISOString(), id = uid()) {
  setState((s) => (s.chats.some((m) => m.id === id) ? s : { ...s, chats: [...s.chats, { id, contactId, from, text, at }] }));
}

const roleToKind = (role: string): ChatContact['kind'] => (role === 'supplier' || role === 'buyer' || role === 'expert' ? 'business' : 'person');
const toContacts = (users: DirectoryUser[], me: string): ChatContact[] =>
  users.filter((u) => u.id !== me).map((u) => ({ id: u.id, name: u.name, kind: roleToKind(u.role), blurb: u.blurb }));
/** A server message as this phone keeps it: `contactId` is the other person, `from` says which side of the chat it goes on. */
export const toLocal = (m: ServerMessage, me: string): ChatMessage =>
  ({ id: m.id, contactId: m.from === me ? m.to : m.from, from: m.from === me ? 'me' : 'them', text: m.text, at: m.at });

// ------------------------------------------------------------------ unread
/**
 * Unread messages per conversation: messages from them that are newer than the newest one read on this phone.
 * Only people in the contact list count, so a message from someone no longer in the chat never shows a count nobody can clear.
 */
export function unreadCounts(s: Pick<AppState, 'chats' | 'chatRead' | 'contacts'>): Map<string, number> {
  const known = new Set(s.contacts.map((c) => c.id));
  const out = new Map<string, number>();
  for (const m of s.chats) {
    if (m.from === 'them' && known.has(m.contactId) && m.at > (s.chatRead[m.contactId] ?? '')) out.set(m.contactId, (out.get(m.contactId) ?? 0) + 1);
  }
  return out;
}

export function totalUnread(s: Pick<AppState, 'chats' | 'chatRead' | 'contacts'>): number {
  let n = 0;
  for (const v of unreadCounts(s).values()) n += v;
  return n;
}

/** Marks a conversation read up to its newest message. */
export function markRead(contactId: string) {
  setState((s) => {
    const was = s.chatRead[contactId] ?? '';
    let newest = was;
    for (const m of s.chats) if (m.contactId === contactId && m.at > newest) newest = m.at;
    return newest === was ? s : { ...s, chatRead: { ...s.chatRead, [contactId]: newest } };
  });
}

/** The conversation open on screen (Community sets it): its new messages are read at once instead of announced. */
let viewing: string | null = null;
export function setViewing(contactId: string | null) {
  viewing = contactId;
  if (contactId) markRead(contactId);
}

// ------------------------------------------------------------------ new-message notices (App.tsx shows them)
export interface IncomingNotice { contactId: string; name: string; text: string }
const incomingListeners = new Set<(n: IncomingNotice) => void>();
/** Called for each new message from someone else that is not already on screen. Returns the unsubscribe function. */
export function onIncomingMessage(cb: (n: IncomingNotice) => void): () => void {
  incomingListeners.add(cb);
  return () => { incomingListeners.delete(cb); };
}

function announce(m: ChatMessage) {
  if (viewing === m.contactId && document.visibilityState === 'visible') { markRead(m.contactId); return; }
  const name = getState().contacts.find((c) => c.id === m.contactId)?.name ?? 'Someone';
  incomingListeners.forEach((l) => l({ contactId: m.contactId, name, text: m.text }));
}

// ------------------------------------------------------------------ connection
/**
 * 'online' (connected to the chat), 'offline' (the server cannot be reached: earlier messages stay readable), 'off' (this server
 * has no accounts, so no chat), or null while connecting. `me` is this user's chat id.
 */
export interface ChatStatus { mode: 'online' | 'offline' | 'off' | null; me: string | null }
let status: ChatStatus = { mode: null, me: null };
const statusListeners = new Set<() => void>();
const setStatus = (s: ChatStatus) => { status = s; statusListeners.forEach((l) => l()); };
export function useChatStatus(): ChatStatus {
  return useSyncExternalStore((cb) => { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; }, () => status);
}

let stream: EventSource | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let retryMs = 3000;
let connecting: Promise<void> | null = null;
/** Who the connection is for: profile id + account id. Logging in or out on this phone starts a new connection. */
let connectedFor = '';
const whoKey = () => { const p = getState().profile; return p?.account ? `${p.id}|${p.account.id}` : ''; };

export function stopChat() {
  clearTimeout(retry);
  stream?.close();
  stream = null;
  connectedFor = '';
  if (status.mode !== null) setStatus({ mode: null, me: null });
}

/**
 * Opens the chat connection, once for the whole app (logged-in users only). `join` = the user opened Community: it may list
 * them in the directory. Without it, only a phone that joined before connects (to watch for new messages on every page).
 */
export function startChat(join = false): Promise<void> {
  const k = whoKey();
  if (!k) { stopChat(); return Promise.resolve(); }
  if (connectedFor && connectedFor !== k) stopChat();
  if (connecting) return connecting;
  if (status.mode === 'online' && connectedFor === k) return Promise.resolve();
  if (!join && !getState().chatJoined) return Promise.resolve();
  connectedFor = k;
  connecting = connect(k).finally(() => { connecting = null; });
  return connecting;
}

async function connect(k: string) {
  try { localStorage.removeItem('may-ani.chatToken'); } catch { /* the separate chat password of earlier versions */ }
  const server = await serverStatus(true);
  if (!server) { setStatus({ mode: 'offline', me: null }); return; }
  if (!server.chat) { setStatus({ mode: 'off', me: null }); return; }
  try {
    const profile = getState().profile!;
    const me = await chatApi.register({ blurb: `${profile.location.name}, ${profile.location.province}` });
    const [{ users }, { messages }] = await Promise.all([chatApi.directory(), chatApi.history()]);
    if (whoKey() !== k) return; // logged out or in while connecting
    setState((s) => ({ ...s, chatJoined: true, contacts: toContacts(users, me), chats: messages.map((m) => toLocal(m, me)) }));
    setStatus({ mode: 'online', me });
    await openStream();
  } catch (e) {
    if (whoKey() !== k) return;
    setStatus({ mode: e instanceof ApiError && e.code === 'accounts_off' ? 'off' : 'offline', me: null });
    if (!(e instanceof ApiError && e.status === 401)) scheduleRetry(); // a login that ended is handled by App.tsx and sync
  }
}

/** Opens the live stream with a fresh one-time ticket. A drop is retried with a new ticket, waiting longer each time. */
async function openStream() {
  clearTimeout(retry);
  stream?.close();
  stream = null;
  let url: string;
  try { url = await chatApi.streamUrl(); } catch { scheduleRetry(); return; }
  const me = status.me;
  if (!me) return;
  const es = new EventSource(url);
  es.addEventListener('open', () => { retryMs = 3000; });
  es.addEventListener('message', async (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse((ev as MessageEvent).data) as ServerMessage; } catch { return; /* ignore a malformed event */ }
    if (getState().chats.some((c) => c.id === m.id)) return;
    addLocalMessage(m.from, 'them', m.text, m.at, m.id);
    // Someone who joined after the list was loaded: fetch the list first, so the notice can say who wrote.
    if (!getState().contacts.some((c) => c.id === m.from)) await refresh(false);
    announce(toLocal(m, me));
  });
  // A ticket works once, so the browser's own reconnect cannot succeed: close and start again with a new ticket.
  es.addEventListener('error', () => {
    es.close();
    if (stream === es) { stream = null; scheduleRetry(); }
  });
  stream = es;
}

function scheduleRetry() {
  clearTimeout(retry);
  if (!connectedFor) return;
  retry = setTimeout(async () => {
    if (!connectedFor) return;
    if (status.mode === 'online') { await openStream(); void refresh(true); } else void reconnect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 60_000);
}

async function reconnect() {
  const k = connectedFor;
  if (!k || connecting) return;
  connecting = connect(k).finally(() => { connecting = null; });
  await connecting;
}

/** Fetches the directory and the messages again; `announceNew` tells about the newest message that arrived meanwhile. */
async function refresh(announceNew: boolean) {
  const me = status.me;
  if (!me) return;
  try {
    const [{ users }, { messages }] = await Promise.all([chatApi.directory(), chatApi.history()]);
    if (status.me !== me) return;
    const known = new Set(getState().chats.map((c) => c.id));
    const chats = messages.map((m) => toLocal(m, me));
    setState((s) => ({ ...s, contacts: toContacts(users, me), chats }));
    const fresh = chats.filter((m) => m.from === 'them' && !known.has(m.id));
    if (announceNew && fresh.length) announce(fresh[fresh.length - 1]);
  } catch { /* still offline: the next reconnect tries again */ }
}

// A phone app in the background may lose the live connection: catch up when it comes back, or when the internet returns.
if (typeof window !== 'undefined') {
  const catchUp = () => {
    if (document.visibilityState !== 'visible' || !connectedFor) return;
    if (viewing) markRead(viewing);
    if (status.mode === 'online' && !stream) { void openStream(); void refresh(true); }
    else if (status.mode === 'offline') void reconnect();
  };
  document.addEventListener('visibilitychange', catchUp);
  window.addEventListener('online', catchUp);
}

export async function sendMessage(contactId: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  if (status.mode !== 'online') throw new Error('Chat is not connected. Check your internet and try again.');
  try {
    const r = await chatApi.send({ to: contactId, text: clean });
    addLocalMessage(contactId, 'me', clean, r.at, r.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) void refresh(false); // that person left the chat: reload the list
    throw e;
  }
  markRead(contactId); // answering means everything before it was seen
}
