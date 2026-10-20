// May-Ani server - Node 20+ / Bun. Optional packages, loaded only when switched on: mongodb (accounts), nodemailer (email).
//   * Serves the built PWA from ./dist (server/static.mjs)
//   * /api/ai/*   : Claude vision for plant/animal/fish diagnosis, site-photo analysis and build surveys; pictures (logged-in users only)
//   * /api/chat/* : real-time messaging between farmers, suppliers and buyers (SSE; logged-in users only), see server/chat.mjs
//   * /api/auth/* : accounts (sign up, log in, log out, profile) stored in MongoDB, see server/auth.mjs;
//                   "forgot your password?" by email (/api/auth/forgot, /api/auth/reset), see server/reset.mjs and server/mail.mjs
//   * /api/sync   : the logged-in user's farms, plans and records, so they follow the account to a new phone, see server/sync.mjs
//   * /api/live, /api/ready : health checks for hosting platforms; /api/health : what this server offers, for the app
// This file only starts the server: the settings are in server/config.mjs, the parts are put together in server/app.mjs,
// and the design is explained in docs/ARCHITECTURE.md.
//
// Run:  bun run start      (builds the app, then serves it with AI + chat on http://localhost:8787)
// Key:  put ANTHROPIC_API_KEY=sk-ant-... in a file named .env next to package.json (see .env.example),
//       or set it in your shell. AI is optional.
// Env:  every setting is listed in .env.example and README; server/config.mjs reads them.
// Stop: Ctrl+C (or SIGTERM from a hosting platform) stops cleanly; press Ctrl+C again to stop at once.

import { loadConfig, loadEnvFile } from './config.mjs';
import { createApp } from './app.mjs';

loadEnvFile();
const { config, problems } = loadConfig(process.env);
if (problems.length) {
  for (const p of problems) console.error(`May-Ani cannot start: ${p}`);
  process.exit(1);
}

const app = await createApp(config);
const { log } = app;

let port;
try {
  port = await app.listen();
} catch (e) {
  // Starting fails when the port is taken, almost always by May-Ani already running in another terminal: say so plainly.
  if (e.code === 'EADDRINUSE') {
    console.error(`May-Ani cannot start: port ${config.port} is already in use. May-Ani (or another program) is probably already running there.
  - If May-Ani is running in another terminal window, use that one, or stop it there with Ctrl+C and start it again.
  - To run a second copy, give it another port, for example in PowerShell: $env:PORT=8788; bun server/index.mjs`);
  } else {
    console.error(`May-Ani cannot start: ${e.message}`);
  }
  process.exit(1);
}
app.announce(port);

// A safety net: a mistake that slips past a try/catch in a request (the request handler is async, so it shows up here) is
// written to the log, and the server keeps serving everyone else instead of stopping.
process.on('unhandledRejection', (e) => {
  log.error(`Unexpected error (the server keeps running): ${e instanceof Error ? e.stack || e.message : String(e)}`);
});

// Hosting platforms send SIGTERM before they replace a copy of the server (a deploy); Ctrl+C sends SIGINT.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) {
      log.info('Stopping at once.');
      process.exit(1);
    }
    stopping = true;
    const busy = app.waiting();
    log.info(busy
      ? `Stopping May-Ani: letting ${busy} request${busy === 1 ? '' : 's'} finish (at most ${config.shutdownMs / 1000} seconds). Press Ctrl+C again to stop at once.`
      : 'Stopping May-Ani...');
    app.shutdown().then(() => {
      log.info('May-Ani stopped.');
      process.exit(0);
    });
  });
}
