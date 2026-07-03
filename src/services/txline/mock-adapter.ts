import type { MatchSnapshot, ReplayTick, TxLineAdapter } from "@/lib/types";
import { baseSnapshot, fixtures, replayTicks } from "./mock-data";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockTxLineAdapter implements TxLineAdapter {
  async getFixtures() {
    return fixtures;
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const fixture = fixtures.find((item) => item.id === matchId) ?? fixtures[0];

    return {
      ...baseSnapshot,
      fixture,
      generatedAt: new Date().toISOString()
    };
  }

  async *getReplayTicks(matchId: string): AsyncGenerator<ReplayTick> {
    const snapshot = await this.getSnapshot(matchId);

    for (const tick of replayTicks) {
      await sleep(1800);
      yield {
        ...tick,
        event: {
          ...tick.event,
          description:
            snapshot.fixture.id === "wc26-esp-aut"
              ? tick.event.description
              : tick.event.description.replace(/Spain/g, snapshot.fixture.home.name).replace(/Austria/g, snapshot.fixture.away.name)
        }
      };
    }
  }
}
