import { NextResponse } from "next/server";
import { persistAnswer } from "@/services/storage/game-store";

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await persistAnswer({
    userId: String(payload.userId ?? "you"),
    predictionId: String(payload.predictionId),
    optionId: String(payload.optionId),
    answeredAtMs: Number(payload.answeredAtMs ?? 0),
    correct: Boolean(payload.correct),
    pointsAwarded: Number(payload.pointsAwarded ?? 0),
    txlineEventId: payload.txlineEventId ? String(payload.txlineEventId) : undefined,
    badgesUnlocked: Array.isArray(payload.badgesUnlocked) ? payload.badgesUnlocked : []
  });

  return NextResponse.json(result);
}
