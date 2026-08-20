import { useState } from "react";
import { login, register } from "../api/auth";

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | error
  const [error, setError] = useState("");

  const submit = async () => {
    if (status === "sending") return;
    const u = username.trim();
    if (!u || !password) return;
    setStatus("sending");
    setError("");
    try {
      const user = mode === "login" ? await login(u, password) : await register(u, password);
      onAuth(user);
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="panel bg-panel-raised text-slate-100 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-gold-300">
            {mode === "login" ? "Log In" : "Create Account"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm w-7 h-7 flex items-center justify-center rounded-full hover:bg-panel-line transition"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          {mode === "login"
            ? "Log in to track your wins, losses, and character usage."
            : "3-20 characters (letters, numbers, underscore) and a password of at least 6 characters."}
        </p>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
          autoFocus
          className="w-full mb-3 px-3.5 py-2.5 rounded-xl bg-ink-950 border border-panel-line focus:outline-none focus:border-gold-500 text-slate-100 placeholder:text-slate-500"
          placeholder="e.g. Kobayashi"
        />

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={200}
          className="w-full mb-3 px-3.5 py-2.5 rounded-xl bg-ink-950 border border-panel-line focus:outline-none focus:border-gold-500 text-slate-100 placeholder:text-slate-500"
          placeholder="••••••••"
        />

        {status === "error" && <p className="text-xs text-hp-400 mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={!username.trim() || !password || status === "sending"}
          className={`w-full mb-3 px-4 py-2.5 rounded-xl font-display font-bold transition
            ${!username.trim() || !password || status === "sending"
              ? "bg-panel-line text-slate-500 cursor-not-allowed"
              : "bg-gold-400 hover:bg-gold-300 text-ink-950"}
          `}
        >
          {status === "sending" ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </button>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setStatus("idle"); setError(""); }}
          className="w-full text-xs text-slate-400 hover:text-slate-200 transition"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
