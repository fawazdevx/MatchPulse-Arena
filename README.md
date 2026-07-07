# MatchPulse Arena

MatchPulse Arena is a World Cup second-screen fan dApp powered by TxLINE live match data. Fans can browse live match rooms without a wallet, then connect Phantom or Solflare to persist their profile, points, streaks, badges, leaderboard position, and Creator Cup rooms.

This is not a betting app. There are no deposits, wagers, payouts, financial rewards, betting slips, or gambling calls to action. Odds movement is translated into fan-facing momentum, pressure, and market reaction signals.

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
npm run db:push
```

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
- `real-adapter.ts`: server-only TxLINE proxy adapter for fixtures, score snapshots, odds snapshots, score streams, and historical scores.
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

## Live Mode vs Replay Mode

Live mode:

- `TXLINE_ADAPTER=real`
- Configure `TXLINE_JWT` and `TXLINE_API_TOKEN`.
- Backend calls TxLINE server-side with `Authorization: Bearer <jwt>` and `X-Api-Token: <token>`.
- If credentials are missing, API routes return a clear setup state.
- The match room connects to `/api/txline/matches/:matchId/stream?mode=live`.

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
