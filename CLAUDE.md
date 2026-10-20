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
- `bun run typecheck`, `bun test` (524 tests on 20 October 2026, about 1 to 3 minutes with the MongoDB end-to-end tests), `bun run build` (output `dist/`; production build: `define` sets `process.env.NODE_ENV` so React's production build and the offline service worker are in it, about 560 KB JS; also writes `.br`/`.gz` copies: 613 KB of app files go out as 166 KB on 20 October 2026)
- `bun scripts/backup.ts [--all]` : copy of the MongoDB in `.env` into `backups/` (keeps 14); `bun scripts/restore.ts <folder|latest> <database> [--force]` (known open item 15). Never run them against the owner's Atlas in a check: set `MONGODB_URI` to a throwaway database.
- Kill processes by port or PID, never `pkill -f` with a pattern that matches its own shell.
- Version control: git repository since 18 October 2026 (branch `main`, first commit "Baseline"). No GitHub copy yet (`gh` is not installed). `.gitignore` keeps `.env`, `server/data.json*`, `node_modules`, `dist`, `backups/` out. Commit only when the owner asks.

## Login only (owner's decision, 18 October 2026)
May-Ani is for logged-in users only: no guest mode, so nobody anonymous can message or scam farmers. App: `App.tsx` shows Welcome
whenever `profile.account` is missing (an old guest profile, or a login that ended: `checkSession` at start, or a 401 in sync);
the farm data on the phone is kept and goes into the account at sign-up or log-in (Welcome says so). A logged-in user keeps working
offline (the session is checked when online). Server: AI (`/api/ai/*`) and all of chat (`/api/chat/*`) need the account login
(`loggedIn()` in `server/app.mjs`: 401 `login`, 503 `accounts_off` / `accounts_down`); sync already did. Without MongoDB nobody can
log in, and the server log says so. Log out (owner's layout, 19 October 2026): the account name, then a "Log out" item UNDER it, at
the bottom of the sidebar (960px and up: tablets held sideways, notebooks, laptops, desktops, large screens) and at the bottom of the
"More" sheet (phones and tablets below 960px), where the name block and Log out are CENTERED (owner, 19 October 2026: no empty space
on one side; `justify-items: center` on `.sheet-account`; the sidebar stays left-aligned like its menu items). Small phones (max 719px wide and 700px tall) let the sheet use 94dvh with tighter
tiles; sideways phones get a compact 5-column sheet; `.sheet-account` uses `minmax(0, 1fr)` so a long email ends with "…" instead of
widening the menu. All through `useLogOut()` in `components/AuthForms.tsx` (asks, sends waiting changes, then logs out); the Settings
button uses it too. Checked with a long name and email at 320x568, 375x812, 412x915, 812x375, 768x1024, 1024x768, 960x540, 1280x720,
1366x768, 1440x900, 1920x1080 and 2560x1440: right order, visible without scrolling, text inside, no sideways scroll.
Removed: guest mode, the Account page, guest AI limits and the phone id (`X-Device-Id`), sample
chat contacts, the separate chat token (`may-ani.chatToken` is deleted on connect).

## Layout
- Project name (owner's rule, 20 October 2026): the planner's "Project name" is required and unique per account
  (`planNameProblem` in `services/planner/name.ts`: trimmed, at most 60 characters, compared without regard to capitals and extra
  spaces against every other plan's shown title and typed name; older unnamed plans match by their made-up title). Shown under the
  box (empty after leaving it, a used name at once, with "Open that plan"); Next stays off with a hint; checked again on Generate.
  Edit now changes the same plan (`replacePlan` in `core/actions.ts`: same id, farm link, build choices, photos) instead of adding a
  copy. Limits: only plans this phone knows are checked (another phone's plan counts once it has synced); two phones offline can
  still both use one name, and the server does not refuse it (sync stores records as they come). Tests: `tests/plan-name.test.ts`.
- `src/pages/*` one file per screen: Dashboard, Planner (create plan), PlanDetail (tabs incl. Layout), Farms, Health, Weather, Market, Permits, Manage, Community (chat), Learn, Settings, Welcome (splash, sign up, log in; the only screen without a login), ResetPassword (`/reset?token=...`, opened from the reset email; App.tsx renders it full-screen with or without a profile, it strips the token from the address bar).
- `src/data/*` catalog (vegetables & crops, fruits, fish, livestock), diseases, faults, learn, permits, places, `materials.ts` (prices), `recyclables.ts`, `verses.ts` (Dashboard "Verse of the day", KJV, public domain).
- `src/services/*` planner, weather, forecast, hazards, market, geocode, chat, health, `ai.ts` (client for the server's AI; exports `call` and `ApiError`), `auth.ts` (accounts client; token in its own localStorage key `may-ani.session.v1`, never in app state or backups), `sync/` (farm data that follows the account, see "Account data sync" below), `build/` (see below). Sign-up/log-in forms and the "Forgot your password?" form (`ForgotForm`, shown inside `LogInForm`): `src/components/AuthForms.tsx`.
- `src/core/*` store, actions, router, hooks. `src/lib/*` format (`parseNumber` reads "1,500" / "₱1,500.50"), geo, image, `photoStore.ts` (IndexedDB for photos and AI pictures), `download.ts` (`saveFile`), `csv.ts` (BOM, formula-safe cells).
- Chat (18 October 2026, `services/chat.ts`, `pages/Community.tsx`, `/api/chat/*` in `server/chat.mjs`, data in MongoDB since
  19 October 2026: `chat_profiles`, `chat_messages` (time from the database clock), `chat_tickets`):
  accounts only. Chat id `acct-<account id>` on every phone, name and role from the account. Every call sends the login
  (`Authorization: Bearer`); the sender of a message is always the logged-in account (a "from" in the body is ignored); messages go
  only to `acct-` users who joined; directory (1000 most recently active) and history (last 500) list only `acct-` users. The old
  `server/data.json` is imported once at start (accounts and their messages only, idempotent upserts) and renamed
  `data.json.imported-<time>`, never deleted. The live stream (EventSource cannot send headers) uses a one-time ticket from
  `POST /api/chat/ticket` (random, SHA-256 stored, one connection on any server copy, 1 minute), so the login token never goes into
  a URL; at most 5 streams per user per copy. A message goes at once to streams on the same copy; each copy with open streams checks
  `chat_messages` every 1.5 s (5 s overlap, delivered ids remembered) for messages sent through other copies. Chat bodies are
  limited to 16 KB. Client:
  a dropped stream reconnects with a new ticket (3 s, doubling to 60 s); without the server, earlier conversations stay readable and
  Send is off. Tabs: Messages (people you talked with) and Contacts (everyone); no groups. Why accounts: the owner's test showed a
  guest who logged in kept chatting as the old guest id (both sides the same sender), and the owner removed guest mode against scams.
  The connection is app-wide (`startChat` in App.tsx) but only for phones that opened Community once (`chatJoined`), so nobody is listed
  without choosing to chat. Unread = messages from them newer than `chatRead[contact]` (per phone, in app state, not synced); bold row
  + count, total on the Community/Chat menu and in the tab title "(n) May-Ani"; an open, visible conversation is read at once. New
  message: toast when visible, otherwise a notification via `lib/notify.ts` (service worker `showNotification`, tap opens
  `#/community?with=<id>` through a postMessage to the app) after the user taps "Alert me of new messages" (https or localhost only).
  Received bubbles left, sent right, "Today/Yesterday" separators, clock times, "You:" previews.
- Dialogs (18 October 2026): every popup is `Sheet` (`components/ui.tsx`): a bottom sheet on phones, a centered box from 720px; from 960px, when the sidebar shows, centered on the page content beside it (`body:has(.app > .sidebar) .sheet-backdrop` adds the sidebar width as left padding; the dim backdrop still covers the sidebar). Toasts are centered the same way. Only the top dialog answers Escape and keeps Tab inside; focus returns to where it was; the page behind does not scroll (`body.sheet-open`, `scrollbar-gutter: stable`). Yes/no questions use `await askConfirm({ title, message, ok, cancel?, danger? })`, never the browser's `confirm()` (it cannot be styled or centered). `ToastHost` and `ConfirmHost` render once in `App.tsx`, so they also work on Welcome and the reset page. Checked at 375, 768, 960, 1280 and 1920 px wide.
- Data safety in the app (built 18 October 2026): `components/ErrorBoundary.tsx` around each page (keyed by path, menu stays usable) and around the whole app (main.tsx), with "Download a backup". The store moves saved data it cannot read to `may-ani.state.damaged` (never overwrites it; Welcome says so, Settings > Your data downloads or deletes it), repairs lists that are not lists, shows a red "NOT saved" banner (Shell, `useSaveProblem`) while saving fails, and asks `navigator.storage.persist()` once there is a profile. Restore (`importData`) brings in only farm data, each item checked with the sync guards (`cleanBackup` in `services/sync/records.ts`); never the profile, login or settings such as the server address. `NumberInput` is a text box (inputMode decimal) that accepts commas and ₱, says "Type a number" under the box, and points out min/max after the box is left.
- Server, one file per part (split 19 October 2026; design in `docs/ARCHITECTURE.md`): `index.mjs` only starts it (reads config,
  listens, "port in use" message, SIGTERM/SIGINT = clean stop, a second Ctrl+C stops at once); `config.mjs` (`loadEnvFile`,
  `loadConfig(env)` → `{ config, problems }`: the ONLY place that reads environment variables; tests pass their own object, so they
  never see `.env`); `app.mjs` (`createApp(config)`: router, `loggedIn`, `/api/live`, `/api/ready`, `/api/health`, clean `shutdown()`:
  no new connections, streams ended, running requests get 10 s, MongoDB closed; database errors anywhere become 503 `accounts_down`);
  `http.mjs` (`json`, `cors`, `readJson` with per-route size limit, in-memory per-IP `limited`, `securityHeaders`, `requestId`
  (X-Request-Id), `makeLog` (`LOG_FORMAT` text|json), `logRequest` (path without the query)); `db.mjs` (one MongoClient, each part
  registers its indexes, `dbProblem`); `ai.mjs` (Claude, prompts, `allowance` gate); `images.mjs` (Gemini/OpenAI); `chat.mjs`;
  `static.mjs` (only inside `dist` + separator; a broken %-code is a 400; `.br`/`.gz` copies by Accept-Encoding, `chunk-*` immutable
  for a year, index.html/sw.js/manifest no-cache, weak ETag + 304, a missing file with an extension is a 404, extensionless paths get
  index.html); `shared.mjs` (lists the app must match: PHOTO_SUBJECTS, RECYCLABLE_IDS, ONSITE_IDS, MAX_PROMPT; tests import it).
  `.d.mts` type files exist for `limits`, `shared`, `config`, `app`. Picture-provider error text goes to the server log only.
  Optional dependencies, each loaded only when switched on: the official `mongodb` driver (`MONGODB_URI`) and `nodemailer`
  (`SMTP_USER` + `SMTP_PASSWORD`).
- `server/limits.mjs` (types in `limits.d.mts` for the tests): `clientIp(req, trust)` (TRUST_PROXY: off | loopback | number of proxies | proxy IPs; X-Forwarded-For read from the right; used by every rate limit), shared counters (`mongoCounters(database)`: collection `limits` `{ _id: key, n, expiresAt }` with a TTL index, atomic pipeline upserts; `memoryCounters()` for unit tests; `add` (fixed or sliding window), `undo`, `count`, `clear`) and `dailyQuota(limits, { counters, kind })` (paid AI per Philippine day, keys `ai:<day>:total` / `ai:<day>:account:<id>`, counted first and given back when over, so racing requests never exceed it; survives restarts; `take` and `release()` are async; `release()` gives back failures that cost nothing: `ai_billing`, `ai_key`, `ai_offline`, `ai_busy`, picture-provider error answers and network failures). AI needs a login (`allowance().take` calls `loggedIn` first). 429 codes `ai_quota` / `ai_daily_cap`; `/api/health` reports `daily: { ai, pictures }` (uses per account); the Health page shows the allowance. `src/services/ai.ts` sends the login on the four AI calls and on every chat call.
- Security headers on every answer (`securityHeaders()` in `server/http.mjs`): CSP (`script-src 'self'`, `style-src 'self'`, img `'self' data: blob: https://tile.openstreetmap.org`, connect `'self' https:`, `frame-ancestors 'none'`), nosniff, X-Frame-Options DENY, Referrer-Policy `strict-origin-when-cross-origin` (OpenStreetMap tiles need a Referer), Permissions-Policy, COOP; HSTS and `upgrade-insecure-requests` only when `APP_URL` is https. A new outside service in the app must be added to the CSP.
- `server/auth.mjs` accounts: `/api/auth/signup|login|me|profile|logout`. scrypt (N=2^15,r=8,p=3) password hashes, session tokens stored as SHA-256 only, TTL index expiry (60 days, sliding), wrong-password lockout (since the review of 20 October 2026: 5 wrong per email AND caller address lock only that address for 15 min, 50 per email from all addresses lock the email for 1 hour; every try counted before the password is checked, so parallel tries cannot slip past; reset clears all of an email's counters with `clearPrefix`; shared counters keyed by hashes of email and address, so all server copies count together), per-IP limit, same answer for wrong password and unknown email, 503 with a clear log hint when MongoDB is down or refuses the login. Also keeps the `password_resets` collection (methods `createResetToken`, `userForResetToken`, `resetPassword`); a session created before `users.passwordChangedAt` is refused.
- `server/reset.mjs` "Forgot your password?": `POST /api/auth/forgot` (same answer for every email, answers before the email is sent, 3 per email per hour as a shared counter, `RESET_RATE_PER_MIN` per IP) and `POST /api/auth/reset` (same `passwordProblem` rules; uses up the link atomically, deletes all sessions, ends the wrong-password lockout, sends a "password changed" email). Links: 32 random bytes, SHA-256 stored, 30 min TTL, newest link only, always built from `APP_URL` (never the Host header). Plugged into `authRoutes` through its `extend` parameter. Email texts escape the user's name.
- `server/mail.mjs` email sender: Gmail SMTP with an app password (nodemailer, port 465 TLS; STARTTLS required on other ports except to a loopback test server). `mailProblem(e)` turns errors into log hints and never includes the password.
- `server/sync.mjs` account data sync: `POST /api/sync` (see below). Store methods `loadAppData`/`appDataHead`/`saveAppData` live in `server/auth.mjs` (collection `appdata`). Fast path: no changes sent and `since` equals the account's `rev` → only `rev`/`bytes` are read (projection), not the whole document.

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
- Server `diagnose` / `DIAG_SYSTEM` (`server/ai.mjs`): the photo alone is enough; the model looks at the whole frame and first sets
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

## Planner types and mixes (built 20 October 2026)
Owner's request: a **Fruits** button next to Vegetables & crops, Fish and Livestock, and any **combination** of the four.
- `Sector` = `'crops' | 'fruits' | 'fish' | 'livestock'`; `SECTORS` (order), `planSectors(p)` (the ONLY way to read a plan's or farm's
  types: `sectors` if present, else the old single `sector`, deduped, in SECTORS order, never empty), `sectorsLabel`, `waitLabel`
  ("about 3½ years"), `plantsLabel` ("about 2 trees") in `src/data/catalog.ts`. `PlanInput.sectors` (new) + `sector` (= first type, still
  written so older app copies can read new plans); `Farm.sectors` only for a farm with more than one type (a mixed plan saved as a
  farm, or the "I already have a farm" form). Old plans and single-type farms have no `sectors`.
- Fruits in the catalog: mango, banana, papaya, calamansi, pineapple, dragon_fruit, lanzones, rambutan, guava, watermelon; all numbers
  are **estimates** (not sourced). Trees: `daysToHarvest` = planting to first real harvest, `cycleDays` 365, yield per sqm per year at
  bearing age, `perPlantSqm` (spacing), `shadeTolerant` (lanzones), `areaKind`/rect kind `'orchard'`. Market reference prices for them
  in `services/market.ts`. Custom fruit items: days up to 3650; a fruit over 365 days is estimated from the built-in fruit TREES
  (spacing 36 sqm, costs, yield), gets `cycleDays` 365 and is counted in "trees"; a quicker one from the other fruits. Tree counts:
  `plantSpots(item, rect)` (rows and columns rounded to the nearest whole tree) is used by the drawing, the Overview text and the
  schedule, so they always agree (the schedule text is stored when a plan is made). Five fruit problems in
  `data/diseases.ts` (fruit fly, anthracnose, bunchy top, Fusarium wilt, papaya ringspot); Health "Plant" lists fruits too.
- Engine (`services/planner/index.ts`, `layout.ts`, `infra.ts`): the land is split evenly into one strip per type (`planPlot`, zones,
  `layout.zones` for the drawing); each type ranks its own items (its picks, else suggestions); one shrink factor for all types until
  the whole cost fits the capital; tank/pump, canal, wiring and permits are shared and counted once; `result.split` (mixed only) =
  per-type cost + `shared`, adding up exactly to `cost.initial`. A type where nothing suits its share is dropped with a warning and
  the rest is re-planned. Payback adds the first-harvest wait weighted by each item's income (was a plain average; single-type plans
  moved by at most 0.3 months). The final drawing now uses the same numbers as the measured one (fixes priced vs drawn area drift).
  A single-type plan is one strip: checked against a snapshot of 384 plans made before the change, identical except payback and,
  for some, the drawn rectangles (costs unchanged).
- UI: Planner step 2 `ToggleChips` (multi-select, `components/ui.tsx`), one picker + "Add your own" per chosen type, "Choose at least
  one" message and Next disabled with none, turning a type off drops its picks, Review lists every type and its picks. ForecastCard:
  `BudgetSplit` (money rounded to ₱100, whole percentages that add up to 100 via `wholePercents` in `lib/format.ts`), "Suggested"
  rows (with +) for a type with no picks. PlanDetail: type badges, items grouped by type, tree
  counts, waits in months/years, schedule shows "Year N" after week 52. PlanLayout: orchard blocks with one dot per tree, dashed
  strip per type, legend grouped by type. Build ideas for a mixed plan: `services/build/garden.ts` (`gardenPart`) re-bases the
  vegetable beds onto their own plot (that part up to 600 sqm). Sync/backup guards accept `fruits` and a valid `sectors` list.
- "I already have a farm" form (`pages/Farms.tsx` AddFarm, rules in `services/farmForm.ts`, 20 October 2026): "What kind of farm?" is
  `ToggleChips` with the planner's words and icons. `FarmFormInput.sectors` (SECTORS order); `buildFarm` saves `sector` = first type
  and `sectors` only when more than one (same shape as `savePlanAsFarm`). `toggleFarmSector` keeps the order and removes the lines of
  a type turned off; the item list has every chosen type (`optgroup` per type when mixed); each line's date label comes from its own
  item (`startedLabel`: Planted / Stocked / Started on). No type: `NO_FARM_TYPE` (the planner's words) shows at once and
  `checkFarmForm` gives `sectors`, so "Add farm" saves nothing. Mixed wording: `areaFieldLabel` "Whole farm area", `nameHint`,
  `itemsTitle` ("growing and raising"). `FarmLine.row` is a form-only id (rows keep their boxes when a line above goes; never saved).
- Verified 20 October 2026: `tests/planner.test.ts` (fruits, mixed plans, all 15 type combinations x 3 farm sizes, old plans, build
  ideas), `custom-items`, `sync` (fruit/mixed/old records and backup restore), `services` (fruit problems), `format`; and a browser check
  on the throwaway database ("server-test-db") at 375 px and 1280 px: type buttons wrap, picker per type, "Choose at least one",
  turning a type off drops its picks, mixed and fruits-only plans generated and opened (all tabs), Save Plan -> mixed farm labels on
  Farms and Dashboard, Edit restores the types, an old-style plan (no `sectors`) opens and edits as its one type, both synced to a
  second "phone" (127.0.0.1), "Add your own" fruit, Market/Health/Permits/farm form, no console errors.
- Farm form verified 20 October 2026: `tests/farm-form.test.ts` (16 tests: shape like a saved mixed plan, sync check passes, toggle
  order and line removal, row ids never saved, wording, per-line date labels, area check across types) and a browser check on the
  throwaway database at 375 px and 1280 px: crop line kept when Fish and Livestock were added, crop line (only) gone when crops were
  turned off, other lines kept their numbers, "Choose at least one" with none and nothing saved, a Fruits + Fish + Livestock farm with
  3 records saved and shown on Farms, the farm page and Dashboard, synced to a second "phone" (127.0.0.2, see Testing notes: use `*.localhost` instead), a Fish-only farm saved
  without `sectors`.
- Not done: phones still running an older copy of the app skip fruit plans/farms/items from the account (no crash) until they update.
  Fruit numbers are estimates, not sourced.

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
- `GEMINI_IMAGE_MODEL`, `OPENAI_IMAGE_MODEL` : override the default model names if a provider says "model not found". Defaults in `server/config.mjs` were taken from provider docs and have **never been run against the real services**.
- `MONGODB_URI` : accounts (sign up / log in). Atlas `mongodb+srv://...` or local `mongodb://127.0.0.1:27017`. Contains a password: never print it. `MONGODB_DB` (default `may_ani`), `MONGODB_TIMEOUT_MS` (8000), `AUTH_RATE_PER_MIN` (20), `SYNC_RATE_PER_MIN` (120 data saves per minute per IP). Setup steps for the owner are in README "Turning on accounts".
- `SMTP_USER`, `SMTP_PASSWORD` : password reset emails, sent from a Gmail account (owner chose Gmail on 18 October 2026: free, no domain needed, about 500 emails/day). `SMTP_PASSWORD` is a Gmail **app password**: a secret, never print it. `APP_URL` (default `http://localhost:PORT`) is where the emailed link opens the app; phones need the PC's LAN address or a real website. Optional: `EMAIL_FROM`, `RESET_RATE_PER_MIN` (5), `SMTP_HOST` (smtp.gmail.com), `SMTP_PORT` (465; tests point these at the fake mail server). Setup steps for the owner are in README "Turning on password reset".
- Daily AI allowance (README "Putting May-Ani online safely", logged-in accounts only): `AI_DAILY_ACCOUNT` (20), `AI_DAILY_TOTAL` (300), `PICTURES_DAILY_ACCOUNT` (9), `PICTURES_DAILY_TOTAL` (60); 0 = none. `TRUST_PROXY` (empty = off). `ALLOWED_ORIGIN` should be the real website once online (startup prints a tip when `APP_URL` is https and it is still `*`).
- Others: `ANTHROPIC_MODEL`, `AI_TIMEOUT_MS` (90000), `AI_RATE_PER_MIN` (15 AI calls per minute per IP), `PORT`, `ALLOWED_ORIGIN`, `DATA_FILE` (the old chat file, imported once into MongoDB), `LOG_FORMAT` (text | json), `INSTANCE_ID` (names a server copy in the logs), `*_BASE_URL` (used for mock servers in tests). All read only in `server/config.mjs`.
- Server startup line shows `AI: on`, `pictures: gemini|openai|OFF`, `accounts: on (MongoDB)|OFF - reason` and `email: on (smtp.gmail.com), reset links open <APP_URL>|OFF - reason`, then `Accounts: connected to MongoDB.` and `Email: logged in to smtp.gmail.com...`, or why not.

## Known open items
1. Real Gemini/OpenAI image calls are unverified. Check `renderGemini` / `renderOpenAI` in `server/images.mjs` against current provider docs when the owner has a key; fix request shape or default model names if needed.
2. Owner's Anthropic account still had no credit on 18 October 2026 (checked with one tiny call: "credit balance is too low", nothing charged).
   So photo reading, the new health prompt (relevance check, whole-photo look, `evidence`) and `output_config.effort` have **never run
   against the real model**; they are tested only with a fake Anthropic server. After credit is added: try a crop photo, a non-farm photo
   (fan) and a fish under "Plant", and watch the server log for any 400 about the request.
3. Prices are a snapshot (sources and date in `src/data/materials.ts`, `PRICES_AS_OF`). Refresh them before relying on them.
4. Owner still needs to delete old duplicate folders in Documents (AniAqua, MyAni, MyAniApp, a loose May-Ani); not something to automate.
5. Only crop plans up to 600 sqm (and the vegetable part of a mixed plan, up to 600 sqm) get the build ideas; fruit, fish and livestock builds are not covered.
6. Accounts (built 18 October 2026) run on the owner's **MongoDB Atlas free (M0) cluster**, verified 18 October 2026: server connects, first real account saved in database `may_ani` (scrypt hash, SHA-256 session, TTL index). Atlas only lets in allowed IP addresses: a Philippine home IP can change, and then the server log says MongoDB is not reachable. Fix: Atlas > Network Access > add the current IP.
7. Password reset by email (built 18 October 2026) is verified only against the fake mail server in tests and a browser check; **real Gmail sending is untested** until the owner adds `SMTP_USER` and `SMTP_PASSWORD`. First real run: check the startup line says `Email: logged in to smtp.gmail.com`, send one reset to the owner's own email, and look in Spam.
   Accounts gaps: no email verification at sign-up (anyone can sign up with an address they do not own; a reset email would then go to the real owner of that address). Chat identity follows the account since 18 October 2026, and chat data is in MongoDB since 19 October 2026.
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
    (RA 10173), email verification, change password / log out everywhere, chat: no block/report (important for a marketplace,
    now that everyone is a named account), no read receipts (ticks), read state is per phone, no notifications while the app is fully closed (needs Web Push);
    Filipino interface, editing records and undo, units beyond kg, offline weather, reminders, browser tests,
    code splitting (on purpose, see docs/ARCHITECTURE.md decision 7). Chat in MongoDB, a CI file and MongoDB backups (item 15) were done 19 October 2026.
13. Chat and login-only (18 October 2026) are verified by tests (login needed for every chat and AI call, sender is always the logged-in
    account, old guests hidden, one-time stream tickets, unread rules) and a browser check on a throwaway MongoDB ("server-test-db"):
    pages redirect to Welcome without a login, sign-up, a live message from a second account (badge, tab title, notice), sides on both
    accounts, and an old guest phone that signs up keeps its farm and it reaches the account. Not checked: real phone notifications
    (the preview browser blocks them; needs https or localhost and a tap on "Alert me"), and the owner's Atlas. The owner's
    `server/data.json` is copied into the owner's Atlas (accounts and their messages only) the first time the new server starts
    with MongoDB, then renamed `data.json.imported-<time>`. Existing logged-in users must open Community once again to join as accounts.
14. Ready to scale (19 October 2026, docs/ARCHITECTURE.md): several server copies can share one MongoDB (chat, tickets, lockouts,
    reset limits and the daily AI allowance are shared; live delivery between copies by a 1.5 s database check). Verified by
    `tests/scale.test.ts` (two real server processes on one throwaway MongoDB) and a browser check with two copies. **Not verified:**
    a real load balancer or hosting platform, the owner's Atlas (the chat import runs there at the next start), the `Dockerfile`
    (no Docker on this PC) and `.github/workflows/ci.yml` (no GitHub copy yet). Windows cannot send SIGTERM to another process, so
    the clean stop is tested in-process (`createApp().shutdown()`); Ctrl+C in the owner's terminal uses the same code.
12. Hardening limits (18 October 2026): daily counts are in MongoDB since 19 October 2026 (shared by all copies, survive restarts). TRUST_PROXY is
    tested with simulated headers only, never behind a real proxy or tunnel. The CSP was checked on the built app (16 pages, no
    blocks; weather, map tiles and the service worker work; an injected script and an outside image were blocked), but with AI
    switched off: the Health allowance line and the "used up" alert were not seen in a browser (covered by end-to-end tests).
    A plain `http` market feed URL is blocked on the built app (CSP `connect-src 'self' https:`).
15. MongoDB backups (19 October 2026, README "Backing up your data"): `scripts/backup.ts` copies every collection except the
    short-lived ones (`SHORT_LIVED`: sessions, password_resets, chat_tickets, limits; `--all` includes them) into
    `backups/<YYYY-MM-DD-HHmm Philippine time>/<collection>.jsonl` (canonical Extended JSON, read with `promoteValues: false`, so
    Int32/Double/Long/Decimal128/ObjectId/Date round-trip exactly) plus `manifest.json` (counts, indexes; written last). Written
    into `<name>.partial`, renamed when complete. Keeps the newest `BACKUP_KEEP` (14); prunes only folders with a backup name AND a
    May-Ani manifest inside `BACKUP_DIR` (default `backups/`, in .gitignore and .dockerignore: password hashes and personal data).
    `scripts/restore.ts <folder|latest> <database> [--force]` refuses a database with any documents unless `--force` (then it drops
    and refills only the backup's collections), checks counts, recreates indexes. Both read MONGODB_URI/MONGODB_DB through
    `server/config.mjs` and never print the address (`hideSecret`). Verified: `tests/backup-db.test.ts` and a manual run on the
    throwaway test DB (backup, restore into a new name, the real server on the restored copy: old password logs in, farm and chat
    back). **Not verified:** a run against the owner's Atlas, and the Task Scheduler task (its commands were only checked to build
    valid objects; nothing was registered). Not point-in-time (collection by collection). Backups stay on the owner's PC (no
    off-site copy).

## Testing notes
- Unit tests live in `tests/`. `tests/build-sync.test.ts` keeps the server's id lists and prompt limit in sync with the app. Keep it passing when changing either side.
- For image/AI flows, test with mock servers via the `*_BASE_URL` env vars; do not spend the owner's real credit in automated tests.
- `tests/auth.test.ts` spawns the real server with a throwaway MongoDB (`mongodb-memory-server`) and always sets `MONGODB_URI` itself, so it never touches the owner's database. It also checks the password/name limits match between `server/auth.mjs` and `src/services/auth.ts`.
- `tests/reset.test.ts` covers "Forgot your password?" end to end with a throwaway MongoDB and `tests/support/fake-smtp.ts` (a fake mail server on 127.0.0.1 that checks the login and keeps the emails in memory): expiry, single use, racing resets, session revocation, no account enumeration (same answer, answers before sending), per-email and per-IP limits, Host-header injection, HTML escaping, mail login failure. `tests/support/server.ts` starts the real server with all keys, email and `MONGODB_URI` switched off unless a test sets them (a test that forgets can never reach the owner's Atlas); use it for new end-to-end tests. Its optional `dataDir` is the folder of the old chat file (`data.json`) the server imports.
- `tests/limits.test.ts`: TRUST_PROXY address rules (observed through the per-minute rate limit), AI needs a login, the daily allowance (per account on a throwaway MongoDB, total, refunds, Philippine midnight), pictures counted separately, and the security headers (incl. HSTS only with an https APP_URL). `tests/support/server.ts` has `startMongo(label)` and `signUpUser(srv, name)` for tests that need logged-in users; `tests/health-ai.test.ts` gives the app's client a stand-in localStorage holding the test login. `tests/support/server.ts` sets every daily limit to 100000 unless a test sets its own, so other tests are not limited.
- Browser check of log-in, sync and chat without the owner's Atlas: `bun scripts/test-db.ts` (throwaway MongoDB on port 27999, run in the background) and the "server-test-db" preview (`scripts/test-db.env`, port 8791; its old chat file `server/data.json.test`, if any, is imported once). A second copy for a two-server check: the "server-test-db-2" preview (`scripts/test-db-2.env`, port 8792, same database). Stop the database afterwards.
- Browser check of the built app without real keys or database: `bun run build`, then the "server-safe" preview (`.claude/launch.json`, `bun --env-file=scripts/safe.env server/index.mjs`, port 8790; every key is a single space = off, so the server's own `.env` reader does not fill them in).
- `tests/scale.test.ts`: two server processes on one throwaway MongoDB (a message sent through one arrives live on a stream opened on the other, a ticket works once on any copy, no double delivery, lockout and daily allowance shared and surviving a restart), the old chat file import (accounts only, idempotent, file renamed), JSON logs (no query strings), config problems, the in-process clean stop (`createApp` + `shutdown()`: a running request finishes, streams end, server gone), the 16 KB chat body limit, and app files (brotli/gzip by Accept-Encoding, immutable chunks, 304, 404 for missing chunks, 403 outside dist).
- `tests/backup-db.test.ts` (database backups, throwaway MongoDB via `startMongo`; the scripts are also run as processes with
  `MONGODB_URI`, `MONGODB_DB`, `BACKUP_DIR` (a temp folder) and `BACKUP_KEEP` always set by the test, because `bun test` loads the
  owner's `.env`): backup then restore gives identical documents in canonical Extended JSON (number types included) and the same
  indexes, short-lived collections left out unless `--all`, same-minute names, retention keeps N and never touches other folders,
  stale `.partial` folders, refusal without `--force`, damaged files (line number, never the line), the address never printed.
  Manual check (Bash): `bun scripts/test-db.ts`, data through the "server-test-db" preview, then
  `MONGODB_URI=mongodb://127.0.0.1:27999/ MONGODB_DB=may_ani_browser_check bun scripts/backup.ts` (and `restore.ts latest <new name>`
  with the same variables); delete the test folder in `backups/` afterwards.
- `tests/backup.test.ts` (restore only takes checked farm data, never settings or profile), `tests/store.test.ts` (damaged saved data kept, lists repaired, "not saved" warning, saves grouped and written at once on hide), `tests/server.test.ts` (static file folder check, broken %-codes, a damaged old chat file moved aside and chat no longer written to a file, picture errors stay in the log), `tests/format.test.ts` (number parsing, empty dates, CSV safety).
- `tests/health-ai.test.ts` covers the health photo check against a fake Anthropic API (Bun.serve on 127.0.0.1 via
  `ANTHROPIC_BASE_URL`): photo-only checks, the whole photo forwarded unchanged, the relevance check (fan -> no diagnosis, blurry,
  wrong category), answer trimming, every failure code (no credit, bad key, busy, refusal, unreadable, timeout, unreachable, no key),
  and that `PHOTO_SUBJECTS` match between server and app. Its servers set `MONGODB_URI` off so they never touch the owner's Atlas.
- `tests/sync.test.ts` covers account data sync: the record rules (order, checks, chunks), the `/api/sync` endpoint on a throwaway MongoDB
  (login, bad requests, size limits, conflict rule, deltas, deletions, two phones saving at once, rate limit) and two or three "phones"
  running the app's own engine against the real server (edits both ways, offline conflicts, slow clock, edits during a sync, the
  first-login question both ways). It also checks that the lists and limits match between `server/sync.mjs` and `records.ts`.
- Browser check without touching the owner's database: start the server with a throwaway MongoDB (`mongodb-memory-server`, set
  `MONGODB_URI` in the environment, which wins over `.env`), then use `localhost:PORT`, `127.0.0.1:PORT`, `phone2.localhost:PORT`,
  `phone3.localhost:PORT` (any `<name>.localhost`) as separate "phones" (each address has its own browser storage). Do NOT use
  `127.0.0.2`: the built-in browser pane of the Claude app never sends the service worker download there (checked 20 October 2026
  with a server that logs every request: the page arrived, `sw.js` never did; on a port the pane did not start, even `localhost`
  failed), so the console shows "An unknown error occurred when fetching the script" and that "phone" runs without the offline
  helper. Not an app problem: headless Edge registers and activates May-Ani's `sw.js` on `127.0.0.2` normally. `*.localhost`
  names on the preview's port work in the pane (offline helper active, log-in and sync checked on two of them, no console errors).
- Published preview of the app also exists as a claude.ai artifact (built from `dist/`); it is a convenience, not the source of truth. The source of truth is this folder.
- Review fixes of 20 October 2026 (branch `fix/critical-review`): `tests/server.test.ts` "a broken Host header" (a Host like
  `exa mple` used to stop the whole server; `app.mjs` now reads the address against a fixed base and answers 400, and
  `index.mjs` logs any unhandled rejection instead of stopping); `tests/lockout.test.ts` (per-address lockout, parallel guesses,
  email-wide lock; addresses simulated with X-Forwarded-For and `TRUST_PROXY=loopback`); `tests/record-guards.test.ts` (plans
  from the account or a backup are checked down to list entries; a plan without a name no longer breaks `planNameProblem`).
