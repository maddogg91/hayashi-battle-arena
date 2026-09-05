import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import CharIcon from "./CharIcon";
import { statusLabel } from "../utils/statusLabels";
import { findMVP } from "../utils/battleStats";
import { playSfx } from "../utils/sfx";
import ReplayViewer from "./ReplayViewer";

function StatCell({ value, cls = "text-slate-100" }) {
  return <td className={`px-2 py-2 text-center text-sm font-semibold ${cls}`}>{value}</td>;
}

function TeamStatsTable({ label, team, accentCls, rowDelayStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" }}
      className="panel p-3.5 sm:p-4 w-full overflow-x-auto"
    >
      <h3 className={`font-display text-base sm:text-lg font-bold mb-3 ${accentCls}`}>{label}</h3>
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-panel-line">
            <th className="px-2 py-1.5 text-left">Character</th>
            <th className="px-2 py-1.5">DMG Dealt</th>
            <th className="px-2 py-1.5">DMG Guarded</th>
            <th className="px-2 py-1.5">DMG Taken</th>
            <th className="px-2 py-1.5">Healing Done</th>
            <th className="px-2 py-1.5">Healing Recv.</th>
            <th className="px-2 py-1.5">KOs</th>
            <th className="px-2 py-1.5 text-left">Statuses Received</th>
          </tr>
        </thead>
        <tbody>
          {team.map((u, i) => {
            const s = u.stats || {};
            const statuses = Object.entries(s.statusesReceived || {}).filter(([, v]) => v > 0);
            return (
              <motion.tr
                key={`${u.name}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: rowDelayStart + i * 0.05, duration: 0.25, ease: "easeOut" }}
                className="border-b border-panel-line/60 last:border-0"
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className={`w-6 h-6 shrink-0 flex items-center justify-center ${u.hp <= 0 ? "grayscale opacity-60" : ""}`}>
                      <CharIcon img={u.img} alt={u.name} sizePx={22} />
                    </div>
                    <span className="text-sm font-semibold text-slate-100 truncate">{u.name}</span>
                  </div>
                </td>
                <StatCell value={s.damageDealt || 0} />
                <StatCell value={s.damageGuarded || 0} cls="text-sp-400" />
                <StatCell value={s.damageTaken || 0} cls="text-hp-400" />
                <StatCell value={s.healingDone || 0} cls="text-teamA-400" />
                <StatCell value={s.healingReceived || 0} cls="text-teamA-400" />
                <StatCell value={s.kos || 0} cls="text-gold-300" />
                <td className="px-2 py-2">
                  {statuses.length === 0 ? (
                    <span className="text-xs text-slate-500">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {statuses.map(([type, count]) => (
                        <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-panel-raised text-slate-300">
                          {statusLabel(type)} ×{count}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

export default function BattleSummary({ game, names, role, replayId, log, onSaveReplay, onLeave, isPractice = false, onNewTeam }) {
  const [showLog, setShowLog] = useState(false);

  const teamA = game.teams?.A ?? [];
  const teamB = game.teams?.B ?? [];
  const aAlive = teamA.some((u) => u.hp > 0);
  const winnerRole = aAlive ? "A" : "B";
  const winnerName = winnerRole === "A" ? names.A : names.B;
  const iWon = role ? role === winnerRole : null;

  const mvp = findMVP(game.teams, winnerRole);

  // Fires exactly once when the summary screen first mounts (this component
  // only ever mounts once per match, right as game.over flips true).
  useEffect(() => {
    playSfx(iWon === false ? "defeat" : "victory");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lg:col-span-2">
      <motion.div
        initial={{ opacity: 0, y: -18, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="text-center mb-5"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 12 }}
          className="text-4xl mb-1"
        >
          🏆
        </motion.div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-gold-300">
          Team {winnerRole} Wins!
        </h1>
        <p className="text-slate-400 text-sm mt-1">{winnerName || `Player ${winnerRole}`} takes the victory.</p>
      </motion.div>

      {mvp && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" }}
          className="panel p-4 sm:p-5 mb-5 border-gold-500/40 bg-gradient-to-br from-gold-500/10 to-transparent"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 shrink-0 flex items-center justify-center rounded-xl bg-ink-950 border border-gold-500/40">
              <CharIcon img={mvp.unit.img} alt={mvp.unit.name} sizePx={40} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gold-400 uppercase tracking-wide">MVP</div>
              <div className="font-display text-lg font-bold text-slate-100 truncate">
                {mvp.unit.name}{" "}
                <span className={mvp.teamRole === "A" ? "text-teamA-400" : "text-teamB-400"}>
                  (Team {mvp.teamRole})
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Impact Score: <span className="font-semibold text-gold-300">{mvp.score}</span>
                {" "}— dealt {mvp.unit.stats?.damageDealt || 0} dmg, guarded {mvp.unit.stats?.damageGuarded || 0}, healed {mvp.unit.stats?.healingDone || 0}, {mvp.unit.stats?.kos || 0} KO{mvp.unit.stats?.kos === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        <TeamStatsTable label={`Team A — ${names.A || "Player A"}`} team={teamA} accentCls="text-teamA-400" rowDelayStart={0.45} />
        <TeamStatsTable label={`Team B — ${names.B || "Player B"}`} team={teamB} accentCls="text-teamB-400" rowDelayStart={0.45 + teamA.length * 0.05} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {isPractice && onNewTeam && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { playSfx("confirm"); onNewTeam(); }}
            className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-display font-bold transition"
          >
            🔁 Try a Different Team
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { playSfx("confirm"); onSaveReplay(); }}
          className="px-5 py-2.5 rounded-xl bg-teamA-500 hover:bg-teamA-400 text-ink-950 font-display font-bold transition"
        >
          Save Replay
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { playSfx("click"); onLeave(); }}
          className="px-5 py-2.5 rounded-xl bg-panel-raised hover:bg-panel-line text-slate-200 font-display font-bold border border-panel-line transition"
        >
          Back to Lobby
        </motion.button>
      </div>

      {replayId && <ReplayViewer replayId={replayId} />}

      <div className="mt-6 panel p-4">
        <button
          onClick={() => { playSfx("click"); setShowLog((v) => !v); }}
          className="w-full flex items-center justify-between font-display text-lg font-bold text-slate-100"
        >
          <span>Battle Log</span>
          <span className="text-sm text-slate-400">{showLog ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showLog && (
          <div className="mt-3 h-48 overflow-y-auto space-y-1 bg-ink-950 rounded-lg p-3">
            {(log || []).map((entry, i) => (
              <p key={i} className="text-sm text-slate-300">{entry}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
