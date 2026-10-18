import { useState } from 'react';
import { LuSprout } from 'react-icons/lu';
import { navigate } from '@/core/router';
import { startupProblem, useAppState } from '@/core/store';
import { hasUserData } from '@/core/actions';
import { Alert, Button } from '@/components/ui';
import { AccountsNotice, LogInForm, SignUpForm } from '@/components/AuthForms';

/**
 * The first screen, and the only one without a login: May-Ani is for logged-in users only (no guest mode since
 * 18 October 2026), so chat partners and buyers are always real, named accounts.
 * A phone that still has a profile without an account (a guest from before, or a login that ended) keeps its farm data:
 * creating an account or logging in saves that data to the account.
 */
export function Welcome() {
  const s = useAppState();
  const [mode, setMode] = useState<'splash' | 'signup' | 'login'>(s.profile ? 'login' : 'splash');
  const home = () => navigate('/');
  const leftover = s.profile && !s.profile.account ? s.profile : null;
  const keepsData = hasUserData(s);

  const notice = leftover ? (
    <Alert tone="blue" title="Please log in to continue">
      May-Ani is now for registered users only, so everyone you meet in the app is a real person with an account.
      {keepsData ? ' Your farms, plans and records on this phone are kept and will be saved to your account.' : ''}
    </Alert>
  ) : null;

  if (mode === 'splash') {
    return (
      <div className="splash">
        <div className="splash-card">
          <div className="splash-hero">
            <div className="logo">
              <LuSprout size={56} />
              <h1>May-Ani</h1>
            </div>
            <p className="tag">Grow Today. Sustain Tomorrow.</p>
            <p className="sub">For healthier farms, stronger communities, and a sustainable future.</p>
            <div className="hills" aria-hidden="true" />
          </div>
          {startupProblem ? <div className="alert orange" role="alert" style={{ marginTop: 14, textAlign: 'left' }}><div className="grow small">{startupProblem}</div></div> : null}
          <div className="splash-actions">
            <Button block onClick={() => setMode('signup')}>Create an account</Button>
            <Button block variant="secondary" onClick={() => setMode('login')}>Log in</Button>
          </div>
          <p className="tiny muted" style={{ marginTop: 14 }}>An account keeps your farms and records safe on the May-Ani server: log in on any phone to get them back.</p>
        </div>
      </div>
    );
  }

  const signup = mode === 'signup';
  return (
    <div className="splash">
      <div className="splash-card card stack" style={{ textAlign: 'left' }}>
        <div className="row" style={{ color: 'var(--green-900)' }}><LuSprout size={30} /><h1>{signup ? 'Create your account' : 'Welcome back'}</h1></div>
        {notice}
        <p className="muted small">
          {signup
            ? 'It takes a minute and personalizes your weather, permits and prices. Log in with the same email on any phone.'
            : 'Log in with the email and password you used when you made your account.'}
        </p>
        <AccountsNotice />
        {signup
          ? <SignUpForm onDone={home} onSwitch={() => setMode('login')}
            initial={leftover ? { name: leftover.name === 'Guest' ? '' : leftover.name, place: leftover.location, role: leftover.role } : undefined} />
          : <LogInForm onDone={home} onSwitch={() => setMode('signup')} />}
        {leftover ? null : <button type="button" className="btn ghost" onClick={() => setMode('splash')}>Back</button>}
      </div>
    </div>
  );
}
