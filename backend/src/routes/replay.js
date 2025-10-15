import express from "express";
import { loadReplayFromDisk } from "../replays.js";
const router = express.Router();

router.get("/:id", (req, res) => {
  const rep = loadReplayFromDisk(req.params.id);
  if (!rep) return res.status(404).json({ error: "Not found" });
  res.json(rep);
});

export default router;
