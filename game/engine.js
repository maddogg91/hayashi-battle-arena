import { loadRoster } from "../data/rosterLoader.js";

const MAX_HP = 100;
const START_SP = 25;
const MAX_SP = 100;
const SP_GAIN_PER_ACTION = 5;

// Every character always has this available regardless of SP or the CSV
// moveset, so a unit that can't afford any of its real skills yet still
// has a legal action — this is what keeps the SP economy from softlocking
// a match instead of a cooldown-based fallback. Resting instead of
// attacking grants a bonus 10 SP on top of the usual +5 everyone gets
// whenever any action resolves.
const REST = {
  key: "rest",
  label: "Rest",
  cost: 0,
  target: "self",
  desc: "Do nothing this turn to recover an extra 10 SP (on top of the usual +5 everyone gains).",
  actions: [{ kind: "spgain", amount: 10, target: "self" }],
};

const games = {};            // roomId -> game
let cache = loadRoster();    // { chars, movesByChar, dialogueRows }

// --- utilities ---
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function newEffects() { return { stun:0, bind:0, burn:0, shield:0, reflect:0, invuln:0, charm:0, immune:0 }; }
function addEffect(f, k, turns) { f.effects[k] = Math.max(f.effects[k], turns); }
function tickEffects(f) {
  for (const k of Object.keys(f.effects)) if (f.effects[k] > 0) f.effects[k] -= 1;
  f.mods = f.mods.filter(m => (--m.turns) > 0);
  // Temporary "modes" (e.g. Kimura Special, Arahabaki, Intangible Flames)
  // count down the same way and drop off once expired.
  if (f.modes) {
    for (const name of Object.keys(f.modes)) {
      const m = f.modes[name];
      if (!m) continue;
      m.turns -= 1;
      if (m.turns <= 0) delete f.modes[name];
    }
  }
}
// A unit with an active mode flagged `untargetable` (e.g. Maako's
// Intangible Flames) can't be selected as an enemy target.
function hasUntargetableMode(u) {
  const modes = u.modes || {};
  return Object.values(modes).some(m => m && m.turns > 0 && m.untargetable);
}
// A mode can carry a chance to dodge incoming attacks entirely (e.g.
// Kairu's Imbue with Light). Multiple active modes with a dodge chance
// use the highest one.
function dodgeChanceOf(u) {
  const modes = u.modes || {};
  return Object.values(modes).reduce((max, m) => (m && m.turns > 0 && m.dodgeChance > max ? m.dodgeChance : max), 0);
}
// Multiplicative outgoing-damage bonus from active modes (e.g. Ben's Fist of
// the King, Paul's Strategize, Kaitsu's Self-Proclamation). Multiple active
// sources stack multiplicatively.
function dmgMultOf(u) {
  const modes = u.modes || {};
  return Object.values(modes).reduce((mult, m) => (m && m.turns > 0 && m.dmgMult ? mult * m.dmgMult : mult), 1);
}
// A mode flagged `trueStrike` (e.g. Kaitsu's Steady Aim) lets its owner's
// attacks bypass untargetable modes and invulnerability entirely.
function hasTrueStrikeMode(u) {
  const modes = u.modes || {};
  return Object.values(modes).some(m => m && m.turns > 0 && m.trueStrike);
}
function statWithMods(base, mods, key) {
  return Math.max(0, base + mods.filter(m => m.stat === key).reduce((s,m)=>s+m.amount,0));
}
// Characters no longer carry base ATK/DEF — those only exist as temporary
// mods granted by skills (e.g. "+2 ATK (2 turns)"), starting from 0. SPD
// still has a base value and is used purely to seed each round's turn order.
function effStats(f) {
  return {
    atk: statWithMods(0, f.mods, "atk"),
    def: statWithMods(0, f.mods, "def"),
    spd: statWithMods(f.spd, f.mods, "spd"),
  };
}

// --- damage/resolve helpers ---
function hitWithIgnore(attacker, defender, addBase, ignoreFrac=0) {
  const a = effStats(attacker).atk;
  const d = Math.max(0, Math.floor(effStats(defender).def * (1 - (ignoreFrac||0))));
  return Math.max(5, Math.floor(addBase + a - d));
}
function applyDamage(attacker, defender, raw, opts = {}) {
  let dmg = raw;
  const notes = [];
  const dodge = dodgeChanceOf(defender);
  if (dodge > 0 && Math.random() < dodge) {
    notes.push(`${defender.name} dodges the attack!`);
    return { dmg: 0, notes };
  }
  if (defender.effects.invuln > 0 && !opts.trueStrike) {
    notes.push(`${defender.name} is invulnerable and takes no damage.`);
    return { dmg: 0, notes };
  }
  // Persistent incoming-damage-reduction stacks (Kenshin's Rock Armor,
  // Paul's Drone stacks): each named stack type reduces damage by a flat
  // percent per stack, distinct from (and stacked on top of) the shield
  // effect below.
  const ARMOR_STACK_PCT = { rockarmor: 0.25, dronestack: 0.25 };
  let armorReduction = 0;
  for (const [name, pct] of Object.entries(ARMOR_STACK_PCT)) {
    armorReduction += ((defender.stacks && defender.stacks[name]) || 0) * pct;
  }
  if (armorReduction > 0) {
    const reduced = Math.max(1, Math.floor(dmg * (1 - Math.min(0.9, armorReduction))));
    notes.push(`${defender.name}'s armor absorbs some damage (−${dmg - reduced}).`);
    dmg = reduced;
  }
  if (!opts.unguardable && defender.effects.shield > 0) {
    const reduced = Math.max(1, Math.floor(dmg * 0.5));
    notes.push(`${defender.name} is shielded (−${dmg - reduced}).`);
    dmg = reduced;
  }
  defender.hp = clamp(defender.hp - dmg, 0, MAX_HP);
  if (defender.effects.reflect > 0 && dmg > 0) {
    const refl = Math.max(1, Math.floor(dmg * 0.5));
    attacker.hp = clamp(attacker.hp - refl, 0, MAX_HP);
    notes.push(`${defender.name} reflects ${refl} to ${attacker.name}.`);
  }
  return { dmg, notes };
}

const EFFECT_LABEL = { stun: "Stun", bind: "Bind", burn: "Burn", shield: "a Shield", reflect: "Reflect", invuln: "Invulnerability", charm: "Charm" };
const STAT_LABEL = { atk: "ATK", def: "DEF", spd: "SPD", spregen: "SP Regen" };

// --- turn order ---
function everyone(game) { return ["A","B"].flatMap(r => game.teams[r].map((u,i)=>({role:r,i,u}))); }

// Fisher-Yates, used to coin-flip units that are tied on speed rather than
// always favoring one team or roster slot.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every living unit on both sides acts exactly once per round, in a single
// queue ordered purely by current effective speed — highest first,
// interleaving both players' units freely rather than taking turns by
// team. Units tied on speed are randomly ordered among themselves (a fresh
// coin flip each round, since a tie can only ever involve 2+ units, this
// generalizes to a shuffle of the whole tied group). Speed only ever
// decides ordering now — it no longer gates whether a unit gets to act.
function computeRoundOrder(game) {
  const living = everyone(game).filter(x => x.u.hp > 0);
  const bySpeed = new Map();
  for (const x of living) {
    const spd = effStats(x.u).spd;
    if (!bySpeed.has(spd)) bySpeed.set(spd, []);
    bySpeed.get(spd).push(x);
  }
  const speedsDesc = [...bySpeed.keys()].sort((a, b) => b - a);
  const order = [];
  for (const spd of speedsDesc) order.push(...shuffle(bySpeed.get(spd)));
  return order.map(({ role, i }) => ({ role, i }));
}
function startNewRound(game) {
  game.round = (game.round || 0) + 1;
  game.order = computeRoundOrder(game);
  game.pos = 0;
  if (game.order.length) game.log.push(`— Round ${game.round} —`);
}

// --- win/turn ---
function checkWin(game) {
  const aAlive = game.teams.A.some(c=>c.hp>0);
  const bAlive = game.teams.B.some(c=>c.hp>0);
  if (!aAlive || !bAlive) {
    game.over = true;
    game.turn = null;
    const winner = aAlive ? "A" : "B";
    game.log.push(`🏆 Team ${winner} wins!`);
  }
}
// Bind still deterministically prevents acting. Stun no longer does — see
// beginTurn(), which coin-flips a stunned unit's own turn instead.
function canAct(u) { return u.hp>0 && u.effects.bind<=0; }
function startTurnUpkeep(u, game) {
  if (u.effects.burn > 0) {
    const burnDmg = 6;
    u.hp = clamp(u.hp - burnDmg, 0, MAX_HP);
    game.log.push(`${u.name} suffers ${burnDmg} burn damage.`);
  }
  // Modes like Shou's Arahabaki carry a self-damage-per-turn cost for as
  // long as they're active.
  if (u.modes) {
    for (const [name, m] of Object.entries(u.modes)) {
      if (m && m.turns > 0 && m.selfDamage > 0) {
        u.hp = clamp(u.hp - m.selfDamage, 0, MAX_HP);
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        game.log.push(`${u.name} takes ${m.selfDamage} damage from ${label}.`);
      }
    }
  }
  // Sendara's Warrior Spirit: reuses the stat-mod list (which already
  // supports multiple independently-expiring stacked entries) for a
  // per-turn SP grant instead of an atk/def/spd bonus.
  const regen = (u.mods || []).filter(m => m.stat === "spregen").reduce((s, m) => s + m.amount, 0);
  if (regen > 0 && u.hp > 0) {
    u.sp = clamp(u.sp + regen, 0, MAX_SP);
    game.log.push(`${u.name} gains ${regen} bonus SP from Warrior Spirit.`);
  }
}

// Advances game.actor to the next unit able to act, running upkeep and
// auto-skipping anyone stunned/bound/dead along the way (starting new
// rounds as needed) so the game never waits on a client that has no
// legal move to send.
function beginTurn(game) {
  while (!game.over) {
    if (!game.order || game.pos >= game.order.length) {
      startNewRound(game);
      if (!game.order.length) return; // no living units — checkWin should already have ended the game
    }

    const { role, i } = game.order[game.pos];
    const unit = game.teams[role][i];

    if (unit.hp <= 0) { game.pos += 1; continue; }

    startTurnUpkeep(unit, game);
    checkWin(game);
    if (game.over) return;
    if (unit.hp <= 0) { game.pos += 1; continue; }

    // A stunned unit isn't automatically skipped anymore — each of their
    // own turns while stunned is a fresh 50/50 coin flip between powering
    // through (acts as normal) and being too stunned to act (turn
    // skipped), rather than a guaranteed skip for the whole duration.
    let actionable = canAct(unit);
    let stunRoll = null;
    if (actionable && unit.effects.stun > 0) {
      stunRoll = Math.random() < 0.5;
      actionable = stunRoll;
    }
    if (actionable) {
      if (stunRoll) {
        game.log.push(`💪 ${unit.name} powers through the stun and is ready to act!`);
      } else {
        game.log.push(`🎯 ${unit.name} is ready to act.`);
      }
    } else if (unit.effects.bind > 0) {
      game.log.push(`${unit.name} is bound and cannot act — turn skipped.`);
    } else {
      game.log.push(`😵 ${unit.name} is too stunned to act — turn skipped.`);
    }

    // It's this unit's own turn: their personal status effects and stat
    // mods count down by one now, whether they act or are skipped.
    tickEffects(unit);

    if (actionable) {
      // `bonusUsed` tracks Liara's Quick Step: a unit with an active
      // `extraAction` mode gets a second action within this same turn slot
      // before play passes on — see handleMove().
      game.actor = { role, i, bonusUsed: false };
      game.turn = role;
      return;
    }

    game.pos += 1;
  }
}

// --- target resolution ---
function pickTargets(game, actorRole, spec, target) {
  const my = game.teams[actorRole];
  const allFoe = game.teams[actorRole === "A" ? "B" : "A"];
  // A trueStrike mode (e.g. Kaitsu's Steady Aim) lets its owner target
  // otherwise-untargetable (intangible) enemies with full effectiveness.
  const bypassUntargetable = hasTrueStrikeMode(my[game.actor.i]);
  const legalFoe = allFoe.filter(x => x.hp > 0 && (bypassUntargetable || !hasUntargetableMode(x)));
  switch (spec) {
    case "self":      return [ my[game.actor.i] ];
    case "ally":      return [ target ? my[target.index] : my[game.actor.i] ];
    case "enemy": {
      if (target) {
        const pool = target.role === actorRole ? my : allFoe;
        const t = pool[target.index];
        if (!t || t.hp <= 0) return [];
        if (pool === allFoe && !bypassUntargetable && hasUntargetableMode(t)) return [];
        return [t];
      }
      return legalFoe.length ? [legalFoe[0]] : [];
    }
    case "aoe_enemy": return legalFoe;
    case "aoe_charmed_enemy": return legalFoe.filter(x => x.effects.charm > 0);
    case "aoe_team":  return my.filter(x=>x.hp>0);
    case "aoe_all":   return [...my.filter(x=>x.hp>0), ...legalFoe];
    default:          return [];
  }
}

// Resolves a step-level `target` override (e.g. a damage step on an
// aoe_enemy skill that also splashes the caster's own team) independently
// of the skill's main declared target/targets. Returns null when `scope`
// isn't one of these keywords, so callers fall back to the main targets.
function resolveScopeTargets(game, actor, scope) {
  const role = game.actor.role;
  const my = game.teams[role];
  const foe = game.teams[role === "A" ? "B" : "A"];
  switch (scope) {
    case "self":            return [actor];
    case "aoe_team":        return my.filter(x => x.hp > 0);
    case "aoe_team_others": return my.filter(x => x.hp > 0 && x !== actor);
    case "aoe_enemy":       return foe.filter(x => x.hp > 0 && !hasUntargetableMode(x));
    case "aoe_charmed_enemy": return foe.filter(x => x.hp > 0 && !hasUntargetableMode(x) && x.effects.charm > 0);
    default:                return null;
  }
}

// --- CSV action DSL executor ---
function resolveActions(game, actor, targets, actions, log, skillLabel) {
  const arr = Array.isArray(targets) ? targets : [targets];
  const each = (fn) => arr.forEach(fn);

  for (const step of actions) {
    const kind = step.kind;
    if (kind === "damage") {
      let base = Number(step.base || 0);
      if (step.stackBonus) {
        const { name, per } = step.stackBonus;
        const count = (actor.stacks && actor.stacks[name]) || 0;
        base += Number(per || 0) * count;
      }
      if (step.comboBonus) {
        base += Number(step.comboBonus.per || 0) * (actor.comboCount || 0);
      }
      const ignore = Number(step.ignore || 0);
      const stepTargets = (step.target && resolveScopeTargets(game, actor, step.target)) || arr;
      const mult = dmgMultOf(actor);
      const trueStrike = hasTrueStrikeMode(actor);
      stepTargets.forEach(t => {
        // Per-target conditional bonus (e.g. Tana's Heatseeker/Infernal
        // Outburst hitting harder against already-burned targets).
        let b = base;
        if (step.targetBonus && t.effects?.[step.targetBonus.effect] > 0) {
          b += Number(step.targetBonus.amount || 0);
        }
        b = Math.floor(b * mult);
        const { dmg, notes } = applyDamage(actor, t, hitWithIgnore(actor, t, b, ignore), { unguardable: !!step.unguardable, trueStrike });
        log.push(`${actor.name} attacks ${t.name} with ${skillLabel}, dealing ${dmg} damage.`, ...notes);
        if (step.clearEffect) t.effects[step.clearEffect] = 0;
        // A guarded target (Liara's Ronin's Revenge, Ben's Warrior Instinct)
        // triggers its protector's retaliation the moment an enemy attack
        // lands on them, whether or not that hit actually dealt damage.
        if (t.guard && t.guard.owner && t.guard.owner.hp > 0 && t.guard.role !== game.actor.role) {
          const guard = t.guard;
          t.guard = null;
          const { dmg: retDmg, notes: retNotes } = applyDamage(guard.owner, actor, hitWithIgnore(guard.owner, actor, guard.dmg, 0), { unguardable: true });
          log.push(`${guard.owner.name} avenges ${t.name}, dealing ${retDmg} damage to ${actor.name}.`, ...retNotes);
        }
      });
      if (step.consumeStack) {
        actor.stacks = actor.stacks || {};
        actor.stacks[step.consumeStack] = 0;
      }
    } else if (kind === "heal") {
      const amt = Number(step.amount || 0);
      const scope = step.target || "self";
      if (scope === "self") {
        actor.hp = clamp(actor.hp + amt, 0, MAX_HP);
        log.push(`${actor.name} heals for ${amt} HP with ${skillLabel}.`);
      } else if (scope === "ally") {
        arr.forEach(t => {
          t.hp = clamp(t.hp + amt, 0, MAX_HP);
          log.push(`${actor.name} heals ${t.name} for ${amt} HP with ${skillLabel}.`);
        });
      } else if (scope === "aoe_team") {
        const myTeam = game.teams[game.actor.role].filter(x=>x.hp>0);
        myTeam.forEach(x => x.hp = clamp(x.hp + amt, 0, MAX_HP));
        log.push(`${actor.name}'s team heals for ${amt} HP with ${skillLabel}.`);
      }
    } else if (kind === "effect") {
      const type = step.type; // stun|bind|burn|shield|reflect|invuln|charm|immune
      const turns = Number(step.turns || 1);
      const scope = step.target; // optional override like heal
      // Optional proc chance (0-1); status effects without one always land,
      // matching every effect step that shipped before this field existed.
      const chance = step.chance != null ? Number(step.chance) : 1;
      const label = EFFECT_LABEL[type] || type;
      // A target with an active Immunity (e.g. Ben's Warrior Instinct)
      // resists incoming negative status effects entirely.
      const NEGATIVE_STATUS = ["stun", "bind", "burn", "charm"];
      if (!scope) {
        each(t => {
          if (NEGATIVE_STATUS.includes(type) && t.effects.immune > 0) {
            log.push(`${t.name} is immune to status effects and resists ${label}.`);
            return;
          }
          if (Math.random() < chance) {
            addEffect(t, type, turns);
            log.push(`${t.name} is afflicted with ${label} (${turns}) by ${skillLabel}.`);
          }
          if (step.clearEffect) t.effects[step.clearEffect] = 0;
        });
      } else if (scope === "self") {
        if (Math.random() < chance) {
          addEffect(actor, type, turns);
          log.push(`${actor.name} gains ${label} (${turns}) from ${skillLabel}.`);
        }
        if (step.clearEffect) actor.effects[step.clearEffect] = 0;
      } else if (scope === "aoe_team") {
        game.teams[game.actor.role].forEach(t => {
          if (Math.random() < chance) {
            addEffect(t, type, turns);
            log.push(`${t.name} gains ${label} (${turns}) from ${skillLabel}.`);
          }
          if (step.clearEffect) t.effects[step.clearEffect] = 0;
        });
      }
    } else if (kind === "cleanse") {
      // Removes negative status effects (not buffs like shield/reflect).
      const NEGATIVE = ["stun", "bind", "burn"];
      const stepTargets = (step.target && resolveScopeTargets(game, actor, step.target)) || arr;
      stepTargets.forEach(t => {
        const hadAny = NEGATIVE.some(k => t.effects[k] > 0);
        NEGATIVE.forEach(k => { t.effects[k] = 0; });
        if (hadAny) log.push(`${t.name}'s negative status effects are cleansed by ${skillLabel}.`);
      });
    } else if (kind === "spgain") {
      const amt = Number(step.amount || 0);
      const stepTargets = (step.target && resolveScopeTargets(game, actor, step.target)) || arr;
      stepTargets.forEach(t => {
        if (t.hp <= 0) return;
        t.sp = clamp(t.sp + amt, 0, MAX_SP);
        log.push(`${t.name} gains ${amt} SP from ${skillLabel}.`);
      });
    } else if (kind === "mode") {
      // Sets a temporary named state on the target (e.g. Kimura Special,
      // Arahabaki, Intangible Flames — nearly always the caster themself,
      // but Paul's Strategize sets one on a chosen ally instead) that other
      // skills can key off of via `altIf`/`extraIf`/`requires.mode`, and
      // pickTargets/upkeep/damage math can read directly (untargetable,
      // selfDamage, dodgeChance, dmgMult, trueStrike).
      const name = step.name;
      const turns = Number(step.turns || 1);
      const stepTargets = (step.target && resolveScopeTargets(game, actor, step.target)) || arr;
      stepTargets.forEach(t => {
        t.modes = t.modes || {};
        t.modes[name] = {
          turns,
          selfDamage: Number(step.selfDamage || 0),
          untargetable: !!step.untargetable,
          dodgeChance: Number(step.dodgeChance || 0),
          dmgMult: step.dmgMult != null ? Number(step.dmgMult) : undefined,
          trueStrike: !!step.trueStrike,
          extraAction: !!step.extraAction,
        };
        log.push(`${t.name} activates ${skillLabel}.`);
      });
    } else if (kind === "modeClear") {
      const name = step.name;
      if (actor.modes && actor.modes[name]) {
        delete actor.modes[name];
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        log.push(`${actor.name}'s ${label} mode ends.`);
      }
    } else if (kind === "stack") {
      // Named, capped counters on the actor (e.g. Arisa's Creature Summon)
      // that later damage steps can scale off of via `stackBonus`.
      const name = step.name;
      const amount = Number(step.amount || 1);
      const max = step.max != null ? Number(step.max) : Infinity;
      actor.stacks = actor.stacks || {};
      const next = clamp((actor.stacks[name] || 0) + amount, 0, max);
      actor.stacks[name] = next;
      log.push(`${actor.name} gains a ${skillLabel} stack (${next}${max !== Infinity ? "/" + max : ""}).`);
    } else if (kind === "mod") {
      const { stat, amount, turns } = step;
      const amt = Number(amount || 0);
      const trn = Number(turns || 1);
      const chip = { stat, amount: amt, turns: trn };
      const label = STAT_LABEL[stat] || stat;
      each(t => {
        t.mods.push({ ...chip });
        log.push(`${t.name}'s ${label} ${amt >= 0 ? "rises" : "falls"} by ${Math.abs(amt)} (${trn}) from ${skillLabel}.`);
      });
    } else if (kind === "recoil") {
      const amt = Number(step.amount || 0);
      actor.hp = clamp(actor.hp - amt, 0, MAX_HP);
      log.push(`${actor.name} takes ${amt} recoil damage from ${skillLabel}.`);
    } else if (kind === "guard") {
      // Vows to avenge a target (Liara's Ronin's Revenge protecting an
      // ally, Ben's Warrior Instinct protecting himself): the next enemy
      // attack that lands on them triggers a retaliation strike, handled
      // inline in the "damage" step above.
      const dmg = Number(step.dmg || step.amount || 0);
      each(t => {
        t.guard = { owner: actor, role: game.actor.role, dmg };
        log.push(`${actor.name} vows to avenge ${t.name} with ${skillLabel}.`);
      });
    }
  }
}

// --- Dialogue picker from CSV ---
function pickDialogue(teamA, teamB) {
  // Use first picked of each side as the “stars”
  const a = teamA[0]?.name;
  const b = teamB[0]?.name;
  const key1 = `${a}|${b}`;
  const key2 = `${b}|${a}`;

  // Prefer the most specific dialogue available; fall back to a generic
  // narrator intro so every matchup gets a cutscene, not just Shou vs Jett.
  const specific = cache.dialogueRows.filter(r => r.pair === key1 || r.pair === key2);
  const halfMatch = cache.dialogueRows.filter(r => r.pair === `${a}|*` || r.pair === `*|${b}`);
  const generic = cache.dialogueRows.filter(r => r.pair === "*|*");
  const rows = (specific.length ? specific : halfMatch.length ? halfMatch : generic)
    .sort((x,y)=> x.order - y.order);

  // Normalize speaker side
  const seq = rows.map(r => ({
    speaker: r.speaker,
    line: r.line,
    side: r.speaker === a ? "A" : (r.speaker === b ? "B" : "N"),
  }));
  return seq.slice(0, 12); // keep it short
}

// --- Init from CSV ---
export function initGame(selections, roomId, names = {}) {
  // hydrate from characters.csv
  const charMap = new Map(cache.chars.map(c => [c.name, c]));

  const hydrateTeam = (arr) => arr.map((pick, idx) => {
    const base = charMap.get(pick.name) || pick; // prefer CSV row
    const moves = (cache.movesByChar[base.name] || []).slice(0, 4);
    return {
      name: base.name,
      type: base.type,
      img: base.img || "🎭",
      description: base.description || "",
      index: idx,
      hp: MAX_HP,
      spd: pick.spd ?? base.spd,
      sp: START_SP,
      effects: newEffects(),
      mods: [],
      stacks: {},
      modes: {},
      comboKey: null,
      comboCount: 0,
      skills: [...moves, REST],
    };
  });

  const teamA = hydrateTeam(selections.A);
  const teamB = hydrateTeam(selections.B);

  // If both players picked the same character, tag each with the owning
  // player's name so they're distinguishable in the UI and battle log.
  const namesA = new Set(teamA.map(u => u.name));
  const dupes = new Set(teamB.filter(u => namesA.has(u.name)).map(u => u.name));
  if (dupes.size) {
    teamA.forEach(u => { if (dupes.has(u.name)) u.name = `${u.name} (${names.A || "Player A"})`; });
    teamB.forEach(u => { if (dupes.has(u.name)) u.name = `${u.name} (${names.B || "Player B"})`; });
  }

  const game = {
    teams: { A: teamA, B: teamB },
    log: ["⚔️ The 5v5 battle begins at Hayashi Academy!"],
    over: false,
    turn: null,
    actor: null,
    round: 0,
    order: null,
    pos: 0,
    cutscene: pickDialogue(teamA, teamB), // <— add cutscene lines here
  };

  beginTurn(game);
  games[roomId] = game;
  return game;
}

// A skill can gate itself behind a stack count, an active mode, or having
// at least one other living ally (e.g. Arisa's Unleash the Beast, Maako's
// Flames of Reckoning, Shou's Self Preservation). Absent for every skill
// that predates this, so they're always usable as before.
function requirementsMet(unit, game, requires) {
  if (!requires) return true;
  if (requires.stacks) {
    const { name, min } = requires.stacks;
    if ((unit.stacks?.[name] || 0) < min) return false;
  }
  if (requires.mode) {
    if (!(unit.modes?.[requires.mode]?.turns > 0)) return false;
  }
  if (requires.alliesAlive) {
    const myTeam = game.teams[game.actor.role];
    const others = myTeam.filter(x => x !== unit && x.hp > 0);
    if (others.length === 0) return false;
  }
  // Mutual-exclusion gate (e.g. Kenshin can't stack Lightning Charge while
  // Rock Armor is stacked, or vice versa).
  if (requires.stacksZero) {
    if ((unit.stacks?.[requires.stacksZero] || 0) > 0) return false;
  }
  // Blocks a move if it was preceded by a specific other move on this
  // unit's last turn (e.g. Sendara can't follow Spear Chuck with
  // Unyielding Barrage). Reads the same comboKey tracking handleMove
  // updates for every move (see below), so this always reflects the
  // *previous* move — the update for the move being checked right now
  // hasn't happened yet.
  if (requires.notAfterMove) {
    if (unit.comboKey === requires.notAfterMove) return false;
  }
  // Blocks re-use while a named mode the unit itself set is still active
  // (e.g. Ben can't recast Ki Control while its own buff is still ticking).
  if (requires.modeZero) {
    if (unit.modes?.[requires.modeZero]?.turns > 0) return false;
  }
  return true;
}

// --- Turn handler (skills only) ---
export function handleMove(roomId, playerRole, payload) {
  const game = games[roomId];
  if (!game || game.over) return game;

  const actor = game.actor;
  if (!actor || actor.role !== playerRole) return game;

  const me = game.teams[actor.role][actor.i];
  // beginTurn() guarantees game.actor always points at a unit that can
  // currently act, so this is just a defensive guard.
  if (!canAct(me)) return game;

  const { move, target } = typeof payload === "string" ? { move: payload, target: null } : payload;
  const skill = (me.skills || []).find(s => s.key === move);
  if (!skill) return game;
  if (!requirementsMet(me, game, skill.requires)) return game;

  const cost = Number(skill.cost || 0);
  if (me.sp < cost) return game;

  // Some skills change entirely while a mode is active (Jett's Kimura
  // Special, Shou's Arahabaki, Maako's Intangible Flames) — a different
  // target spec/action list (altTarget/altActions), or extra bonus actions
  // layered on top of the normal ones (Maako's Fire Wall).
  const useAltMode = !!(skill.altIf && me.modes?.[skill.altIf]?.turns > 0);
  const useExtra = !!(skill.extraIf && me.modes?.[skill.extraIf]?.turns > 0);
  const targetSpec = (useAltMode && skill.altTarget) || skill.target;

  const targets = pickTargets(game, actor.role, targetSpec, target);
  if (!targets || targets.length === 0) return game;

  // Some skills branch off the *target's* status instead of the actor's own
  // (e.g. Sai's Ball & Chain hits harder if the target is already bound).
  const useAltTarget = !!(skill.altIfTargetEffect && targets.some(t => t.effects?.[skill.altIfTargetEffect] > 0));
  const useAlt = useAltMode || useAltTarget;

  let actions = useAlt ? (skill.altActions || skill.actions || []) : (skill.actions || []);
  if (useExtra && skill.extraActions) actions = [...actions, ...skill.extraActions];
  // A skill can layer on multiple independent bonus effects, each gated by
  // its own condition (e.g. Kenshin's Elemental Barrage: burn if Lightning
  // Charge is stacked, stun if Rock Armor is stacked instead).
  if (Array.isArray(skill.extras)) {
    for (const extra of skill.extras) {
      const met = extra.ifMode
        ? me.modes?.[extra.ifMode]?.turns > 0
        : extra.ifStack
        ? (me.stacks?.[extra.ifStack.name] || 0) >= (extra.ifStack.min ?? 1)
        : false;
      if (met && extra.actions) actions = [...actions, ...extra.actions];
    }
  }

  // Generic "same move used on consecutive turns" tracking. Only skills
  // that opt in via `comboKey` build/reset a streak (e.g. Sendara's Spear
  // Chuck); any other move resets it to null, so `requires.notAfterMove`
  // and `comboBonus` both read a streak that only survives literal
  // back-to-back uses of the same flagged move.
  if (skill.comboKey) {
    me.comboCount = me.comboKey === skill.comboKey ? (me.comboCount || 0) + 1 : 0;
    me.comboKey = skill.comboKey;
  } else {
    me.comboKey = null;
    me.comboCount = 0;
  }

  const log = [];
  resolveActions(game, me, targets, actions, log, skill.label);
  me.sp = clamp(me.sp - cost, 0, MAX_SP);

  if (Array.isArray(skill.clearStacksAfter)) {
    me.stacks = me.stacks || {};
    for (const name of skill.clearStacksAfter) me.stacks[name] = 0;
  }

  game.log.push(...log);

  // Every resolved action feeds SP back to everyone still standing on
  // either side — slower units who haven't gone yet this round bank more
  // of it before their turn comes up, offsetting their lower speed.
  everyone(game).forEach(({ u }) => { if (u.hp > 0) u.sp = clamp(u.sp + SP_GAIN_PER_ACTION, 0, MAX_SP); });

  checkWin(game);
  if (!game.over) {
    // Liara's Quick Step grants a second action within the same turn slot:
    // if it's still active and hasn't already granted its bonus action this
    // slot, replay this same actor instead of advancing to the next unit.
    const bonusActive = !!(me.modes?.quickstep?.turns > 0 && me.modes.quickstep.extraAction);
    if (bonusActive && !actor.bonusUsed && canAct(me)) {
      actor.bonusUsed = true;
    } else {
      game.pos += 1;
      beginTurn(game);
    }
  }

  return { ...game };
}

export function getGame(roomId) { return games[roomId]; }

export function getChars() { return cache.chars; }

export function getMovesByChar() { return cache.movesByChar; }

// Hot-reload endpoint utility
export function reloadData() {
  cache = loadRoster();
  return { ok: true, counts: { chars: cache.chars.length, dialogues: cache.dialogueRows.length, movers: Object.keys(cache.movesByChar).length } };
}
