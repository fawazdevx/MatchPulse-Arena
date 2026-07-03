import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.json();
  const creatorName = String(payload.creatorName ?? "Creator Cup");
  const inviteCode = creatorName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);

  return NextResponse.json({
    id: `creator-${Date.now()}`,
    creatorName,
    inviteCode: inviteCode || "CREATOR-CUP",
    inviteUrl: `/rooms/${inviteCode || "CREATOR-CUP"}`,
    widgetEmbed: `<iframe src="https://matchpulse.arena/widget/${inviteCode || "CREATOR-CUP"}" width="360" height="640"></iframe>`,
    persisted: false,
    message: "Demo room configured. Connect Postgres to persist Creator Cup rooms."
  });
}
