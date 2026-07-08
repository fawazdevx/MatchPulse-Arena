import test from "node:test";
import assert from "node:assert/strict";
import type { MatchSnapshot } from "../../lib/types.ts";
import { createSnapshotTick, resolvePredictionFromTick } from "./prediction-engine.ts";

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
