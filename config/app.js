import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { sessionMiddleware } from "./session.js";
import { isAllowedOrigin } from "./corsOrigins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In production the client is served from this same Express app (see the
// SPA catch-all in index.js), so CORS doesn't even come into play there —
// this allowlist (config/corsOrigins.js) only matters for local dev (the
// Vite dev server on its own port) and any deployment that hosts the
// frontend separately. Kept deliberately narrow rather than reflecting any
// Origin: cookies now carry a real login session, and a wildcard/reflect-
// all origin combined with credentials:true would let any third-party
// site ride a logged-in visitor's session cookie into this API.
export function getApp() {
  const app = express();
  app.set("trust proxy", 1); // Heroku/most PaaS terminate TLS upstream; needed for secure session cookies to work
  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
    })
  );
  app.use(express.json());
  if (sessionMiddleware) app.use(sessionMiddleware);
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(express.static(path.join(__dirname, "..", "public", "app"), { index: false }));
  return app;
}
