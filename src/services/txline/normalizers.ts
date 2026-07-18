import type { EventType, MatchPhase, MatchSnapshot, TeamKey } from "../../lib/types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
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

function numberValue(source: JsonRecord | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
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

function soccerData(source: JsonRecord | undefined) {
  return asRecord(source?.dataSoccer) ?? asRecord(source?.DataSoccer);
}

function soccerPhase(source: JsonRecord | undefined, fallback: MatchPhase): MatchPhase {
  const raw = stringValue(source, [
    "statusSoccerId",
    "StatusSoccerId",
    "gameState",
    "GameState",
    "status",
    "Status",
    "phase",
    "Phase"
  ])
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!raw) return fallback;
  if (["NS", "NS2", "PRE", "SCHEDULED", "NOTSTARTED"].includes(raw)) return "pre";
  if (["HT", "HT2", "HTET", "HALF", "HALFTIME"].includes(raw)) return "half";
  if (["F", "F2", "FET", "FPE", "END", "FULL", "FINISHED", "COMPLETE", "COMPLETED"].includes(raw)) return "full";
  if (
    ["H1", "H11", "H2", "H21", "ET1", "ET2", "PE", "WET", "WPE", "LIVE", "INPLAY", "INPLAYING"].includes(raw)
  ) {
    return "live";
  }

  return fallback;
}

export function txLineScoreFromRecord(source: JsonRecord | undefined) {
  const nestedScore =
    asRecord(source?.scoreSoccer) ??
    asRecord(source?.ScoreSoccer) ??
    asRecord(source?.score) ??
    asRecord(source?.Score) ??
    asRecord(source?.currentScore) ??
    asRecord(source?.CurrentScore);
  const participant1 = asRecord(nestedScore?.Participant1) ?? asRecord(nestedScore?.participant1);
  const participant2 = asRecord(nestedScore?.Participant2) ?? asRecord(nestedScore?.participant2);
  const participant1Total = asRecord(participant1?.Total) ?? asRecord(participant1?.total);
  const participant2Total = asRecord(participant2?.Total) ?? asRecord(participant2?.total);
  const participant1Goals =
    numberValue(source, ["HomeScore", "homeScore", "Participant1Score", "participant1Score"]) ??
    numberValue(nestedScore, ["home", "Home", "Participant1Score", "participant1Score"]) ??
    numberValue(participant1Total, ["Goals", "goals"]) ??
    numberValue(participant1, ["Goals", "goals"]) ??
    0;
  const participant2Goals =
    numberValue(source, ["AwayScore", "awayScore", "Participant2Score", "participant2Score"]) ??
    numberValue(nestedScore, ["away", "Away", "Participant2Score", "participant2Score"]) ??
    numberValue(participant2Total, ["Goals", "goals"]) ??
    numberValue(participant2, ["Goals", "goals"]) ??
    0;
  const participant1IsHome = booleanValue(source, ["participant1IsHome", "Participant1IsHome"]) ?? true;

  return {
    home: Math.max(0, Math.round(participant1IsHome ? participant1Goals : participant2Goals)),
    away: Math.max(0, Math.round(participant1IsHome ? participant2Goals : participant1Goals))
  };
}

export function txLineClockFromRecord(
  source: JsonRecord | undefined,
  fallbackPhase: MatchSnapshot["clock"]["phase"]
): MatchSnapshot["clock"] {
  const clock = asRecord(source?.clock) ?? asRecord(source?.Clock);
  const data = soccerData(source);
  const seconds = numberValue(clock, ["seconds", "Seconds"]);
  const minute = Math.max(
    0,
    Math.floor(
      numberValue(data, ["Minutes", "minutes"]) ??
        numberValue(source, ["Minute", "minute", "MatchMinute", "matchMinute", "GameTime", "gameTime", "Elapsed", "elapsed"]) ??
        (seconds !== undefined ? seconds / 60 : 0)
    )
  );
  const stoppage = Math.max(
    0,
    Math.floor(numberValue(source, ["Stoppage", "stoppage", "AddedTime", "addedTime", "ExtraMinute", "extraMinute"]) ?? 0)
  );
  const running = booleanValue(clock, ["running", "Running"]);
  const basePhase = soccerPhase(source, fallbackPhase);
  const phase = seconds !== undefined && seconds > 0 && basePhase === "pre" ? (running === false ? "half" : "live") : basePhase;

  return {
    minute,
    stoppage,
    phase,
    label: minute ? (stoppage ? `${minute}+${stoppage}'` : `${minute}'`) : phase === "pre" ? "Pre-match" : phase === "half" ? "Half time" : phase === "full" ? "Full time" : "Live"
  };
}

export function txLineEventTypeFromRecord(source: JsonRecord | undefined): EventType {
  const data = soccerData(source);
  if (booleanValue(data, ["Goal", "goal"])) return "goal";
  if (booleanValue(data, ["RedCard", "redCard"])) return "red_card";
  if (booleanValue(data, ["YellowCard", "yellowCard"])) return "yellow_card";
  if (booleanValue(data, ["Corner", "corner"])) return "corner";
  if (booleanValue(data, ["VAR", "var"])) return "var";

  const raw = [
    stringValue(source, ["action", "Action", "eventType", "EventType", "type", "Type", "scoreType", "ScoreType"]),
    stringValue(data, ["Action", "action", "Type", "type"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (raw.includes("kickoff") || raw === "kick") return "kickoff";
  if (raw.includes("goal")) return "goal";
  if (raw.includes("red_card") || raw.includes("red card")) return "red_card";
  if (raw.includes("yellow_card") || raw.includes("yellow card")) return "yellow_card";
  if (raw.includes("corner")) return "corner";
  if (raw.includes("substitution") || raw.includes("substitute")) return "substitution";
  if (raw.includes("var")) return "var";
  if (raw.includes("full_time") || raw.includes("full time") || raw.includes("finished")) return "full_time";
  if (soccerPhase(source, "live") === "full") return "full_time";
  return "momentum";
}

export function txLineTeamSideFromRecord(source: JsonRecord | undefined): TeamKey | undefined {
  const data = soccerData(source);
  const participant =
    numberValue(data, ["Participant", "participant"]) ??
    numberValue(source, ["participant", "Participant", "participantId", "ParticipantId"]);
  const participant1Id = numberValue(source, ["participant1Id", "Participant1Id"]);
  const participant2Id = numberValue(source, ["participant2Id", "Participant2Id"]);
  const participant1IsHome = booleanValue(source, ["participant1IsHome", "Participant1IsHome"]) ?? true;

  if (participant !== undefined) {
    if (participant1Id !== undefined && participant === participant1Id) return participant1IsHome ? "home" : "away";
    if (participant2Id !== undefined && participant === participant2Id) return participant1IsHome ? "away" : "home";
    if (participant1Id === undefined && participant2Id === undefined && participant === 1) return participant1IsHome ? "home" : "away";
    if (participant1Id === undefined && participant2Id === undefined && participant === 2) return participant1IsHome ? "away" : "home";
  }

  const raw = stringValue(source, ["Team", "team", "TeamSide", "teamSide", "Participant", "participant"])?.toLowerCase();
  if (!raw) return undefined;
  if (raw.includes("home") || raw.includes("participant1") || raw.includes("team1")) return participant1IsHome ? "home" : "away";
  if (raw.includes("away") || raw.includes("participant2") || raw.includes("team2")) return participant1IsHome ? "away" : "home";
  return undefined;
}

export function txLineUpdateIdFromRecord(source: JsonRecord | undefined, fallback: string) {
  return (
    stringValue(source, ["seq", "Seq", "updateId", "UpdateId", "id", "Id", "eventId", "EventId"]) ??
    fallback
  );
}
