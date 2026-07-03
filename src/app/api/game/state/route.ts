import { NextResponse } from "next/server";
import { getRoomState } from "@/services/storage/game-store";

export async function GET() {
  return NextResponse.json(await getRoomState());
}
