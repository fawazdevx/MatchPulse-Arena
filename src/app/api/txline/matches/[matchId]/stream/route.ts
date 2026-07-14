import { getTxLineAdapter } from "@/services/txline";
import { getTxLineReadiness } from "@/lib/server/env";
import { TxLineSetupError } from "@/services/txline";
import type { MarketSentiment, MatchFixture, MatchSnapshot, PredictionCard, ReplayTick, TxLineAdapter } from "@/lib/types";
import { createPredictionFromTick, createSnapshotTick, resolvePredictionFromTick } from "@/services/game/prediction-engine";
import { getCachedFixturesFromDb, persistRoomUpdate } from "@/services/storage/game-store";
import { getRuntimeFixture } from "@/services/txline/runtime-cache";

const encoder = new TextEncoder();
const livePollMs = 8_000;

// Vercel caps serverless function duration (60s Hobby, up to 300s Pro). We tell
// Vercel to allow the longest window it can, then close the stream gracefully a
// few seconds BEFORE that cap so the client receives a clean `complete` event and
// reconnects, instead of the platform killing the socket mid-tick.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const streamSoftDeadlineMs = (maxDuration - 5) * 1_000;

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

async function* liveSnapshotTicks(adapter: TxLineAdapter, matchId: string, signal: AbortSignal): AsyncGenerator<ReplayTick> {
  let sequence = 0;
  let activePrediction: PredictionCard | null = null;
  let lastSignature = "";
  let lastSnapshot: MatchSnapshot | null = null;
  const startedAt = Date.now();

  while (!signal.aborted && Date.now() - startedAt < streamSoftDeadlineMs) {
    sequence += 1;
    let snapshot: MatchSnapshot;

    try {
      snapshot = await enrichSnapshotFixture(await adapter.getSnapshot(matchId));
      lastSnapshot = snapshot;
    } catch (error) {
      const fixture = lastSnapshot?.fixture ?? (await adapter.getFixtures().catch(() => [])).find((item) => item.id === matchId);
      yield delayedTxLineTick(matchId, fixture, sequence, lastSnapshot, error);
      await sleep(livePollMs, signal);
      continue;
    }

    const tick = createSnapshotTick(snapshot, sequence);
    const signature = `${tick.txlineUpdateId}:${tick.score?.home}-${tick.score?.away}:${tick.sentiment.sourceUpdateId}:${snapshot.clock.label}`;
    const resolvedPrediction = activePrediction ? resolvePredictionFromTick(activePrediction, tick) : undefined;
    const prediction = createPredictionFromTick(matchId, snapshot.fixture, tick);
    const roomTick: ReplayTick = {
      ...tick,
      dataQuality: "live",
      prediction,
      resolvedPrediction
    };

    if (signature !== lastSignature || sequence === 1) {
      await persistRoomUpdate(snapshot.fixture, roomTick, prediction, resolvedPrediction).catch(() => undefined);
      yield roomTick;
      lastSignature = signature;
      activePrediction = prediction;
    } else {
      const heartbeatTick: ReplayTick = {
        ...tick,
        dataQuality: "live",
        event: {
          ...tick.event,
          id: `heartbeat-${matchId}-${sequence}`,
          type: "momentum",
          title: "Live check received",
          description: "TxLINE snapshot checked. Score and match pulse are holding steady.",
          impact: "low"
        },
        txlineUpdateId: tick.txlineUpdateId,
        snapshotGeneratedAt: tick.snapshotGeneratedAt,
        score: tick.score,
        sentiment: {
          ...tick.sentiment,
          trend: "neutral",
          delta: 0,
          label: "No major pulse movement"
        }
      };
      const heartbeatPrediction = createPredictionFromTick(matchId, snapshot.fixture, heartbeatTick);
      const heartbeatResolvedPrediction = activePrediction ? resolvePredictionFromTick(activePrediction, heartbeatTick) : undefined;
      const heartbeatRoomTick: ReplayTick = {
        ...heartbeatTick,
        prediction: heartbeatPrediction,
        resolvedPrediction: heartbeatResolvedPrediction
      };

      await persistRoomUpdate(snapshot.fixture, heartbeatRoomTick, heartbeatPrediction, heartbeatResolvedPrediction).catch(() => undefined);
      yield heartbeatRoomTick;
      activePrediction = heartbeatPrediction;
    }

    await sleep(livePollMs, signal);
  }
}

function delayedTxLineTick(
  matchId: string,
  fixture: MatchFixture | undefined,
  sequence: number,
  lastSnapshot: MatchSnapshot | null,
  error: unknown
): ReplayTick {
  const phase = fixture?.status ?? "live";
  const clock = lastSnapshot?.clock ?? {
    minute: 0,
    stoppage: 0,
    phase,
    label: phase === "pre" ? "Pre-match" : phase === "full" ? "Full time" : "Live"
  };
  const sentiment = lastSnapshot?.sentiment ?? delayedSentiment(fixture);
  const reason = error instanceof Error ? error.message.replace(/^TxLINE /, "") : "Live snapshot is temporarily unavailable.";

  return {
    atSecond: sequence,
    dataQuality: "delayed",
    event: {
      id: `unavailable-${matchId}-${sequence}`,
      minute: clock.minute,
      stoppage: clock.stoppage,
      type: "momentum",
      title: "TxLINE live check delayed",
      description: `${reason} The room is still connected and will retry automatically.`,
      impact: "low",
      sentimentAfter: sentiment
    },
    txlineUpdateId: `unavailable-${matchId}-${sequence}`,
    snapshotGeneratedAt: lastSnapshot?.generatedAt,
    score: lastSnapshot?.score,
    sentiment
  };
}

function delayedSentiment(fixture?: MatchFixture): MarketSentiment {
  return {
    home: 33,
    draw: 34,
    away: 33,
    trend: "neutral",
    delta: 0,
    label: fixture ? `Waiting for TxLINE sentiment for ${fixture.home.shortName} vs ${fixture.away.shortName}` : "Waiting for TxLINE live sentiment",
    sourceUpdateId: "delayed"
  };
}

async function enrichSnapshotFixture(snapshot: MatchSnapshot): Promise<MatchSnapshot> {
  if (!usesGenericTeamNames(snapshot.fixture)) {
    return snapshot;
  }

  const fixture = getRuntimeFixture(snapshot.fixture.id) ?? (await getCachedFixturesFromDb()).find((item: MatchFixture) => item.id === snapshot.fixture.id);
  if (!fixture) {
    return snapshot;
  }

  return {
    ...snapshot,
    fixture: {
      ...fixture,
      status: snapshot.fixture.status
    }
  };
}

function usesGenericTeamNames(fixture: MatchFixture) {
  return ["HT", "HOME", "TBD"].includes(fixture.home.shortName.toUpperCase()) || ["AT", "AWAY", "TBD"].includes(fixture.away.shortName.toUpperCase());
}

async function* replayTicks(adapter: TxLineAdapter, matchId: string): AsyncGenerator<ReplayTick> {
  let activePrediction: PredictionCard | null = null;
  const snapshot = await adapter.getSnapshot(matchId).catch(() => null);
  const fixture = snapshot?.fixture;

  for await (const tick of adapter.getReplayTicks(matchId)) {
    if (!fixture) {
      yield tick;
      continue;
    }

    const prediction = tick.prediction ?? createPredictionFromTick(matchId, fixture, tick);
    const resolvedPrediction = activePrediction ? resolvePredictionFromTick(activePrediction, tick) : tick.resolvedPrediction;
    activePrediction = prediction;

    const roomTick = {
      ...tick,
      prediction,
      resolvedPrediction
    };

    await persistRoomUpdate(fixture, roomTick, prediction, resolvedPrediction).catch(() => undefined);
    yield roomTick;
  }
}

export async function GET(request: Request, context: { params: { matchId: string } }) {
  const readiness = getTxLineReadiness();
  const mode = new URL(request.url).searchParams.get("mode") ?? "live";

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeEvent("connected", {
          mode,
          provider: readiness.provider,
          adapter: readiness.adapter,
          network: readiness.network,
          liveReady: readiness.ready,
          connectedAt: new Date().toISOString()
        })
      );

      try {
        const adapter = getTxLineAdapter();
        const tickStream = mode === "replay" ? replayTicks(adapter, context.params.matchId) : liveSnapshotTicks(adapter, context.params.matchId, request.signal);

        for await (const tick of tickStream) {
          controller.enqueue(encodeEvent("tick", tick));
        }

        controller.enqueue(
          encodeEvent("complete", {
            completedAt: new Date().toISOString()
          })
        );
      } catch (error) {
        controller.enqueue(
          encodeEvent("error", {
            message:
              error instanceof TxLineSetupError
                ? "TxLINE live mode needs server credentials. Configure TXLINE_JWT and TXLINE_API_TOKEN on the server."
                : error instanceof Error
                  ? error.message
                  : "Stream failed"
          })
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
