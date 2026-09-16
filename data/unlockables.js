// Characters that exist in the roster data but start locked for every
// account. A locked character shows as a "?" in character select until the
// logged-in user's stats/characterUsage satisfy every requirement below,
// at which point db/users.js's maybeUnlockCharacters() permanently adds
// their name to that user's unlockedCharacters list.
export const UNLOCKABLES = [
  {
    character: "Yuka",
    requirements: [
      { type: "characterWins", character: "Kara Higgins", count: 5 },
      { type: "characterWins", character: "Liara Mitsuke", count: 5 },
      { type: "winStreak", count: 5 },
    ],
  },
  {
    character: "Rock West",
    requirements: [
      { type: "rank", rank: "Junior Instructor" },
      { type: "characterWins", character: "Star Trethowan", count: 10 },
      { type: "winStreak", count: 10 },
    ],
  },
  {
    character: "Teru Fukuzawa",
    requirements: [
      { type: "rank", rank: "Junior Instructor" },
      { type: "characterWins", character: "Jett Kimura", count: 10 },
      { type: "winStreak", count: 10 },
    ],
  },
  {
    character: "Leia Claasen",
    requirements: [
      { type: "rank", rank: "Junior Instructor" },
      { type: "characterWins", character: "Sendara Al Vere", count: 10 },
      { type: "winStreak", count: 10 },
    ],
  },
];

export const LOCKED_CHARACTER_NAMES = new Set(UNLOCKABLES.map((u) => u.character));

export function requirementLabel(req) {
  if (req.type === "characterWins") return `Win ${req.count} matches with ${req.character}`;
  if (req.type === "winStreak") return `Win ${req.count} matches in a row`;
  if (req.type === "rank") return `Become ${req.rank} rank`;
  return "Unknown requirement";
}
