import { useState } from 'react';
import { useAppState } from '@/core/store';
import { navigate } from '@/core/router';
import { Card, PageHeader, Tabs, toast } from '@/components/ui';
import { AccountsNotice, LogInForm, LogOutButton, SignUpForm } from '@/components/AuthForms';

/** For someone already using the app (guest or on-device profile) who wants an account. Their data on this phone is kept. */
export function Account({ mode }: { mode?: string }) {
  const { profile } = useAppState();
  const p = profile!;
  const [tab, setTab] = useState<'signup' | 'login'>(mode === 'login' ? 'login' : 'signup');
  const done = () => { toast('You are logged in'); navigate('/settings'); };

  if (p.account) {
    return (
      <div className="page narrow">
        <PageHeader title="Your account" />
        <Card>
          <div className="stack sm">
            <p className="small">Logged in as <strong>{p.account.email}</strong>.</p>
            <div className="row wrap"><LogOutButton /></div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <PageHeader title={tab === 'signup' ? 'Create your account' : 'Log in'} sub="Your farms, plans and records on this phone stay as they are." />
      <Card>
        <div className="stack">
          <Tabs tabs={[{ id: 'signup', label: 'Create account' }, { id: 'login', label: 'Log in' }]} value={tab} onChange={setTab} />
          <AccountsNotice />
          {tab === 'signup'
            ? <SignUpForm initial={{ name: p.guest ? '' : p.name, place: p.location, role: p.role }} onDone={done} />
            : <>
              <p className="small muted">After you log in, your name, role and location come from your account, and the farms and records saved in your account come to this phone.</p>
              <LogInForm onDone={done} />
            </>}
        </div>
      </Card>
    </div>
  );
}
