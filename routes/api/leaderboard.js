import express from "express";
import { getLeaderboard } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";
import { RANKS } from "../../data/ranks.js";

const router = express.Router();

router.get("/", async (req, res) => {
  if (!mongoEnabled()) return res.status(503).json({ error: "Accounts are not available on this server." });
  const entries = await getLeaderboard(req.query.limit);
  // Static reference ladder for the "how to achieve each rank" section —
  // cheap to include on every request since it never changes.
  res.json({ entries, ranks: RANKS });
});

export default router;
