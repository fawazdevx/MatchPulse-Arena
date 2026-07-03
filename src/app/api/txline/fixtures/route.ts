import { NextResponse } from "next/server";
import { getTxLineAdapter } from "@/services/txline";

export async function GET() {
  const fixtures = await getTxLineAdapter().getFixtures();
  return NextResponse.json({
    fixtures,
    generatedAt: new Date().toISOString(),
    provider: process.env.TXLINE_GUEST_JWT && process.env.TXLINE_API_TOKEN ? "txline" : "mock-txline"
  });
}
