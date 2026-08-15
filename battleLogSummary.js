// Discord's plain message content is capped at 2000 characters. Kept as a
// named constant (rather than inlined) so the truncation math below is
// easy to follow, and so a test can assert against the same value.
export const DISCORD_CONTENT_LIMIT = 2000;

// Builds a Discord-postable recap of a match's battle log, capped at
// Discord's 2000-character message limit. When the full log doesn't fit,
// keeps as many of the *most recent* lines as possible (the turns
// leading up to the match's conclusion) and notes how many earlier lines
// were left out, rather than silently cutting off mid-line.
export function buildBattleLogSummary({ namesA = "Player A", namesB = "Player B", log = [], winnerLine = null }) {
  const header = `📋 **Battle Recap — ${namesA} vs ${namesB}**${winnerLine ? `\n${winnerLine}` : ""}`;

  if (!log.length) {
    return `${header}\n\n_No battle log was recorded for this match._`.slice(0, DISCORD_CONTENT_LIMIT);
  }

  // Reserve room for "\n\n" + the largest plausible omitted-lines note.
  const budget = DISCORD_CONTENT_LIMIT - header.length - 60;
  const lines = [];
  let used = 0;
  let omitted = 0;

  for (let i = log.length - 1; i >= 0; i--) {
    const line = log[i];
    const cost = line.length + 1; // + newline joining it to the next line
    if (used + cost > budget) {
      omitted = i + 1;
      break;
    }
    lines.unshift(line);
    used += cost;
  }

  // Defensive fallback: if even the single most recent line doesn't fit
  // the budget (an unusually long line), hard-truncate it rather than
  // showing an empty recap.
  if (lines.length === 0) {
    const lastLine = log[log.length - 1];
    lines.push(`${lastLine.slice(0, Math.max(0, budget - 1))}…`);
    omitted = log.length - 1;
  }

  const note = omitted > 0
    ? `_…${omitted} earlier line${omitted === 1 ? "" : "s"} omitted…_\n\n`
    : "";

  return `${header}\n\n${note}${lines.join("\n")}`.slice(0, DISCORD_CONTENT_LIMIT);
}
