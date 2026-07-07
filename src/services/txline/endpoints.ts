export const txLineEndpoints = [
  {
    label: "Fixtures snapshot",
    method: "GET",
    path: "/api/txline/fixtures",
    txline: "Fixtures and schedule snapshot",
    use: "Populates today's World Cup match list and room metadata."
  },
  {
    label: "Match snapshot",
    method: "GET",
    path: "/api/txline/matches/:matchId/snapshot",
    txline: "Scores snapshot + odds snapshot + recent events",
    use: "Initializes score, clock, phase, market sentiment, and timeline."
  },
  {
    label: "Score stream",
    method: "SSE",
    path: "/api/txline/matches/:matchId/stream",
    txline: "GET /api/scores/stream",
    use: "Updates goals, cards, corners, phase, clock, and event timeline."
  },
  {
    label: "Odds stream",
    method: "SSE",
    path: "/api/txline/matches/:matchId/stream",
    txline: "GET /api/odds/stream",
    use: "Turns odds movement into fan-facing momentum and prediction resolution."
  },
  {
    label: "Historical replay",
    method: "SSE",
    path: "/api/txline/matches/:matchId/stream?mode=replay",
    txline: "GET /api/scores/historical/{fixtureId}",
    use: "Replays historical TxLINE score events through the same room update pipeline."
  }
];
