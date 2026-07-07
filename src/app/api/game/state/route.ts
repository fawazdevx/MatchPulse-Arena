import { NextResponse } from "next/server";
import { getRoomState } from "@/services/storage/game-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getRoomState());
}
