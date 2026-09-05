// Mirrors the design intent documented in game/engine.js's newStats()
// comment: a composite "Impact Score" for the post-battle MVP, rather than
// pure KO count (which would only reward the finishing blow). Deliberately
// excludes healingReceived and damageTaken — those measure what was done TO
// the character, not their own contribution to the fight.
const KO_WEIGHT = 40;

export function impactScore(stats) {
  if (!stats) return 0;
  return (
    (stats.damageDealt || 0) +
    (stats.damageGuarded || 0) +
    (stats.healingDone || 0) +
    (stats.kos || 0) * KO_WEIGHT
  );
}

// Finds the highest-impact unit on the WINNING team only — MVP is a
// distinction for a team that actually won the fight, not just whoever
// racked up the biggest numbers while still losing. Returns null if the
// winning team has no units (shouldn't happen once a match starts).
export function findMVP(teams, winnerRole) {
  const winningTeam = teams?.[winnerRole] || [];
  if (!winningTeam.length) return null;
  return winningTeam.reduce((best, u) => {
    const score = impactScore(u.stats);
    return !best || score > best.score ? { unit: u, score, teamRole: winnerRole } : best;
  }, null);
}
