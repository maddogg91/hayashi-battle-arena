import express from "express";
import { createUser, verifyLogin, getUserById } from "../../db/users.js";
import { mongoEnabled } from "../../db/mongo.js";

const router = express.Router();

// Accounts require both Mongo (to store users) and a session (to remember
// who's logged in) — same optional-feature guard as everywhere else in
// this file, so a deployment without MONGODB_URI just gets a clean 503
// instead of a crash.
function requireAccounts(req, res, next) {
  if (!mongoEnabled() || !req.session) {
    return res.status(503).json({ error: "Accounts are not available on this server." });
  }
  next();
}

router.post("/register", requireAccounts, async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const user = await createUser(username, password);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : "Registration failed." });
  }
});

router.post("/login", requireAccounts, async (req, res) => {
  const { username, password } = req.body || {};
  const user = await verifyLogin(username, password);
  if (!user) return res.status(401).json({ error: "Incorrect username or password." });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ user });
});

router.post("/logout", (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => res.json({ ok: true }));
});

// Bootstraps the client with whoever's already logged in (if anyone) —
// called once on page load. Not gated by requireAccounts: when accounts
// are unavailable this should just report "nobody's logged in" rather
// than 503, since the client calls this unconditionally on startup.
router.get("/me", async (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });
  const user = await getUserById(req.session.userId);
  if (!user) {
    // Session outlived the account it pointed at (e.g. manual DB cleanup).
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  res.json({ user });
});

export default router;
