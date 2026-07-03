# MatchPulse Arena

MatchPulse Arena is a mobile-first World Cup second-screen fan experience powered by TxLINE-style live match data. Fans join match rooms, watch score and market-sentiment momentum, answer no-money micro-predictions, build Pulse Streaks, unlock badges, and climb room leaderboards.

This is not a betting app. There are no deposits, wagers, payouts, financial rewards, or betting calls to action. Odds movement is translated into fan-facing "momentum", "pressure", and "market reaction" signals for gameplay.

## Stack

- React + Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn-style UI primitives in `src/components/ui`
- Node.js API routes for backend endpoints and SSE replay
- Prisma ORM with Postgres schema
- Mock TxLINE adapter with replay mode for reliable demos

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

Open `http://localhost:3000`.

The app works without Postgres or TxLINE credentials by using the mock replay adapter. To enable database persistence, set `DATABASE_URL` and run:

```bash
npm run db:push
```

## TxLINE Setup

TxLINE docs used:

- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup Free Tier: https://txline.txodds.com/documentation/worldcup
- Streaming data: https://txline.txodds.com/documentation/examples/streaming-data

The docs describe World Cup free tiers, guest JWT auth, activated API tokens, fixture data, odds data, score data, historical scores, and SSE streams. Data API requests use:

- `Authorization: Bearer ${TXLINE_GUEST_JWT}`
- `X-Api-Token: ${TXLINE_API_TOKEN}`

Environment variables:

```bash
TXLINE_API_ORIGIN=https://txline.txodds.com
TXLINE_GUEST_JWT=
TXLINE_API_TOKEN=
```

## Architecture

TxLINE integration is isolated under `src/services/txline`:

- `mock-adapter.ts`: replay-safe local data source.
- `real-adapter.ts`: credential-aware adapter shell for real TxLINE endpoints.
- `index.ts`: adapter selection.
- `mock-data.ts`: realistic fixtures, score events, odds sentiment, predictions, and leaderboard seeds.
- `endpoints.ts`: client-safe technical endpoint metadata.

Backend API routes:

- `GET /api/txline/fixtures`
- `GET /api/txline/matches/:matchId/snapshot`
- `GET /api/txline/matches/:matchId/stream?mode=replay`
- `GET /api/game/state`
- `POST /api/game/answer`
- `POST /api/creator/rooms`

Prisma models in `prisma/schema.prisma` cover users, matches, rooms, creator rooms, match events, predictions, answers, badges, and leaderboard entries.

## Demo Flow

1. Land on the match list and choose the featured World Cup room.
2. Start replay mode to connect to the SSE stream.
3. Answer the active micro-prediction before it locks.
4. Watch score events, momentum movement, prediction resolution, streak updates, badge toasts, and leaderboard changes.
5. Open Creator Cup setup to configure a branded room, sponsor card, invite link, and widget embed.
6. Open Analytics and TxLINE Notes for the technical/commercial story.

## Commercial Model

- Free public match rooms for fans.
- Paid Creator Cup rooms for streamers, football communities, and sports media pages.
- Sponsored prediction campaigns for brands.
- White-label live match widgets.
- Premium creator and publisher analytics.

## Hackathon Feedback

What worked well: TxLINE scores and odds streams map cleanly to a second-screen loop where live data becomes fan-friendly momentum, prediction prompts, and resolution evidence.

Friction: exact production fixture identifiers and provider payload normalization should be finalized after live credentials are available.

Next: replace mock mappers with concrete TxLINE payload transforms, run a real Postgres instance, and add authenticated creator room management.
