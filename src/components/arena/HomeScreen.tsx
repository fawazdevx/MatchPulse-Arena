"use client";

import { ArrowRight, CheckCircle2, Play, Radio, Sparkles } from "lucide-react";
import type { MatchFixture } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TeamCrest } from "@/components/TeamCrest";

export interface SetupState {
  message: string;
  missing?: string[];
  set?: string;
}

interface HomeScreenProps {
  fixtures: MatchFixture[];
  selectedMatchId: string;
  loading: boolean;
  setupState: SetupState | null;
  onSelect: (matchId: string) => void;
  onLive: () => void;
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function HomeScreen({ fixtures, selectedMatchId, loading, setupState, onSelect, onLive }: HomeScreenProps) {
  const featuredMatchId = selectedMatchId || fixtures[0]?.id || "";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[linear-gradient(135deg,rgba(12,42,84,0.96),rgba(6,15,29,0.94))] text-white shadow-[0_34px_110px_rgba(4,12,24,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(33,230,163,0.2),transparent_20rem),radial-gradient(circle_at_12%_92%,rgba(21,112,239,0.2),transparent_22rem)]" />
        <div className="pulse-grid relative p-5 sm:p-7 lg:p-9">
          <div className="max-w-3xl">
            <Badge variant="win" className="mb-4">
              No-money prediction arena
            </Badge>
            <h1 className="max-w-2xl text-balance font-anybody text-[2.35rem] font-black leading-[1.02] tracking-tight sm:text-6xl">
              Read the World Cup pulse before the room does.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              Join live watch rooms, answer fast micro-predictions, build a Pulse Streak, and climb creator leaderboards powered by TxLINE match and sentiment updates.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="default" onClick={() => featuredMatchId && onSelect(featuredMatchId)} disabled={!featuredMatchId}>
                <Radio className="mr-2 h-4 w-4" />
                Join featured room
              </Button>
              <Button variant="secondary" onClick={onLive} disabled={!featuredMatchId}>
                <Play className="mr-2 h-4 w-4" />
                Connect live stream
              </Button>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {["Live match pulse", "Streak scoring", "Creator rooms"].map((item) => (
                <div key={item} className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm font-bold text-white/78">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-neon" />
                  <span className="min-w-0">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className="min-w-0">
            <h2 className="font-anybody text-2xl font-black text-white">Today&apos;s World Cup rooms</h2>
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
        <Badge variant="secondary" className="mb-3">
          Live setup
        </Badge>
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
        {setupState.set ? <p className="mt-4 rounded-2xl border border-white/[0.08] bg-navy-deep/70 p-3 font-mono text-xs leading-5 text-[#BFE7D7]">{setupState.set}</p> : null}
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
  const isLive = fixture.status === "live";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group w-full overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.05] p-4 text-left shadow-[0_18px_54px_rgba(4,12,24,0.32)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-electric/40 hover:bg-white/[0.09]",
        active && "border-neon/45 ring-2 ring-neon/[0.18]"
      )}
    >
      <div className="flex items-center justify-between">
        <Badge variant={isLive ? "live" : "secondary"} className={cn(isLive && "gap-2 live-dot")}>
          {isLive ? "Live now" : fixture.status === "full" ? "Full time" : formatKickoff(fixture.kickoffIso)}
        </Badge>
        {fixture.creatorRoom ? <Badge variant="creator">Creator Cup</Badge> : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 sm:gap-3">
        <TeamMark team={fixture.home} />
        <span className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 font-data text-[0.65rem] font-bold text-white/[0.6] ring-1 ring-white/[0.08]">VS</span>
        <TeamMark team={fixture.away} align="right" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/[0.5]">
        <span className="truncate">{fixture.stage}</span>
        <span className="max-w-[48%] truncate">{fixture.venue}</span>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
        <span className="text-xs font-semibold text-white/[0.6]">{isLive ? "Room open - read the pulse" : "Tap to open the room"}</span>
        <span className="flex items-center gap-1 text-xs font-bold text-neon transition-transform group-hover:translate-x-0.5">
          Enter
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

function TeamMark({ team, align = "left" }: { team: MatchFixture["home"]; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", align === "right" && "justify-end text-right")}>
      {align === "left" ? <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-10 w-10 sm:h-11 sm:w-11 sm:text-sm" /> : null}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white sm:text-base">{team.name}</span>
        {team.record ? <span className="block text-xs font-medium text-white/[0.48]">{team.record}</span> : null}
      </span>
      {align === "right" ? <TeamCrest name={team.name} crest={team.crest} color={team.color} className="h-10 w-10 sm:h-11 sm:w-11 sm:text-sm" /> : null}
    </div>
  );
}
