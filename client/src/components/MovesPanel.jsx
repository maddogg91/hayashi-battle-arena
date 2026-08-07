import { useState } from "react";

export default function MovesPanel({
  myUnit = {},
  canAct,
  onUse,
  pendingMove = null,
  onCancelPending,
  canConfirm = false,
  onConfirm,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  const sp = myUnit.sp ?? 0;
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

  const canAfford = (skill) => sp >= (skill.cost || 0);
  const disabled = (skill) => {
    if (cannotAct) return true;
    return !canAfford(skill);
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
        disabled={disabled(skill)}
        className={`px-3 py-2 rounded-lg text-sm font-semibold transition
          ${disabled(skill)
            ? "bg-gray-600 cursor-not-allowed"
            : isPending
            ? "bg-yellow-500 hover:bg-yellow-600 ring-2 ring-yellow-300 animate-pulse"
            : "bg-purple-600 hover:bg-purple-700"}
        `}
      >
        {skill.label}
        <span className="ml-1 text-xs opacity-80">({skill.cost || 0} SP)</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-3 mt-6">
      <div className="flex items-center gap-3 text-xs text-gray-300">
        <span className="px-2 py-1 bg-blue-900 border border-blue-600 rounded font-semibold text-blue-200">
          SP {sp}/100
        </span>
        {effects.stun > 0 && <span className="px-2 py-1 bg-red-700 rounded">Stunned {effects.stun}</span>}
        {effects.bind > 0 && <span className="px-2 py-1 bg-pink-700 rounded">Bound {effects.bind}</span>}
        {effects.burn > 0 && <span className="px-2 py-1 bg-orange-700 rounded">Burn {effects.burn}</span>}
        {effects.shield > 0 && <span className="px-2 py-1 bg-blue-700 rounded">Shield {effects.shield}</span>}
        {effects.reflect > 0 && <span className="px-2 py-1 bg-indigo-700 rounded">Reflect {effects.reflect}</span>}
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {skills.map((s) => <Btn key={s.key} skill={s} />)}
      </div>

      {/* Always-visible move description — shown on hover *and* whenever a
          move is selected, so it never depends on hovering (which touch
          devices can't do anyway) and stays visible while a selected move
          waits on Confirm/Cancel. */}
      <div className="w-full max-w-xl bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 min-h-[3.75rem]">
        {activeSkill ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="font-semibold text-yellow-400">{activeSkill.label}</span>{" "}
                <span className="text-gray-400">
                  ({needsTargetWord(activeSkill.target)} • {activeSkill.cost || 0} SP)
                </span>
              </span>
              {pendingMove && (
                <div className="flex shrink-0 gap-2">
                  {onCancelPending && (
                    <button
                      onClick={onCancelPending}
                      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  )}
                  {onConfirm && (
                    <button
                      onClick={onConfirm}
                      disabled={!canConfirm}
                      className={`text-xs px-3 py-1 rounded font-semibold
                        ${canConfirm
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-gray-600 cursor-not-allowed opacity-60"}
                      `}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-1">{activeSkill.desc || "No description available."}</div>
            {pendingMove && (
              <div className="mt-1 text-xs text-yellow-300">
                {canConfirm
                  ? "Ready to use — press Confirm."
                  : `Choose ${pendingMove.needs === "enemy" ? "an" : "a"} ${needsTargetWord(pendingMove.needs).toLowerCase()} target, then press Confirm.`}
              </div>
            )}
          </>
        ) : (
          <span className="text-gray-400">Hover or tap a move to see what it does.</span>
        )}
      </div>
    </div>
  );
}
