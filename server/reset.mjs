// "Forgot your password?" for May-Ani accounts (follows the OWASP Forgot Password Cheat Sheet).
//   * POST /api/auth/forgot { email }: always the same answer, so nobody can use it to find out which emails have accounts.
//     The answer is sent before any email, so the time it takes does not tell either.
//     For an email with an account, a one-time link is emailed: APP_URL/#/reset?token=... The link is never built from
//     the request, so a faked Host header cannot point people to another website.
//     The database keeps only the SHA-256 of the token, for RESET_MINUTES. A new request replaces the older link.
//     At most PER_EMAIL requests per email address per hour, and RESET_RATE_PER_MIN per IP address.
//   * POST /api/auth/reset { token, password }: same password rules as sign-up. Uses up the link, sets the new password and
//     logs the account out on every phone. It does not log in: the person then logs in with the new password.
// The database part is in server/auth.mjs (collection password_resets), the sending in server/mail.mjs.

import { dbProblem, hashPassword, normalizeEmail, passwordProblem, validEmail } from './auth.mjs';
import { mailProblem } from './mail.mjs';

export const RESET_MINUTES = 30;
const PER_EMAIL = 3; // reset requests for one email address ...
const PER_EMAIL_MS = 60 * 60_000; // ... per hour
const BODY = 16 * 1024;

export const OFF_MESSAGE = 'Resetting a password by email is not switched on for this server yet. You can keep using May-Ani as a guest, or create a new account with another email.';
export const SENT_MESSAGE = `If an account uses this email, we sent it a link to choose a new password. The link works for ${RESET_MINUTES} minutes. Check your Spam folder too.`;
const LINK_GONE = 'This reset link has expired or was already used. Ask for a new one.';

// ------------------------------------------------------------------ the emails
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const page = (paragraphs) => `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f2d24;max-width:520px">${paragraphs.join('')}</div>`;

export function resetEmail(name, link) {
  return {
    subject: 'Reset your May-Ani password',
    text: [
      `Hello ${name},`,
      'Someone (we hope it was you) asked to change the password of your May-Ani account.',
      `To choose a new password, open this link. It works for ${RESET_MINUTES} minutes and only once:\n${link}`,
      'If you did not ask for this, ignore this email. Your password stays the same.',
      '- May-Ani',
    ].join('\n\n'),
    html: page([
      `<p>Hello ${esc(name)},</p>`,
      '<p>Someone (we hope it was you) asked to change the password of your May-Ani account.</p>',
      `<p><a href="${esc(link)}" style="display:inline-block;background:#1f7a3a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p>`,
      `<p>The link works for ${RESET_MINUTES} minutes and only once. If the button does not work, copy this into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>`,
      '<p>If you did not ask for this, ignore this email. Your password stays the same.</p>',
      '<p>May-Ani</p>',
    ]),
  };
}

export function changedEmail(name) {
  return {
    subject: 'Your May-Ani password was changed',
    text: [
      `Hello ${name},`,
      'The password of your May-Ani account was just changed. Every phone that was logged in to the account was logged out.',
      'If you did this, there is nothing else to do.',
      'If you did NOT do this, open May-Ani, tap Log in, then "Forgot your password?" to choose a new password right away.',
      '- May-Ani',
    ].join('\n\n'),
    html: page([
      `<p>Hello ${esc(name)},</p>`,
      '<p>The password of your May-Ani account was just changed. Every phone that was logged in to the account was logged out.</p>',
      '<p>If you did this, there is nothing else to do.</p>',
      '<p><strong>If you did not do this</strong>, open May-Ani, tap Log in, then "Forgot your password?" to choose a new password right away.</p>',
      '<p>May-Ani</p>',
    ]),
  };
}

// ------------------------------------------------------------------ HTTP handlers
/**
 * The two routes, added to the /api/auth/* handler by authRoutes (which turns database outages into a 503).
 * `mailer` is from server/mail.mjs (null = email is off), `appUrl` is where the app runs (APP_URL), `unlock(email)` ends
 * a wrong-password lockout. `forgotPerMinute` and `resetPerMinute` are per-IP limits.
 */
export function resetRoutes(store, { json, readJson, limited }, { mailer, appUrl, unlock = () => {}, forgotPerMinute = 5, resetPerMinute = 20 }) {
  const asks = new Map(); // email -> { n, start }
  setInterval(() => { const now = Date.now(); for (const [k, v] of asks) if (now - v.start > PER_EMAIL_MS) asks.delete(k); }, 60_000).unref();
  /** Counted for every address, with or without an account, so the limit does not tell which emails have accounts. */
  const askedTooOften = (email) => {
    const now = Date.now();
    const a = asks.get(email);
    if (!a || now - a.start > PER_EMAIL_MS) { asks.set(email, { n: 1, start: now }); return false; }
    a.n++;
    return a.n > PER_EMAIL;
  };
  const tooMany = (res) => json(res, 429, { error: 'Too many tries. Please wait a minute and try again.' });

  async function sendLink(user) {
    const token = await store.createResetToken(user._id, RESET_MINUTES);
    try {
      await mailer.send({ to: user.email, ...resetEmail(user.name, `${appUrl}/#/reset?token=${token}`) });
    } catch (e) {
      await store.dropResetToken(token).catch(() => {}); // a link nobody received should not stay valid
      throw e;
    }
  }

  async function forgot(req, res) {
    if (limited(req, 'forgot', forgotPerMinute)) return tooMany(res);
    const b = await readJson(req, BODY);
    const email = normalizeEmail(b.email);
    if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address, like juan@gmail.com.', field: 'email' });
    if (!mailer) return json(res, 503, { error: OFF_MESSAGE });
    if (askedTooOften(email)) {
      return json(res, 429, { error: 'A reset link was asked for this email several times already. Check your Spam folder, or wait an hour and try again.' });
    }
    const user = await store.findUserByEmail(email);
    json(res, 200, { ok: true, message: SENT_MESSAGE });
    if (user) {
      sendLink(user).catch((e) => console.error(`Email: a password reset email could not be sent. ${dbProblem(e) || mailProblem(e, mailer.port)}`));
    }
  }

  async function reset(req, res) {
    if (limited(req, 'reset', resetPerMinute)) return tooMany(res);
    const b = await readJson(req, BODY);
    const token = typeof b.token === 'string' ? b.token : '';
    const user = await store.userForResetToken(token);
    if (!user) return json(res, 400, { error: LINK_GONE, field: 'token' });
    const problem = passwordProblem(b.password, user.email);
    if (problem) return json(res, 400, { error: problem, field: 'password' }); // the link still works for a better password
    if (!(await store.resetPassword(token, user._id, await hashPassword(b.password)))) return json(res, 400, { error: LINK_GONE, field: 'token' });
    unlock(user.email);
    json(res, 200, { ok: true, email: user.email });
    mailer?.send({ to: user.email, ...changedEmail(user.name) })
      .catch((e) => console.error(`Email: the "password changed" email could not be sent. ${mailProblem(e, mailer.port)}`));
  }

  return { 'POST /api/auth/forgot': forgot, 'POST /api/auth/reset': reset };
}
