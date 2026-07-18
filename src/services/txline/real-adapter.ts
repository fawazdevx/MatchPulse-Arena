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
import {
  txLineClockFromRecord,
  txLineEventTypeFromRecord,
  txLineScoreFromRecord,
  txLineTeamSideFromRecord,
  txLineUpdateIdFromRecord
} from "./normalizers";

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
const liveFallbackPollMs = 2_000;

const replaceMatchId = (path: string, matchId: string) => path.replace("{matchId}", encodeURIComponent(matchId));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function txLineFetch<T>(
  config: TxLineServerConfig,
  path: string,
  timeoutMs = defaultTimeoutMs,
  externalSignal?: AbortSignal
): Promise<T> {
  if (!config.jwt || !config.apiToken) {
    throw new Error("Missing TXLINE_JWT or TXLINE_API_TOKEN");
  }

  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  externalSignal?.addEventListener("abort", abortRequest, { once: true });
  if (externalSignal?.aborted) controller.abort();

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
      if (externalSignal?.aborted) {
        throw new Error(`TxLINE request aborted: ${path}`);
      }
      throw new Error(`TxLINE request timed out after ${timeoutMs}ms: ${path}`);
    }

    const cause = error instanceof Error && "cause" in error ? (error.cause as { code?: string } | undefined) : undefined;
    throw new Error(`TxLINE network request failed${cause?.code ? ` (${cause.code})` : ""}: ${path}`);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortRequest);
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

async function* txLineStream(config: TxLineServerConfig, path: string, signal?: AbortSignal): AsyncGenerator<unknown> {
  if (!config.jwt || !config.apiToken) {
    throw new Error("Missing TXLINE_JWT or TXLINE_API_TOKEN");
  }

  const response = await fetch(`${config.apiOrigin.replace(/\/$/, "")}/api${path}`, {
    headers: {
      Authorization: `Bearer ${config.jwt}`,
      "X-Api-Token": config.apiToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache"
    },
    cache: "no-store",
    signal
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

  try {
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
  } finally {
    reader.releaseLock();
  }

  for (const payload of parseStreamFrame(buffer)) {
    yield payload;
  }
}

function streamPathForFixture(path: string, matchId: string) {
  if (!/^\d+$/.test(matchId)) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}fixtureId=${encodeURIComponent(matchId)}`;
}

type TaggedStreamPayload = {
  source: "score" | "odds";
  payload: unknown;
};

type TaggedLiveStream = {
  source: TaggedStreamPayload["source"];
  stream: AsyncGenerator<unknown>;
};

function sleepWithSignal(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}

async function* txLineUpdatePoll(
  config: TxLineServerConfig,
  path: string,
  signal?: AbortSignal
): AsyncGenerator<unknown> {
  let consecutiveFailures = 0;

  while (!signal?.aborted) {
    try {
      yield await txLineFetch<unknown>(config, path, 2_500, signal);
      consecutiveFailures = 0;
    } catch (error) {
      if (signal?.aborted) return;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) throw error;
    }

    await sleepWithSignal(liveFallbackPollMs, signal);
  }
}

async function* mergeLiveStreams(
  streams: TaggedLiveStream[],
  signal?: AbortSignal
): AsyncGenerator<TaggedStreamPayload> {
  const queue: TaggedStreamPayload[] = [];
  const errors: unknown[] = [];
  let activeStreams = streams.length;
  let wake: (() => void) | undefined;

  const notify = () => {
    wake?.();
    wake = undefined;
  };

  const pump = async (source: TaggedStreamPayload["source"], stream: AsyncGenerator<unknown>) => {
    try {
      for await (const payload of stream) {
        if (signal?.aborted) break;
        queue.push({ source, payload });
        notify();
      }
    } catch (error) {
      if (!signal?.aborted) errors.push(error);
    } finally {
      activeStreams -= 1;
      notify();
    }
  };

  for (const item of streams) {
    void pump(item.source, item.stream);
  }

  while (!signal?.aborted && (activeStreams > 0 || queue.length > 0)) {
    if (!queue.length) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          signal?.removeEventListener("abort", finish);
          resolve();
        };
        wake = finish;
        signal?.addEventListener("abort", finish, { once: true });
      });
      continue;
    }

    const next = queue.shift();
    if (next) yield next;
  }

  if (!signal?.aborted && activeStreams === 0 && errors.length === streams.length) {
    throw errors[0] instanceof Error ? errors[0] : new Error("TxLINE live streams disconnected.");
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
    const oddsRecord = bestSentimentRecord(oddsRecords, matchId);
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

      const clock = extractClock(record, fixture.status);
      yield {
        atSecond: index + 1,
        event: eventFromScoreRecord(record, fixture, index, sentiment),
        clock,
        txlineUpdateId: txLineUpdateIdFromRecord(record, `${matchId}-replay-${index}`),
        score: extractScore(record),
        sentiment
      };
    }
  }

  async *getLiveTicks(matchId: string, signal?: AbortSignal): AsyncGenerator<ReplayTick> {
    const snapshot = await this.getSnapshot(matchId).catch(() => null);
    const fixture =
      snapshot?.fixture ??
      (await this.getFixtureFromCacheOrNetwork(snapshotFixtureTimeoutMs).catch(() => [])).find((item) => item.id === matchId) ??
      fixtureFromTxLine({ FixtureId: matchId }, 0);
    let sentiment = snapshot?.sentiment ?? neutralSentiment();
    let score = snapshot?.score ?? { home: 0, away: 0 };
    let clock = snapshot?.clock ?? {
      minute: 0,
      stoppage: 0,
      phase: fixture?.status ?? "pre",
      label: fixture?.status === "pre" ? "Pre-match" : "Live"
    };
    let lastSentimentSource = sentiment.sourceUpdateId;
    const seenScoreUpdates = new Set<string>();
    const snapshotEventIds = new Set(snapshot?.events.map((event) => event.id) ?? []);
    let counter = 0;

    if (!fixture) {
      throw new Error(`TxLINE fixture ${matchId} was not found.`);
    }

    const scoreStream = txLineStream(this.config, streamPathForFixture(this.config.scoreStreamPath, matchId), signal);
    const oddsStream = txLineStream(this.config, streamPathForFixture(this.config.oddsStreamPath, matchId), signal);
    const scoreUpdates = txLineUpdatePoll(this.config, replaceMatchId(this.config.scoreUpdatesPath, matchId), signal);
    const oddsUpdates = txLineUpdatePoll(this.config, replaceMatchId(this.config.oddsUpdatesPath, matchId), signal);

    for await (const message of mergeLiveStreams(
      [
        { source: "score", stream: scoreStream },
        { source: "odds", stream: oddsStream },
        { source: "score", stream: scoreUpdates },
        { source: "odds", stream: oddsUpdates }
      ],
      signal
    )) {
      if (message.source === "score") {
        // The score stream/updates are already scoped to this fixture via the
        // `?fixtureId=` query param, so records frequently omit the id. Allowing
        // missing ids here matches the snapshot path (latestRecord) — without it
        // every scoped score update is dropped and the live score never moves.
        const records = recordsFromPayload(message.payload)
          .filter((record) => matchesFixture(record, matchId, true))
          .sort((a, b) => recordTimestamp(a) - recordTimestamp(b));

        for (const record of records) {
          const updateId = txLineUpdateIdFromRecord(record, `${matchId}-score-${counter}`);
          if (seenScoreUpdates.has(updateId)) continue;

          const event = eventFromScoreRecord(record, fixture, counter, sentiment);
          seenScoreUpdates.add(updateId);
          if (seenScoreUpdates.size > 500) {
            const recent = [...seenScoreUpdates].slice(-250);
            seenScoreUpdates.clear();
            recent.forEach((id) => seenScoreUpdates.add(id));
          }
          if (snapshotEventIds.delete(event.id)) continue;

          counter += 1;
          score = extractScore(record);
          clock = extractClock(record, clock.phase);

          yield {
            atSecond: counter,
            event,
            clock,
            txlineUpdateId: updateId,
            snapshotGeneratedAt: new Date().toISOString(),
            score,
            sentiment
          };
        }
        continue;
      }

      const oddsRecord = bestSentimentRecord(recordsFromPayload(message.payload), matchId);
      if (!oddsRecord) continue;

      const nextSentiment = extractSentiment(oddsRecord, fixture, sentiment);
      if (nextSentiment.sourceUpdateId === lastSentimentSource) continue;

      sentiment = nextSentiment;
      lastSentimentSource = nextSentiment.sourceUpdateId;
      counter += 1;

      yield {
        atSecond: counter,
        event: {
          id: `odds-${matchId}-${nextSentiment.sourceUpdateId}`,
          minute: clock.minute,
          stoppage: clock.stoppage,
          type: "momentum",
          team: nextSentiment.trend === "neutral" ? undefined : nextSentiment.trend,
          title: "Market pulse moved",
          description:
            nextSentiment.trend === "neutral"
              ? `TxLINE consensus moved back toward a balanced read at ${fixture.home.shortName} ${nextSentiment.home}% / ${fixture.away.shortName} ${nextSentiment.away}%.`
              : `TxLINE consensus shifted toward ${nextSentiment.trend === "home" ? fixture.home.shortName : fixture.away.shortName} by ${nextSentiment.delta} points.`,
          impact: nextSentiment.delta >= 8 ? "high" : nextSentiment.delta >= 3 ? "medium" : "low",
          sentimentAfter: nextSentiment
        },
        clock,
        txlineUpdateId: nextSentiment.sourceUpdateId,
        snapshotGeneratedAt: new Date().toISOString(),
        score,
        sentiment: nextSentiment
      };
    }
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

function bestSentimentRecord(records: JsonRecord[], matchId: string) {
  return records
    .filter((record) => matchesFixture(record, matchId, true))
    .map((record) => ({ record, score: sentimentRecordScore(record) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || recordTimestamp(b.record) - recordTimestamp(a.record))[0]?.record;
}

function sentimentRecordScore(source: JsonRecord) {
  const names = stringArrayValue(source, ["PriceNames", "priceNames", "Names", "names", "outcomes"]);
  const percentages = numberArrayValue(source, ["Pct", "pct", "Percentages", "percentages", "ImpliedProbabilities", "impliedProbabilities"]);
  if (percentages.length < 2 || names.length < 2) return 0;

  const normalizedNames = names.map((name) => name.trim().toLowerCase());
  const marketType = stringValue(source, ["SuperOddsType", "superOddsType", "MarketType", "marketType"])?.toLowerCase() ?? "";
  const marketPeriod = stringValue(source, ["MarketPeriod", "marketPeriod"])?.toLowerCase() ?? "";
  const hasHome = normalizedNames.some((name) => ["1", "home", "participant1", "team1"].includes(name) || name.includes("home"));
  const hasAway = normalizedNames.some((name) => ["2", "away", "participant2", "team2"].includes(name) || name.includes("away"));
  const hasDraw = normalizedNames.some((name) => ["x", "draw", "tie"].includes(name));
  const isResultMarket = /(1x2|three.?way|match.?result|full.?time.?result|moneyline|winner)/.test(marketType);
  if (!(hasHome && hasAway) && !hasDraw && !isResultMarket) return 0;

  let score = 0;

  if (hasHome && hasAway) score += 40;
  if (hasDraw && percentages.length >= 3) score += 60;
  if (isResultMarket) score += 30;
  if (!marketPeriod || /(match|full|regular|all)/.test(marketPeriod)) score += 5;
  return score;
}

function matchesFixture(record: JsonRecord | undefined, matchId: string, allowMissingFixtureId: boolean) {
  const id = fixtureIdValue(record);
  return id ? id === matchId : allowMissingFixtureId;
}

function extractScore(source: JsonRecord | undefined) {
  return txLineScoreFromRecord(source);
}

function extractClock(source: JsonRecord | undefined, fallbackPhase: MatchSnapshot["clock"]["phase"]) {
  return txLineClockFromRecord(source, fallbackPhase);
}

function extractSentiment(source: JsonRecord | undefined, fixture: MatchFixture, fallback: MarketSentiment): MarketSentiment {
  const names = stringArrayValue(source, ["PriceNames", "priceNames", "Names", "names", "outcomes"]);
  const percentages = numberArrayValue(source, ["Pct", "pct", "Percentages", "percentages", "ImpliedProbabilities", "impliedProbabilities"]);
  const prices = numberArrayValue(source, ["Prices", "prices", "Odds", "odds"]);
  const implied = percentages.length ? percentages : prices.map((price) => (price > 0 ? 100 / price : 0));

  if (!implied.length) {
    return fallback;
  }

  const homeIndex = outcomeIndex(names, ["1", "home", "participant1", "team1", fixture.home.name, fixture.home.shortName], 0);
  const drawIndex = outcomeIndex(names, ["draw", "tie", "x"], implied.length === 3 ? 1 : -1);
  const awayIndex = outcomeIndex(names, ["2", "away", "participant2", "team2", fixture.away.name, fixture.away.shortName], implied.length === 3 ? 2 : 1);
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
    label:
      stringValue(source, ["Label", "label", "MarketName", "marketName", "SuperOddsType", "superOddsType", "MarketType", "marketType"]) ??
      "TxLINE market sentiment",
    sourceUpdateId:
      stringValue(source, ["MessageId", "messageId", "Id", "id", "UpdateId", "updateId", "Sequence", "sequence", "Ts", "ts", "Timestamp", "timestamp"]) ??
      fallback.sourceUpdateId
  };
}

function outcomeIndex(names: string[], needles: string[], fallback: number) {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
  const index = names.findIndex((name) => {
    const normalizedName = name.toLowerCase().trim();
    return normalizedNeedles.some((needle) => (needle.length <= 2 ? normalizedName === needle : normalizedName.includes(needle)));
  });
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
  return txLineEventTypeFromRecord(source);
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
  const normalizedSide = txLineTeamSideFromRecord(source);
  if (normalizedSide) return normalizedSide;

  const raw = stringValue(source, ["Team", "team", "TeamSide", "teamSide", "Participant", "participant", "ParticipantId", "participantId"])?.toLowerCase();
  if (!raw) return undefined;
  if (raw.includes("home") || raw.includes("participant1") || raw.includes("team1") || fixture.home.name.toLowerCase().includes(raw)) return "home";
  if (raw.includes("away") || raw.includes("participant2") || raw.includes("team2") || fixture.away.name.toLowerCase().includes(raw)) return "away";
  return undefined;
}
