import type { TxLineAdapter } from "@/lib/types";
import { MockTxLineAdapter } from "./mock-adapter";
import { RealTxLineAdapter } from "./real-adapter";
export { txLineEndpoints } from "./endpoints";

export function getTxLineAdapter(): TxLineAdapter {
  if (process.env.TXLINE_GUEST_JWT && process.env.TXLINE_API_TOKEN) {
    return new RealTxLineAdapter();
  }

  return new MockTxLineAdapter();
}
