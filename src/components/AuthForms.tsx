import { useEffect, useState } from 'react';
import { LuEye, LuEyeOff, LuLogOut } from 'react-icons/lu';
import type { GeoPlace, Profile } from '@/types';
import { DEFAULT_PLACE } from '@/data/places';
import { navigate } from '@/core/router';
import { signInWithAccount, signOutLocal } from '@/core/actions';
import { serverStatus } from '@/services/ai';
import {
  forgotProblems, logIn, logInProblems, logOut, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, requestPasswordReset, signUp, signUpProblems, toFormErrors,
  type Account, type FormErrors,
} from '@/services/auth';
import { flushSync, forgetSync, prepareLink, syncNow } from '@/services/sync';
import { Alert, Button, Chips, Field, Spinner, askConfirm } from '@/components/ui';
import { PlaceSelect } from '@/components/widgets';

/** Sign-up and log-in forms, used by the Welcome screen (May-Ani is for logged-in users only). */

const ROLE_ITEMS: { id: Profile['role']; label: string }[] = [
  { id: 'farmer', label: 'Farmer' }, { id: 'supplier', label: 'Supplier' }, { id: 'buyer', label: 'Buyer' }, { id: 'expert', label: 'Expert' },
];

const FieldError = ({ id, msg }: { id: string; msg?: string }) => (msg ? <span id={id} className="field-error">{msg}</span> : null);

/** Moves the cursor to the first field that needs fixing, so a phone user sees what is wrong. */
const focusFirst = (prefix: string, errors: FormErrors) => {
  const first = (['name', 'email', 'password'] as const).find((k) => errors[k]);
  if (first) document.getElementById(`${prefix}-${first}`)?.focus();
};

export function PasswordInput(p: { id: string; value: string; onChange: (v: string) => void; autoComplete: 'new-password' | 'current-password'; error?: string; describedBy?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group">
      <input
        id={p.id}
        className="input"
        type={show ? 'text' : 'password'}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        autoComplete={p.autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        maxLength={PASSWORD_MAX}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={p.describedBy}
      />
      <button type="button" className="btn secondary" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? <LuEyeOff size={18} /> : <LuEye size={18} />}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ farm data after log-in
type LinkQuestion = { phoneOnly: number; inAccount: number; finish: (choice: 'combine' | 'account') => void };

const completeSignIn = (account: Account) => {
  signInWithAccount(account);
  void syncNow();
};

/**
 * After log-in or sign-up: brings the account's farm data onto this phone, then links the profile.
 * Returns a question instead when both this phone and the account already have records (nothing is linked until it is answered).
 */
async function linkAccount(account: Account): Promise<LinkQuestion | null> {
  let link: Awaited<ReturnType<typeof prepareLink>> = null;
  try {
    link = await prepareLink(account.id);
  } catch {
    /* the server did not answer: the first automatic sync links this phone and keeps both sides, so nothing is lost */
  }
  if (link?.ask) {
    const l = link;
    return { phoneOnly: l.phoneOnly, inAccount: l.inAccount, finish: (choice) => { l.finish(choice); completeSignIn(account); } };
  }
  link?.finish('combine');
  completeSignIn(account);
  return null;
}

const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

/** Both this phone and the account have farm data: keep both (default) or use only the account's. */
function LinkChoice({ q, onDone }: { q: LinkQuestion; onDone: () => void }) {
  const useAccount = async () => {
    if (!(await askConfirm({
      title: `Remove ${items(q.phoneOnly)} from this phone?`,
      message: 'They are only on this phone, not in your account. This cannot be undone.\nTo keep a copy, choose "Keep both" instead, or cancel and back up first in Settings.',
      ok: 'Remove them', danger: true,
    }))) return;
    q.finish('account');
    onDone();
  };
  return (
    <div className="stack">
      <Alert tone="blue" title="Your account already has farm data">
        Your account has {items(q.inAccount)} (farms, plans, tasks and records). This phone has {items(q.phoneOnly)} that {q.phoneOnly === 1 ? 'is' : 'are'} not in your account yet.
      </Alert>
      <div className="stack sm">
        <Button block onClick={() => { q.finish('combine'); onDone(); }}>Keep both (recommended)</Button>
        <p className="tiny muted">Everything on this phone is added to your account, and your account's data comes to this phone.</p>
      </div>
      <div className="stack sm">
        <Button block variant="secondary" onClick={useAccount}>Use only my account's data</Button>
        <p className="tiny muted">The {items(q.phoneOnly)} only on this phone {q.phoneOnly === 1 ? 'is' : 'are'} removed from this phone.</p>
      </div>
    </div>
  );
}

/** Warns before the user types everything in, when the server cannot make accounts right now. */
export function AccountsNotice() {
  const [state, setState] = useState<'checking' | 'ok' | 'no-server' | 'off'>('checking');
  useEffect(() => {
    serverStatus(true).then((s) => setState(!s ? 'no-server' : s.accounts ? 'ok' : 'off'));
  }, []);
  if (state === 'checking' || state === 'ok') return null;
  return (
    <Alert tone="orange" title={state === 'no-server' ? 'Cannot reach the May-Ani server' : 'Accounts are not switched on yet'}>
      {state === 'no-server'
        ? 'Creating an account and logging in need the May-Ani server and an internet connection. Check your internet and try again.'
        : 'This server has no database connected yet, so it cannot save accounts. The server owner needs to add MONGODB_URI to the .env file.'}
    </Alert>
  );
}

export function SignUpForm(p: { initial?: { name?: string; place?: GeoPlace; role?: Profile['role'] }; onDone: () => void; onSwitch?: () => void }) {
  const [name, setName] = useState(p.initial?.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [place, setPlace] = useState<GeoPlace>(p.initial?.place ?? DEFAULT_PLACE);
  const [role, setRole] = useState<Profile['role']>(p.initial?.role ?? 'farmer');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  /** Typing in a field clears that field's old error message. */
  const edit = (key: keyof FormErrors, set: (v: string) => void) => (v: string) => {
    set(v);
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    const problems = signUpProblems({ name, email, password });
    setErrors(problems);
    if (Object.keys(problems).length) return focusFirst('su', problems);
    setBusy(true);
    try {
      const account = await signUp({ name: name.trim(), email, password, role, location: place });
      (await linkAccount(account))?.finish('combine'); // a new account has no farm data yet, so there is nothing to ask
      p.onDone();
    } catch (err) {
      const next = toFormErrors(err);
      setErrors(next);
      focusFirst('su', next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="Your name" htmlFor="su-name">
        <input id="su-name" className="input" value={name} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => edit('name', setName)(e.target.value)} placeholder="e.g. Juan Dela Cruz" aria-invalid={errors.name ? true : undefined} aria-describedby="su-name-err" />
        <FieldError id="su-name-err" msg={errors.name} />
      </Field>
      <Field label="Email" htmlFor="su-email">
        <input id="su-email" className="input" type="email" inputMode="email" value={email} autoComplete="email" autoCapitalize="none" spellCheck={false} onChange={(e) => edit('email', setEmail)(e.target.value)} placeholder="e.g. juan@gmail.com" aria-invalid={errors.email ? true : undefined} aria-describedby="su-email-err" />
        <FieldError id="su-email-err" msg={errors.email} />
      </Field>
      <Field label="Password" htmlFor="su-password" hint={errors.password ? undefined : `At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`}>
        <PasswordInput id="su-password" value={password} onChange={edit('password', setPassword)} autoComplete="new-password" error={errors.password} describedBy="su-password-err" />
        <FieldError id="su-password-err" msg={errors.password} />
      </Field>
      <Field label="Where is your farm (or where will it be)?" htmlFor="su-place">
        <PlaceSelect id="su-place" value={place} onChange={setPlace} />
      </Field>
      <Field label="I am a...">
        <Chips value={role} onChange={setRole} items={ROLE_ITEMS} />
      </Field>
      {errors.form ? <Alert tone="red" title="Could not create your account">{errors.form}</Alert> : null}
      <Button type="submit" block disabled={busy}>{busy ? <><Spinner /> Creating your account...</> : 'Create account'}</Button>
      <p className="tiny muted">Your name, email, role and location are saved in your May-Ani account, and so are your farms, plans and records, so you can log in on another phone and find them. Photos stay on this phone.</p>
      {p.onSwitch ? <p className="small">Already have an account? <button type="button" className="btn ghost sm" onClick={p.onSwitch}>Log in</button></p> : null}
    </form>
  );
}

export function LogInForm(p: { onDone: () => void; onSwitch?: () => void; initialEmail?: string }) {
  const [email, setEmail] = useState(p.initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<LinkQuestion | null>(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    const problems = logInProblems(email, password);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const q = await linkAccount(await logIn(email, password));
      if (q) setQuestion(q);
      else p.onDone();
    } catch (err) {
      setErrors(toFormErrors(err));
    } finally {
      setBusy(false);
    }
  };

  if (question) return <LinkChoice q={question} onDone={p.onDone} />;
  if (forgot) return <ForgotForm initialEmail={email} onBack={() => setForgot(false)} />;
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="Email" htmlFor="li-email">
        <input id="li-email" className="input" type="email" inputMode="email" value={email} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. juan@gmail.com" />
      </Field>
      <Field label="Password" htmlFor="li-password">
        <PasswordInput id="li-password" value={password} onChange={setPassword} autoComplete="current-password" error={errors.form} />
      </Field>
      {errors.form || errors.email || errors.password ? (
        <Alert tone="red" title="Could not log you in">{errors.form ?? errors.email ?? errors.password}</Alert>
      ) : null}
      <Button type="submit" block disabled={busy}>{busy ? <><Spinner /> Logging in...</> : 'Log in'}</Button>
      <p className="small"><button type="button" className="btn ghost sm" onClick={() => setForgot(true)}>Forgot your password?</button></p>
      {p.onSwitch ? <p className="small">No account yet? <button type="button" className="btn ghost sm" onClick={p.onSwitch}>Create one</button></p> : null}
    </form>
  );
}

/** "Forgot your password?": asks for a reset link by email. The answer never says whether the email has an account. */
export function ForgotForm(p: { initialEmail?: string; onBack?: () => void }) {
  const [email, setEmail] = useState(p.initialEmail ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    const problems = forgotProblems(email);
    setErrors(problems);
    if (Object.keys(problems).length) return focusFirst('fp', problems);
    setBusy(true);
    try {
      setSent(await requestPasswordReset(email));
    } catch (err) {
      const next = toFormErrors(err);
      setErrors(next);
      focusFirst('fp', next);
    } finally {
      setBusy(false);
    }
  };

  const back = p.onBack ? <button type="button" className="btn ghost" onClick={p.onBack}>Back to log in</button> : null;
  if (sent) {
    return (
      <div className="stack">
        <Alert tone="green" title="Check your email">{sent}</Alert>
        <p className="small muted">Open the link on this phone or any other. No email after a few minutes? Check that the address is right and look in Spam, then ask again.</p>
        <Button variant="secondary" block onClick={() => setSent('')}>Send another link</Button>
        {back}
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="small">Type the email of your May-Ani account. We will send you a link to choose a new password.</p>
      <Field label="Email" htmlFor="fp-email">
        <input id="fp-email" className="input" type="email" inputMode="email" value={email} autoComplete="email" autoCapitalize="none" spellCheck={false} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({}); }} placeholder="e.g. juan@gmail.com" aria-invalid={errors.email ? true : undefined} aria-describedby="fp-email-err" />
        <FieldError id="fp-email-err" msg={errors.email} />
      </Field>
      {errors.form ? <Alert tone="red" title="Could not send the link">{errors.form}</Alert> : null}
      <Button type="submit" block disabled={busy}>{busy ? <><Spinner /> Sending...</> : 'Send me a reset link'}</Button>
      {back}
    </form>
  );
}

export function LogOutButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!(await askConfirm({
      title: 'Log out on this phone?',
      message: 'Your farms, plans and records stay on this phone and in your account. To remove them from this phone too, use "Delete all my data" in Settings.',
      ok: 'Log out',
    }))) return;
    setBusy(true);
    // Send what is still waiting first, so nothing made on this phone is missing from the account.
    if (!(await flushSync()) && !(await askConfirm({
      title: 'Some changes are not in your account yet',
      message: 'There is no internet, or the server did not answer. If you log out now, those changes stay only on this phone.',
      ok: 'Log out anyway', cancel: 'Stay logged in', danger: true,
    }))) {
      setBusy(false);
      return;
    }
    await logOut();
    forgetSync();
    signOutLocal();
    navigate('/welcome');
  };
  return <Button variant="secondary" onClick={run} disabled={busy}><LuLogOut size={16} /> {busy ? 'Logging out...' : 'Log out'}</Button>;
}
