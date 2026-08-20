// Shared between the Express CORS middleware (config/app.js) and Socket.IO's
// own CORS handling (socket.js) so both agree on who's allowed to make
// credentialed (cookie-carrying) cross-origin requests. See config/app.js
// for why this is a narrow allowlist rather than a wildcard/reflect-all.
export const allowedOrigins = new Set(
  ["http://localhost:5173", "http://127.0.0.1:5173", process.env.CLIENT_ORIGIN].filter(Boolean)
);

export function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.has(origin);
}
