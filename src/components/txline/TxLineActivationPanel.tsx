"use client";

import { useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction
} from "@solana/web3.js";
import { CheckCircle2, Copy, ExternalLink, KeyRound, Radio, ShieldCheck, Wallet, XCircle } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const NETWORK_CONFIG = {
  devnet: {
    label: "Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG")
  },
  mainnet: {
    label: "Mainnet",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL")
  }
} as const;
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];

type ActivationStep = "idle" | "connect" | "idl" | "ata" | "subscribe" | "jwt" | "sign" | "activate" | "complete" | "error";
type InjectedWalletName = "phantom" | "solflare";
type ActivationNetwork = keyof typeof NETWORK_CONFIG;

interface InjectedWallet {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBase58(): string };
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toBase58(): string } } | void>;
  disconnect?(): Promise<void>;
  signTransaction?<T>(transaction: T): Promise<T>;
  signAllTransactions?<T>(transactions: T[]): Promise<T[]>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<Uint8Array | { signature: Uint8Array }>;
}

interface ActivationResult {
  txSig: string;
  jwt: string;
  apiToken: string;
}

interface BrowserAnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? error.message;
  }

  return error instanceof Error ? error.message : "Unknown activation error.";
}

function getInjectedWallet(name: InjectedWalletName) {
  if (typeof window === "undefined") return null;
  return (name === "phantom" ? window.phantom?.solana ?? null : window.solflare ?? null) as InjectedWallet | null;
}

function getPublicKey(wallet: InjectedWallet) {
  if (!wallet.publicKey) return null;
  return new PublicKey(wallet.publicKey.toBase58());
}

export function TxLineActivationPanel() {
  const [network, setNetwork] = useState<ActivationNetwork>("devnet");
  const [walletName, setWalletName] = useState<InjectedWalletName>("phantom");
  const [wallet, setWallet] = useState<InjectedWallet | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [step, setStep] = useState<ActivationStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActivationResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const networkConfig = NETWORK_CONFIG[network];
  const apiBaseUrl = `${networkConfig.apiOrigin}/api`;
  const connection = useMemo(() => new Connection(networkConfig.rpcUrl, "confirmed"), [networkConfig.rpcUrl]);
  const canActivate = Boolean(wallet && walletAddress);

  const statusText = useMemo(() => {
    const labels: Record<ActivationStep, string> = {
      idle: "Ready",
      connect: "Connecting wallet",
      idl: "Loading TxLINE IDL",
      ata: "Preparing token account",
      subscribe: "Waiting for wallet approval",
      jwt: "Requesting guest JWT",
      sign: "Sign activation message",
      activate: "Activating API token",
      complete: "Complete",
      error: "Blocked"
    };

    return labels[step];
  }, [step]);

  async function connectWallet(selectedWallet: InjectedWalletName = walletName) {
    setError(null);
    setStep("connect");

    try {
      const detectedWallet = getInjectedWallet(selectedWallet);
      if (!detectedWallet) {
        throw new Error(
          selectedWallet === "phantom"
            ? `Phantom was not detected. Install Phantom, enable ${network}, then reload this page.`
            : `Solflare was not detected. Install Solflare, switch to ${network}, then reload this page.`
        );
      }

      await detectedWallet.connect();
      const publicKey = getPublicKey(detectedWallet);
      if (!publicKey) {
        throw new Error("Wallet connected, but no public key was returned.");
      }

      setWalletName(selectedWallet);
      setWallet(detectedWallet);
      setWalletAddress(publicKey.toBase58());
      setStep("idle");
    } catch (connectError) {
      setError(getErrorMessage(connectError));
      setStep("error");
    }
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function activate() {
    if (!wallet) {
      await connectWallet();
      return;
    }

    try {
      setError(null);
      setResult(null);
      setStep("idl");

      const publicKey = getPublicKey(wallet);
      if (!publicKey) {
        throw new Error(`Connect Phantom or Solflare on ${network} before activating.`);
      }
      if (!wallet.signTransaction || !wallet.signAllTransactions) {
        throw new Error(`${walletName} does not expose transaction signing in this browser session.`);
      }

      const anchorWallet: BrowserAnchorWallet = {
        publicKey,
        signTransaction: wallet.signTransaction.bind(wallet),
        signAllTransactions: wallet.signAllTransactions.bind(wallet)
      };
      const provider = new anchor.AnchorProvider(connection, anchorWallet as anchor.Wallet, {
        commitment: "confirmed"
      });

      const idl = await anchor.Program.fetchIdl(networkConfig.programId, provider);
      if (!idl) {
        throw new Error(`TxLINE ${network} IDL was not found on-chain. Ask TxLINE for the ${network} txoracle IDL JSON, then add it to the project for local import.`);
      }

      const program = new anchor.Program(idl, provider);
      if (!program.programId.equals(networkConfig.programId)) {
        throw new Error(`Loaded IDL program ${program.programId.toBase58()} does not match ${network} program ${networkConfig.programId.toBase58()}.`);
      }

      const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("token_treasury_v2")],
        program.programId
      );
      const tokenTreasuryVault = getAssociatedTokenAddressSync(
        networkConfig.txlTokenMint,
        tokenTreasuryPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("pricing_matrix")],
        program.programId
      );
      const userTokenAccount = getAssociatedTokenAddressSync(
        networkConfig.txlTokenMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const userTokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
      if (!userTokenAccountInfo) {
        setStep("ata");
        const createUserTokenAccountTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userTokenAccount,
            publicKey,
            networkConfig.txlTokenMint,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        await provider.sendAndConfirm(createUserTokenAccountTx, []);
      }

      setStep("subscribe");
      const txSig = await program.methods
        .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
        .accounts({
          user: publicKey,
          pricingMatrix: pricingMatrixPda,
          tokenMint: networkConfig.txlTokenMint,
          userTokenAccount,
          tokenTreasuryVault,
          tokenTreasuryPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
        .rpc();

      setStep("jwt");
      const authResponse = await axios.post(`${networkConfig.apiOrigin}/auth/guest/start`);
      const jwt = authResponse.data.token as string;

      setStep("sign");
      const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
      const message = new TextEncoder().encode(messageString);
      const signatureResult = await wallet.signMessage(message, "utf8");
      const signatureBytes = signatureResult instanceof Uint8Array ? signatureResult : signatureResult.signature;
      const walletSignature = toBase64(signatureBytes);

      setStep("activate");
      const activationResponse = await axios.post(
        `${apiBaseUrl}/token/activate`,
        {
          txSig,
          walletSignature,
          leagues: SELECTED_LEAGUES
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`
          }
        }
      );
      const apiToken = (activationResponse.data.token ?? activationResponse.data) as string;

      setResult({ txSig, jwt, apiToken });
      setStep("complete");
    } catch (activationError) {
      setError(getErrorMessage(activationError));
      setStep("error");
    }
  }

  return (
    <main className="arena-shell min-h-screen px-3 py-6 text-white sm:px-4 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Card className="premium-card overflow-hidden border-0">
          <CardHeader className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(47,140,255,0.22),transparent_18rem)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Badge variant="win" className="mb-3 gap-2">
                  <ShieldCheck className="h-3 w-3" />
                  {networkConfig.label} activation
                </Badge>
                <CardTitle className="text-2xl sm:text-3xl">TxLINE API token setup</CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Connect a {network} wallet, register the World Cup tier on-chain, sign the activation message, and get credentials for MatchPulse Arena.
                </CardDescription>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                {(["devnet", "mainnet"] as ActivationNetwork[]).map((item) => (
                  <Button
                    key={item}
                    className="w-full sm:w-auto"
                    variant={network === item ? "success" : "outline"}
                    onClick={() => {
                      setNetwork(item);
                      setResult(null);
                      setError(null);
                    }}
                  >
                    {NETWORK_CONFIG[item].label}
                  </Button>
                ))}
                <Button className="w-full sm:w-auto" variant={walletName === "phantom" ? "success" : "outline"} onClick={() => connectWallet("phantom")}>
                  Phantom
                </Button>
                <Button className="w-full sm:w-auto" variant={walletName === "solflare" ? "success" : "outline"} onClick={() => connectWallet("solflare")}>
                  Solflare
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoTile icon={Radio} label="Network" value={`Solana ${network}`} />
              <InfoTile icon={KeyRound} label="Service level" value="1 / 60s World Cup" />
              <InfoTile icon={Wallet} label="Wallet" value={walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : "Not connected"} />
            </div>

            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.07] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-black">Activation status</p>
                <Badge variant={step === "complete" ? "win" : step === "error" ? "live" : "secondary"}>{statusText}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {["IDL", "Token account", "Subscribe", "JWT", "Sign", "Activate"].map((label, index) => {
                  const activeIndex = ["idle", "connect", "idl", "ata", "subscribe", "jwt", "sign", "activate", "complete", "error"].indexOf(step);
                  const stepIndex = index + 2;
                  const done = step === "complete" || activeIndex > stepIndex;
                  return (
                    <div key={label} className={cn("rounded-2xl border px-3 py-2 text-xs font-black", done ? "border-[#22D391]/30 bg-[#22D391]/10 text-[#8AF2C9]" : "border-white/10 bg-white/[0.05] text-white/[0.52]")}>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            {!walletAddress && (
              <p className="rounded-2xl border border-[#FFD166]/20 bg-[#FFD166]/10 p-3 text-sm font-semibold text-[#FFE49A]">
                Connect Phantom or Solflare and make sure that wallet is using {network}. The app cannot switch the wallet extension network for you.
              </p>
            )}

            {error && (
              <div className="rounded-2xl border border-[#FF4664]/25 bg-[#FF4664]/10 p-4 text-sm text-[#FFB4C0]">
                <div className="mb-2 flex items-center gap-2 font-black">
                  <XCircle className="h-4 w-4" />
                  Activation blocked
                </div>
                <p className="leading-6">{error}</p>
              </div>
            )}

            <Button className="w-full" variant="success" onClick={activate} disabled={!canActivate || ["connect", "idl", "ata", "subscribe", "jwt", "sign", "activate"].includes(step)}>
              <KeyRound className="mr-2 h-4 w-4" />
              {!canActivate ? "Connect wallet first" : step === "idle" || step === "error" ? `Activate ${network} API token` : "Activation running"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="glass-card-soft border-0">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#8AF2C9]" />
                <CardTitle>Credentials ready</CardTitle>
              </div>
              <CardDescription>Store these in your backend environment. Do not commit the actual values.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SecretRow label={`TXLINE_${network.toUpperCase()}_SUBSCRIPTION_TX`} value={result.txSig} copied={copied} onCopy={copyValue} />
              <SecretRow label="TXLINE_JWT" value={result.jwt} copied={copied} onCopy={copyValue} />
              <SecretRow label="TXLINE_API_TOKEN" value={result.apiToken} copied={copied} onCopy={copyValue} />
              <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#050915]/[0.72] p-4 text-xs text-white/[0.72]">
{`TXLINE_ADAPTER=real
TXLINE_NETWORK=${network}
TXLINE_API_ORIGIN=${networkConfig.apiOrigin}
TXLINE_PROGRAM_ID=${networkConfig.programId.toBase58()}
TXLINE_TXL_MINT=${networkConfig.txlTokenMint.toBase58()}
SOLANA_RPC_URL=${networkConfig.rpcUrl}
TXLINE_JWT=${result.jwt}
TXLINE_API_TOKEN=${result.apiToken}`}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card-soft border-0">
          <CardHeader>
            <CardTitle>What this page runs</CardTitle>
            <CardDescription>Devnet is recommended first. Free tier requires no real funds, just the selected network transaction fee.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-white/[0.62]">
            <p>1. Fetches the TxLINE {network} Anchor IDL from program <span className="break-all font-mono text-[#9FC7FF]">{networkConfig.programId.toBase58()}</span>.</p>
            <p>2. Sends subscribe(1, 4) for the World Cup and International Friendlies free tier.</p>
            <p>3. Calls /auth/guest/start on <span className="break-all font-mono text-[#9FC7FF]">{networkConfig.apiOrigin}</span> to get a JWT.</p>
            <p>4. Signs the activation message txSig::jwt with your wallet.</p>
            <p>5. Calls /api/token/activate and returns the API token.</p>
            <a className="inline-flex items-center gap-2 font-bold text-[#9FC7FF]" href="https://txline.txodds.com/documentation/worldcup" target="_blank" rel="noreferrer">
              TxLINE World Cup docs
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Radio; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3">
      <Icon className="mb-3 h-4 w-4 text-[#8AF2C9]" />
      <p className="text-xs font-semibold text-white/[0.52]">{label}</p>
      <p className="mt-1 truncate font-black text-white">{value}</p>
    </div>
  );
}

function SecretRow({
  label,
  value,
  copied,
  onCopy
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3">
      <div className="mb-2 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
        <p className="break-all text-xs font-black text-white/[0.58]">{label}</p>
        <Button className="w-full min-[420px]:w-auto" size="sm" variant="outline" onClick={() => onCopy(label, value)}>
          <Copy className="mr-2 h-4 w-4" />
          {copied === label ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="break-all font-mono text-xs text-[#9FC7FF]">{value}</p>
    </div>
  );
}
