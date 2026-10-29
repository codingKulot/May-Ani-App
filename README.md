# May-Ani

All-in-one agriculture & aquaculture assistant for Filipino farmers: AI farm planner, plant/animal/fish health help,
weather and fault-line awareness, market prices (farm-gate vs retail), permits checklist, farm records, and chat with suppliers/buyers.
Works offline-first as a PWA on phones and as a web dashboard.

## Run it

Requires [Bun](https://bun.sh) (1.4+).

```bash
bun install          # or link react, react-dom, react-icons, typescript if your registry is restricted
bun run dev          # http://localhost:3000  (front-end only; offline features + live weather/quakes)
bun run build        # production bundle in dist/
bun run server       # serves dist/ + AI + chat API on :8787
bun test && bun run typecheck
```

### Enabling AI photo analysis and real chat

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run server     # optional: ANTHROPIC_MODEL, PORT
```
The key stays on the server and is never sent to the browser. In the app: Settings → May-Ani server address
(blank when the server also serves the app). Without the server, health uses the built-in symptom guide and chat shows your earlier
conversations, read-only, until the connection is back.

**May-Ani is for logged-in users only** (no guest mode since 18 October 2026), so everyone people meet in the app is a real,
named account. The server therefore needs accounts (MongoDB, see "Turning on accounts"). A phone that still has a guest
profile from before is asked to create an account or log in; its farms, plans and records are kept and saved to the account.

## What is real and what is not

| Feature | Status |
|---|---|
| Planner (layout, drainage, water, electrical, costs, phasing) | Deterministic engine, tested (`src/services/planner`). Vegetables & crops, fruits, fish, livestock, or any mix of them. Estimates, not engineering drawings. |
| Weather | Open-Meteo (live, no key). Official warnings: PAGASA (linked). |
| Earthquakes | USGS feed (live). |
| Fault lines | **Approximate** bundled traces for orientation. Link to PHIVOLCS FaultFinder / HazardHunterPH. |
| Market prices | **No free live PH price API exists.** Bundled reference estimates are labelled "not live"; plug in a feed or enter local prices. |
| Health | Offline symptom matcher; with the server, Claude vision analysis of the whole photo (description optional), which turns away photos that are not farm-related. No drug doses by design; reportable diseases flagged. |
| Permits | Starter checklist; always confirm with LGU/BPLO, DA, BFAR. |
| Chat | Logged-in accounts only: every call carries the account login, the live stream uses a one-time ticket. Unread counts and new-message alerts. No block/report yet. |
| Accounts | Sign up / log in with email and password, stored in MongoDB (`server/auth.mjs`). Passwords hashed with scrypt; only token hashes stored. Profile (name, role, location) is in the account, and so are farms, plans and records (synced, see "Your farm data follows your account"); photos stay on the device. "Forgot your password?" sends a one-time reset link by email (Gmail, see below). |

### Market feed format
Settings → Market feed URL, any JSON endpoint (CORS-enabled):
```json
{ "asOf": "2026-10-17", "label": "DA Bantay Presyo (Nueva Ecija)",
  "prices": [{ "itemId": "talong", "retailPerKg": 90, "farmGatePerKg": 48, "trend7d": 2.5 }] }
```
Item ids are in `src/data/catalog.ts`.

## Architecture

The full picture (where each kind of data lives, how several servers can run side by side, the decisions and the roadmap)
is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- `src/core` store (persisted, `useSyncExternalStore`), hash router, actions, nav registry, data hooks
- `src/services` provider seams: weather, hazards, market, health, ai, chat, geocode, planner, forecast (quantity x farm-gate/market price)
- `src/data` catalog (+ user-added items via `buildCustomItem`), places, faults, diseases, permits, guides (plain data, easy to extend)
- `src/pages`, `src/components` UI
- `server/` the API, one file per part: `index.mjs` starts it, `config.mjs` reads every setting, `app.mjs` puts the parts
  together (`auth`, `reset`, `mail`, `sync`, `chat`, `ai`, `images`, `static`, `limits`, `db`, `http`). Optional packages `mongodb`
  and `nodemailer` load only when accounts or email are switched on.
- Add a feature: page in `src/pages` → route in `App.tsx` → one entry in `core/nav.ts`.

## Turning on accounts (Sign up and Log in, MongoDB)

Accounts live in a MongoDB database that the May-Ani server talks to. The app never talks to the database directly.
Without a database nobody can log in, so the app cannot be used: the log-in screen and the server log say that accounts are off.

**Option A: MongoDB Atlas (free, in the cloud, recommended)**
1. Go to https://www.mongodb.com/cloud/atlas/register and create an account (free tier, "M0").
2. Create a cluster (any region near the Philippines, e.g. Singapore).
3. Security > Database Access > Add New Database User: pick a username and a long password. Role: "Read and write to any database".
4. Security > Network Access > Add IP Address > "Add Current IP Address". (When the server runs somewhere else later, add that server's IP.)
5. Database > Connect > Drivers. Copy the address that starts with `mongodb+srv://` and put your password in place of `<db_password>`.
   If the password has symbols like `@ : / ? #`, change the password to letters and numbers only, or the address will break.
6. Open `.env` (next to package.json) and add the line `MONGODB_URI=` followed by that address.

**Option B: MongoDB on this PC**
Install "MongoDB Community Server" for Windows from https://www.mongodb.com/try/download/community (keep "Install as a Service" ticked),
then put `MONGODB_URI=mongodb://127.0.0.1:27017` in `.env`.

Then run `bun run start` and open http://localhost:8787. The server's first line must say `accounts: on (MongoDB)`, followed by
`Accounts: connected to MongoDB.` If it says it cannot use MongoDB, the next words say why (wrong password, IP not allowed, not running).

What is stored: collection `users` (email, name, role, location, scrypt password hash, dates), `sessions` (SHA-256 of each login
token, expiry; MongoDB deletes expired ones by itself) and `appdata` (each account's farm data, see "Your farm data follows your account"). Logins last 60 days from last use. 5 wrong passwords lock that email for 15 minutes on the device or network they came from (the owner elsewhere can still log in); 50 wrong passwords from many places lock the email for an hour.

Tests: `tests/auth.test.ts` starts its own throwaway MongoDB (package `mongodb-memory-server`) and never touches your database.
On Windows it needs the Microsoft Visual C++ Redistributable x64 (https://aka.ms/vs/17/release/vc_redist.x64.exe); without it those tests are skipped with a message.

## Turning on password reset ("Forgot your password?" by email)

When someone forgets their password, the Log in screen has **Forgot your password?**. They type their email and get a link
that lets them choose a new password. The server sends that email from a Gmail account, using a Gmail **app password**.
It is free (Gmail allows about 500 emails a day) and needs no website domain. Accounts must already work (see above).

1. Pick the Gmail account that sends the emails. Best: make a new one just for May-Ani (for example `mayani.app@gmail.com`),
   because people will see this address, and your own Gmail stays separate.
2. Sign in to that Gmail, then turn on **2-Step Verification**: https://myaccount.google.com/signinoptions/twosv
3. Create an **app password**: https://myaccount.google.com/apppasswords . Type the name `May-Ani` and press Create.
   Google shows 16 letters in 4 groups. Copy them now (Google shows them only once).
   If that page says the setting is not available, 2-Step Verification is not on yet.
4. Open `.env` (next to package.json) and add two lines (spaces in the app password are fine):
   ```
   SMTP_USER=mayani.app@gmail.com
   SMTP_PASSWORD=abcd efgh ijkl mnop
   ```
5. Tell the server where people open the app, so the link in the email works. Add `APP_URL=` to `.env`:
   - only on this PC with `bun run start`: nothing to add (it uses `http://localhost:8787`)
   - with `bun run dev`: `APP_URL=http://localhost:3000`
   - phones on the same Wi-Fi: `APP_URL=http://192.168.x.x:8787` (this PC's "IPv4 Address" from the `ipconfig` command)
   - a real website later: `APP_URL=https://your-website`
6. Restart with `bun run start`. The first line must say `email: on (smtp.gmail.com), reset links open ...`, followed by
   `Email: logged in to smtp.gmail.com. Password reset emails can be sent.` If it says `Email: cannot send yet`, the next words say why.
7. Try it: Log in > Forgot your password? > type your own account's email. The email may land in **Spam** the first times;
   marking it "Not spam" helps.

Keep the app password secret like a password. If it leaks, delete it on the app passwords page and make a new one.
Changing the Gmail account's normal password also cancels its app passwords: then make a new one and update `.env`.

How it is protected: the answer to "Forgot your password?" is the same whether or not an email has an account, so nobody can
use it to find out who uses May-Ani. A link works once, for 30 minutes, and only the newest link works. The database keeps only
a SHA-256 hash of it (collection `password_resets`, deleted by MongoDB when expired). After a reset, every phone that was logged in
to the account is logged out, and the account gets a "Your password was changed" email. Limits: 3 reset emails per address per hour,
and `RESET_RATE_PER_MIN` (default 5) requests per minute per IP address. The link always uses `APP_URL`, never the address in the request.

Tests: `tests/reset.test.ts` uses a fake mail server on this PC (`tests/support/fake-smtp.ts`). No real email is sent and Gmail is never used.

## Your farm data follows your account (sync)

When someone is logged in, their farms, plans, tasks, expenses, sales, production records, health log, own crops/animals and a few
choices (permit checklist, watch list, own prices) are saved to their account. Logging in on a new phone brings them back.
Nothing to switch on: it works as soon as accounts work (see above).

- **When it saves:** about 2 seconds after a change, when the app opens, when you come back to it, when the internet returns, and
  every 5 minutes. Settings > Account shows "Saved to your account 2 min ago", or "Waiting for internet" with how many changes are
  waiting. Offline, everything keeps working and the changes wait safely on the phone. "Save now" saves at once.
- **Not saved to the account:** photos and AI pictures (too big; they stay on the phone), chat messages, and phone settings like the
  server address. A backup file (Settings > Your data) is still a good extra copy.
- **Two phones changed the same thing** (for example the same farm's name): the later change wins. Each farm, task, expense and
  so on is handled on its own, so changes to different things never overwrite each other. Something deleted on one phone is deleted
  on the others.
- **Logging in on a phone that already has its own data** (for example an old guest profile, or data made before logging out) while the account also has data:
  the app asks **Keep both** (recommended: everything is combined) or **Use only my account's data** (this phone's extra items are removed).
  For anything that is on both, the account's copy is used.
- **Log out** first saves what is waiting; if there is no internet it warns you. **Delete all my data** empties only this phone: the
  account keeps its copy, so logging in again brings it back.
- **Limit:** 2 MB of farm data per account (hundreds of plans). If it is full, Settings says so; delete old plans you no longer need.

What is stored: collection `appdata`, one document per account (its `_id` is the user's id) with each item saved as text. The server
checks the login, the size and the shape of every save, and each account only ever sees its own data.

Tests: `tests/sync.test.ts` uses its own throwaway MongoDB and never touches your database.

## Keeping data safe on the phone

- **Back up / Restore** (Settings > Your data): a backup file holds the farm data. Restoring brings back only farm data (farms, plans,
  tasks, money records, harvests, health log, own items and a few choices), each item checked first. It never changes the phone's
  profile, login or settings such as the server address, so a backup file someone shares cannot point the app at another server.
  Damaged items in a file are left out, and the app says how many.
- **If a page crashes**, it shows "Something went wrong on this page" with a way back and "Download a backup", instead of a blank screen.
- **If the saved data cannot be read** at start-up, the app starts empty but keeps the old data aside; Settings > Your data can
  download it. **If the phone is full**, a red banner says changes are NOT saved until there is space again.
- Number boxes accept what people type, like `1,500` or `₱1,500.50`. Very large amounts (an extra zero?) ask before saving.
- **Reports > Export CSV** opens correctly in Excel (₱ and ñ show properly), and text that a spreadsheet could run as a formula is made harmless.

## Backing up your data (the database)

The free Atlas plan (M0) keeps **no backups**. If accounts or farm data are deleted by mistake, or the cluster is lost, they are gone.
`scripts/backup.ts` copies the whole database to this PC. It is free and needs no other program or service.

**Make a backup now** (PowerShell):
```powershell
cd $env:USERPROFILE\Documents\Projects\May-Ani
bun scripts/backup.ts
```
It uses `MONGODB_URI` and `MONGODB_DB` from `.env` (the same database as the server) and ends with, for example,
`Backup saved in backups\2026-10-19-2000 (appdata 12, chat_messages 230, chat_profiles 8, users 12).` The folder name is the date
and time in the Philippines. If it says `Backup FAILED`, the next words say why (often: this PC's IP address is not allowed under
Atlas > Network Access, see "Turning on accounts").

What is in a backup: accounts (`users`: names, emails, password hashes, never the passwords), farm data (`appdata`) and chat
(`chat_profiles`, `chat_messages`), one file per collection, and `manifest.json` (what is in it, and the indexes). Left out on purpose,
because they only last minutes to days: logins (`sessions`, so after a restore everyone logs in again), reset links, chat tickets and
counters. `bun scripts/backup.ts --all` copies those too. Photos are not in the database (they stay on the phones).

**Keep backups private.** They hold names, emails, password hashes, farm records and private messages: personal data under the
Data Privacy Act (RA 10173). The `backups` folder is never put in git or in a container image. Do not email backups or put them
in a shared folder. A backup on this PC is lost with the PC: now and then, copy the newest folder to a USB drive you keep elsewhere.

**How many are kept:** the newest 14. Older backup folders are deleted by the next backup (only folders the backup made, only in
`backups\`; anything else you put there is left alone). Each backup is about as big as your data (Atlas > Database > Browse
Collections shows the size). To keep a different number, add `BACKUP_KEEP=30` to `.env`. Another place: `BACKUP_DIR=D:\May-Ani backups`.

**Every day by itself (Windows Task Scheduler).** Run these lines once in PowerShell:
```powershell
cd $env:USERPROFILE\Documents\Projects\May-Ani
$action = New-ScheduledTaskAction -Execute (Get-Command bun).Source -Argument 'scripts/backup.ts' -WorkingDirectory (Get-Location).Path
$trigger = New-ScheduledTaskTrigger -Daily -At 8pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'May-Ani backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily copy of the May-Ani database into the backups folder'
```
It runs every day at 8 PM while you are logged in to Windows (a black window shows for a few seconds). If the PC was off at 8 PM,
it runs soon after you next log in. Change `8pm` to any time you like.
- Run it now, to try it: `Start-ScheduledTask -TaskName 'May-Ani backup'`, then look for a new folder in `backups\`.
- Did the last run work? `Get-ScheduledTaskInfo -TaskName 'May-Ani backup'`: `LastTaskResult` 0 means yes. Any other number:
  run `bun scripts/backup.ts` yourself to see the reason.
- Remove it: `Unregister-ScheduledTask -TaskName 'May-Ani backup' -Confirm:$false`. If you move the May-Ani folder or reinstall
  Bun, remove it and make it again.

**Bringing a backup back (restore).** Safest: restore into a NEW database, look at it, then switch the server to it.
1. `bun scripts/restore.ts latest may_ani_restored` (or a folder name instead of `latest`, like `2026-10-19-2000`). It says what it
   restored, and it refuses a database that already has data.
2. Look at it: Atlas > Database > Browse Collections > `may_ani_restored`.
3. Stop the server (Ctrl+C), set `MONGODB_DB=may_ani_restored` in `.env`, and start it again (`bun run start`). Everyone logs in
   again with their usual password; their farm data and chats are back. Anything saved after the backup was made is not.

Over the database the server uses (only when you are sure): stop the server, then `bun scripts/restore.ts latest may_ani --force`.
Each collection in the backup is replaced by the backup's copy; collections not in the backup, like logins, are left as they are.

Good to know: the backup copies one collection after another while the server may be running, so something saved in those
seconds can be in one collection and not yet in another. Running it in the evening, when few people use the app, is fine.
Paid alternative: Atlas **Flex** and **dedicated** clusters (M10 and up) have backups built in (automatic snapshots, restore from
the Atlas website), for a monthly fee; see Atlas's pricing page for today's prices. This script keeps working on those plans too.

Tests: `tests/backup-db.test.ts` uses its own throwaway MongoDB and never touches your database.

## Putting May-Ani online safely

**Daily AI allowance (your money).** Every AI photo check and every AI picture costs money on your Anthropic / Gemini /
OpenAI account. Only logged-in users can use AI, and each day:

| | Per account | Whole server |
|---|---|---|
| AI checks (health photos, site photos) | `AI_DAILY_ACCOUNT` = 20 | `AI_DAILY_TOTAL` = 300 |
| AI pictures (Layout ideas) | `PICTURES_DAILY_ACCOUNT` = 9 | `PICTURES_DAILY_TOTAL` = 60 |

- Change any number in `.env`; `0` means none. Set the totals to
  what you are willing to pay per day, and also set a monthly spending limit in each provider's console.
- Counts start again at midnight, Philippine time. They are kept in MongoDB, so a restart does not reset them and several
  copies of the server share them.
- A check that cost nothing (no AI credit, AI unreachable or busy) does not count. The Health page shows the allowance and,
  when it runs out, says so.
- The server's first lines show the limits: `Daily limits: AI checks 20 per account, 300 in total; ...`

**Behind a proxy (`TRUST_PROXY`).** If people reach the server through Cloudflare Tunnel, Caddy, nginx or a hosting platform,
every request seems to come from that proxy, so all users would share one rate limit and one daily allowance. Set:
- `TRUST_PROXY=loopback` when the proxy runs on the same computer (Cloudflare Tunnel, Caddy, nginx);
- `TRUST_PROXY=1` (the number of proxies in front) on a hosting platform, but only if the server cannot be reached around the proxy;
- or the proxy's own IP addresses, comma-separated. Leave it empty when people connect to the server directly (the default).

**`ALLOWED_ORIGIN`.** Set it to your website address (for example `ALLOWED_ORIGIN=https://may-ani.example`) so other websites
cannot use your server from their own pages. The server prints this tip when `APP_URL` is an https website. (It does not stop
direct tools like curl: the daily allowance does that.)

**Security headers.** Every answer tells the browser to run only May-Ani's own scripts, load pictures only from May-Ani, photos
and OpenStreetMap, never show the app inside another website's frame, and not guess file types. With an `https` `APP_URL`, browsers
are also told to always use https. Outside services the app may contact: Open-Meteo (weather, places), USGS (earthquakes),
OpenStreetMap tiles, and any https market feed or server address set in Settings (a plain `http` feed is blocked on the built app).

**Checking the built app without your real keys or database:** `bun run build`, then start the "server-safe" preview
(or run `bun --env-file=scripts/safe.env server/index.mjs`) and open http://localhost:8790. Everything paid, email and MongoDB
are switched off there. As May-Ani needs a login, that server shows only the log-in screen. To try logging in, sync and chat
without your Atlas data, run `bun scripts/test-db.ts` (a throwaway database, gone when you press Ctrl+C) and start the
"server-test-db" preview (or `bun --env-file=scripts/test-db.env server/index.mjs`), then open http://localhost:8791.

## Running more than one server (when May-Ani grows)

May-Ani can run as several identical copies of the server behind a load balancer, so one copy can restart (or a new version
can roll out) while the others keep serving. Everything the copies must share (accounts, farm data, chat, lockouts and the daily
AI allowance) is in MongoDB; details and the reasons are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Start several copies** with the same `MONGODB_URI` and `MONGODB_DB`, for example on one PC in two PowerShell windows:
  `$env:PORT=8787; bun server/index.mjs` and `$env:PORT=8788; bun server/index.mjs`. Put a proxy (Caddy, nginx, Cloudflare,
  or the hosting platform's own) in front and set `TRUST_PROXY`.
- **Health checks** for the platform: `/api/live` answers while the process runs; `/api/ready` answers 200 only when MongoDB
  answers and the copy is not stopping (otherwise 503).
- **Stopping**: Ctrl+C (or SIGTERM from a platform) stops cleanly: live chats end (phones reconnect by themselves), requests
  already running get up to 10 seconds. Press Ctrl+C a second time to stop at once.
- **Logs**: by default the terminal shows plain sentences, plus a line for server errors and slow requests. `LOG_FORMAT=json` writes
  one JSON line per request (time, request id, method, path without the part after `?`, status, milliseconds) for log tools.
  Every answer carries an `X-Request-Id`; when someone reports a problem, that id finds it in the log. `INSTANCE_ID` names a copy.
- **Container**: a `Dockerfile` is included for hosting platforms, see "Running May-Ani with Docker" below.
- **Automatic checks**: `.github/workflows/ci.yml` runs the type check, all tests and the build on GitHub for every change, once
  the project is on GitHub (not yet).
- **Old chat file**: chat used to be saved in `server/data.json`. The first start with MongoDB copies the accounts and their
  messages from it into MongoDB and renames the file to `data.json.imported-<time>` (kept, never deleted; delete it yourself
  once chat looks right).

## Running May-Ani with Docker

Docker packs the server and the built app into one "image" that runs the same on your PC and on a hosting platform. You do not
need it for everyday work (`bun run start` does the same), but it is how May-Ani will most likely be hosted.
Checked on 29 October 2026 with Docker Desktop on the development PC: the image builds (about 280 MB), starts, reports healthy,
connects to MongoDB Atlas with the real `.env`, and the app works in the browser (sign up, Dashboard, weather, Market prices).

1. Install **Docker Desktop** for Windows (https://www.docker.com/products/docker-desktop/) and start it once (whale icon in the taskbar).
2. Open a terminal in the project folder and start May-Ani:
   - `docker compose up --build` : builds the image and starts it with your `.env`. Open http://localhost:8787. Ctrl+C stops it.
   - `docker compose up --build -d` : the same, in the background. `docker compose logs -f app` shows the log, `docker compose down` stops it.
   - Port 8787 must be free: stop `bun run server` / `bun run start` first.
3. Try it without touching your Atlas database (its own MongoDB inside Docker, AI, pictures and email off, nothing costs money):
   `docker compose -f compose.yaml -f compose.local-db.yaml up --build`. Add `down -v` instead of `up --build` to delete that test database.

Good to know:
- The `.env` file is **never** copied into the image (`.dockerignore`); compose hands its settings to the container when it starts.
  On a hosting platform you type the same names into its "environment variables" page instead.
- Use `docker compose`, not `docker run --env-file .env`: `docker run` keeps the quotes around `MONGODB_URI="..."`, and then
  MongoDB refuses the address (checked).
- Atlas still has to allow your internet address (Atlas > Network Access), the same as without Docker.
- The image holds no farm data: accounts, farms and chat are in MongoDB, photos stay on the phones. Rebuilding or deleting the
  container loses nothing.
- Log lines are JSON in the container (`LOG_FORMAT=json`), for hosting log tools.

## Roadmap
Filipino/Cebuano UI, hogs & ASF module, official PHIVOLCS GIS layers, syncing photos to the account, DA Bantay Presyo ETL,
SMS alerts for low-connectivity areas, payments/marketplace listings, cooperative accounts, push reminders.

## Turning on AI (photo analysis and plant/animal/fish health)

The plan, layout, budget and forecast work without AI. AI adds reading your site photos
(slope, shade, drainage and water clues, area estimate) and diagnosing health photos.

1. Create your own key at https://console.anthropic.com (API keys).
2. Copy `.env.example` to `.env` and paste the key after `ANTHROPIC_API_KEY=`.
3. Run `bun run start`, then open http://localhost:8787
   (or run `bun run server` in a second terminal next to `bun run dev`; the app on
   port 3000 finds the server on port 8787 automatically).

`ANTHROPIC_BASE_URL` can be set in `.env` to use a gateway. Never commit `.env`.

**The key needs API credit.** The Anthropic API is paid separately from a Claude subscription. If the account has no
credit, the Health page says "Photo checking is paused (no AI credit)" and the server log says "the API account has no
credit left". Add credit at https://console.anthropic.com > Plans & Billing; nothing else needs to change.

**Health photo check.** The photo alone is enough (the description is optional). The whole photo is sent, never cropped,
and the AI first decides what it shows: a photo that is not a plant, farm animal, fish or farm scene (an electric fan,
a selfie, a document) gets a "this photo does not look like a plant, animal or fish" message and no diagnosis; a
fish photo checked under "Plant" is checked as a fish, with a button to switch tabs. Without AI, the check by
description still works offline. Optional: `AI_TIMEOUT_MS` (90000) and `AI_RATE_PER_MIN` (15 AI calls per minute per IP).

## The planner: what to grow or raise

Step 2 of **Plan** ("Budget & Goals") asks what you want to grow or raise: **Vegetables & crops**, **Fruits**, **Fish**,
**Livestock**, or any mix of them (tap more than one). At least one is needed to go on.

- **Your picks per type.** Each chosen type gets its own list (for Fruits: mango, banana, papaya, calamansi, pineapple, dragon fruit,
  lanzones, rambutan, guava, watermelon) and "Add your own". The plan uses exactly what you pick; a type you pick nothing for gets
  suggestions, marked "Suggested" in "What ₱X could produce" (tap + to keep one). Turning a type off removes its picks.
- **Mixed farm = one plot, one budget.** The land is split evenly between the chosen types (the layout shows one strip per type) and
  the planted area of every type shrinks together until the whole start-up cost fits your capital. The water tank and pump, drainage
  canal, wiring and permit allowance are shared and counted once. The plan shows how the money splits by type, rounded to ₱100,
  because these are estimates. A type where nothing suits the site (for example vegetables on a large, heavily shaded plot) is left
  out with a warning, and the others get its land.
- **Fruit trees take years.** Yields are per year for trees at bearing age. The plan says how long each one takes before the first
  harvest (mango about 3½ years, lanzones about 5½), counts that wait in the payback time, and warns that the monthly income is for
  when everything bears. Fruit prices and yields are **estimates** like the rest of the catalog, not a published list.
- **Older plans** (made before 20 October 2026, with one type) open and work as before; editing one keeps its type.
- The build ideas in Layout cover the vegetable beds, also in a mixed plan (when the vegetable part is 600 sqm or less).

## Layout > "Your garden on your photo" (build studio)

Open a plan, go to **Layout**. The studio draws the plan on your own site photo, offers three buildable
designs (raised beds, grow bags and recycled containers, vertical), and gives a materials list with prices,
recycling how-tos, and measured build steps with a cut list.

- **Photo preview** is a concept drawing, not a photograph. You (or the AI) mark the four floor corners and the
  plan is drawn in perspective on them. Drag the dots or use the arrow keys. AI needs the server (see above).
- **Prices** (`src/data/materials.ts`): construction items (lumber, PVC, nails, wire, sand, gravel, bamboo, plastic
  sheet) come from published Philippine lists, quarter 1 2026, with links shown in the app. Garden-specific
  items (grow bags, cocopeat, soil, shade net, drip kits, seeds) are **typical-range estimates**, labelled
  "Estimate". Nothing is a live feed. Type "my price" on any line to use your own quote.
- **Recycling** (`src/data/recyclables.ts`): tick what you have; each item says which purchase it replaces and how much.
- Currently for vegetable and crop plans up to 600 sqm, and the vegetable beds of a mixed plan (that part up to 600 sqm). Fruit, fish and livestock builds are not covered yet.


## Layout: 3 ideas from your photo (optional AI pictures)

In Layout, add a photo of your site and press **Analyze my photo and make 3 pictures**. Claude reads the photo (ground, things you could reuse), then an image model draws 3 different ways to build the garden on it. Each idea has its own materials with current Philippine prices, recycling options and measured build steps.
Claude cannot draw pictures, so the pictures use a separate image service with **your own key**. Each picture costs a small amount on your account (3 per press).

1. Create a key at Google AI Studio (https://aistudio.google.com/apikey) or OpenAI (https://platform.openai.com/api-keys) and make sure the account has credit.
2. In `.env` add `GEMINI_API_KEY=...` or `OPENAI_API_KEY=...` (if you add both, set `IMAGE_PROVIDER=gemini` or `openai`).
3. Restart with `bun run server`. The first line should say `pictures: gemini` (or `openai`).
4. If you get "model not found", set `GEMINI_IMAGE_MODEL` or `OPENAI_IMAGE_MODEL` to a current image model name.

The prompt is built from each design's real numbers (bed sizes, crops, materials), but a picture is only an idea: trust the measurements and the materials list.
Pictures are kept on your device per plan and design, so you do not pay twice. Reading the photo needs Anthropic credit; if it fails, the pictures are still made.
