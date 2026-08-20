import express from "express";
import { getProfile } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";

const router = express.Router();

router.get("/:username", async (req, res) => {
  if (!mongoEnabled()) return res.status(503).json({ error: "Accounts are not available on this server." });
  const profile = await getProfile(req.params.username);
  if (!profile) return res.status(404).json({ error: "No such player." });
  res.json({ profile });
});

export default router;
