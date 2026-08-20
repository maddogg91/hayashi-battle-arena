import { io } from "socket.io-client";

// An explicit VITE_BACKEND_URL always wins. Otherwise: in dev, the Vite dev
// server (:5173) has no Socket.IO endpoint of its own, so default to the
// actual backend port; in a production build (e.g. the Heroku/Docker image,
// which serves client + API from one origin) fall back to same-origin.
const envUrl = import.meta.env.VITE_BACKEND_URL;
export const backendUrl = envUrl
  ? envUrl
  : import.meta.env.DEV
  ? "http://localhost:8080"
  : window.location.origin;
// withCredentials so the session cookie set by /api/auth/login rides along
// on the socket.io handshake — that's how socket.js knows which connected
// socket belongs to a logged-in account (see io.engine.use(sessionMiddleware)
// server-side).
export const socket = io(backendUrl, { withCredentials: true });
