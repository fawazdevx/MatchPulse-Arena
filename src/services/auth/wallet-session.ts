import crypto from "crypto";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { parseCookie } from "@/lib/server/http";

export const SESSION_COOKIE = "matchpulse_session";
const db = prisma as any;

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const NONCE_TTL_MS = 1000 * 60 * 10;
const memoryUsers = new Map<string, any>();
const memorySessions = new Map<string, any>();
const memoryTokens = new Map<string, string>();

function nowPlus(ms: number) {
  return new Date(Date.now() + ms);
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function avatarFromWallet(walletAddress: string) {
  return walletAddress.slice(0, 2).toUpperCase();
}

function nameFromWallet(walletAddress: string) {
  return `Fan ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

export function buildSignInMessage(walletAddress: string, nonce: string, issuedAt = new Date()) {
  return [
    "MatchPulse Arena wants you to sign in with your Solana wallet.",
    "",
    "This signature proves wallet ownership. It does not authorize a transaction, payment, wager, or token transfer.",
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`
  ].join("\n");
}

export async function createWalletNonce(walletAddress: string) {
  const normalizedWallet = new PublicKey(walletAddress).toBase58();
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const message = buildSignInMessage(normalizedWallet, nonce, issuedAt);

  if (!process.env.DATABASE_URL || !prismaAvailable) {
    const user =
      memoryUsers.get(normalizedWallet) ??
      {
        id: `wallet-${normalizedWallet}`,
        walletAddress: normalizedWallet,
        name: nameFromWallet(normalizedWallet),
        avatar: avatarFromWallet(normalizedWallet),
        points: 0,
        streak: 0,
        bestStreak: 0,
        badgeUnlocks: []
      };
    const session = {
      id: crypto.randomBytes(12).toString("hex"),
      userId: user.id,
      walletAddress: normalizedWallet,
      nonce,
      message,
      expiresAt: nowPlus(NONCE_TTL_MS),
      user
    };

    memoryUsers.set(normalizedWallet, user);
    memorySessions.set(session.id, session);

    return {
      sessionId: session.id,
      walletAddress: normalizedWallet,
      message,
      expiresAt: session.expiresAt
    };
  }

  const user = await db.user.upsert({
    where: {
      walletAddress: normalizedWallet
    },
    update: {},
    create: {
      walletAddress: normalizedWallet,
      name: nameFromWallet(normalizedWallet),
      avatar: avatarFromWallet(normalizedWallet)
    }
  });

  const session = await db.walletSession.create({
    data: {
      userId: user.id,
      walletAddress: normalizedWallet,
      nonce,
      message,
      expiresAt: nowPlus(NONCE_TTL_MS)
    }
  });

  return {
    sessionId: session.id,
    walletAddress: normalizedWallet,
    message,
    expiresAt: session.expiresAt
  };
}

export async function verifyWalletSignature(input: {
  sessionId: string;
  walletAddress: string;
  signature: string;
}) {
  const normalizedWallet = new PublicKey(input.walletAddress).toBase58();
  if (!process.env.DATABASE_URL || !prismaAvailable) {
    const session = memorySessions.get(input.sessionId);
    if (!session || session.walletAddress !== normalizedWallet || session.expiresAt.getTime() < Date.now()) {
      throw new Error("Wallet session was not found.");
    }

    const publicKey = new PublicKey(normalizedWallet);
    const signature = Buffer.from(input.signature, "base64");
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(session.message),
      new Uint8Array(signature),
      publicKey.toBytes()
    );

    if (!verified) {
      throw new Error("Wallet signature could not be verified.");
    }

    const sessionToken = createSessionToken();
    session.signature = input.signature;
    session.verifiedAt = new Date();
    session.expiresAt = nowPlus(SESSION_TTL_MS);
    memoryTokens.set(hashToken(sessionToken), session.id);

    return {
      session,
      sessionToken
    };
  }

  const session = await db.walletSession.findUnique({
    where: {
      id: input.sessionId
    },
    include: {
      user: true
    }
  });

  if (!session || session.walletAddress !== normalizedWallet || session.revokedAt) {
    throw new Error("Wallet session was not found.");
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error("Sign-in message expired. Request a new wallet sign-in.");
  }

  const publicKey = new PublicKey(normalizedWallet);
  const signature = Buffer.from(input.signature, "base64");
  const verified = nacl.sign.detached.verify(
    new TextEncoder().encode(session.message),
    new Uint8Array(signature),
    publicKey.toBytes()
  );

  if (!verified) {
    throw new Error("Wallet signature could not be verified.");
  }

  const sessionToken = createSessionToken();
  const verifiedSession = await db.walletSession.update({
    where: {
      id: session.id
    },
    data: {
      signature: input.signature,
      sessionTokenHash: hashToken(sessionToken),
      verifiedAt: new Date(),
      expiresAt: nowPlus(SESSION_TTL_MS)
    },
    include: {
      user: {
        include: {
          badgeUnlocks: true
        }
      }
    }
  });

  return {
    session: verifiedSession,
    sessionToken
  };
}

export async function getSessionFromRequest(request: Request) {
  const sessionToken = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!sessionToken) return null;

  if (!process.env.DATABASE_URL || !prismaAvailable) {
    const sessionId = memoryTokens.get(hashToken(sessionToken));
    const session = sessionId ? memorySessions.get(sessionId) : null;
    if (!session || !session.verifiedAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return session;
  }

  const session = await db.walletSession.findUnique({
    where: {
      sessionTokenHash: hashToken(sessionToken)
    },
    include: {
      user: {
        include: {
      badgeUnlocks: true
        }
      }
    }
  });

  if (!session || !session.verifiedAt || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return session;
}

export async function revokeSessionFromRequest(request: Request) {
  const sessionToken = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!sessionToken) return;

  if (!process.env.DATABASE_URL || !prismaAvailable) {
    const tokenHash = hashToken(sessionToken);
    const sessionId = memoryTokens.get(tokenHash);
    if (sessionId) {
      const session = memorySessions.get(sessionId);
      if (session) session.revokedAt = new Date();
    }
    memoryTokens.delete(tokenHash);
    return;
  }

  await db.walletSession
    .update({
      where: {
        sessionTokenHash: hashToken(sessionToken)
      },
      data: {
        revokedAt: new Date()
      }
    })
    .catch(() => undefined);
}
