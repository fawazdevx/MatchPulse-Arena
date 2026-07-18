const baseUrl = process.env.MATCHPULSE_BASE_URL ?? "http://localhost:3000";
const expectAdapter = process.env.MATCHPULSE_EXPECT_ADAPTER;

const forbiddenTerms = [
  "place bet",
  "bet now",
  "betting slip",
  "deposit",
  "payout",
  "cash out",
  "wager"
];

function url(path) {
  return new URL(path, baseUrl).toString();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRaw(path, init) {
  const response = await fetch(url(path), init);
  const text = await response.text();

  return {
    response,
    text
  };
}

async function readText(path, init) {
  const result = await readRaw(path, init);
  assert(result.response.ok, `${path} returned ${result.response.status}: ${result.text.slice(0, 240)}`);
  return result;
}

async function readJson(path, init) {
  const { response, text } = await readRaw(path, init);

  try {
    return {
      response,
      json: JSON.parse(text)
    };
  } catch {
    throw new Error(`${path} did not return valid JSON: ${text.slice(0, 240)}`);
  }
}

function assertFanSafeText(label, text) {
  const normalized = text.toLowerCase();
  const found = forbiddenTerms.filter((term) => normalized.includes(term));

  assert(found.length === 0, `${label} contains fan-safety forbidden terms: ${found.join(", ")}`);
}

async function checkPublicPages() {
  const pages = [
    ["/", "MatchPulse Arena"],
    ["/txline-activate", "TxLINE"]
  ];

  for (const [path, expectedText] of pages) {
    const { text } = await readText(path);
    assert(text.includes(expectedText), `${path} did not contain expected text: ${expectedText}`);
    assertFanSafeText(path, text);
  }
}

async function checkTxLineFixtureBehavior() {
  const { response, json } = await readJson("/api/txline/fixtures");
  assertFanSafeText("fixtures response", JSON.stringify(json));

  if (response.status === 503) {
    assert(Array.isArray(json.missing), "live setup response must include missing credentials");
    assert(json.missing.includes("TXLINE_API_TOKEN") || json.missing.includes("TXLINE_JWT"), "setup response must name TxLINE credentials");
    return null;
  }

  assert(response.ok, `fixtures returned ${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  assert(Array.isArray(json.fixtures), "fixtures response must include fixtures array");
  assert(json.fixtures.length > 0, "fixtures response must include at least one live or configured fixture");

  if (expectAdapter) {
    assert(json.adapter === expectAdapter, `fixtures adapter should be ${expectAdapter}, received ${json.adapter}`);
  }

  return json.fixtures[0]?.id;
}

async function checkSnapshotAndStream(matchId) {
  if (!matchId) return;

  const { response, json } = await readJson(`/api/txline/matches/${encodeURIComponent(matchId)}/snapshot`);
  assert(response.ok, `snapshot returned ${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  assert(json.fixture?.id === matchId, "snapshot must return selected fixture");
  assert(typeof json.score?.home === "number", "snapshot must include numeric home score");
  assert(typeof json.sentiment?.home === "number", "snapshot must include market sentiment");
  assertFanSafeText("snapshot response", JSON.stringify(json));

  if (expectAdapter === "mock") {
    const { text } = await readText(`/api/txline/matches/${encodeURIComponent(matchId)}/stream?mode=replay`);
    assert(text.includes("event: connected"), "replay stream must include connected event");
    assert(text.includes("event: tick"), "replay stream must include tick events");
    assertFanSafeText("stream response", text);
  }
}

async function checkStateAndCreatorFallback(matchId) {
  const state = await readJson("/api/game/state");
  assert(Array.isArray(state.json.leaderboard), "game state must include leaderboard array");
  assertFanSafeText("game state", JSON.stringify(state.json));

  const creator = await readJson("/api/creator/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      creatorName: "Smoke Test FC",
      handle: "@smoketest",
      sponsor: "Fan Partner",
      themeColor: "#0B7A53",
      inviteCode: "SMOKE-TEST-FC",
      matchId
    })
  });

  assert([200, 401, 422, 503].includes(creator.response.status), `creator response returned unexpected status ${creator.response.status}`);
  assertFanSafeText("creator response", JSON.stringify(creator.json));
}

async function main() {
  await checkPublicPages();
  console.log("ok - public pages");

  const matchId = await checkTxLineFixtureBehavior();
  console.log("ok - TxLINE fixture behavior");

  await checkSnapshotAndStream(matchId);
  console.log("ok - snapshot/stream behavior");

  await checkStateAndCreatorFallback(matchId);
  console.log("ok - state and creator behavior");
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
