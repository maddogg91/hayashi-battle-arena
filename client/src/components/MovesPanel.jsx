import { useState } from "react";

// Hoisted out of MovesPanel: if these were defined inside the component
// body, React would see a brand-new component type on every render (any SP
// update from ANY player re-renders this panel) and tear down + rebuild
// every button's DOM node each time. With the mouse sitting over one of
// them, the browser can refire mouseenter on the fresh node, triggering
// another state update and another rebuild — an infinite loop for as long
// as the cursor stays put. That's a real, desktop-specific bug: touch has
// no persistent hover, so it can't retrigger the same way.
function InfoIcon({ skill, onPreview, onClearPreview }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // A real click always fires mouseenter first, which already sets
        // the preview — so this only needs to handle the tap-with-no-hover
        // case (mobile). Toggling here would immediately undo what
        // mouseenter just did on desktop.
        e.stopPropagation();
        onPreview(skill.key);
      }}
      onMouseEnter={() => onPreview(skill.key)}
      onMouseLeave={() => onClearPreview(skill.key)}
      onFocus={() => onPreview(skill.key)}
      onBlur={() => onClearPreview(skill.key)}
      aria-label={`About ${skill.label}`}
      title={skill.desc}
      className="w-5 h-5 shrink-0 rounded-full bg-gray-600 hover:bg-gray-500 text-[10px] font-bold text-gray-100 flex items-center justify-center"
    >
      i
    </button>
  );
}

function MoveButton({ skill, isPending, isDisabled, onUse, onPreview, onClearPreview }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onUse(skill.key)}
        disabled={isDisabled}
        className={`px-3 py-2 rounded-lg text-sm font-semibold transition
          ${isDisabled
            ? "bg-gray-600 cursor-not-allowed"
            : isPending
            ? "bg-yellow-500 hover:bg-yellow-600 ring-2 ring-yellow-300 animate-pulse"
            : "bg-purple-600 hover:bg-purple-700"}
        `}
      >
        {skill.label}
        <span className="ml-1 text-xs opacity-80">({skill.cost || 0} SP)</span>
      </button>
      <InfoIcon skill={skill} onPreview={onPreview} onClearPreview={onClearPreview} />
    </div>
  );
}

export default function MovesPanel({
  myUnit = {},
  canAct,
  onUse,
  pendingMove = null,
  onCancelPending,
  canConfirm = false,
  onConfirm,
}) {
  // Only drives the *preview* shown when nothing is selected yet — once a
  // move is pending, the panel locks to it (see activeSkill) so hovering
  // near other buttons on your way to a target/Confirm can't silently swap
  // the description out from under you.
  const [previewKey, setPreviewKey] = useState(null);
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

  const activeSkill = skills.find((s) => s.key === (pendingMove?.key || previewKey));

  const handlePreview = (key) => setPreviewKey(key);
  const handleClearPreview = (key) => {
    setPreviewKey((k) => (k === key ? null : k));
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

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {skills.map((s) => (
          <MoveButton
            key={s.key}
            skill={s}
            isPending={pendingMove?.key === s.key}
            isDisabled={disabled(s)}
            onUse={onUse}
            onPreview={handlePreview}
            onClearPreview={handleClearPreview}
          />
        ))}
      </div>

      {/* Always-visible move description. Tap/hover the ⓘ next to a move to
          preview it before selecting; once a move is actually selected the
          panel locks to it (ignoring the info icons) so it always matches
          what Confirm will do. */}
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
          <span className="text-gray-400">Tap the ⓘ next to a move to see what it does.</span>
        )}
      </div>
    </div>
  );
}
