import { backendUrl } from "./socket";

async function call(path, options = {}) {
  const res = await fetch(backendUrl + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json;
}

export const getMe = () => call("/api/auth/me").then((r) => r.user);
export const register = (username, password) =>
  call("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }).then((r) => r.user);
export const login = (username, password) =>
  call("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }).then((r) => r.user);
export const logout = () => call("/api/auth/logout", { method: "POST" });
export const getProfile = (username) => call(`/api/profile/${encodeURIComponent(username)}`).then((r) => r.profile);
export const getLeaderboard = (limit = 20) => call(`/api/leaderboard?limit=${limit}`).then((r) => r.entries);
