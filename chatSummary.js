// Discord's plain message content is capped at 2000 characters. Kept as a
// named constant (rather than inlined) so the truncation math below is
// easy to follow, and so a test can assert against the same value.
export const DISCORD_CONTENT_LIMIT = 2000;

function formatChatLine(msg) {
  return `**${msg.name}:** ${msg.text}`;
}

// Builds a Discord-postable recap of a match's personal chat, capped at
// Discord's 2000-character message limit. When the full chat log doesn't
// fit, keeps as many of the *most recent* messages as possible (most
// relevant to how the match concluded) and notes how many earlier
// messages were left out, rather than silently cutting mid-message.
export function buildChatSummary({ namesA = "Player A", namesB = "Player B", chat = [], winnerLine = null }) {
  const header = `📋 **Match Recap — ${namesA} vs ${namesB}**${winnerLine ? `\n${winnerLine}` : ""}`;

  if (!chat.length) {
    return `${header}\n\n_No chat messages were sent during this match._`.slice(0, DISCORD_CONTENT_LIMIT);
  }

  // Reserve room for "\n\n" + the largest plausible omitted-messages note.
  const budget = DISCORD_CONTENT_LIMIT - header.length - 60;
  const lines = [];
  let used = 0;
  let omitted = 0;

  for (let i = chat.length - 1; i >= 0; i--) {
    const line = formatChatLine(chat[i]);
    const cost = line.length + 1; // + newline joining it to the next line
    if (used + cost > budget) {
      omitted = i + 1;
      break;
    }
    lines.unshift(line);
    used += cost;
  }

  // Defensive fallback: with the 500-char-per-message cap enforced at send
  // time this shouldn't happen in practice, but if even the single most
  // recent message doesn't fit the budget, hard-truncate it rather than
  // showing an empty recap.
  if (lines.length === 0) {
    const lastLine = formatChatLine(chat[chat.length - 1]);
    lines.push(`${lastLine.slice(0, Math.max(0, budget - 1))}…`);
    omitted = chat.length - 1;
  }

  const note = omitted > 0
    ? `_…${omitted} earlier message${omitted === 1 ? "" : "s"} omitted…_\n\n`
    : "";

  return `${header}\n\n${note}${lines.join("\n")}`.slice(0, DISCORD_CONTENT_LIMIT);
}
