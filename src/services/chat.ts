import { useSyncExternalStore } from 'react';
import { getState, setState, uid } from '@/core/store';
import type { AppState, ChatContact, ChatMessage } from '@/types';
import { ApiError, chatApi, serverStatus, type DirectoryUser, type ServerMessage } from './ai';
import { sessionToken } from './auth';

/**
 * Chat works in two modes:
 *  - server: real users via server/index.mjs (register -> directory -> SSE stream). A logged-in user's chat identity is the
 *    account's ("acct-<id>", the same on every phone, from the server); a guest's is this phone's profile id.
 *  - local:  clearly-labelled SAMPLE contacts so the UI is usable offline / before a server exists
 * Once this phone has joined (opened Community with a server), the connection stays open on every page, so new messages show
 * as unread counts, a short notice and, when allowed, a phone notification (App.tsx). Phones that never opened Community do
 * not connect, so nobody is listed in the directory without choosing to chat.
 * The UI only talks to this module and the app state, so a different backend can replace it without UI changes.
 */

export const SAMPLE_CONTACTS: ChatContact[] = [
  { id: 'sample-greenfields', name: 'GreenFields Supplier', kind: 'business', blurb: 'Organic fertilizer & seedlings', sample: true },
  { id: 'sample-tilapia', name: 'Tilapia Farmers PH', kind: 'group', blurb: 'Group - tilapia growers', sample: true },
  { id: 'sample-agritech', name: 'AgriTech Experts', kind: 'business', blurb: 'Technical advice', sample: true },
  { id: 'sample-rizal', name: 'Rizal Vegetable Growers', kind: 'group', blurb: 'Group - vegetable growers', sample: true },
  { id: 'sample-buyers', name: 'Local Buyers - Nueva Ecija', kind: 'business', blurb: 'Buyers of fresh produce', sample: true },
];

const SAMPLE_MESSAGES: Omit<ChatMessage, 'id' | 'at'>[] = [
  { contactId: 'sample-greenfields', from: 'them', text: 'Hi! We have available organic fertilizer. Want a quote?' },
  { contactId: 'sample-tilapia', from: 'them', text: 'Isang tanong lang po tungkol sa feeding schedule...' },
  { contactId: 'sample-agritech', from: 'them', text: 'Welcome! Send a photo of your problem and we will take a look.' },
  { contactId: 'sample-rizal', from: 'them', text: 'Magkano po ang current price ng kangkong?' },
  { contactId: 'sample-buyers', from: 'them', text: 'Looking for fresh vegetables. PM me.' },
];

/** Sample contacts and their first messages, already read (they are examples, not news). */
export function ensureSampleData() {
  const s = getState();
  if (s.contacts.length > 0) return;
  const now = Date.now();
  const chats = SAMPLE_MESSAGES.map((m, i) => ({ ...m, id: uid(), at: new Date(now - (i + 1) * 3_600_000 * 5).toISOString() }));
  setState((st) => ({ ...st, contacts: SAMPLE_CONTACTS, chats, chatRead: { ...st.chatRead, ...Object.fromEntries(chats.map((m) => [m.contactId, m.at])) } }));
}

export const isSample = (contactId: string) => contactId.startsWith('sample-');

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
/** Unread messages per conversation: messages from them that are newer than the newest one read on this phone. */
export function unreadCounts(s: Pick<AppState, 'chats' | 'chatRead'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of s.chats) {
    if (m.from === 'them' && m.at > (s.chatRead[m.contactId] ?? '')) out.set(m.contactId, (out.get(m.contactId) ?? 0) + 1);
  }
  return out;
}

export function totalUnread(s: Pick<AppState, 'chats' | 'chatRead'>): number {
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
export interface ChatStatus { mode: 'server' | 'local' | null; me: string | null }
let status: ChatStatus = { mode: null, me: null };
const statusListeners = new Set<() => void>();
const setStatus = (s: ChatStatus) => { status = s; statusListeners.forEach((l) => l()); };
/** 'server' (real people), 'local' (sample contacts), or null while connecting; `me` is this user's chat id on the server. */
export function useChatStatus(): ChatStatus {
  return useSyncExternalStore((cb) => { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; }, () => status);
}

let stream: EventSource | null = null;
let connecting: Promise<void> | null = null;
/** Who the connection is for: profile id + account id. Logging in or out on this phone starts a new connection. */
let connectedFor = '';
const whoKey = () => { const p = getState().profile; return p ? `${p.id}|${p.account?.id ?? ''}` : ''; };

export function stopChat() {
  stream?.close();
  stream = null;
  connectedFor = '';
  if (status.mode !== null) setStatus({ mode: null, me: null });
}

/**
 * Opens the chat connection, once for the whole app. `join` = the user opened Community: it may list this phone in the
 * directory. Without it, only a phone that joined before connects (to watch for new messages on every page).
 */
export function startChat(join = false): Promise<void> {
  const k = whoKey();
  if (!k) { stopChat(); return Promise.resolve(); }
  if (connectedFor && connectedFor !== k) stopChat();
  if (connecting) return connecting;
  if (status.mode === 'server' && connectedFor === k) return Promise.resolve();
  if (!join && !getState().chatJoined) return Promise.resolve();
  connectedFor = k;
  connecting = connect(k).finally(() => { connecting = null; });
  return connecting;
}

async function connect(k: string) {
  const profile = getState().profile!;
  const server = await serverStatus();
  if (!server?.chat) { ensureSampleData(); setStatus({ mode: 'local', me: null }); return; }
  try {
    const { id: me } = await chatApi.register({
      id: profile.id, name: profile.name, role: profile.role, blurb: `${profile.location.name}, ${profile.location.province}`,
      session: profile.account ? sessionToken() || undefined : undefined,
    });
    const [{ users }, { messages }] = await Promise.all([chatApi.directory(), chatApi.history(me)]);
    if (whoKey() !== k) return; // logged out or in while connecting
    setState((s) => ({
      ...s, chatJoined: true, contacts: toContacts(users, me),
      chats: messages.filter((m) => m.from !== m.to).map((m) => toLocal(m, me)),
    }));
    openStream(me);
    setStatus({ mode: 'server', me });
  } catch {
    ensureSampleData();
    setStatus({ mode: 'local', me: null });
  }
}

function openStream(me: string) {
  stream?.close();
  let dropped = false;
  const es = new EventSource(chatApi.streamUrl(me));
  es.addEventListener('message', async (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse((ev as MessageEvent).data) as ServerMessage; } catch { return; /* ignore a malformed event */ }
    if (getState().chats.some((c) => c.id === m.id)) return;
    addLocalMessage(m.from, 'them', m.text, m.at, m.id);
    // Someone who joined after the list was loaded: fetch the list first, so the notice can say who wrote.
    if (!getState().contacts.some((c) => c.id === m.from)) await refresh(false);
    announce(toLocal(m, me));
  });
  // The browser reconnects by itself after a drop (no internet, server restart); then fetch what arrived meanwhile.
  es.addEventListener('error', () => { dropped = true; });
  es.addEventListener('open', () => { if (dropped) { dropped = false; void refresh(true); } });
  stream = es;
}

/** Fetches the directory and the messages again; `announceNew` tells about the newest message that arrived meanwhile. */
async function refresh(announceNew: boolean) {
  const me = status.me;
  if (!me) return;
  try {
    const [{ users }, { messages }] = await Promise.all([chatApi.directory(), chatApi.history(me)]);
    if (status.me !== me) return;
    const known = new Set(getState().chats.map((c) => c.id));
    const chats = messages.filter((m) => m.from !== m.to).map((m) => toLocal(m, me));
    setState((s) => ({ ...s, contacts: toContacts(users, me), chats }));
    const fresh = chats.filter((m) => m.from === 'them' && !known.has(m.id));
    if (announceNew && fresh.length) announce(fresh[fresh.length - 1]);
  } catch { /* still offline: the next reconnect tries again */ }
}

// A phone app in the background may lose the live connection: catch up when it comes back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || status.mode !== 'server') return;
    if (viewing) markRead(viewing);
    if (!stream || stream.readyState === EventSource.CLOSED) { if (status.me) openStream(status.me); void refresh(true); }
  });
}

export async function sendMessage(contactId: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  if (status.mode === 'server' && status.me && !isSample(contactId)) {
    try {
      const r = await chatApi.send({ from: status.me, to: contactId, text: clean });
      addLocalMessage(contactId, 'me', clean, r.at, r.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) void refresh(false); // that person moved to their account: reload the list
      throw e;
    }
  } else {
    addLocalMessage(contactId, 'me', clean);
  }
  markRead(contactId); // answering means everything before it was seen
}
