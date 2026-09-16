// Player rank, purely a function of career wins. Ordered lowest to highest;
// getRank() returns the highest rank whose threshold the player has met.
export const RANKS = [
  { name: "Academy Prospect", wins: 0 },
  { name: "Student", wins: 10 },
  { name: "Guild Leader", wins: 50 },
  { name: "Graduate", wins: 200 },
  { name: "Junior Instructor", wins: 1000 },
  { name: "Senior Instructor", wins: 5000 },
  { name: "Headmaster", wins: 10000 },
];

export function getRank(wins) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (wins >= r.wins) rank = r.name;
  }
  return rank;
}

// True once `wins` is enough to have reached (or passed) the named rank —
// used by unlock requirements like "Become Junior Instructor rank".
export function meetsRank(wins, rankName) {
  const target = RANKS.find((r) => r.name === rankName);
  if (!target) return false;
  return wins >= target.wins;
}
