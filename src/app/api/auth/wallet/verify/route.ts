import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { SESSION_COOKIE, verifyWalletSignature } from "@/services/auth/wallet-session";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const sessionId = String(payload.sessionId ?? "");
    const walletAddress = String(payload.walletAddress ?? "");
    const signature = String(payload.signature ?? "");

    if (!sessionId || !walletAddress || !signature) {
      return jsonError("Session, wallet address, and signature are required.");
    }

    const { session, sessionToken } = await verifyWalletSignature({
      sessionId,
      walletAddress,
      signature
    });
    const response = NextResponse.json({
      ok: true,
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

    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt
    });

    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Wallet signature verification failed.", 401);
  }
}
