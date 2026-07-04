import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/services/auth/wallet-session";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request).catch(() => null);

  if (!session) {
    return NextResponse.json({
      ok: true,
      authenticated: false
    });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      id: session.user.id,
      walletAddress: session.user.walletAddress,
      name: session.user.name,
      avatar: session.user.avatar,
      points: session.user.points,
      streak: session.user.streak,
      bestStreak: session.user.bestStreak,
        badges: session.user.badgeUnlocks.map((badge: { badgeId: string }) => badge.badgeId)
    },
    expiresAt: session.expiresAt
  });
}
