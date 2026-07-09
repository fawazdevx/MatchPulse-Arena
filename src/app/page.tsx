"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bolt,
  CheckCircle2,
  CircleHelp,
  Code2,
  Crown,
  Flame,
  Gauge,
  Goal,
  LineChart,
  ListRestart,
  Medal,
  Play,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
  XCircle
} from "lucide-react";
import type {
  BadgeId,
  LeaderboardUser,
  MatchEvent,
  MatchFixture,
  MatchSnapshot,
  PredictionCard,
  ReplayTick,
  TeamKey
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamCrest } from "@/components/TeamCrest";
import { badgeById, badges } from "@/services/game/badges";
import { txLineEndpoints } from "@/services/txline/endpoints";

type Screen = "home" | "room" | "leaderboard" | "passport" | "creator" | "analytics" | "replay" | "tech";
type PredictionState = "waiting" | "active" | "answered" | "locked" | "resolved";
type SnapshotState = "idle" | "loading" | "ready" | "error";

interface FanState {
  points: number;
  streak: number;
  bestStreak: number;
  badges: BadgeId[];
  correct: number;
  answered: number;
  oddsCorrect: number;
  momentumCorrect: number;
  perfectHalf: boolean;
}

interface ResolvedPrediction {
  card: PredictionCard;
  selectedOptionId: string;
  correct: boolean;
  points: number;
  eventId?: string;
  explanation: string;
}

interface CreatorConfig {
  creatorName: string;
  handle: string;
  sponsor: string;
  themeColor: string;
  inviteCode: string;
}

interface SetupState {
  message: string;
  missing?: string[];
  set?: string;
}

interface AuthUser {
  id: string;
  walletAddress: string;
  name: string;
  avatar: string;
  points: number;
  streak: number;
  bestStreak: number;
  badges: BadgeId[];
}

interface InjectedSolanaWallet {
  publicKey?: { toBase58(): string };
  connect(): Promise<{ publicKey?: { toBase58(): string } } | void>;
  disconnect?(): Promise<void>;
  signTransaction?<T>(transaction: T): Promise<T>;
  signAllTransactions?<T>(transactions: T[]): Promise<T[]>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<Uint8Array | { signature: Uint8Array }>;
}

declare global {
  interface Window {
    phantom?: {
      solana?: InjectedSolanaWallet;
    };
    solflare?: InjectedSolanaWallet;
  }
}

const defaultFan: FanState = {
  points: 0,
  streak: 0,
  bestStreak: 0,
  badges: [],
  correct: 0,
  answered: 0,
  oddsCorrect: 0,
  momentumCorrect: 0,
  perfectHalf: false
};

const eventIcon = {
  kickoff: Play,
  goal: Goal,
  yellow_card: ShieldCheck,
  red_card: XCircle,
  corner: Activity,
  substitution: RefreshCw,
  momentum: Gauge,
  var: CircleHelp,
  full_time: CheckCircle2
};

const badgeToneClass = {
  bronze: "border-[#D99A55]/30 bg-[#D99A55]/[0.12] text-[#ffd699]",
  silver: "border-[#B8C4D6]/30 bg-[#C9D5EA]/[0.12] text-[#E3EDFF]",
  gold: "border-[#ffcc00]/[0.32] bg-[#ffcc00]/[0.14] text-[#ffe066]",
  platinum: "border-[#82A7FF]/[0.32] bg-[#82A7FF]/[0.14] text-[#C8D7FF]",
  creator: "border-[#B79CFF]/[0.32] bg-[#8B5CFF]/[0.16] text-[#E4D9FF]"
};

const teamSideClass = {
  home: "text-left",
  away: "text-right"
};

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getInjectedSolanaWallet() {
  if (typeof window === "undefined") return null;
  return window.phantom?.solana ?? window.solflare ?? null;
}

function shellClock(fixture: MatchFixture): MatchSnapshot["clock"] {
  return {
    minute: 0,
    stoppage: 0,
    phase: fixture.status,
    label: fixture.status === "pre" ? formatKickoff(fixture.kickoffIso) : fixture.status === "full" ? "Full time" : "Live"
  };
}

function shellSentiment(fixture: MatchFixture): MatchSnapshot["sentiment"] {
  return {
    home: 33,
    draw: 34,
    away: 33,
    trend: "neutral",
    delta: 0,
    label: `Awaiting TxLINE sentiment for ${fixture.home.shortName} vs ${fixture.away.shortName}`,
    sourceUpdateId: "pending"
  };
}

function roomShellSnapshot(fixture: MatchFixture): MatchSnapshot {
  return {
    fixture,
    clock: shellClock(fixture),
    score: { home: 0, away: 0 },
    sentiment: shellSentiment(fixture),
    events: [],
    generatedAt: new Date().toISOString(),
    provider: "txline"
  };
}

function roomIdForMatch(matchId?: string) {
  return matchId ? `room-${matchId}` : undefined;
}

function scorePrediction(card: PredictionCard, selectedOptionId: string, fan: FanState, resolvingEvent?: MatchEvent) {
  const correct = card.resolved?.optionId === selectedOptionId;
  const nextStreak = correct ? fan.streak + 1 : 0;
  const fastBonus = correct && fan.answered % 2 === 0 ? 25 : 0;
  const rareBonus = correct && resolvingEvent?.impact === "high" ? 100 : correct && resolvingEvent?.minute && resolvingEvent.minute >= 80 ? 75 : 0;
  const points = correct ? 100 + nextStreak * 10 + fastBonus + rareBonus : 0;

  return {
    correct,
    nextStreak,
    points,
    explanation: card.resolved?.explanation ?? "Resolved from the latest TxLINE-style update."
  };
}

function nextBadges(fan: FanState, card: PredictionCard, result: ReturnType<typeof scorePrediction>, event?: MatchEvent) {
  if (!result.correct) {
    return [];
  }

  const earned = new Set<BadgeId>();

  if (fan.correct === 0) earned.add("first-read");
  if (result.nextStreak >= 3) earned.add("hat-trick");
  if (result.nextStreak >= 5) earned.add("five-star-fan");
  if (result.nextStreak >= 10) earned.add("ice-cold");
  if ((card.kind === "odds_shift" || card.kind === "post_event") && fan.oddsCorrect + 1 >= 5) earned.add("market-whisperer");
  if (card.kind === "momentum" && fan.momentumCorrect + 1 >= 10) earned.add("momentum-master");
  if (event?.type === "goal") earned.add("goal-reader");
  if (event?.type === "red_card") earned.add("red-card-prophet");
  if ((event?.minute ?? 0) >= 80) earned.add("late-drama");
  if (fan.answered + 1 >= 4 && result.nextStreak >= 4 && !fan.perfectHalf) earned.add("perfect-half");

  return [...earned].filter((badge) => !fan.badges.includes(badge));
}

function predictionFromTick(tick: ReplayTick, fixture: MatchFixture): PredictionCard {
  const trend = tick.sentiment.trend;
  const favored = trend === "away" ? "away" : "home";
  const lockAt = Math.max(0, tick.event.minute + 1);
  const resolvesAt = Math.max(lockAt + 1, tick.event.minute + 3);

  return {
    id: `txline-${tick.event.id}`,
    kind: tick.event.type === "momentum" ? "momentum" : "next_event",
    prompt:
      tick.event.type === "goal" || tick.event.type === "red_card"
        ? "Which side will the next market reaction favor?"
        : "Which side is gaining match pulse from this update?",
    context: `${tick.event.title}: ${tick.event.description}`,
    options: [
      { id: "home", label: fixture.home.shortName, team: "home" },
      { id: "neutral", label: "Balanced pulse" },
      { id: "away", label: fixture.away.shortName, team: "away" }
    ],
    lockAt,
    resolvesAt,
    source: {
      stream: "score",
      endpoint: "/api/scores/stream",
      expectedSignal: tick.event.type
    },
    resolved: {
      optionId: trend === "neutral" ? "neutral" : favored,
      eventId: tick.event.id,
      explanation: `Resolved by TxLINE update ${tick.event.id}.`
    }
  };
}

function useLocalFan() {
  const [fan, setFan] = useState<FanState>(defaultFan);

  useEffect(() => {
    const raw = window.localStorage.getItem("matchpulse-fan-v2");
    if (raw) {
      setFan(JSON.parse(raw) as FanState);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("matchpulse-fan-v2", JSON.stringify(fan));
  }, [fan]);

  return [fan, setFan] as const;
}

export default function MatchPulseArena() {
  const [screen, setScreen] = useState<Screen>("home");
  const [fixtures, setFixtures] = useState<MatchFixture[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [sentiment, setSentiment] = useState<MatchSnapshot["sentiment"] | null>(null);
  const [clock, setClock] = useState<MatchSnapshot["clock"] | null>(null);
  const [activePrediction, setActivePrediction] = useState<PredictionCard | null>(null);
  const [predictionState, setPredictionState] = useState<PredictionState>("waiting");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [resolvedPredictions, setResolvedPredictions] = useState<ResolvedPrediction[]>([]);
  const [fan, setFan] = useLocalFan();
  const [roomLeaderboard, setRoomLeaderboard] = useState<LeaderboardUser[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: string; badge: BadgeId }>>([]);
  const [streamStatus, setStreamStatus] = useState<"idle" | "connected" | "complete" | "error">("idle");
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>("idle");
  const [snapshotQuality, setSnapshotQuality] = useState<"live" | "delayed">("live");
  const [liveUpdateAt, setLiveUpdateAt] = useState<number | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [creatorConfig, setCreatorConfig] = useState<CreatorConfig>({
    creatorName: "",
    handle: "",
    sponsor: "",
    themeColor: "#22D391",
    inviteCode: ""
  });
  const [lastTick, setLastTick] = useState<ReplayTick | null>(null);
  const [momentumHistory, setMomentumHistory] = useState<number[]>([]);
  const [walletUser, setWalletUser] = useState<AuthUser | null>(null);
  const [walletStatus, setWalletStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [walletError, setWalletError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const liveStartedForRef = useRef<string | null>(null);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedMatchId) ?? snapshot?.fixture ?? fixtures[0],
    [fixtures, selectedMatchId, snapshot]
  );

  const topRank = useMemo(() => {
    const currentUser: LeaderboardUser = {
      id: walletUser?.id ?? "you",
      name: walletUser?.name ?? "Guest fan",
      avatar: walletUser?.avatar ?? "YOU",
      points: fan.points,
      streak: fan.streak,
      bestStreak: fan.bestStreak,
      badges: fan.badges,
      trend: fan.points ? "up" : "same"
    };
    const withoutCurrent = roomLeaderboard.filter((user) => user.id !== currentUser.id && user.id !== "you");
    const withYou = [currentUser, ...withoutCurrent];

    return withYou.sort((a, b) => b.points - a.points);
  }, [fan, roomLeaderboard, walletUser]);

  const currentUserId = walletUser?.id ?? "you";
  const currentRank = topRank.findIndex((user) => user.id === currentUserId) + 1;
  const selectedRoomId = roomIdForMatch(selectedFixture?.id);

  const loadSnapshot = useCallback(async (matchId: string) => {
    sourceRef.current?.close();
    sourceRef.current = null;
    liveStartedForRef.current = null;
    setSnapshotState("loading");
    setRoomNotice(null);
    const response = await fetch(`/api/txline/matches/${matchId}/snapshot`, { cache: "no-store" });
    const data = (await response.json()) as MatchSnapshot & { error?: string; missing?: string[]; set?: string };
    if (!response.ok || data.error) {
      setSnapshotState("error");
      setSnapshotQuality("delayed");
      throw new Error(data.error ?? "Could not load TxLINE snapshot.");
    }
    setSnapshotQuality(data.dataQuality === "delayed" ? "delayed" : "live");
    setRoomNotice(data.notice ?? null);
    setSnapshot(data);
    setSelectedMatchId(matchId);
    setEvents(data.events);
    setScore(data.score);
    setSentiment(data.sentiment);
    setClock(data.clock);
    setActivePrediction(null);
    setPredictionState("waiting");
    setSelectedOption(null);
    setStreamStatus("idle");
    setMomentumHistory([]);
    setSnapshotState("ready");
  }, []);

  const enterRoom = useCallback(
    async (matchId: string) => {
      const fixture = fixtures.find((item) => item.id === matchId) ?? selectedFixture;
      if (fixture) {
        const shell = roomShellSnapshot(fixture);
        setSnapshot(shell);
        setSelectedMatchId(matchId);
        setEvents([]);
        setScore(shell.score);
        setSentiment(shell.sentiment);
        setClock(shell.clock);
        setActivePrediction(null);
        setPredictionState("waiting");
        setSelectedOption(null);
        setMomentumHistory([]);
        setSnapshotQuality("delayed");
      }

      setScreen("room");
      await loadSnapshot(matchId);
    },
    [fixtures, loadSnapshot, selectedFixture]
  );

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      const fixtureResponse = await fetch("/api/txline/fixtures", { cache: "no-store" });
      const fixtureData = (await fixtureResponse.json()) as { fixtures?: MatchFixture[]; error?: string; missing?: string[]; set?: string };
      if (!alive) return;

      if (!fixtureResponse.ok || fixtureData.error) {
        setFixtures([]);
        setSetupState({
          message: fixtureData.error ?? "TxLINE live mode is not configured.",
          missing: fixtureData.missing,
          set: fixtureData.set
        });
        return;
      }

      setSetupState(null);
      setFixtures(fixtureData.fixtures ?? []);
      setIsLoadingFixtures(false);

      const firstMatchId = fixtureData.fixtures?.[0]?.id;
      if (firstMatchId) {
        void loadSnapshot(firstMatchId).catch((error) => {
          setRoomNotice(error instanceof Error ? error.message : "Could not load TxLINE match snapshot.");
        });
      }
    }

    bootstrap()
      .catch((error) => {
        setSetupState({ message: error instanceof Error ? error.message : "Could not load TxLINE fixtures." });
        setStreamStatus("error");
      })
      .finally(() => {
        if (alive) setIsLoadingFixtures(false);
      });

    return () => {
      alive = false;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    fetch(`/api/game/state${selectedRoomId ? `?roomId=${encodeURIComponent(selectedRoomId)}` : ""}`)
      .then((response) => response.json())
      .then((data: { leaderboard: LeaderboardUser[] }) => {
        if (data.leaderboard?.length) {
          setRoomLeaderboard(data.leaderboard);
        }
      })
      .catch(() => undefined);
  }, [selectedRoomId]);

  const resolvePrediction = useCallback(
    async (card: PredictionCard, event?: MatchEvent) => {
      if (!selectedOption || predictionState === "resolved") {
        return;
      }

      const fallbackResult = scorePrediction(card, selectedOption, fan, event);
      let result = fallbackResult;
      let unlocked = nextBadges(fan, card, fallbackResult, event);
      let serverExplanation = fallbackResult.explanation;
      let serverTotals: { points?: number; bestStreak?: number } = {};

      const answerResponse = walletUser
        ? await fetch("/api/game/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              predictionId: card.id,
              optionId: selectedOption,
              answeredAtMs: Math.round(performance.now()),
              txlineEventId: event?.id,
              roomId: selectedRoomId,
              prediction: card,
              resolvingEvent: event,
              fan
            })
          }).catch(() => null)
        : null;

      if (answerResponse?.ok) {
        const serverResult = (await answerResponse.json()) as {
          serverCalculated?: boolean;
          correct?: boolean;
          pointsAwarded?: number;
          nextPoints?: number;
          nextStreak?: number;
          nextBestStreak?: number;
          badgesUnlocked?: BadgeId[];
          explanation?: string;
        };

        if (serverResult.serverCalculated && typeof serverResult.correct === "boolean") {
          result = {
            correct: serverResult.correct,
            nextStreak: serverResult.nextStreak ?? fallbackResult.nextStreak,
            points: serverResult.pointsAwarded ?? fallbackResult.points,
            explanation: serverResult.explanation ?? fallbackResult.explanation
          };
          unlocked = serverResult.badgesUnlocked ?? unlocked;
          serverExplanation = result.explanation;
          serverTotals = {
            points: serverResult.nextPoints,
            bestStreak: serverResult.nextBestStreak
          };
        }
      } else if (walletUser && answerResponse) {
        const serverResult = (await answerResponse.json().catch(() => null)) as { error?: string } | null;
        setWalletError(serverResult?.error ?? "Your answer was scored locally but could not be saved.");
      }

      const nextFan: FanState = {
        ...fan,
        points: serverTotals.points ?? fan.points + result.points,
        streak: result.nextStreak,
        bestStreak: serverTotals.bestStreak ?? Math.max(fan.bestStreak, result.nextStreak),
        badges: [...fan.badges, ...unlocked],
        correct: fan.correct + (result.correct ? 1 : 0),
        answered: fan.answered + 1,
        oddsCorrect: fan.oddsCorrect + (result.correct && (card.kind === "odds_shift" || card.kind === "post_event") ? 1 : 0),
        momentumCorrect: fan.momentumCorrect + (result.correct && card.kind === "momentum" ? 1 : 0),
        perfectHalf: fan.perfectHalf || unlocked.includes("perfect-half")
      };
      const currentUserIdForUpdate = walletUser?.id ?? "you";

      setFan(nextFan);
      setPredictionState("resolved");
      setResolvedPredictions((current) => [
        {
          card,
          selectedOptionId: selectedOption,
          correct: result.correct,
          points: result.points,
          eventId: event?.id,
          explanation: serverExplanation
        },
        ...current
      ]);
      setRoomLeaderboard((current) =>
        current.some((user) => user.id === currentUserIdForUpdate)
          ? current.map((user) =>
              user.id === currentUserIdForUpdate
                ? {
                    ...user,
                    points: nextFan.points,
                    streak: nextFan.streak,
                    bestStreak: nextFan.bestStreak,
                    badges: nextFan.badges,
                    trend: "up"
                  }
                : user
            )
          : [
              {
                id: currentUserIdForUpdate,
                name: walletUser?.name ?? "Guest fan",
                avatar: walletUser?.avatar ?? "YOU",
                points: nextFan.points,
                streak: nextFan.streak,
                bestStreak: nextFan.bestStreak,
                badges: nextFan.badges,
                trend: "up"
              },
              ...current
            ]
      );

      if (unlocked.length) {
        setToasts((current) => [...current, ...unlocked.map((badge) => ({ id: `${badge}-${Date.now()}`, badge }))]);
        window.setTimeout(() => {
          setToasts((current) => current.slice(unlocked.length));
        }, 3600);
      }

      fetch(`/api/game/state${selectedRoomId ? `?roomId=${encodeURIComponent(selectedRoomId)}` : ""}`)
        .then((response) => response.json())
        .then((data: { leaderboard: LeaderboardUser[] }) => {
          if (data.leaderboard?.length) {
            setRoomLeaderboard(data.leaderboard);
          }
        })
        .catch(() => undefined);
    },
    [fan, predictionState, selectedOption, selectedRoomId, setFan, walletUser]
  );

  const applyTick = useCallback(
    (tick: ReplayTick) => {
      if (!selectedFixture) return;

      setLiveUpdateAt(Date.now());
      window.setTimeout(() => setLiveUpdateAt(null), 2600);
      setLastTick(tick);
      setEvents((current) => [tick.event, ...current].slice(0, 12));
      setSentiment(tick.sentiment);
      setMomentumHistory((current) => {
        const share = tick.sentiment.home + tick.sentiment.away;
        const point = share > 0 ? Math.round((tick.sentiment.home / share) * 100) : 50;
        return [...current, point].slice(-24);
      });
      setClock({
        minute: tick.event.minute,
        stoppage: tick.event.stoppage ?? 0,
        phase: tick.event.type === "full_time" ? "full" : "live",
        label: tick.event.stoppage ? `${tick.event.minute}+${tick.event.stoppage}'` : `${tick.event.minute}'`
      });

      if (tick.score) {
        setScore(tick.score);
      }

      if (activePrediction && selectedOption && predictionState !== "resolved") {
        const resolvingCard = tick.resolvedPrediction ?? (activePrediction.resolved ? activePrediction : null);
        if (resolvingCard) {
          void resolvePrediction(resolvingCard, tick.event);
        }
      }

      const nextPrediction = tick.prediction ?? (tick.dataQuality === "delayed" ? null : predictionFromTick(tick, selectedFixture));
      if (nextPrediction && nextPrediction.id !== activePrediction?.id) {
        window.setTimeout(() => {
          setActivePrediction((current) => {
            if (current?.id === nextPrediction.id) return current;
            return nextPrediction;
          });
          setPredictionState("active");
          setSelectedOption(null);
        }, 900);
      }
    },
    [activePrediction, predictionState, resolvePrediction, selectedFixture, selectedOption]
  );

  const startStream = useCallback((mode: "live" | "replay" = "live") => {
    if (!selectedFixture) return;

    sourceRef.current?.close();
    setIsReplaying(mode === "replay");
    setStreamStatus("connected");
    const source = new EventSource(`/api/txline/matches/${selectedFixture.id}/stream?mode=${mode}`);
    sourceRef.current = source;

    source.addEventListener("connected", () => setStreamStatus("connected"));
    source.addEventListener("tick", (message) => {
      applyTick(JSON.parse((message as MessageEvent).data) as ReplayTick);
    });
    source.addEventListener("complete", () => {
      setStreamStatus("complete");
      setIsReplaying(false);
      source.close();
    });
    source.addEventListener("error", () => {
      setStreamStatus("error");
      setIsReplaying(false);
      source.close();
    });
  }, [applyTick, selectedFixture]);

  const startReplay = useCallback(() => startStream("replay"), [startStream]);
  const startLive = useCallback(() => startStream("live"), [startStream]);

  useEffect(() => {
    if (!selectedFixture || !snapshot || setupState) return;
    if (liveStartedForRef.current === selectedFixture.id) return;

    liveStartedForRef.current = selectedFixture.id;
    startLive();
  }, [selectedFixture, setupState, snapshot, startLive]);

  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  useEffect(() => {
    fetch("/api/auth/wallet/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { authenticated?: boolean; user?: AuthUser }) => {
        if (data.authenticated && data.user) {
          setWalletUser(data.user);
          setWalletStatus("connected");
          setFan((current) => ({
            ...current,
            points: data.user?.points ?? current.points,
            streak: data.user?.streak ?? current.streak,
            bestStreak: data.user?.bestStreak ?? current.bestStreak,
            badges: data.user?.badges?.length ? data.user.badges : current.badges
          }));
        }
      })
      .catch(() => undefined);
  }, [setFan]);

  const connectWallet = async () => {
    setWalletStatus("connecting");
    setWalletError(null);

    try {
      const wallet = getInjectedSolanaWallet();
      if (!wallet) {
        throw new Error("Install Phantom or Solflare, then reload MatchPulse Arena.");
      }

      const connectionResult = await wallet.connect();
      const walletAddress = connectionResult?.publicKey?.toBase58() ?? wallet.publicKey?.toBase58();
      if (!walletAddress) {
        throw new Error("Wallet connected, but no public key was returned.");
      }

      const nonceResponse = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress })
      });
      const noncePayload = (await nonceResponse.json()) as { sessionId?: string; message?: string; error?: string };
      if (!nonceResponse.ok || !noncePayload.sessionId || !noncePayload.message) {
        throw new Error(noncePayload.error ?? "Could not start wallet sign-in.");
      }

      const signatureResult = await wallet.signMessage(new TextEncoder().encode(noncePayload.message), "utf8");
      const signatureBytes = signatureResult instanceof Uint8Array ? signatureResult : signatureResult.signature;
      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: noncePayload.sessionId,
          walletAddress,
          signature: bytesToBase64(signatureBytes)
        })
      });
      const verifyPayload = (await verifyResponse.json()) as { user?: AuthUser; error?: string };
      if (!verifyResponse.ok || !verifyPayload.user) {
        throw new Error(verifyPayload.error ?? "Wallet signature was rejected.");
      }

      setWalletUser(verifyPayload.user);
      setWalletStatus("connected");
      setFan((current) => ({
        ...current,
        points: verifyPayload.user?.points ?? current.points,
        streak: verifyPayload.user?.streak ?? current.streak,
        bestStreak: verifyPayload.user?.bestStreak ?? current.bestStreak,
        badges: verifyPayload.user?.badges?.length ? verifyPayload.user.badges : current.badges
      }));
    } catch (error) {
      setWalletStatus("error");
      setWalletError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  };

  const disconnectWallet = async () => {
    await fetch("/api/auth/wallet/logout", { method: "POST" }).catch(() => undefined);
    await getInjectedSolanaWallet()?.disconnect?.().catch(() => undefined);
    setWalletUser(null);
    setWalletStatus("idle");
    setWalletError(null);
  };

  const handleAnswer = (optionId: string) => {
    if (!activePrediction || predictionState === "locked" || predictionState === "resolved") {
      return;
    }

    setSelectedOption(optionId);
    setPredictionState("answered");
    window.setTimeout(() => setPredictionState((state) => (state === "answered" ? "locked" : state)), 1300);
  };

  const refreshLiveData = async () => {
    sourceRef.current?.close();
    setResolvedPredictions([]);
    setToasts([]);
    const matchId = selectedMatchId || fixtures[0]?.id;
    if (matchId) {
      await loadSnapshot(matchId);
    }
    setIsReplaying(false);
  };

  return (
    <main className="arena-shell min-h-screen text-white">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.07] bg-[#02070a]/[0.82] shadow-[0_1px_0_rgba(255,255,255,0.04),0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-2 px-3 sm:px-4">
          <button className="group flex items-center gap-2 text-left" onClick={() => setScreen("home")} aria-label="Go to match list">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0F3D2E,#22D391)] text-sm font-black text-white shadow-[0_12px_34px_rgba(34,211,145,0.24)] transition group-hover:scale-105">MP</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-normal text-white">MatchPulse Arena</span>
              <span className="block truncate text-xs font-medium text-white/[0.54] max-[360px]:hidden">World Cup live room</span>
            </span>
          </button>
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant={streamStatus === "connected" ? "live" : "secondary"} className={cn("gap-2", streamStatus === "connected" && "live-dot")}>
              <Radio className="h-3 w-3" />
              {streamStatus === "connected" ? "Live stream" : setupState ? "Setup needed" : "Live ready"}
            </Badge>
            <Button size="sm" variant="outline" onClick={refreshLiveData}>
              <ListRestart className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <Button
            size="sm"
            variant={walletUser ? "success" : walletStatus === "error" ? "outline" : "secondary"}
            onClick={walletUser ? disconnectWallet : connectWallet}
            title={walletError ?? (walletUser ? `Saved to ${walletUser.walletAddress.slice(0, 4)}...${walletUser.walletAddress.slice(-4)}` : "Save your points, streak and badges")}
            disabled={walletStatus === "connecting"}
          >
            <Wallet className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">
              {walletUser ? `${walletUser.walletAddress.slice(0, 4)}...${walletUser.walletAddress.slice(-4)}` : walletStatus === "connecting" ? "Saving" : "Save progress"}
            </span>
          </Button>
          <Button size="sm" variant="pulse" onClick={startLive} disabled={!selectedFixture}>
            <Play className="mr-2 h-4 w-4" />
            <span className="max-[340px]:sr-only">Live</span>
          </Button>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-screen-2xl gap-4 px-4 pb-28 pt-20 sm:gap-5 sm:px-5 md:px-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6 lg:pb-8 xl:grid-cols-[256px_minmax(0,1fr)_312px] 2xl:grid-cols-[280px_minmax(0,1fr)_336px]">
        <aside className="hidden lg:block">
          <NavRail current={screen} onChange={setScreen} rank={currentRank} streak={fan.streak} />
        </aside>

        <section className="min-w-0">
          {screen === "home" && (
            <HomeScreen
              fixtures={fixtures}
              selectedMatchId={selectedMatchId}
              loading={isLoadingFixtures}
              setupState={setupState}
              onSelect={(matchId) => {
                void enterRoom(matchId).catch((error) => {
                  setSnapshotState("error");
                  setRoomNotice(error instanceof Error ? error.message : "Could not load TxLINE match snapshot.");
                });
              }}
              onLive={startLive}
            />
          )}

          {screen === "room" && selectedFixture && sentiment && clock && (
            <RoomScreen
              fixture={selectedFixture}
              score={score}
              clock={clock}
              sentiment={sentiment}
              events={events}
              activePrediction={activePrediction}
              predictionState={predictionState}
              selectedOption={selectedOption}
              onAnswer={handleAnswer}
              fan={fan}
              resolved={resolvedPredictions[0]}
              streamStatus={streamStatus}
              onReplay={startLive}
              isReplaying={isReplaying}
              lastTick={lastTick}
              liveUpdateAt={liveUpdateAt}
              snapshotState={snapshotState}
              snapshotQuality={snapshotQuality}
              roomNotice={roomNotice}
              momentumHistory={momentumHistory}
              onCreator={() => setScreen("creator")}
            />
          )}

          {screen === "leaderboard" && <LeaderboardScreen users={topRank} currentRank={currentRank} />}
          {screen === "passport" && <PassportScreen fan={fan} resolved={resolvedPredictions} />}
          {screen === "creator" && (
            <CreatorScreen
              fixture={selectedFixture}
              config={creatorConfig}
              onConfig={setCreatorConfig}
              onCaptain={() => {
                if (!fan.badges.includes("room-captain")) {
                  setFan({ ...fan, badges: [...fan.badges, "room-captain"] });
                  setToasts((current) => [...current, { id: `room-captain-${Date.now()}`, badge: "room-captain" }]);
                }
              }}
            />
          )}
          {screen === "analytics" && <AnalyticsScreen users={topRank} events={events} />}
          {screen === "replay" && (
            <ReplayScreen
              isReplaying={isReplaying}
              status={streamStatus}
              onReplay={startReplay}
              onReset={refreshLiveData}
              events={events}
              resolved={resolvedPredictions}
            />
          )}
          {screen === "tech" && <TechScreen />}
        </section>

        <aside className="hidden xl:block">
          <RightRail fan={fan} users={topRank} onScreen={setScreen} />
        </aside>
      </div>

      <MobileTabs current={screen} onChange={setScreen} />
      <ToastStack toasts={toasts} />
    </main>
  );
}

function NavRail({ current, onChange, rank, streak }: { current: Screen; onChange: (screen: Screen) => void; rank: number; streak: number }) {
  const items: Array<{ id: Screen; label: string; icon: typeof Activity }> = [
    { id: "home", label: "Matches", icon: Trophy },
    { id: "room", label: "Live room", icon: Radio },
    { id: "leaderboard", label: "Leaderboard", icon: Crown },
    { id: "passport", label: "Passport", icon: Medal },
    { id: "creator", label: "Creator Cup", icon: Sparkles },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "replay", label: "Replay", icon: ListRestart },
    { id: "tech", label: "TxLINE notes", icon: Code2 }
  ];

  return (
    <div className="sticky top-20 space-y-4">
      <Card className="glass-card overflow-hidden border-0 text-white">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.52]">Your room status</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
              <p className="text-xs text-white/[0.56]">Room rank</p>
              <p className="text-2xl font-black">{rank ? `#${rank}` : "Live"}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
              <p className="text-xs text-white/[0.56]">Pulse streak</p>
              <p className="text-2xl font-black">{streak}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card-soft border-0">
        <CardContent className="space-y-1 p-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold text-white/[0.58] transition hover:bg-white/10 hover:text-white",
                  current === item.id && "bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                )}
                onClick={() => onChange(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function HomeScreen({
  fixtures,
  selectedMatchId,
  loading,
  setupState,
  onSelect,
  onLive
}: {
  fixtures: MatchFixture[];
  selectedMatchId: string;
  loading: boolean;
  setupState: SetupState | null;
  onSelect: (matchId: string) => void;
  onLive: () => void;
}) {
  const featuredMatchId = selectedMatchId || fixtures[0]?.id || "";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-[linear-gradient(135deg,rgba(18,42,84,0.96),rgba(6,11,24,0.92))] text-white shadow-[0_34px_110px_rgba(0,0,0,0.38)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_10%,rgba(47,140,255,0.34),transparent_24rem),radial-gradient(circle_at_12%_92%,rgba(32,227,178,0.16),transparent_22rem)]" />
        <div className="pulse-grid relative grid gap-5 p-5 sm:grid-cols-[1.12fr_0.88fr] sm:p-7 lg:p-9">
          <div>
            <Badge variant="live" className="mb-4 gap-2 live-dot border-white/[0.18] bg-white/10 text-white">
              No-money prediction arena
            </Badge>
            <h1 className="max-w-xl text-balance text-[2.35rem] font-black leading-[1.02] tracking-normal sm:text-6xl">
              Read the World Cup pulse before the room does.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              Join live watch rooms, answer fast micro-predictions, build a Pulse Streak, and climb creator leaderboards powered by TxLINE match and sentiment updates.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="success" onClick={() => featuredMatchId && onSelect(featuredMatchId)} disabled={!featuredMatchId}>
                <Radio className="mr-2 h-4 w-4" />
                Join featured room
              </Button>
              <Button variant="secondary" onClick={onLive} disabled={!featuredMatchId}>
                <Play className="mr-2 h-4 w-4" />
                Connect live stream
              </Button>
            </div>
          </div>
          <div className="glass-card-soft rounded-[1.35rem] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/70">Creator Cup preview</p>
              <Sparkles className="h-5 w-5 text-[#ffcc00]" />
            </div>
            <div className="mt-5 space-y-3">
              {["Branded rooms", "Sponsored prediction cards", "Embeddable live widgets", "Premium creator analytics"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold ring-1 ring-white/[0.06]">
                  <CheckCircle2 className="h-4 w-4 text-[#22D391]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white">Today&apos;s World Cup rooms</h2>
            <p className="text-sm text-white/[0.55]">Live fixtures loaded through the server-side TxLINE adapter.</p>
          </div>
          <Badge variant="win">Fan-safe</Badge>
        </div>
        {setupState ? (
          <TxLineSetupCard setupState={setupState} />
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-[1.35rem] border border-white/[0.06] bg-white/[0.06]" />
            ))}
          </div>
        ) : fixtures.length ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 2xl:grid-cols-3">
            {fixtures.map((fixture) => (
              <MatchCard key={fixture.id} fixture={fixture} active={fixture.id === selectedMatchId} onSelect={() => onSelect(fixture.id)} />
            ))}
          </div>
        ) : (
          <EmptyState title="No live fixtures returned" description="TxLINE responded successfully, but no World Cup fixtures are currently available for this environment." />
        )}
      </section>
    </div>
  );
}

function TxLineSetupCard({ setupState }: { setupState: SetupState }) {
  return (
    <Card className="glass-card-soft border-0">
      <CardContent className="p-5">
        <Badge variant="secondary" className="mb-3">Live setup</Badge>
        <h3 className="text-xl font-black text-white">Connect TxLINE credentials</h3>
        <p className="mt-2 text-sm leading-6 text-white/[0.58]">{setupState.message}</p>
        {setupState.missing?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {setupState.missing.map((item) => (
              <span key={item} className="rounded-full border border-white/[0.06] bg-white/[0.08] px-3 py-1 text-xs font-bold text-white/70">
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {setupState.set && <p className="mt-4 rounded-2xl border border-white/[0.06] bg-[#02070a]/70 p-3 font-mono text-xs leading-5 text-[#BFE7D7]">{setupState.set}</p>}
        <Button asChild className="mt-5" variant="success">
          <a href="/txline-activate">Open TxLINE activation</a>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/[0.06] bg-white/[0.06] p-5">
      <p className="font-black text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/[0.56]">{description}</p>
    </div>
  );
}

function MatchCard({ fixture, active, onSelect }: { fixture: MatchFixture; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group w-full overflow-hidden rounded-[1.35rem] border border-white/[0.06] bg-white/[0.06] p-4 text-left shadow-[0_18px_54px_rgba(0,0,0,0.22)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-white/[0.18] hover:bg-white/[0.105]",
        active && "border-[#22D391]/40 ring-2 ring-[#22D391]/[0.15]"
      )}
    >
      <div className="flex items-center justify-between">
        <Badge variant={fixture.status === "live" ? "live" : "secondary"} className={cn(fixture.status === "live" && "gap-2 live-dot")}>
          {fixture.status === "live" ? "Live room" : formatKickoff(fixture.kickoffIso)}
        </Badge>
        {fixture.creatorRoom && <Badge variant="creator">Creator Cup</Badge>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 sm:gap-3">
        <TeamMark team={fixture.home} />
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-white/[0.56] ring-1 ring-white/[0.06]">VS</span>
        <TeamMark team={fixture.away} align="right" />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-white/[0.48]">
        <span>{fixture.stage}</span>
        <span className="max-w-[48%] truncate">{fixture.venue}</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-7/12 rounded-full bg-[linear-gradient(90deg,#22D391,#FFD166)] transition-all group-hover:w-10/12" />
      </div>
    </button>
  );
}

function TeamMark({ team, align = "left" }: { team: MatchFixture["home"]; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", align === "right" && "justify-end text-right")}>
      {align === "left" && <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-10 w-10 sm:h-11 sm:w-11 sm:text-sm" />}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white sm:text-base">{team.name}</span>
        {team.record ? <span className="block text-xs font-medium text-white/[0.48]">{team.record}</span> : null}
      </span>
      {align === "right" && <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-10 w-10 sm:h-11 sm:w-11 sm:text-sm" />}
    </div>
  );
}

function RoomScreen({
  fixture,
  score,
  clock,
  sentiment,
  events,
  activePrediction,
  predictionState,
  selectedOption,
  onAnswer,
  fan,
  resolved,
  streamStatus,
  onReplay,
  isReplaying,
  lastTick,
  liveUpdateAt,
  snapshotState,
  snapshotQuality,
  roomNotice,
  momentumHistory,
  onCreator
}: {
  fixture: MatchFixture;
  score: { home: number; away: number };
  clock: MatchSnapshot["clock"];
  sentiment: MatchSnapshot["sentiment"];
  events: MatchEvent[];
  activePrediction: PredictionCard | null;
  predictionState: PredictionState;
  selectedOption: string | null;
  onAnswer: (optionId: string) => void;
  fan: FanState;
  resolved?: ResolvedPrediction;
  streamStatus: "idle" | "connected" | "complete" | "error";
  onReplay: () => void;
  isReplaying: boolean;
  lastTick: ReplayTick | null;
  liveUpdateAt: number | null;
  snapshotState: SnapshotState;
  snapshotQuality: "live" | "delayed";
  roomNotice: string | null;
  momentumHistory: number[];
  onCreator: () => void;
}) {
  return (
    <div className="space-y-5">
      <Scoreboard
        fixture={fixture}
        score={score}
        clock={clock}
        sentiment={sentiment}
        streamStatus={streamStatus}
        events={events}
        lastTick={lastTick}
        liveUpdateAt={liveUpdateAt}
        snapshotState={snapshotState}
        snapshotQuality={snapshotQuality}
        roomNotice={roomNotice}
      />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="space-y-5">
          <PredictionPanel
            card={activePrediction}
            state={predictionState}
            selectedOption={selectedOption}
            onAnswer={onAnswer}
            fixture={fixture}
            resolved={resolved}
            onReplay={onReplay}
            isReplaying={isReplaying}
          />
          <MomentumPanel fixture={fixture} sentiment={sentiment} lastTick={lastTick} history={momentumHistory} />
          <Timeline events={events} />
        </div>
        <div className="space-y-5">
          <StreakCard fan={fan} />
          <CreatorRoomCard fixture={fixture} onCreator={onCreator} />
        </div>
      </div>
    </div>
  );
}

function Scoreboard({
  fixture,
  score,
  clock,
  sentiment,
  streamStatus,
  events,
  lastTick,
  liveUpdateAt,
  snapshotState,
  snapshotQuality,
  roomNotice
}: {
  fixture: MatchFixture;
  score: { home: number; away: number };
  clock: MatchSnapshot["clock"];
  sentiment: MatchSnapshot["sentiment"];
  streamStatus: "idle" | "connected" | "complete" | "error";
  events: MatchEvent[];
  lastTick: ReplayTick | null;
  liveUpdateAt: number | null;
  snapshotState: SnapshotState;
  snapshotQuality: "live" | "delayed";
  roomNotice: string | null;
}) {
  const waitingForSnapshot = snapshotState === "loading" && !lastTick && events.length === 0;
  const snapshotUnavailable = snapshotState === "error" && !lastTick && events.length === 0;
  const snapshotDelayed = snapshotQuality === "delayed" || snapshotUnavailable;
  const tickerEvents = events.length
    ? events.slice(0, 5)
    : [
        {
          id: "ticker-empty",
          minute: clock.minute,
          title: snapshotDelayed ? "TxLINE score snapshot delayed" : waitingForSnapshot ? "Loading TxLINE score snapshot" : sentiment.label
        } as MatchEvent
      ];

  return (
    <Card className="premium-card relative overflow-hidden border-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(47,140,255,0.26),transparent_22rem),radial-gradient(circle_at_82%_10%,rgba(34,211,153,0.16),transparent_20rem)]" />
      <CardContent className="p-0">
        <div className="relative p-4 text-white sm:p-6">
          <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="live" className={cn("gap-2", clock.phase !== "full" && "live-dot")}>{clock.phase === "full" ? "Full time" : "Live"}</Badge>
                <Badge className="bg-white/10 text-white">{fixture.stage}</Badge>
                {snapshotState === "loading" && <Badge variant="secondary">Loading TxLINE snapshot</Badge>}
                {snapshotDelayed && <Badge variant="secondary">Snapshot delayed</Badge>}
                {liveUpdateAt && (
                  <Badge variant="win" className="gap-2 live-dot">
                    {lastTick?.dataQuality === "delayed" ? "TxLINE retrying" : "TxLINE update received"}
                  </Badge>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-semibold text-white/[0.52]">{fixture.competition} / {fixture.venue}</p>
            </div>
            <div className="min-[420px]:text-right">
              <p className="font-mono text-2xl font-black tabular-nums sm:text-3xl">{clock.label}</p>
              <p className="text-xs font-semibold text-white/[0.52]">
                {streamStatus === "connected" ? "Room SSE connected" : snapshotState === "loading" ? "Loading real match state" : snapshotDelayed ? "Retrying TxLINE snapshot" : "Awaiting stream"}
              </p>
            </div>
          </div>
          {snapshotDelayed && roomNotice && (
            <div className="mt-4 rounded-2xl border border-[#ffcc00]/20 bg-[#ffcc00]/10 px-3 py-2 text-sm font-semibold text-[#ffe066]">
              {roomNotice}
            </div>
          )}
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:mt-7 sm:gap-3">
            <ScoreTeam team={fixture.home} side="home" score={score.home} />
            <div className={cn("score-pop min-w-[4.75rem] rounded-[1.15rem] border border-white/[0.18] bg-white px-3 py-2 text-center text-3xl font-black tabular-nums text-[#02070a] shadow-[0_18px_48px_rgba(255,255,255,0.16)] sm:min-w-[7rem] sm:rounded-[1.25rem] sm:px-4 sm:py-3 sm:text-6xl", (waitingForSnapshot || snapshotUnavailable) && "animate-pulse text-[#5d6473]")}>
              {waitingForSnapshot || snapshotUnavailable ? "–" : `${score.home}-${score.away}`}
            </div>
            <ScoreTeam team={fixture.away} side="away" score={score.away} />
          </div>
          <div className="scrollbar-none mt-5 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.08] px-3 py-2">
            <div className="flex w-max max-w-none gap-6 text-xs font-bold text-white/[0.66]">
              {tickerEvents.map((event) => (
                <span key={event.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22D391]" />
                  {event.minute}&apos; {event.title}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="relative border-t border-white/[0.06] p-4 sm:p-5">
          <MomentumBar fixture={fixture} sentiment={sentiment} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreTeam({ team, side }: { team: MatchFixture["home"]; side: TeamKey; score: number }) {
  return (
    <div className={cn("min-w-0", teamSideClass[side])}>
      <div className={cn("flex items-center gap-2.5 sm:gap-3", side === "away" && "justify-end")}>
        {side === "home" && <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-11 w-11 sm:h-14 sm:w-14 sm:text-sm" />}
        <div className="min-w-0">
          <p className="truncate text-xl font-black sm:text-3xl">{team.shortName}</p>
          <p className="hidden truncate text-xs font-medium text-white/[0.54] min-[390px]:block sm:text-sm">{team.name}</p>
        </div>
        {side === "away" && <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-11 w-11 sm:h-14 sm:w-14 sm:text-sm" />}
      </div>
    </div>
  );
}

function MomentumBar({ fixture, sentiment }: { fixture: MatchFixture; sentiment: MatchSnapshot["sentiment"] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="shrink-0 text-sm font-black text-white">Fan momentum</p>
        <p className="min-w-0 truncate pl-3 text-right text-xs font-semibold text-white/[0.54]">{sentiment.label}</p>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-white/10 p-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="transition-all duration-500" style={{ width: `${sentiment.home}%`, backgroundColor: fixture.home.color }} />
        <div className="bg-white/40 transition-all duration-500" style={{ width: `${sentiment.draw}%` }} />
        <div className="transition-all duration-500" style={{ width: `${sentiment.away}%`, backgroundColor: fixture.away.color }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-xs font-semibold text-white/[0.54]">
        <span>{fixture.home.shortName} {sentiment.home}%</span>
        <span className="text-center">Draw {sentiment.draw}%</span>
        <span className="text-right">{fixture.away.shortName} {sentiment.away}%</span>
      </div>
    </div>
  );
}

function PredictionPanel({
  card,
  state,
  selectedOption,
  onAnswer,
  fixture,
  resolved,
  onReplay,
  isReplaying
}: {
  card: PredictionCard | null;
  state: PredictionState;
  selectedOption: string | null;
  onAnswer: (optionId: string) => void;
  fixture: MatchFixture;
  resolved?: ResolvedPrediction;
  onReplay: () => void;
  isReplaying: boolean;
}) {
  if (!card) {
    return (
      <Card className="glass-card-soft border-0">
        <CardContent className="p-5">
          <p className="font-black">Waiting for the next prediction</p>
          <p className="mt-1 text-sm text-white/[0.58]">The next card appears when a score or sentiment update creates a clean read.</p>
        </CardContent>
      </Card>
    );
  }

  const locked = state === "locked" || state === "resolved";
  const isActive = state === "active";

  return (
    <Card
      key={card.id}
      className={cn(
        "glass-card float-in relative overflow-hidden border-0 transition",
        isActive && "shadow-[0_0_0_1px_rgba(34,211,145,0.45),0_28px_80px_rgba(34,211,145,0.14)] ring-1 ring-[#22D391]/40"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#22D391,#FFD166,#FF5A5F)]", isActive && "shimmer")} />
      <CardHeader className="border-b border-white/[0.06] bg-white/[0.035] pb-4">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant={isActive ? "live" : "win"} className={cn(isActive && "gap-2 live-dot")}>
                {isActive ? "Answer now" : "Micro-prediction"}
              </Badge>
              {card.sponsor && <Badge variant="creator">{card.sponsor.label}</Badge>}
              {locked && <Badge variant="secondary">Locked</Badge>}
            </div>
            <CardTitle className="text-xl leading-tight sm:text-2xl">{card.prompt}</CardTitle>
            <CardDescription className="mt-2">{card.context}</CardDescription>
          </div>
          <div className={cn("relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[conic-gradient(#22D391_0_72%,rgba(255,255,255,0.12)_72%_100%)] p-1 min-[420px]:self-start", isActive && "animate-energy-pulse")}>
            <div className="grid h-full w-full place-items-center rounded-full bg-[#0a1122] text-center">
              <p className="text-[10px] font-bold text-white/50">Locks</p>
              <p className="-mt-1 text-lg font-black text-white">{card.lockAt}&apos;</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {card.options.map((option) => {
            const teamColor = option.team ? (option.team === "home" ? fixture.home.color : fixture.away.color) : "#10231E";
            const selected = selectedOption === option.id;
            const isCorrect = state === "resolved" && card.resolved?.optionId === option.id;

            return (
              <button
                key={option.id}
                disabled={locked}
                onClick={() => onAnswer(option.id)}
                className={cn(
                  "relative min-h-[76px] rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-3 text-left text-sm font-black text-white transition duration-200 hover:-translate-y-1 hover:border-white/[0.22] hover:bg-white/[0.12] disabled:hover:translate-y-0",
                  selected && "score-pop border-[#22D391]/60 bg-[#22D391]/[0.14] ring-2 ring-[#22D391]/20",
                  isCorrect && "border-[#22D391]/60 bg-[#22D391]/[0.18] text-[#C6FFE8]"
                )}
              >
                {selected && (
                  <CheckCircle2 className={cn("absolute right-2.5 top-2.5 h-4 w-4", isCorrect ? "text-[#22D391]" : "text-[#BFE7D7]")} />
                )}
                <span className="mb-3 block h-1.5 w-12 rounded-full shadow-[0_0_18px_rgba(255,255,255,0.16)]" style={{ backgroundColor: teamColor }} />
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-white">
              {state === "resolved"
                ? resolved?.correct
                  ? `Correct read +${resolved.points} pts`
                  : "Missed read, streak reset"
                : state === "locked"
                  ? "Answer locked. Waiting for resolving update."
                  : state === "answered"
                    ? "Answer saved. Locking with server time."
                    : "Answer before the next resolving TxLINE update."}
            </p>
            <p className="break-words text-xs text-white/[0.54]">{state === "resolved" ? resolved?.explanation : `Resolution source: ${card.source.endpoint}`}</p>
          </div>
          <Button className="shrink-0" variant="outline" size="sm" onClick={onReplay} disabled={isReplaying}>
            <Play className="mr-2 h-4 w-4" />
            {isReplaying ? "Running" : "Run stream"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MomentumPanel({
  fixture,
  sentiment,
  lastTick,
  history
}: {
  fixture: MatchFixture;
  sentiment: MatchSnapshot["sentiment"];
  lastTick: ReplayTick | null;
  history: number[];
}) {
  const hasGraph = history.length >= 3;
  const homePoints = history.map((value, index) => {
    const x = history.length > 1 ? (index / (history.length - 1)) * 100 : 0;
    const y = 92 - Math.min(100, Math.max(0, value)) * 0.84;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const awayPoints = history.map((value, index) => {
    const x = history.length > 1 ? (index / (history.length - 1)) * 100 : 0;
    const y = 92 - Math.min(100, Math.max(0, 100 - value)) * 0.84;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <Card className="glass-card-soft border-0">
      <CardHeader>
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div className="min-w-0">
            <CardTitle>Pressure graph</CardTitle>
            <CardDescription>Live odds movement translated into fan-readable match pulse.</CardDescription>
          </div>
          <LineChart className="h-5 w-5 shrink-0 text-[#22D391]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-40 overflow-hidden rounded-[1.2rem] border border-white/[0.06] bg-[radial-gradient(circle_at_50%_0%,rgba(47,140,255,0.18),transparent_18rem),rgba(255,255,255,0.055)] p-3">
          {hasGraph ? (
            <>
              <div className="momentum-wave absolute inset-y-6 left-0 w-[120%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(47,140,255,0.1),rgba(34,211,153,0.14),transparent)] blur-xl" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="relative h-full w-full overflow-visible">
                <polyline points={homePoints.join(" ")} fill="none" stroke={fixture.home.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={awayPoints.join(" ")} fill="none" stroke={fixture.away.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
              </svg>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="live-dot flex items-center gap-2 text-xs font-bold text-white/70" />
              <p className="text-sm font-black text-white">Building momentum</p>
              <p className="max-w-[16rem] text-xs text-white/[0.54]">The pressure graph plots as live TxLINE odds updates arrive. {history.length}/3 readings so far.</p>
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <StatPill label="Trend" value={sentiment.trend === "neutral" ? "Balanced" : sentiment.trend === "home" ? fixture.home.shortName : fixture.away.shortName} />
          <StatPill label="Move" value={`${sentiment.delta}% swing`} />
          <StatPill label="Latest" value={lastTick?.event.title ?? "Awaiting update"} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#070d1c]/80 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-white/[0.44]">{label}</p>
      <p className="mt-0.5 truncate font-bold text-white">{value}</p>
    </div>
  );
}

function Timeline({ events }: { events: MatchEvent[] }) {
  return (
    <Card className="glass-card-soft border-0">
      <CardHeader>
        <CardTitle>Event timeline</CardTitle>
        <CardDescription>Major match events from the score update stream.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length ? events.map((event) => {
          const Icon = eventIcon[event.type] ?? Activity;
          return (
            <div key={event.id} className="float-in flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 transition hover:bg-white/[0.105]">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/[0.06]">
                <Icon className="h-4 w-4 text-[#80ffb4]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-black text-white">{event.title}</p>
                  <Badge className="shrink-0" variant={event.impact === "high" ? "live" : "secondary"}>{event.stoppage ? `${event.minute}+${event.stoppage}'` : `${event.minute}'`}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-white/[0.56]">{event.description}</p>
              </div>
            </div>
          );
        }) : (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 text-sm text-white/[0.56]">Waiting for TxLINE score events from the live stream.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StreakCard({ fan }: { fan: FanState }) {
  const energy = Math.min(100, fan.streak * 18 + 18);

  return (
    <Card className="glass-card relative overflow-hidden border-0">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#ffcc00]/20 blur-3xl" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Pulse Streak</CardTitle>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffcc00]/[0.15] ring-1 ring-[#ffcc00]/20">
            <Flame className="h-5 w-5 text-[#ffcc00]" />
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.06] bg-[linear-gradient(145deg,rgba(255,176,32,0.14),rgba(255,255,255,0.06))] p-4 text-white">
          <div className="absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(90deg,transparent,#ffcc00,transparent)]" />
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Current combo</p>
              <p className="mt-1 text-5xl font-black tabular-nums sm:text-6xl">{fan.streak}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-white/[0.55]">Next milestone</p>
              <p className="text-2xl font-black">{fan.streak < 3 ? 3 : fan.streak < 5 ? 5 : 10}x</p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/[0.06]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#22D391,#FFD166,#FF5A5F)] shadow-[0_0_24px_rgba(255,209,102,0.34)] transition-all duration-700" style={{ width: `${energy}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
              <p className="text-white/60">Points</p>
              <p className="text-xl font-black tabular-nums">{fan.points}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
              <p className="text-white/60">Best streak</p>
              <p className="text-xl font-black tabular-nums">{fan.bestStreak}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {fan.badges.slice(-4).map((badgeId) => {
            const badge = badgeById.get(badgeId);
            return badge ? (
              <div key={badge.id} className={cn("shimmer rounded-2xl border px-3 py-2 text-xs font-bold", badgeToneClass[badge.tone])}>
                {badge.name}
              </div>
            ) : null;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CreatorRoomCard({ fixture, onCreator }: { fixture: MatchFixture; onCreator: () => void }) {
  const creator = fixture.creatorRoom;

  if (!creator) {
    return (
      <Card className="glass-card-soft overflow-hidden border-0">
        <CardHeader>
          <CardTitle>Creator Cup room</CardTitle>
          <CardDescription>This match is running as a public room. Brand it for your community.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-[1.35rem] border border-white/[0.06] bg-white/[0.06] p-4">
            <p className="text-sm leading-6 text-white/[0.62]">
              Launch a themed, sponsored watch room for {fixture.home.shortName} vs {fixture.away.shortName} with its own invite link, leaderboard, and embeddable widget.
            </p>
            <Button className="mt-4 w-full" variant="outline" onClick={onCreator}>
              <Sparkles className="mr-2 h-4 w-4" />
              Open Creator Cup
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card-soft overflow-hidden border-0">
      <CardHeader>
        <CardTitle>Creator Cup room</CardTitle>
        <CardDescription>{creator.creatorName} branded watch room</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.06] bg-white/[0.06] p-4">
          <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: creator.themeColor }} />
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black text-white shadow-[0_14px_34px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.15]" style={{ backgroundColor: creator.themeColor }}>
              {creator.avatar}
            </span>
            <div className="min-w-0">
              <p className="truncate font-black text-white">{creator.creatorName}</p>
              <p className="text-xs font-semibold text-white/[0.55]">{creator.handle}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-white/[0.06] min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <span>Invite</span>
            <span className="break-all font-mono text-white">{creator.inviteCode}</span>
          </div>
          {creator.sponsor ? (
            <div className="mt-3 rounded-2xl border border-[#ffcc00]/20 bg-[#ffcc00]/10 px-3 py-2 text-xs font-bold text-[#ffe066]">
              Sponsored by {creator.sponsor}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function RightRail({ fan, users, onScreen }: { fan: FanState; users: LeaderboardUser[]; onScreen: (screen: Screen) => void }) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied">("idle");

  const shareResult = async () => {
    const summary = `MatchPulse Arena: ${fan.points} points, best Pulse Streak ${fan.bestStreak}, ${fan.badges.length} badges. No-money World Cup fan predictions.`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "MatchPulse Arena", text: summary });
        setShareState("shared");
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
        setShareState("copied");
      }
      window.setTimeout(() => setShareState("idle"), 2400);
    } catch {
      setShareState("idle");
    }
  };

  return (
    <div className="sticky top-20 space-y-4">
      <Card className="glass-card-soft border-0">
        <CardHeader>
          <CardTitle>Room leaderboard</CardTitle>
          <CardDescription>Updates as predictions resolve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.length ? (
            users.slice(0, 5).map((user, index) => (
              <LeaderboardRow key={user.id} user={user} rank={index + 1} compact />
            ))
          ) : (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 text-sm text-white/[0.56]">Answer a prediction to appear on the room leaderboard.</p>
          )}
          <Button className="mt-2 w-full" variant="outline" onClick={() => onScreen("leaderboard")}>
            View full room
          </Button>
        </CardContent>
      </Card>
      <Card className="glass-card overflow-hidden border-0">
        <CardHeader>
          <CardTitle>Share result</CardTitle>
          <CardDescription>Your live fan card for this room.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.06] bg-[linear-gradient(145deg,rgba(47,140,255,0.2),rgba(255,255,255,0.06))] p-4 text-white">
            <p className="text-xs font-bold text-white/60">Your MatchPulse card</p>
            <p className="mt-2 text-4xl font-black tabular-nums">{fan.points}</p>
            <p className="text-sm text-white/70">points / best streak {fan.bestStreak} / {fan.badges.length} badges</p>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[#80ffb4]">
              <Crown className="h-4 w-4" />
              MatchPulse result card
            </div>
          </div>
          <Button className="mt-3 w-full" variant="pulse" onClick={shareResult} disabled={fan.answered === 0}>
            <Share2 className="mr-2 h-4 w-4" />
            {shareState === "shared" ? "Shared" : shareState === "copied" ? "Copied to clipboard" : fan.answered === 0 ? "Answer a card to share" : "Share result"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LeaderboardScreen({ users, currentRank }: { users: LeaderboardUser[]; currentRank: number }) {
  const podium = users.slice(0, 3);
  const rest = users.slice(3);

  return (
    <div className="space-y-5">
      <SectionHeader icon={Crown} title="Room leaderboard" description={`You are currently #${currentRank || 4} in the live watch room.`} />
      <Card className="premium-card overflow-hidden border-0">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-3 items-end gap-1 pt-3 sm:gap-2">
            {[podium[1], podium[0], podium[2]].map((user, displayIndex) => {
              if (!user) return <div key={displayIndex} />;
              const rank = users.findIndex((item) => item.id === user.id) + 1;
              const height = rank === 1 ? "h-32" : rank === 2 ? "h-24" : "h-20";
              return (
                <div key={user.id} className="text-center">
                  <div className={cn("mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-black text-white ring-2 sm:h-14 sm:w-14 sm:text-sm", rank === 1 ? "bg-[#ffcc00]/20 ring-[#ffcc00]/[0.45]" : "bg-white/10 ring-white/[0.15]")}>{user.avatar}</div>
                  <p className="truncate text-xs font-black text-white">{user.name}</p>
                  <p className="text-xs text-white/50">{user.points} pts</p>
                  <div className={cn("mt-3 rounded-t-[1.35rem] border border-white/[0.06] bg-white/[0.06] p-2 sm:p-3", height)}>
                    <p className={cn("text-2xl font-black sm:text-3xl", rank === 1 ? "text-[#ffcc00]" : "text-white")}>#{rank}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            {rest.map((user, index) => (
              <LeaderboardRow key={user.id} user={user} rank={index + 4} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LeaderboardRow({ user, rank, compact = false }: { user: LeaderboardUser; rank: number; compact?: boolean }) {
  const rankTone = rank === 1 ? "text-[#ffcc00]" : rank === 2 ? "text-[#D8E4FF]" : rank === 3 ? "text-[#ffd699]" : "text-white/50";

  return (
    <div className={cn("group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.105]", user.id === "you" && "border-[#22D391]/50 bg-[#22D391]/10 shadow-[0_0_0_1px_rgba(34,211,145,0.18)]")}>
      <span className={cn("w-8 shrink-0 text-center text-sm font-black tabular-nums", rankTone)}>#{rank}</span>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black text-white ring-2", user.id === "you" ? "bg-[#22D391]/20 ring-[#22D391]/[0.45]" : "bg-white/10 ring-white/[0.12]")}>{user.avatar}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-white">{user.name}</p>
        {!compact && <p className="text-xs text-white/[0.52]">Best streak {user.bestStreak} / {user.badges.length} badges</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-black tabular-nums text-white">{user.points}</p>
        <p className="text-xs text-[#ffcc00]">{user.streak} streak</p>
      </div>
    </div>
  );
}

function PassportScreen({ fan, resolved }: { fan: FanState; resolved: ResolvedPrediction[] }) {
  const accuracy = fan.answered ? Math.round((fan.correct / fan.answered) * 100) : 0;

  return (
    <div className="space-y-5">
      <SectionHeader icon={Medal} title="Fan Passport" description="Your streaks, badges, prediction reads, and shareable match result." />
      <Card className="premium-card overflow-hidden border-0">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[0.8fr_1.2fr]">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.06] bg-[radial-gradient(circle_at_20%_0%,rgba(47,140,255,0.3),transparent_18rem),rgba(255,255,255,0.07)] p-5 text-white">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#ffcc00]/20 blur-3xl" />
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 place-items-center rounded-[1.35rem] bg-white/10 text-xl font-black ring-1 ring-white/[0.15]">YOU</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Fan passport</p>
                <p className="text-xl font-black">Level {Math.max(1, Math.floor(fan.points / 500))}</p>
              </div>
            </div>
            <p className="mt-5 text-4xl font-black tabular-nums sm:text-5xl">{fan.points}</p>
            <p className="text-sm text-white/70">points earned</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
                <p className="text-xs text-white/60">Best streak</p>
                <p className="text-2xl font-black">{fan.bestStreak}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/[0.06]">
                <p className="text-xs text-white/60">Accuracy</p>
                <p className="text-2xl font-black">{accuracy}%</p>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-black text-white">Badge collection</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {badges.map((badge) => {
                const unlocked = fan.badges.includes(badge.id);
                return (
                  <div key={badge.id} className={cn("rounded-2xl border px-3 py-3 text-sm transition duration-300 hover:-translate-y-0.5", unlocked ? `shimmer ${badgeToneClass[badge.tone]}` : "border-white/[0.06] bg-white/[0.055] text-white/[0.42]")}>
                    <p className="font-black">{badge.name}</p>
                    <p className="mt-1 text-xs">{badge.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card-soft border-0">
        <CardHeader>
          <CardTitle>Prediction history</CardTitle>
          <CardDescription>Each resolved card stores the event/update used for resolution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {resolved.length ? (
            resolved.map((item) => (
              <div key={`${item.card.id}-${item.selectedOptionId}`} className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
                <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                  <p className="min-w-0 font-black text-white">{item.card.prompt}</p>
                  <Badge className="w-fit shrink-0" variant={item.correct ? "win" : "live"}>{item.correct ? `+${item.points}` : "Reset"}</Badge>
                </div>
                <p className="mt-1 text-sm text-white/[0.56]">{item.explanation}</p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 text-sm text-white/[0.56]">Answer a live prediction to fill this passport.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreatorScreen({
  fixture,
  config,
  onConfig,
  onCaptain
}: {
  fixture?: MatchFixture;
  config: CreatorConfig;
  onConfig: (config: CreatorConfig) => void;
  onCaptain: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<{ inviteUrl: string; widgetUrl?: string; widgetEmbed?: string } | null>(null);

  const launch = async () => {
    setStatus("Launching Creator Cup room...");
    setCreatedRoom(null);
    const response = await fetch("/api/creator/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...config,
        matchId: fixture?.id
      })
    });
    const data = (await response.json()) as { inviteUrl?: string; widgetUrl?: string; widgetEmbed?: string; persisted?: boolean; error?: string; message?: string };
    if (!response.ok || !data.inviteUrl || !data.persisted) {
      setStatus(data.error ?? data.message ?? "Creator Cup room could not be launched yet.");
      return;
    }

    onCaptain();
    setCreatedRoom({
      inviteUrl: data.inviteUrl,
      widgetUrl: data.widgetUrl,
      widgetEmbed: data.widgetEmbed
    });
    setStatus("Creator Cup room persisted and ready to share.");
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon={Sparkles} title="Creator Cup setup" description="B2B/B2B2C branded rooms for creators, communities, media pages, and sponsors." />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card className="glass-card-soft border-0">
          <CardHeader>
            <CardTitle>Launch branded watch room</CardTitle>
            <CardDescription>Configure the room fans join from stream chat, social posts, or an embedded widget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CreatorInput label="Creator name" value={config.creatorName} onChange={(creatorName) => onConfig({ ...config, creatorName })} />
            <CreatorInput label="Handle" value={config.handle} onChange={(handle) => onConfig({ ...config, handle })} />
            <CreatorInput label="Sponsor" value={config.sponsor} onChange={(sponsor) => onConfig({ ...config, sponsor })} />
            <CreatorInput label="Invite code" value={config.inviteCode} onChange={(inviteCode) => onConfig({ ...config, inviteCode })} />
            <div>
              <label className="text-xs font-bold text-white/60">Theme color</label>
              <div className="mt-1 flex gap-2">
                {["#C60B1E", "#22D391", "#FFD166", "#1F4E9E", "#10231E"].map((color) => (
                  <button
                    key={color}
                    aria-label={color}
                    className={cn("h-10 w-10 rounded-2xl border-2 shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5", config.themeColor === color ? "border-white ring-2 ring-[#22D391]/[0.35]" : "border-white/[0.06]")}
                    style={{ backgroundColor: color }}
                    onClick={() => onConfig({ ...config, themeColor: color })}
                  />
                ))}
              </div>
            </div>
            <Button className="w-full" variant="pulse" onClick={launch}>
              <Bolt className="mr-2 h-4 w-4" />
              Launch Creator Cup room
            </Button>
            {status && <p className="break-all rounded-2xl border border-[#22D391]/30 bg-[#22D391]/[0.12] p-3 text-sm font-semibold text-[#8AF2C9]">{status}</p>}
            {createdRoom && (
              <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-sm font-semibold text-white/70 sm:grid-cols-2">
                <a className="rounded-xl bg-white/10 px-3 py-2 text-center text-white transition hover:bg-white/[0.16]" href={createdRoom.inviteUrl}>
                  Open invite
                </a>
                {createdRoom.widgetUrl && (
                  <a className="rounded-xl bg-white/10 px-3 py-2 text-center text-white transition hover:bg-white/[0.16]" href={createdRoom.widgetUrl}>
                    Open widget
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card overflow-hidden border-0">
          <CardHeader style={{ background: `linear-gradient(135deg, ${config.themeColor}, #02070a)` }} className="text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.18] text-sm font-black ring-1 ring-white/20">CC</span>
              <div>
                <CardTitle>{config.creatorName}</CardTitle>
                <CardDescription className="text-white/70">{config.handle}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-white/[0.62]">Sponsored room for {fixture?.home.shortName ?? "HOME"} vs {fixture?.away.shortName ?? "AWAY"}</p>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ffcc00]">Sponsored prediction card</p>
              <p className="mt-2 text-lg font-black text-white">Will the next market reaction favor the team pressing higher?</p>
              <p className="mt-3 text-xs text-white/[0.56]">Presented by {config.sponsor}</p>
            </div>
            <div className="overflow-x-auto break-all rounded-2xl border border-white/[0.06] bg-[#02070a]/75 p-3 font-mono text-xs text-white/[0.62]">
              {createdRoom?.widgetEmbed ?? `<iframe src="https://matchpulse.arena/widget/${config.inviteCode}" width="360" height="640"></iframe>`}
            </div>
            <div className="grid gap-2 text-center text-xs font-bold text-white/70 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/[0.06]">Live TxLINE fixture</div>
              <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/[0.06]">Wallet signed room</div>
              <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/[0.06]">Embeddable widget</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreatorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-white/60">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-12 w-full rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none ring-[#22D391]/20 transition placeholder:text-white/30 focus:border-[#22D391]/50 focus:ring-4"
      />
    </label>
  );
}

function AnalyticsScreen({ users, events }: { users: LeaderboardUser[]; events: MatchEvent[] }) {
  const highImpact = events.filter((event) => event.impact === "high").length;
  const activeFans = users.length;
  const scoringFans = users.filter((user) => user.points > 0).length;
  const completionRate = activeFans ? Math.round((scoringFans / activeFans) * 100) : 0;
  const latestMinute = events[0]?.minute ?? 0;

  return (
    <div className="space-y-5">
      <SectionHeader icon={BarChart3} title="Creator analytics" description="Premium reporting for creators, publishers, and sponsored campaigns." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Active fans" value={String(activeFans)} helper="Wallet and guest room activity" />
        <Metric title="Tracked events" value={String(events.length)} helper={`${completionRate}% fans with points`} />
        <Metric title="Match minute" value={latestMinute ? `${latestMinute}'` : "Live"} helper="Latest TxLINE score event" />
        <Metric title="Pulse moments" value={String(highImpact)} helper="High-impact TxLINE events" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-card-soft border-0">
          <CardHeader>
            <CardTitle>Top fans</CardTitle>
            <CardDescription>Creator Cup leaderboard export.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.slice(0, 4).map((user, index) => (
              <LeaderboardRow key={user.id} user={user} rank={index + 1} compact />
            ))}
          </CardContent>
        </Card>
        <Card className="glass-card-soft border-0">
          <CardHeader>
            <CardTitle>Most exciting moments</CardTitle>
            <CardDescription>Built from score events and sentiment deltas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 transition hover:bg-white/[0.105]">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{event.title}</p>
                  <p className="text-xs text-white/[0.52]">{event.minute}&apos; / {event.impact} impact</p>
                </div>
                <Badge className="shrink-0" variant={event.impact === "high" ? "live" : "secondary"}>{event.type.replace("_", " ")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <Card className="glass-card-soft overflow-hidden border-0">
      <CardContent className="p-4">
        <div className="mb-4 h-1 w-12 rounded-full bg-[linear-gradient(90deg,#22D391,#FFD166)]" />
        <p className="text-sm font-bold text-white/[0.58]">{title}</p>
        <p className="mt-2 text-3xl font-black tabular-nums text-white">{value}</p>
        <p className="mt-1 text-xs font-semibold text-[#80ffb4]">{helper}</p>
      </CardContent>
    </Card>
  );
}

function ReplayScreen({
  isReplaying,
  status,
  onReplay,
  onReset,
  events,
  resolved
}: {
  isReplaying: boolean;
  status: "idle" | "connected" | "complete" | "error";
  onReplay: () => void;
  onReset: () => void;
  events: MatchEvent[];
  resolved: ResolvedPrediction[];
}) {
  return (
    <div className="space-y-5">
      <SectionHeader icon={ListRestart} title="TxLINE historical replay" description="Historical TxLINE score events can replay a match flow when a live fixture is not active." />
      <Card className="premium-card relative overflow-hidden border-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(255,209,102,0.18),transparent_22rem)]" />
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <div className="mb-4 flex max-w-md items-center gap-2">
              <span className={cn("h-3 rounded-full bg-[#22D391] transition-all", isReplaying ? "w-2/3 pulse-track" : "w-1/3")} />
              <span className="h-3 flex-1 rounded-full bg-white/10" />
            </div>
            <p className="font-black text-white">Replay stream status: {status}</p>
            <p className="mt-1 text-sm text-white/[0.58]">Runs TxLINE historical score events through the same SSE room pipeline used by live updates.</p>
          </div>
          <div className="relative flex flex-col gap-2 min-[420px]:flex-row">
            <Button className="w-full min-[420px]:w-auto" variant="pulse" onClick={onReplay} disabled={isReplaying}>
              <Play className="mr-2 h-4 w-4" />
              {isReplaying ? "Running" : "Start replay"}
            </Button>
            <Button className="w-full min-[420px]:w-auto" variant="outline" onClick={onReset}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Timeline events={events} />
        <Card className="glass-card-soft border-0">
          <CardHeader>
            <CardTitle>Resolved cards</CardTitle>
            <CardDescription>Prediction outcomes tied to replayed TxLINE events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {resolved.length ? (
              resolved.map((item) => (
                <div key={item.card.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
                  <p className="font-black text-white">{item.card.prompt}</p>
                  <p className="mt-1 text-sm text-white/[0.56]">{item.explanation}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 text-sm text-white/[0.56]">Run the replay and answer the active card to see resolution logs.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TechScreen() {
  return (
    <div className="space-y-5">
      <SectionHeader icon={Code2} title="TxLINE integration notes" description="The app isolates TxLINE calls in a server-only service adapter and proxies data through Node.js API routes." />
      <Card className="glass-card-soft border-0">
        <CardHeader>
          <CardTitle>Data streams powering MatchPulse</CardTitle>
          <CardDescription>
            TxLINE docs describe guest JWT auth, activated API tokens, fixtures, odds, scores, historical scores, and SSE streams.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {txLineEndpoints.map((endpoint) => (
            <div key={endpoint.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{endpoint.method}</Badge>
                <p className="font-black text-white">{endpoint.label}</p>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-[#9FC7FF]">{endpoint.path}</p>
              <p className="mt-1 text-sm text-white/[0.58]">{endpoint.txline} / {endpoint.use}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="glass-card-soft border-0">
        <CardHeader>
          <CardTitle>How the data stays server-side</CardTitle>
          <CardDescription>TxLINE credentials never reach the browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-white/[0.62]">
          <p>The TxLINE adapter runs only on the server (<span className="font-mono text-[#9FC7FF]">src/services/txline</span>). Next.js API routes proxy fixtures, snapshots, and SSE streams, attaching the guest JWT and API token as request headers the client never sees.</p>
          <p>Bookmaker odds are converted into fan-facing momentum and pressure signals before they are sent to the browser &mdash; no betting lines, prices, or wager surfaces are exposed to fans.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="glass-card-soft rounded-[1.35rem] p-4">
      <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#22D391]/[0.15] ring-1 ring-[#22D391]/25">
          <Icon className="h-5 w-5 text-[#80ffb4]" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-white sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-white/[0.58]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function MobileTabs({ current, onChange }: { current: Screen; onChange: (screen: Screen) => void }) {
  const items: Array<{ id: Screen; label: string; icon: typeof Activity }> = [
    { id: "home", label: "Matches", icon: Trophy },
    { id: "room", label: "Room", icon: Radio },
    { id: "leaderboard", label: "Rank", icon: Crown },
    { id: "passport", label: "Badges", icon: Medal },
    { id: "creator", label: "Creator", icon: Sparkles },
    { id: "analytics", label: "Stats", icon: BarChart3 },
    { id: "replay", label: "Replay", icon: ListRestart },
    { id: "tech", label: "TxLINE", icon: Code2 }
  ];

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#02070a]/92 px-2 pt-2 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
      <div className="scrollbar-none mx-auto flex snap-x gap-1 overflow-x-auto pb-0.5 md:justify-center">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <button
              key={item.id}
              className={cn(
                "flex min-h-[52px] w-[19vw] max-w-[92px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold leading-none text-white/[0.56] transition hover:bg-white/10 hover:text-white min-[380px]:text-[11px] md:w-[86px]",
                active && "bg-white/[0.12] font-bold text-[#8affbf] ring-1 ring-white/[0.08]"
              )}
              onClick={() => onChange(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px]", active && "text-[#8affbf]")} />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ToastStack({ toasts }: { toasts: Array<{ id: string; badge: BadgeId }> }) {
  return (
    <div className="fixed inset-x-4 top-20 z-50 space-y-2 sm:left-auto sm:w-[320px]">
      {toasts.map((toast) => {
        const badge = badgeById.get(toast.badge);
        if (!badge) return null;

        return (
          <div key={toast.id} className="float-in glass-card rounded-[1.35rem] p-3">
            <div className="flex items-center gap-3">
              <span className={cn("shimmer flex h-11 w-11 items-center justify-center rounded-2xl border", badgeToneClass[badge.tone])}>
                <Medal className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-black text-white">Badge unlocked</p>
                <p className="text-xs font-semibold text-white/[0.58]">{badge.name}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
