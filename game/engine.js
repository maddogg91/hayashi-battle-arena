import { loadRoster } from "../data/rosterLoader.js";

const MAX_HP = 100;
const READY_AP = 100;

const games = {};            // roomId -> game
let cache = loadRoster();    // { chars, movesByChar, dialogueRows }

// --- utilities ---
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function newEffects() { return { stun:0, bind:0, burn:0, shield:0, reflect:0 }; }
function addEffect(f, k, turns) { f.effects[k] = Math.max(f.effects[k], turns); }
function tickEffects(f) {
  for (const k of Object.keys(f.effects)) if (f.effects[k] > 0) f.effects[k] -= 1;
  f.mods = f.mods.filter(m => (--m.turns) > 0);
}
function statWithMods(base, mods, key) {
  return Math.max(0, base + mods.filter(m => m.stat === key).reduce((s,m)=>s+m.amount,0));
}
function effStats(f) { return { atk: statWithMods(f.atk,f.mods,"atk"), def: statWithMods(f.def,f.mods,"def"), spd: statWithMods(f.spd,f.mods,"spd") }; }

// --- damage/resolve helpers ---
function baseHit(attacker, defender) {
  const a = effStats(attacker).atk;
  const d = effStats(defender).def;
  return Math.max(5, a - d);
}
function hitWithIgnore(attacker, defender, addBase, ignoreFrac=0) {
  const a = effStats(attacker).atk;
  const d = Math.max(0, Math.floor(effStats(defender).def * (1 - (ignoreFrac||0))));
  return Math.max(5, Math.floor(addBase + a - d));
}
function applyDamage(attacker, defender, raw) {
  let dmg = raw;
  const notes = [];
  if (defender.effects.shield > 0) {
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

const EFFECT_LABEL = { stun: "Stun", bind: "Bind", burn: "Burn", shield: "a Shield", reflect: "Reflect" };
const STAT_LABEL = { atk: "ATK", def: "DEF", spd: "SPD" };

// --- initiative ---
function everyone(game) { return ["A","B"].flatMap(r => game.teams[r].map((u,i)=>({role:r,i,u}))); }
function nextActor(game) {
  while (true) {
    const ready = everyone(game).filter(x => x.u.hp > 0 && x.u.ap >= READY_AP);
    if (ready.length) {
      ready.sort((a,b)=> (b.u.ap - a.u.ap) || (effStats(b.u).spd - effStats(a.u).spd) || (a.i - b.i));
      return ready[0];
    }
    everyone(game).forEach(x => { if (x.u.hp > 0) x.u.ap += effStats(x.u).spd; });
  }
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
function canAct(u) { return u.hp>0 && u.effects.stun<=0 && u.effects.bind<=0; }
function startTurnUpkeep(u, game) {
  if (u.effects.burn > 0) {
    const burnDmg = 6;
    u.hp = clamp(u.hp - burnDmg, 0, MAX_HP);
    game.log.push(`${u.name} suffers ${burnDmg} burn damage.`);
  }
}
// Cooldowns recover for the whole acting team on any of their turns — that
// pacing is intentional. Status effects/mods are handled separately in
// beginTurn(), once per the *affected* unit's own turn (see below), so a
// freshly-applied 1-turn stun/shield survives until its target's next turn
// instead of being wiped out by whichever side happens to act next.
function endTurn(game, acted) {
  game.teams[acted.role].forEach(p => {
    for (const k of Object.keys(p.cooldowns)) if (p.cooldowns[k] > 0) p.cooldowns[k] -= 1;
  });
}

// Advances game.actor to the next unit able to act, running upkeep and
// auto-skipping anyone stunned/bound/dead along the way so the game never
// waits on a client that has no legal move to send.
function beginTurn(game) {
  while (!game.over) {
    const { role, i } = game.actor;
    const unit = game.teams[role][i];

    startTurnUpkeep(unit, game);
    checkWin(game);
    if (game.over) return;

    if (unit.hp <= 0) {
      unit.ap -= READY_AP;
      game.actor = nextActor(game);
      game.turn = game.actor.role;
      continue;
    }

    const actionable = canAct(unit);
    if (actionable) {
      game.log.push(`🎯 ${unit.name} is ready to act.`);
    } else {
      const reason = unit.effects.stun > 0 ? "stunned" : "bound";
      game.log.push(`${unit.name} is ${reason} and cannot act — turn skipped.`);
    }

    // It's this unit's own turn: their personal status effects and stat
    // mods count down by one now, whether they act or are skipped.
    tickEffects(unit);

    if (actionable) return;

    endTurn(game, { role });
    unit.ap -= READY_AP;
    game.actor = nextActor(game);
    game.turn = game.actor.role;
  }
}

// --- target resolution ---
function pickTargets(game, actorRole, spec, target) {
  const my = game.teams[actorRole];
  const foe = game.teams[actorRole === "A" ? "B" : "A"];
  switch (spec) {
    case "self":      return [ my[game.actor.i] ];
    case "ally":      return [ target ? my[target.index] : my[game.actor.i] ];
    case "enemy":     return [ target ? (target.role === actorRole ? my[target.index] : foe[target.index]) : foe.find(x=>x.hp>0) ].filter(Boolean);
    case "aoe_enemy": return foe.filter(x=>x.hp>0);
    case "aoe_team":  return my.filter(x=>x.hp>0);
    case "aoe_all":   return [...my.filter(x=>x.hp>0), ...foe.filter(x=>x.hp>0)];
    default:          return [];
  }
}

// --- CSV action DSL executor ---
function resolveActions(game, actor, targets, actions, log, skillLabel) {
  const arr = Array.isArray(targets) ? targets : [targets];
  const each = (fn) => arr.forEach(fn);

  for (const step of actions) {
    const kind = step.kind;
    if (kind === "damage") {
      const base = Number(step.base || 0);
      const ignore = Number(step.ignore || 0);
      each(t => {
        const { dmg, notes } = applyDamage(actor, t, hitWithIgnore(actor, t, base, ignore));
        log.push(`${actor.name} attacks ${t.name} with ${skillLabel}, dealing ${dmg} damage.`, ...notes);
      });
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
      const type = step.type; // stun|bind|burn|shield|reflect
      const turns = Number(step.turns || 1);
      const scope = step.target; // optional override like heal
      const label = EFFECT_LABEL[type] || type;
      if (!scope) {
        each(t => {
          addEffect(t, type, turns);
          log.push(`${t.name} is afflicted with ${label} (${turns}) by ${skillLabel}.`);
        });
      } else if (scope === "self") {
        addEffect(actor, type, turns);
        log.push(`${actor.name} gains ${label} (${turns}) from ${skillLabel}.`);
      } else if (scope === "aoe_team") {
        game.teams[game.actor.role].forEach(t => addEffect(t, type, turns));
        log.push(`${actor.name}'s team gains ${label} (${turns}) from ${skillLabel}.`);
      }
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
  // hydrate from characters.csv (keep stats chosen during select if present)
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
      hp: clamp(pick.hp ?? base.hp, 1, MAX_HP),
      atk: pick.atk ?? base.atk,
      def: pick.def ?? base.def,
      spd: pick.spd ?? base.spd,
      cooldowns: Object.fromEntries(moves.map(m => [m.key, 0])),
      effects: newEffects(),
      mods: [],
      ap: 0,
      skills: moves,
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
    cutscene: pickDialogue(teamA, teamB), // <— add cutscene lines here
  };

  game.actor = nextActor(game);
  game.turn = game.actor.role;
  beginTurn(game);
  games[roomId] = game;
  return game;
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
  const cds = me.cooldowns || {};
  const skill = (me.skills || []).find(s => s.key === move);
  if (!skill || (cds[skill.key] || 0) > 0) return game;

  const targets = pickTargets(game, actor.role, skill.target, target);
  if (!targets || targets.length === 0) return game;

  const log = [];
  resolveActions(game, me, targets, skill.actions || [], log, skill.label);
  cds[skill.key] = skill.cd;

  game.log.push(...log);

  checkWin(game);
  if (!game.over) {
    endTurn(game, actor);
    me.ap -= READY_AP;
    game.actor = nextActor(game);
    game.turn = game.actor.role;
    beginTurn(game);
  }

  return { ...game };
}

export function getGame(roomId) { return games[roomId]; }

export function getChars() { return cache.chars; }

// Hot-reload endpoint utility
export function reloadData() {
  cache = loadRoster();
  return { ok: true, counts: { chars: cache.chars.length, dialogues: cache.dialogueRows.length, movers: Object.keys(cache.movesByChar).length } };
}
