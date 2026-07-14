import { NextResponse } from "next/server";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { jsonError } from "@/lib/server/http";
import { getSessionFromRequest } from "@/services/auth/wallet-session";
import { seedBadges, upsertMatchFixture } from "@/services/storage/game-store";
import { getTxLineAdapter, TxLineSetupError } from "@/services/txline";
import type { MatchFixture } from "@/lib/types";

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

function widgetEmbed(origin: string, inviteCode: string) {
  return `<iframe src="${origin}/widget/${inviteCode}" width="360" height="640"></iframe>`;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonError("Invalid JSON body.", 400);
  }

  const origin = new URL(request.url).origin;
  const session = await getSessionFromRequest(request).catch(() => null);
  const creatorName = sanitizeText(payload.creatorName, "Creator Cup");
  const handle = sanitizeText(payload.handle, "@creator", 32);
  const sponsor = sanitizeText(payload.sponsor, "brand partner", 48);
  const themeColor = /^#[0-9A-Fa-f]{6}$/.test(String(payload.themeColor ?? "")) ? String(payload.themeColor) : "#0B7A53";
  const inviteCode = inviteFrom(sanitizeText(payload.inviteCode, creatorName, 32));
  const requestedMatchId = sanitizeText(payload.matchId, "", 64);

  if (!session) {
    return jsonError("Connect and sign with a Solana wallet to create Creator Cup rooms.", 401);
  }

  if (!process.env.DATABASE_URL || !prismaAvailable) {
    return jsonError(
      !prismaAvailable
        ? "Prisma Client is not generated. Run npm run db:generate before persisting Creator Cup rooms."
        : "DATABASE_URL is not set. Configure Postgres before persisting Creator Cup rooms.",
      503
    );
  }

  try {
    const fixture = await resolveFixture(requestedMatchId);
    if (!fixture) {
      return NextResponse.json(
        {
          persisted: false,
          error: "No TxLINE fixture is available for this Creator Cup room. Select a live fixture after TxLINE credentials are configured."
        },
        { status: 422 }
      );
    }

    await seedBadges();
    await upsertMatchFixture(fixture);

    const room = await db.matchRoom.upsert({
      where: {
        inviteCode
      },
      update: {
        matchId: fixture.id,
        name: `${creatorName} Watch Room`,
        mode: "creator",
        themeColor,
        sponsor
      },
      create: {
        matchId: fixture.id,
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
      widgetUrl: `/widget/${inviteCode}`,
      widgetEmbed: widgetEmbed(origin, inviteCode),
      persisted: true,
      analytics: creatorRoom.analytics
    });
  } catch (error) {
    if (error instanceof TxLineSetupError) {
      return NextResponse.json(
        {
          persisted: false,
          error: "TxLINE credentials are required before Creator Cup rooms can be persisted.",
          missing: error.missing
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        persisted: false,
        error: error instanceof Error ? error.message : "Creator room persistence failed"
      },
      { status: 500 }
    );
  }
}

async function resolveFixture(matchId: string): Promise<MatchFixture | null> {
  const adapter = getTxLineAdapter();
  const fixtures = await adapter.getFixtures();

  if (!fixtures.length) {
    return null;
  }

  return fixtures.find((fixture) => fixture.id === matchId) ?? fixtures[0] ?? null;
}
