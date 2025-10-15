import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";
const nanoid = customAlphabet("abcdef0123456789", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPLAY_DIR = path.join(__dirname, "..", "data");
const REPLAY_PATH = (id) => path.join(REPLAY_DIR, `${id}.json`);

export function saveReplayToDisk(payload) {
  if (!fs.existsSync(REPLAY_DIR)) fs.mkdirSync(REPLAY_DIR, { recursive: true });
  const id = `rep_${nanoid()}`;
  fs.writeFileSync(REPLAY_PATH(id), JSON.stringify(payload, null, 2), "utf-8");
  return id;
}

export function loadReplayFromDisk(id) {
  const p = REPLAY_PATH(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
