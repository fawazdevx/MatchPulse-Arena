import { NextResponse } from "next/server";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { getSessionFromRequest } from "@/services/auth/wallet-session";
import { seedGameData } from "@/services/storage/game-store";
import { fixtures } from "@/services/txline/mock-data";

const db = prisma as any;

function sanitizeText(value: unknown, fallback: string, maxLength = 80) {
  return String(value ?? fallback)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength) || fallback;
}

function inviteFrom(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "CREATOR-CUP";
}

function widgetEmbed(inviteCode: string) {
  return `<iframe src="https://matchpulse.arena/widget/${inviteCode}" width="360" height="640"></iframe>`;
}

export async function POST(request: Request) {
  const payload = await request.json();
  const session = await getSessionFromRequest(request).catch(() => null);
  const creatorName = sanitizeText(payload.creatorName, "Creator Cup");
  const handle = sanitizeText(payload.handle, "@creator", 32);
  const sponsor = sanitizeText(payload.sponsor, "brand partner", 48);
  const themeColor = /^#[0-9A-Fa-f]{6}$/.test(String(payload.themeColor ?? "")) ? String(payload.themeColor) : "#0B7A53";
  const inviteCode = inviteFrom(sanitizeText(payload.inviteCode, creatorName, 32));
  const matchId = sanitizeText(payload.matchId, fixtures[0].id, 64);

  if (!process.env.DATABASE_URL || !prismaAvailable || !session) {
    return NextResponse.json({
      id: `creator-${Date.now()}`,
      creatorName,
      handle,
      sponsor,
      themeColor,
      inviteCode,
      inviteUrl: `/rooms/${inviteCode}`,
      widgetEmbed: widgetEmbed(inviteCode),
      persisted: false,
      requiresWallet: !session,
      message: !session
        ? "Connect and sign with a Solana wallet to persist Creator Cup rooms."
        : !prismaAvailable
          ? "Prisma Client is not generated. Creator Cup is running in local demo mode."
        : "DATABASE_URL is not set. Creator Cup is running in local demo mode."
    });
  }

  try {
    await seedGameData();

    const room = await db.matchRoom.upsert({
      where: {
        inviteCode
      },
      update: {
        matchId,
        name: `${creatorName} Watch Room`,
        mode: "creator",
        themeColor,
        sponsor
      },
      create: {
        matchId,
        name: `${creatorName} Watch Room`,
        mode: "creator",
        inviteCode,
        themeColor,
        sponsor
      }
    });

    const creatorRoom = await db.creatorRoom.upsert({
      where: {
        roomId: room.id
      },
      update: {
        creatorId: session.user.id,
        creatorName,
        handle,
        avatar: creatorName.slice(0, 2).toUpperCase(),
        widgetSlug: inviteCode.toLowerCase(),
        analytics: {
          activeFans: 0,
          totalPredictions: 0,
          averageRetentionMinutes: 0
        }
      },
      create: {
        roomId: room.id,
        creatorId: session.user.id,
        creatorName,
        handle,
        avatar: creatorName.slice(0, 2).toUpperCase(),
        widgetSlug: inviteCode.toLowerCase(),
        analytics: {
          activeFans: 0,
          totalPredictions: 0,
          averageRetentionMinutes: 0
        }
      }
    });

    await db.userBadge.upsert({
      where: {
        userId_badgeId: {
          userId: session.user.id,
          badgeId: "room-captain"
        }
      },
      update: {},
      create: {
        userId: session.user.id,
        badgeId: "room-captain",
        reason: `Created Creator Cup room ${inviteCode}`
      }
    });

    return NextResponse.json({
      id: creatorRoom.id,
      creatorName,
      handle,
      sponsor,
      themeColor,
      inviteCode,
      inviteUrl: `/rooms/${inviteCode}`,
      widgetEmbed: widgetEmbed(inviteCode),
      persisted: true,
      analytics: creatorRoom.analytics
    });
  } catch (error) {
    return NextResponse.json(
      {
        persisted: false,
        error: error instanceof Error ? error.message : "Creator room persistence failed"
      },
      { status: 500 }
    );
  }
}
