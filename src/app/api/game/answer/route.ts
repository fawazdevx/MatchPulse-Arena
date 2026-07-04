import { NextResponse } from "next/server";
import { persistAnswer } from "@/services/storage/game-store";
import { getSessionFromRequest } from "@/services/auth/wallet-session";

export async function POST(request: Request) {
  const payload = await request.json();
  const session = await getSessionFromRequest(request).catch(() => null);
  const result = await persistAnswer({
    userId: session?.user.id ?? String(payload.userId ?? "you"),
    predictionId: String(payload.predictionId),
    optionId: String(payload.optionId),
    answeredAtMs: Number(payload.answeredAtMs ?? 0),
    correct: Boolean(payload.correct),
    pointsAwarded: Number(payload.pointsAwarded ?? 0),
    txlineEventId: payload.txlineEventId ? String(payload.txlineEventId) : undefined,
    badgesUnlocked: Array.isArray(payload.badgesUnlocked) ? payload.badgesUnlocked : [],
    roomId: payload.roomId ? String(payload.roomId) : undefined
  });

  return NextResponse.json(result);
}
