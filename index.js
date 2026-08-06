import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getApp } from "./config/app.js";
import { initSocket } from "./socket.js";
import healthApi from "./routes/api/health.js";
import replayApi from "./routes/api/replay.js";
import adminApi from "./routes/api/admin.js";
import rosterApi from "./routes/api/roster.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = getApp();

app.use("/api/health", healthApi);
app.use("/api/replay", replayApi);
app.use("/api/admin", adminApi);
app.use("/api/roster", rosterApi);

// SPA catch-all: any path not matched by an API route falls through to the
// React app's client-side router.
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "app", "index.html"));
});

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
