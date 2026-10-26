import { useEffect } from 'react';
import { Router, navigate, useHash, type RouteDef } from '@/core/router';
import { askToKeepData, getState, useAppState } from '@/core/store';
import { unlinkAccount } from '@/core/actions';
import { checkSession, clearSession } from '@/services/auth';
import { startSync } from '@/services/sync';
import { onIncomingMessage, startChat, stopChat, totalUnread } from '@/services/chat';
import { notify } from '@/lib/notify';
import { Shell } from '@/components/Shell';
import { Welcome } from '@/pages/Welcome';
import { Dashboard } from '@/pages/Dashboard';
import { Farms, FarmDetail } from '@/pages/Farms';
import { Planner } from '@/pages/Planner';
import { PlanDetail } from '@/pages/PlanDetail';
import { Health } from '@/pages/Health';
import { Weather } from '@/pages/Weather';
import { Manage } from '@/pages/Manage';
import { Market } from '@/pages/Market';
import { Permits } from '@/pages/Permits';
import { Community } from '@/pages/Community';
import { Learn, LearnPath } from '@/pages/Learn';
import { Settings } from '@/pages/Settings';
import { ResetPassword } from '@/pages/ResetPassword';
import { ConfirmHost, Empty, LinkButton, ToastHost, toast } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LOGIN_ENDED = 'Your login has ended. Log in again: your farm data is still on this phone.';

/**
 * Route table. To add a page: write it in src/pages, add one line here and one NAV entry in core/nav.ts.
 */
const routes: RouteDef[] = [
  { pattern: '/', render: () => <Dashboard /> },
  { pattern: '/farms', render: () => <Farms /> },
  { pattern: '/farms/:id', render: (m) => <FarmDetail id={m.params.id} /> },
  { pattern: '/planner', render: (m) => <Planner key={m.query.edit ?? 'new'} editId={m.query.edit} /> },
  { pattern: '/plan/:id', render: (m) => <PlanDetail id={m.params.id} /> },
  { pattern: '/health', render: () => <Health /> },
  { pattern: '/weather', render: () => <Weather /> },
  { pattern: '/manage', render: () => <Manage tab="tasks" /> },
  { pattern: '/manage/:tab', render: (m) => <Manage tab={m.params.tab} /> },
  { pattern: '/market', render: () => <Market /> },
  { pattern: '/permits', render: () => <Permits /> },
  { pattern: '/community', render: () => <Community /> },
  { pattern: '/learn', render: () => <Learn /> },
  { pattern: '/learn/:id', render: (m) => <LearnPath id={m.params.id} /> },
  { pattern: '/settings', render: () => <Settings /> },
];

export function registerRoutes(extra: RouteDef[]) {
  routes.push(...extra);
}

export function App() {
  const state = useAppState();
  const { profile } = state;
  const { path, query } = useHash();
  // May-Ani is for logged-in users only (no guest mode since 18 October 2026). Without an account link (a guest profile from
  // before, or a login that ended) the log-in screen shows; the farm data on this phone is kept and goes into the account.
  const loggedIn = !!profile?.account;

  useEffect(() => {
    if (!loggedIn && path !== '/welcome' && path !== '/reset') navigate('/welcome');
    if (loggedIn && path === '/welcome') navigate('/');
  }, [loggedIn, path]);

  // Once per app start: if the server no longer accepts this login (expired, logged out elsewhere), ask for a new log-in.
  // Offline or no server: keep it as it is, so a logged-in farmer can keep working without signal.
  useEffect(() => {
    if (!getState().profile?.account) return;
    checkSession().then((r) => {
      if (r !== 'expired') return;
      clearSession();
      unlinkAccount();
      toast(LOGIN_ENDED);
    });
  }, []);

  // Farm data follows the account: saves changes and brings in other phones' changes (services/sync).
  useEffect(() => {
    startSync({ onLoginEnded: () => toast(LOGIN_ENDED) });
  }, []);

  // Once someone uses the app, ask the browser not to clear its data when space runs low.
  useEffect(() => {
    if (profile) void askToKeepData();
  }, [!!profile]);

  // Chat stays connected on every page (for phones that joined it), and starts over when someone logs in or out here.
  useEffect(() => {
    if (loggedIn) void startChat();
    else stopChat();
  }, [profile?.id, profile?.account?.id]);

  // A new message: a short notice while May-Ani is on screen, a phone notification (if allowed) while it is in the background.
  useEffect(() => onIncomingMessage((m) => {
    const text = m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text;
    if (document.visibilityState === 'visible') toast(`💬 ${m.name}: ${text}`);
    else void notify(`New message from ${m.name}`, text, `#/community?with=${encodeURIComponent(m.contactId)}`, `chat-${m.contactId}`);
  }), []);

  // Unread messages show in the browser tab and taskbar: "(2) May-Ani".
  const unread = totalUnread(state);
  useEffect(() => { document.title = unread ? `(${unread}) May-Ani` : 'May-Ani'; }, [unread]);

  // The link in a "reset your password" email: works on any phone, with or without a profile, outside the usual menus.
  const screen = path === '/reset' ? <ResetPassword token={query.token} />
    : !loggedIn ? <Welcome />
      : (
        <Shell>
          {/* A crash in one page keeps the menu usable; opening another page (a new path) tries again. */}
          <ErrorBoundary resetKey={path}>
            <Router
              routes={routes}
              notFound={<div className="page narrow"><Empty icon="🧭" title="We couldn't find that page" action={<LinkButton to="/">Back to dashboard</LinkButton>} /></div>}
            />
          </ErrorBoundary>
        </Shell>
      );
  // Toasts and yes/no questions work on every screen, also Welcome and the reset page.
  return <>{screen}<ToastHost /><ConfirmHost /></>;
}
