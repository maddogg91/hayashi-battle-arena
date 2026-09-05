import { useEffect, useMemo, useState } from "react";
import { socket, backendUrl } from "../api/socket";
import CharIcon from "../components/CharIcon";
import { playSfx } from "../utils/sfx";

export default function CharacterSelect({ roomId, role, onSelect, onLeave, isPractice = false }) {
  const [pool, setPool] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [locked, setLocked] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${backendUrl}/api/roster`)
      .then((r) => r.json())
      .then((data) => setPool(data.chars || []))
      .catch(() => setLoadError("Could not load the roster. Is the server running?"));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q)
    );
  }, [query, pool]);

  const toggleCharacter = (char) => {
    if (locked) return;
    playSfx("click");
    const exists = selected.find((c) => c.name === char.name);
    if (exists) {
      setSelected((s) => s.filter((c) => c.name !== char.name));
    } else if (selected.length < 5) {
      setSelected((s) => [...s, char]);
    }
  };

  const confirmSelection = () => {
    if (selected.length === 5 && !locked) {
      playSfx("confirm");
      socket.emit("selectCharacter", { roomId, role, characters: selected });
      setLocked(true);
      onSelect(selected);
    }
  };

  const isSelected = (name) => selected.some((c) => c.name === name);
  const canSelectMore = selected.length < 5;

  return (
    <div className="flex flex-col items-center pb-28 sm:pb-10">
      {onLeave && (
        <div className="w-full flex justify-end mb-3">
          <button
            onClick={() => { playSfx("click"); onLeave(); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-panel-raised hover:bg-panel-line text-slate-300 border border-panel-line transition"
          >
            Return to Lobby
          </button>
        </div>
      )}
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-300 text-center">
        Select Your 5 Fighters
      </h2>
      {isPractice && (
        <span className="mb-1 text-xs px-2.5 py-1 rounded-full bg-gold-500/15 text-gold-300 font-semibold">
          🏋️ Practice Mode — vs. Training Dummies
        </span>
      )}
      <p className="text-sm text-slate-400 mb-1">
        {isPractice ? "Draft any team to test it out." : role ? `You are Player ${role}` : "Assigning role..."}
      </p>
      <p className="text-sm font-semibold text-slate-300 mb-5">{selected.length}/5 selected</p>

      {loadError && <p className="text-hp-400 mb-4">{loadError}</p>}

      <div className="flex items-center gap-2 mb-5 w-full max-w-md px-1">
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

      {!loadError && pool.length === 0 && (
        <p className="text-slate-400 mb-6">Loading roster...</p>
      )}

      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 w-full px-1">
        {filtered.map((char) => {
          const selectedNow = isSelected(char.name);
          const disabled = !selectedNow && !canSelectMore;
          return (
            <button
              key={char.name}
              onClick={() => toggleCharacter(char)}
              disabled={disabled || locked}
              className={`panel p-3.5 sm:p-4 text-center transition active:scale-95
                ${selectedNow ? "border-gold-400! bg-gold-500/10 shadow-lg shadow-gold-500/10" : "hover:border-panel-line/60 hover:bg-panel-raised"}
                ${disabled ? "opacity-40 cursor-not-allowed" : ""}
              `}
              title={char.type}
            >
              <div className="text-4xl flex items-center justify-center h-11">
                <CharIcon img={char.img} alt={char.name} sizePx={36} />
              </div>
              <p className="font-display font-bold mt-2 text-slate-100">{char.name}</p>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{char.type}</p>
              <p className="text-xs text-slate-300 mt-2">
                ❤️ 100 HP ⚡ {char.spd} SPD
              </p>
            </button>
          );
        })}
      </div>

      {/* Confirm bar: fixed to the bottom on mobile so it's always reachable
          without scrolling past the whole roster; a normal inline button on
          larger screens. */}
      <div className="fixed sm:static bottom-0 left-0 right-0 sm:mt-8 z-30 px-4 py-3 sm:p-0 bg-ink-900/95 sm:bg-transparent border-t sm:border-0 border-panel-line backdrop-blur-sm sm:backdrop-blur-none flex flex-col items-center gap-2">
        <button
          onClick={confirmSelection}
          disabled={selected.length !== 5 || locked}
          className={`w-full sm:w-auto px-8 py-3 rounded-xl font-display font-bold transition
            ${selected.length === 5 && !locked
              ? "bg-teamA-500 hover:bg-teamA-400 text-ink-950 shadow-lg shadow-teamA-500/20"
              : "bg-panel-line text-slate-500 cursor-not-allowed"}
          `}
        >
          {locked ? "Team Locked" : "Confirm Selection"}
        </button>
        {locked && (
          <p className="text-teamA-400 text-sm font-semibold">
            Team locked in! Waiting for opponent...
          </p>
        )}
      </div>
    </div>
  );
}
