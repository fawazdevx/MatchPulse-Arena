import type { BadgeId, LeaderboardUser, MatchFixture, MatchSnapshot } from "@/lib/types";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { getTxLineAdapter } from "@/services/txline";

const db = prisma as any;

export interface PublicCreatorRoom {
  inviteCode: string;
  creatorName: string;
  handle: string;
  avatar: string;
  themeColor: string;
  sponsor?: string;
  fixture: MatchFixture;
  snapshot: MatchSnapshot | null;
  leaderboard: LeaderboardUser[];
}

export async function getPublicCreatorRoom(inviteCode: string): Promise<PublicCreatorRoom | null> {
  if (!process.env.DATABASE_URL || !prismaAvailable) {
    return null;
  }

  const normalized = inviteCode.toUpperCase();
  const room = await db.matchRoom
    .findFirst({
      where: {
        OR: [{ inviteCode: normalized }, { inviteCode }]
      },
      include: {
        match: true,
        creatorRoom: true,
        leaderboard: {
          take: 3,
          orderBy: {
            points: "desc"
          },
          include: {
            user: {
              include: {
                badgeUnlocks: true
              }
            }
          }
        }
      }
    })
    .catch(() => null);

  if (!room?.creatorRoom || !room.match) {
    return null;
  }

  const fixture = fixtureFromRoom(room);
  const snapshot = await getTxLineAdapter()
    .getSnapshot(room.matchId)
    .catch(() => null);

  return {
    inviteCode: room.inviteCode,
    creatorName: room.creatorRoom.creatorName,
    handle: room.creatorRoom.handle,
    avatar: room.creatorRoom.avatar,
    themeColor: room.themeColor,
    sponsor: room.sponsor ?? undefined,
    fixture: snapshot?.fixture ?? fixture,
    snapshot,
    leaderboard: room.leaderboard.map((entry: any, index: number) => ({
      id: entry.user.id,
      name: entry.user.name,
      avatar: entry.user.avatar,
      points: entry.points,
      streak: entry.streak,
      bestStreak: entry.bestStreak,
      badges: entry.user.badgeUnlocks.map((unlock: { badgeId: string }) => unlock.badgeId as BadgeId),
      trend: index < 3 ? "up" : "same"
    }))
  };
}

function fixtureFromRoom(room: any): MatchFixture {
  return {
    id: room.match.id,
    competition: room.match.competition,
    stage: room.match.stage,
    venue: room.match.venue,
    kickoffIso: room.match.kickoffIso.toISOString(),
    status: room.match.phase,
    featured: false,
    home: {
      id: "home",
      name: room.match.homeName,
      shortName: room.match.homeShort,
      color: room.match.homeColor,
      crest: room.match.homeShort.slice(0, 3).toUpperCase(),
      record: "TxLINE"
    },
    away: {
      id: "away",
      name: room.match.awayName,
      shortName: room.match.awayShort,
      color: room.match.awayColor,
      crest: room.match.awayShort.slice(0, 3).toUpperCase(),
      record: "TxLINE"
    },
    creatorRoom: {
      creatorName: room.creatorRoom.creatorName,
      handle: room.creatorRoom.handle,
      avatar: room.creatorRoom.avatar,
      themeColor: room.themeColor,
      sponsor: room.sponsor ?? "brand partner",
      inviteCode: room.inviteCode
    }
  };
}
