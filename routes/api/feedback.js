import express from "express";
import { saveFeedbackToDisk, listFeedback, notifyDiscord } from "../../feedback.js";
const router = express.Router();

const CATEGORIES = new Set(["bug", "feedback", "suggestion"]);

router.post("/", (req, res) => {
  const { name, message, category, context } = req.body || {};
  const clean = typeof message === "string" ? message.trim().slice(0, 2000) : "";
  if (!clean) return res.status(400).json({ error: "Please describe the issue before submitting." });

  // saveFeedbackToDisk writes to the filesystem, which can fail for
  // reasons unrelated to the report itself (permissions, disk full, a
  // read-only mount). Express 4 would already turn an uncaught throw here
  // into a generic 500, which the client already treats as a failure — this
  // just gives a clearer error message and a server-side log line to debug
  // from, instead of a bare stack trace.
  let record;
  try {
    record = saveFeedbackToDisk({
      name: (typeof name === "string" ? name : "").trim().slice(0, 40) || "Anonymous",
      message: clean,
      category: CATEGORIES.has(category) ? category : "bug",
      context: (typeof context === "string" ? context : "").trim().slice(0, 200),
    });
  } catch (err) {
    console.error("Failed to save feedback:", err.message);
    return res.status(500).json({ error: "Couldn't save your report. Please try again." });
  }
  // Fire-and-forget: the report is already saved, so a slow/unreachable
  // Discord webhook should never delay the player's confirmation.
  notifyDiscord(record);
  res.json({ ok: true, id: record.id });
});

// Lightweight visibility for whoever's operating the app — no dedicated
// admin UI exists yet, so this just returns the raw list.
router.get("/", (_req, res) => {
  res.json({ reports: listFeedback() });
});

export default router;
