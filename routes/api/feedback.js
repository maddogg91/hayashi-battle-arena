import express from "express";
import { saveFeedbackToDisk, listFeedback } from "../../feedback.js";
const router = express.Router();

const CATEGORIES = new Set(["bug", "feedback", "suggestion"]);

router.post("/", (req, res) => {
  const { name, message, category, context } = req.body || {};
  const clean = typeof message === "string" ? message.trim().slice(0, 2000) : "";
  if (!clean) return res.status(400).json({ error: "Please describe the issue before submitting." });

  const record = saveFeedbackToDisk({
    name: (typeof name === "string" ? name : "").trim().slice(0, 40) || "Anonymous",
    message: clean,
    category: CATEGORIES.has(category) ? category : "bug",
    context: (typeof context === "string" ? context : "").trim().slice(0, 200),
  });
  res.json({ ok: true, id: record.id });
});

// Lightweight visibility for whoever's operating the app — no dedicated
// admin UI exists yet, so this just returns the raw list.
router.get("/", (_req, res) => {
  res.json({ reports: listFeedback() });
});

export default router;
