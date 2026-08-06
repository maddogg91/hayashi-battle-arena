import { useEffect, useMemo, useState } from "react";
import { socket, backendUrl } from "../api/socket";

export default function CharacterSelect({ roomId, role, onSelect, onLeave }) {
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
    const exists = selected.find((c) => c.name === char.name);
    if (exists) {
      setSelected((s) => s.filter((c) => c.name !== char.name));
    } else if (selected.length < 5) {
      setSelected((s) => [...s, char]);
    }
  };

  const confirmSelection = () => {
    if (selected.length === 5 && !locked) {
      socket.emit("selectCharacter", { roomId, role, characters: selected });
      setLocked(true);
      onSelect(selected);
    }
  };

  const isSelected = (name) => selected.some((c) => c.name === name);
  const canSelectMore = selected.length < 5;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10">
      {onLeave && (
        <div className="w-full max-w-6xl px-6 flex justify-end mb-2">
          <button
            onClick={onLeave}
            className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            Return to Lobby
          </button>
        </div>
      )}
      <h2 className="text-3xl font-bold mb-3 text-yellow-400">
        Select Your 5 Fighters ({selected.length}/5)
      </h2>
      <p className="text-sm text-gray-300 mb-6">
        {role ? `You are Player ${role}` : "Assigning role..."}
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

      {!loadError && pool.length === 0 && (
        <p className="text-gray-400 mb-6">Loading roster...</p>
      )}

      <div className="grid grid-cols-5 gap-4 max-w-6xl w-full px-6">
        {filtered.map((char) => {
          const selectedNow = isSelected(char.name);
          const disabled = !selectedNow && !canSelectMore;
          return (
            <button
              key={char.name}
              onClick={() => toggleCharacter(char)}
              disabled={disabled || locked}
              className={`border-2 rounded-xl p-4 text-center transition transform hover:scale-105
                ${selectedNow ? "border-yellow-400 bg-gray-700" : "border-gray-600 bg-gray-800"}
                ${disabled ? "opacity-60 cursor-not-allowed" : ""}
              `}
              title={char.type}
            >
              <div className="text-4xl">{char.img}</div>
              <p className="font-bold mt-2">{char.name}</p>
              <p className="text-xs text-gray-300 mt-1">{char.type}</p>
              <p className="text-sm text-gray-400 mt-2">
                ❤️ 100 HP ⚡ {char.spd} SPD
              </p>
            </button>
          );
        })}
      </div>

      <button
        onClick={confirmSelection}
        disabled={selected.length !== 5 || locked}
        className={`mt-8 px-6 py-3 rounded-lg font-bold
          ${selected.length === 5 && !locked ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 cursor-not-allowed"}
        `}
      >
        {locked ? "Team Locked" : "Confirm Selection"}
      </button>

      {locked && (
        <p className="mt-4 text-green-400 font-semibold">
          Team locked in! Waiting for opponent...
        </p>
      )}
    </div>
  );
}
