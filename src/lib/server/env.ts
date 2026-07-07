import type { MatchSnapshot } from "@/lib/types";

export type TxLineAdapterMode = "mock" | "real";
export type TxLineNetwork = "devnet" | "mainnet";

export interface TxLineServerConfig {
  adapter: TxLineAdapterMode;
  network: TxLineNetwork;
  apiOrigin: string;
  apiToken?: string;
  jwt?: string;
  programId?: string;
  txlTokenMint?: string;
  solanaRpcUrl: string;
  fixturesPath: string;
  scoreSnapshotPath: string;
  oddsSnapshotPath: string;
  scoreStreamPath: string;
  oddsStreamPath: string;
  historicalScoresPath: string;
}

const devnetDefaults = {
  apiOrigin: "https://txline-dev.txodds.com",
  programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  txlTokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  solanaRpcUrl: "https://api.devnet.solana.com"
};

const mainnetDefaults = {
  apiOrigin: "https://txline.txodds.com",
  programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
  txlTokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com"
};

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

export function getTxLineConfig(): TxLineServerConfig {
  const network = (clean(process.env.TXLINE_NETWORK) ?? "devnet") as TxLineNetwork;
  const defaults = network === "mainnet" ? mainnetDefaults : devnetDefaults;
  const adapter = (clean(process.env.TXLINE_ADAPTER) ?? "real") as TxLineAdapterMode;

  return {
    adapter,
    network,
    apiOrigin: clean(process.env.TXLINE_API_ORIGIN) ?? defaults.apiOrigin,
    apiToken: clean(process.env.TXLINE_API_TOKEN),
    jwt: clean(process.env.TXLINE_JWT) ?? clean(process.env.TXLINE_GUEST_JWT),
    programId: clean(process.env.TXLINE_PROGRAM_ID) ?? defaults.programId,
    txlTokenMint: clean(process.env.TXLINE_TXL_MINT) ?? defaults.txlTokenMint,
    solanaRpcUrl: clean(process.env.SOLANA_RPC_URL) ?? defaults.solanaRpcUrl,
    fixturesPath: clean(process.env.TXLINE_FIXTURES_PATH) ?? "/fixtures/snapshot",
    scoreSnapshotPath: clean(process.env.TXLINE_SCORE_SNAPSHOT_PATH) ?? "/scores/snapshot/{matchId}",
    oddsSnapshotPath: clean(process.env.TXLINE_ODDS_SNAPSHOT_PATH) ?? "/odds/snapshot/{matchId}",
    scoreStreamPath: clean(process.env.TXLINE_SCORE_STREAM_PATH) ?? "/scores/stream",
    oddsStreamPath: clean(process.env.TXLINE_ODDS_STREAM_PATH) ?? "/odds/stream",
    historicalScoresPath: clean(process.env.TXLINE_HISTORICAL_SCORES_PATH) ?? "/scores/historical/{matchId}"
  };
}

export function getTxLineReadiness(config = getTxLineConfig()) {
  const missing = [
    ["TXLINE_API_TOKEN", config.apiToken],
    ["TXLINE_JWT", config.jwt]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    adapter: config.adapter,
    network: config.network,
    provider: (config.adapter === "real" ? "txline" : "mock-txline") as MatchSnapshot["provider"],
    ready: config.adapter === "mock" || missing.length === 0,
    missing
  };
}
