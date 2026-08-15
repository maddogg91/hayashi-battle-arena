import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";
import { postToDiscord } from "./discord.js";
const nanoid = customAlphabet("abcdef0123456789", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FEEDBACK_DIR = path.join(__dirname, "data", "feedback");
const FEEDBACK_PATH = (id) => path.join(FEEDBACK_DIR, `${id}.json`);

export function saveFeedbackToDisk(payload) {
  if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const id = `fb_${nanoid()}`;
  const record = { id, ts: Date.now(), ...payload };
  fs.writeFileSync(FEEDBACK_PATH(id), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

export function listFeedback() {
  if (!fs.existsSync(FEEDBACK_DIR)) return [];
  return fs
    .readdirSync(FEEDBACK_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(FEEDBACK_DIR, f), "utf-8")))
    .sort((a, b) => b.ts - a.ts);
}

const CATEGORY_META = {
  bug: { title: "🐛 New Bug Report", color: 0xdc2626 },
  feedback: { title: "💬 New Feedback", color: 0x2563eb },
  suggestion: { title: "💡 New Suggestion", color: 0xca8a04 },
};

// Posts a submitted report to a Discord channel. See discord.js — this is
// a no-op if DISCORD_WEBHOOK_URL isn't configured, so it never blocks or
// breaks feedback submission if it's unset or Discord is unreachable.
export async function notifyDiscord(record) {
  const meta = CATEGORY_META[record.category] || CATEGORY_META.bug;
  await postToDiscord({
    embeds: [
      {
        title: meta.title,
        description: record.message,
        color: meta.color,
        fields: [
          { name: "From", value: record.name || "Anonymous", inline: true },
          { name: "Category", value: record.category, inline: true },
          ...(record.context ? [{ name: "Context", value: record.context }] : []),
        ],
        timestamp: new Date(record.ts).toISOString(),
      },
    ],
  });
}
