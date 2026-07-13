import type {
  EventType,
  MarketSentiment,
  MatchEvent,
  MatchFixture,
  MatchSnapshot,
  ReplayTick,
  TeamKey,
  TxLineAdapter
} from "@/lib/types";
import type { TxLineServerConfig } from "@/lib/server/env";
import { rememberRuntimeFixtures } from "@/services/txline/runtime-cache";

type JsonRecord = Record<string, unknown>;

const teamColors = ["#0B7A53", "#1F4E9E", "#C03B52", "#8E6A12", "#4B5D8F", "#7A4EAA", "#0E8A9C", "#8F4C32"];
const fixtureCache = new Map<string, { expiresAt: number; staleUntil: number; promise: Promise<MatchFixture[]> }>();
const snapshotCache = new Map<string, { expiresAt: number; snapshot: MatchSnapshot }>();
const fixtureCacheTtlMs = 60_000;
const staleFixtureCacheTtlMs = 10 * 60_000;
const snapshotCacheTtlMs = 45_000;
const defaultTimeoutMs = 4_000;
const fixtureTimeoutMs = 8_000;
const snapshotFixtureTimeoutMs = 1_200;

const replaceMatchId = (path: string, matchId: string) => path.replace("{matchId}", encodeURIComponent(matchId));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function txLineFetch<T>(config: TxLineServerConfig, path: string, timeoutMs = defaultTimeoutMs): Promise<T> {
  if (!config.jwt || !config.apiToken) {
    throw new Error("Missing TXLINE_JWT or TXLINE_API_TOKEN");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.apiOrigin.replace(/\/$/, "")}/api${path}`, {
      headers: {
        Authorization: `Bearer ${config.jwt}`,
        "X-Api-Token": config.apiToken,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`TxLINE request timed out after ${timeoutMs}ms: ${path}`);
    }

    const cause = error instanceof Error && "cause" in error ? (error.cause as { code?: string } | undefined) : undefined;
    throw new Error(`TxLINE network request failed${cause?.code ? ` (${cause.code})` : ""}: ${path}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TxLINE request failed: ${response.status}${body ? ` ${body.slice(0, 180)}` : ""}`);
  }

  return response.json() as Promise<T>;
}

async function retryTxLineFetch<T>(config: TxLineServerConfig, path: string, timeoutMs: number, attempts = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await txLineFetch<T>(config, path, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(350);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`TxLINE request failed: ${path}`);
}

async function* txLineStream(config: TxLineServerConfig, path: string): AsyncGenerator<unknown> {
  if (!config.jwt || !config.apiToken) {
    throw new Error("Missing TXLINE_JWT or TXLINE_API_TOKEN");
  }

  const response = await fetch(`${config.apiOrigin.replace(/\/$/, "")}/api${path}`, {
    headers: {
      Authorization: `Bearer ${config.jwt}`,
      "X-Api-Token": config.apiToken,
      Accept: "text/event-stream, application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TxLINE stream failed: ${response.status}${body ? ` ${body.slice(0, 180)}` : ""}`);
  }

  if (!response.body) {
    yield await response.json();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const drained = drainStreamBuffer(buffer);
    buffer = drained.remainder;

    for (const payload of drained.payloads) {
      yield payload;
    }
  }

  for (const payload of parseStreamFrame(buffer)) {
    yield payload;
  }
}

export class RealTxLineAdapter implements TxLineAdapter {
  constructor(private config: TxLineServerConfig) {}

  private fixtureCacheKey() {
    return `${this.config.apiOrigin}:${this.config.fixturesPath}`;
  }

  async getFixtures(): Promise<MatchFixture[]> {
    const cacheKey = this.fixtureCacheKey();
    const cached = fixtureCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const staleFixtures = cached && cached.staleUntil > now ? cached.promise.catch(() => [] as MatchFixture[]) : undefined;
    const promise = retryTxLineFetch<unknown>(this.config, this.config.fixturesPath, fixtureTimeoutMs)
      .then((payload) => {
        const records = recordsFromPayload(payload);

        return records
          .map((record, index) => fixtureFromTxLine(record, index))
          .filter((fixture): fixture is MatchFixture => Boolean(fixture));
      })
      .catch(async (error) => {
        const fixtures = await staleFixtures;
        if (fixtures?.length) return fixtures;
        throw error;
      });

    fixtureCache.set(cacheKey, {
      expiresAt: Date.now() + fixtureCacheTtlMs,
      staleUntil: Date.now() + staleFixtureCacheTtlMs,
      promise
    });

    promise
      .then((fixtures) => {
        rememberRuntimeFixtures(fixtures);
        fixtureCache.set(cacheKey, {
          expiresAt: Date.now() + fixtureCacheTtlMs,
          staleUntil: Date.now() + staleFixtureCacheTtlMs,
          promise: Promise.resolve(fixtures)
        });
      })
      .catch(() => undefined);
    return promise;
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const snapshotCacheKey = this.snapshotCacheKey(matchId);
    const scorePath = replaceMatchId(this.config.scoreSnapshotPath, matchId);
    const oddsPath = replaceMatchId(this.config.oddsSnapshotPath, matchId);

    const [scoreResult, oddsResult, fixtureResult] = await Promise.allSettled([
      retryTxLineFetch<unknown>(this.config, scorePath, defaultTimeoutMs),
      txLineFetch<unknown>(this.config, oddsPath, 2_500),
      this.getFixtureFromCacheOrNetwork(snapshotFixtureTimeoutMs)
    ]);

    if (scoreResult.status === "rejected") {
      const cached = snapshotCache.get(snapshotCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.snapshot,
          dataQuality: "delayed",
          notice: scoreResult.reason instanceof Error ? scoreResult.reason.message : "TxLINE score snapshot is delayed."
        };
      }

      throw scoreResult.reason instanceof Error ? scoreResult.reason : new Error("TxLINE snapshot unavailable.");
    }

    const scoreRecords = recordsFromPayload(scoreResult.value);
    const oddsRecords = oddsResult.status === "fulfilled" ? recordsFromPayload(oddsResult.value) : [];
    const scoreRecord = latestRecord(scoreRecords, matchId, true);
    const oddsRecord = latestRecord(oddsRecords, matchId, true);
    const cachedSnapshot = snapshotCache.get(snapshotCacheKey)?.snapshot;
    const fixture =
      (fixtureResult.status === "fulfilled" ? fixtureResult.value.find((item) => item.id === matchId) : undefined) ??
      cachedSnapshot?.fixture ??
      fixtureFromTxLine(scoreRecord ?? oddsRecord ?? { FixtureId: matchId }, 0);

    if (!fixture) {
      throw new Error(`TxLINE fixture ${matchId} was not found.`);
    }

    const score = extractScore(scoreRecord);
    const clock = extractClock(scoreRecord, fixture.status);
    const sentiment = extractSentiment(oddsRecord, fixture, neutralSentiment());
    const events = scoreRecords
      .filter((record) => matchesFixture(record, matchId, true))
      .sort((a, b) => recordTimestamp(b) - recordTimestamp(a))
      .slice(0, 12)
      .map((record, index) => eventFromScoreRecord(record, fixture, index, sentiment));

    const snapshot: MatchSnapshot = {
      fixture: {
        ...fixture,
        status: clock.phase
      },
      clock,
      score,
      sentiment,
      events,
      provider: "txline",
      dataQuality: "live",
      generatedAt: new Date().toISOString()
    };

    snapshotCache.set(snapshotCacheKey, {
      expiresAt: Date.now() + snapshotCacheTtlMs,
      snapshot
    });

    return snapshot;
  }

  async *getReplayTicks(matchId: string): AsyncGenerator<ReplayTick> {
    const historicalPath = replaceMatchId(this.config.historicalScoresPath, matchId);
    const [historicalPayload, snapshot] = await Promise.all([
      txLineFetch<unknown>(this.config, historicalPath),
      this.getSnapshot(matchId).catch(() => null)
    ]);
    const fixture = snapshot?.fixture ?? fixtureFromTxLine({ FixtureId: matchId }, 0);
    const sentiment = snapshot?.sentiment ?? neutralSentiment();

    if (!fixture) {
      throw new Error(`TxLINE fixture ${matchId} was not found.`);
    }

    const records = recordsFromPayload(historicalPayload)
      .filter((record) => matchesFixture(record, matchId, true))
      .sort((a, b) => recordTimestamp(a) - recordTimestamp(b));

    for (const [index, record] of records.entries()) {
      await sleep(900);

      yield {
        atSecond: index + 1,
        event: eventFromScoreRecord(record, fixture, index, sentiment),
        score: extractScore(record),
        sentiment
      };
    }
  }

  async *getLiveTicks(matchId: string): AsyncGenerator<ReplayTick> {
    const fixture = (await this.getFixtureFromCacheOrNetwork(snapshotFixtureTimeoutMs).catch(() => [])).find((item) => item.id === matchId) ?? fixtureFromTxLine({ FixtureId: matchId }, 0);
    let sentiment = neutralSentiment();
    let counter = 0;

    if (!fixture) {
      throw new Error(`TxLINE fixture ${matchId} was not found.`);
    }

    for await (const payload of txLineStream(this.config, this.config.scoreStreamPath)) {
      const records = recordsFromPayload(payload).filter((record) => matchesFixture(record, matchId, false));

      for (const record of records) {
        counter += 1;
        sentiment = await this.getLatestSentiment(matchId, fixture, sentiment);

        yield {
          atSecond: counter,
          event: eventFromScoreRecord(record, fixture, counter, sentiment),
          score: extractScore(record),
          sentiment
        };
      }
    }
  }

  private async getLatestSentiment(matchId: string, fixture: MatchFixture, fallback: MarketSentiment) {
    const oddsPath = replaceMatchId(this.config.oddsSnapshotPath, matchId);
    const payload = await txLineFetch<unknown>(this.config, oddsPath, 2_500).catch(() => null);
    const record = payload ? latestRecord(recordsFromPayload(payload), matchId, true) : undefined;
    return extractSentiment(record, fixture, fallback);
  }

  private snapshotCacheKey(matchId: string) {
    return `${this.config.apiOrigin}:${this.config.scoreSnapshotPath}:${this.config.oddsSnapshotPath}:${matchId}`;
  }

  private async getFixtureFromCacheOrNetwork(timeoutMs: number) {
    const cacheKey = this.fixtureCacheKey();
    const cached = fixtureCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }
    const staleFixtures = cached && cached.staleUntil > now ? cached.promise.catch(() => [] as MatchFixture[]) : undefined;

    const timeout = new Promise<MatchFixture[]>((resolve) => {
      setTimeout(() => {
        if (staleFixtures) {
          staleFixtures.then(resolve).catch(() => resolve([]));
          return;
        }

        resolve([]);
      }, timeoutMs);
    });

    return Promise.race([this.getFixtures(), timeout]);
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function recordsFromPayload(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(recordsFromPayload);
  }

  const record = asRecord(payload);
  if (!record) return [];

  const nestedKeys = ["fixtures", "data", "results", "items", "snapshots", "events", "scores", "odds", "historical"];
  for (const key of nestedKeys) {
    const nested = record[key];
    const records = recordsFromPayload(nested);
    if (records.length) return records;
  }

  return [record];
}

function drainStreamBuffer(buffer: string) {
  const payloads: unknown[] = [];
  const frames = buffer.split(/\r?\n\r?\n/);
  let remainder = frames.pop() ?? "";

  for (const frame of frames) {
    payloads.push(...parseStreamFrame(frame));
  }

  const lines = remainder.split(/\r?\n/);
  if (lines.length > 1) {
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      payloads.push(...parseStreamFrame(line));
    }
  }

  return { payloads, remainder };
}

function parseStreamFrame(frame: string) {
  const trimmed = frame.trim();
  if (!trimmed || trimmed === "[DONE]") return [];

  const dataLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  const candidates = dataLines.length ? [dataLines.join("\n")] : [trimmed];
  const payloads: unknown[] = [];

  for (const candidate of candidates) {
    if (!candidate || candidate === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(candidate));
    } catch {
      continue;
    }
  }

  return payloads;
}

function stringValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return undefined;
}

function booleanValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
      if (["false", "0", "no"].includes(value.toLowerCase())) return false;
    }
  }

  return undefined;
}

function numberValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }

  return undefined;
}

function arrayValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return [];

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function stringArrayValue(source: JsonRecord | undefined, keys: string[]) {
  return arrayValue(source, keys)
    .map((value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""))
    .filter(Boolean);
}

function numberArrayValue(source: JsonRecord | undefined, keys: string[]) {
  return arrayValue(source, keys)
    .map((value) => (typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function fixtureIdValue(source: JsonRecord | undefined) {
  return stringValue(source, ["FixtureId", "fixtureId", "fixture_id", "matchId", "eventId", "id"]);
}

function fixtureFromTxLine(source: JsonRecord | undefined, index: number): MatchFixture | undefined {
  const id = fixtureIdValue(source);
  if (!id) return undefined;

  const participant1 = stringValue(source, ["Participant1", "participant1", "participantOne", "team1", "homeName", "homeTeam", "home"]) ?? "Home";
  const participant2 = stringValue(source, ["Participant2", "participant2", "participantTwo", "team2", "awayName", "awayTeam", "away"]) ?? "Away";
  const participant1IsHome = booleanValue(source, ["Participant1IsHome", "participant1IsHome", "participant_1_is_home"]) ?? true;
  const homeName = participant1IsHome ? participant1 : participant2;
  const awayName = participant1IsHome ? participant2 : participant1;
  const kickoffIso = dateIsoValue(source, ["StartTime", "startTime", "kickoffIso", "kickoff", "CutoffTime"]) ?? new Date().toISOString();

  return {
    id,
    competition: stringValue(source, ["Competition", "competition", "Tournament", "tournament", "League", "league", "SportName"]) ?? "World Cup",
    stage: stringValue(source, ["Stage", "stage", "Round", "round", "Phase", "phase", "Type"]) ?? "Fixture",
    venue: stringValue(source, ["Venue", "venue", "Stadium", "stadium", "Location", "location"]) ?? "Venue TBA",
    kickoffIso,
    status: phaseValue(source, "pre", kickoffIso),
    featured: index === 0,
    home: teamFromName(homeName, "home"),
    away: teamFromName(awayName, "away")
  };
}

function dateIsoValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return undefined;

  let raw: string | number | undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      raw = value;
      break;
    }
    if (typeof value === "string" && value.trim()) {
      raw = value.trim();
      break;
    }
  }

  if (raw === undefined) return undefined;

  const date =
    typeof raw === "number" || /^\d+$/.test(raw)
      ? dateFromEpochValue(Number(raw))
      : new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dateFromEpochValue(value: number) {
  if (!Number.isFinite(value)) return new Date(Number.NaN);
  if (value >= 1_000_000_000_000) return new Date(value);
  if (value >= 1_000_000_000) return new Date(value * 1000);
  return new Date(Number.NaN);
}

function phaseValue(source: JsonRecord | undefined, fallback: MatchSnapshot["clock"]["phase"], kickoffIso?: string) {
  const raw = stringValue(source, ["GameState", "gameState", "Status", "status", "Phase", "phase", "MatchPhase", "matchPhase", "State", "state"])?.toLowerCase();

  if (raw) {
    if (raw.includes("full") || raw.includes("finish") || raw.includes("closed") || raw.includes("complete")) return "full";
    if (raw.includes("half")) return "half";
    if (raw.includes("live") || raw.includes("inplay") || raw.includes("in_play") || raw.includes("first") || raw.includes("second")) return "live";
    if (raw.includes("pre") || raw.includes("not_started") || raw.includes("scheduled") || raw.includes("open")) return "pre";
  }

  if (kickoffIso && new Date(kickoffIso).getTime() > Date.now()) {
    return "pre";
  }

  return fallback;
}

function teamFromName(name: string, side: TeamKey) {
  const shortName = shortNameFor(name);

  return {
    id: side,
    name,
    shortName,
    color: colorFor(name, side),
    crest: shortName,
    record: ""
  };
}

function shortNameFor(name: string) {
  if (["home", "home team"].includes(name.trim().toLowerCase())) return "Home";
  if (["away", "away team"].includes(name.trim().toLowerCase())) return "Away";

  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length > 1) {
    return parts
      .slice(0, 3)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  return (parts[0] ?? "TBD").slice(0, 3).toUpperCase();
}

function colorFor(name: string, side: TeamKey) {
  const seed = `${side}:${name}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return teamColors[hash % teamColors.length];
}

function recordTimestamp(source: JsonRecord | undefined) {
  const raw = stringValue(source, ["Timestamp", "timestamp", "UpdatedAt", "updatedAt", "OccurredAt", "occurredAt", "CreatedAt", "createdAt"]);
  const parsed = raw ? new Date(raw).getTime() : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;

  const epoch = numberValue(source, ["Ts", "ts", "StartTime", "startTime"]);
  const epochDate = epoch === undefined ? undefined : dateFromEpochValue(epoch);
  if (epochDate && !Number.isNaN(epochDate.getTime())) return epochDate.getTime();

  return numberValue(source, ["Sequence", "sequence", "seq", "Index", "index"]) ?? 0;
}

function latestRecord(records: JsonRecord[], matchId: string, allowMissingFixtureId: boolean) {
  return records
    .filter((record) => matchesFixture(record, matchId, allowMissingFixtureId))
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a))[0];
}

function matchesFixture(record: JsonRecord | undefined, matchId: string, allowMissingFixtureId: boolean) {
  const id = fixtureIdValue(record);
  return id ? id === matchId : allowMissingFixtureId;
}

function extractScore(source: JsonRecord | undefined) {
  const nestedScore = asRecord(source?.Score) ?? asRecord(source?.score) ?? asRecord(source?.CurrentScore) ?? asRecord(source?.currentScore);
  const participant1 = asRecord(nestedScore?.Participant1) ?? asRecord(nestedScore?.participant1);
  const participant2 = asRecord(nestedScore?.Participant2) ?? asRecord(nestedScore?.participant2);
  const participant1Total = asRecord(participant1?.Total) ?? asRecord(participant1?.total);
  const participant2Total = asRecord(participant2?.Total) ?? asRecord(participant2?.total);
  const arrayScore = numberArrayValue(source, ["Scores", "scores", "CurrentScore", "currentScore"]);
  const participant1Goals =
    numberValue(source, ["HomeScore", "homeScore", "home_score", "scoreHome", "Participant1Score", "participant1Score", "Team1Score", "team1Score"]) ??
    numberValue(nestedScore, ["home", "Home", "homeScore", "HomeScore", "Participant1Score"]) ??
    numberValue(participant1Total, ["Goals", "goals"]) ??
    numberValue(participant1, ["Goals", "goals"]) ??
    arrayScore[0] ??
    0;
  const participant2Goals =
    numberValue(source, ["AwayScore", "awayScore", "away_score", "scoreAway", "Participant2Score", "participant2Score", "Team2Score", "team2Score"]) ??
    numberValue(nestedScore, ["away", "Away", "awayScore", "AwayScore", "Participant2Score"]) ??
    numberValue(participant2Total, ["Goals", "goals"]) ??
    numberValue(participant2, ["Goals", "goals"]) ??
    arrayScore[1] ??
    0;
  const participant1IsHome = booleanValue(source, ["Participant1IsHome", "participant1IsHome"]) ?? true;
  const home = participant1IsHome ? participant1Goals : participant2Goals;
  const away = participant1IsHome ? participant2Goals : participant1Goals;

  return {
    home: Math.max(0, Math.round(home)),
    away: Math.max(0, Math.round(away))
  };
}

function extractClock(source: JsonRecord | undefined, fallbackPhase: MatchSnapshot["clock"]["phase"]) {
  const clock = asRecord(source?.Clock) ?? asRecord(source?.clock);
  const seconds = numberValue(clock, ["Seconds", "seconds"]);
  const minute = Math.max(
    0,
    Math.round(
      numberValue(source, ["Minute", "minute", "MatchMinute", "matchMinute", "GameTime", "gameTime", "Elapsed", "elapsed"]) ?? (seconds ? seconds / 60 : 0)
    )
  );
  const stoppage = Math.max(0, Math.round(numberValue(source, ["Stoppage", "stoppage", "AddedTime", "addedTime", "ExtraMinute", "extraMinute"]) ?? 0));
  const running = booleanValue(clock, ["Running", "running"]);
  const basePhase = phaseValue(source, fallbackPhase);
  const phase = seconds && seconds > 0 && basePhase === "pre" ? (running === false ? "full" : "live") : basePhase;

  return {
    minute,
    stoppage,
    phase,
    label: minute ? (stoppage ? `${minute}+${stoppage}'` : `${minute}'`) : phase === "pre" ? "Pre-match" : phase === "full" ? "Full time" : "Live"
  };
}

function extractSentiment(source: JsonRecord | undefined, fixture: MatchFixture, fallback: MarketSentiment): MarketSentiment {
  const names = stringArrayValue(source, ["PriceNames", "priceNames", "Names", "names", "outcomes"]);
  const percentages = numberArrayValue(source, ["Pct", "pct", "Percentages", "percentages", "ImpliedProbabilities", "impliedProbabilities"]);
  const prices = numberArrayValue(source, ["Prices", "prices", "Odds", "odds"]);
  const implied = percentages.length ? percentages : prices.map((price) => (price > 0 ? 100 / price : 0));

  if (!implied.length) {
    return fallback;
  }

  const homeIndex = outcomeIndex(names, ["home", "participant1", "team1", fixture.home.name, fixture.home.shortName], 0);
  const drawIndex = outcomeIndex(names, ["draw", "tie", "x"], implied.length === 3 ? 1 : -1);
  const awayIndex = outcomeIndex(names, ["away", "participant2", "team2", fixture.away.name, fixture.away.shortName], implied.length === 3 ? 2 : 1);
  const rawHome = implied[homeIndex] ?? implied[0] ?? fallback.home;
  const rawDraw = drawIndex >= 0 ? implied[drawIndex] ?? 0 : 0;
  const rawAway = implied[awayIndex] ?? implied[1] ?? fallback.away;
  const total = rawHome + rawDraw + rawAway || 1;
  const home = clampPercent(Math.round((rawHome / total) * 100));
  const draw = clampPercent(Math.round((rawDraw / total) * 100));
  const away = clampPercent(Math.max(0, 100 - home - draw));
  const trend: MarketSentiment["trend"] = home > away + 3 ? "home" : away > home + 3 ? "away" : "neutral";

  return {
    home,
    draw,
    away,
    trend,
    delta: Math.max(Math.abs(home - fallback.home), Math.abs(away - fallback.away)),
    label: stringValue(source, ["Label", "label", "MarketName", "marketName", "MarketType", "marketType"]) ?? "TxLINE market sentiment",
    sourceUpdateId: stringValue(source, ["Id", "id", "UpdateId", "updateId", "Sequence", "sequence", "Timestamp", "timestamp"]) ?? fallback.sourceUpdateId
  };
}

function outcomeIndex(names: string[], needles: string[], fallback: number) {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
  const index = names.findIndex((name) => normalizedNeedles.some((needle) => name.toLowerCase().includes(needle)));
  return index >= 0 ? index : fallback;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function neutralSentiment(): MarketSentiment {
  return {
    home: 33,
    draw: 34,
    away: 33,
    trend: "neutral",
    delta: 0,
    label: "Awaiting TxLINE market sentiment",
    sourceUpdateId: "pending"
  };
}

function eventFromScoreRecord(source: JsonRecord, fixture: MatchFixture, index: number, sentimentAfter?: MarketSentiment): MatchEvent {
  const clock = extractClock(source, fixture.status);
  const eventType = eventTypeFrom(source);
  const title = stringValue(source, ["Title", "title", "EventName", "eventName", "ActionName", "actionName", "Type", "type"]) ?? titleForEvent(eventType);
  const id =
    stringValue(source, ["Id", "id", "EventId", "eventId", "ScoreId", "scoreId", "UpdateId", "updateId", "Sequence", "sequence"]) ??
    `${fixture.id}-${recordTimestamp(source) || Date.now()}-${index}`;

  return {
    id,
    minute: clock.minute,
    stoppage: clock.stoppage,
    type: eventType,
    team: teamSideFrom(source, fixture),
    title,
    description: stringValue(source, ["Description", "description", "Text", "text", "Notes", "notes"]) ?? `TxLINE ${titleForEvent(eventType).toLowerCase()} update received.`,
    impact: impactForEvent(eventType),
    sentimentAfter
  };
}

function eventTypeFrom(source: JsonRecord | undefined): EventType {
  const raw = stringValue(source, ["EventType", "eventType", "Type", "type", "Action", "action", "ScoreType", "scoreType"])?.toLowerCase() ?? "";
  if (raw.includes("kick")) return "kickoff";
  if (raw.includes("goal")) return "goal";
  if (raw.includes("red")) return "red_card";
  if (raw.includes("yellow")) return "yellow_card";
  if (raw.includes("corner")) return "corner";
  if (raw.includes("sub")) return "substitution";
  if (raw.includes("var")) return "var";
  if (raw.includes("full") || raw.includes("finish")) return "full_time";
  return "momentum";
}

function titleForEvent(type: EventType) {
  return type
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function impactForEvent(type: EventType): MatchEvent["impact"] {
  if (["goal", "red_card", "full_time"].includes(type)) return "high";
  if (["corner", "yellow_card", "momentum", "var"].includes(type)) return "medium";
  return "low";
}

function teamSideFrom(source: JsonRecord | undefined, fixture: MatchFixture): TeamKey | undefined {
  const raw = stringValue(source, ["Team", "team", "TeamSide", "teamSide", "Participant", "participant", "ParticipantId", "participantId"])?.toLowerCase();
  if (!raw) return undefined;
  if (raw.includes("home") || raw.includes("participant1") || raw.includes("team1") || fixture.home.name.toLowerCase().includes(raw)) return "home";
  if (raw.includes("away") || raw.includes("participant2") || raw.includes("team2") || fixture.away.name.toLowerCase().includes(raw)) return "away";
  return undefined;
}
