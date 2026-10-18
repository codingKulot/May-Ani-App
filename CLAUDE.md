# May-Ani: project guide for Claude Code

May-Ani ("My Ani") is an all-in-one agriculture and aquaculture business assistant for Filipino farmers: farm planning, plant/animal/fish health checks, weather, hazards and prices, permits and records, all in one app.
Owner: Ronilo (not a professional developer; explain choices plainly, he is learning). Windows PC, timezone Asia/Manila. Project folder: `C:\Users\Ronilo\Documents\Projects\May-Ani`.

## How to work (standing instructions from the owner)
- Act as a **senior developer and senior QA** using current best practices. Verify before claiming done: `bun run typecheck`, `bun test`, and a real browser check for UI changes.
- Be honest about what is verified and what is not. Never present estimates as live data. Say plainly when something could not be tested.
- Explain in simple language, give exact steps for anything the owner must do (keys, terminal commands).
- Keep prices honest: Philippine market prices, marked **Sourced** (published list, with link and date) or **Estimate**. This is not a live feed. Users can type their own price.

## Stack and commands
Bun, React 19, TypeScript strict, own CSS (`src/styles.css`, no Tailwind), custom hash router (`src/core/router.tsx`), custom store (`src/core/store.ts`, `useSyncExternalStore`, localStorage key `may-ani.state.v1`). No `@types/react`: minimal shims are in `src/types/shims.d.ts`.
- `bun run dev` : app on http://localhost:3000 (finds the server on 8787 automatically)
- `bun run server` : API + chat server on 8787. `bun run start` builds, then serves everything on http://localhost:8787
- `bun run typecheck`, `bun test` (327 tests on 18 October 2026, about 30 to 60 s; up to 2.5 minutes when the MongoDB end-to-end tests start cold), `bun run build` (output `dist/`; production build: `define` sets `process.env.NODE_ENV` so React's production build and the offline service worker are in it, about 560 KB JS)
- Kill processes by port or PID, never `pkill -f` with a pattern that matches its own shell.
- Version control: git repository since 18 October 2026 (branch `main`, first commit "Baseline"). No GitHub copy yet (`gh` is not installed). `.gitignore` keeps `.env`, `server/data.json*`, `node_modules`, `dist` out. Commit only when the owner asks.

## Layout
- `src/pages/*` one file per screen: Dashboard, Planner (create plan), PlanDetail (tabs incl. Layout), Farms, Health, Weather, Market, Permits, Manage, Community (chat), Learn, Settings, Welcome (splash, sign up, log in, guest), Account (`/account`: a guest or on-device profile creates an account or logs in, keeping local data), ResetPassword (`/reset?token=...`, opened from the reset email; App.tsx renders it full-screen with or without a profile, it strips the token from the address bar).
- `src/data/*` catalog, diseases, faults, learn, permits, places, `materials.ts` (prices), `recyclables.ts`, `verses.ts` (Dashboard "Verse of the day", KJV, public domain).
- `src/services/*` planner, weather, forecast, hazards, market, geocode, chat, health, `ai.ts` (client for the server's AI; exports `call` and `ApiError`), `auth.ts` (accounts client; token in its own localStorage key `may-ani.session.v1`, never in app state or backups), `sync/` (farm data that follows the account, see "Account data sync" below), `build/` (see below). Sign-up/log-in forms and the "Forgot your password?" form (`ForgotForm`, shown inside `LogInForm`): `src/components/AuthForms.tsx`.
- `src/core/*` store, actions, router, hooks. `src/lib/*` format (`parseNumber` reads "1,500" / "₱1,500.50"), geo, image, `photoStore.ts` (IndexedDB for photos and AI pictures), `download.ts` (`saveFile`), `csv.ts` (BOM, formula-safe cells).
- Chat (18 October 2026, `services/chat.ts`, `pages/Community.tsx`, `/api/chat/*` in `server/index.mjs`, data in `server/data.json`):
  a logged-in user's chat identity is `acct-<account id>` on every phone (register sends the login as `session`; the server answers
  `{ id, token }`); a guest's is the phone's profile id. At log-in the phone's guest chat moves into the account (only with that guest's
  chat token): messages are re-addressed, the guest leaves the directory. Guests may not register `acct-` ids. Why: the owner's test
  showed a guest that logged in kept chatting as the old guest id, so both "sides" were the same sender, and one account had two entries.
  The connection is app-wide (`startChat` in App.tsx) but only for phones that opened Community once (`chatJoined`), so nobody is listed
  without choosing to chat. Unread = messages from them newer than `chatRead[contact]` (per phone, in app state, not synced); bold row
  + count, total on the Community/Chat menu and in the tab title "(n) May-Ani"; an open, visible conversation is read at once. New
  message: toast when visible, otherwise a notification via `lib/notify.ts` (service worker `showNotification`, tap opens
  `#/community?with=<id>` through a postMessage to the app) after the user taps "Alert me of new messages" (https or localhost only).
  Received bubbles left, sent right, "Today/Yesterday" separators, clock times, "You:" previews.
- Dialogs (18 October 2026): every popup is `Sheet` (`components/ui.tsx`): a bottom sheet on phones, a centered box from 720px; from 960px, when the sidebar shows, centered on the page content beside it (`body:has(.app > .sidebar) .sheet-backdrop` adds the sidebar width as left padding; the dim backdrop still covers the sidebar). Toasts are centered the same way. Only the top dialog answers Escape and keeps Tab inside; focus returns to where it was; the page behind does not scroll (`body.sheet-open`, `scrollbar-gutter: stable`). Yes/no questions use `await askConfirm({ title, message, ok, cancel?, danger? })`, never the browser's `confirm()` (it cannot be styled or centered). `ToastHost` and `ConfirmHost` render once in `App.tsx`, so they also work on Welcome and the reset page. Checked at 375, 768, 960, 1280 and 1920 px wide.
- Data safety in the app (built 18 October 2026): `components/ErrorBoundary.tsx` around each page (keyed by path, menu stays usable) and around the whole app (main.tsx), with "Download a backup". The store moves saved data it cannot read to `may-ani.state.damaged` (never overwrites it; Welcome says so, Settings > Your data downloads or deletes it), repairs lists that are not lists, shows a red "NOT saved" banner (Shell, `useSaveProblem`) while saving fails, and asks `navigator.storage.persist()` once there is a profile. Restore (`importData`) brings in only farm data, each item checked with the sync guards (`cleanBackup` in `services/sync/records.ts`); never the profile, login or settings such as the server address. `NumberInput` is a text box (inputMode decimal) that accepts commas and ₱, says "Type a number" under the box, and points out min/max after the box is left.
- `server/index.mjs` Node/Bun server: Anthropic proxy, image-model proxy, chat (SSE), rate limiting, static files (only inside `dist` + separator; a broken %-code is a 400), `.env` loader. Chat data `server/data.json` is written to `.tmp` then renamed; a file it cannot read is moved to `data.json.damaged-<time>`, never overwritten. Picture-provider error text goes to the server log only. Starting on a port that is in use (usually May-Ani already running in another terminal) prints a plain explanation and exits with code 1. Optional dependencies, each loaded only when switched on: the official `mongodb` driver (`MONGODB_URI`) and `nodemailer` (`SMTP_USER` + `SMTP_PASSWORD`).
- `server/limits.mjs` (types in `limits.d.mts` for the tests): `clientIp(req, trust)` (TRUST_PROXY: off | loopback | number of proxies | proxy IPs; X-Forwarded-For read from the right; used by every rate limit) and `dailyQuota` (paid AI per Philippine day, in memory: guest per phone via the app's random `X-Device-Id` from localStorage `may-ani.device.v1`, guests per IP, per account via the login token, server total; `release()` gives back failures that cost nothing: `ai_billing`, `ai_key`, `ai_offline`, `ai_busy`, picture-provider error answers and network failures). Owner chose 18 October 2026: guests keep AI with a smaller limit. 429 codes `ai_quota` / `ai_daily_cap`; `/api/health` reports `daily: { ai, pictures }` (`account` only when accounts are on); the Health page shows the allowance and a "Create a free account" button. `src/services/ai.ts` `paidHeaders()` sends login + phone id on the four AI calls.
- Security headers on every answer (`SECURITY_HEADERS` in `server/index.mjs`): CSP (`script-src 'self'`, `style-src 'self'`, img `'self' data: blob: https://tile.openstreetmap.org`, connect `'self' https:`, `frame-ancestors 'none'`), nosniff, X-Frame-Options DENY, Referrer-Policy `strict-origin-when-cross-origin` (OpenStreetMap tiles need a Referer), Permissions-Policy, COOP; HSTS and `upgrade-insecure-requests` only when `APP_URL` is https. A new outside service in the app must be added to the CSP.
- `server/auth.mjs` accounts: `/api/auth/signup|login|me|profile|logout`. scrypt (N=2^15,r=8,p=3) password hashes, session tokens stored as SHA-256 only, TTL index expiry (60 days, sliding), per-email lockout (5 wrong / 15 min), per-IP limit, same answer for wrong password and unknown email, 503 with a clear log hint when MongoDB is down or refuses the login. Also keeps the `password_resets` collection (methods `createResetToken`, `userForResetToken`, `resetPassword`); a session created before `users.passwordChangedAt` is refused.
- `server/reset.mjs` "Forgot your password?": `POST /api/auth/forgot` (same answer for every email, answers before the email is sent, 3 per email per hour, `RESET_RATE_PER_MIN` per IP) and `POST /api/auth/reset` (same `passwordProblem` rules; uses up the link atomically, deletes all sessions, ends the wrong-password lockout, sends a "password changed" email). Links: 32 random bytes, SHA-256 stored, 30 min TTL, newest link only, always built from `APP_URL` (never the Host header). Plugged into `authRoutes` through its `extend` parameter. Email texts escape the user's name.
- `server/mail.mjs` email sender: Gmail SMTP with an app password (nodemailer, port 465 TLS; STARTTLS required on other ports except to a loopback test server). `mailProblem(e)` turns errors into log hints and never includes the password.
- `server/sync.mjs` account data sync: `POST /api/sync` (see below). Store methods `loadAppData`/`saveAppData` live in `server/auth.mjs` (collection `appdata`).

## Account data sync (built 18 October 2026)
A logged-in user's farms, plans, tasks, expenses, sales, production records, health log, own catalog items and a few choices
(permit checklist and sector, watch list, own market and material prices) follow the account, so logging in on a new phone brings them back.
- Not synced, on purpose: `settings` (server address, price feed: they belong to one phone), `activeFarmId`, `profile` (the account has it),
  chat (`chats`, `contacts`, separate system) and photos/AI pictures (IndexedDB, too big). The Settings Account card says so.
- Server: `POST /api/sync` with the login token, body `{ since, changes: [{ c, id, t, d | del }] }`. One `appdata` document per user
  (`_id` = userId) holding records `{ c, id, t, s, d (JSON text) | del }`; saved with optimistic concurrency on `rev` (two phones at
  once both land). Records are stored as JSON text, so app data never becomes MongoDB keys or operators. Checks: login, collection and
  setting names, ids `[A-Za-z0-9_-]{1,120}`, `d.id` matches, times (clamped to server time), no duplicates; 256 KB per record,
  2 MB per account (413 `too_big`, nothing half-saved; deleting makes room), 5000 changes and 3 MB per request, `SYNC_RATE_PER_MIN` (120).
- Client: `src/services/sync/records.ts` (what syncs, checks for incoming records, `applyRecords`), `engine.ts` (the rules, no timers,
  tested with two "phones"), `index.ts` (timers, status for the UI, `prepareLink`, `flushSync`, `forgetSync`). What the phone knows about
  the account is in its own localStorage key `may-ani.sync.v1`, never in app state or backups. Syncs 2 s after a change, on app start,
  on return to the app, when the internet comes back, every 5 min, in chunks of about 1 MB.
- Conflict rule (per record, documented at the top of `engine.ts`): the later change wins; a tie keeps the account's copy; a record this
  phone has not changed always takes the account's copy; deletes travel as marks kept 180 days. First log-in on a phone: the account's
  copy wins for records on both sides; if the phone has records the account lacks and the account already has data, the log-in form asks
  "Keep both" (default) or "Use only my account's data". Background linking (no one to ask) keeps both.
- Log out first tries to send waiting changes and warns if it cannot; then the phone forgets the link. "Delete all my data" forgets the
  link before emptying the phone, so an empty phone is never sent as "everything deleted".
- Keep the lists and limits in `server/sync.mjs` and `records.ts` the same (`tests/sync.test.ts` checks this).

## Health photo check (rebuilt 18 October 2026)
Why it was rebuilt: the owner's banana-leaf photo said "No clear match" because the Anthropic account had no credit, the server
answered 502, and the page silently fell back to the offline matcher, which needs text. The white box on the photo was decoration only.
- Server `handleDiagnose` / `DIAG_SYSTEM` (`server/index.mjs`): the photo alone is enough; the model looks at the whole frame and first sets
  `subject` (`PHOTO_SUBJECTS`: plant, animal, fish, farm, other, unclear) and `seen`. `other`/`unclear` always get `results: []`,
  whatever the model wrote. Each result has `evidence` (what in the photo points to it). Answer `{ subject, seen, results }`.
- `claude()` sends `max_tokens` 8000 (thinking counts toward it on current models) and, for diagnosis, `output_config.effort: "medium"`;
  timeout `AI_TIMEOUT_MS`; failures carry a `code` to the app: `ai_billing` (no credit, 503), `ai_key`, `ai_busy`, `ai_offline`,
  `ai_timeout`, `ai_refused` (`stop_reason: "refusal"`), `ai_unreadable`, `ai_error`, and `ai_off` (no key, 501). Provider text and the
  key never reach the app; hints go to the server log. JSON is asked for in the prompt (not structured outputs): Anthropic checks
  billing before the request shape, so nothing about the real request could be tested without credit.
- App: `aiDiagnose` returns `AiCheck`; `readAiCheck` (`services/health.ts`) turns it into not_farm / unclear / no_problem / results and
  `wrongKind` (fish photo under "Plant" -> "Switch to Fish"; a saved log entry is filed under what the photo shows). `aiProblem`
  explains failures. Photos go up at 1568 px long side, whole; the preview uses `object-fit: contain` and a full-width scan line.

## Layout tab: "3 ideas for your site"
Flow: user adds a site photo (planner photo is reused) -> one button "Analyze my photo and make 3 pictures" -> Claude reads the photo (`/api/ai/survey`: ground, reusable items, notes; optional, failure never blocks) -> an image model draws 3 designs on the photo (`/api/ai/render`) -> user taps an idea to see materials with current PH prices, recycling options and measured build steps.
- Deterministic engine, no AI for numbers: `src/services/build/designs.ts` (3 designs: raised beds, grow bags/containers, vertical; cut list with lumber optimisation, 8 ft stock, 3 mm kerf, board feet; media mix; BOM; steps; `priceDesign`), `prompt.ts` (builds the image prompt from the design's real numbers), `geometry.ts` (homography helpers, leftover from the removed overlay; `isValidQuad` still used by `ai.ts`).
- UI: `src/components/build/` BuildStudio (orchestrator), MaterialsCard (editable "my price"), RecyclingCard, BuildSteps.
- The earlier drawn overlay (flat blobs on the photo) was **rejected by the owner as fake-looking**. Do not bring back drawn "pretend 3D" overlays. Its leftover files (`PhotoScene.tsx`, `services/build/render.ts`, `tests/render.test.ts`) were deleted on 18 October 2026.
- Pictures and photos are stored on the device only (IndexedDB), per plan and design.
- Reference look the owner wants (an infographic: top-view blueprint, realistic after view, materials and prices table): the app currently makes the realistic after view only; materials and prices come from our own table.

## Keys and `.env` (never commit `.env`, never print keys)
- `ANTHROPIC_API_KEY` : photo reading, diagnosis, site analysis. Needs Anthropic API **credit** (separate from a Claude subscription). A "credit balance is too low" error is billing, not a bug.
- `GEMINI_API_KEY` or `OPENAI_API_KEY` : realistic pictures (Claude cannot generate images). Costs money per picture on the owner's account. `IMAGE_PROVIDER=gemini|openai` if both exist.
- `GEMINI_IMAGE_MODEL`, `OPENAI_IMAGE_MODEL` : override the default model names if a provider says "model not found". Defaults in `server/index.mjs` were taken from provider docs and have **never been run against the real services**.
- `MONGODB_URI` : accounts (sign up / log in). Atlas `mongodb+srv://...` or local `mongodb://127.0.0.1:27017`. Contains a password: never print it. `MONGODB_DB` (default `may_ani`), `MONGODB_TIMEOUT_MS` (8000), `AUTH_RATE_PER_MIN` (20), `SYNC_RATE_PER_MIN` (120 data saves per minute per IP). Setup steps for the owner are in README "Turning on accounts".
- `SMTP_USER`, `SMTP_PASSWORD` : password reset emails, sent from a Gmail account (owner chose Gmail on 18 October 2026: free, no domain needed, about 500 emails/day). `SMTP_PASSWORD` is a Gmail **app password**: a secret, never print it. `APP_URL` (default `http://localhost:PORT`) is where the emailed link opens the app; phones need the PC's LAN address or a real website. Optional: `EMAIL_FROM`, `RESET_RATE_PER_MIN` (5), `SMTP_HOST` (smtp.gmail.com), `SMTP_PORT` (465; tests point these at the fake mail server). Setup steps for the owner are in README "Turning on password reset".
- Daily AI allowance (README "Putting May-Ani online safely"): `AI_DAILY_GUEST` (5), `AI_DAILY_GUEST_PER_IP` (30), `AI_DAILY_ACCOUNT` (20), `AI_DAILY_TOTAL` (300), `PICTURES_DAILY_GUEST` (3), `PICTURES_DAILY_GUEST_PER_IP` (15), `PICTURES_DAILY_ACCOUNT` (9), `PICTURES_DAILY_TOTAL` (60); 0 = none. `TRUST_PROXY` (empty = off). `ALLOWED_ORIGIN` should be the real website once online (startup prints a tip when `APP_URL` is https and it is still `*`).
- Others: `ANTHROPIC_MODEL`, `AI_TIMEOUT_MS` (90000), `AI_RATE_PER_MIN` (15 AI calls per minute per IP), `PORT`, `ALLOWED_ORIGIN`, `DATA_FILE`, `*_BASE_URL` (used for mock servers in tests).
- Server startup line shows `AI: on`, `pictures: gemini|openai|OFF`, `accounts: on (MongoDB)|OFF - reason` and `email: on (smtp.gmail.com), reset links open <APP_URL>|OFF - reason`, then `Accounts: connected to MongoDB.` and `Email: logged in to smtp.gmail.com...`, or why not.

## Known open items
1. Real Gemini/OpenAI image calls are unverified. Check `renderGemini` / `renderOpenAI` in `server/index.mjs` against current provider docs when the owner has a key; fix request shape or default model names if needed.
2. Owner's Anthropic account still had no credit on 18 October 2026 (checked with one tiny call: "credit balance is too low", nothing charged).
   So photo reading, the new health prompt (relevance check, whole-photo look, `evidence`) and `output_config.effort` have **never run
   against the real model**; they are tested only with a fake Anthropic server. After credit is added: try a crop photo, a non-farm photo
   (fan) and a fish under "Plant", and watch the server log for any 400 about the request.
3. Prices are a snapshot (sources and date in `src/data/materials.ts`, `PRICES_AS_OF`). Refresh them before relying on them.
4. Owner still needs to delete old duplicate folders in Documents (AniAqua, MyAni, MyAniApp, a loose May-Ani); not something to automate.
5. Only crop plans up to 600 sqm get the build ideas; fish and livestock builds are not covered.
6. Accounts (built 18 October 2026) run on the owner's **MongoDB Atlas free (M0) cluster**, verified 18 October 2026: server connects, first real account saved in database `may_ani` (scrypt hash, SHA-256 session, TTL index). Atlas only lets in allowed IP addresses: a Philippine home IP can change, and then the server log says MongoDB is not reachable. Fix: Atlas > Network Access > add the current IP.
7. Password reset by email (built 18 October 2026) is verified only against the fake mail server in tests and a browser check; **real Gmail sending is untested** until the owner adds `SMTP_USER` and `SMTP_PASSWORD`. First real run: check the startup line says `Email: logged in to smtp.gmail.com`, send one reset to the owner's own email, and look in Spam.
   Accounts gaps: no email verification at sign-up (anyone can sign up with an address they do not own; a reset email would then go to the real owner of that address). Chat identity follows the account since 18 October 2026, but chat data still lives in `server/data.json`, not MongoDB.
8. This PC lacks the full Microsoft Visual C++ runtime, so the test mongod could not start. Working fix for now: the four runtime DLLs (copied from OneDrive's folder) sit next to the binary in `node_modules/.cache/mongodb-memory-server/`. A fresh `node_modules` loses them and the MongoDB tests skip with a message. Proper fix: owner installs the VC++ Redistributable x64.
9. Account data sync (built 18 October 2026) is verified with a throwaway MongoDB only (tests, and a browser check with three
   "phones" = three site addresses on one PC: data made on one appeared on the others, "Keep both" asked and worked, "Waiting for
   internet" shown when the server stopped). **Not yet run against the owner's Atlas cluster or on two real phones.** Honest limits:
   the "later change wins" rule trusts each phone's clock (the server caps times at its own clock, and an edit is never older than the
   copy it replaces); a change is timed when the app notices it (within seconds, or at the next sync after the app was closed);
   a phone offline for more than 180 days can bring back things deleted elsewhere; Atlas M0 has 512 MB, so about 250 full 2 MB accounts.
   Photos and chat are not synced. Restoring a backup file while logged in sends the restored records to the account (since
   18 October 2026 a restore no longer brings in the profile or settings).
10. Production build fixed 18 October 2026 (`define` in `scripts/build.ts`). The service worker now registers in `dist/`, but browsers
    allow service workers and "Install app" only on HTTPS or localhost: phones on `http://192.168...` get neither. Offline mode on a real
    phone is untested. App icons: PNGs in `public/` (192, 512, maskable 512, apple-touch 180) were made from `icon.svg` with headless
    Edge at 512 px and shrunk with System.Drawing; remake them the same way if the icon changes.
11. Review of 18 October 2026: quick wins 1-5, 8, 12, 20, 22, 27, 28 are done; server hardening (daily AI allowance, TRUST_PROXY,
    security headers) done the same day. Still open from that list: hosting with HTTPS, privacy notice and account deletion
    (RA 10173), email verification, change password / log out everywhere, chat: the directory is still public (only phones that
    opened Community), chat tokens are kept as plain text in data.json and travel in the stream URL, no block/report, no read receipts
    (ticks), read state is per phone, no notifications while the app is fully closed (needs Web Push), chat data not in MongoDB;
    Filipino interface, editing records and undo, units beyond kg, offline weather, reminders, MongoDB backups, browser tests, CI,
    code splitting.
13. Chat changes of 18 October 2026 are verified by tests (identity, merge, unread rules) and a browser check with simulated second
    and third users on the safe server (sides, bold + counts, menu and tab-title badges, notice with the sender's name, no notice for
    the open conversation, phone layout). Not checked: real phone notifications (the preview browser blocks them; needs https or
    localhost and a tap on "Alert me"), and the guest-to-account merge in a browser (covered by an end-to-end test). The owner's
    `server/data.json` still holds test users from before the fix (two "May Ani User One" device ids, a "Guest"); each device id
    merges into the account the next time that browser opens Chat while logged in, or the file can be deleted (server stopped) to
    start chat fresh.
12. Hardening limits (18 October 2026): daily counts are in memory (a restart resets them; one server process only). TRUST_PROXY is
    tested with simulated headers only, never behind a real proxy or tunnel. The CSP was checked on the built app (16 pages, no
    blocks; weather, map tiles and the service worker work; an injected script and an outside image were blocked), but with AI
    switched off: the Health allowance line and the "used up" alert were not seen in a browser (covered by end-to-end tests).
    A plain `http` market feed URL is blocked on the built app (CSP `connect-src 'self' https:`).

## Testing notes
- Unit tests live in `tests/`. `tests/build-sync.test.ts` keeps the server's id lists and prompt limit in sync with the app. Keep it passing when changing either side.
- For image/AI flows, test with mock servers via the `*_BASE_URL` env vars; do not spend the owner's real credit in automated tests.
- `tests/auth.test.ts` spawns the real server with a throwaway MongoDB (`mongodb-memory-server`) and always sets `MONGODB_URI` itself, so it never touches the owner's database. It also checks the password/name limits match between `server/auth.mjs` and `src/services/auth.ts`.
- `tests/reset.test.ts` covers "Forgot your password?" end to end with a throwaway MongoDB and `tests/support/fake-smtp.ts` (a fake mail server on 127.0.0.1 that checks the login and keeps the emails in memory): expiry, single use, racing resets, session revocation, no account enumeration (same answer, answers before sending), per-email and per-IP limits, Host-header injection, HTML escaping, mail login failure. `tests/support/server.ts` starts the real server with all keys, email and `MONGODB_URI` switched off unless a test sets them (a test that forgets can never reach the owner's Atlas); use it for new end-to-end tests. Its optional `dataDir` lets a test look at the chat data file.
- `tests/limits.test.ts`: TRUST_PROXY address rules, the daily allowance (per phone, per address, per account on a throwaway MongoDB, total, refunds, Philippine midnight), pictures counted separately, and the security headers (incl. HSTS only with an https APP_URL). `tests/support/server.ts` sets every daily limit to 100000 unless a test sets its own, so other tests are not limited.
- Browser check of the built app without real keys or database: `bun run build`, then the "server-safe" preview (`.claude/launch.json`, `bun --env-file=scripts/safe.env server/index.mjs`, port 8790; every key is a single space = off, so the server's own `.env` reader does not fill them in). Its chat file is `server/data.json.safe` (git-ignored).
- `tests/backup.test.ts` (restore only takes checked farm data, never settings or profile), `tests/store.test.ts` (damaged saved data kept, lists repaired, "not saved" warning), `tests/server.test.ts` (static file folder check, broken %-codes, chat file moved aside and saved whole, picture errors stay in the log), `tests/format.test.ts` (number parsing, empty dates, CSV safety).
- `tests/health-ai.test.ts` covers the health photo check against a fake Anthropic API (Bun.serve on 127.0.0.1 via
  `ANTHROPIC_BASE_URL`): photo-only checks, the whole photo forwarded unchanged, the relevance check (fan -> no diagnosis, blurry,
  wrong category), answer trimming, every failure code (no credit, bad key, busy, refusal, unreadable, timeout, unreachable, no key),
  and that `PHOTO_SUBJECTS` match between server and app. Its servers set `MONGODB_URI` off so they never touch the owner's Atlas.
- `tests/sync.test.ts` covers account data sync: the record rules (order, checks, chunks), the `/api/sync` endpoint on a throwaway MongoDB
  (login, bad requests, size limits, conflict rule, deltas, deletions, two phones saving at once, rate limit) and two or three "phones"
  running the app's own engine against the real server (edits both ways, offline conflicts, slow clock, edits during a sync, the
  first-login question both ways). It also checks that the lists and limits match between `server/sync.mjs` and `records.ts`.
- Browser check without touching the owner's database: start the server with a throwaway MongoDB (`mongodb-memory-server`, set
  `MONGODB_URI` in the environment, which wins over `.env`), then use `localhost:PORT`, `127.0.0.1:PORT` and `127.0.0.2:PORT` as
  separate "phones" (each address has its own browser storage).
- Published preview of the app also exists as a claude.ai artifact (built from `dist/`); it is a convenience, not the source of truth. The source of truth is this folder.
