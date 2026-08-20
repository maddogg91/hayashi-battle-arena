import { MongoClient } from "mongodb";

// Accounts/leaderboard are an optional feature layered on top of the core
// game, same pattern as ANTHROPIC_API_KEY or the Discord webhooks: absent
// MONGODB_URI, the app still runs — auth/profile/leaderboard routes just
// respond with 503 instead of the server refusing to start.
const uri = process.env.MONGODB_URI || "";

let client = null;
let db = null;
let connecting = null;

export function mongoEnabled() {
  return !!uri;
}

// Lazily connects once and reuses the same client/db for every caller.
// Concurrent first-callers await the same in-flight connection attempt
// instead of racing separate MongoClient.connect() calls.
export async function getDb() {
  if (db) return db; // sourced from a real connection, or __setDbForTests() in tests
  if (!mongoEnabled()) return null;
  if (!connecting) {
    client = new MongoClient(uri);
    connecting = client.connect().then(async (c) => {
      db = c.db();
      await ensureIndexes(db);
      console.log("✅ MongoDB connected");
      return db;
    }).catch((err) => {
      connecting = null; // allow a retry on the next getDb() call
      console.error("❌ MongoDB connection failed:", err.message);
      throw err;
    });
  }
  return connecting;
}

async function ensureIndexes(database) {
  await database.collection("users").createIndex({ usernameLower: 1 }, { unique: true });
  await database.collection("users").createIndex({ "stats.wins": -1 });
  await database.collection("characterUsage").createIndex({ userId: 1, character: 1 }, { unique: true });
}

export async function closeMongo() {
  if (client) await client.close();
  client = null;
  db = null;
  connecting = null;
}

// Test-only hook: lets a test script inject an in-memory fake implementing
// the same collection API (findOne/insertOne/updateOne/find/createIndex)
// instead of a real MongoClient, since a real Mongo server isn't available
// in every environment this runs in. Never called from production code.
export function __setDbForTests(fakeDb) {
  db = fakeDb;
  connecting = Promise.resolve(fakeDb);
}
