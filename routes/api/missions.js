import express from "express";
import { getMissionProgress } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";

const router = express.Router();

router.get("/", async (req, res) => {
  if (!mongoEnabled() || !req.session) {
    return res.status(503).json({ error: "Accounts are not available on this server." });
  }
  if (!req.session.userId) {
    return res.status(401).json({ error: "Log in to view mission progress." });
  }
  const missions = await getMissionProgress(req.session.userId);
  res.json({ missions });
});

export default router;
