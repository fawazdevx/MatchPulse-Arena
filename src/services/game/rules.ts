import type { BadgeId, MatchEvent, PredictionKind } from "@/lib/types";

export interface ScorePredictionInput {
  correct: boolean;
  nextStreak: number;
  answeredAtMs: number;
  eventImpact?: MatchEvent["impact"];
  eventMinute?: number;
}

export interface BadgeUnlockInput {
  currentBadges: BadgeId[];
  correct: boolean;
  previousCorrect: number;
  nextStreak: number;
  kind: PredictionKind;
  oddsCorrect: number;
  momentumCorrect: number;
  event?: {
    type: string;
    minute: number;
  };
}

export function scorePredictionResult(input: ScorePredictionInput) {
  if (!input.correct) return 0;

  const fastBonus = input.answeredAtMs > 0 && input.answeredAtMs <= 5000 ? 25 : 0;
  const rareBonus =
    input.eventImpact === "high"
      ? 100
      : input.eventMinute && input.eventMinute >= 80
        ? 75
        : 0;

  return 100 + input.nextStreak * 10 + fastBonus + rareBonus;
}

export function getBadgeUnlocks(input: BadgeUnlockInput) {
  if (!input.correct) return [];

  const earned = new Set<BadgeId>();

  if (input.previousCorrect === 0) earned.add("first-read");
  if (input.nextStreak >= 3) earned.add("hat-trick");
  if (input.nextStreak >= 5) earned.add("five-star-fan");
  if (input.nextStreak >= 10) earned.add("ice-cold");
  if ((input.kind === "odds_shift" || input.kind === "post_event") && input.oddsCorrect + 1 >= 5) {
    earned.add("market-whisperer");
  }
  if (input.kind === "momentum" && input.momentumCorrect + 1 >= 10) earned.add("momentum-master");
  if (input.event?.type === "goal") earned.add("goal-reader");
  if (input.event?.type === "red_card") earned.add("red-card-prophet");
  if ((input.event?.minute ?? 0) >= 80) earned.add("late-drama");
  if (input.nextStreak >= 4) earned.add("perfect-half");

  return [...earned].filter((badge) => !input.currentBadges.includes(badge));
}
