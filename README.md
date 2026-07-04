# MatchPulse Arena

MatchPulse Arena is a World Cup second-screen fan dApp powered by TxLINE live match data. Fans connect a Solana wallet, join live match rooms, watch score and market-sentiment momentum, answer no-money micro-predictions, build Pulse Streaks, unlock badges, and compete on room leaderboards.

This is not a betting app. There are no deposits, wagers, payouts, financial rewards, betting slips, or gambling calls to action. Odds movement is translated into fan-facing momentum, pressure, and market reaction signals.

## Stack

- Next.js 14 App Router, React, TypeScript
- Tailwind CSS and shadcn-style primitives
- Node.js API routes and SSE streams
- Prisma ORM and PostgreSQL-ready schema
- Solana wallet sign-in with Phantom/Solflare
- TxLINE adapter layer with explicit `mock` and `real` modes

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

Open `http://localhost:3000`.

For reliable local replay, keep:

```bash
TXLINE_ADAPTER=mock
```

For persistence, run Postgres, set `DATABASE_URL`, then:

```bash
npm run db:push
```

Useful verification commands:

```bash
npm run test:rules
npm run lint
npm run build
```

## Environment

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/matchpulse_arena?schema=public"
TXLINE_ADAPTER=mock
TXLINE_NETWORK=devnet
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_PROGRAM_ID=6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
TXLINE_TXL_MINT=4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG
SOLANA_RPC_URL=https://api.devnet.solana.com
TXLINE_JWT=
TXLINE_API_TOKEN=
```

Use `/txline-activate` to activate devnet or mainnet credentials. The page creates the Token-2022 ATA when missing, runs the TxLINE subscription transaction, requests a guest JWT, signs the activation message, and returns the environment variables to paste into `.env.local`.

## Architecture

TxLINE integration is isolated under `src/services/txline`:

- `index.ts`: explicit adapter selection.
- `mock-adapter.ts`: replay-safe local data source.
- `real-adapter.ts`: server-only TxLINE proxy adapter.
- `mock-data.ts`: fixtures, event timeline, predictions, leaderboard seeds.
- `endpoints.ts`: safe technical endpoint metadata.

Backend routes proxy data and never expose TxLINE credentials to the browser:

- `GET /api/txline/fixtures`
- `GET /api/txline/matches/:matchId/snapshot`
- `GET /api/txline/matches/:matchId/stream?mode=replay`
- `POST /api/auth/wallet/nonce`
- `POST /api/auth/wallet/verify`
- `GET /api/auth/wallet/session`
- `POST /api/auth/wallet/logout`
- `GET /api/game/state`
- `POST /api/game/answer`
- `POST /api/creator/rooms`

Creator Cup public surfaces:

- `GET /rooms/:inviteCode`
- `GET /widget/:inviteCode`

## Wallet Auth

The app uses a SIWS-style signed message:

1. Client connects Phantom or Solflare.
2. Backend creates a nonce and sign-in message.
3. Wallet signs the message.
4. Backend verifies the signature with `tweetnacl`.
5. Backend creates an HTTP-only session cookie.
6. User state can persist through Prisma/Postgres.

The signed message explicitly states that it does not authorize a transaction, payment, wager, or token transfer.

## Persistence

The Prisma schema includes production dApp records for:

- `User`
- `WalletSession`
- `Match`
- `MatchRoom`
- `RoomParticipant`
- `CreatorRoom`
- `MatchEvent`
- `Prediction`
- `PredictionOption`
- `PredictionAnswer`
- `PredictionResolution`
- `Badge`
- `UserBadge`
- `LeaderboardEntry`
- `TxLineEventLog`
- `TxLineCredential`
- `ReplaySession`

When `DATABASE_URL` is configured, the app seeds mock World Cup rooms, badges, predictions, event logs, and leaderboard entries, then persists wallet users, answers, streaks, badges, and Creator Cup rooms.

## Live Mode vs Replay Mode

Replay mode:

- Set `TXLINE_ADAPTER=mock`.
- Uses stored TxLINE-style fixtures, score events, sentiment moves, and prediction resolutions.
- Works without live credentials.

Live mode:

- Set `TXLINE_ADAPTER=real`.
- Configure `TXLINE_JWT` and `TXLINE_API_TOKEN`.
- Backend calls TxLINE server-side.
- If credentials are missing, API routes return a clear setup state instead of silently falling back to mock data.

## Creator Cup

Creators can connect a wallet and create branded rooms with:

- Creator name, handle, avatar initials, theme color, sponsor label
- Custom invite code and share URL
- Embeddable widget HTML
- Public invite page at `/rooms/:inviteCode`
- Embeddable match widget at `/widget/:inviteCode`
- Room Captain badge unlock
- Analytics-ready room records

## Demo Flow

1. Start in replay mode.
2. Connect a Solana wallet from the header.
3. Join the featured World Cup room.
4. Start replay mode.
5. Answer a prediction before lock.
6. Watch score, event, sentiment, badge, and leaderboard updates.
7. Create a Creator Cup room.
8. Show `/txline-activate` and the TxLINE notes page.

## Notes

If `npm run db:generate` does not write `node_modules/.prisma/client` in your local environment, reinstall dependencies and rerun generation:

```bash
npm install
npm run db:generate
```

The app type-checks with a runtime Prisma wrapper so UI/API development is not blocked by a missing generated client, but database persistence requires a generated Prisma Client and a valid `DATABASE_URL`.
