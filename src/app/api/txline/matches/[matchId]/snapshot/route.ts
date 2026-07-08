import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { getTxLineAdapter, TxLineSetupError } from "@/services/txline";
import type { MatchFixture, MatchSnapshot } from "@/lib/types";
import { getCachedFixturesFromDb, getCachedSnapshotFromDb, upsertMatchFixture } from "@/services/storage/game-store";
import { getRuntimeFixture } from "@/services/txline/runtime-cache";

const lastSnapshots = new Map<string, MatchSnapshot>();

export async function GET(_request: Request, context: { params: { matchId: string } }) {
  try {
    const snapshot = await enrichSnapshotFixture(await getTxLineAdapter().getSnapshot(context.params.matchId));
    lastSnapshots.set(context.params.matchId, snapshot);
    await upsertMatchFixture(snapshot.fixture).catch(() => undefined);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof TxLineSetupError) {
      return jsonError("TxLINE live mode needs server credentials before snapshots can load.", 503, {
        missing: error.missing,
        set: "Run /txline-activate, then configure TXLINE_JWT and TXLINE_API_TOKEN on the server."
      });
    }

    const cached = lastSnapshots.get(context.params.matchId);
    if (cached) {
      return NextResponse.json({
        ...cached,
        dataQuality: "delayed",
        notice: error instanceof Error ? error.message : "TxLINE match snapshot is temporarily delayed."
      });
    }

    const cachedFromDb = await getCachedSnapshotFromDb(
      context.params.matchId,
      error instanceof Error ? error.message : "TxLINE match snapshot is temporarily delayed."
    );
    if (cachedFromDb) {
      return NextResponse.json(cachedFromDb);
    }

    return jsonError(error instanceof Error ? error.message : "Could not load match snapshot.", 502);
  }
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
