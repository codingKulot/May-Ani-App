import { getState, setState, uid } from '@/core/store';
import type { ChatContact, ChatMessage } from '@/types';
import { chatApi, serverStatus, type ServerMessage } from './ai';

/**
 * Chat works in two modes:
 *  - server: real users via server/index.mjs (register -> directory -> SSE stream)
 *  - local:  clearly-labelled SAMPLE contacts so the UI is usable offline / before a server exists
 * The UI only talks to this module and the app state, so a different backend (Supabase, Firebase,
 * WhatsApp Business...) can replace it without UI changes.
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

export function ensureSampleData() {
  const s = getState();
  if (s.contacts.length > 0) return;
  const now = Date.now();
  setState((st) => ({
    ...st,
    contacts: SAMPLE_CONTACTS,
    chats: SAMPLE_MESSAGES.map((m, i) => ({ ...m, id: uid(), at: new Date(now - (i + 1) * 3_600_000 * 5).toISOString() })),
  }));
}

export const isSample = (contactId: string) => contactId.startsWith('sample-');

export function addLocalMessage(contactId: string, from: 'me' | 'them', text: string, at = new Date().toISOString(), id = uid()) {
  setState((s) => (s.chats.some((m) => m.id === id) ? s : { ...s, chats: [...s.chats, { id, contactId, from, text, at }] }));
}

const roleToKind = (role: string): ChatContact['kind'] => (role === 'supplier' || role === 'buyer' || role === 'expert' ? 'business' : 'person');

export interface ChatConnection { mode: 'server' | 'local'; close: () => void }

/** Connects to the server if there is one; otherwise falls back to sample data. */
export async function connectChat(onChange: () => void): Promise<ChatConnection> {
  const profile = getState().profile;
  const status = await serverStatus();
  if (!profile || !status?.chat) {
    ensureSampleData();
    return { mode: 'local', close: () => {} };
  }
  try {
    await chatApi.register({ id: profile.id, name: profile.name, role: profile.role, blurb: `${profile.location.name}, ${profile.location.province}` });
    const [{ users }, { messages }] = await Promise.all([chatApi.directory(), chatApi.history(profile.id)]);
    setState((s) => ({
      ...s,
      contacts: users.filter((u) => u.id !== profile.id).map((u) => ({ id: u.id, name: u.name, kind: roleToKind(u.role), blurb: u.blurb })),
      chats: messages.map((m: ServerMessage) => ({
        id: m.id, contactId: m.from === profile.id ? m.to : m.from, from: m.from === profile.id ? 'me' : 'them', text: m.text, at: m.at,
      })),
    }));
    const es = new EventSource(chatApi.streamUrl(profile.id));
    es.addEventListener('message', (ev) => {
      try {
        const m = JSON.parse((ev as MessageEvent).data) as ServerMessage;
        addLocalMessage(m.from, 'them', m.text, m.at, m.id);
        onChange();
      } catch { /* ignore malformed event */ }
    });
    return { mode: 'server', close: () => es.close() };
  } catch {
    ensureSampleData();
    return { mode: 'local', close: () => {} };
  }
}

export async function sendMessage(contactId: string, text: string, mode: 'server' | 'local'): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const profile = getState().profile;
  if (mode === 'server' && profile && !isSample(contactId)) {
    const r = await chatApi.send({ from: profile.id, to: contactId, text: clean });
    addLocalMessage(contactId, 'me', clean, r.at, r.id);
  } else {
    addLocalMessage(contactId, 'me', clean);
  }
}
