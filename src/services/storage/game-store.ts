import type { BadgeId, LeaderboardUser } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { leaderboard } from "@/services/txline/mock-data";

export interface PersistAnswerInput {
  userId: string;
  predictionId: string;
  optionId: string;
  answeredAtMs: number;
  correct: boolean;
  pointsAwarded: number;
  txlineEventId?: string;
  badgesUnlocked: BadgeId[];
}

export async function persistAnswer(input: PersistAnswerInput) {
  if (!process.env.DATABASE_URL) {
    return {
      persisted: false,
      reason: "DATABASE_URL not set; using in-memory demo state"
    };
  }

  try {
    await prisma.predictionAnswer.upsert({
      where: {
        predictionId_userId: {
          predictionId: input.predictionId,
          userId: input.userId
        }
      },
      update: {
        optionId: input.optionId,
        answeredAtMs: input.answeredAtMs,
        correct: input.correct,
        pointsAwarded: input.pointsAwarded,
        txlineEventId: input.txlineEventId
      },
      create: {
        predictionId: input.predictionId,
        userId: input.userId,
        optionId: input.optionId,
        answeredAtMs: input.answeredAtMs,
        correct: input.correct,
        pointsAwarded: input.pointsAwarded,
        txlineEventId: input.txlineEventId
      }
    });

    for (const badgeId of input.badgesUnlocked) {
      await prisma.badgeUnlock.upsert({
        where: {
          userId_badgeId: {
            userId: input.userId,
            badgeId
          }
        },
        update: {},
        create: {
          userId: input.userId,
          badgeId,
          reason: `Unlocked from ${input.predictionId}`
        }
      });
    }

    return {
      persisted: true
    };
  } catch (error) {
    return {
      persisted: false,
      reason: error instanceof Error ? error.message : "Prisma persistence failed"
    };
  }
}

export async function getRoomState() {
  if (!process.env.DATABASE_URL) {
    return {
      persisted: false,
      leaderboard
    };
  }

  try {
    const users = await prisma.user.findMany({
      take: 10,
      orderBy: {
        points: "desc"
      },
      include: {
        badgeUnlocks: true
      }
    });

    const persistedLeaderboard: LeaderboardUser[] = users.map((user, index) => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      points: user.points,
      streak: user.streak,
      bestStreak: user.bestStreak,
      badges: user.badgeUnlocks.map((unlock) => unlock.badgeId as BadgeId),
      trend: index < 3 ? "up" : "same"
    }));

    return {
      persisted: true,
      leaderboard: persistedLeaderboard.length ? persistedLeaderboard : leaderboard
    };
  } catch {
    return {
      persisted: false,
      leaderboard
    };
  }
}
