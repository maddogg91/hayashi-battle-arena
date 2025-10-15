import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { initSocket } from "./socket.js";
import healthRouter from "./routes/health.js";
import replayRouter from "./routes/replay.js";
import adminRouter from "./routes/admin.js";





const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({ origin: "*" }));
app.use("/health", healthRouter);
app.use("/replay", replayRouter);
app.use("/admin", adminRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

// Fallback to index.html for SPA routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

initSocket(io);

const PORT = process.env.PORT || 8080;
server.listen(PORT, ("0.0.0.0") => console.log(`✅ Server running on port ${PORT}`));

