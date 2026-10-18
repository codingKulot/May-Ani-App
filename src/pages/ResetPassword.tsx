import { useEffect, useState } from 'react';
import { LuSprout } from 'react-icons/lu';
import { navigate } from '@/core/router';
import { getState, useAppState } from '@/core/store';
import { unlinkAccount } from '@/core/actions';
import { clearSession, isDeadResetLink, PASSWORD_MIN, resetPassword, resetProblems, toFormErrors, type FormErrors } from '@/services/auth';
import { Alert, Button, Field, Spinner } from '@/components/ui';
import { ForgotForm, LogInForm, PasswordInput } from '@/components/AuthForms';

/**
 * Opened from the link in the "Reset your May-Ani password" email (#/reset?token=...).
 * Shown on its own, with or without a profile on this phone: the link may be opened on a new phone.
 */
export function ResetPassword(p: { token?: string }) {
  const { profile } = useAppState();
  const [token] = useState(p.token ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [dead, setDead] = useState(!p.token); // no link, or it expired or was used: ask for a new one
  const [doneEmail, setDoneEmail] = useState('');

  // The token should not stay in the address bar or the browser history.
  useEffect(() => {
    if (location.hash.includes('token=')) history.replaceState(null, '', `${location.pathname}${location.search}#/reset`);
  }, []);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    const problems = resetProblems(password);
    setErrors(problems);
    if (Object.keys(problems).length) return document.getElementById('rp-password')?.focus();
    setBusy(true);
    try {
      const email = await resetPassword(token, password);
      // The server logged this account out everywhere. If this phone was one of them, end the login here too (data stays).
      if (getState().profile?.account?.email === email) {
        clearSession();
        unlinkAccount();
      }
      setDoneEmail(email);
    } catch (err) {
      if (isDeadResetLink(err)) setDead(true);
      setErrors(toFormErrors(err));
    } finally {
      setBusy(false);
    }
  };

  const otherAccount = profile?.account && doneEmail && profile.account.email !== doneEmail ? profile.account.email : '';
  const leave = () => navigate(profile ? '/' : '/welcome');
  const title = doneEmail ? 'Password changed' : dead ? 'Ask for a new link' : 'Choose a new password';

  let body;
  if (doneEmail) {
    body = (
      <>
        <Alert tone="green" title="Your new password is saved">
          For your safety, every phone that was logged in to {doneEmail} is logged out now. Log in again with the new password.
        </Alert>
        {otherAccount
          ? <p className="small">This phone is logged in to another account ({otherAccount}), so it stays as it is. Log in with the new password on your own phone.</p>
          : <LogInForm initialEmail={doneEmail} onDone={() => navigate('/')} />}
      </>
    );
  } else if (dead) {
    body = (
      <>
        <Alert tone="orange" title={p.token ? 'This link does not work anymore' : 'This link is not complete'}>
          {p.token
            ? `Reset links work for 30 minutes and only once, and only the newest link works. Ask for a new one below.`
            : 'Open the link from the email again (tap it, do not copy part of it), or ask for a new one below.'}
        </Alert>
        <ForgotForm initialEmail={profile?.account?.email} />
      </>
    );
  } else {
    body = (
      <form className="stack" onSubmit={submit} noValidate>
        <p className="small muted">A short sentence is easy to remember and hard to guess, like "Tatlong kalabaw sa bukid".</p>
        <Field label="New password" htmlFor="rp-password" hint={errors.password ? undefined : `At least ${PASSWORD_MIN} characters.`}>
          <PasswordInput id="rp-password" value={password} onChange={(v) => { setPassword(v); if (errors.password) setErrors({}); }} autoComplete="new-password" error={errors.password} describedBy="rp-password-err" />
          {errors.password ? <span id="rp-password-err" className="field-error">{errors.password}</span> : null}
        </Field>
        {errors.form ? <Alert tone="red" title="Could not save the new password">{errors.form}</Alert> : null}
        <Button type="submit" block disabled={busy}>{busy ? <><Spinner /> Saving...</> : 'Save new password'}</Button>
      </form>
    );
  }

  return (
    <div className="splash">
      <div className="splash-card card stack" style={{ textAlign: 'left' }}>
        <div className="row" style={{ color: 'var(--green-900)' }}><LuSprout size={30} /><h1>{title}</h1></div>
        {body}
        <button type="button" className="btn ghost" onClick={leave}>{profile ? 'Back to the app' : 'Back'}</button>
      </div>
    </div>
  );
}
