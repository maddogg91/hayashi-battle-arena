import { useMemo, useState } from "react";
import { socket } from "./api";

// quick helper to build a fighter
function f(name, type, { hp, atk, def, img }) {
  return { name, type, hp, atk, def, img };
}

/**
 * Baseline stat presets by archetype (you can tweak anytime)
 * - hp: 70–125
 * - atk: 8–22
 * - def: 2–12
 */
const presets = {
  tank:       { hp: 125, atk: 12, def: 12, img: "🛡️" },
  healer:     { hp: 95,  atk: 10, def: 9,  img: "✨" },
  support:    { hp: 95,  atk: 11, def: 8,  img: "🎼" },
  summoner:   { hp: 100, atk: 12, def: 8,  img: "📜" },
  mage:       { hp: 100, atk: 18, def: 6,  img: "🔮" },
  fireMage:   { hp: 100, atk: 19, def: 5,  img: "🔥" },
  lightMage:  { hp: 100, atk: 17, def: 7,  img: "🌞" },
  darkMage:   { hp: 100, atk: 19, def: 6,  img: "🌑" },
  chainMage:  { hp: 100, atk: 17, def: 7,  img: "⛓️" },
  barrier:    { hp: 110, atk: 12, def: 11, img: "🪄" },
  swordsman:  { hp: 100, atk: 18, def: 7,  img: "⚔️" },
  speedy:     { hp: 90,  atk: 20, def: 5,  img: "💫" },
  monk:       { hp: 105, atk: 16, def: 8,  img: "🧘" },
  brawler:    { hp: 110, atk: 19, def: 7,  img: "🥊" },
  martial:    { hp: 105, atk: 18, def: 7,  img: "🥋" },
  spear:      { hp: 110, atk: 17, def: 9,  img: "🗡️" },
  archer:     { hp: 95,  atk: 20, def: 5,  img: "🏹" },
  sniper:     { hp: 95,  atk: 21, def: 4,  img: "🎯" },
  explosions: { hp: 95,  atk: 21, def: 4,  img: "💥" },
  tech:       { hp: 90,  atk: 20, def: 4,  img: "🤖" },
  charm:      { hp: 95,  atk: 15, def: 7,  img: "💖" },
  intangible: { hp: 95,  atk: 19, def: 6,  img: "🔥" },
};

const POOL = [
  f("Arisa Huang", "Creature Summoner", presets.summoner),
  f("Jett Kimura", "Magical Gunner", presets.mage),
  f("Shou", "Demon-possessed swordsman with magical prowess", { ...presets.swordsman, atk: 20, img: "👹" }),
  f("Maako Karsean", "Fire user, turns into intangible flames", presets.intangible),
  f("Erika Sharp", "Healer, angelic spells to hurt/bind", { ...presets.healer, img: "👼" }),
  f("Star Trethowan", "Ninja that uses her charms to captivate enemies", presets.charm),
  f("Kairu Yusoko", "Light magic + bo staff", presets.lightMage),
  f("Sai Ryuzaki", "Magical chain binds & transforms", presets.chainMage),
  f("Kenshin Natasukiama", "Elemental magic from a sword", { ...presets.swordsman, atk: 19, img: "🌪️" }),
  f("Sendara Al Vere", "Spear user, extremely strong/durable", presets.spear),
  f("Liara Mitsuke", "Swordswoman, extremely fast ronin", presets.speedy),
  f("Tana Phoenix", "Fire from palms and body", presets.fireMage),
  f("Ben Sherman", "Martial artist, ki-based (Kaioken-ish)", presets.martial),
  f("Paul Watoski", "Tech genius with robots, physically weak", presets.tech),
  f("Kaitsu Hoshigaki", "Speedy magical archer", presets.archer),
  f("Alasia Maltese", "Ranged explosions", presets.explosions),
  f("Lyra", "Magic + healing spells", { ...presets.healer, atk: 12, img: "🌟" }),
  f("Robert Asuko", "Boxer, superhuman strength/reflexes", presets.brawler),
  f("Soren Harutaki", "Shield spells/barriers/reflect", presets.barrier),
  f("Arthur Kinglion", "Magic sniper with bullets", presets.sniper),
  f("Kobayashi", "Monk with chi-based attacks", presets.monk),
  f("Hakudoshi Inoue", "Tank, extremely durable & heavy hits", presets.tank),
  f("Sora Lorashu", "Elemental magic swordsman", { ...presets.swordsman, img: "🌈" }),
  f("Allie Mustang", "Uses dark magic", presets.darkMage),
  f("Kara Higgins", "Muse, flute to buff/curse", presets.support),
];

export default function CharacterSelect({ roomId, role, onSelect }) {
  const [selected, setSelected] = useState([]);
  const [locked, setLocked] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POOL;
    return POOL.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q)
    );
  }, [query]);

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
      <h2 className="text-3xl font-bold mb-3 text-yellow-400">
        Select Your 5 Fighters ({selected.length}/5)
      </h2>
      <p className="text-sm text-gray-300 mb-6">
        {role ? `You are Player ${role}` : "Assigning role..."}
      </p>

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
                ❤️{char.hp} ⚔️{char.atk} 🛡️{char.def}
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
