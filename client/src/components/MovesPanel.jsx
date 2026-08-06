import { useState } from "react";

export default function MovesPanel({
  myUnit = {},
  canAct,
  onUse,
  pendingMove = null,
  onCancelPending,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  const cds = myUnit.cooldowns || {};
  const effects = myUnit.effects || {};
  const skills = myUnit.skills || [];

  const cannotAct = !canAct || effects.stun > 0 || effects.bind > 0;

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

  const disabled = (key) => {
    if (cannotAct) return true;
    return (cds[key] || 0) > 0;
  };

  const activeSkill = skills.find((s) => s.key === (hoverKey || pendingMove?.key));

  const Btn = ({ skill }) => {
    const isPending = pendingMove?.key === skill.key;
    return (
      <button
        key={skill.key}
        onClick={() => onUse(skill.key)}
        onMouseEnter={() => setHoverKey(skill.key)}
        onMouseLeave={() => setHoverKey((k) => (k === skill.key ? null : k))}
        onFocus={() => setHoverKey(skill.key)}
        onBlur={() => setHoverKey((k) => (k === skill.key ? null : k))}
        disabled={disabled(skill.key)}
        className={`px-3 py-2 rounded-lg text-sm font-semibold transition
          ${disabled(skill.key)
            ? "bg-gray-600 cursor-not-allowed"
            : isPending
            ? "bg-yellow-500 hover:bg-yellow-600 ring-2 ring-yellow-300 animate-pulse"
            : "bg-purple-600 hover:bg-purple-700"}
        `}
      >
        {skill.label}
        {(cds[skill.key] || 0) > 0 ? ` (${cds[skill.key]})` : ""}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-3 mt-6">
      <div className="flex gap-2 text-xs text-gray-300">
        {effects.stun > 0 && <span className="px-2 py-1 bg-red-700 rounded">Stunned {effects.stun}</span>}
        {effects.bind > 0 && <span className="px-2 py-1 bg-pink-700 rounded">Bound {effects.bind}</span>}
        {effects.burn > 0 && <span className="px-2 py-1 bg-orange-700 rounded">Burn {effects.burn}</span>}
        {effects.shield > 0 && <span className="px-2 py-1 bg-blue-700 rounded">Shield {effects.shield}</span>}
        {effects.reflect > 0 && <span className="px-2 py-1 bg-indigo-700 rounded">Reflect {effects.reflect}</span>}
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {skills.map((s) => <Btn key={s.key} skill={s} />)}
      </div>

      {/* Always-visible move description — readable on desktop hover and mobile tap alike */}
      <div className="w-full max-w-xl bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 min-h-[3.75rem]">
        {pendingMove ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold text-yellow-400">{pendingMove.label}:</span>{" "}
              Choose {pendingMove.needs === "enemy" ? "an" : "a"} {needsTargetWord(pendingMove.needs).toLowerCase()} target to use it.
            </span>
            {onCancelPending && (
              <button
                onClick={onCancelPending}
                className="shrink-0 text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        ) : activeSkill ? (
          <>
            <span className="font-semibold text-yellow-400">{activeSkill.label}</span>{" "}
            <span className="text-gray-400">
              ({needsTargetWord(activeSkill.target)} • Cooldown {activeSkill.cd})
            </span>
            <div className="mt-1">{activeSkill.desc || "No description available."}</div>
          </>
        ) : (
          <span className="text-gray-400">Hover or tap a move to see what it does.</span>
        )}
      </div>
    </div>
  );
}
