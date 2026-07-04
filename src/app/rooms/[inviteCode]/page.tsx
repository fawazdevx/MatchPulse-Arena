import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { baseSnapshot, fixtures, leaderboard } from "@/services/txline/mock-data";

const featureCards = [
  { label: "Fan-safe", value: "No wagering or payouts", Icon: ShieldCheck },
  { label: "Live data", value: "Score and sentiment streams", Icon: Radio },
  { label: "Leaderboard", value: "Streaks, badges, rank", Icon: Trophy }
];

function findFixture(inviteCode: string) {
  const normalized = inviteCode.toLowerCase();
  return fixtures.find((fixture) => fixture.creatorRoom?.inviteCode.toLowerCase() === normalized) ?? fixtures[0];
}

export function generateMetadata({ params }: { params: { inviteCode: string } }): Metadata {
  const fixture = findFixture(params.inviteCode);
  const creator = fixture.creatorRoom;

  return {
    title: `${creator?.creatorName ?? "Creator Cup"} | MatchPulse Arena`,
    description: `Join ${fixture.home.shortName} vs ${fixture.away.shortName} in a MatchPulse Arena watch room.`
  };
}

export default function CreatorRoomInvitePage({ params }: { params: { inviteCode: string } }) {
  const fixture = findFixture(params.inviteCode);
  const creator = fixture.creatorRoom;
  const leaders = leaderboard.slice(0, 3);

  return (
    <main className="arena-shell min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(13,23,45,0.96),rgba(7,16,38,0.9))] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.38)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(47,140,255,0.34),transparent_24rem),radial-gradient(circle_at_88%_14%,rgba(34,211,153,0.18),transparent_22rem)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="creator" className="gap-2">
                <Sparkles className="size-3.5" />
                Creator Cup room
              </Badge>
              <Badge variant="live" className="live-dot gap-2">
                Replay ready
              </Badge>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <div className="grid size-14 place-items-center rounded-2xl text-lg font-black shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-1 ring-white/15" style={{ backgroundColor: creator?.themeColor ?? fixture.home.color }}>
                {creator?.avatar ?? "MP"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-black sm:text-2xl">{creator?.creatorName ?? "MatchPulse Arena"}</p>
                <p className="truncate text-sm font-semibold text-white/55">{creator?.handle ?? "Creator watch room"}</p>
              </div>
            </div>

            <h1 className="mt-8 max-w-3xl text-balance text-4xl font-black leading-[1.02] sm:text-6xl">
              Join the live match pulse for {fixture.home.shortName} vs {fixture.away.shortName}.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
              Follow score, momentum, no-money micro-predictions, badges, and the room leaderboard in a second-screen World Cup experience powered by TxLINE-style match updates.
            </p>

            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild variant="success" className="touch-target">
                <Link href="/">
                  Open full arena
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="touch-target">
                <Link href={`/widget/${params.inviteCode}`}>View live widget</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {featureCards.map(({ label, value, Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.075] p-4">
                  <Icon className="size-5 text-[#5EE0A4]" />
                  <p className="mt-3 text-sm font-black">{label}</p>
                  <p className="mt-1 text-xs font-semibold text-white/50">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.075] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur sm:p-5">
          <div className="rounded-[1.5rem] border border-white/10 bg-[#071026] p-4">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-white/45">{fixture.stage}</p>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl text-sm font-black ring-1 ring-white/15" style={{ backgroundColor: fixture.home.color }}>
                  {fixture.home.crest}
                </div>
                <p className="mt-2 truncate text-base font-black">{fixture.home.shortName}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-4xl font-black tabular-nums text-[#071026]">
                {baseSnapshot.score.home}-{baseSnapshot.score.away}
              </div>
              <div className="min-w-0 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl text-sm font-black ring-1 ring-white/15" style={{ backgroundColor: fixture.away.color }}>
                  {fixture.away.crest}
                </div>
                <p className="mt-2 truncate text-base font-black">{fixture.away.shortName}</p>
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-semibold text-white/55">{baseSnapshot.clock.label} / {fixture.venue}</p>
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black">Top room fans</p>
              <Badge variant="win">Live rank</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {leaders.map((fan, index) => (
                <div key={fan.id} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                  <span className="grid size-8 place-items-center rounded-xl bg-white text-xs font-black text-[#071026]">{index + 1}</span>
                  <span className="grid size-9 place-items-center rounded-xl bg-[#2F8CFF]/25 text-xs font-black">{fan.avatar}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{fan.name}</span>
                  <span className="text-sm font-black text-[#5EE0A4]">{fan.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
