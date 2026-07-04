import { NextResponse } from "next/server";
import { revokeSessionFromRequest, SESSION_COOKIE } from "@/services/auth/wallet-session";

export async function POST(request: Request) {
  await revokeSessionFromRequest(request);

  const response = NextResponse.json({
    ok: true
  });

  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}

