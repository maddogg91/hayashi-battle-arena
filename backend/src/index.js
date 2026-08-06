import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { initSocket } from "./socket.js";
import healthRouter from "./routes/health.js";
import replayRouter from "./routes/replay.js";
import adminRouter from "./routes/admin.js";
import rosterRouter from "./routes/roster.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/health", healthRouter);
app.use("/replay", replayRouter);
app.use("/admin", adminRouter);
app.use("/roster", rosterRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

// Fallback to index.html for SPA routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
