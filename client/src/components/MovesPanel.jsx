import { useState } from "react";
import { stackLabel, modeLabel } from "../utils/statusLabels";

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
      className="w-6 h-6 shrink-0 rounded-full bg-panel-line hover:bg-panel-line/70 text-[11px] font-bold text-slate-200 flex items-center justify-center transition"
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
        className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold transition
          ${isDisabled
            ? "bg-panel-line/60 text-slate-500 cursor-not-allowed"
            : isPending
            ? "bg-gold-400 text-ink-950 ring-2 ring-gold-300 animate-pulse"
            : "bg-panel-raised hover:bg-panel-line text-slate-100 border border-panel-line"}
        `}
      >
        {skill.label}
        <span className="ml-1.5 text-xs opacity-70">{skill.cost || 0} SP</span>
      </button>
      <InfoIcon skill={skill} onPreview={onPreview} onClearPreview={onClearPreview} />
    </div>
  );
}

export default function MovesPanel({
  myUnit = {},
  myTeam = [],
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
  const stacks = myUnit.stacks || {};
  const modes = myUnit.modes || {};
  const skills = myUnit.skills || [];

  // Stun no longer automatically blocks acting — the server only ever
  // hands this unit the turn (canAct=true) if they're not stunned or won
  // this turn's coin flip to power through it, so `effects.stun` alone
  // isn't a reason to grey out the panel anymore. Bind still is, since
  // it's a guaranteed skip.
  const cannotAct = !canAct || effects.bind > 0;

  const needsTargetWord = (t) => {
    if (!t || t === "none") return "No target";
    if (t === "self") return "Self";
    if (t === "ally") return "Ally";
    if (t === "enemy") return "Enemy";
    if (t === "aoe_team") return "All Allies";
    if (t === "aoe_enemy") return "All Enemies";
    if (t === "aoe_charmed_enemy") return "Charmed Enemies";
    if (t === "aoe_all") return "Everyone";
    return t;
  };

  const canAfford = (skill) => sp >= (skill.cost || 0);
  // Some moves are gated behind stacks, an active mode, or having a living
  // ally (Arisa's Unleash the Beast, Maako's Flames of Reckoning, Shou's
  // Self Preservation) — mirrors requirementsMet() in game/engine.js so the
  // button visibly greys out instead of silently no-op'ing on click.
  const meetsRequires = (skill) => {
    const req = skill.requires;
    if (!req) return true;
    if (req.stacks && (stacks[req.stacks.name] || 0) < req.stacks.min) return false;
    if (req.mode && !(modes[req.mode]?.turns > 0)) return false;
    if (req.alliesAlive) {
      const others = myTeam.filter((u) => u !== myUnit && u.hp > 0);
      if (others.length === 0) return false;
    }
    if (req.stacksZero && (stacks[req.stacksZero] || 0) > 0) return false;
    if (req.notAfterMove && myUnit.comboKey === req.notAfterMove) return false;
    if (req.modeZero && modes[req.modeZero]?.turns > 0) return false;
    return true;
  };
  const disabled = (skill) => {
    if (cannotAct) return true;
    if (!canAfford(skill)) return true;
    return !meetsRequires(skill);
  };

  const activeSkill = skills.find((s) => s.key === (pendingMove?.key || previewKey));
  // Several skills read entirely differently while a mode is active (Jett's
  // Kimura Special, Shou's Arahabaki, Maako's Intangible Flames/Fire Wall) —
  // show the description that actually matches what pressing it will do.
  const activeSkillDesc = (() => {
    if (!activeSkill) return "";
    const useAlt = activeSkill.altIf && modes[activeSkill.altIf]?.turns > 0;
    const useExtra = activeSkill.extraIf && modes[activeSkill.extraIf]?.turns > 0;
    let d = useAlt && activeSkill.altDesc ? activeSkill.altDesc : (activeSkill.desc || "No description available.");
    if (useExtra && activeSkill.extraDesc) d += ` ${activeSkill.extraDesc}`;
    return d;
  })();

  const handlePreview = (key) => setPreviewKey(key);
  const handleClearPreview = (key) => {
    setPreviewKey((k) => (k === key ? null : k));
  };

  return (
    <div className="flex flex-col items-center gap-3 mt-6">
      <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
        <span className="px-2.5 py-1 bg-sp-500/15 border border-sp-500/40 rounded-full font-semibold text-sp-400">
          SP {sp}/100
        </span>
        {effects.stun > 0 && <span className="px-2.5 py-1 bg-hp-500/20 text-hp-400 rounded-full">Stunned {effects.stun}</span>}
        {effects.bind > 0 && <span className="px-2.5 py-1 bg-fuchsia-500/20 text-fuchsia-300 rounded-full">Bound {effects.bind}</span>}
        {effects.burn > 0 && <span className="px-2.5 py-1 bg-burn-400/20 text-burn-400 rounded-full">Burn {effects.burn}</span>}
        {effects.shield > 0 && <span className="px-2.5 py-1 bg-teamB-500/20 text-teamB-400 rounded-full">Shield {effects.shield}</span>}
        {effects.reflect > 0 && <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full">Reflect {effects.reflect}</span>}
        {effects.invuln > 0 && <span className="px-2.5 py-1 bg-sp-500/20 text-sp-400 rounded-full">Invulnerable {effects.invuln}</span>}
        {effects.charm > 0 && <span className="px-2.5 py-1 bg-pink-500/20 text-pink-300 rounded-full">Charmed</span>}
        {effects.immune > 0 && <span className="px-2.5 py-1 bg-teamA-500/20 text-teamA-400 rounded-full">Immune {effects.immune}</span>}
        {Object.entries(stacks).filter(([, v]) => v > 0).map(([name, v]) => (
          <span key={name} className="px-2.5 py-1 bg-gold-500/20 text-gold-300 rounded-full">{stackLabel(name)} x{v}</span>
        ))}
        {Object.entries(modes).filter(([, m]) => m?.turns > 0).map(([name, m]) => (
          <span key={name} className="px-2.5 py-1 bg-teamB-500/15 text-teamB-400 rounded-full">{modeLabel(name)} ({m.turns})</span>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2.5 flex-wrap px-2">
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
      <div className="w-full max-w-xl panel px-4 py-3 text-sm text-slate-200 min-h-[3.75rem]">
        {activeSkill ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="font-semibold text-gold-300">{activeSkill.label}</span>{" "}
                <span className="text-slate-400">
                  ({needsTargetWord(activeSkill.target)} • {activeSkill.cost || 0} SP)
                </span>
              </span>
              {pendingMove && (
                <div className="flex shrink-0 gap-2">
                  {onCancelPending && (
                    <button
                      onClick={onCancelPending}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-panel-line hover:bg-panel-line/70 transition"
                    >
                      Cancel
                    </button>
                  )}
                  {onConfirm && (
                    <button
                      onClick={onConfirm}
                      disabled={!canConfirm}
                      className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition
                        ${canConfirm
                          ? "bg-teamA-500 hover:bg-teamA-400 text-ink-950"
                          : "bg-panel-line text-slate-500 cursor-not-allowed"}
                      `}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-1">{activeSkillDesc}</div>
            {pendingMove && (
              <div className="mt-1 text-xs text-gold-300">
                {canConfirm
                  ? "Ready to use — press Confirm."
                  : `Choose ${pendingMove.needs === "enemy" ? "an" : "a"} ${needsTargetWord(pendingMove.needs).toLowerCase()} target, then press Confirm.`}
              </div>
            )}
          </>
        ) : (
          <span className="text-slate-400">Tap the ⓘ next to a move to see what it does.</span>
        )}
      </div>
    </div>
  );
}
