import type {
  LeaderboardUser,
  MatchEvent,
  MatchFixture,
  MatchSnapshot,
  PredictionCard,
  ReplayTick
} from "@/lib/types";

const endpointBase = "txline";

export const fixtures: MatchFixture[] = [
  {
    id: "wc26-esp-aut",
    competition: "FIFA World Cup 2026",
    stage: "Round of 32",
    venue: "SoFi Stadium, Los Angeles",
    kickoffIso: "2026-07-03T18:00:00.000Z",
    status: "live",
    featured: true,
    home: {
      id: "home",
      name: "Spain",
      shortName: "ESP",
      color: "#C60B1E",
      crest: "ES",
      record: "W2 D1 L0"
    },
    away: {
      id: "away",
      name: "Austria",
      shortName: "AUT",
      color: "#E30613",
      crest: "AT",
      record: "W1 D1 L1"
    },
    creatorRoom: {
      creatorName: "The Final Third",
      handle: "@finalthirdlive",
      avatar: "FT",
      themeColor: "#C60B1E",
      sponsor: "Pulse Hydration",
      inviteCode: "FINALTHIRD-ESPAUT"
    }
  },
  {
    id: "wc26-por-cro",
    competition: "FIFA World Cup 2026",
    stage: "Round of 32",
    venue: "BMO Field, Toronto",
    kickoffIso: "2026-07-03T21:00:00.000Z",
    status: "pre",
    featured: false,
    home: {
      id: "home",
      name: "Portugal",
      shortName: "POR",
      color: "#006600",
      crest: "PT",
      record: "W1 D2 L0"
    },
    away: {
      id: "away",
      name: "Croatia",
      shortName: "CRO",
      color: "#005BAA",
      crest: "HR",
      record: "W1 D1 L1"
    }
  },
  {
    id: "wc26-sui-alg",
    competition: "FIFA World Cup 2026",
    stage: "Round of 32",
    venue: "BC Place, Vancouver",
    kickoffIso: "2026-07-04T01:00:00.000Z",
    status: "pre",
    featured: false,
    home: {
      id: "home",
      name: "Switzerland",
      shortName: "SUI",
      color: "#DA291C",
      crest: "CH",
      record: "W2 D1 L0"
    },
    away: {
      id: "away",
      name: "Algeria",
      shortName: "ALG",
      color: "#007A3D",
      crest: "DZ",
      record: "W1 D1 L1"
    },
    creatorRoom: {
      creatorName: "Boot Room Live",
      handle: "@bootroom",
      avatar: "BR",
      themeColor: "#DA291C",
      sponsor: "Northside Mobile",
      inviteCode: "BOOTROOM-SUI"
    }
  }
];

const initialEvents: MatchEvent[] = [
  {
    id: "evt-000",
    minute: 1,
    type: "kickoff",
    title: "Kickoff",
    description: "Spain get the room started with a high press.",
    impact: "low"
  },
  {
    id: "evt-001",
    minute: 9,
    type: "corner",
    team: "home",
    title: "Spain corner",
    description: "A quick left-side overload pushes the pulse toward Spain.",
    impact: "medium",
    sentimentAfter: {
      home: 49,
      draw: 30,
      away: 21,
      trend: "home",
      delta: 5,
      label: "Spain pressure rising",
      sourceUpdateId: "odds-001"
    }
  }
];

export const predictionDeck: PredictionCard[] = [
  {
    id: "pred-001",
    kind: "momentum",
    prompt: "Who gains match pulse in the next 3 minutes?",
    context: "Spain just forced a corner and the room is leaning red.",
    options: [
      { id: "home", label: "Spain surge", team: "home" },
      { id: "away", label: "Austria answer", team: "away" },
      { id: "neutral", label: "Stays balanced" }
    ],
    lockAt: 12,
    resolvesAt: 16,
    source: {
      stream: "odds",
      endpoint: `${endpointBase}/api/odds/stream`,
      expectedSignal: "next implied-probability delta"
    },
    resolved: {
      optionId: "away",
      eventId: "evt-002",
      explanation: "Austria's transition chance moved sentiment back their way."
    }
  },
  {
    id: "pred-002",
    kind: "next_event",
    prompt: "Next major match event?",
    context: "The midfield is stretching and both fullbacks are high.",
    options: [
      { id: "goal", label: "Goal" },
      { id: "card", label: "Card" },
      { id: "corner", label: "Corner" },
      { id: "none", label: "No major event" }
    ],
    lockAt: 26,
    resolvesAt: 32,
    sponsor: {
      name: "Pulse Hydration",
      label: "Creator Cup sponsored read"
    },
    source: {
      stream: "score",
      endpoint: `${endpointBase}/api/scores/stream`,
      expectedSignal: "next tracked event type"
    },
    resolved: {
      optionId: "goal",
      eventId: "evt-004",
      explanation: "Spain's recycled corner became the first goal."
    }
  },
  {
    id: "pred-003",
    kind: "post_event",
    prompt: "After the goal, where does the market reaction move?",
    context: "Spain lead 1-0. Watch for a room-wide overreaction or quick correction.",
    options: [
      { id: "home", label: "Toward Spain", team: "home" },
      { id: "away", label: "Toward Austria", team: "away" },
      { id: "neutral", label: "Settles neutral" }
    ],
    lockAt: 35,
    resolvesAt: 41,
    source: {
      stream: "odds",
      endpoint: `${endpointBase}/api/odds/stream`,
      expectedSignal: "post-goal implied-probability move"
    },
    resolved: {
      optionId: "home",
      eventId: "evt-005",
      explanation: "Spain's sentiment jumped again after the restart."
    }
  },
  {
    id: "pred-004",
    kind: "odds_shift",
    prompt: "Will the next sentiment shift favor Spain or Austria?",
    context: "Austria are sending more runners into the box after the hour.",
    options: [
      { id: "home", label: "Spain hold", team: "home" },
      { id: "away", label: "Austria rally", team: "away" },
      { id: "neutral", label: "No clear move" }
    ],
    lockAt: 67,
    resolvesAt: 72,
    source: {
      stream: "odds",
      endpoint: `${endpointBase}/api/odds/stream`,
      expectedSignal: "odds movement over five-minute window"
    },
    resolved: {
      optionId: "away",
      eventId: "evt-007",
      explanation: "Austria's equalizer pushed the live market reaction hard their way."
    }
  },
  {
    id: "pred-005",
    kind: "next_event",
    prompt: "What happens in the final 10 minutes?",
    context: "The room pulse is wild and both benches are active.",
    options: [
      { id: "goal", label: "Goal" },
      { id: "card", label: "Card" },
      { id: "corner", label: "Corner" },
      { id: "none", label: "No major event" }
    ],
    lockAt: 82,
    resolvesAt: 87,
    sponsor: {
      name: "Pulse Hydration",
      label: "Late drama challenge"
    },
    source: {
      stream: "score",
      endpoint: `${endpointBase}/api/scores/stream`,
      expectedSignal: "late event feed"
    },
    resolved: {
      optionId: "card",
      eventId: "evt-009",
      explanation: "A tactical yellow card stopped Spain's break."
    }
  }
];

export const baseSnapshot: MatchSnapshot = {
  fixture: fixtures[0],
  clock: {
    minute: 11,
    stoppage: 0,
    phase: "live",
    label: "11'"
  },
  score: {
    home: 0,
    away: 0
  },
  sentiment: {
    home: 49,
    draw: 30,
    away: 21,
    trend: "home",
    delta: 5,
    label: "Spain pressure rising",
    sourceUpdateId: "odds-001"
  },
  events: initialEvents,
  generatedAt: "2026-07-03T18:11:00.000Z",
  provider: "mock-txline"
};

export const replayTicks: ReplayTick[] = [
  {
    atSecond: 2,
    event: {
      id: "evt-002",
      minute: 16,
      type: "momentum",
      team: "away",
      title: "Austria counterpunch",
      description: "A fast break draws a save and pulls momentum toward Austria.",
      impact: "medium"
    },
    sentiment: {
      home: 43,
      draw: 31,
      away: 26,
      trend: "away",
      delta: 5,
      label: "Austria response",
      sourceUpdateId: "odds-002"
    },
    prediction: predictionDeck[0]
  },
  {
    atSecond: 7,
    event: {
      id: "evt-003",
      minute: 24,
      type: "yellow_card",
      team: "away",
      title: "Austria booked",
      description: "A late challenge breaks up the left channel run.",
      impact: "medium"
    },
    sentiment: {
      home: 47,
      draw: 32,
      away: 21,
      trend: "home",
      delta: 4,
      label: "Spain edge returns",
      sourceUpdateId: "odds-003"
    }
  },
  {
    atSecond: 12,
    event: {
      id: "evt-004",
      minute: 32,
      type: "goal",
      team: "home",
      title: "Goal Spain",
      description: "Spain recycle a corner and finish low across the keeper.",
      impact: "high"
    },
    score: {
      home: 1,
      away: 0
    },
    sentiment: {
      home: 63,
      draw: 23,
      away: 14,
      trend: "home",
      delta: 16,
      label: "Spain take control",
      sourceUpdateId: "odds-004"
    },
    prediction: predictionDeck[1]
  },
  {
    atSecond: 17,
    event: {
      id: "evt-005",
      minute: 41,
      type: "momentum",
      team: "home",
      title: "Home pulse holds",
      description: "The first reaction after the goal keeps drifting Spain's way.",
      impact: "medium"
    },
    sentiment: {
      home: 67,
      draw: 21,
      away: 12,
      trend: "home",
      delta: 4,
      label: "Spain sentiment holds",
      sourceUpdateId: "odds-005"
    },
    prediction: predictionDeck[2]
  },
  {
    atSecond: 22,
    event: {
      id: "evt-006",
      minute: 63,
      type: "corner",
      team: "away",
      title: "Austria corner spell",
      description: "Three Austria attacks in a row shift the room's pressure read.",
      impact: "medium"
    },
    sentiment: {
      home: 56,
      draw: 27,
      away: 17,
      trend: "away",
      delta: 9,
      label: "Austria pressure building",
      sourceUpdateId: "odds-006"
    }
  },
  {
    atSecond: 27,
    event: {
      id: "evt-007",
      minute: 72,
      type: "goal",
      team: "away",
      title: "Goal Austria",
      description: "Austria find the equalizer after a clipped cross to the back post.",
      impact: "high"
    },
    score: {
      home: 1,
      away: 1
    },
    sentiment: {
      home: 38,
      draw: 39,
      away: 23,
      trend: "away",
      delta: 18,
      label: "Austria level the pulse",
      sourceUpdateId: "odds-007"
    },
    prediction: predictionDeck[3]
  },
  {
    atSecond: 33,
    event: {
      id: "evt-008",
      minute: 81,
      type: "substitution",
      team: "home",
      title: "Spain add pace",
      description: "A direct winger comes on and the room expects one more swing.",
      impact: "low"
    },
    sentiment: {
      home: 41,
      draw: 38,
      away: 21,
      trend: "home",
      delta: 3,
      label: "Late Spain lift",
      sourceUpdateId: "odds-008"
    }
  },
  {
    atSecond: 39,
    event: {
      id: "evt-009",
      minute: 87,
      type: "yellow_card",
      team: "away",
      title: "Late tactical card",
      description: "Austria stop a break and the final challenge resolves.",
      impact: "medium"
    },
    sentiment: {
      home: 45,
      draw: 36,
      away: 19,
      trend: "home",
      delta: 4,
      label: "Spain late pressure",
      sourceUpdateId: "odds-009"
    },
    prediction: predictionDeck[4]
  },
  {
    atSecond: 47,
    event: {
      id: "evt-010",
      minute: 90,
      stoppage: 5,
      type: "full_time",
      title: "Full time",
      description: "A 1-1 draw leaves both fan rooms with late-drama points.",
      impact: "low"
    },
    sentiment: {
      home: 39,
      draw: 41,
      away: 20,
      trend: "neutral",
      delta: 2,
      label: "Result settled",
      sourceUpdateId: "odds-010"
    }
  }
];

export const leaderboard: LeaderboardUser[] = [
  {
    id: "u1",
    name: "Maya",
    avatar: "MA",
    points: 1420,
    streak: 6,
    bestStreak: 8,
    badges: ["first-read", "hat-trick", "five-star-fan", "market-whisperer"],
    trend: "up"
  },
  {
    id: "u2",
    name: "Kojo",
    avatar: "KO",
    points: 1280,
    streak: 3,
    bestStreak: 5,
    badges: ["first-read", "hat-trick", "goal-reader"],
    trend: "same"
  },
  {
    id: "u3",
    name: "Ari",
    avatar: "AR",
    points: 1190,
    streak: 4,
    bestStreak: 4,
    badges: ["first-read", "room-captain"],
    trend: "down"
  },
  {
    id: "you",
    name: "You",
    avatar: "YO",
    points: 980,
    streak: 2,
    bestStreak: 3,
    badges: ["kickoff-crew"],
    trend: "up"
  },
  {
    id: "u5",
    name: "Nadia",
    avatar: "ND",
    points: 910,
    streak: 1,
    bestStreak: 4,
    badges: ["first-read"],
    trend: "same"
  }
];
