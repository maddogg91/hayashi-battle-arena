import { useEffect, useState } from "react";
import { getMe, getProfile } from "../api/auth";
import CharIcon from "../components/CharIcon";
import { backendUrl } from "../api/socket";

export default function Profile({ onBack }) {
  const [profile, setProfile] = useState(null);
  const [charIcons, setCharIcons] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me) {
          setError("Log in to see your profile.");
          return;
        }
        const p = await getProfile(me.username);
        setProfile(p);
      } catch (err) {
        setError(err.message || "Could not load your profile.");
      }
    })();
    // Character icons are keyed by name in the roster data — reused here so
    // the character-usage list shows the same art as everywhere else.
    fetch(`${backendUrl}/api/roster`)
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        for (const c of data.chars || []) map[c.name] = c.img;
        setCharIcons(map);
      })
      .catch(() => {});
  }, []);

  const winRate = profile && profile.stats.gamesPlayed
    ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
    : 0;

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
        {error && <p className="text-sm text-hp-400">{error}</p>}
        {!error && !profile && <p className="text-sm text-slate-400">Loading…</p>}

        {profile && (
          <>
            <h2 className="font-display text-2xl font-bold text-gold-300 mb-5">👤 {profile.username}</h2>

            <div className="grid grid-cols-4 gap-3 mb-7">
              <div className="panel bg-ink-950 p-3.5 text-center">
                <div className="text-2xl font-display font-bold text-slate-100">{profile.stats.gamesPlayed}</div>
                <div className="text-xs text-slate-400 mt-0.5">Games</div>
              </div>
              <div className="panel bg-ink-950 p-3.5 text-center">
                <div className="text-2xl font-display font-bold text-teamA-400">{profile.stats.wins}</div>
                <div className="text-xs text-slate-400 mt-0.5">Wins</div>
              </div>
              <div className="panel bg-ink-950 p-3.5 text-center">
                <div className="text-2xl font-display font-bold text-hp-400">{profile.stats.losses}</div>
                <div className="text-xs text-slate-400 mt-0.5">Losses</div>
              </div>
              <div className="panel bg-ink-950 p-3.5 text-center">
                <div className="text-2xl font-display font-bold text-gold-300">{winRate}%</div>
                <div className="text-xs text-slate-400 mt-0.5">Win Rate</div>
              </div>
            </div>

            <h3 className="font-display text-lg font-bold text-slate-100 mb-3">Character Usage</h3>
            {profile.characterUsage.length === 0 ? (
              <p className="text-sm text-slate-400">Finish a match to start tracking which fighters you play.</p>
            ) : (
              <div className="space-y-2">
                {profile.characterUsage.map((c) => {
                  const pct = c.picks ? Math.round((c.wins / c.picks) * 100) : 0;
                  const barPct = profile.characterUsage[0].picks
                    ? Math.round((c.picks / profile.characterUsage[0].picks) * 100)
                    : 0;
                  return (
                    <div key={c.character} className="flex items-center gap-3">
                      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                        <CharIcon img={charIcons[c.character]} alt={c.character} sizePx={26} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm mb-0.5">
                          <span className="font-semibold text-slate-100 truncate">{c.character}</span>
                          <span className="text-slate-400 shrink-0 ml-2">
                            {c.picks} game{c.picks === 1 ? "" : "s"} · {pct}% win rate
                          </span>
                        </div>
                        <div className="h-1.5 bg-panel-line rounded-full overflow-hidden">
                          <div className="h-full bg-gold-400 rounded-full" style={{ width: `${Math.max(4, barPct)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
