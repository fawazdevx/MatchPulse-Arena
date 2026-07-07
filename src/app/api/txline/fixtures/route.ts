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
        set: "Run /txline-activate, then configure TXLINE_JWT and TXLINE_API_TOKEN on the server."
      });
    }

    return jsonError(error instanceof Error ? error.message : "Could not load fixtures.", 502);
  }
}
