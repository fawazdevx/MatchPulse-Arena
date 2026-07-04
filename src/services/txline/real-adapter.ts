import type { MarketSentiment, MatchFixture, MatchSnapshot, ReplayTick, TxLineAdapter } from "@/lib/types";
import type { TxLineServerConfig } from "@/lib/server/env";
import { MockTxLineAdapter } from "./mock-adapter";

type ProviderFixture = Record<string, unknown>;

const replaceMatchId = (path: string, matchId: string) => path.replace("{matchId}", matchId);

async function txLineFetch<T>(config: TxLineServerConfig, path: string): Promise<T> {
  if (!config.jwt || !config.apiToken) {
    throw new Error("Missing TXLINE_JWT or TXLINE_API_TOKEN");
  }

  return fetch(`${config.apiOrigin.replace(/\/$/, "")}/api${path}`, {
    headers: {
      Authorization: `Bearer ${config.jwt}`,
      "X-Api-Token": config.apiToken,
      Accept: "application/json"
    },
    cache: "no-store"
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`TxLINE request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  });
}

export class RealTxLineAdapter implements TxLineAdapter {
  private fallback = new MockTxLineAdapter();

  constructor(private config: TxLineServerConfig) {}

  async getFixtures(): Promise<MatchFixture[]> {
    const data = await txLineFetch<{ fixtures?: ProviderFixture[]; data?: ProviderFixture[]; results?: ProviderFixture[] }>(
      this.config,
      this.config.fixturesPath
    );
    const source = data.fixtures ?? data.data ?? data.results ?? [];

    if (!source.length) {
      return [];
    }

    const fallbackFixtures = await this.fallback.getFixtures();

    return source.map((item, index) => {
      const fallback = fallbackFixtures[index % fallbackFixtures.length];
      const id = stringValue(item, ["id", "fixtureId", "matchId", "eventId"]) ?? fallback.id;
      const homeName = stringValue(item, ["homeName", "homeTeam", "home", "teamHome"]) ?? fallback.home.name;
      const awayName = stringValue(item, ["awayName", "awayTeam", "away", "teamAway"]) ?? fallback.away.name;

      return {
        ...fallback,
        id,
        competition: stringValue(item, ["competition", "league", "tournament"]) ?? fallback.competition,
        stage: stringValue(item, ["stage", "round", "phase"]) ?? fallback.stage,
        venue: stringValue(item, ["venue", "stadium"]) ?? fallback.venue,
        kickoffIso: stringValue(item, ["kickoffIso", "kickoff", "startTime", "start_time"]) ?? fallback.kickoffIso,
        status: phaseValue(item, fallback.status),
        featured: index === 0,
        home: {
          ...fallback.home,
          name: homeName,
          shortName: stringValue(item, ["homeShort", "homeCode"]) ?? homeName.slice(0, 3).toUpperCase()
        },
        away: {
          ...fallback.away,
          name: awayName,
          shortName: stringValue(item, ["awayShort", "awayCode"]) ?? awayName.slice(0, 3).toUpperCase()
        }
      };
    });
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const scorePath = replaceMatchId(this.config.scoreSnapshotPath, matchId);
    const oddsPath = replaceMatchId(this.config.oddsSnapshotPath, matchId);
    const [scoreData, oddsData, fallback] = await Promise.all([
      txLineFetch<Record<string, unknown>>(this.config, scorePath),
      txLineFetch<Record<string, unknown>>(this.config, oddsPath),
      this.fallback.getSnapshot(matchId)
    ]);
    const score = extractScore(scoreData, fallback.score);
    const sentiment = extractSentiment(oddsData, fallback.sentiment);

    return {
      ...fallback,
      score,
      sentiment,
      provider: "txline",
      generatedAt: new Date().toISOString()
    };
  }

  async *getReplayTicks(matchId: string): AsyncGenerator<ReplayTick> {
    yield* this.fallback.getReplayTicks(matchId);
  }
}

function stringValue(source: ProviderFixture, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return undefined;
}

function numberValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }

  return undefined;
}

function phaseValue(source: ProviderFixture, fallback: MatchFixture["status"]) {
  const raw = stringValue(source, ["status", "phase", "matchPhase"])?.toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("live") || raw.includes("inplay")) return "live";
  if (raw.includes("half")) return "half";
  if (raw.includes("full") || raw.includes("finished")) return "full";
  return "pre";
}

function extractScore(source: Record<string, unknown>, fallback: MatchSnapshot["score"]) {
  const data = (source.data && typeof source.data === "object" ? source.data : source) as Record<string, unknown>;

  return {
    home: numberValue(data, ["home", "homeScore", "scoreHome", "home_score"]) ?? fallback.home,
    away: numberValue(data, ["away", "awayScore", "scoreAway", "away_score"]) ?? fallback.away
  };
}

function extractSentiment(source: Record<string, unknown>, fallback: MatchSnapshot["sentiment"]): MarketSentiment {
  const data = (source.data && typeof source.data === "object" ? source.data : source) as Record<string, unknown>;
  const home = numberValue(data, ["home", "homeProbability", "homeImplied", "home_implied"]) ?? fallback.home;
  const away = numberValue(data, ["away", "awayProbability", "awayImplied", "away_implied"]) ?? fallback.away;
  const draw = numberValue(data, ["draw", "drawProbability", "drawImplied", "draw_implied"]) ?? Math.max(0, 100 - home - away);

  const trend: MarketSentiment["trend"] = home > away + 3 ? "home" : away > home + 3 ? "away" : "neutral";

  return {
    ...fallback,
    home,
    draw,
    away,
    trend,
    delta: Math.abs(home - fallback.home) || Math.abs(away - fallback.away),
    label: stringValue(data, ["label", "marketLabel", "description"]) ?? fallback.label,
    sourceUpdateId: stringValue(data, ["id", "updateId", "sourceUpdateId"]) ?? fallback.sourceUpdateId
  };
}
