import type { BadgeId, LeaderboardUser, MatchEvent, PredictionCard } from "@/lib/types";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { badges } from "@/services/game/badges";
import { getBadgeUnlocks, scorePredictionResult } from "@/services/game/rules";
import { baseSnapshot, fixtures, leaderboard, predictionDeck, replayTicks } from "@/services/txline/mock-data";

const db = prisma as any;

export interface PersistAnswerInput {
  userId: string;
  predictionId: string;
  optionId: string;
  answeredAtMs: number;
  correct?: boolean;
  pointsAwarded?: number;
  txlineEventId?: string;
  badgesUnlocked?: BadgeId[];
  roomId?: string;
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL && prismaAvailable);
}

function roomIdForMatch(matchId: string) {
  return `room-${matchId}`;
}

function demoWalletFor(id: string) {
  return `demo-${id}`;
}

function eventToDb(matchId: string, event: MatchEvent) {
  return {
    id: `${matchId}-${event.id}`,
    matchId,
    minute: event.minute,
    stoppage: event.stoppage,
    type: event.type,
    team: event.team,
    title: event.title,
    description: event.description,
    impact: event.impact,
    txlineRef: event.sentimentAfter?.sourceUpdateId,
    payload: event as unknown as object
  };
}

function predictionToDb(matchId: string, card: PredictionCard) {
  return {
    id: card.id,
    matchId,
    kind: card.kind,
    prompt: card.prompt,
    context: card.context,
    options: card.options as unknown as object,
    lockAtMinute: card.lockAt,
    resolvesAtMinute: card.resolvesAt,
    status: card.resolved ? "resolved" : "active",
    resolvedOptionId: card.resolved?.optionId,
    resolvingEventId: card.resolved?.eventId ? `${matchId}-${card.resolved.eventId}` : undefined,
    txlineStream: card.source.stream,
    txlineEndpoint: card.source.endpoint,
    sponsorName: card.sponsor?.name,
    sponsorLabel: card.sponsor?.label
  } as const;
}

export async function seedGameData() {
  if (!hasDatabase()) return;

  for (const badge of badges) {
    await db.badge.upsert({
      where: { id: badge.id },
      update: {
        name: badge.name,
        description: badge.description,
        tone: badge.tone
      },
      create: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        tone: badge.tone
      }
    });
  }

  for (const fixture of fixtures) {
    await db.match.upsert({
      where: { id: fixture.id },
      update: {
        competition: fixture.competition,
        stage: fixture.stage,
        venue: fixture.venue,
        kickoffIso: new Date(fixture.kickoffIso),
        phase: fixture.status,
        homeName: fixture.home.name,
        homeShort: fixture.home.shortName,
        homeColor: fixture.home.color,
        awayName: fixture.away.name,
        awayShort: fixture.away.shortName,
        awayColor: fixture.away.color
      },
      create: {
        id: fixture.id,
        competition: fixture.competition,
        stage: fixture.stage,
        venue: fixture.venue,
        kickoffIso: new Date(fixture.kickoffIso),
        phase: fixture.status,
        homeName: fixture.home.name,
        homeShort: fixture.home.shortName,
        homeColor: fixture.home.color,
        awayName: fixture.away.name,
        awayShort: fixture.away.shortName,
        awayColor: fixture.away.color
      }
    });

    const roomId = roomIdForMatch(fixture.id);
    await db.matchRoom.upsert({
      where: { id: roomId },
      update: {
        name: `${fixture.home.shortName} vs ${fixture.away.shortName}`,
        mode: fixture.creatorRoom ? "creator" : "public",
        inviteCode: fixture.creatorRoom?.inviteCode ?? `${fixture.home.shortName}-${fixture.away.shortName}`,
        themeColor: fixture.creatorRoom?.themeColor ?? fixture.home.color,
        sponsor: fixture.creatorRoom?.sponsor
      },
      create: {
        id: roomId,
        matchId: fixture.id,
        name: `${fixture.home.shortName} vs ${fixture.away.shortName}`,
        mode: fixture.creatorRoom ? "creator" : "public",
        inviteCode: fixture.creatorRoom?.inviteCode ?? `${fixture.home.shortName}-${fixture.away.shortName}`,
        themeColor: fixture.creatorRoom?.themeColor ?? fixture.home.color,
        sponsor: fixture.creatorRoom?.sponsor
      }
    });

    if (fixture.creatorRoom) {
      const creator = await db.user.upsert({
        where: { walletAddress: demoWalletFor(`creator-${fixture.creatorRoom.inviteCode}`) },
        update: {
          name: fixture.creatorRoom.creatorName,
          avatar: fixture.creatorRoom.avatar
        },
        create: {
          walletAddress: demoWalletFor(`creator-${fixture.creatorRoom.inviteCode}`),
          name: fixture.creatorRoom.creatorName,
          avatar: fixture.creatorRoom.avatar
        }
      });

      await db.creatorRoom.upsert({
        where: { roomId },
        update: {
          creatorId: creator.id,
          creatorName: fixture.creatorRoom.creatorName,
          handle: fixture.creatorRoom.handle,
          avatar: fixture.creatorRoom.avatar,
          widgetSlug: fixture.creatorRoom.inviteCode.toLowerCase(),
          analytics: {}
        },
        create: {
          roomId,
          creatorId: creator.id,
          creatorName: fixture.creatorRoom.creatorName,
          handle: fixture.creatorRoom.handle,
          avatar: fixture.creatorRoom.avatar,
          widgetSlug: fixture.creatorRoom.inviteCode.toLowerCase(),
          analytics: {}
        }
      });
    }
  }

  for (const user of leaderboard) {
    const dbUser = await db.user.upsert({
      where: { walletAddress: demoWalletFor(user.id) },
      update: {
        name: user.name,
        avatar: user.avatar,
        points: user.points,
        streak: user.streak,
        bestStreak: user.bestStreak
      },
      create: {
        id: user.id === "you" ? "you" : undefined,
        walletAddress: demoWalletFor(user.id),
        name: user.name,
        avatar: user.avatar,
        points: user.points,
        streak: user.streak,
        bestStreak: user.bestStreak
      }
    });

    for (const badgeId of user.badges) {
      await db.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId: dbUser.id,
            badgeId
          }
        },
        update: {},
        create: {
          userId: dbUser.id,
          badgeId,
          reason: "Seeded room history"
        }
      });
    }

    await db.leaderboardEntry.upsert({
      where: {
        roomId_userId: {
          roomId: roomIdForMatch(fixtures[0].id),
          userId: dbUser.id
        }
      },
      update: {
        points: user.points,
        streak: user.streak,
        bestStreak: user.bestStreak
      },
      create: {
        roomId: roomIdForMatch(fixtures[0].id),
        userId: dbUser.id,
        points: user.points,
        streak: user.streak,
        bestStreak: user.bestStreak,
        rank: 0
      }
    });
  }

  const seedEvents = [...baseSnapshot.events, ...replayTicks.map((tick) => tick.event)];
  for (const fixture of fixtures) {
    for (const event of seedEvents) {
      const dbEvent = eventToDb(fixture.id, event);
      await db.matchEvent.upsert({
        where: { id: dbEvent.id },
        update: dbEvent,
        create: dbEvent
      });
    }
  }

  for (const card of predictionDeck) {
    const dbPrediction = predictionToDb(fixtures[0].id, card);
    await db.prediction.upsert({
      where: { id: card.id },
      update: dbPrediction,
      create: dbPrediction
    });

    for (const option of card.options) {
      await db.predictionOption.upsert({
        where: {
          predictionId_optionId: {
            predictionId: card.id,
            optionId: option.id
          }
        },
        update: {
          label: option.label,
          team: option.team
        },
        create: {
          predictionId: card.id,
          optionId: option.id,
          label: option.label,
          team: option.team
        }
      });
    }

    if (card.resolved) {
      await db.predictionResolution.upsert({
        where: { predictionId: card.id },
        update: {
          resolvedOptionId: card.resolved.optionId,
          resolvingEventId: `${fixtures[0].id}-${card.resolved.eventId}`,
          explanation: card.resolved.explanation
        },
        create: {
          predictionId: card.id,
          resolvedOptionId: card.resolved.optionId,
          resolvingEventId: `${fixtures[0].id}-${card.resolved.eventId}`,
          explanation: card.resolved.explanation
        }
      });
    }
  }
}

export async function persistAnswer(input: PersistAnswerInput) {
  if (!hasDatabase()) {
    return {
      persisted: false,
      serverCalculated: false,
      reason: "DATABASE_URL not set; using local demo state"
    };
  }

  try {
    await seedGameData();

    const prediction = await db.prediction.findUnique({
      where: { id: input.predictionId },
      include: {
        resolution: true,
        match: true
      }
    });

    if (!prediction) {
      throw new Error("Prediction was not found on the server.");
    }

    const user = await db.user.findUnique({
      where: { id: input.userId },
      include: {
        badgeUnlocks: true,
        answers: true
      }
    });

    if (!user) {
      throw new Error("Connect a wallet before submitting a persisted prediction answer.");
    }

    const resolvingEvent = prediction.resolution?.resolvingEventId
      ? await db.matchEvent.findUnique({
          where: { id: prediction.resolution.resolvingEventId }
        })
      : null;

    const correct = prediction.resolution
      ? prediction.resolution.resolvedOptionId === input.optionId
      : Boolean(input.correct);
    const nextStreak = correct ? user.streak + 1 : 0;
    const previousCorrect = user.answers.filter((answer: { correct: boolean | null }) => answer.correct).length;
    const pointsAwarded = scorePredictionResult({
      correct,
      nextStreak,
      answeredAtMs: input.answeredAtMs,
      eventImpact: resolvingEvent?.impact,
      eventMinute: resolvingEvent?.minute
    });
    const currentBadges = user.badgeUnlocks.map((badge: { badgeId: string }) => badge.badgeId as BadgeId);
    const oddsCorrect = user.answers.filter((answer: { correct: boolean | null }) => answer.correct && ["odds_shift", "post_event"].includes(prediction.kind)).length;
    const momentumCorrect = user.answers.filter((answer: { correct: boolean | null }) => answer.correct && prediction.kind === "momentum").length;
    const badgesUnlocked = getBadgeUnlocks({
      currentBadges,
      correct,
      previousCorrect,
      nextStreak,
      kind: prediction.kind,
      oddsCorrect,
      momentumCorrect,
      event: resolvingEvent ? { type: resolvingEvent.type, minute: resolvingEvent.minute } : undefined
    });

    await db.$transaction(async (tx: any) => {
      await tx.predictionAnswer.upsert({
        where: {
          predictionId_userId: {
            predictionId: input.predictionId,
            userId: input.userId
          }
        },
        update: {
          optionId: input.optionId,
          answeredAtMs: input.answeredAtMs,
          correct,
          pointsAwarded,
          txlineEventId: prediction.resolution?.txlineUpdateId ?? input.txlineEventId
        },
        create: {
          predictionId: input.predictionId,
          userId: input.userId,
          optionId: input.optionId,
          answeredAtMs: input.answeredAtMs,
          correct,
          pointsAwarded,
          txlineEventId: prediction.resolution?.txlineUpdateId ?? input.txlineEventId
        }
      });

      const nextPoints = user.points + pointsAwarded;
      const nextBestStreak = Math.max(user.bestStreak, nextStreak);

      await tx.user.update({
        where: { id: user.id },
        data: {
          points: nextPoints,
          streak: nextStreak,
          bestStreak: nextBestStreak
        }
      });

      const roomId = input.roomId ?? roomIdForMatch(prediction.matchId);
      await tx.leaderboardEntry.upsert({
        where: {
          roomId_userId: {
            roomId,
            userId: user.id
          }
        },
        update: {
          points: nextPoints,
          streak: nextStreak,
          bestStreak: nextBestStreak
        },
        create: {
          roomId,
          userId: user.id,
          points: nextPoints,
          streak: nextStreak,
          bestStreak: nextBestStreak
        }
      });

      for (const badgeId of badgesUnlocked) {
        await tx.userBadge.upsert({
          where: {
            userId_badgeId: {
              userId: user.id,
              badgeId
            }
          },
          update: {},
          create: {
            userId: user.id,
            badgeId,
            reason: `Unlocked from ${input.predictionId}`
          }
        });
      }
    });

    return {
      persisted: true,
      serverCalculated: true,
      correct,
      pointsAwarded,
      nextStreak,
      badgesUnlocked,
      txlineEventId: prediction.resolution?.txlineUpdateId ?? input.txlineEventId,
      explanation: prediction.resolution?.explanation
    };
  } catch (error) {
    return {
      persisted: false,
      serverCalculated: false,
      reason: error instanceof Error ? error.message : "Prisma persistence failed"
    };
  }
}

export async function getRoomState() {
  if (!hasDatabase()) {
    return {
      persisted: false,
      leaderboard
    };
  }

  try {
    await seedGameData();

    const entries = await db.leaderboardEntry.findMany({
      take: 10,
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
    });

    const persistedLeaderboard: LeaderboardUser[] = entries.map((entry: any, index: number) => ({
      id: entry.user.id,
      name: entry.user.name,
      avatar: entry.user.avatar,
      points: entry.points,
      streak: entry.streak,
      bestStreak: entry.bestStreak,
      badges: entry.user.badgeUnlocks.map((unlock: { badgeId: string }) => unlock.badgeId as BadgeId),
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
