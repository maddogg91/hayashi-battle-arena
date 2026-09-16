import express from "express";
import { getMissionProgress, getRankProgress } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";

const router = express.Router();

router.get("/", async (req, res) => {
  if (!mongoEnabled() || !req.session) {
    return res.status(503).json({ error: "Accounts are not available on this server." });
  }
  if (!req.session.userId) {
    return res.status(401).json({ error: "Log in to view mission progress." });
  }
  const [missions, rank] = await Promise.all([
    getMissionProgress(req.session.userId),
    getRankProgress(req.session.userId),
  ]);
  res.json({ missions, rank });
});

export default router;
