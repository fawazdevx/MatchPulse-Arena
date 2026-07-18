import test from "node:test";
import assert from "node:assert/strict";
import type { MatchSnapshot } from "../../lib/types.ts";
import { createPredictionFromTick, createSnapshotTick, resolvePredictionFromTick } from "./prediction-engine.ts";

function snapshot(generatedAt: string): MatchSnapshot {
  return {
    fixture: {
      id: "18193785",
      competition: "World Cup",
      stage: "Group stage",
      venue: "Demo Stadium",
      kickoffIso: "2026-07-07T18:00:00.000Z",
      status: "live",
      featured: true,
      home: {
        id: "home",
        name: "Spain",
        shortName: "ESP",
        color: "#C60B1E",
        crest: "ESP",
        record: ""
      },
      away: {
        id: "away",
        name: "Brazil",
        shortName: "BRA",
        color: "#1F8A3B",
        crest: "BRA",
        record: ""
      }
    },
    clock: {
      minute: 79,
      stoppage: 0,
      phase: "live",
      label: "79'"
    },
    score: {
      home: 1,
      away: 3
    },
    sentiment: {
      home: 35,
      draw: 18,
      away: 47,
      trend: "away",
      delta: 4,
      label: "TxLINE market sentiment",
      sourceUpdateId: "odds-42"
    },
    events: [],
    generatedAt,
    provider: "txline"
  };
}

test("createSnapshotTick keeps synthetic TxLINE update ids stable when only generatedAt changes", () => {
  const first = createSnapshotTick(snapshot("2026-07-07T18:00:00.000Z"), 1);
  const second = createSnapshotTick(snapshot("2026-07-07T18:00:08.000Z"), 2);

  assert.equal(first.txlineUpdateId, second.txlineUpdateId);
});

test("resolvePredictionFromTick stores the resolving TxLINE event id on the card", () => {
  const tick = createSnapshotTick(snapshot("2026-07-07T18:00:00.000Z"), 1);
  const resolved = resolvePredictionFromTick(
    {
      id: "prediction-1",
      kind: "momentum",
      prompt: "Which side moves next?",
      context: "TxLINE update",
      lockAt: 80,
      resolvesAt: 82,
      options: [
        { id: "home", label: "ESP", team: "home" },
        { id: "neutral", label: "Balanced" },
        { id: "away", label: "BRA", team: "away" }
      ],
      source: {
        stream: "score",
        endpoint: "/api/txline/matches/:matchId/stream?mode=live",
        expectedSignal: "odds-42"
      }
    },
    tick
  );

  assert.equal(resolved.resolved?.eventId, tick.event.id);
  assert.match(resolved.resolved?.explanation ?? "", /TxLINE update/);
});

test("createPredictionFromTick rotates prompts while remaining stable for the same update", () => {
  const match = snapshot("2026-07-07T18:00:00.000Z");
  const baseTick = createSnapshotTick(match, 1);
  const cards = Array.from({ length: 8 }, (_, index) => {
    const tick = {
      ...baseTick,
      atSecond: index + 1,
      txlineUpdateId: `momentum-${index + 1}`,
      event: {
        ...baseTick.event,
        id: `momentum-${index + 1}`,
        minute: 40,
        type: "momentum" as const,
        title: "Live pressure update"
      },
      clock: {
        minute: 40,
        stoppage: 0,
        phase: "live" as const,
        label: "40'"
      }
    };

    return createPredictionFromTick(match.fixture.id, match.fixture, tick);
  });

  const repeated = createPredictionFromTick(
    match.fixture.id,
    match.fixture,
    {
      ...baseTick,
      atSecond: 1,
      txlineUpdateId: "momentum-1",
      event: {
        ...baseTick.event,
        id: "momentum-1",
        minute: 40,
        type: "momentum",
        title: "Live pressure update"
      },
      clock: {
        minute: 40,
        stoppage: 0,
        phase: "live",
        label: "40'"
      }
    }
  );

  assert.ok(new Set(cards.map((card) => card.prompt)).size > 1);
  assert.equal(cards[0].prompt, repeated.prompt);
  assert.deepEqual(cards[0].options, repeated.options);
  assert.notEqual(cards[0].prompt, "Which side will gain match pulse on the next TxLINE update?");
});

test("goal updates create contextual post-event questions", () => {
  const match = snapshot("2026-07-07T18:00:00.000Z");
  const baseTick = createSnapshotTick(match, 1);
  const card = createPredictionFromTick(match.fixture.id, match.fixture, {
    ...baseTick,
    atSecond: 9,
    txlineUpdateId: "goal-9",
    score: {
      home: 2,
      away: 3
    },
    event: {
      ...baseTick.event,
      id: "goal-9",
      minute: 81,
      type: "goal",
      team: "home",
      title: "Spain score"
    }
  });

  assert.equal(card.kind, "post_event");
  assert.match(card.prompt.toLowerCase(), /goal|scoring side|reaction|response/);
  assert.match(card.context, /ESP 2-3 BRA/);
  assert.equal(card.source.stream, "odds");
});
