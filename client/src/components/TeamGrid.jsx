import { motion } from "framer-motion";
import { stackLabel, modeLabel } from "../utils/statusLabels";
import CharIcon from "./CharIcon";

const EFFECT_CHIPS = [
  ["stun", "Stun", "bg-hp-500/25 text-hp-400"],
  ["bind", "Bind", "bg-fuchsia-500/25 text-fuchsia-300"],
  ["burn", "Burn", "bg-burn-400/25 text-burn-400"],
  ["shield", "Shield", "bg-teamB-500/25 text-teamB-400"],
  ["reflect", "Reflect", "bg-indigo-500/25 text-indigo-300"],
  ["invuln", "Invuln", "bg-sp-500/25 text-sp-400"],
  ["immune", "Immune", "bg-teamA-500/25 text-teamA-400"],
  ["confuse", "Confused", "bg-purple-500/25 text-purple-300"],
  ["expose", "Exposed", "bg-orange-500/25 text-orange-300"],
  ["barrier", "Barrier", "bg-cyan-500/25 text-cyan-300"],
  ["mirror", "Mirror", "bg-teal-500/25 text-teal-300"],
];

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
      className={`panel p-3.5 sm:p-4 w-full transition
        ${highlight ? "ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-900" : ""}
      `}
    >
      <h3 className={`font-display text-base sm:text-lg font-bold mb-3 flex items-center gap-2 ${side === "left" ? "text-teamA-400" : "text-teamB-400"}`}>
        {label}
        {highlight && (
          <span className="text-xs font-semibold text-gold-300 animate-pulse">Choose a target</span>
        )}
      </h3>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {team.map((c, i) => {
          const dead = c.hp <= 0;
          const isSel = selected === i;
          const e = c.effects || {};
          const stacks = Object.entries(c.stacks || {}).filter(([, v]) => v > 0);
          const modes = Object.entries(c.modes || {}).filter(([, m]) => m?.turns > 0);
          const activeEffects = EFFECT_CHIPS.filter(([k]) => e[k] > 0);
          const charmed = e.charm > 0;
          return (
            <motion.button
              key={`${c.name}-${i}`}
              onClick={() => !dead && onSelect?.(i)}
              disabled={dead}
              initial={{ scale: 0.95, opacity: 0.9 }}
              animate={{ scale: isSel ? 1.05 : 0.95, opacity: dead ? 0.45 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`rounded-xl p-1.5 sm:p-3 text-center border w-full
                ${isSel ? "border-gold-400 bg-gold-500/10" : highlight && !dead ? "border-gold-500/60 animate-pulse bg-ink-950" : "border-panel-line bg-ink-950"}
                ${dead ? "grayscale" : ""}
              `}
            >
              <div className="text-3xl flex items-center justify-center h-7 sm:h-9">
                <CharIcon img={c.img} alt={c.name} sizePx={32} />
              </div>
              <div className="text-[9px] sm:text-xs font-display font-bold mt-1 leading-tight line-clamp-2 text-slate-100">{c.name}</div>

              {(activeEffects.length > 0 || charmed) && (
                <div className="hidden sm:flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {activeEffects.map(([k, label, cls]) => (
                    <span key={k} className={`px-1 rounded ${cls}`}>{label} {e[k]}</span>
                  ))}
                  {charmed && <span className="px-1 rounded bg-pink-500/25 text-pink-300">Charmed</span>}
                </div>
              )}

              {stacks.length > 0 && (
                <div className="hidden sm:flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {stacks.map(([name, v]) => (
                    <span key={name} className="px-1 rounded bg-gold-500/20 text-gold-300">{stackLabel(name)} x{v}</span>
                  ))}
                </div>
              )}

              {modes.length > 0 && (
                <div className="hidden sm:flex flex-wrap gap-1 justify-center mt-1 text-[10px]">
                  {modes.map(([name, m]) => (
                    <span key={name} className="px-1 rounded bg-teamB-500/20 text-teamB-400">{modeLabel(name)} {m.turns}</span>
                  ))}
                </div>
              )}

              {/* Compact dot indicator on mobile so status is at least visible without the labels taking over the tiny card. */}
              {(activeEffects.length > 0 || charmed || stacks.length > 0 || modes.length > 0) && (
                <div className="flex sm:hidden justify-center gap-0.5 mt-1">
                  {activeEffects.map(([k]) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-hp-400" />)}
                  {charmed && <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />}
                  {stacks.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />}
                  {modes.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-teamB-400" />}
                </div>
              )}

              <div className="mt-1.5 sm:mt-2 h-1.5 sm:h-2 bg-panel-line rounded-full overflow-hidden">
                <div
                  className="h-full bg-hp-500 rounded-full transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, c.hp))}%` }}
                />
              </div>
              <div className="text-[9px] sm:text-xs mt-0.5 sm:mt-1 text-slate-400">{c.hp}</div>

              <div className="mt-0.5 sm:mt-1 h-1 sm:h-1.5 bg-panel-line rounded-full overflow-hidden">
                <div
                  className="h-full bg-sp-500 rounded-full transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, c.sp ?? 0))}%` }}
                />
              </div>
              <div className="text-[9px] sm:text-xs text-sp-400">{c.sp ?? 0}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
