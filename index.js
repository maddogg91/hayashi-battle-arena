import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getApp } from "./config/app.js";
import { initSocket } from "./socket.js";
import healthApi from "./routes/api/health.js";
import replayApi from "./routes/api/replay.js";
import adminApi from "./routes/api/admin.js";
import rosterApi from "./routes/api/roster.js";
import feedbackApi from "./routes/api/feedback.js";
import authApi from "./routes/api/auth.js";
import profileApi from "./routes/api/profile.js";
import leaderboardApi from "./routes/api/leaderboard.js";
import { getDb, mongoEnabled } from "./db/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = getApp();

app.use("/api/health", healthApi);
app.use("/api/replay", replayApi);
app.use("/api/admin", adminApi);
app.use("/api/roster", rosterApi);
app.use("/api/feedback", feedbackApi);
app.use("/api/auth", authApi);
app.use("/api/profile", profileApi);
app.use("/api/leaderboard", leaderboardApi);

// SPA catch-all: any path not matched by an API route falls through to the
// React app's client-side router.
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "app", "index.html"));
});

const server = http.createServer(app);
initSocket(server);

// Best-effort: connect at startup so the first real request isn't the one
// that pays the connection cost, but never block server startup on it —
// accounts are optional (see db/mongo.js), and a slow/unreachable Mongo
// shouldn't take the whole game down with it.
if (mongoEnabled()) {
  getDb().catch(() => {}); // errors are already logged in db/mongo.js
} else {
  console.log("ℹ️  MONGODB_URI not set — accounts, profiles, and the leaderboard are disabled.");
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
