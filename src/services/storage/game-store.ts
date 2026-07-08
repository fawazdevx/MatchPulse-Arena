import type { BadgeId, LeaderboardUser, MatchEvent, MatchFixture, PredictionCard, ReplayTick } from "@/lib/types";
import { prisma, prismaAvailable } from "@/lib/prisma";
import { badges } from "@/services/game/badges";
import { getBadgeUnlocks, scorePredictionResult } from "@/services/game/rules";

const db = prisma as any;

export interface PersistAnswerInput {
  userId: string;
  predictionId: string;
  optionId: string;
  answeredAtMs: number;
  txlineEventId?: string;
  roomId?: string;
  prediction?: PredictionCard;
  resolvingEvent?: MatchEvent;
  fan?: {
    points: number;
    streak: number;
    bestStreak: number;
    badges: BadgeId[];
    correct: number;
    answered: number;
    oddsCorrect: number;
    momentumCorrect: number;
  };
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL && prismaAvailable);
}

function roomIdForMatch(matchId: string) {
  return `room-${matchId}`;
}

function matchDataFromFixture(fixture: MatchFixture) {
  return {
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
  };
}

function fixtureFromMatchRow(match: any): MatchFixture {
  return {
    id: match.id,
    competition: match.competition,
    stage: match.stage,
    venue: match.venue,
    kickoffIso: match.kickoffIso.toISOString(),
    status: match.phase,
    featured: false,
    home: {
      id: "home",
      name: match.homeName,
      shortName: match.homeShort,
      color: match.homeColor,
      crest: match.homeShort,
      record: "Cached TxLINE"
    },
    away: {
      id: "away",
      name: match.awayName,
      shortName: match.awayShort,
      color: match.awayColor,
      crest: match.awayShort,
      record: "Cached TxLINE"
    }
  };
}

function eventFromMatchEventRow(event: any): MatchEvent {
  return {
    id: event.id,
    minute: event.minute,
    stoppage: event.stoppage ?? undefined,
    type: event.type,
    team: event.team ?? undefined,
    title: event.title,
    description: event.description,
    impact: event.impact
  };
}

export async function seedBadges() {
  if (!hasDatabase()) return false;

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

  return true;
}

export async function upsertMatchFixture(fixture: MatchFixture) {
  if (!hasDatabase()) {
    return {
      persisted: false,
      roomId: roomIdForMatch(fixture.id),
      reason: "DATABASE_URL is not set or Prisma Client is not generated."
    };
  }

  await db.match.upsert({
    where: { id: fixture.id },
    update: matchDataFromFixture(fixture),
    create: {
      id: fixture.id,
      ...matchDataFromFixture(fixture)
    }
  });

  const roomId = roomIdForMatch(fixture.id);
  await db.matchRoom.upsert({
    where: { id: roomId },
    update: {
      name: `${fixture.home.shortName} vs ${fixture.away.shortName}`,
      mode: "public",
      inviteCode: `${fixture.home.shortName}-${fixture.away.shortName}-${fixture.id}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 48),
      themeColor: fixture.home.color,
      sponsor: null
    },
    create: {
      id: roomId,
      matchId: fixture.id,
      name: `${fixture.home.shortName} vs ${fixture.away.shortName}`,
      mode: "public",
      inviteCode: `${fixture.home.shortName}-${fixture.away.shortName}-${fixture.id}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 48),
      themeColor: fixture.home.color,
      sponsor: null
    }
  });

  return {
    persisted: true,
    roomId
  };
}

export async function getCachedFixturesFromDb() {
  if (!hasDatabase()) return [] as MatchFixture[];

  try {
    const matches = await db.match.findMany({
      take: 30,
      orderBy: {
        kickoffIso: "asc"
      }
    });

    return matches.map(fixtureFromMatchRow);
  } catch {
    return [] as MatchFixture[];
  }
}

export async function getCachedSnapshotFromDb(matchId: string, notice: string) {
  if (!hasDatabase()) return null;

  try {
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: {
        events: {
          take: 12,
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!match) return null;

    const latestLog = await db.txLineEventLog.findFirst({
      where: { matchId },
      orderBy: {
        occurredAt: "desc"
      }
    });
    const tick = latestLog?.payload as ReplayTick | undefined;
    if (!tick?.score || !tick.sentiment) return null;

    const fixture = fixtureFromMatchRow(match);
    const latestEvent = tick.event ?? match.events[0];
    const minute = latestEvent?.minute ?? 0;
    const stoppage = latestEvent?.stoppage ?? 0;

    return {
      fixture: {
        ...fixture,
        status: minute > 0 ? "live" : fixture.status
      },
      clock: {
        minute,
        stoppage,
        phase: minute > 0 ? "live" : fixture.status,
        label: minute ? (stoppage ? `${minute}+${stoppage}'` : `${minute}'`) : fixture.status === "pre" ? "Pre-match" : "Live"
      },
      score: tick.score,
      sentiment: tick.sentiment,
      events: match.events.map(eventFromMatchEventRow),
      generatedAt: latestLog?.occurredAt?.toISOString?.() ?? new Date().toISOString(),
      provider: "txline" as const,
      dataQuality: "delayed" as const,
      notice
    };
  } catch {
    return null;
  }
}

function dbEventId(matchId: string, eventId?: string) {
  return `${matchId}-${eventId ?? "snapshot"}`;
}

function eventToDb(matchId: string, event: MatchEvent) {
  return {
    id: dbEventId(matchId, event.id),
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

async function upsertPrediction(matchId: string, card: PredictionCard) {
  const resolvingEventId = card.resolved?.eventId ? dbEventId(matchId, card.resolved.eventId) : undefined;

  await db.prediction.upsert({
    where: { id: card.id },
    update: {
      kind: card.kind,
      prompt: card.prompt,
      context: card.context,
      options: card.options as unknown as object,
      lockAtMinute: card.lockAt,
      resolvesAtMinute: card.resolvesAt,
      status: card.resolved ? "resolved" : "active",
      resolvedOptionId: card.resolved?.optionId,
      resolvingEventId,
      txlineStream: card.source.stream,
      txlineEndpoint: card.source.endpoint,
      sponsorName: card.sponsor?.name,
      sponsorLabel: card.sponsor?.label
    },
    create: {
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
      resolvingEventId,
      txlineStream: card.source.stream,
      txlineEndpoint: card.source.endpoint,
      sponsorName: card.sponsor?.name,
      sponsorLabel: card.sponsor?.label
    }
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
        resolvingEventId,
        txlineUpdateId: card.resolved.eventId,
        explanation: card.resolved.explanation,
        sourcePayload: card as unknown as object
      },
      create: {
        predictionId: card.id,
        resolvedOptionId: card.resolved.optionId,
        resolvingEventId,
        txlineUpdateId: card.resolved.eventId,
        explanation: card.resolved.explanation,
        sourcePayload: card as unknown as object
      }
    });
  }
}

export async function persistRoomUpdate(
  fixture: MatchFixture,
  tick: ReplayTick,
  prediction?: PredictionCard,
  resolvedPrediction?: PredictionCard
) {
  if (!hasDatabase()) return { persisted: false };

  await seedBadges();
  await upsertMatchFixture(fixture);

  const event = eventToDb(fixture.id, tick.event);
  await db.matchEvent.upsert({
    where: { id: event.id },
    update: event,
    create: event
  });

  if (resolvedPrediction?.resolved?.eventId && resolvedPrediction.resolved.eventId !== tick.event.id) {
    const resolvingEvent = eventToDb(fixture.id, {
      ...tick.event,
      id: resolvedPrediction.resolved.eventId
    });
    await db.matchEvent.upsert({
      where: { id: resolvingEvent.id },
      update: resolvingEvent,
      create: resolvingEvent
    });
  }

  await db.txLineEventLog.create({
    data: {
      matchId: fixture.id,
      stream: "score",
      endpoint: "/api/txline/matches/:matchId/stream?mode=live",
      txlineUpdateId: tick.txlineUpdateId ?? tick.event.id,
      eventType: tick.event.type,
      payload: tick as unknown as object
    }
  });

  if (prediction) {
    await upsertPrediction(fixture.id, prediction);
  }

  if (resolvedPrediction) {
    await upsertPrediction(fixture.id, resolvedPrediction);
  }

  return { persisted: true };
}

function calculateServerAnswerFallback(input: PersistAnswerInput, reason?: string) {
  if (!input.prediction?.resolved) {
    return {
      persisted: false,
      serverCalculated: false,
      reason: reason ?? "Prediction has not been resolved by a TxLINE update yet."
    };
  }

  const fan = input.fan ?? {
    points: 0,
    streak: 0,
    bestStreak: 0,
    badges: [] as BadgeId[],
    correct: 0,
    answered: 0,
    oddsCorrect: 0,
    momentumCorrect: 0
  };
  const correct = input.prediction.resolved.optionId === input.optionId;
  const nextStreak = correct ? fan.streak + 1 : 0;
  const pointsAwarded = scorePredictionResult({
    correct,
    nextStreak,
    answeredAtMs: input.answeredAtMs,
    eventImpact: input.resolvingEvent?.impact,
    eventMinute: input.resolvingEvent?.minute
  });
  const badgesUnlocked = getBadgeUnlocks({
    currentBadges: fan.badges,
    correct,
    previousCorrect: fan.correct,
    nextStreak,
    kind: input.prediction.kind,
    oddsCorrect: fan.oddsCorrect,
    momentumCorrect: fan.momentumCorrect,
    event: input.resolvingEvent ? { type: input.resolvingEvent.type, minute: input.resolvingEvent.minute } : undefined
  });

  return {
    persisted: false,
    serverCalculated: true,
    correct,
    pointsAwarded,
    nextStreak,
    nextPoints: fan.points + pointsAwarded,
    nextBestStreak: Math.max(fan.bestStreak, nextStreak),
    badgesUnlocked,
    txlineEventId: input.prediction.resolved.eventId,
    explanation: input.prediction.resolved.explanation,
    reason
  };
}

export async function persistAnswer(input: PersistAnswerInput) {
  if (!hasDatabase()) {
    return calculateServerAnswerFallback(input, "DATABASE_URL is not set or Prisma Client is not generated; answer was server-calculated but not persisted.");
  }

  try {
    await seedBadges();

    const prediction = await db.prediction.findUnique({
      where: { id: input.predictionId },
      include: {
        resolution: true,
        match: true
      }
    });

    if (!prediction) {
      return calculateServerAnswerFallback(input, "Prediction was not found in Postgres; answer was calculated from the server-issued prediction payload.");
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

    if (!prediction.resolution) {
      return calculateServerAnswerFallback(input, "Prediction is not resolved in Postgres yet; answer was calculated from the server-issued prediction payload.");
    }

    const correct = prediction.resolution.resolvedOptionId === input.optionId;
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
      nextPoints: user.points + pointsAwarded,
      nextStreak,
      nextBestStreak: Math.max(user.bestStreak, nextStreak),
      badgesUnlocked,
      txlineEventId: prediction.resolution?.txlineUpdateId ?? input.txlineEventId,
      explanation: prediction.resolution?.explanation
    };
  } catch (error) {
    return calculateServerAnswerFallback(input, error instanceof Error ? error.message : "Prisma persistence failed");
  }
}

export async function getRoomState(roomId?: string) {
  if (!hasDatabase()) {
    return {
      persisted: false,
      leaderboard: [] as LeaderboardUser[]
    };
  }

  try {
    const entries = await db.leaderboardEntry.findMany({
      where: roomId
        ? {
            roomId
          }
        : undefined,
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

    const leaderboard: LeaderboardUser[] = entries.map((entry: any, index: number) => ({
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
      leaderboard
    };
  } catch {
    return {
      persisted: false,
      leaderboard: [] as LeaderboardUser[]
    };
  }
}
