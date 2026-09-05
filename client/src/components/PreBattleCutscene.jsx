import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playSfx } from "../utils/sfx";

export default function PreBattleCutscene({ cutscene = [], onDone, onLeave }) {
  const [i, setI] = useState(0);
  const line = cutscene[i];

  if (!cutscene.length) return null;

  const advance = () => {
    playSfx("click");
    setI(i + 1);
  };
  const start = () => {
    playSfx("confirm");
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="panel bg-panel-raised text-slate-100 p-6 w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-gold-300">Before the Battle…</h3>
          {onLeave && (
            <button onClick={() => { playSfx("click"); onLeave(); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-panel-line hover:bg-panel-line/70 text-slate-300 transition">
              Return to Lobby
            </button>
          )}
        </div>
        <div className="min-h-24 bg-ink-950 rounded-xl p-4 border border-panel-line overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={i}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="text-sm text-slate-200 leading-relaxed"
            >
              <span className={`font-display font-semibold ${line?.side === "A" ? "text-teamA-400" : line?.side === "B" ? "text-teamB-400" : "text-slate-300"}`}>
                {line?.speaker}
              </span>
              {": "}
              {line?.line}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {cutscene.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${idx === i ? "bg-gold-400" : idx < i ? "bg-panel-line" : "bg-panel-line/40"}`}
              />
            ))}
          </div>
          {i < cutscene.length - 1 ? (
            <motion.button whileTap={{ scale: 0.94 }} onClick={advance} className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-display font-bold transition">
              Next
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.94 }} onClick={start} className="px-5 py-2.5 rounded-xl bg-teamA-500 hover:bg-teamA-400 text-ink-950 font-display font-bold transition">
              Start Battle
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
