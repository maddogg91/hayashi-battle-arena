import bcrypt from "bcryptjs";
import { getDb } from "./mongo.js";
import { getRank, meetsRank, RANKS } from "../data/ranks.js";
import { UNLOCKABLES, requirementLabel } from "../data/unlockables.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const SALT_ROUNDS = 10;

export function validUsername(u) {
  return typeof u === "string" && USERNAME_RE.test(u);
}
export function validPassword(p) {
  return typeof p === "string" && p.length >= 6 && p.length <= 200;
}

// Strips the password hash (and Mongo's internal _id) before anything ever
// reaches a response body or gets stashed on a session.
function toPublicUser(doc) {
  if (!doc) return null;
  const stats = doc.stats || { wins: 0, losses: 0, gamesPlayed: 0 };
  return {
    id: String(doc._id),
    username: doc.username,
    createdAt: doc.createdAt,
    stats,
    rank: getRank(stats.wins || 0),
    unlockedCharacters: doc.unlockedCharacters || [],
  };
}

export async function createUser(username, password) {
  if (!validUsername(username)) {
    throw Object.assign(new Error("Username must be 3-20 characters: letters, numbers, underscore only."), { status: 400 });
  }
  if (!validPassword(password)) {
    throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
  }
  const db = await getDb();
  const users = db.collection("users");
  const usernameLower = username.toLowerCase();
  const existing = await users.findOne({ usernameLower });
  if (existing) {
    throw Object.assign(new Error("That username is already taken."), { status: 409 });
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const doc = {
    username,
    usernameLower,
    passwordHash,
    createdAt: new Date(),
    stats: { wins: 0, losses: 0, gamesPlayed: 0 },
  };
  const { insertedId } = await users.insertOne(doc);
  doc._id = insertedId;
  return toPublicUser(doc);
}

// Returns the public user on success, null on bad username/password —
// callers shouldn't distinguish "no such user" from "wrong password" in
// what they tell the client.
export async function verifyLogin(username, password) {
  if (!validUsername(username) || typeof password !== "string" || !password) return null;
  const db = await getDb();
  const users = db.collection("users");
  const doc = await users.findOne({ usernameLower: username.toLowerCase() });
  if (!doc) return null;
  const ok = await bcrypt.compare(password, doc.passwordHash);
  if (!ok) return null;
  return toPublicUser(doc);
}

export async function getUserById(id) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  let _id;
  try { _id = new ObjectId(id); } catch { return null; }
  const doc = await db.collection("users").findOne({ _id });
  return toPublicUser(doc);
}

export async function getProfile(username) {
  const db = await getDb();
  const doc = await db.collection("users").findOne({ usernameLower: String(username || "").toLowerCase() });
  if (!doc) return null;
  const characterUsage = await db
    .collection("characterUsage")
    .find({ userId: doc._id })
    .sort({ picks: -1 })
    .toArray();
  return {
    ...toPublicUser(doc),
    characterUsage: characterUsage.map((c) => ({
      character: c.character,
      picks: c.picks,
      wins: c.wins,
      losses: c.losses,
    })),
  };
}

export async function getLeaderboard(limit = 20) {
  const db = await getDb();
  const docs = await db
    .collection("users")
    .find({ "stats.gamesPlayed": { $gt: 0 } })
    .sort({ "stats.wins": -1, "stats.gamesPlayed": 1 })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100))
    .toArray();
  return docs.map((d) => ({
    username: d.username,
    wins: d.stats?.wins || 0,
    losses: d.stats?.losses || 0,
    gamesPlayed: d.stats?.gamesPlayed || 0,
  }));
}

// Records the outcome of one finished match for one logged-in seat: bumps
// their overall win/loss/gamesPlayed counters and, for every character they
// drafted that match, a per-character pick/win/loss counter (kept in a
// separate collection rather than as dynamic nested fields on the user doc,
// since character names can contain spaces and would otherwise need
// bracket-style dynamic Mongo field paths).
export async function recordMatchResult(userId, { won, characters }) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  let _id;
  try { _id = new ObjectId(userId); } catch { return; }

  // Win streaks (for rank/unlock purposes) aren't expressible as a single
  // atomic $inc, since a loss resets the running streak to zero while the
  // best-ever streak must never go down — so read the current values first,
  // compute the new ones in JS, then write them alongside the plain counters.
  const before = await db.collection("users").findOne({ _id }, { projection: { stats: 1 } });
  const prevStreak = before?.stats?.currentStreak || 0;
  const prevBest = before?.stats?.bestStreak || 0;
  const currentStreak = won ? prevStreak + 1 : 0;
  const bestStreak = Math.max(prevBest, currentStreak);

  await db.collection("users").updateOne(
    { _id },
    {
      $inc: {
        "stats.gamesPlayed": 1,
        "stats.wins": won ? 1 : 0,
        "stats.losses": won ? 0 : 1,
      },
      $set: {
        "stats.currentStreak": currentStreak,
        "stats.bestStreak": bestStreak,
      },
    }
  );

  const names = Array.isArray(characters) ? [...new Set(characters.filter(Boolean))] : [];
  for (const character of names) {
    await db.collection("characterUsage").updateOne(
      { userId: _id, character },
      {
        $inc: { picks: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 },
        $setOnInsert: { userId: _id, character },
      },
      { upsert: true }
    );
  }

  const totalWins = (before?.stats?.wins || 0) + (won ? 1 : 0);
  await maybeUnlockCharacters(db, _id, bestStreak, totalWins);
}

function evalRequirement(req, { bestStreak, usageByChar, wins }) {
  if (req.type === "characterWins") {
    const have = usageByChar[req.character]?.wins || 0;
    return { met: have >= req.count, have, need: req.count };
  }
  if (req.type === "winStreak") {
    return { met: bestStreak >= req.count, have: bestStreak, need: req.count };
  }
  if (req.type === "rank") {
    const threshold = RANKS.find((r) => r.name === req.rank)?.wins ?? 0;
    return { met: meetsRank(wins, req.rank), have: wins, need: threshold };
  }
  return { met: false, have: 0, need: req.count };
}

// Checks every locked character this user hasn't already unlocked against
// their current characterUsage/bestStreak, and permanently records any that
// now qualify. Called after every recorded match result.
async function maybeUnlockCharacters(db, _id, bestStreak, wins) {
  const locked = UNLOCKABLES.map((u) => u.character);
  if (!locked.length) return;
  const userDoc = await db.collection("users").findOne({ _id }, { projection: { unlockedCharacters: 1 } });
  const alreadyUnlocked = new Set(userDoc?.unlockedCharacters || []);
  const candidates = UNLOCKABLES.filter((u) => !alreadyUnlocked.has(u.character));
  if (!candidates.length) return;

  const usage = await db.collection("characterUsage").find({ userId: _id }).toArray();
  const usageByChar = Object.fromEntries(usage.map((u) => [u.character, u]));

  const newlyUnlocked = candidates
    .filter(({ requirements }) => requirements.every((req) => evalRequirement(req, { bestStreak, usageByChar, wins }).met))
    .map((u) => u.character);

  if (newlyUnlocked.length) {
    await db.collection("users").updateOne(
      { _id },
      { $addToSet: { unlockedCharacters: { $each: newlyUnlocked } } }
    );
  }
}

// Per-locked-character progress toward unlocking, for the Missions page.
export async function getMissionProgress(userId) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  let _id;
  try { _id = new ObjectId(userId); } catch { return []; }

  const userDoc = await db.collection("users").findOne({ _id });
  if (!userDoc) return [];
  const bestStreak = userDoc.stats?.bestStreak || 0;
  const wins = userDoc.stats?.wins || 0;
  const unlocked = new Set(userDoc.unlockedCharacters || []);
  const usage = await db.collection("characterUsage").find({ userId: _id }).toArray();
  const usageByChar = Object.fromEntries(usage.map((u) => [u.character, u]));

  return UNLOCKABLES.map(({ character, requirements }) => ({
    character,
    unlocked: unlocked.has(character),
    requirements: requirements.map((req) => ({
      label: requirementLabel(req),
      ...evalRequirement(req, { bestStreak, usageByChar, wins }),
    })),
  }));
}
