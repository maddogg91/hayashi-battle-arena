import { useEffect, useMemo, useState } from "react";
import { backendUrl } from "../api/socket";
import CharIcon from "../components/CharIcon";

const needsTargetWord = (t) => {
  if (!t || t === "none") return "No target";
  if (t === "self") return "Self";
  if (t === "ally") return "Ally";
  if (t === "enemy") return "Enemy";
  if (t === "aoe_team") return "All Allies";
  if (t === "aoe_enemy") return "All Enemies";
  if (t === "aoe_all") return "Everyone";
  return t;
};

export default function CharacterGuide({ onBack }) {
  const [chars, setChars] = useState([]);
  const [movesByChar, setMovesByChar] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${backendUrl}/api/roster`)
      .then((r) => r.json())
      .then((data) => {
        setChars(data.chars || []);
        setMovesByChar(data.movesByChar || {});
      })
      .catch(() => setLoadError("Could not load the character guide. Is the server running?"));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chars;
    return chars.filter(
      (c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
    );
  }, [query, chars]);

  return (
    <div className="flex flex-col items-center py-6 sm:py-10 px-4 sm:px-6">
      <div className="w-full max-w-6xl flex justify-end mb-2">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs px-3 py-1.5 rounded-lg bg-panel-raised hover:bg-panel-line text-slate-300 border border-panel-line transition"
          >
            Return to Lobby
          </button>
        )}
      </div>

      <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2 text-gold-300">Character Guide</h2>
      <p className="text-sm text-slate-400 mb-6 text-center">
        Tap a fighter to read their profile and skills.
      </p>

      {loadError && <p className="text-hp-400 mb-4">{loadError}</p>}

      <div className="flex items-center gap-2 mb-6 w-full max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or type..."
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-ink-950 border border-panel-line focus:outline-none focus:border-gold-500 text-slate-100 placeholder:text-slate-500"
        />
        <button
          onClick={() => setQuery("")}
          className="px-3 py-2.5 rounded-xl bg-panel-raised hover:bg-panel-line text-slate-300 border border-panel-line transition"
        >
          Clear
        </button>
      </div>

      {!loadError && chars.length === 0 && (
        <p className="text-slate-400 mb-6">Loading roster...</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl w-full">
        {filtered.map((char) => {
          const isOpen = expanded === char.name;
          const skills = movesByChar[char.name] || [];
          return (
            <div key={char.name} className="panel p-4 text-left">
              <button
                onClick={() => setExpanded(isOpen ? null : char.name)}
                className="w-full flex items-center gap-3 text-left"
              >
                <div className="text-4xl flex items-center justify-center h-11 w-11 shrink-0">
                  <CharIcon img={char.img} alt={char.name} sizePx={36} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-slate-100">{char.name}</p>
                  <p className="text-xs text-slate-400 truncate">{char.type}</p>
                  <p className="text-xs text-slate-500 mt-1">❤️ 100 HP ⚡ {char.spd} SPD</p>
                </div>
                <span className="text-slate-500 text-sm shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-panel-line space-y-3">
                  {char.description && (
                    <p className="text-sm text-slate-300 italic">{char.description}</p>
                  )}
                  {skills.length === 0 ? (
                    <p className="text-xs text-slate-500">No skills on file for this character.</p>
                  ) : (
                    <ul className="space-y-2">
                      {skills.map((s) => (
                        <li key={s.key} className="bg-ink-950 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gold-300">{s.label}</span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {needsTargetWord(s.target)} • {s.cost ?? 0} SP
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 mt-1">
                            {s.desc || "No description available."}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
