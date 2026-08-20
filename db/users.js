import bcrypt from "bcryptjs";
import { getDb } from "./mongo.js";

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
  return {
    id: String(doc._id),
    username: doc.username,
    createdAt: doc.createdAt,
    stats: doc.stats || { wins: 0, losses: 0, gamesPlayed: 0 },
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

  await db.collection("users").updateOne(
    { _id },
    {
      $inc: {
        "stats.gamesPlayed": 1,
        "stats.wins": won ? 1 : 0,
        "stats.losses": won ? 0 : 1,
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
}
