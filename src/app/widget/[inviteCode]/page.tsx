import type { Metadata } from "next";
import { Activity, Radio, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { baseSnapshot, fixtures, leaderboard } from "@/services/txline/mock-data";

function findFixture(inviteCode: string) {
  const normalized = inviteCode.toLowerCase();
  return fixtures.find((fixture) => fixture.creatorRoom?.inviteCode.toLowerCase() === normalized) ?? fixtures[0];
}

export function generateMetadata({ params }: { params: { inviteCode: string } }): Metadata {
  const fixture = findFixture(params.inviteCode);

  return {
    title: `${fixture.home.shortName} vs ${fixture.away.shortName} live widget`,
    description: "Embeddable MatchPulse Arena Creator Cup live widget."
  };
}

export default function MatchPulseWidgetPage({ params }: { params: { inviteCode: string } }) {
  const fixture = findFixture(params.inviteCode);
  const creator = fixture.creatorRoom;
  const sentiment = baseSnapshot.sentiment;
  const topFans = leaderboard.slice(0, 3);

  return (
    <main className="min-h-screen bg-[#050915] p-3 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-sm flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(13,23,45,0.96),rgba(8,17,38,0.92))] shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
        <div className="relative overflow-hidden p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(47,140,255,0.28),transparent_14rem),radial-gradient(circle_at_85%_12%,rgba(34,211,153,0.18),transparent_12rem)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="live" className="live-dot mb-3 gap-2">
                Live room
              </Badge>
              <h1 className="truncate text-lg font-black">{creator?.creatorName ?? "MatchPulse Arena"}</h1>
              <p className="truncate text-xs font-semibold text-white/55">{creator?.handle ?? "Creator Cup"} watch widget</p>
            </div>
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black ring-1 ring-white/10" style={{ backgroundColor: creator?.themeColor }}>
              {creator?.avatar ?? "MP"}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.08] p-4">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-white/45">{fixture.stage}</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl text-sm font-black ring-1 ring-white/15" style={{ backgroundColor: fixture.home.color }}>
                  {fixture.home.crest}
                </div>
                <p className="mt-2 truncate text-sm font-black">{fixture.home.shortName}</p>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 text-3xl font-black tabular-nums text-[#071026]">
                {baseSnapshot.score.home}-{baseSnapshot.score.away}
              </div>
              <div className="min-w-0 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl text-sm font-black ring-1 ring-white/15" style={{ backgroundColor: fixture.away.color }}>
                  {fixture.away.crest}
                </div>
                <p className="mt-2 truncate text-sm font-black">{fixture.away.shortName}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-white/55">
              <Radio className="size-3.5 text-[#FF4664]" />
              {baseSnapshot.clock.label} / {fixture.venue}
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
            <div className="flex flex-col gap-2">
              {topFans.map((fan, index) => (
                <div key={fan.id} className="flex items-center gap-2 rounded-2xl bg-white/10 p-2">
                  <span className="grid size-7 place-items-center rounded-xl bg-white text-xs font-black text-[#071026]">{index + 1}</span>
                  <span className="grid size-8 place-items-center rounded-xl bg-[#2F8CFF]/25 text-xs font-black">{fan.avatar}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{fan.name}</span>
                  <span className="text-xs font-black text-[#5EE0A4]">{fan.points}</span>
                </div>
              ))}
            </div>
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
