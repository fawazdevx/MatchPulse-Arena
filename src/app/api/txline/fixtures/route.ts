import { NextResponse } from "next/server";
import { getTxLineReadiness } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { getTxLineAdapter, TxLineSetupError } from "@/services/txline";
import type { MatchFixture } from "@/lib/types";
import { getCachedFixturesFromDb, upsertMatchFixture } from "@/services/storage/game-store";
import { rememberRuntimeFixtures } from "@/services/txline/runtime-cache";

let lastFixtureResponse: {
  fixtures: MatchFixture[];
  generatedAt: string;
  provider: string;
  adapter: string;
  network: string;
  liveReady: boolean;
} | null = null;

export async function GET() {
  try {
    const fixtures = await getTxLineAdapter().getFixtures();
    const readiness = getTxLineReadiness();
    rememberRuntimeFixtures(fixtures);
    const featuredFixture = fixtures.find((fixture) => fixture.featured) ?? fixtures[0];
    if (featuredFixture) {
      void upsertMatchFixture(featuredFixture).catch(() => undefined);
    }
    const body = {
      fixtures,
      generatedAt: new Date().toISOString(),
      provider: readiness.provider,
      adapter: readiness.adapter,
      network: readiness.network,
      liveReady: readiness.ready
    };

    lastFixtureResponse = body;
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof TxLineSetupError) {
      return jsonError("TxLINE live mode needs server credentials before fixtures can load.", 503, {
        missing: error.missing,
        set: "Run /txline-activate, then configure TXLINE_JWT and TXLINE_API_TOKEN on the server."
      });
    }

    if (lastFixtureResponse) {
      return NextResponse.json({
        ...lastFixtureResponse,
        dataQuality: "delayed",
        notice: error instanceof Error ? error.message : "TxLINE fixtures are temporarily delayed."
      });
    }

    const cachedFixtures = await getCachedFixturesFromDb();
    if (cachedFixtures.length) {
      const readiness = getTxLineReadiness();
      rememberRuntimeFixtures(cachedFixtures);
      return NextResponse.json({
        fixtures: cachedFixtures,
        generatedAt: new Date().toISOString(),
        provider: readiness.provider,
        adapter: readiness.adapter,
        network: readiness.network,
        liveReady: readiness.ready,
        dataQuality: "delayed",
        notice: error instanceof Error ? error.message : "TxLINE fixtures are temporarily delayed."
      });
    }

    return jsonError(error instanceof Error ? error.message : "Could not load fixtures.", 502);
  }
}
