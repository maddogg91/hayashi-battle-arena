// Hayashi Arena Editor: an offline, local-only tool for browsing the roster,
// tuning movesets and writing cutscene dialogue. It edits data/*.csv in
// place and is never deployed (tools/ is excluded from the Docker image).
//
//   npm run editor            -> http://127.0.0.1:5178
//   EDITOR_PORT=6000 npm run editor
import express from "express";
import path from "path";
import {
  FILES, loadFile, saveFile, listBackups, restoreBackup, ConflictError, ValidationError,
} from "./csvStore.js";
import { LOCKED_CHARACTER_NAMES } from "../../data/unlockables.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.EDITOR_PORT || 5178);
const GAME_PORT = Number(process.env.GAME_PORT || process.env.PORT || 8080);
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");

const app = express();

// Only answer requests addressed to this machine, so a web page you happen
// to have open elsewhere can't reach the editor through DNS rebinding.
app.use((req, res, next) => {
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return res.status(403).send("Local access only");
  next();
});
// Writes must be JSON, which a cross-site form post can't send without a
// CORS preflight this server never approves.
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && !req.is("application/json")) return res.status(415).json({ error: "JSON only" });
  next();
});
app.use(express.json({ limit: "5mb" }));

app.use("/", express.static(path.join(here, "public")));
// Character icons referenced by characters.csv's img column (e.g. /icons/x.png).
app.use("/game-assets", express.static(path.join(repoRoot, "client/public")));

function loadAll() {
  const out = {};
  for (const name of Object.keys(FILES)) out[name] = loadFile(name);
  return out;
}

app.get("/api/data", (_req, res) => {
  try {
    res.json({ ...loadAll(), locked: [...LOCKED_CHARACTER_NAMES], gamePort: GAME_PORT });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/data/:name", (req, res) => {
  const { name } = req.params;
  if (!FILES[name]) return res.status(404).json({ error: "Unknown file" });
  const { rows, version } = req.body || {};
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });
  try {
    res.json(saveFile(name, rows, version));
  } catch (e) {
    if (e instanceof ConflictError) return res.status(409).json({ error: e.message });
    if (e instanceof ValidationError) return res.status(422).json({ error: "Validation failed", errors: e.errors });
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/backups", (_req, res) => res.json({ backups: listBackups() }));

app.post("/api/backups/restore", (req, res) => {
  try {
    const name = restoreBackup(String(req.body?.file || ""));
    res.json({ ok: true, name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Asks a game server running on this same machine to re-read the CSVs, so
// edits show up without restarting it. Purely a convenience; it's fine if
// no game server is running.
app.post("/api/reload-game", async (_req, res) => {
  try {
    const r = await fetch(`http://127.0.0.1:${GAME_PORT}/api/admin/reload-data`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch {
    res.status(502).json({ error: `No game server answered on port ${GAME_PORT}. Start it with "npm start" or restart it to pick up changes.` });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Hayashi Arena Editor running at http://${HOST}:${PORT}`);
  console.log("Local only. Edits are written to data/*.csv (backups in data/.editor-backups/).");
});
