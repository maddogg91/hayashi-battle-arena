import express from "express";
import { reloadData } from "../game/engine.js";
const router = express.Router();

router.post("/reload-data", (req, res) => {
  try {
    const info = reloadData();
    res.json({ status: "ok", ...info });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

export default router;
