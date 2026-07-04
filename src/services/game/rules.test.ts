import test from "node:test";
import assert from "node:assert/strict";
import { getBadgeUnlocks, scorePredictionResult } from "./rules.ts";

test("scorePredictionResult applies base, streak, fast-answer, and rare-event bonuses", () => {
  const points = scorePredictionResult({
    correct: true,
    nextStreak: 3,
    answeredAtMs: 4200,
    eventImpact: "high",
    eventMinute: 82
  });

  assert.equal(points, 255);
});

test("scorePredictionResult awards no points for a wrong prediction", () => {
  const points = scorePredictionResult({
    correct: false,
    nextStreak: 0,
    answeredAtMs: 1200,
    eventImpact: "high",
    eventMinute: 90
  });

  assert.equal(points, 0);
});

test("getBadgeUnlocks returns only newly earned badges for a correct read", () => {
  const badges = getBadgeUnlocks({
    currentBadges: ["first-read"],
    correct: true,
    previousCorrect: 3,
    nextStreak: 4,
    kind: "next_event",
    oddsCorrect: 0,
    momentumCorrect: 0,
    event: {
      type: "goal",
      minute: 84
    }
  });

  assert.deepEqual(badges.sort(), ["goal-reader", "hat-trick", "late-drama", "perfect-half"].sort());
});
