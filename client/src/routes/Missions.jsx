import { useEffect, useState } from "react";
import { getMe, getMissions } from "../api/auth";

function ProgressRow({ label, have, need, met }) {
  const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className={met ? "text-teamA-400" : "text-slate-300"}>
          {met ? "✅" : "⬜"} {label}
        </span>
        <span className="text-slate-400">
          {Math.min(have, need)}/{need}
        </span>
      </div>
      <div className="h-1.5 bg-panel-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${met ? "bg-teamA-400" : "bg-gold-400"}`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function Missions({ onBack }) {
  const [missions, setMissions] = useState(null);
  const [rank, setRank] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me) {
          setError("Log in to track your mission progress.");
          return;
        }
        const data = await getMissions();
        setMissions(data.missions || []);
        setRank(data.rank || null);
      } catch (err) {
        setError(err.message || "Could not load missions.");
      }
    })();
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
        <h2 className="font-display text-2xl font-bold text-gold-300 mb-1">🎯 Missions</h2>
        <p className="text-sm text-slate-400 mb-5">
          Complete a locked character's missions to permanently unlock them for your account.
        </p>

        {error && <p className="text-sm text-hp-400">{error}</p>}
        {!error && !missions && <p className="text-sm text-slate-400">Loading…</p>}

        {rank && (
          <div className="mb-7">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-slate-100">🎖️ Rank Progression</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gold-500/15 text-gold-300">
                Current: {rank.currentRank}
              </span>
            </div>
            <div className="panel bg-ink-950 p-4 space-y-2">
              {rank.tiers.map((t) => (
                <ProgressRow
                  key={t.name}
                  label={t.name}
                  have={rank.wins}
                  need={Math.max(t.wins, 1)}
                  met={t.met}
                />
              ))}
            </div>
          </div>
        )}

        {missions && missions.length === 0 && (
          <p className="text-sm text-slate-400">No character-unlock missions available right now — check back soon.</p>
        )}

        {missions && missions.length > 0 && (
          <div className="space-y-4">
            {missions.map((m) => (
              <div key={m.character} className="panel bg-ink-950 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-bold text-slate-100">
                    {m.unlocked ? m.character : "??? (Unlocks a new fighter)"}
                  </h3>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      m.unlocked ? "bg-teamA-500/20 text-teamA-400" : "bg-panel-line text-slate-400"
                    }`}
                  >
                    {m.unlocked ? "Unlocked" : "Locked"}
                  </span>
                </div>
                <div className="space-y-2">
                  {m.requirements.map((req, i) => (
                    <ProgressRow key={i} label={req.label} have={req.have} need={req.need} met={req.met} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
