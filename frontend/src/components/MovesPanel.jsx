export default function MovesPanel({
  myUnit = {},
  canAct,
  onUse,
}) {
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

  const tooltip = (s) => {
    const base = s.desc || `${needsTargetWord(s.target)} • Cooldown ${s.cd}`;
    return `${s.label} — ${base}`;
  };

  const disabled = (key) => {
    if (cannotAct) return true;
    return (cds[key] || 0) > 0;
  };

  const Btn = ({ skill }) => (
    <button
      key={skill.key}
      onClick={() => onUse(skill.key)}
      disabled={disabled(skill.key)}
      title={tooltip(skill)}
      className={`px-3 py-2 rounded-lg text-sm font-semibold
        ${disabled(skill.key)
          ? "bg-gray-600 cursor-not-allowed"
          : "bg-purple-600 hover:bg-purple-700"}
      `}
    >
      {skill.label}
      {(cds[skill.key] || 0) > 0 ? ` (${cds[skill.key]})` : ""}
    </button>
  );

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
    </div>
  );
}
