import { motion } from "framer-motion";
import { stackLabel, modeLabel } from "../utils/statusLabels";
import CharIcon from "./CharIcon";

export default function TeamGrid({
  label,
  team,
  side = "left",
  selected,
  onSelect, // (index) => void
  highlight = false, // true while a pending move needs a target from this grid
}) {
  return (
    <div
      className={`bg-gray-800 rounded-xl p-4 w-full transition
        ${highlight ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900" : ""}
      `}
    >
      <h3 className={`text-lg mb-3 flex items-center gap-2 ${side === "left" ? "text-green-400" : "text-blue-400"}`}>
        {label}
        {highlight && (
          <span className="text-xs font-semibold text-yellow-300 animate-pulse">Choose a target</span>
        )}
      </h3>
      <div className="grid grid-cols-5 gap-3">
        {team.map((c, i) => {
          const dead = c.hp <= 0;
          const isSel = selected === i;
          const e = c.effects || {};
          const stacks = Object.entries(c.stacks || {}).filter(([, v]) => v > 0);
          const modes = Object.entries(c.modes || {}).filter(([, m]) => m?.turns > 0);
          return (
            <motion.button
              key={`${c.name}-${i}`}
              onClick={() => !dead && onSelect?.(i)}
              disabled={dead}
              initial={{ scale: 0.95, opacity: 0.9 }}
              animate={{ scale: isSel ? 1.06 : 0.95, opacity: dead ? 0.5 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`rounded-xl p-3 text-center border-2 w-full
                ${isSel ? "border-yellow-400" : highlight && !dead ? "border-yellow-500/70 animate-pulse" : "border-gray-700"}
                ${dead ? "bg-gray-700" : "bg-gray-900"}
              `}
            >
              <div className="text-3xl flex items-center justify-center h-9">
                <CharIcon img={c.img} alt={c.name} sizePx={32} />
              </div>
              <div className="text-sm font-bold mt-1">{c.name}</div>

              {/* status effect chips */}
              {(e.stun > 0 || e.bind > 0 || e.burn > 0 || e.shield > 0 || e.reflect > 0 || e.invuln > 0 || e.charm > 0 || e.immune > 0) && (
                <div className="flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {e.stun > 0 && <span className="px-1 rounded bg-red-700">Stun {e.stun}</span>}
                  {e.bind > 0 && <span className="px-1 rounded bg-pink-700">Bind {e.bind}</span>}
                  {e.burn > 0 && <span className="px-1 rounded bg-orange-700">Burn {e.burn}</span>}
                  {e.shield > 0 && <span className="px-1 rounded bg-blue-700">Shield {e.shield}</span>}
                  {e.reflect > 0 && <span className="px-1 rounded bg-indigo-700">Reflect {e.reflect}</span>}
                  {e.invuln > 0 && <span className="px-1 rounded bg-cyan-700">Invuln {e.invuln}</span>}
                  {e.charm > 0 && <span className="px-1 rounded bg-fuchsia-700">Charmed</span>}
                  {e.immune > 0 && <span className="px-1 rounded bg-emerald-700">Immune {e.immune}</span>}
                </div>
              )}

              {/* stack chips (Creature Summon, Chain Dance, Lightning Charge, Rock Armor...) */}
              {stacks.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {stacks.map(([name, v]) => (
                    <span key={name} className="px-1 rounded bg-purple-800">{stackLabel(name)} x{v}</span>
                  ))}
                </div>
              )}

              {/* mode chips (Kimura Special, Arahabaki, Intangible Flames...) */}
              {modes.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {modes.map(([name, m]) => (
                    <span key={name} className="px-1 rounded bg-teal-700">{modeLabel(name)} {m.turns}</span>
                  ))}
                </div>
              )}

              <div className="mt-2 h-2 bg-gray-700 rounded">
                <div
                  className="h-2 bg-red-500 rounded"
                  style={{ width: `${Math.max(0, Math.min(100, c.hp))}%` }}
                />
              </div>
              <div className="text-xs mt-1 text-gray-300">HP {c.hp}</div>

              <div className="mt-1 h-1.5 bg-gray-700 rounded">
                <div
                  className="h-1.5 bg-blue-500 rounded"
                  style={{ width: `${Math.max(0, Math.min(100, c.sp ?? 0))}%` }}
                />
              </div>
              <div className="text-xs text-blue-300">SP {c.sp ?? 0}</div>
              {/* intentionally removed the type/description line for battle view */}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
