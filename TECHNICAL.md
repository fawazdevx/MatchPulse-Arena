# MatchPulse Arena — Technical Documentation

**Track:** World Cup · TxODDS — Consumer & Fan Experiences
**One line:** A World Cup second-screen fan game that turns live TxLINE match data and consensus odds into a fast, no-money prediction experience, with sign-in on Solana.

---

## 1. Core idea

Most fans watch the World Cup with a phone in their hand. MatchPulse Arena is the second screen for that moment. It does three things a spreadsheet or a raw scores feed cannot:

1. **Live match rooms** — score, clock, and an event timeline that updates as the match unfolds, streamed from TxLINE.
2. **Market sentiment, translated for fans** — TxLINE consensus odds are converted into a *momentum / pressure / market-reaction* signal. Not betting lines — a fan-facing read of "who the market thinks is on top right now."
3. **No-money micro-predictions** — prediction cards are generated from the live feed ("will the market swing on the next event?"). Correct reads build points, streaks, and badges, and rank fans on a live leaderboard.

**Explicitly not a betting app.** No deposits, wagers, payouts, or gambling CTAs. Odds are only ever surfaced as sentiment. The wallet signature message states in plain text that it authorizes no transaction, payment, wager, or token transfer.

---

## 2. Architecture at a glance

```
Browser (Next.js App Router, React)
  │   EventSource (SSE)  ·  fetch (JSON)  ·  Phantom/Solflare (SIWS)
  ▼
Next.js API routes  (server-only — credentials never reach the browser)
  ├─ /api/txline/*        → TxLINE adapter (proxy + normalize + cache)
  ├─ /api/auth/wallet/*   → SIWS nonce / verify / session / logout
  ├─ /api/game/*          → prediction answers, room state
  └─ /api/creator/rooms   → branded watch rooms
  ▼
TxLINE Data Layer  (Bearer JWT + X-Api-Token)      Prisma → PostgreSQL (Supabase)
```

- **Framework:** Next.js 14 (App Router), React 18, TypeScript.
- **Styling:** Tailwind CSS + shadcn-style primitives; self-hosted fonts.
- **Data:** Prisma ORM over PostgreSQL (Supabase). Transaction-pooler connections are configured for PgBouncer, while migrations use session pooling. Public live reads remain available when persistence is absent or delayed.
- **Auth:** Sign-In With Solana (SIWS-style) verified server-side with `tweetnacl`; HTTP-only session cookie.
- **Realtime:** Filtered TxLINE score + odds SSE feeds are normalized into one browser-facing SSE stream, with current-interval endpoint fallback.
- **Deploy:** Vercel (serverless). `prisma generate` runs in the build step; committed migrations are applied explicitly with `npm run db:deploy`.

---

## 3. TxLINE integration (technical highlight)

All TxLINE access is isolated under `src/services/txline` behind a single `TxLineAdapter` interface, with an explicit `real` adapter and an optional `mock` adapter selected by env. **Credentials are server-only** — every browser request hits our own API routes, which proxy to TxLINE with `Authorization: Bearer <jwt>` and `X-Api-Token: <token>`. The JWT/token never appear in client bundles or network responses.

Design choices that made it robust:

- **Schema normalization.** The parser handles TxLINE's documented soccer fields (`scoreSoccer`, `dataSoccer`, `statusSoccerId`, `clock`, `participant`, `seq`, `ts`) plus casing aliases. Goals, cards, team attribution, score, and phase are normalized before reaching React.
- **Direct dual-stream ingestion.** The adapter connects to both `/api/scores/stream?fixtureId=...` and `/api/odds/stream?fixtureId=...`, so a goal or consensus move does not wait for snapshot polling.
- **Current-interval safety net.** `/api/scores/updates/{fixtureId}` and `/api/odds/updates/{fixtureId}` are polled every two seconds in parallel. TxLINE sequence and message IDs deduplicate fallback and SSE records.
- **Layered caching + stale-serve.** Fixtures cache 60s (stale-served up to 10 min on upstream failure). The 45-second snapshot cache is used only when a fresh upstream score request fails. Delayed responses are explicitly labeled `dataQuality: "delayed"`.
- **Timeouts + retry.** Per-call `AbortController` timeouts (1.2s–8s by endpoint) with a single retry and backoff, so a slow upstream degrades gracefully instead of hanging a room.
- **Serverless-safe streaming.** The live SSE loop closes gracefully a few seconds before the Vercel function duration cap and the client auto-reconnects, so a match room keeps updating across the full 90 minutes.
- **Non-blocking persistence.** Browser-facing fixture, snapshot, and live ticks are returned before optional Postgres writes, so a database outage cannot delay the score.
- **Live vs replay.** The same client room pipeline handles a live snapshot stream and a historical replay built from TxLINE historical scores — useful for demos when no match is in play.

### TxLINE endpoints used

| Purpose | TxLINE endpoint | Where it's consumed |
| --- | --- | --- |
| Fixtures list (all matches) | `GET /api/fixtures/snapshot` | `/api/txline/fixtures`, room bootstrap |
| Live score snapshot | `GET /api/scores/snapshot/{fixtureId}` | `/api/txline/matches/:id/snapshot` + live stream |
| Live odds → market sentiment | `GET /api/odds/snapshot/{fixtureId}` | snapshot enrichment + live sentiment |
| Live score stream | `GET /api/scores/stream?fixtureId={fixtureId}` | immediate score/event ticks |
| Live odds stream | `GET /api/odds/stream?fixtureId={fixtureId}` | immediate market-pulse ticks |
| Current score updates | `GET /api/scores/updates/{fixtureId}` | two-second stream fallback |
| Current odds updates | `GET /api/odds/updates/{fixtureId}` | two-second sentiment fallback |
| Historical scores (replay) | `GET /api/scores/historical/{fixtureId}` | replay mode |

---

## 4. Application endpoints (for judges to test)

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/txline/fixtures` | none | List live fixtures (or a clear setup state) |
| GET | `/api/txline/matches/:id/snapshot` | none | Current score, sentiment, events |
| GET | `/api/txline/matches/:id/stream?mode=live` | none | SSE live match stream |
| GET | `/api/txline/matches/:id/stream?mode=replay` | none | SSE historical replay |
| POST | `/api/auth/wallet/nonce` | none | Issue SIWS sign-in message |
| POST | `/api/auth/wallet/verify` | none | Verify signature, set session cookie |
| GET | `/api/auth/wallet/session` | cookie | Current session / profile |
| POST | `/api/auth/wallet/logout` | cookie | Revoke session |
| POST | `/api/game/answer` | wallet | Submit a prediction answer (server-scored) |
| GET | `/api/game/state` | none | Room leaderboard |
| POST | `/api/creator/rooms` | wallet | Create a branded Creator Cup room |

Public pages: `/` (arena), `/rooms/:inviteCode` (creator invite), `/widget/:inviteCode` (embeddable widget), `/txline-activate` (credential activation).

---

## 5. Fair-play & security notes

- **Server-authoritative scoring.** When a prediction is resolved in Postgres, points are computed server-side from `resolution.resolvedOptionId` — the client cannot self-report a score. If a prediction is not yet resolved, the server returns a non-scored `pending` result and the client keeps only an optimistic local display until an authoritative result exists.
- **Signature verification.** Wallet ownership is proven with a `tweetnacl` detached-signature check against a single-use, time-boxed nonce; sessions are HTTP-only, `secure` in production, and revocable.
- **Credential isolation.** TxLINE JWT/API token live only in server env and are read exclusively inside server routes. `.env` is git-ignored and never committed.
- **Input hardening.** API routes validate/parse JSON defensively (malformed bodies return `400`), sanitize creator-supplied text, and constrain theme colors / invite codes.

---

## 6. Business & monetization path

- **Creator Cup** is the commercial core: creators and brands spin up branded watch rooms (`sponsor` label, theme color, custom invite) with a shareable invite page and an **embeddable widget** — a drop-in fan-engagement unit for streamers, media, and sponsors.
- **Retention hooks** — streaks, badges, live leaderboards, and background match notifications (goal / red card / odds swing) bring fans back mid-match.
- **Scales beyond the World Cup** — TxLINE's single normalized schema means the same product works for any competition with no per-league code, so the model extends to domestic leagues and other sports.

---

## 7. Run locally

```bash
npm install                 # runs prisma generate via postinstall
cp .env.example .env.local  # add TXLINE_JWT / TXLINE_API_TOKEN (via /txline-activate)
npm run db:deploy           # apply committed schema migrations to PostgreSQL
npm run dev                 # http://localhost:3000
```

Verification:

```bash
npm run test:game   # scoring + badge + auth unit tests
npm run build       # production build (runs prisma generate)
```

**Stack:** Next.js 14 · React 18 · TypeScript · Tailwind · Prisma/PostgreSQL · Solana wallet SIWS · TxLINE.
