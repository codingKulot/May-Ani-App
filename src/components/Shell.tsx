import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LuEllipsis, LuSprout } from 'react-icons/lu';
import { MORE_ITEMS, NAV, TABS, isActive } from '@/core/nav';
import { Link, useHash } from '@/core/router';
import { useAppState, useSaveProblem } from '@/core/store';
import { totalUnread } from '@/services/chat';
import { Avatar, Sheet } from './ui';

export function Brand({ light }: { light?: boolean }) {
  return (
    <span className="row" style={{ gap: 8, color: light ? '#fff' : 'var(--green-900)' }}>
      <LuSprout size={26} /> <b>May-Ani</b>
    </span>
  );
}

export function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const { path } = useHash();
  const state = useAppState();
  const { profile } = state;
  const saveProblem = useSaveProblem();
  const unread = totalUnread(state);
  /** The unread chat count on the Community / Chat menu item. */
  const countFor = (id: string) => (id === 'community' && unread > 0
    ? <span className="nav-count" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span> : null);
  const [more, setMore] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => setMore(false), [path]);

  const current = NAV.find((n) => isActive(n, path));

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand"><LuSprout size={28} /> May-Ani</div>
        <nav>
          {NAV.map((n) => (
            <Link key={n.id} to={n.path} className={isActive(n, path) ? 'active' : ''}>
              <n.Icon size={19} /> {n.label}{countFor(n.id)}
            </Link>
          ))}
        </nav>
        <div className="me">
          <Avatar name={profile?.name ?? '?'} />
          <div>
            {profile?.name}
            <small>{profile?.account?.email}</small>
          </div>
        </div>
      </aside>

      <div className="main">
        {saveProblem ? <div className="offline not-saved" role="alert">{saveProblem}</div> : null}
        {!online ? <div className="offline" role="status">You're offline - your data is safe on this device. Weather, prices and AI need a connection.</div> : null}
        <header className="topbar mobile-only">
          <Brand />
          <h1 style={{ textAlign: 'right', fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>{title ?? current?.label ?? ''}</h1>
        </header>
        {children}
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {TABS.map((n) => {
          const TabIcon = n.tab!.Icon;
          return (
            <Link key={n.id} to={n.path} className={isActive(n, path) ? 'active' : ''}>
              <span className="tab-icon"><TabIcon size={22} />{countFor(n.id)}</span>
              {n.tab!.label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-haspopup="dialog" className={MORE_ITEMS.some((m) => isActive(m, path)) ? 'active' : ''}>
          <LuEllipsis size={22} /> More
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="sheet-grid">
          {MORE_ITEMS.map((n) => (
            <Link key={n.id} to={n.path}>
              <n.Icon size={24} />
              {n.label}
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
