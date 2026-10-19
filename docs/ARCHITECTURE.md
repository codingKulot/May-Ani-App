# May-Ani architecture

How May-Ani is built, where each kind of data lives, how it is ready to grow, and what comes next.
Written 19 October 2026, after the architecture review. Keep it up to date when the design changes.

## In one picture

```
 Phones and computers (the app: a PWA, works offline)
 ┌──────────────────────────────────────────────────────────────┐
 │ React app  ─ store (localStorage: farms, plans, records)       │
 │            ─ photos and AI pictures (IndexedDB, this phone only) │
 │            ─ sync engine (sends changes, gets other phones' ones)│
 │ service worker (offline copy of the app, notifications)        │
 └──────────────┬──────────────────────────────┬──────────────────┘
                │ HTTPS (later)                 │ weather, quakes, map tiles
                ▼                               ▼ (Open-Meteo, USGS, OpenStreetMap)
     ┌─────────────────────┐
     │ load balancer / proxy│  (later: Cloudflare, a hosting platform)
     └───┬─────────────┬───┘
         ▼             ▼
 ┌──────────────┐ ┌──────────────┐     every copy is the same program: server/index.mjs
 │ server copy A│ │ server copy B│ ... the app files, /api/auth, /api/sync, /api/chat, /api/ai
 └──────┬───────┘ └──────┬───────┘
        │  everything shared │                       ┌────────────────────────────┐
        └────────┬───────────┘                       │ Anthropic (Claude): photos  │
                 ▼                                   │ Gemini / OpenAI: pictures   │
        ┌──────────────────┐                          │ Gmail: password reset email │
        │ MongoDB (Atlas)  │                          └────────────────────────────┘
        └──────────────────┘
```

Today there is one copy of the server on the owner's PC. The design lets more copies run side by side without changes:
**every copy is stateless** (it keeps nothing that the others need), and everything shared is in MongoDB.

## What lives where

| Data | Where | Shared by all server copies? | Notes |
|---|---|---|---|
| Accounts, logins | MongoDB `users`, `sessions` | yes | scrypt password hashes; only SHA-256 of login tokens; sessions expire after 60 unused days (TTL index) |
| Password reset links | MongoDB `password_resets` | yes | SHA-256 only, 30 minutes, one use |
| Farm data of an account | MongoDB `appdata` (one document per account) | yes | 2 MB per account; see "Account data sync" in CLAUDE.md |
| Chat people and messages | MongoDB `chat_profiles`, `chat_messages` | yes | moved from `server/data.json` on 19 October 2026 (imported once, the file renamed) |
| Live chat stream tickets | MongoDB `chat_tickets` | yes | SHA-256 only, one minute, one use on any copy |
| Wrong-password lockout, reset emails per address, daily AI allowance | MongoDB `limits` | yes | counters with an end time (TTL index); emails stored only as a hash |
| Live chat connections | memory of each copy | no (cannot be) | a phone is connected to one copy; messages reach it through the database check (below) |
| Per-minute limits per IP address | memory of each copy | no, on purpose | see decision 3 |
| The phone's farm data | phone `localStorage` (`may-ani.state.v1`) | | offline-first; saved at most every 0.3 s and at once when the app is hidden |
| Photos, AI pictures | phone IndexedDB | | not synced (too big for the account document; see roadmap) |
| Login token, sync bookkeeping | phone `localStorage` (own keys) | | never in backups or app state |

## How a request flows

- **Log in:** `POST /api/auth/login`: the lockout counter is checked in `limits`, the password hash in `users`, and a session
  is created. The app keeps the token and sends it as `Authorization: Bearer` on every call.
- **Sync:** `POST /api/sync` every few minutes and 2 s after a change. When nothing changed on either side, the server reads only
  the save number of the account's document (fast path); otherwise it merges and saves with optimistic concurrency (`rev`).
- **Chat:** sending saves to `chat_messages` (the time comes from the database clock) and pushes it at once to the receiver's
  live streams on the same copy. Every copy with open streams checks the database every 1.5 s for new messages to its
  connected people, so a message sent through another copy arrives within about 2 s. The phone also re-reads its history after
  every reconnect, so nothing is lost while a stream is down.
- **AI:** login check, then one use of the daily allowance (shared counter), then the call to Claude or the picture service.
  A failure that cost nothing gives the use back.

## Running more than one copy

1. Run the same program several times (on one machine with different `PORT`s, or on several machines/containers), all with
   the same `MONGODB_URI` and `MONGODB_DB`.
2. Put a load balancer or proxy in front (Caddy, nginx, Cloudflare, or the hosting platform's own). No "sticky sessions" are
   needed. Set `TRUST_PROXY` so rate limits see the real visitor address.
3. Health checks: `/api/live` (the process answers) for restarts, `/api/ready` (MongoDB answers, not shutting down) for traffic.
4. Deploys: the platform sends SIGTERM; each copy stops taking new connections, ends its live chat streams (phones reconnect to
   another copy within seconds), lets running requests finish (at most 10 s) and exits.
5. Optional: `INSTANCE_ID` names a copy in the logs; `LOG_FORMAT=json` gives one JSON line per request for log tools.
6. A `Dockerfile` is included (not yet tested: no Docker on the development PC).

## Decisions (and why)

1. **MongoDB is the only shared store (no Redis yet).** It is already required for accounts, it is free at this size (Atlas M0),
   and one fewer service is easier for a one-person team to run. Revisit at the roadmap triggers below.
2. **Chat delivery between copies by checking the database every 1.5 s** (not Redis pub/sub, not MongoDB change streams).
   It works on every MongoDB (change streams need a replica set, which a local MongoDB on a PC usually is not), costs about
   one small indexed query per copy every 1.5 s while anyone is connected, and needs no new service. Limits: messages from another
   copy arrive up to ~2 s later; each check reads at most 2000 new messages, so very busy chat (hundreds of messages per second)
   needs Redis pub/sub.
3. **Per-minute limits per IP stay in each copy's memory.** They protect against floods and must not cost a database call
   each. With N copies they are N times looser, which is acceptable because the limits that protect accounts and money
   (lockout, reset emails, daily AI allowance) are shared. A real website should add the edge's own limits (Cloudflare rate rules).
4. **Shared counters are counted first and given back when over the limit**, so two requests at the same moment can never
   both take the last AI use.
5. **The app stays offline-first.** Farm data lives on the phone and syncs; the server is never needed to read or write a record.
   Conflict rule: the later change wins per record (see `src/services/sync/engine.ts`).
6. **App files are compressed once, at build time** (brotli and gzip copies in `dist/`); files with a content hash in their
   name are cached by browsers for a year, the rest are checked each time (ETag, 304).
7. **No code splitting yet.** Splitting the JavaScript would mean a farmer who goes offline before opening a page could not
   open it. It must come with a service worker that keeps every piece offline (roadmap). Compression already cut the download
   from 586 KB to 158 KB.
8. **Login only** (18 October 2026): no guest mode, so everyone a farmer meets is a named account.

## Limits of today's design (numbers to watch)

- Atlas M0 (free): 512 MB, about 250 accounts at the full 2 MB each (most use far less), **no automatic backups**, and only
  allowed IP addresses can connect.
- One account's farm data: 2 MB, stored as one document that is rewritten when something changes.
- Chat: contact list shows the 1000 most recently active people; history the last 500 messages per person.
- AI calls take up to 90 s (pictures up to 150 s). Many proxies cut requests at 100 s.

## Roadmap (Phase 2: each needs a decision, an account or money)

| What | Why | When (trigger) |
|---|---|---|
| Hosting with HTTPS (Fly.io, Railway, Render or a VPS, behind Cloudflare) | Phones only install the app, work offline and show notifications on HTTPS | before real users |
| MongoDB backups (Atlas Flex/M10, or a daily `mongodump`) | M0 has no backups: a mistake or outage could lose accounts and farm data | before real users |
| Error tracking (e.g. Sentry) and uptime checks | Find problems before farmers report them | with hosting |
| Version check: tell old installed apps to reload | An installed app can run old code against a new server | before the first breaking API change |
| AI as background jobs (start, then check back) | Proxies often cut requests at 100 s; pictures can take 150 s | with hosting behind such a proxy |
| Redis (pub/sub for chat, shared per-minute limits) | Instant chat across many copies; exact limits | more than ~3 copies, or very busy chat |
| Photos in object storage (S3 / Cloudflare R2) | Photos follow the account; smaller phones | when users ask for photos on a new phone |
| Sync stored one record per document | No 2 MB per account limit; less rewriting | when accounts near 1 MB, or M0 fills |
| Code splitting + service worker precache list | Faster first load on slow phones | when the app grows past ~1 MB |
| Chat: server-side search, block and report | A marketplace needs them; the contact list stops at 1000 | before real users |
| Web Push | Notifications while the app is fully closed | with HTTPS hosting |
