import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuBell, LuSearch, LuSend } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { useHash } from '@/core/router';
import { markRead, sendMessage, setViewing, startChat, unreadCounts, useChatStatus } from '@/services/chat';
import { chatListTime, clockTime, dayLabel, isoDate } from '@/lib/format';
import { askToNotify, notifyState } from '@/lib/notify';
import { Alert, Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, Tabs, toast } from '@/components/ui';

type Tab = 'messages' | 'contacts';

export function Community() {
  const s = useAppState();
  const { query } = useHash();
  const { mode } = useChatStatus();
  const [tab, setTab] = useState<Tab>('messages');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(query.with ?? null);
  const [draft, setDraft] = useState('');
  const [alerts, setAlerts] = useState(notifyState);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Opening Community joins the chat; the connection then stays open on every page (services/chat.ts).
  useEffect(() => { void startChat(true); }, []);
  // A tapped notification opens its conversation ("#/community?with=...").
  useEffect(() => { if (query.with) setActive(query.with); }, [query.with]);
  // New messages in the open conversation are read at once, not announced.
  useEffect(() => { setViewing(active); return () => setViewing(null); }, [active]);

  const last = useMemo(() => {
    const m = new Map<string, (typeof s.chats)[number]>();
    for (const c of s.chats) { const p = m.get(c.contactId); if (!p || p.at < c.at) m.set(c.contactId, c); }
    return m;
  }, [s.chats]);
  const unread = useMemo(() => unreadCounts(s), [s.chats, s.chatRead]);

  const ql = q.trim().toLowerCase();
  const contacts = s.contacts
    .filter((c) => tab === 'contacts' || last.has(c.id)) // Messages: people you have talked with; Contacts: everyone
    .filter((c) => !ql || c.name.toLowerCase().includes(ql) || c.blurb.toLowerCase().includes(ql))
    .sort((a, b) => (last.get(b.id)?.at ?? '').localeCompare(last.get(a.id)?.at ?? ''));
  const cur = s.contacts.find((c) => c.id === active) ?? null;
  const thread = s.chats.filter((m) => m.contactId === active).sort((a, b) => a.at.localeCompare(b.at));
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length, active]);
  // Messages that arrive while the conversation is open (or load after opening it) count as read.
  useEffect(() => { if (active && document.visibilityState === 'visible') markRead(active); }, [active, thread.length]);

  const send = async () => {
    if (!cur || !draft.trim() || !mode) return;
    const t = draft; setDraft('');
    try { await sendMessage(cur.id, t); } catch (e) { setDraft(t); toast(`Message not sent: ${(e as Error).message}`); }
  };

  const alertsControl = mode !== 'online' ? null
    : alerts === 'default' ? <Button size="sm" variant="secondary" onClick={async () => setAlerts(await askToNotify())}><LuBell size={14} /> Alert me of new messages</Button>
      : alerts === 'granted' ? <Badge><LuBell size={12} /> Message alerts on</Badge>
        : alerts === 'denied' ? <span className="tiny muted">Message alerts are blocked in this browser's settings.</span> : null;

  return (
    <div className="page">
      <PageHeader title="Community & Chat" sub="Talk to suppliers, buyers and other growers." actions={alertsControl} />
      <div className="stack">
        {mode === null ? <div className="row"><Spinner /> Connecting…</div> : null}
        {mode === 'offline' ? <Alert tone="orange" title="Chat is offline">May-Ani cannot reach its server right now (no internet?). Your conversations stay readable; new messages arrive and you can send again when the connection is back.</Alert> : null}
        {mode === 'off' ? <Alert tone="orange" title="Chat is not available">This May-Ani server has no accounts set up, so chat is switched off.</Alert> : null}
        <div className="chat-layout">
          <Card className={cur ? 'only-desktop' : ''}>
            <div className="stack sm">
              <div className="input-group"><span className="row" style={{ padding: '0 6px' }}><LuSearch size={16} /></span><input className="input" aria-label="Search" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Tabs tabs={[{ id: 'messages', label: 'Messages' }, { id: 'contacts', label: 'Contacts' }]} value={tab} onChange={setTab} />
              {contacts.length === 0 ? <Empty icon="💬" title={ql ? 'Nothing matches your search' : tab === 'messages' ? 'No conversations yet' : 'No one here yet'}>
                {ql ? 'Try another name or place.' : tab === 'messages' ? 'Open Contacts to find a supplier, buyer or grower and say hello.' : 'Other May-Ani users appear here when they open Community.'}
              </Empty> : contacts.map((c) => {
                const l = last.get(c.id);
                const n = unread.get(c.id) ?? 0;
                return (
                  <button key={c.id} className={`convo ${active === c.id ? 'on' : ''} ${n ? 'unread' : ''}`} onClick={() => setActive(c.id)}
                    aria-label={n ? `${c.name}, ${n} unread message${n === 1 ? '' : 's'}` : undefined}>
                    <Avatar name={c.name} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="nm">{c.name}</div>
                      <div className="ms">{l ? `${l.from === 'me' ? 'You: ' : ''}${l.text}` : c.blurb}</div>
                    </div>
                    <div className="convo-side">
                      {l ? <span className="tiny">{chatListTime(l.at)}</span> : null}
                      {n ? <span className="count">{n > 99 ? '99+' : n}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className={cur ? '' : 'only-desktop'}>
            {cur ? (
              <div className="thread">
                <div className="row" style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <button className="icon-btn only-mobile" aria-label="Back" onClick={() => setActive(null)}><LuArrowLeft size={20} /></button>
                  <Avatar name={cur.name} />
                  <div className="grow"><div className="bold">{cur.name}</div><div className="small muted">{cur.blurb}</div></div>
                </div>
                <div className="msgs" aria-live="polite">
                  {thread.length === 0 ? <p className="small muted" style={{ margin: 'auto' }}>Say hello 👋</p> : thread.map((m, i) => {
                    const newDay = i === 0 || isoDate(new Date(thread[i - 1].at)) !== isoDate(new Date(m.at));
                    const mine = m.from === 'me';
                    return (
                      <Fragment key={m.id}>
                        {newDay ? <div className="day-sep">{dayLabel(m.at)}</div> : null}
                        {/* sent on the right, received on the left (screen readers hear who wrote it) */}
                        <div className={`bubble ${mine ? 'me' : 'them'}`}>
                          <span className="sr-only">{mine ? 'You' : cur.name}: </span>{m.text}<time dateTime={m.at}>{clockTime(m.at)}</time>
                        </div>
                      </Fragment>
                    );
                  })}
                  <div ref={endRef} />
                </div>
                <form className="input-group" onSubmit={(e) => { e.preventDefault(); send(); }}>
                  <input className="input" aria-label="Message" placeholder="Type a message" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <Button type="submit" disabled={!draft.trim() || mode !== 'online'}><LuSend size={16} /> Send</Button>
                </form>
              </div>
            ) : <Empty icon="💬" title="Choose a conversation">Pick a conversation on the left, or find someone in Contacts.</Empty>}
          </Card>
        </div>
      </div>
    </div>
  );
}
