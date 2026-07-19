import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";

test("wallet sign-in nonces are origin-bound and one-time-use in memory mode", async () => {
  process.env.MATCHPULSE_DISABLE_DATABASE = "1";
  const { createWalletNonce, getSessionFromRequest, verifyWalletSignature } = await import("./wallet-session.ts");
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toBase58();
  const origin = "https://matchpulse.example";
  const nonce = await createWalletNonce(walletAddress, origin);

  assert.match(nonce.message, /Domain: matchpulse\.example/);
  assert.match(nonce.message, /URI: https:\/\/matchpulse\.example/);

  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey)).toString("base64");
  const verified = await verifyWalletSignature({
    sessionId: nonce.sessionId,
    walletAddress,
    signature
  });

  assert.equal(verified.session.user.walletAddress, walletAddress);

  await assert.rejects(
    () =>
      verifyWalletSignature({
        sessionId: nonce.sessionId,
        walletAddress,
        signature
      }),
    /already been used/
  );

  const request = new Request(origin, {
    headers: {
      cookie: `matchpulse_session=${verified.sessionToken}`
    }
  });
  const session = await getSessionFromRequest(request);
  assert.equal(session?.user.walletAddress, walletAddress);
});
