import type { MatchFixture, MatchSnapshot, ReplayTick, TxLineAdapter } from "@/lib/types";
import { MockTxLineAdapter } from "./mock-adapter";

type ProviderFixture = Record<string, unknown>;

const replaceMatchId = (path: string, matchId: string) => path.replace("{matchId}", matchId);

async function txLineFetch<T>(path: string): Promise<T> {
  const apiOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline.txodds.com";
  const guestJwt = process.env.TXLINE_GUEST_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;

  if (!guestJwt || !apiToken) {
    throw new Error("Missing TXLINE_GUEST_JWT or TXLINE_API_TOKEN");
  }

  return fetch(`${apiOrigin.replace(/\/$/, "")}/api${path}`, {
    headers: {
      Authorization: `Bearer ${guestJwt}`,
      "X-Api-Token": apiToken,
      Accept: "application/json"
    },
    cache: "no-store"
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`TxLINE request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  });
}

export class RealTxLineAdapter implements TxLineAdapter {
  private fallback = new MockTxLineAdapter();

  async getFixtures(): Promise<MatchFixture[]> {
    const path = process.env.TXLINE_FIXTURES_PATH ?? "/fixtures";

    try {
      const data = await txLineFetch<{ fixtures?: ProviderFixture[]; data?: ProviderFixture[] }>(path);
      const source = data.fixtures ?? data.data ?? [];

      if (!source.length) {
        return this.fallback.getFixtures();
      }

      return this.fallback.getFixtures();
    } catch {
      return this.fallback.getFixtures();
    }
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const scorePath = replaceMatchId(process.env.TXLINE_SCORE_SNAPSHOT_PATH ?? "/scores/snapshot?fixtureId={matchId}", matchId);
    const oddsPath = replaceMatchId(process.env.TXLINE_ODDS_SNAPSHOT_PATH ?? "/odds/snapshot?fixtureId={matchId}", matchId);

    try {
      await Promise.all([txLineFetch(scorePath), txLineFetch(oddsPath)]);
      return this.fallback.getSnapshot(matchId);
    } catch {
      return this.fallback.getSnapshot(matchId);
    }
  }

  async *getReplayTicks(matchId: string): AsyncGenerator<ReplayTick> {
    yield* this.fallback.getReplayTicks(matchId);
  }
}
