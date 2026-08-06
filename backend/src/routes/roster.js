import express from "express";
import { getChars } from "../game/engine.js";
const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ chars: getChars() });
});

export default router;
