import type { Badge } from "@/lib/types";

export const badges: Badge[] = [
  {
    id: "first-read",
    name: "First Read",
    description: "First correct prediction",
    tone: "bronze"
  },
  {
    id: "hat-trick",
    name: "Hat Trick",
    description: "Three correct predictions in a row",
    tone: "silver"
  },
  {
    id: "five-star-fan",
    name: "Five-Star Fan",
    description: "Five correct predictions in a row",
    tone: "gold"
  },
  {
    id: "ice-cold",
    name: "Ice Cold",
    description: "Ten correct predictions in a row",
    tone: "platinum"
  },
  {
    id: "market-whisperer",
    name: "Market Whisperer",
    description: "Five correct sentiment-movement reads",
    tone: "silver"
  },
  {
    id: "momentum-master",
    name: "Momentum Master",
    description: "Ten correct momentum predictions",
    tone: "gold"
  },
  {
    id: "goal-reader",
    name: "Goal Reader",
    description: "Correct prediction after a goal",
    tone: "gold"
  },
  {
    id: "red-card-prophet",
    name: "Red Card Prophet",
    description: "Correct prediction after a red card",
    tone: "platinum"
  },
  {
    id: "late-drama",
    name: "Late Drama",
    description: "Correct prediction after the 80th minute",
    tone: "gold"
  },
  {
    id: "kickoff-crew",
    name: "Kickoff Crew",
    description: "Joined before kickoff",
    tone: "bronze"
  },
  {
    id: "full-90",
    name: "Full 90",
    description: "Active for the full match",
    tone: "silver"
  },
  {
    id: "room-captain",
    name: "Room Captain",
    description: "Created a Creator Cup room",
    tone: "creator"
  },
  {
    id: "crowd-favorite",
    name: "Crowd Favorite",
    description: "Finished top 3 in a room",
    tone: "creator"
  },
  {
    id: "perfect-half",
    name: "Perfect Half",
    description: "Every prediction correct in a half, minimum four",
    tone: "platinum"
  }
];

export const badgeById = new Map(badges.map((badge) => [badge.id, badge]));
