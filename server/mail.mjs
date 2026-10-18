// Sends May-Ani's emails (for now only the "forgot your password?" links). Gmail with an app password by default.
//   .env  SMTP_USER      the Gmail address that sends (best: a new Gmail just for May-Ani)
//         SMTP_PASSWORD  its 16-letter app password, NOT the normal Gmail password (README "Turning on password reset")
//         EMAIL_FROM     optional, the name people see, default "May-Ani <SMTP_USER>" (Gmail always sends from SMTP_USER)
//         SMTP_HOST (smtp.gmail.com), SMTP_PORT (465) only for another email provider. The tests point them at a fake mail server.
// The connection is always encrypted, except to a mail server on this same computer (the tests' fake one).
// nodemailer is loaded only when email is switched on.

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/** Null when SMTP_USER or SMTP_PASSWORD is missing. Throws only if nodemailer is missing or SMTP_PORT is not a port. */
export async function openMailer(env) {
  const user = (env.SMTP_USER || '').trim();
  const host = (env.SMTP_HOST || 'smtp.gmail.com').trim().toLowerCase();
  // Google shows an app password in groups of four ("abcd efgh ijkl mnop"); the spaces are not part of it.
  const pass = host === 'smtp.gmail.com' ? (env.SMTP_PASSWORD || '').replace(/\s+/g, '') : (env.SMTP_PASSWORD || '').trim();
  if (!user || !pass) return null;
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a port number, like 465');
  const from = (env.EMAIL_FROM || '').trim() || `May-Ani <${user}>`;
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // port 465 is encrypted from the start; on other ports the server must switch to encryption (STARTTLS) ...
    requireTLS: port !== 465 && !LOOPBACK.has(host), // ... before the password is sent
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return {
    host,
    port,
    /** Resolves when the mail server answers and accepts the login. */
    verify: () => transport.verify(),
    send: ({ to, subject, text, html }) => transport.sendMail({ from, to, subject, text, html }),
    close: () => transport.close(),
  };
}

/** What went wrong, for the server log, with what to fix. Never contains the password. */
export function mailProblem(e, port = 465) {
  const code = e?.code ?? '';
  const reply = Number(e?.responseCode) || 0;
  const text = String(e?.response || e?.message || '');
  if (/5\.7\.9|application-specific password/i.test(text)) {
    return 'Gmail wants an app password, not the normal password. Make one at https://myaccount.google.com/apppasswords and put it in SMTP_PASSWORD.';
  }
  if (code === 'EAUTH' || reply === 535 || reply === 534) {
    return 'The mail server refused SMTP_USER and SMTP_PASSWORD. For Gmail, 2-Step Verification must be on and SMTP_PASSWORD must be an app password (https://myaccount.google.com/apppasswords).';
  }
  if (/5\.4\.5|sending limit/i.test(text)) return 'Gmail\'s daily sending limit is reached (about 500 emails a day). Emails work again within 24 hours.';
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
    return `The mail server could not be reached (no internet, or a firewall or antivirus blocks port ${port}).`;
  }
  return `The email could not be sent (${text.slice(0, 160)}).`;
}
