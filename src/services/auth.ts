import type { GeoPlace, Profile } from '@/types';
import { ApiError, call } from './ai';

/**
 * Accounts on the May-Ani server (server/auth.mjs, stored in MongoDB).
 * The login token lives in its own localStorage key, not in the app state, so it is never part of a backup file.
 * The server checks everything again; the checks here only give quick, friendly feedback.
 */

// Keep in sync with server/auth.mjs (a unit test checks this).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 60;

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Profile['role'];
  location: GeoPlace | null;
  createdAt: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: Profile['role'];
  location: GeoPlace;
}

export type FormErrors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>;

const TOKEN_KEY = 'may-ani.session.v1';

export const sessionToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
};
const saveToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } };
export const clearSession = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };
const bearer = (): Record<string, string> => (sessionToken() ? { Authorization: `Bearer ${sessionToken()}` } : {});

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const normalizeEmail = (v: string) => v.trim().toLowerCase();

const emailProblem = (v: string) => {
  const email = normalizeEmail(v);
  return EMAIL_RE.test(email) && email.length <= 254 ? '' : 'Enter a valid email address, like juan@gmail.com.';
};
/** Length counts letters, not bytes (ñ is one letter). */
const passwordLengthProblem = (password: string) => {
  const n = [...password].length;
  return n < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : n > PASSWORD_MAX ? `Use at most ${PASSWORD_MAX} characters.` : '';
};
/** Keeps only the problems that were found. */
const found = (e: FormErrors): FormErrors => Object.fromEntries(Object.entries(e).filter(([, v]) => v));

export function signUpProblems(f: Pick<SignUpInput, 'name' | 'email' | 'password'>): FormErrors {
  return found({ name: f.name.trim() ? '' : 'Enter your name.', email: emailProblem(f.email), password: passwordLengthProblem(f.password) });
}

export const forgotProblems = (email: string): FormErrors => found({ email: emailProblem(email) });
export const resetProblems = (password: string): FormErrors => found({ password: passwordLengthProblem(password) });

export function logInProblems(email: string, password: string): FormErrors {
  return normalizeEmail(email) && password ? {} : { form: 'Enter your email and password.' };
}

/** Turns any failure into a message for the form, next to the right field when the server says which. */
export function toFormErrors(e: unknown): FormErrors {
  if (e instanceof ApiError) {
    const f = e.field === 'name' || e.field === 'email' || e.field === 'password' ? e.field : 'form';
    return { [f]: e.message };
  }
  if (e instanceof Error && e.name === 'AbortError') return { form: 'The server took too long to answer. Check your internet and try again.' };
  return { form: 'Could not reach the May-Ani server. Check your internet and try again.' };
}

export async function signUp(input: SignUpInput): Promise<Account> {
  const out = await call<{ token: string; user: Account }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ ...input, email: normalizeEmail(input.email) }),
  }, 20_000);
  saveToken(out.token);
  return out.user;
}

export async function logIn(email: string, password: string): Promise<Account> {
  const out = await call<{ token: string; user: Account }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  }, 20_000);
  saveToken(out.token);
  return out.user;
}

/** Ends the session on the server (best effort: works offline too) and forgets the token here. */
export async function logOut(): Promise<void> {
  const headers = bearer();
  clearSession();
  if (headers.Authorization) await call('/api/auth/logout', { method: 'POST', headers }, 8000).catch(() => {});
}

/**
 * 'ok' = still logged in, 'expired' = the server no longer accepts this login, 'unknown' = could not ask (offline, no server).
 */
export async function checkSession(): Promise<'ok' | 'expired' | 'unknown'> {
  if (!sessionToken()) return 'expired';
  try {
    await call<{ user: Account }>('/api/auth/me', { headers: bearer() }, 8000);
    return 'ok';
  } catch (e) {
    return e instanceof ApiError && e.status === 401 ? 'expired' : 'unknown';
  }
}

/** Saves name, role or location changes to the account. */
export async function saveAccountProfile(patch: Partial<Pick<Account, 'name' | 'role'>> & { location?: GeoPlace }): Promise<Account> {
  const out = await call<{ user: Account }>('/api/auth/profile', { method: 'POST', body: JSON.stringify(patch), headers: bearer() }, 10_000);
  return out.user;
}

/**
 * "Forgot your password?": asks the server to email a reset link. Returns the server's message, which is the same
 * whether or not the email has an account (so nobody can use this to find out who has one).
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const out = await call<{ message: string }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: normalizeEmail(email) }) }, 20_000);
  return out.message;
}

/**
 * Sets a new password with the token from the emailed link. Returns the account's email.
 * The server logs the account out on every phone, so the person logs in again with the new password.
 */
export async function resetPassword(token: string, password: string): Promise<string> {
  const out = await call<{ email: string }>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }, 20_000);
  return out.email;
}

/** True when the server says the reset link is expired or already used (the person needs a new link). */
export const isDeadResetLink = (e: unknown) => e instanceof ApiError && e.field === 'token';
