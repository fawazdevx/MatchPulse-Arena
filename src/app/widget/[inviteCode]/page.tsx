import type { Metadata } from "next";
import { Activity, Radio, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TeamCrest } from "@/components/TeamCrest";
import { getPublicCreatorRoom } from "@/services/storage/creator-public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { inviteCode: string } }): Promise<Metadata> {
  const room = await getPublicCreatorRoom(params.inviteCode);

  return {
    title: room ? `${room.fixture.home.shortName} vs ${room.fixture.away.shortName} live widget` : "MatchPulse Arena widget",
    description: "Embeddable MatchPulse Arena Creator Cup live widget."
  };
}

export default async function MatchPulseWidgetPage({ params }: { params: { inviteCode: string } }) {
  const room = await getPublicCreatorRoom(params.inviteCode);

  if (!room) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#081A2F] p-3 text-white">
        <section className="w-full max-w-sm rounded-[1.5rem] border border-white/10 bg-white/[0.08] p-5 text-center">
          <Badge variant="creator">MatchPulse Arena</Badge>
          <h1 className="mt-4 text-xl font-black">Widget is not live yet</h1>
          <p className="mt-2 text-sm text-white/55">Create and persist this Creator Cup room before embedding it.</p>
        </section>
      </main>
    );
  }

  const { fixture, snapshot } = room;
  const sentiment = snapshot?.sentiment ?? {
    home: 33,
    draw: 34,
    away: 33,
    trend: "neutral" as const,
    delta: 0,
    label: "Awaiting TxLINE sentiment",
    sourceUpdateId: "pending"
  };
  const scoreLabel = snapshot ? `${snapshot.score.home}-${snapshot.score.away}` : "--";
  const clockLabel = snapshot ? snapshot.clock.label : "Awaiting live snapshot";

  return (
    <main className="min-h-screen bg-[#081A2F] p-3 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-sm flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,18,18,0.96),rgba(4,10,14,0.94))] shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
        <div className="relative overflow-hidden p-4">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(34,211,145,0.1),transparent_48%)] bg-[length:56px_56px,auto]" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Badge variant={snapshot ? "live" : "secondary"} className={snapshot ? "live-dot mb-3 gap-2" : "mb-3 gap-2"}>
                {snapshot ? "Live room" : "Setup pending"}
              </Badge>
              <h1 className="truncate text-lg font-black">{room.creatorName}</h1>
              <p className="truncate text-xs font-semibold text-white/55">{room.handle} watch widget</p>
            </div>
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black ring-1 ring-white/10" style={{ backgroundColor: room.themeColor }}>
              {room.avatar}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.08] p-4">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-white/45">{fixture.stage}</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <TeamCrest name={fixture.home.name} crest={fixture.home.crest} color={fixture.home.color} className="mx-auto size-12 text-sm" />
                <p className="mt-2 truncate text-sm font-black">{fixture.home.shortName}</p>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 text-3xl font-black tabular-nums text-[#02070a]">
                {scoreLabel}
              </div>
              <div className="min-w-0 text-center">
                <TeamCrest name={fixture.away.name} crest={fixture.away.crest} color={fixture.away.color} className="mx-auto size-12 text-sm" />
                <p className="mt-2 truncate text-sm font-black">{fixture.away.shortName}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-white/55">
              <Radio className="size-3.5 text-[#FF4664]" />
              {clockLabel} / {fixture.venue}
            </div>
          </div>

          <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-white/[0.08] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-black">Match pulse</p>
              <p className="text-xs font-semibold text-white/55">{sentiment.label}</p>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-white/10 p-0.5">
              <div style={{ width: `${sentiment.home}%`, backgroundColor: fixture.home.color }} />
              <div className="bg-white/35" style={{ width: `${sentiment.draw}%` }} />
              <div style={{ width: `${sentiment.away}%`, backgroundColor: fixture.away.color }} />
            </div>
          </div>

          <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-white/[0.08] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black">Room leaders</p>
              <Trophy className="size-4 text-[#FFD166]" />
            </div>
            {room.leaderboard.length ? (
              <div className="flex flex-col gap-2">
                {room.leaderboard.map((fan, index) => (
                  <div key={fan.id} className="flex items-center gap-2 rounded-2xl bg-white/10 p-2">
                    <span className="grid size-7 place-items-center rounded-xl bg-white text-xs font-black text-[#02070a]">{index + 1}</span>
                    <span className="grid size-8 place-items-center rounded-xl bg-[#22D391]/20 text-xs font-black ring-1 ring-[#22D391]/25">{fan.avatar}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{fan.name}</span>
                    <span className="text-xs font-black text-[#22D391]">{fan.points}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/10 p-3 text-xs font-semibold text-white/55">Leaderboard opens after persisted predictions.</p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-white/45">
            <Activity className="size-3.5" />
            Powered by TxLINE data via MatchPulse Arena
          </div>
        </div>
      </section>
    </main>
  );
}
