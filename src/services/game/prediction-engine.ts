import type { MatchEvent, MatchFixture, MatchSnapshot, PredictionCard, ReplayTick, TeamKey } from "../../lib/types";

function eventMinute(event: MatchEvent, fallback: number) {
  return Number.isFinite(event.minute) && event.minute > 0 ? event.minute : fallback;
}

function sourceUpdateId(tick: ReplayTick) {
  return tick.txlineUpdateId ?? tick.event.id;
}

function favoredOptionFromTick(tick: ReplayTick) {
  if (tick.event.team) return tick.event.team;
  if (tick.sentiment.trend === "home" || tick.sentiment.trend === "away") return tick.sentiment.trend;
  return "neutral";
}

export function createSnapshotTick(snapshot: MatchSnapshot, sequence: number): ReplayTick {
  const latestEvent = snapshot.events[0];
  const syntheticId = [
    "snapshot",
    snapshot.fixture.id,
    snapshot.clock.phase,
    snapshot.clock.minute,
    snapshot.clock.stoppage,
    `${snapshot.score.home}-${snapshot.score.away}`,
    snapshot.sentiment.sourceUpdateId
  ].join("-");
  const event: MatchEvent =
    latestEvent ??
    {
      id: syntheticId,
      minute: snapshot.clock.minute,
      stoppage: snapshot.clock.stoppage,
      type: "momentum",
      title: "TxLINE update received",
      description: `${snapshot.fixture.home.shortName} ${snapshot.score.home}-${snapshot.score.away} ${snapshot.fixture.away.shortName}. Match pulse refreshed from TxLINE.`,
      impact: "low",
      sentimentAfter: snapshot.sentiment
    };

  return {
    atSecond: sequence,
    event,
    txlineUpdateId: event.id,
    snapshotGeneratedAt: snapshot.generatedAt,
    score: snapshot.score,
    sentiment: snapshot.sentiment
  };
}

export function createPredictionFromTick(matchId: string, fixture: MatchFixture, tick: ReplayTick): PredictionCard {
  const minute = eventMinute(tick.event, 0);
  const lockAt = Math.max(1, minute + 1);
  const resolvesAt = Math.max(lockAt + 1, minute + 3);
  const teamPrompt =
    tick.event.type === "goal" || tick.event.type === "red_card"
      ? "After that major moment, where will the market reaction move?"
      : "Which side will gain match pulse on the next TxLINE update?";

  return {
    id: `pred-${matchId}-${sourceUpdateId(tick)}`,
    kind: tick.event.type === "goal" || tick.event.type === "red_card" ? "post_event" : "momentum",
    prompt: teamPrompt,
    context: `${tick.event.title}: ${tick.event.description}`,
    options: [
      { id: "home", label: fixture.home.shortName, team: "home" },
      { id: "neutral", label: "Balanced pulse" },
      { id: "away", label: fixture.away.shortName, team: "away" }
    ],
    lockAt,
    resolvesAt,
    source: {
      stream: "score",
      endpoint: "/api/txline/matches/:matchId/stream?mode=live",
      expectedSignal: sourceUpdateId(tick)
    }
  };
}

export function resolvePredictionFromTick(card: PredictionCard, tick: ReplayTick): PredictionCard {
  const optionId = favoredOptionFromTick(tick);
  const label = optionId === "neutral" ? "balanced market reaction" : `${optionId} momentum`;

  return {
    ...card,
    resolved: {
      optionId,
      eventId: tick.event.id,
      explanation: `Resolved by TxLINE update ${sourceUpdateId(tick)} with ${label}.`
    }
  };
}

export function optionTeam(optionId: string): TeamKey | undefined {
  if (optionId === "home" || optionId === "away") return optionId;
  return undefined;
}
