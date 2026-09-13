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
];

export const LOCKED_CHARACTER_NAMES = new Set(UNLOCKABLES.map((u) => u.character));

export function requirementLabel(req) {
  if (req.type === "characterWins") return `Win ${req.count} matches with ${req.character}`;
  if (req.type === "winStreak") return `Win ${req.count} matches in a row`;
  return "Unknown requirement";
}
