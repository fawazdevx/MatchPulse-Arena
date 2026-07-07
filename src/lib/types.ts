export type TeamKey = "home" | "away";

export type MatchPhase = "pre" | "live" | "half" | "full";

export type EventType =
  | "kickoff"
  | "goal"
  | "yellow_card"
  | "red_card"
  | "corner"
  | "substitution"
  | "momentum"
  | "var"
  | "full_time";

export type PredictionKind = "momentum" | "next_event" | "odds_shift" | "post_event";

export type BadgeId =
  | "first-read"
  | "hat-trick"
  | "five-star-fan"
  | "ice-cold"
  | "market-whisperer"
  | "momentum-master"
  | "goal-reader"
  | "red-card-prophet"
  | "late-drama"
  | "kickoff-crew"
  | "full-90"
  | "room-captain"
  | "crowd-favorite"
  | "perfect-half";

export interface Team {
  id: TeamKey;
  name: string;
  shortName: string;
  color: string;
  crest: string;
  record: string;
}

export interface MarketSentiment {
  home: number;
  draw: number;
  away: number;
  trend: TeamKey | "neutral";
  delta: number;
  label: string;
  sourceUpdateId: string;
}

export interface MatchFixture {
  id: string;
  competition: string;
  stage: string;
  venue: string;
  kickoffIso: string;
  status: MatchPhase;
  featured: boolean;
  home: Team;
  away: Team;
  creatorRoom?: CreatorRoom;
}

export interface MatchEvent {
  id: string;
  minute: number;
  stoppage?: number;
  type: EventType;
  team?: TeamKey;
  title: string;
  description: string;
  impact: "low" | "medium" | "high";
  sentimentAfter?: MarketSentiment;
}

export interface MatchSnapshot {
  fixture: MatchFixture;
  clock: {
    minute: number;
    stoppage: number;
    phase: MatchPhase;
    label: string;
  };
  score: {
    home: number;
    away: number;
  };
  sentiment: MarketSentiment;
  events: MatchEvent[];
  generatedAt: string;
  provider: "mock-txline" | "txline";
}

export interface PredictionOption {
  id: string;
  label: string;
  team?: TeamKey;
}

export interface PredictionCard {
  id: string;
  kind: PredictionKind;
  prompt: string;
  context: string;
  options: PredictionOption[];
  lockAt: number;
  resolvesAt: number;
  sponsor?: {
    name: string;
    label: string;
  };
  source: {
    stream: "score" | "odds";
    endpoint: string;
    expectedSignal: string;
  };
  resolved?: {
    optionId: string;
    eventId: string;
    explanation: string;
  };
}

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  tone: "bronze" | "silver" | "gold" | "platinum" | "creator";
}

export interface LeaderboardUser {
  id: string;
  name: string;
  avatar: string;
  points: number;
  streak: number;
  bestStreak: number;
  badges: BadgeId[];
  trend: "up" | "down" | "same";
}

export interface CreatorRoom {
  creatorName: string;
  handle: string;
  avatar: string;
  themeColor: string;
  sponsor: string;
  inviteCode: string;
}

export interface ReplayTick {
  atSecond: number;
  event: MatchEvent;
  score?: {
    home: number;
    away: number;
  };
  sentiment: MarketSentiment;
  prediction?: PredictionCard;
}

export interface TxLineAdapter {
  getFixtures(): Promise<MatchFixture[]>;
  getSnapshot(matchId: string): Promise<MatchSnapshot>;
  getReplayTicks(matchId: string): AsyncGenerator<ReplayTick>;
  getLiveTicks?(matchId: string): AsyncGenerator<ReplayTick>;
}
