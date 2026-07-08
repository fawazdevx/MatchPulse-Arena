import type { MatchFixture } from "@/lib/types";

type RuntimeTxLineCache = {
  fixtures?: MatchFixture[];
  fixturesUpdatedAt?: number;
};

const globalCache = globalThis as typeof globalThis & {
  __matchPulseTxLineCache?: RuntimeTxLineCache;
};

function cache() {
  globalCache.__matchPulseTxLineCache ??= {};
  return globalCache.__matchPulseTxLineCache;
}

export function rememberRuntimeFixtures(fixtures: MatchFixture[]) {
  if (!fixtures.length) return;

  cache().fixtures = fixtures;
  cache().fixturesUpdatedAt = Date.now();
}

export function getRuntimeFixture(matchId: string) {
  return cache().fixtures?.find((fixture) => fixture.id === matchId);
}
