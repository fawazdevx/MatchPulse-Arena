import type { TxLineAdapter } from "@/lib/types";
import { getTxLineConfig, getTxLineReadiness } from "@/lib/server/env";
import { MockTxLineAdapter } from "./mock-adapter";
import { RealTxLineAdapter } from "./real-adapter";
export { txLineEndpoints } from "./endpoints";

export class TxLineSetupError extends Error {
  constructor(public missing: string[]) {
    super(`TxLINE real adapter is not configured. Missing: ${missing.join(", ")}`);
    this.name = "TxLineSetupError";
  }
}

export function getTxLineAdapter(): TxLineAdapter {
  const config = getTxLineConfig();
  const readiness = getTxLineReadiness(config);

  if (config.adapter === "mock") {
    return new MockTxLineAdapter();
  }

  if (!readiness.ready) {
    throw new TxLineSetupError(readiness.missing.filter((item): item is string => Boolean(item)));
  }

  return new RealTxLineAdapter(config);
}

export function getTxLineProvider() {
  return getTxLineReadiness().provider;
}
