import { NextResponse } from "next/server";
import { getRoomState } from "@/services/storage/game-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId") ?? undefined;
  return NextResponse.json(await getRoomState(roomId));
}
