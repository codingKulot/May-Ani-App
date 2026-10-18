import { createServer, type Socket } from 'node:net';

/**
 * A fake mail server for tests. It speaks just enough SMTP for nodemailer (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT),
 * checks the login, and keeps every email in memory. Nothing is sent anywhere: no real email leaves this computer.
 */

export interface Mail { from: string; to: string[]; subject: string; text: string; html: string; raw: string }

export interface FakeSmtp {
  port: number;
  mails: Mail[];
  /** Successful logins so far. */
  logins: () => number;
  /** The first email (already received or arriving within `ms`) that matches. */
  waitFor: (match: (m: Mail) => boolean, ms?: number) => Promise<Mail>;
  stop: () => Promise<void>;
}

// ------------------------------------------------------------------ reading an email (MIME)
const splitHead = (s: string): [string, string] => {
  const i = s.indexOf('\r\n\r\n');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 4)];
};
const headersOf = (head: string) => {
  const out: Record<string, string> = {};
  for (const line of head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const k = line.indexOf(':');
    if (k > 0) out[line.slice(0, k).trim().toLowerCase()] = line.slice(k + 1).trim();
  }
  return out;
};
const quotedPrintable = (s: string) =>
  Buffer.from(s.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
const decode = (body: string, encoding: string) =>
  encoding === 'base64' ? Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') : encoding === 'quoted-printable' ? quotedPrintable(body) : body;

function leaves(raw: string): { type: string; body: string }[] {
  const [head, body] = splitHead(raw);
  const h = headersOf(head);
  const type = h['content-type'] ?? 'text/plain';
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (type.toLowerCase().startsWith('multipart/') && boundary) {
    return body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith('--')).flatMap((p) => leaves(p.replace(/^\r\n/, '')));
  }
  return [{ type: type.split(';')[0].trim().toLowerCase(), body: decode(body, (h['content-transfer-encoding'] ?? '').toLowerCase()) }];
}

function readMail(from: string, to: string[], raw: string): Mail {
  const parts = leaves(raw);
  return {
    from, to, raw,
    subject: headersOf(splitHead(raw)[0]).subject ?? '',
    text: parts.find((p) => p.type === 'text/plain')?.body ?? '',
    html: parts.find((p) => p.type === 'text/html')?.body ?? '',
  };
}

// ------------------------------------------------------------------ the server
export async function startFakeSmtp(opts: { user: string; pass: string; delayMs?: number }): Promise<FakeSmtp> {
  const mails: Mail[] = [];
  let logins = 0;
  const sockets = new Set<Socket>();

  const server = createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    sock.setEncoding('utf8');
    const say = (s: string) => { if (!sock.destroyed) sock.write(`${s}\r\n`); };
    let buf = '';
    let authed = false;
    let waitingForAuth = false;
    let data: string[] | null = null;
    let from = '';
    let to: string[] = [];

    const checkLogin = (b64: string) => {
      const [, user, pass] = Buffer.from(b64, 'base64').toString('utf8').split('\0');
      authed = user === opts.user && pass === opts.pass;
      if (!authed) return say('535 5.7.8 Username and Password not accepted');
      logins++;
      say('235 2.7.0 Accepted');
    };

    const handle = (line: string) => {
      if (data) {
        if (line !== '.') { data.push(line.startsWith('..') ? line.slice(1) : line); return; }
        mails.push(readMail(from, to, data.join('\r\n')));
        data = null;
        setTimeout(() => say('250 2.0.0 Queued'), opts.delayMs ?? 0);
        return;
      }
      if (waitingForAuth) { waitingForAuth = false; return checkLogin(line); }
      const [verb = '', mech = '', arg = ''] = line.split(' ');
      switch (verb.toUpperCase()) {
        case 'EHLO': return say('250-fake-smtp\r\n250-AUTH PLAIN\r\n250 OK');
        case 'HELO': return say('250 fake-smtp');
        case 'AUTH':
          if (mech.toUpperCase() !== 'PLAIN') return say('504 5.5.4 Only PLAIN');
          if (!arg) { waitingForAuth = true; return say('334 '); }
          return checkLogin(arg);
        case 'MAIL':
          if (!authed) return say('530 5.7.0 Authentication required');
          from = /<([^>]*)>/.exec(line)?.[1] ?? '';
          to = [];
          return say('250 OK');
        case 'RCPT': to.push(/<([^>]*)>/.exec(line)?.[1] ?? ''); return say('250 OK');
        case 'DATA': data = []; return say('354 Go ahead');
        case 'RSET': from = ''; to = []; return say('250 OK');
        case 'NOOP': return say('250 OK');
        case 'QUIT': say('221 Bye'); sock.end(); return;
        default: return say('502 5.5.2 Not implemented');
      }
    };

    say('220 fake-smtp ready');
    sock.on('data', (chunk: string) => {
      buf += chunk;
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        handle(line);
      }
    });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;

  return {
    port,
    mails,
    logins: () => logins,
    async waitFor(match, ms = 5000) {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 25))) {
        const m = mails.find(match);
        if (m) return m;
      }
      throw new Error(`No matching email within ${ms} ms. Received: ${mails.map((m) => `${m.to.join(',')} "${m.subject}"`).join('; ') || 'none'}`);
    },
    stop: () => new Promise<void>((ok) => { for (const s of sockets) s.destroy(); server.close(() => ok()); }),
  };
}
