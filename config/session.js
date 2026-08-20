import session from "express-session";
import MongoStore from "connect-mongo";
import { mongoEnabled } from "../db/mongo.js";

// Accounts are optional (see db/mongo.js) — without MONGODB_URI there's
// nothing to back a session store with, so sessionMiddleware is simply
// null and both app.js and socket.js skip mounting it. Auth-dependent
// routes check req.session directly and 503 if it's missing.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (mongoEnabled() && !SESSION_SECRET) {
  console.warn("⚠️  MONGODB_URI is set but SESSION_SECRET is not — using an insecure generated default. Set SESSION_SECRET in production.");
}

export const sessionMiddleware = mongoEnabled()
  ? session({
      secret: SESSION_SECRET || "hayashi-dev-insecure-secret",
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: "sessions" }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  : null;
