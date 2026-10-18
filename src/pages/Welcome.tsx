import { useState } from 'react';
import { LuSprout } from 'react-icons/lu';
import { navigate } from '@/core/router';
import { createProfile } from '@/core/actions';
import { DEFAULT_PLACE } from '@/data/places';
import type { GeoPlace } from '@/types';
import { Button, Field } from '@/components/ui';
import { PlaceSelect } from '@/components/widgets';
import { AccountsNotice, LogInForm, SignUpForm } from '@/components/AuthForms';

export function Welcome() {
  const [mode, setMode] = useState<'splash' | 'signup' | 'login' | 'guest'>('splash');
  const [place, setPlace] = useState<GeoPlace>(DEFAULT_PLACE);
  const home = () => navigate('/');

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
          <div className="splash-actions">
            <Button block onClick={() => setMode('signup')}>Get Started</Button>
            <Button block variant="secondary" onClick={() => setMode('login')}>Log in</Button>
            <button className="btn ghost" onClick={() => setMode('guest')}>Continue as Guest</button>
          </div>
          <p className="tiny muted" style={{ marginTop: 14 }}>With an account, your farms and records are saved on the May-Ani server too: log in on any phone to get them back.</p>
        </div>
      </div>
    );
  }

  if (mode === 'guest') {
    return (
      <div className="splash">
        <form className="splash-card card stack" style={{ textAlign: 'left' }} onSubmit={(e) => { e.preventDefault(); createProfile('Guest', place, 'farmer', true); home(); }}>
          <div className="row" style={{ color: 'var(--green-900)' }}><LuSprout size={30} /><h1>Where is your farm?</h1></div>
          <p className="muted small">We use your location for weather, hazards and prices. You can change it any time in Settings, and create an account there later.</p>
          <Field label="Where is your farm (or where will it be)?" htmlFor="place">
            <PlaceSelect id="place" value={place} onChange={setPlace} />
          </Field>
          <Button type="submit" block>Continue</Button>
          <button type="button" className="btn ghost" onClick={() => setMode('splash')}>Back</button>
        </form>
      </div>
    );
  }

  const signup = mode === 'signup';
  return (
    <div className="splash">
      <div className="splash-card card stack" style={{ textAlign: 'left' }}>
        <div className="row" style={{ color: 'var(--green-900)' }}><LuSprout size={30} /><h1>{signup ? 'Create your account' : 'Welcome back'}</h1></div>
        <p className="muted small">
          {signup
            ? 'It takes a minute and personalizes your weather, permits and prices. Log in with the same email on any phone.'
            : 'Log in with the email and password you used when you made your account.'}
        </p>
        <AccountsNotice onGuest={() => setMode('guest')} />
        {signup
          ? <SignUpForm onDone={home} onSwitch={() => setMode('login')} />
          : <LogInForm onDone={home} onSwitch={() => setMode('signup')} />}
        <button type="button" className="btn ghost" onClick={() => setMode('splash')}>Back</button>
      </div>
    </div>
  );
}
