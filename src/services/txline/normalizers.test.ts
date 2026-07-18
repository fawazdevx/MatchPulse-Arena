import test from "node:test";
import assert from "node:assert/strict";
import {
  txLineClockFromRecord,
  txLineEventTypeFromRecord,
  txLineScoreFromRecord,
  txLineTeamSideFromRecord,
  txLineUpdateIdFromRecord
} from "./normalizers.ts";

test("normalizes a documented TxLINE soccer goal update immediately", () => {
  const update = {
    fixtureId: 18193785,
    gameState: "H2",
    statusSoccerId: "H2",
    participant1IsHome: true,
    participant1Id: 101,
    participant2Id: 202,
    participant: 101,
    action: "goal",
    id: 5501,
    seq: 91,
    ts: 1784221200000,
    clock: {
      running: true,
      seconds: 4042
    },
    scoreSoccer: {
      Participant1: {
        Total: { Goals: 2, YellowCards: 1, RedCards: 0, Corners: 5 }
      },
      Participant2: {
        Total: { Goals: 1, YellowCards: 2, RedCards: 0, Corners: 3 }
      }
    },
    dataSoccer: {
      Goal: true,
      Minutes: 67,
      Participant: 101
    }
  };

  assert.deepEqual(txLineScoreFromRecord(update), { home: 2, away: 1 });
  assert.deepEqual(txLineClockFromRecord(update, "pre"), {
    minute: 67,
    stoppage: 0,
    phase: "live",
    label: "67'"
  });
  assert.equal(txLineEventTypeFromRecord(update), "goal");
  assert.equal(txLineTeamSideFromRecord(update), "home");
  assert.equal(txLineUpdateIdFromRecord(update, "fallback"), "91");
});

test("maps participant scores and events when participant one is the away side", () => {
  const update = {
    participant1IsHome: false,
    participant1Id: 11,
    participant2Id: 22,
    participant: 11,
    statusSoccerId: "H1",
    scoreSoccer: {
      Participant1: { Total: { Goals: 1 } },
      Participant2: { Total: { Goals: 3 } }
    },
    dataSoccer: {
      YellowCard: true,
      Participant: 11,
      Minutes: 31
    }
  };

  assert.deepEqual(txLineScoreFromRecord(update), { home: 3, away: 1 });
  assert.equal(txLineEventTypeFromRecord(update), "yellow_card");
  assert.equal(txLineTeamSideFromRecord(update), "away");
});

test("preserves halftime and full-time phases from soccer status codes", () => {
  assert.equal(txLineClockFromRecord({ statusSoccerId: "HT", clock: { running: false, seconds: 2700 } }, "live").phase, "half");
  assert.equal(txLineClockFromRecord({ statusSoccerId: "F", clock: { running: false, seconds: 5400 } }, "live").phase, "full");
  assert.equal(txLineEventTypeFromRecord({ statusSoccerId: "F", action: "status" }), "full_time");
});
