# MatchPulse Arena ⚽

**A World Cup second-screen fan game powered by live TxLINE data, with sign-in on Solana.**

Watch any of the 104 World Cup matches, read live scores and *real-time market sentiment* (odds translated into fan-facing momentum & pressure), and make no-money micro-predictions off the live feed. Build streaks, earn badges, climb a live leaderboard. Creators spin up branded watch-rooms with a shareable invite and an embeddable widget.

> **Not a betting app.** No deposits, wagers, payouts, or gambling CTAs. Odds movement is surfaced only as momentum / pressure / market-reaction signals for fans.

### 30-second tour
1. **Browse live matches** — no wallet needed. Fixtures stream from TxLINE.
2. **Open a match room** → live score, market pulse, and event feed over SSE.
3. **Answer a prediction card** generated from the live TxLINE feed.
4. **Connect Phantom / Solflare** (SIWS signature) → points, streaks, and badges persist to your profile.
5. **Create a Creator Cup room** → shareable invite page + embeddable widget for a sponsor/creator.

### Submission links
- **Live demo:** https://matchpulsearena.vercel.app
- **Demo video:** https://youtu.be/MCGj-aGt6JU
- **Repo:** https://github.com/fawazdevx/MatchPulse-Arena
- **Powered by:** TxLINE (live sports data + consensus odds) · Solana (wallet sign-in)

### TxLINE endpoints used
| Purpose | TxLINE endpoint |
| --- | --- |
| Fixtures list | `GET /api/fixtures/snapshot` |
| Live score snapshot | `GET /api/scores/snapshot/{fixtureId}` |
| Live odds / sentiment | `GET /api/odds/snapshot/{fixtureId}` |
| Live score stream | `GET /api/scores/stream?fixtureId={fixtureId}` |
| Live odds stream | `GET /api/odds/stream?fixtureId={fixtureId}` |
| Current score fallback | `GET /api/scores/updates/{fixtureId}` |
| Current odds fallback | `GET /api/odds/updates/{fixtureId}` |
| Historical replay | `GET /api/scores/historical/{fixtureId}` |

Credentials never reach the browser — every TxLINE call is proxied server-side (see [TxLINE Architecture](#txline-architecture)).


## Stack

- Next.js 14 App Router, React, TypeScript
- Tailwind CSS and shadcn-style primitives
- Node.js API routes and SSE streams
- Prisma ORM and PostgreSQL-ready schema
- Solana wallet sign-in with Phantom/Solflare
- TxLINE adapter layer with explicit `real` and `mock` modes

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Open `http://localhost:3000`.

The app defaults to live TxLINE mode. Without credentials, it shows a setup state instead of silently loading fake matches.

For persistence, run Postgres, set `DATABASE_URL`, then:

```bash
npm run db:deploy
```

`db:deploy` applies the committed Prisma migrations. For Supabase transaction-pooler URLs on port `6543`, the script uses session-pooler port `5432` while migrating; runtime Prisma connections retain `6543` with PgBouncer-safe settings. Use `npm run db:push` only for disposable local schema prototyping.

Useful verification commands:

```bash
npm run test:rules
npm run test:smoke
npm run lint
npm run build
```

## Environment

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/matchpulse_arena?schema=public"
TXLINE_ADAPTER=real
TXLINE_NETWORK=devnet
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_PROGRAM_ID=6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
TXLINE_TXL_MINT=4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG
SOLANA_RPC_URL=https://api.devnet.solana.com
TXLINE_JWT=
TXLINE_API_TOKEN=
```

Use `/txline-activate` to activate devnet or mainnet credentials. The page creates the Token-2022 ATA when missing, runs the TxLINE subscription transaction, requests a guest JWT, signs the activation message, and returns the environment variables to paste into `.env.local`.

## TxLINE Architecture

TxLINE integration is isolated under `src/services/txline`:

- `index.ts`: explicit adapter selection and setup errors.
- `real-adapter.ts`: server-only TxLINE proxy adapter for fixtures, snapshots, filtered score/odds SSE streams, current-interval fallbacks, and historical scores.
- `mock-adapter.ts`: optional isolated local adapter, used only when `TXLINE_ADAPTER=mock`.
- `mock-data.ts`: optional local replay data for adapter testing.
- `endpoints.ts`: safe technical endpoint metadata for the in-app notes page.

Backend routes proxy data and never expose TxLINE credentials to the browser:

- `GET /api/txline/fixtures`
- `GET /api/txline/matches/:matchId/snapshot`
- `GET /api/txline/matches/:matchId/stream?mode=live`
- `GET /api/txline/matches/:matchId/stream?mode=replay`
- `POST /api/auth/wallet/nonce`
- `POST /api/auth/wallet/verify`
- `GET /api/auth/wallet/session`
- `POST /api/auth/wallet/logout`
- `GET /api/game/state`
- `POST /api/game/answer`
- `POST /api/creator/rooms`

## Wallet Auth

Wallet login is optional for browsing matches and room data. It is required for persisted profile state, leaderboard persistence, prediction answer storage, and Creator Cup room creation.

The app uses a SIWS-style signed message:

1. Client connects Phantom or Solflare.
2. Backend creates a nonce and sign-in message.
3. Wallet signs the message.
4. Backend verifies the signature with `tweetnacl`.
5. Backend creates an HTTP-only session cookie.
6. User state persists through Prisma/Postgres.

The signed message explicitly states that it does not authorize a transaction, payment, wager, or token transfer.

## Persistence

The Prisma schema includes production dApp records for users, wallet sessions, matches, match rooms, creator rooms, events, predictions, answers, resolutions, badges, leaderboard entries, TxLINE event logs, TxLINE credentials, and replay sessions.

The app no longer seeds public production screens with hardcoded matches or leaderboard users. Badges are initialized when needed; matches and Creator Cup rooms come from live TxLINE fixtures and persisted database records.

The repository includes a complete baseline migration plus incremental migrations. Run `npm run db:deploy` once against the production `DATABASE_URL` before testing wallet scoring or Creator Cup rooms.

## Live Mode vs Replay Mode

Live mode:

- `TXLINE_ADAPTER=real`
- Configure `TXLINE_JWT` and `TXLINE_API_TOKEN`.
- Backend calls TxLINE server-side with `Authorization: Bearer <jwt>` and `X-Api-Token: <token>`.
- If credentials are missing, API routes return a clear setup state.
- The match room connects to `/api/txline/matches/:matchId/stream?mode=live`.
- The server consumes filtered TxLINE score and odds SSE feeds directly.
- `/scores/updates/{fixtureId}` and `/odds/updates/{fixtureId}` run in parallel as a two-second, deduplicated fallback if an upstream stream is slow to establish.

Historical replay:

- Uses TxLINE historical score events when live credentials support `/api/scores/historical/{fixtureId}`.
- The same client room pipeline handles replay ticks.

Local mock testing:

- Set `TXLINE_ADAPTER=mock` only when you explicitly want isolated local replay without TxLINE credentials.
- Mock data is not used by the production/default path.

## Creator Cup

Creators connect a wallet and create branded rooms with:

- Creator name, handle, avatar initials, theme color, sponsor label
- Custom invite code and share URL
- Embeddable widget HTML
- Public invite page at `/rooms/:inviteCode`
- Embeddable match widget at `/widget/:inviteCode`
- Room Captain badge unlock
- Database-backed room and widget records

## Demo Script

1. Show the home page loading live TxLINE fixtures or the credential setup state.
2. Use `/txline-activate` to explain devnet credential activation.
3. Join a TxLINE match room once credentials are configured.
4. Show score snapshot, market sentiment, event timeline, and SSE connection state.
5. Answer a no-money prediction generated from incoming TxLINE updates.
6. Connect a Solana wallet to persist profile, badges, and leaderboard progress.
7. Create a Creator Cup room and open its public room/widget URL.
8. Show the TxLINE notes page and the server-only adapter architecture.

## Notes

If `npm run db:generate` does not write `node_modules/.prisma/client` in your local environment, reinstall dependencies and rerun generation:

```bash
npm install
npm run db:generate
```

The app type-checks with a runtime Prisma wrapper so UI/API development is not blocked by a missing generated client, but database persistence requires a generated Prisma Client and a valid `DATABASE_URL`.
