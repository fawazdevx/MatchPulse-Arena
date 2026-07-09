import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TeamCrest } from "@/components/TeamCrest";
import { getPublicCreatorRoom } from "@/services/storage/creator-public";

export const dynamic = "force-dynamic";

const featureCards = [
  { label: "Fan-safe", value: "Points, streaks, and badges", Icon: ShieldCheck },
  { label: "Live data", value: "Score and sentiment streams", Icon: Radio },
  { label: "Leaderboard", value: "Streaks, badges, rank", Icon: Trophy }
];

export async function generateMetadata({ params }: { params: { inviteCode: string } }): Promise<Metadata> {
  const room = await getPublicCreatorRoom(params.inviteCode);

  return {
    title: `${room?.creatorName ?? "Creator Cup"} | MatchPulse Arena`,
    description: room
      ? `Join ${room.fixture.home.shortName} vs ${room.fixture.away.shortName} in a MatchPulse Arena watch room.`
      : "Creator Cup room on MatchPulse Arena."
  };
}

export default async function CreatorRoomInvitePage({ params }: { params: { inviteCode: string } }) {
  const room = await getPublicCreatorRoom(params.inviteCode);

  if (!room) {
    return <CreatorRoomUnavailable inviteCode={params.inviteCode} />;
  }

  const { fixture, snapshot } = room;
  const scoreLabel = snapshot ? `${snapshot.score.home}-${snapshot.score.away}` : "--";
  const clockLabel = snapshot ? snapshot.clock.label : "Awaiting live snapshot";

  return (
    <main className="arena-shell min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[linear-gradient(145deg,rgba(8,18,18,0.96),rgba(4,10,14,0.92))] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.38)] sm:p-8">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(34,211,145,0.1),transparent_42%)] bg-[length:72px_72px,auto]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="creator" className="gap-2">
                <Sparkles className="size-3.5" />
                Creator Cup room
              </Badge>
              <Badge variant={snapshot ? "live" : "secondary"} className={snapshot ? "live-dot gap-2" : "gap-2"}>
                {snapshot ? "Live TxLINE" : "Setup pending"}
              </Badge>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <div className="grid size-14 place-items-center rounded-2xl text-lg font-black shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-1 ring-white/15" style={{ backgroundColor: room.themeColor }}>
                {room.avatar}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-black sm:text-2xl">{room.creatorName}</p>
                <p className="truncate text-sm font-semibold text-white/55">{room.handle}</p>
              </div>
            </div>

            <h1 className="mt-8 max-w-3xl text-balance text-4xl font-black leading-[1.02] sm:text-6xl">
              Join the live match pulse for {fixture.home.shortName} vs {fixture.away.shortName}.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
              Follow score, momentum, no-money micro-predictions, badges, and the room leaderboard in a second-screen World Cup experience powered by TxLINE match updates.
            </p>

            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row">
              <Button asChild variant="success" className="touch-target">
                <Link href="/">
                  Open full arena
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="touch-target">
                <Link href={`/widget/${room.inviteCode}`}>View live widget</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {featureCards.map(({ label, value, Icon }) => (
                <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4">
                  <Icon className="size-5 text-[#22D391]" />
                  <p className="mt-3 text-sm font-black">{label}</p>
                  <p className="mt-1 text-xs font-semibold text-white/50">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.05] p-4 shadow-[0_26px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-5">
          <div className="rounded-[1.5rem] border border-white/[0.08] bg-[#071112] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-white/45">{fixture.stage}</p>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <TeamCrest name={fixture.home.name} crest={fixture.home.crest} color={fixture.home.color} className="mx-auto size-14 text-sm" />
                <p className="mt-2 truncate text-base font-black">{fixture.home.shortName}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-4xl font-black tabular-nums text-[#02070a]">
                {scoreLabel}
              </div>
              <div className="min-w-0 text-center">
                <TeamCrest name={fixture.away.name} crest={fixture.away.crest} color={fixture.away.color} className="mx-auto size-14 text-sm" />
                <p className="mt-2 truncate text-base font-black">{fixture.away.shortName}</p>
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-semibold text-white/55">{clockLabel} / {fixture.venue}</p>
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-white/[0.06] bg-white/[0.06] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black">Top room fans</p>
              <Badge variant="win">Live rank</Badge>
            </div>
            {room.leaderboard.length ? (
              <div className="flex flex-col gap-2">
                {room.leaderboard.map((fan, index) => (
                  <div key={fan.id} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                    <span className="grid size-8 place-items-center rounded-xl bg-white text-xs font-black text-[#040814]">{index + 1}</span>
                    <span className="grid size-9 place-items-center rounded-xl bg-[#22D391]/20 text-xs font-black ring-1 ring-[#22D391]/25">{fan.avatar}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{fan.name}</span>
                    <span className="text-sm font-black text-[#22D391]">{fan.points}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 text-sm text-white/58">Leaderboard opens when fans submit persisted predictions.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function CreatorRoomUnavailable({ inviteCode }: { inviteCode: string }) {
  return (
    <main className="arena-shell grid min-h-screen place-items-center px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-white/[0.06] bg-white/[0.06] p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur">
        <Badge variant="creator" className="mb-4">Creator Cup</Badge>
        <h1 className="text-3xl font-black">Room is not live yet</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          No persisted Creator Cup room was found for <span className="font-mono text-white">{inviteCode}</span>. Connect a wallet, configure TxLINE credentials, then launch the room from Creator Cup setup.
        </p>
        <Button asChild className="mt-5" variant="success">
          <Link href="/">Open MatchPulse Arena</Link>
        </Button>
      </section>
    </main>
  );
}
