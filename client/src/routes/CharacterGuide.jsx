import { useEffect, useMemo, useState } from "react";
import { backendUrl } from "../api/socket";

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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10">
      <div className="w-full max-w-6xl px-6 flex justify-end mb-2">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            Return to Lobby
          </button>
        )}
      </div>

      <h2 className="text-3xl font-bold mb-3 text-yellow-400">Character Guide</h2>
      <p className="text-sm text-gray-300 mb-6">
        Tap a fighter to read their profile and skills.
      </p>

      {loadError && <p className="text-red-400 mb-4">{loadError}</p>}

      <div className="flex items-center gap-3 mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or type..."
          className="p-2 rounded-md text-black w-72"
        />
        <button
          onClick={() => setQuery("")}
          className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
        >
          Clear
        </button>
      </div>

      {!loadError && chars.length === 0 && (
        <p className="text-gray-400 mb-6">Loading roster...</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl w-full px-6">
        {filtered.map((char) => {
          const isOpen = expanded === char.name;
          const skills = movesByChar[char.name] || [];
          return (
            <div
              key={char.name}
              className="border-2 border-gray-700 bg-gray-800 rounded-xl p-4 text-left"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : char.name)}
                className="w-full flex items-center gap-3 text-left"
              >
                <div className="text-4xl">{char.img}</div>
                <div className="flex-1">
                  <p className="font-bold">{char.name}</p>
                  <p className="text-xs text-gray-300">{char.type}</p>
                  <p className="text-xs text-gray-400 mt-1">❤️ 100 HP ⚡ {char.spd} SPD</p>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
                  {char.description && (
                    <p className="text-sm text-gray-300 italic">{char.description}</p>
                  )}
                  {skills.length === 0 ? (
                    <p className="text-xs text-gray-500">No skills on file for this character.</p>
                  ) : (
                    <ul className="space-y-2">
                      {skills.map((s) => (
                        <li key={s.key} className="bg-gray-900 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-yellow-400">{s.label}</span>
                            <span className="text-xs text-gray-400">
                              {needsTargetWord(s.target)} • {s.cost ?? 0} SP
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 mt-1">
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
