import { useState } from "react";
import { backendUrl } from "../api/socket";

export default function ReportBugModal({ name, onClose }) {
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  const submit = async () => {
    const clean = message.trim();
    if (!clean || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch(`${backendUrl}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          message: clean,
          context: `${window.location.pathname} • ${navigator.userAgent}`,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="panel bg-panel-raised text-slate-100 p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-gold-300">🐛 Report an Issue</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm w-7 h-7 flex items-center justify-center rounded-full hover:bg-panel-line transition">
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <>
            <p className="text-sm text-teamA-400 mb-4">
              Thanks! Your report was sent — we'll take a look.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl bg-panel-line hover:bg-panel-line/70 font-semibold transition"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mb-3 px-3 py-2.5 rounded-xl bg-ink-950 border border-panel-line text-slate-100 focus:outline-none focus:border-gold-500"
            >
              <option value="bug">Bug</option>
              <option value="feedback">Feedback</option>
              <option value="suggestion">Suggestion</option>
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
              What happened? Include what you were doing when it went wrong.
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Describe the bug or share your feedback..."
              className="w-full mb-3 px-3 py-2.5 rounded-xl bg-ink-950 border border-panel-line text-slate-100 resize-none focus:outline-none focus:border-gold-500 placeholder:text-slate-500"
            />

            {status === "error" && (
              <p className="text-xs text-hp-400 mb-3">
                Couldn't send your report. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-panel-line hover:bg-panel-line/70 font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!message.trim() || status === "sending"}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition
                  ${!message.trim() || status === "sending"
                    ? "bg-panel-line text-slate-500 cursor-not-allowed"
                    : "bg-teamA-500 hover:bg-teamA-400 text-ink-950"}
                `}
              >
                {status === "sending" ? "Sending…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
