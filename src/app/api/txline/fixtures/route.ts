import { NextResponse } from "next/server";
import { getTxLineReadiness } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { getTxLineAdapter, TxLineSetupError } from "@/services/txline";

export async function GET() {
  try {
    const fixtures = await getTxLineAdapter().getFixtures();
    const readiness = getTxLineReadiness();

    return NextResponse.json({
      fixtures,
      generatedAt: new Date().toISOString(),
      provider: readiness.provider,
      adapter: readiness.adapter,
      network: readiness.network,
      liveReady: readiness.ready
    });
  } catch (error) {
    if (error instanceof TxLineSetupError) {
      return jsonError("TxLINE live mode needs server credentials before fixtures can load.", 503, {
        missing: error.missing,
        set: "Use TXLINE_ADAPTER=mock for replay mode or configure TXLINE_JWT and TXLINE_API_TOKEN for live mode."
      });
    }

    return jsonError(error instanceof Error ? error.message : "Could not load fixtures.", 502);
  }
}
