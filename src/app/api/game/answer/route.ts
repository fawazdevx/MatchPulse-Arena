import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { persistAnswer } from "@/services/storage/game-store";
import { getSessionFromRequest } from "@/services/auth/wallet-session";
import type { MatchEvent, PredictionCard } from "@/lib/types";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonError("Invalid JSON body.", 400);
  }

  const session = await getSessionFromRequest(request).catch(() => null);

  if (!session) {
    return jsonError("Connect and sign with a Solana wallet before submitting prediction answers.", 401);
  }

  try {
    const result = await persistAnswer({
      userId: session.user.id,
      predictionId: String(payload.predictionId),
      optionId: String(payload.optionId),
      answeredAtMs: Number(payload.answeredAtMs ?? 0),
      txlineEventId: payload.txlineEventId ? String(payload.txlineEventId) : undefined,
      roomId: payload.roomId ? String(payload.roomId) : undefined,
      prediction: payload.prediction && typeof payload.prediction === "object" ? (payload.prediction as PredictionCard) : undefined,
      resolvingEvent: payload.resolvingEvent && typeof payload.resolvingEvent === "object" ? (payload.resolvingEvent as MatchEvent) : undefined,
      fan: payload.fan && typeof payload.fan === "object" ? payload.fan : undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prediction answer could not be persisted.", 503);
  }
}
