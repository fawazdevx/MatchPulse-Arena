import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { getTxLineAdapter, TxLineSetupError } from "@/services/txline";

export async function GET(_request: Request, context: { params: { matchId: string } }) {
  try {
    const snapshot = await getTxLineAdapter().getSnapshot(context.params.matchId);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof TxLineSetupError) {
      return jsonError("TxLINE live mode needs server credentials before snapshots can load.", 503, {
        missing: error.missing,
        set: "Run /txline-activate, then configure TXLINE_JWT and TXLINE_API_TOKEN on the server."
      });
    }

    return jsonError(error instanceof Error ? error.message : "Could not load match snapshot.", 502);
  }
}
