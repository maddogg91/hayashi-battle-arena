import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";
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
