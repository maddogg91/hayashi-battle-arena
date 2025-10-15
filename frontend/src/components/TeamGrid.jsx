import { motion } from "framer-motion";

export default function TeamGrid({
  label,
  team,
  side = "left",
  selected,
  onSelect, // (index) => void
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 w-full">
      <h3 className={`text-lg mb-3 ${side === "left" ? "text-green-400" : "text-blue-400"}`}>
        {label}
      </h3>
      <div className="grid grid-cols-5 gap-3">
        {team.map((c, i) => {
          const dead = c.hp <= 0;
          const isSel = selected === i;
          const e = c.effects || {};
          return (
            <motion.button
              key={`${c.name}-${i}`}
              onClick={() => !dead && onSelect?.(i)}
              disabled={dead}
              initial={{ scale: 0.95, opacity: 0.9 }}
              animate={{ scale: isSel ? 1.06 : 0.95, opacity: dead ? 0.5 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`rounded-xl p-3 text-center border-2 w-full
                ${isSel ? "border-yellow-400" : "border-gray-700"}
                ${dead ? "bg-gray-700" : "bg-gray-900"}
              `}
            >
              <div className="text-3xl">{c.img}</div>
              <div className="text-sm font-bold mt-1">{c.name}</div>

              {/* status chips */}
              <div className="flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                {e.stun > 0 && <span className="px-1 rounded bg-red-700">Stun {e.stun}</span>}
                {e.bind > 0 && <span className="px-1 rounded bg-pink-700">Bind {e.bind}</span>}
                {e.burn > 0 && <span className="px-1 rounded bg-orange-700">Burn {e.burn}</span>}
                {e.shield > 0 && <span className="px-1 rounded bg-blue-700">Shield {e.shield}</span>}
                {e.reflect > 0 && <span className="px-1 rounded bg-indigo-700">Reflect {e.reflect}</span>}
              </div>

              <div className="mt-2 h-2 bg-gray-700 rounded">
                <div
                  className="h-2 bg-red-500 rounded"
                  style={{ width: `${Math.max(0, Math.min(100, c.hp))}%` }}
                />
              </div>
              <div className="text-xs mt-1 text-gray-300">HP {c.hp}</div>
              {/* intentionally removed the type/description line for battle view */}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
