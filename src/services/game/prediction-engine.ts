import type { MatchEvent, MatchFixture, MatchSnapshot, PredictionCard, ReplayTick, TeamKey } from "../../lib/types";

type PredictionTemplate = {
  kind: PredictionCard["kind"];
  prompt: string;
  homeLabel: string;
  neutralLabel: string;
  awayLabel: string;
  stream: PredictionCard["source"]["stream"];
  expectedSignal: string;
};

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

function stableTemplateIndex(tick: ReplayTick, templateCount: number) {
  const value = `${sourceUpdateId(tick)}:${tick.event.type}`;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash % templateCount;
}

function pickTemplate(tick: ReplayTick, templates: PredictionTemplate[]) {
  return templates[stableTemplateIndex(tick, templates.length)];
}

function directionalLabels(fixture: MatchFixture, middle = "Stays balanced") {
  return {
    homeLabel: `${fixture.home.shortName} pulse`,
    neutralLabel: middle,
    awayLabel: `${fixture.away.shortName} pulse`
  };
}

function predictionTemplate(fixture: MatchFixture, tick: ReplayTick, minute: number): PredictionTemplate {
  const home = fixture.home.shortName;
  const away = fixture.away.shortName;
  const labels = directionalLabels(fixture);
  const phase = tick.clock?.phase ?? fixture.status;

  if (phase === "pre" || (minute === 0 && fixture.status === "pre")) {
    return pickTemplate(tick, [
      {
        kind: "momentum",
        prompt: `Who lands the first meaningful pulse: ${home} or ${away}?`,
        ...directionalLabels(fixture, "Opening stays level"),
        stream: "score",
        expectedSignal: "opening score or match-state update"
      },
      {
        kind: "odds_shift",
        prompt: `Will the opening TxLINE move lean ${home}, ${away}, or stay level?`,
        ...directionalLabels(fixture, "No opening move"),
        stream: "odds",
        expectedSignal: "opening consensus movement"
      },
      {
        kind: "momentum",
        prompt: "Which side starts sharper when the match goes live?",
        ...directionalLabels(fixture, "Even start"),
        stream: "score",
        expectedSignal: "first live match signal"
      }
    ]);
  }

  if (tick.event.type === "goal") {
    const scoringTeam = tick.event.team === "home" ? home : tick.event.team === "away" ? away : "the scoring side";
    return pickTemplate(tick, [
      {
        kind: "post_event",
        prompt: "After the goal, who owns the next TxLINE reaction?",
        ...directionalLabels(fixture, "Reaction settles"),
        stream: "odds",
        expectedSignal: "post-goal consensus movement"
      },
      {
        kind: "post_event",
        prompt: `Does ${scoringTeam} keep the pulse, or does the response come quickly?`,
        ...directionalLabels(fixture, "Pulse resets"),
        stream: "odds",
        expectedSignal: "post-goal pressure shift"
      },
      {
        kind: "post_event",
        prompt: `Next swing after the goal: ${home}, ${away}, or a reset?`,
        ...directionalLabels(fixture, "Market resets"),
        stream: "odds",
        expectedSignal: "next post-goal live signal"
      }
    ]);
  }

  if (tick.event.type === "red_card") {
    return pickTemplate(tick, [
      {
        kind: "post_event",
        prompt: "Who exploits the red-card shift on the next update?",
        ...directionalLabels(fixture, "No immediate swing"),
        stream: "odds",
        expectedSignal: "post-dismissal consensus movement"
      },
      {
        kind: "post_event",
        prompt: `Does the dismissal push the pulse toward ${home} or ${away}?`,
        ...directionalLabels(fixture, "Pulse holds"),
        stream: "odds",
        expectedSignal: "red-card reaction"
      },
      {
        kind: "post_event",
        prompt: "Will the team advantage show immediately in TxLINE?",
        ...directionalLabels(fixture, "Delayed reaction"),
        stream: "score",
        expectedSignal: "next post-dismissal match signal"
      }
    ]);
  }

  const marketUpdate =
    tick.event.id.startsWith("odds-") ||
    tick.event.title.toLowerCase().includes("market pulse") ||
    (tick.event.type === "momentum" && tick.sentiment.delta > 0);

  if (marketUpdate) {
    const currentLean =
      tick.sentiment.trend === "home" ? home : tick.sentiment.trend === "away" ? away : "neither side";
    return pickTemplate(tick, [
      {
        kind: "odds_shift",
        prompt: "Which side will the next consensus move favor?",
        ...directionalLabels(fixture, "No clear move"),
        stream: "odds",
        expectedSignal: "next implied-probability movement"
      },
      {
        kind: "odds_shift",
        prompt: `The pulse currently leans ${currentLean}. Does it hold or correct?`,
        ...directionalLabels(fixture, "Pulse stabilizes"),
        stream: "odds",
        expectedSignal: "consensus continuation or correction"
      },
      {
        kind: "odds_shift",
        prompt: `Next live read: ${home} move, ${away} move, or no swing?`,
        ...directionalLabels(fixture, "No swing"),
        stream: "odds",
        expectedSignal: "next market-pulse update"
      }
    ]);
  }

  if (["corner", "shot", "var", "yellow_card"].includes(tick.event.type)) {
    return pickTemplate(tick, [
      {
        kind: "momentum",
        prompt: "Who turns this pressure into the next pulse swing?",
        ...labels,
        stream: "score",
        expectedSignal: "next pressure event"
      },
      {
        kind: "momentum",
        prompt: `Does this spell continue for ${home}, flip to ${away}, or settle?`,
        ...labels,
        stream: "score",
        expectedSignal: "next match-pressure update"
      },
      {
        kind: "momentum",
        prompt: "Which side controls the next phase after this moment?",
        ...labels,
        stream: "score",
        expectedSignal: "next phase-control signal"
      }
    ]);
  }

  if (minute >= 75) {
    return pickTemplate(tick, [
      {
        kind: "momentum",
        prompt: "Who owns the closing stretch of this match?",
        ...directionalLabels(fixture, "Late stalemate"),
        stream: "score",
        expectedSignal: "late-match momentum update"
      },
      {
        kind: "momentum",
        prompt: `Late pressure: ${home}, ${away}, or deadlock?`,
        ...directionalLabels(fixture, "Deadlock"),
        stream: "score",
        expectedSignal: "next late-match signal"
      },
      {
        kind: "odds_shift",
        prompt: "Will the next TxLINE read confirm late control or reverse it?",
        ...directionalLabels(fixture, "No late move"),
        stream: "odds",
        expectedSignal: "late consensus movement"
      }
    ]);
  }

  return pickTemplate(tick, [
    {
      kind: "momentum",
      prompt: `Who takes control on the next update: ${home} or ${away}?`,
      ...labels,
      stream: "score",
      expectedSignal: "next live match signal"
    },
    {
      kind: "momentum",
      prompt: "Where does the live momentum move next?",
      ...labels,
      stream: "score",
      expectedSignal: "next momentum update"
    },
    {
      kind: "odds_shift",
      prompt: `Does the next TxLINE pulse favor ${home}, ${away}, or neither?`,
      ...directionalLabels(fixture, "Neither side"),
      stream: "odds",
      expectedSignal: "next consensus movement"
    },
    {
      kind: "momentum",
      prompt: "Which team wins the next phase of pressure?",
      ...labels,
      stream: "score",
      expectedSignal: "next pressure signal"
    }
  ]);
}

function predictionContext(fixture: MatchFixture, tick: ReplayTick, minute: number) {
  const clock = tick.clock?.label ?? (minute > 0 ? `${minute}'` : "Pre-match");
  const score = tick.score ? `${fixture.home.shortName} ${tick.score.home}-${tick.score.away} ${fixture.away.shortName}` : `${fixture.home.shortName} vs ${fixture.away.shortName}`;
  return `${clock} | ${score}. ${tick.event.title}: ${tick.event.description}`;
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
  const template = predictionTemplate(fixture, tick, minute);

  return {
    id: `pred-${matchId}-${sourceUpdateId(tick)}`,
    kind: template.kind,
    prompt: template.prompt,
    context: predictionContext(fixture, tick, minute),
    options: [
      { id: "home", label: template.homeLabel, team: "home" },
      { id: "neutral", label: template.neutralLabel },
      { id: "away", label: template.awayLabel, team: "away" }
    ],
    lockAt,
    resolvesAt,
    source: {
      stream: template.stream,
      endpoint: "/api/txline/matches/:matchId/stream?mode=live",
      expectedSignal: template.expectedSignal
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
