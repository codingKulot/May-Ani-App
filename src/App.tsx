import { useEffect } from 'react';
import { Router, navigate, useHash, type RouteDef } from '@/core/router';
import { askToKeepData, getState, useAppState } from '@/core/store';
import { unlinkAccount } from '@/core/actions';
import { checkSession, clearSession } from '@/services/auth';
import { startSync } from '@/services/sync';
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
import { Learn } from '@/pages/Learn';
import { Settings } from '@/pages/Settings';
import { Account } from '@/pages/Account';
import { ResetPassword } from '@/pages/ResetPassword';
import { Empty, LinkButton, toast } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
  { pattern: '/settings', render: () => <Settings /> },
  { pattern: '/account', render: (m) => <Account key={m.query.mode ?? ''} mode={m.query.mode} /> },
];

export function registerRoutes(extra: RouteDef[]) {
  routes.push(...extra);
}

export function App() {
  const { profile } = useAppState();
  const { path, query } = useHash();

  useEffect(() => {
    if (!profile && path !== '/welcome' && path !== '/reset') navigate('/welcome');
    if (profile && path === '/welcome') navigate('/');
  }, [profile, path]);

  // Once per app start: if the server no longer accepts this login (expired, logged out elsewhere), drop the account link.
  // Offline or no server: keep it as it is (the app works without the server).
  useEffect(() => {
    if (!getState().profile?.account) return;
    checkSession().then((r) => {
      if (r !== 'expired') return;
      clearSession();
      unlinkAccount();
      toast('Your login has ended. Your data is still here. Log in again in Settings.');
    });
  }, []);

  // Farm data follows the account: saves changes and brings in other phones' changes (services/sync).
  useEffect(() => {
    startSync({ onLoginEnded: () => toast('Your login has ended. Your data is still here. Log in again in Settings.') });
  }, []);

  // Once someone uses the app, ask the browser not to clear its data when space runs low.
  useEffect(() => {
    if (profile) void askToKeepData();
  }, [!!profile]);

  // The link in a "reset your password" email: works on any phone, with or without a profile, outside the usual menus.
  if (path === '/reset') return <ResetPassword token={query.token} />;
  if (!profile) return <Welcome />;
  return (
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
}
