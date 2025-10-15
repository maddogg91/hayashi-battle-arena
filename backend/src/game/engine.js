// backend/src/game/engine.js
import { loadRoster } from "../../data/rosterLoader.js";

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
function applyDamage(attacker, defender, raw, log) {
  let dmg = raw;
  if (defender.effects.shield > 0) {
    const reduced = Math.max(1, Math.floor(dmg * 0.5));
    log.push(`${defender.name} is shielded (−${dmg - reduced}).`);
    dmg = reduced;
  }
  defender.hp = clamp(defender.hp - dmg, 0, MAX_HP);
  if (defender.effects.reflect > 0 && dmg > 0) {
    const refl = Math.max(1, Math.floor(dmg * 0.5));
    attacker.hp = clamp(attacker.hp - refl, 0, MAX_HP);
    log.push(`${defender.name} reflects ${refl} to ${attacker.name}.`);
  }
  return dmg;
}

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
function endTurn(game, acted) {
  game.teams[acted.role].forEach(p => {
    for (const k of Object.keys(p.cooldowns)) if (p.cooldowns[k] > 0) p.cooldowns[k] -= 1;
    tickEffects(p);
  });
  const opp = acted.role === "A" ? "B" : "A";
  game.teams[opp].forEach(p => tickEffects(p));
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
function resolveActions(game, actor, targets, actions, log) {
  const arr = Array.isArray(targets) ? targets : [targets];
  const each = (fn) => arr.forEach(fn);

  for (const step of actions) {
    const kind = step.kind;
    if (kind === "damage") {
      const base = Number(step.base || 0);
      const ignore = Number(step.ignore || 0);
      each(t => applyDamage(actor, t, hitWithIgnore(actor, t, base, ignore), log));
    } else if (kind === "heal") {
      const amt = Number(step.amount || 0);
      const scope = step.target || "self";
      if (scope === "self") {
        actor.hp = clamp(actor.hp + amt, 0, MAX_HP);
      } else if (scope === "ally") {
        arr.forEach(t => t.hp = clamp(t.hp + amt, 0, MAX_HP));
      } else if (scope === "aoe_team") {
        const myTeam = game.teams[game.actor.role].filter(x=>x.hp>0);
        myTeam.forEach(x => x.hp = clamp(x.hp + amt, 0, MAX_HP));
      }
    } else if (kind === "effect") {
      const type = step.type; // stun|bind|burn|shield|reflect
      const turns = Number(step.turns || 1);
      const scope = step.target; // optional override like heal
      if (!scope) {
        each(t => addEffect(t, type, turns));
      } else if (scope === "self") {
        addEffect(actor, type, turns);
      } else if (scope === "aoe_team") {
        game.teams[game.actor.role].forEach(t => addEffect(t, type, turns));
      }
    } else if (kind === "mod") {
      const { stat, amount, turns } = step;
      const chip = { stat, amount: Number(amount||0), turns: Number(turns||1) };
      each(t => t.mods.push({ ...chip }));
    } else if (kind === "recoil") {
      const amt = Number(step.amount || 0);
      actor.hp = clamp(actor.hp - amt, 0, MAX_HP);
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
  const rows = cache.dialogueRows
    .filter(r =>
      r.pair === key1 || r.pair === key2 ||
      r.pair === `${a}|*` || r.pair === `*|${b}` || r.pair === "*|*"
    )
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
export function initGame(selections, roomId) {
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
  game.log.push(`🎯 ${game.teams[game.actor.role][game.actor.i].name} is ready to act.`);
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

  startTurnUpkeep(me, game);
  if (me.hp <= 0) {
    checkWin(game);
    if (!game.over) {
      me.ap -= READY_AP;
      game.actor = nextActor(game);
      game.turn = game.actor.role;
      game.log.push(`🎯 ${game.teams[game.actor.role][game.actor.i].name} is ready to act.`);
    }
    return game;
  }

  if (!canAct(me)) {
    game.log.push(`${me.name} is unable to act!`);
    me.ap -= READY_AP;
    game.actor = nextActor(game);
    game.turn = game.actor.role;
    game.log.push(`🎯 ${game.teams[game.actor.role][game.actor.i].name} is ready to act.`);
    return game;
  }

  const { move, target } = typeof payload === "string" ? { move: payload, target: null } : payload;
  const cds = me.cooldowns || {};
  const skill = (me.skills || []).find(s => s.key === move);
  if (!skill || (cds[skill.key] || 0) > 0) return game;

  const targets = pickTargets(game, actor.role, skill.target, target);
  if (!targets || targets.length === 0) return game;

  const log = [];
  resolveActions(game, me, targets, skill.actions || [], log);
  cds[skill.key] = skill.cd;

  game.log.push(`${me.name} uses ${skill.label}.`, ...log);

  checkWin(game);
  if (!game.over) {
    endTurn(game, actor);
    me.ap -= READY_AP;
    game.actor = nextActor(game);
    game.turn = game.actor.role;
    game.log.push(`🎯 ${game.teams[game.actor.role][game.actor.i].name} is ready to act.`);
  }

  return { ...game };
}

export function getGame(roomId) { return games[roomId]; }

// Hot-reload endpoint utility
export function reloadData() {
  cache = loadRoster();
  return { ok: true, counts: { chars: cache.chars.length, dialogues: cache.dialogueRows.length, movers: Object.keys(cache.movesByChar).length } };
}
