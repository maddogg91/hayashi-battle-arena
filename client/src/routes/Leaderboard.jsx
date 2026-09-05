import { useEffect, useState } from "react";
import { getLeaderboard } from "../api/auth";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ onBack }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLeaderboard(50)
      .then(setEntries)
      .catch((err) => setError(err.message || "Could not load the leaderboard."));
  }, []);

  return (
    <div className="screen-fade flex flex-col items-center py-6 sm:py-10 px-4 sm:px-6">
      <div className="w-full max-w-2xl flex justify-end mb-2">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs px-3 py-1.5 rounded-lg bg-panel-raised hover:bg-panel-line text-slate-300 border border-panel-line transition"
          >
            Return to Lobby
          </button>
        )}
      </div>

      <div className="panel w-full max-w-2xl p-6 sm:p-7">
        <h2 className="font-display text-2xl font-bold text-gold-300 mb-1">🏆 Leaderboard</h2>
        <p className="text-sm text-slate-400 mb-5">Ranked by total wins across all registered players.</p>

        {error && <p className="text-sm text-hp-400">{error}</p>}

        {!error && !entries && <p className="text-sm text-slate-400">Loading…</p>}

        {entries && entries.length === 0 && (
          <p className="text-sm text-slate-400">Nobody's finished a match yet — be the first!</p>
        )}

        {entries && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-panel-line">
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Player</th>
                  <th className="py-2 pr-3 font-semibold text-right">Wins</th>
                  <th className="py-2 pr-3 font-semibold text-right">Losses</th>
                  <th className="py-2 font-semibold text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.username} className="border-b border-panel-line/60 last:border-0">
                    <td className="py-2.5 pr-3 text-slate-400">{MEDAL[i] || i + 1}</td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-100">{e.username}</td>
                    <td className="py-2.5 pr-3 text-right text-teamA-400 font-semibold">{e.wins}</td>
                    <td className="py-2.5 pr-3 text-right text-hp-400 font-semibold">{e.losses}</td>
                    <td className="py-2.5 text-right text-slate-300">
                      {e.gamesPlayed ? Math.round((e.wins / e.gamesPlayed) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
