import { NextResponse } from "next/server";
import { getTxLineAdapter } from "@/services/txline";

export async function GET(_request: Request, context: { params: { matchId: string } }) {
  const snapshot = await getTxLineAdapter().getSnapshot(context.params.matchId);
  return NextResponse.json(snapshot);
}
