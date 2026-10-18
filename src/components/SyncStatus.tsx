import { useEffect, useState } from 'react';
import { LuRefreshCw } from 'react-icons/lu';
import { SYNC_MAX_BYTES, syncNow, useSyncStatus, type SyncStatus } from '@/services/sync';
import { Badge, Button } from '@/components/ui';

/** "just now", "2 min ago", "3 hours ago", "yesterday", "on 3 Oct". */
export function agoText(ms: number, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  if (h < 48) return 'yesterday';
  return `on ${new Date(ms).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}`;
}

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

/** The words and badge for the sync state, in plain language. */
export function syncWords(s: SyncStatus, now = Date.now()): { tone: 'green' | 'orange' | 'red' | 'gray' | 'blue'; badge: string; text: string } {
  const last = s.lastSyncedAt ? ` Last saved ${agoText(s.lastSyncedAt, now)}.` : '';
  switch (s.state) {
    case 'saving':
      return { tone: 'blue', badge: 'Saving…', text: 'Saving to your account…' };
    case 'saved':
      return s.pending
        ? { tone: 'orange', badge: 'Waiting', text: `${changes(s.pending)} will be saved to your account in a moment.` }
        : { tone: 'green', badge: 'Saved', text: `Saved to your account ${agoText(s.lastSyncedAt ?? now, now)}.` };
    case 'offline':
      return {
        tone: 'orange',
        badge: 'Waiting for internet',
        text: s.pending
          ? `Waiting for internet. ${changes(s.pending)} ${s.pending === 1 ? 'is' : 'are'} safe on this phone and will be saved to your account when you are online.${last}`
          : `Waiting for internet. Changes you make are kept on this phone until then.${last}`,
      };
    case 'too_big':
      return { tone: 'red', badge: 'Account full', text: s.message ?? `Your farm data is bigger than your account allows (${SYNC_MAX_BYTES / 1048576} MB). Delete old plans or records you no longer need. Everything is still on this phone.` };
    case 'error':
      return { tone: 'orange', badge: 'Not saved yet', text: `Could not save to your account right now: ${s.message ?? 'server problem'} It will try again by itself.${last}` };
    default:
      return { tone: 'gray', badge: 'Not syncing', text: 'Not linked to an account on this phone.' };
  }
}

/** Shown in Settings > Account when logged in. */
export function SyncStatusPanel() {
  const s = useSyncStatus();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // keeps "2 min ago" correct
    return () => clearInterval(t);
  }, []);
  const w = syncWords(s, now);
  return (
    <div className="stack sm" aria-live="polite">
      <div className="row wrap">
        <Badge tone={w.tone}>{w.badge}</Badge>
        <Button size="sm" variant="ghost" onClick={() => void syncNow()} disabled={s.state === 'saving'}><LuRefreshCw size={14} /> Save now</Button>
      </div>
      <p className="small">{w.text}</p>
      {s.message && s.state === 'saved' ? <p className="small muted">{s.message}</p> : null}
      <p className="small muted">
        Your farms, plans, tasks, expenses, sales, harvests and health log are saved to your account, so when you log in on another phone they come back.
        Photos and AI pictures stay on this phone only. Chat messages are not part of your account yet.
      </p>
    </div>
  );
}
