import { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuSearch, LuSend } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { connectChat, isSample, sendMessage, type ChatConnection } from '@/services/chat';
import { timeAgo } from '@/lib/format';
import { Alert, Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, Tabs, toast } from '@/components/ui';

type Tab = 'messages' | 'groups' | 'contacts';

export function Community() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>('messages');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [mode, setMode] = useState<'server' | 'local' | null>(null);
  const [draft, setDraft] = useState('');
  const conn = useRef<ChatConnection | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let dead = false;
    connectChat(() => {}).then((c) => { if (dead) c.close(); else { conn.current = c; setMode(c.mode); } });
    return () => { dead = true; conn.current?.close(); };
  }, []);

  const last = useMemo(() => {
    const m = new Map<string, (typeof s.chats)[number]>();
    for (const c of s.chats) { const p = m.get(c.contactId); if (!p || p.at < c.at) m.set(c.contactId, c); }
    return m;
  }, [s.chats]);

  const ql = q.trim().toLowerCase();
  const contacts = s.contacts
    .filter((c) => (tab === 'groups' ? c.kind === 'group' : tab === 'messages' ? last.has(c.id) || true : true))
    .filter((c) => !ql || c.name.toLowerCase().includes(ql) || c.blurb.toLowerCase().includes(ql))
    .sort((a, b) => (last.get(b.id)?.at ?? '').localeCompare(last.get(a.id)?.at ?? ''));
  const cur = s.contacts.find((c) => c.id === active) ?? null;
  const thread = s.chats.filter((m) => m.contactId === active).sort((a, b) => a.at.localeCompare(b.at));
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length, active]);

  const send = async () => {
    if (!cur || !draft.trim() || !mode) return;
    const t = draft; setDraft('');
    try { await sendMessage(cur.id, t, mode); } catch (e) { setDraft(t); toast(`Message not sent: ${(e as Error).message}`); }
  };

  return (
    <div className="page">
      <PageHeader title="Community & Chat" sub="Talk to suppliers, buyers and other growers." />
      <div className="stack">
        {mode === null ? <div className="row"><Spinner /> Connecting…</div> : null}
        {mode === 'local' ? <Alert tone="blue" title="Sample contacts">The chat server is not connected, so these are example contacts and replies are not delivered to real people. Run the May-Ani server (see README) to chat with real users.</Alert> : null}
        <div className="chat-layout">
          <Card className={cur ? 'only-desktop' : ''}>
            <div className="stack sm">
              <div className="input-group"><span className="row" style={{ padding: '0 6px' }}><LuSearch size={16} /></span><input className="input" aria-label="Search" placeholder="Search people and groups" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Tabs tabs={[{ id: 'messages', label: 'Messages' }, { id: 'groups', label: 'Groups' }, { id: 'contacts', label: 'Contacts' }]} value={tab} onChange={setTab} />
              {contacts.length === 0 ? <Empty icon="💬" title="No one here yet">{mode === 'server' ? 'Other users will appear when they join.' : 'Nothing matches your search.'}</Empty> : contacts.map((c) => {
                const l = last.get(c.id);
                return (
                  <button key={c.id} className={`convo ${active === c.id ? 'on' : ''}`} onClick={() => setActive(c.id)}>
                    <Avatar name={c.name} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="nm">{c.name} {c.sample ? <Badge tone="gray">sample</Badge> : null}</div>
                      <div className="ms">{l ? l.text : c.blurb}</div>
                    </div>
                    {l ? <span className="tiny faint">{timeAgo(l.at)}</span> : null}
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
                  {thread.length === 0 ? <p className="small muted" style={{ margin: 'auto' }}>Say hello 👋</p> : thread.map((m) => (
                    <div key={m.id} className={`bubble ${m.from === 'me' ? 'me' : ''}`}>{m.text}<time>{timeAgo(m.at)}</time></div>
                  ))}
                  <div ref={endRef} />
                </div>
                {isSample(cur.id) ? <p className="tiny muted">Sample contact: your messages stay on this device.</p> : null}
                <form className="input-group" onSubmit={(e) => { e.preventDefault(); send(); }}>
                  <input className="input" aria-label="Message" placeholder="Type a message" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <Button type="submit" disabled={!draft.trim()}><LuSend size={16} /> Send</Button>
                </form>
              </div>
            ) : <Empty icon="💬" title="Choose a conversation">Pick a supplier, buyer or group on the left.</Empty>}
          </Card>
        </div>
      </div>
    </div>
  );
}
