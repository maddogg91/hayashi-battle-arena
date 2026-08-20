import express from "express";
import { getLeaderboard } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";

const router = express.Router();

router.get("/", async (req, res) => {
  if (!mongoEnabled()) return res.status(503).json({ error: "Accounts are not available on this server." });
  const entries = await getLeaderboard(req.query.limit);
  res.json({ entries });
});

export default router;
