// Optional, real LLM-generated recap of a match's battle log — used by
// saveReplay before falling back to the plain-truncation summary in
// battleLogSummary.js. Needs credentials the SDK can resolve on its own
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, etc. — see the Anthropic SDK
// docs for the full resolution order); we don't pre-check for a specific
// env var so any of those work. Returns null only when the log is empty;
// everything else (missing credentials, network errors, rate limits) is
// a thrown error — callers must wrap this in try/catch and fall back to
// the plain summary on any failure.
import Anthropic from "@anthropic-ai/sdk";
import { DISCORD_CONTENT_LIMIT } from "./battleLogSummary.js";

let client = null;
function getClient() {
  client ||= new Anthropic();
  return client;
}

const SYSTEM_PROMPT =
  "You recap turn-based battle logs from a 5v5 anime-style arena game (Hayashi " +
  "Academy Battle Arena) for a Discord channel. Write a punchy 2-4 sentence TLDR " +
  "of what happened — key turning points, standout moves or comebacks, and who " +
  "won and how. Casual, exciting tone, plain prose (no headers, no bullet " +
  "points, no markdown besides the occasional **bold** for a fighter's name). " +
  "Keep the whole thing well under 1500 characters.";

export async function summarizeBattleLogWithClaude({ namesA, namesB, log = [], winnerLine = null }) {
  if (!log.length) return null;
  const anthropic = getClient();

  const header = `📋 **Battle Recap — ${namesA} vs ${namesB}**${winnerLine ? `\n${winnerLine}` : ""}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 400,
    output_config: { effort: "low" }, // short, low-stakes summarization — keep it fast and cheap
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Battle log (${namesA} vs ${namesB}):\n\n${log.join("\n")}` },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text?.trim();
  if (!text) return null;

  return `${header}\n\n${text}`.slice(0, DISCORD_CONTENT_LIMIT);
}
