import express from "express";
import { getChars, getMovesByChar } from "../../game/engine.js";
const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ chars: getChars(), movesByChar: getMovesByChar() });
});

export default router;
