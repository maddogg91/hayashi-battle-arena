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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-yellow-400">🐛 Report an Issue</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-sm">
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <>
            <p className="text-sm text-green-400 mb-4">
              Thanks! Your report was sent — we'll take a look.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 font-semibold"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mb-3 p-2 rounded bg-gray-800 border border-gray-700 text-gray-100"
            >
              <option value="bug">Bug</option>
              <option value="feedback">Feedback</option>
              <option value="suggestion">Suggestion</option>
            </select>

            <label className="block text-xs font-semibold text-gray-300 mb-1">
              What happened? Include what you were doing when it went wrong.
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Describe the bug or share your feedback..."
              className="w-full mb-3 p-2 rounded bg-gray-800 border border-gray-700 text-gray-100 resize-none focus:outline-none focus:border-yellow-500"
            />

            {status === "error" && (
              <p className="text-xs text-red-400 mb-3">
                Couldn't send your report. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!message.trim() || status === "sending"}
                className={`flex-1 px-4 py-2 rounded font-semibold
                  ${!message.trim() || status === "sending"
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"}
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
