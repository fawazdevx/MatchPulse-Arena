import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { createWalletNonce } from "@/services/auth/wallet-session";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const walletAddress = String(payload.walletAddress ?? "");

    if (!walletAddress) {
      return jsonError("Wallet address is required.");
    }

    return NextResponse.json({
      ok: true,
      ...(await createWalletNonce(walletAddress, new URL(request.url).origin))
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create wallet sign-in message.", 400);
  }
}

