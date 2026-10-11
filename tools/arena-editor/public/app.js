// Hayashi Arena Editor front end. Plain ES modules, no build step.
// All edits happen in memory; "Save" writes the dirty CSVs through the local
// editor server (tools/arena-editor/server.js).

// ---------------------------------------------------------------- constants
const TARGETS = ["enemy", "ally", "self", "aoe_enemy", "aoe_team", "aoe_team_others", "aoe_all",
  "aoe_charmed_enemy", "aoe_uncharmed_enemy", "scouted_enemy"];
const EFFECT_TYPES = ["stun", "bind", "burn", "shield", "reflect", "invuln", "charm", "immune",
  "confuse", "expose", "barrier", "mirror", "substitute"];
const STATS = ["atk", "def", "spd", "spregen"];

// Starting fields for a freshly added step of each kind (game/engine.js
// resolveActions is the source of truth for what each kind reads).
const ACTION_TEMPLATES = {
  damage: { base: 10 },
  heal: { amount: 10, target: "self" },
  effect: { type: "stun", turns: 1 },
  cleanse: { target: "aoe_team" },
  spgain: { amount: 10 },
  stack: { name: "", amount: 1, max: 3 },
  mod: { stat: "atk", amount: 1, turns: 2 },
  mode: { name: "", turns: 2 },
  modeClear: { name: "" },
  guard: { dmg: 20 },
  lockon: { turns: 2 },
  scouttarget: {},
  taunt: { turns: 1 },
  stackdrain: { chance: 0.5 },
  disableskill: { turns: 1 },
  recoil: { amount: 10 },
  swap: {},
};
const ACTION_KINDS = Object.keys(ACTION_TEMPLATES);

// Known keys and the value type the editor should offer for them.
const KEY_TYPES = {
  base: "number", turns: "number", chance: "number", amount: "number", max: "number", ignore: "number",
  selfDamage: "number", dodgeChance: "number", dmgVulnerability: "number", dmg: "number", dmgMult: "number",
  costMultiplier: "number", dmgReduction: "number", hotHeal: "number", hotSp: "number", cap: "number",
  fullHpBonus: "number", per: "number", min: "number", pickRandom: "number",
  unguardable: "boolean", extraAction: "boolean", trueStrike: "boolean", untargetable: "boolean",
  doublePerStreak: "boolean", alliesAlive: "boolean", comboSameTarget: "boolean",
  name: "text", type: "text", target: "text", stat: "text", consumeStack: "text", clearEffect: "text",
  consumeTargetStack: "text", effect: "text", altIf: "text", extraIf: "text", altDesc: "text",
  extraDesc: "text", altTarget: "text", altIfTargetEffect: "text", comboKey: "text", mode: "text",
  stacksZero: "text", modeZero: "text", notAfterMove: "text", afterMove: "text",
  stackBonus: "object", targetBonus: "object", requiresTargetStack: "object", targetStackBonus: "object",
  reduceByStack: "object", comboBonus: "object", requires: "object", stacks: "object", ifStack: "object",
  altActions: "actions", extraActions: "actions", actions: "actions", extras: "list", clearStacksAfter: "json",
};
const OBJECT_TEMPLATES = {
  stackBonus: { name: "", per: 10 }, targetStackBonus: { name: "", per: 10 }, reduceByStack: { name: "", per: 5 },
  targetBonus: { effect: "burn", amount: 10 }, requiresTargetStack: { name: "", min: 1 }, comboBonus: { per: 10 },
  requires: {}, stacks: { name: "", min: 1 }, ifStack: { name: "", min: 1 },
};
const ACTION_KEYS = ["base", "target", "chance", "ignore", "unguardable", "stackBonus", "targetBonus",
  "targetStackBonus", "comboBonus", "cap", "fullHpBonus", "consumeStack", "consumeTargetStack", "clearEffect",
  "requiresTargetStack", "type", "turns", "amount", "max", "name", "stat", "dmg", "selfDamage", "dodgeChance",
  "dmgMult", "trueStrike", "untargetable", "extraAction", "dmgReduction", "dmgVulnerability", "costMultiplier",
  "hotHeal", "hotSp", "reduceByStack"];
const EXTRA_KEYS = ["requires", "altIf", "altTarget", "altActions", "altDesc", "altIfTargetEffect", "extraIf",
  "extraActions", "extraDesc", "pickRandom", "comboKey", "comboSameTarget", "extras", "clearStacksAfter"];
const REQUIRES_KEYS = ["stacks", "mode", "modeZero", "stacksZero", "alliesAlive", "notAfterMove", "afterMove"];
const SUGGEST = { target: TARGETS, altTarget: TARGETS, type: EFFECT_TYPES, effect: EFFECT_TYPES,
  clearEffect: EFFECT_TYPES, altIfTargetEffect: EFFECT_TYPES, stat: STATS };

const FILE_LABEL = { characters: "characters.csv", moves: "moves.csv", dialogue: "dialogue.csv" };

// ---------------------------------------------------------------- state
const S = {
  files: null,          // { characters, moves, dialogue } -> { version, columns, rows }
  locked: new Set(),
  gamePort: 8080,
  dirty: new Set(),
  view: "roster",
  selChar: null,        // character name
  openMove: null,       // move row object currently expanded
  rawMode: new WeakSet(),
  selScene: null,       // dialogue pair
  charFilter: "",
  balance: { sort: "character", dir: 1, filter: "", guild: "" },
  playIdx: 0,
};
const chars = () => S.files.characters.rows;
const moves = () => S.files.moves.rows;
const lines = () => S.files.dialogue.rows;
const charByName = (n) => chars().find((c) => c.name === n);
const movesOf = (n) => moves().filter((m) => m.character === n);

// ---------------------------------------------------------------- dom utils
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function options(list, selected, extra = []) {
  const all = [...new Set([...extra, ...list])];
  if (selected != null && selected !== "" && !all.includes(selected)) all.push(selected);
  return all.map((o) => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    return h("option", { value, selected: value === selected }, label);
  });
}
function toast(msg, kind = "ok", ms = 3500) {
  const t = h("div", { class: `toast ${kind}` }, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), ms);
}
function modal(content) {
  const m = document.getElementById("modal");
  m.replaceChildren(h("div", { class: "modal-box" }, content));
  m.classList.remove("hidden");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { document.getElementById("modal").classList.add("hidden"); }
function avatar(img, big) {
  const cls = big ? "avatar lg" : "avatar";
  if (img && img.startsWith("/")) return h("span", { class: cls }, h("img", { src: "/game-assets" + img, alt: "" }));
  return h("span", { class: cls }, img || "🎭");
}
function parseJSON(s, fallback) {
  if (!s || !String(s).trim()) return fallback;
  try { return JSON.parse(s); } catch { return undefined; }
}

// ---------------------------------------------------------------- dirty / save
function markDirty(file) {
  S.dirty.add(file);
  updateChrome();
}
function updateChrome() {
  const n = S.dirty.size;
  const save = document.getElementById("btnSave");
  save.disabled = n === 0;
  save.textContent = n ? `Save (${n} file${n > 1 ? "s" : ""})` : "Saved";
  document.getElementById("dirtyNote").textContent = n ? "Unsaved: " + [...S.dirty].map((f) => FILE_LABEL[f]).join(", ") : "";
  const issues = computeIssues();
  const errs = issues.filter((i) => i.sev !== "info").length;
  document.getElementById("issueCount").textContent = errs || "";
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || r.statusText);
    err.status = r.status;
    err.details = data.errors;
    throw err;
  }
  return data;
}

async function loadAll() {
  const d = await api("GET", "/api/data");
  S.files = { characters: d.characters, moves: d.moves, dialogue: d.dialogue };
  S.locked = new Set(d.locked);
  S.gamePort = d.gamePort;
  S.dirty.clear();
  S.openMove = null;
  if (!S.selChar || !charByName(S.selChar)) S.selChar = chars()[0]?.name || null;
  render();
}

function cleanRows(file) {
  const cols = S.files[file].columns;
  let rows = S.files[file].rows;
  if (file === "dialogue") rows = groupDialogueRows();
  return rows.map((r) => {
    const o = { _id: r._id };
    for (const c of cols) o[c] = r[c] == null ? "" : String(r[c]);
    return o;
  });
}

async function saveAll() {
  if (!S.dirty.size) return;
  const blocking = computeIssues().filter((i) => i.sev === "error");
  if (blocking.length) {
    toast(`Fix ${blocking.length} error(s) first (see the Issues tab):\n` + blocking.slice(0, 4).map((i) => "• " + i.msg).join("\n"), "error", 7000);
    return;
  }
  const openKey = S.openMove ? `${S.openMove.character}|${S.openMove.key}` : null;
  for (const file of [...S.dirty]) {
    try {
      const res = await api("PUT", `/api/data/${file}`, { rows: cleanRows(file), version: S.files[file].version });
      S.files[file] = res;
      S.dirty.delete(file);
      toast(`Saved ${FILE_LABEL[file]}`);
    } catch (e) {
      if (e.status === 409) toast(e.message + "\nUse Discard to reload (your unsaved edits will be lost).", "error", 9000);
      else toast(`Could not save ${FILE_LABEL[file]}: ${e.message}` + (e.details ? "\n" + e.details.slice(0, 6).join("\n") : ""), "error", 9000);
    }
  }
  if (openKey) S.openMove = moves().find((m) => `${m.character}|${m.key}` === openKey) || null;
  render();
}

// ---------------------------------------------------------------- summaries
const pct = (c) => `${Math.round(Number(c) * 100)}%`;
function stepChips(step) {
  const k = step.kind;
  const t = step.target ? ` → ${step.target}` : "";
  switch (k) {
    case "damage": {
      let s = `${step.base ?? 0} dmg`;
      if (step.stackBonus) s += ` +${step.stackBonus.per}/${step.stackBonus.name}`;
      if (step.targetStackBonus) s += ` +${step.targetStackBonus.per}/target ${step.targetStackBonus.name}`;
      if (step.comboBonus) s += step.comboBonus.doublePerStreak ? " ×2/combo" : ` +${step.comboBonus.per}/combo`;
      if (step.targetBonus) s += ` +${step.targetBonus.amount} vs ${step.targetBonus.effect}`;
      if (step.fullHpBonus != null) s += ` +${step.fullHpBonus} at full HP`;
      if (step.cap != null) s += ` (cap ${step.cap})`;
      if (step.ignore) s += " piercing";
      if (step.unguardable) s += " unguardable";
      if (step.chance != null) s += ` ${pct(step.chance)} hit`;
      return [["dmg", s + t]];
    }
    case "heal": return [["heal", `heal ${step.amount ?? 0}${step.comboBonus ? ` +${step.comboBonus.per}/combo` : ""}${t}`]];
    case "spgain": return [["sp", `+${step.amount ?? 0} SP${t}`]];
    case "effect": return [["", `${step.type} ${step.turns ?? 1}t${step.chance != null && step.chance < 1 ? ` (${pct(step.chance)})` : ""}${t}`]];
    case "mod": return [["", `${step.stat} ${step.amount >= 0 ? "+" : ""}${step.amount} for ${step.turns ?? 1}t${step.chance != null ? ` (${pct(step.chance)})` : ""}`]];
    case "stack": return [["", `+${step.amount ?? 1} ${step.name || "?"} stack${step.max != null ? ` (max ${step.max})` : ""}${t}`]];
    case "mode": return [["", `mode: ${step.name || "?"} ${step.turns ?? 1}t`]];
    case "modeClear": return [["", `ends ${step.name}`]];
    case "guard": return [["dmg", `guard → ${step.dmg ?? step.amount ?? 0} retaliation`]];
    case "recoil": return [["dmg", `${step.amount ?? 0} recoil`]];
    case "cleanse": return [["heal", `cleanse${t}`]];
    default: return [["", k + (step.turns ? ` ${step.turns}t` : "") + (step.chance != null ? ` ${pct(step.chance)}` : "")]];
  }
}
function moveChips(m) {
  const acts = parseJSON(m.actions, []) || [];
  const extra = parseJSON(m.extra, {}) || {};
  const out = [h("span", { class: "chip cost" }, `${m.sp_cost} SP`), h("span", { class: "chip" }, m.target)];
  for (const st of acts) for (const [cls, txt] of stepChips(st)) out.push(h("span", { class: "chip " + cls }, txt));
  if (extra.altActions) out.push(h("span", { class: "chip alt" }, `alt if ${extra.altIf || extra.altIfTargetEffect || "?"}`));
  if (extra.extraActions) out.push(h("span", { class: "chip alt" }, `extra if ${extra.extraIf}`));
  if (extra.extras) out.push(h("span", { class: "chip alt" }, `${extra.extras.length} stack bonus(es)`));
  if (extra.requires) out.push(h("span", { class: "chip alt" }, "requires " + Object.keys(extra.requires).join(", ")));
  if (extra.pickRandom) out.push(h("span", { class: "chip alt" }, `${extra.pickRandom} random targets`));
  return out;
}
function damageSteps(m) {
  return (parseJSON(m.actions, []) || []).filter((s) => s.kind === "damage");
}
function staleDescription(m) {
  const nums = [];
  for (const s of parseJSON(m.actions, []) || []) {
    if (s.kind === "damage" && Number(s.base) > 0) nums.push(s.base);
    if ((s.kind === "heal" || s.kind === "spgain") && Number(s.amount) > 0) nums.push(s.amount);
  }
  const missing = nums.filter((n) => !new RegExp(`(^|\\D)${n}(\\D|$)`).test(m.description || ""));
  return missing.length ? missing : null;
}

// ---------------------------------------------------------------- generic JSON editors
// Every editor mutates the object it is given in place and then calls
// ctx.commit(structural). Structural changes (add/remove) re-render.
function valueType(key, v) {
  if (Array.isArray(v)) {
    if (KEY_TYPES[key] === "actions" || (v.length && v.every((x) => x && typeof x === "object" && "kind" in x))) return "actions";
    if (v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) return "list";
    return "json";
  }
  if (v && typeof v === "object") return "object";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  return "text";
}
function defaultFor(key, type) {
  if (type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "object") return structuredClone(OBJECT_TEMPLATES[key] || {});
  if (type === "actions") return [];
  if (type === "list") return [{ ifStack: { name: "", min: 1 }, actions: [] }];
  if (type === "json") return [];
  return "";
}

function scalarInput(obj, key, ctx) {
  const v = obj[key];
  const type = valueType(key, v);
  if (type === "number") {
    return h("input", { type: "number", step: "any", value: v, oninput: (e) => {
      if (e.target.value === "" || !Number.isFinite(Number(e.target.value))) return;
      obj[key] = Number(e.target.value);
      ctx.commit(false);
    } });
  }
  if (type === "boolean") {
    return h("div", { class: "checkbox-wrap" }, h("input", { type: "checkbox", checked: v, onchange: (e) => { obj[key] = e.target.checked; ctx.commit(false); } }));
  }
  if (type === "json") {
    return h("input", { class: "mono", value: JSON.stringify(v), oninput: (e) => {
      try { obj[key] = JSON.parse(e.target.value); e.target.style.borderColor = ""; ctx.commit(false); }
      catch { e.target.style.borderColor = "var(--err)"; }
    } });
  }
  const listId = SUGGEST[key] ? `dl-${key}` : null;
  return h("input", { value: v ?? "", list: listId, oninput: (e) => { obj[key] = e.target.value; ctx.commit(false); } });
}

function fieldsEditor(obj, ctx, suggestedKeys, skip = []) {
  const wrap = h("div", { class: "fields" });
  for (const key of Object.keys(obj)) {
    if (skip.includes(key)) continue;
    const type = valueType(key, obj[key]);
    const wide = ["object", "actions", "list"].includes(type) || /Desc$/.test(key);
    const remove = h("span", { class: "x", title: `Remove ${key}`, onclick: () => { delete obj[key]; ctx.commit(true); } }, "✕");
    let input;
    if (type === "object") input = objectEditor(obj[key], ctx, key === "requires" ? REQUIRES_KEYS : ["name", "per", "min", "effect", "amount", "doublePerStreak"]);
    else if (type === "actions") input = actionsEditor(obj[key], ctx);
    else if (type === "list") input = listEditor(obj[key], ctx);
    else input = scalarInput(obj, key, ctx);
    wrap.append(h("div", { class: "field" + (wide ? " wide" : "") }, h("div", { class: "field-label" }, h("span", {}, key), remove), input));
  }
  wrap.append(addFieldControl(obj, ctx, suggestedKeys));
  return wrap;
}

function addFieldControl(obj, ctx, suggestedKeys) {
  const listId = "dl-keys-" + Math.random().toString(36).slice(2);
  const keyIn = h("input", { placeholder: "+ add field…", list: listId });
  const typeSel = h("select", {}, options([["number", "number"], ["text", "text"], ["boolean", "yes/no"], ["object", "object"], ["actions", "action list"], ["json", "raw JSON"]], "number"));
  keyIn.addEventListener("input", () => { if (KEY_TYPES[keyIn.value]) typeSel.value = KEY_TYPES[keyIn.value] === "list" ? "json" : KEY_TYPES[keyIn.value]; });
  const add = () => {
    const k = keyIn.value.trim();
    if (!k) return;
    if (k in obj) return toast(`"${k}" is already set`, "warn");
    const t = KEY_TYPES[k] === "list" ? "list" : typeSel.value;
    obj[k] = defaultFor(k, t);
    ctx.commit(true);
  };
  keyIn.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  return h("div", { class: "add-field" },
    keyIn, h("datalist", { id: listId }, options(suggestedKeys.filter((k) => !(k in obj)), null)),
    typeSel, h("button", { class: "small", onclick: add }, "Add"));
}

function objectEditor(obj, ctx, suggestedKeys) {
  return h("div", { class: "nested" }, fieldsEditor(obj, ctx, suggestedKeys));
}

function listEditor(arr, ctx) {
  return h("div", { class: "nested" },
    arr.map((item, i) => h("div", { class: "action" },
      h("div", { class: "action-head" }, h("span", { class: "summary" }, `#${i + 1}`),
        h("button", { class: "icon small danger", title: "Remove", onclick: () => { arr.splice(i, 1); ctx.commit(true); } }, "✕")),
      fieldsEditor(item, ctx, ["ifStack", "actions", ...ACTION_KEYS]))),
    h("button", { class: "small", onclick: () => { arr.push({ ifStack: { name: "", min: 1 }, actions: [] }); ctx.commit(true); } }, "+ Add entry"));
}

function actionsEditor(arr, ctx) {
  const wrap = h("div", {});
  arr.forEach((step, i) => {
    const summary = h("span", { class: "summary" }, stepChips(step).map((c) => c[1]).join(" · "));
    const innerCtx = { commit: (structural) => { summary.textContent = stepChips(step).map((c) => c[1]).join(" · "); ctx.commit(structural); } };
    const kindSel = h("select", { onchange: (e) => {
      const kind = e.target.value;
      for (const k of Object.keys(step)) delete step[k];
      Object.assign(step, { kind }, structuredClone(ACTION_TEMPLATES[kind] || {}));
      ctx.commit(true);
    } }, options(ACTION_KINDS, step.kind));
    const move = (d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; ctx.commit(true); };
    wrap.append(h("div", { class: `action k-${step.kind}` },
      h("div", { class: "action-head" }, kindSel, summary,
        h("button", { class: "icon small", title: "Move up", onclick: () => move(-1) }, "↑"),
        h("button", { class: "icon small", title: "Move down", onclick: () => move(1) }, "↓"),
        h("button", { class: "icon small", title: "Duplicate", onclick: () => { arr.splice(i + 1, 0, structuredClone(step)); ctx.commit(true); } }, "⧉"),
        h("button", { class: "icon small danger", title: "Remove step", onclick: () => { arr.splice(i, 1); ctx.commit(true); } }, "✕")),
      fieldsEditor(step, innerCtx, ACTION_KEYS, ["kind"])));
  });
  const kindSel = h("select", { style: { width: "auto" } }, options(ACTION_KINDS, "damage"));
  wrap.append(h("div", { class: "add-field" }, kindSel, h("button", { class: "small", onclick: () => {
    arr.push({ kind: kindSel.value, ...structuredClone(ACTION_TEMPLATES[kindSel.value]) });
    ctx.commit(true);
  } }, "+ Add step")));
  return wrap;
}

// ---------------------------------------------------------------- roster view
function renderRoster(root) {
  const side = h("aside", { class: "sidebar" });
  const filterIn = h("input", { placeholder: "Search characters…", value: S.charFilter, oninput: (e) => { S.charFilter = e.target.value; drawList(); } });
  const list = h("div", {});
  const drawList = () => {
    const q = S.charFilter.toLowerCase();
    const groups = {};
    for (const c of chars()) {
      if (q && !`${c.name} ${c.type} ${c.guild}`.toLowerCase().includes(q)) continue;
      (groups[c.guild || "No guild"] ||= []).push(c);
    }
    list.replaceChildren(...Object.entries(groups).flatMap(([g, cs]) => [
      h("h4", {}, `${g} (${cs.length})`),
      ...cs.map((c) => h("div", { class: "list-item" + (c.name === S.selChar ? " active" : ""), onclick: () => { S.selChar = c.name; S.openMove = null; render(); } },
        avatar(c.img), h("span", { class: "name" }, c.name), S.locked.has(c.name) ? h("span", { class: "lock", title: "Unlockable" }, "🔒") : null,
        h("span", { class: "sub" }, `${movesOf(c.name).length} moves`))),
    ]));
  };
  drawList();
  side.append(filterIn, list, h("button", { style: { width: "100%", marginTop: "10px" }, onclick: addCharacter }, "+ New character"));

  const mainEl = h("section", {});
  const c = charByName(S.selChar);
  if (!c) mainEl.append(h("div", { class: "empty" }, "Select a character."));
  else mainEl.append(characterPanel(c), movesPanel(c));
  root.append(h("div", { class: "layout" }, side, mainEl));
}

function addCharacter() {
  let name = "New Character", n = 2;
  while (charByName(name)) name = `New Character ${n++}`;
  chars().push({ _id: null, name, type: "", guild: "", spd: "12", img: "🎭", description: "" });
  S.selChar = name;
  markDirty("characters");
  render();
}

function renameCharacter(c, newName) {
  const old = c.name;
  newName = newName.trim();
  if (!newName || newName === old) return false;
  if (charByName(newName)) { toast(`A character named "${newName}" already exists`, "error"); return false; }
  if (newName.includes("|")) { toast(`Names can't contain "|"`, "error"); return false; }
  c.name = newName;
  markDirty("characters");
  let mv = 0, dl = 0;
  for (const m of moves()) if (m.character === old) { m.character = newName; mv++; }
  for (const l of lines()) {
    const [a, b] = l.pair.split("|");
    const pair = [a === old ? newName : a, b === old ? newName : b].join("|");
    if (pair !== l.pair) { l.pair = pair; dl++; }
    if (l.speaker === old) { l.speaker = newName; dl++; }
  }
  if (mv) markDirty("moves");
  if (dl) markDirty("dialogue");
  if (S.selScene) S.selScene = S.selScene.split("|").map((x) => (x === old ? newName : x)).join("|");
  S.selChar = newName;
  toast(`Renamed to ${newName}: updated ${mv} move(s) and ${dl} dialogue field(s).\nCheck data/unlockables.js and client code for hard-coded references to "${old}".`, "warn", 8000);
  return true;
}

function deleteCharacter(c) {
  const mv = movesOf(c.name).length;
  const dl = lines().filter((l) => l.pair.split("|").includes(c.name) || l.speaker === c.name).length;
  if (!confirm(`Delete ${c.name}, their ${mv} move(s) and ${dl} dialogue line(s) that reference them?`)) return;
  S.files.characters.rows = chars().filter((x) => x !== c);
  S.files.moves.rows = moves().filter((m) => m.character !== c.name);
  S.files.dialogue.rows = lines().filter((l) => !(l.pair.split("|").includes(c.name) || l.speaker === c.name));
  markDirty("characters");
  if (mv) markDirty("moves");
  if (dl) markDirty("dialogue");
  S.selChar = chars()[0]?.name || null;
  render();
}

function characterPanel(c) {
  const guilds = [...new Set(chars().map((x) => x.guild).filter(Boolean))];
  const head = h("div", { class: "panel-head" }, avatar(c.img, true),
    h("div", {}, h("h2", {}, c.name), h("div", { class: "muted" }, `${c.type || "—"} · ${c.guild || "no guild"} · SPD ${c.spd}`,
      S.locked.has(c.name) ? h("span", { class: "lock" }, "  🔒 unlockable (see data/unlockables.js)") : null)),
    h("div", { class: "spacer" }),
    h("button", { class: "danger", onclick: () => deleteCharacter(c) }, "Delete character"));
  const set = (k) => (e) => { c[k] = e.target.value; markDirty("characters"); };
  const nameIn = h("input", { value: c.name, onchange: (e) => { if (renameCharacter(c, e.target.value)) render(); else e.target.value = c.name; } });
  return h("div", { class: "panel" }, head,
    h("div", { class: "grid g-char" },
      h("div", {}, h("label", {}, "Name"), nameIn),
      h("div", {}, h("label", {}, "Type"), h("input", { value: c.type, oninput: set("type") })),
      h("div", {}, h("label", {}, "Guild"), h("input", { value: c.guild, list: "dl-guilds", oninput: set("guild") }), h("datalist", { id: "dl-guilds" }, options(guilds, null))),
      h("div", {}, h("label", {}, "SPD"), h("input", { type: "number", value: c.spd, oninput: set("spd") })),
      h("div", {}, h("label", {}, "Icon (emoji or /icons/file.png)"), h("input", { value: c.img, onchange: (e) => { set("img")(e); render(); } })),
      h("div", { class: "span-all" }, h("label", {}, "Description"), h("textarea", { rows: 2, oninput: set("description") }, c.description))));
}

function movesPanel(c) {
  const list = movesOf(c.name);
  const panel = h("div", { class: "panel" },
    h("div", { class: "panel-head" }, h("h3", {}, `Moveset (${list.length})`), h("div", { class: "spacer" }),
      h("span", { class: "hint" }, "Every character also gets the built-in Rest move."),
      h("button", { onclick: () => addMove(c) }, "+ Add move")));
  if (!list.length) panel.append(h("div", { class: "empty" }, "No moves yet."));
  list.forEach((m, i) => panel.append(moveCard(m, i, list)));
  return panel;
}

function addMove(c) {
  const existing = new Set(movesOf(c.name).map((m) => m.key));
  let key = "newmove", n = 2;
  while (existing.has(key)) key = `newmove${n++}`;
  const row = { _id: null, character: c.name, key, label: "New Move", sp_cost: "10", target: "enemy",
    actions: JSON.stringify([{ kind: "damage", base: 10 }]), description: "Deals 10 damage.", extra: "" };
  const last = movesOf(c.name).at(-1);
  const all = moves();
  all.splice(last ? all.indexOf(last) + 1 : all.length, 0, row);
  S.openMove = row;
  markDirty("moves");
  render();
}

function moveCard(m, i, list) {
  const open = S.openMove === m;
  const chipsEl = h("div", { class: "chips" }, moveChips(m));
  const titleEl = h("div", { class: "move-title" }, m.label, h("span", { class: "key" }, m.key));
  const descEl = h("div", { class: "move-desc" }, m.description);
  const card = h("div", { class: "move-card" + (open ? " open" : "") },
    h("div", { class: "move-summary", onclick: () => { S.openMove = open ? null : m; render(); } },
      titleEl, h("div", { class: "move-meta" }, h("span", { class: "muted" }, open ? "▾" : "▸")), descEl, chipsEl));
  if (!open) return card;
  const refresh = () => {
    chipsEl.replaceChildren(...moveChips(m));
    titleEl.replaceChildren(m.label, h("span", { class: "key" }, m.key));
    descEl.textContent = m.description;
  };
  card.append(moveEditor(m, i, list, refresh));
  return card;
}

function moveEditor(m, i, list, refresh) {
  const body = h("div", { class: "move-body" });
  const touch = () => { markDirty("moves"); refresh(); };
  const set = (k) => (e) => { m[k] = e.target.value; touch(); };
  const staleEl = h("div", { class: "warn-text span-all" });
  const updateStale = () => {
    const s = staleDescription(m);
    staleEl.textContent = s ? `Heads up: the description doesn't mention ${s.join(", ")} — it may be out of date with the numbers below.` : "";
  };
  updateStale();
  const keyIn = h("input", { value: m.key, class: "mono", onchange: (e) => {
    const k = e.target.value.trim();
    if (!k || movesOf(m.character).some((x) => x !== m && x.key === k)) { toast("Move keys must be unique per character", "error"); e.target.value = m.key; return; }
    m.key = k; touch();
  } });
  body.append(h("div", { class: "grid g-move" },
    h("div", {}, h("label", {}, "Label"), h("input", { value: m.label, oninput: set("label") })),
    h("div", {}, h("label", {}, "Key (internal id)"), keyIn),
    h("div", {}, h("label", {}, "SP cost"), h("input", { type: "number", value: m.sp_cost, oninput: set("sp_cost") })),
    h("div", {}, h("label", {}, "Target"), h("select", { onchange: set("target") }, options(TARGETS, m.target))),
    h("div", { class: "span-all" }, h("label", {}, "Description (shown to players)"), h("textarea", { rows: 2, oninput: (e) => { set("description")(e); updateStale(); } }, m.description)),
    staleEl));

  const isRaw = S.rawMode.has(m);
  const rawToggle = h("button", { class: "small", onclick: () => { isRaw ? S.rawMode.delete(m) : S.rawMode.add(m); render(); } }, isRaw ? "Use visual editor" : "Edit raw JSON");
  const moveTools = h("span", { style: { display: "flex", gap: "6px" } },
    h("button", { class: "small", disabled: i === 0, onclick: () => swapMoves(list[i], list[i - 1]) }, "↑ Up"),
    h("button", { class: "small", disabled: i === list.length - 1, onclick: () => swapMoves(list[i], list[i + 1]) }, "↓ Down"),
    h("button", { class: "small", onclick: () => duplicateMove(m) }, "Duplicate"),
    h("button", { class: "small danger", onclick: () => { if (confirm(`Delete ${m.label}?`)) { S.files.moves.rows = moves().filter((x) => x !== m); S.openMove = null; markDirty("moves"); render(); } } }, "Delete"));

  if (isRaw) {
    const mk = (col, placeholder, check) => {
      const err = h("div", { class: "warn-text" });
      const ta = h("textarea", { class: "mono", rows: 6, placeholder, oninput: (e) => {
        const v = e.target.value;
        const parsed = parseJSON(v, col === "extra" ? {} : undefined);
        if (parsed === undefined || !check(parsed)) { err.textContent = "Invalid JSON — not applied yet."; return; }
        err.textContent = "";
        m[col] = v.trim();
        touch(); updateStale();
      } }, m[col]);
      return [ta, err];
    };
    body.append(h("div", { class: "section-title" }, "Actions (JSON array)", h("span", { class: "spacer" }), rawToggle, moveTools),
      ...mk("actions", "[]", Array.isArray),
      h("div", { class: "section-title" }, "Conditional / extra (JSON object, optional)"),
      ...mk("extra", "{}", (x) => x && typeof x === "object" && !Array.isArray(x)));
    return body;
  }

  const actions = parseJSON(m.actions, []);
  const extra = parseJSON(m.extra, {});
  if (actions === undefined || extra === undefined) {
    body.append(h("div", { class: "warn-text" }, "This move's JSON is invalid; switch to raw JSON to fix it."), rawToggle);
    return body;
  }
  const ctxA = { commit: (structural) => { m.actions = JSON.stringify(actions); touch(); updateStale(); if (structural) render(); } };
  const ctxE = { commit: (structural) => { m.extra = Object.keys(extra).length ? JSON.stringify(extra) : ""; touch(); if (structural) render(); } };
  body.append(
    h("div", { class: "section-title" }, "Actions (run in order when the move is used)", h("span", { class: "spacer" }), rawToggle, moveTools),
    actionsEditor(actions, ctxA),
    h("div", { class: "section-title" }, "Conditional behaviour (alt / extra actions, requirements)"),
    h("div", { class: "hint", style: { marginBottom: "6px" } }, "altIf + altActions replace the actions while a mode is active; extraIf + extraActions run in addition; requires gates when the move can be used."),
    fieldsEditor(extra, ctxE, EXTRA_KEYS));
  return body;
}

function swapMoves(a, b) {
  const all = moves();
  const ia = all.indexOf(a), ib = all.indexOf(b);
  [all[ia], all[ib]] = [all[ib], all[ia]];
  markDirty("moves");
  render();
}
function duplicateMove(m) {
  const existing = new Set(movesOf(m.character).map((x) => x.key));
  let key = m.key + "copy", n = 2;
  while (existing.has(key)) key = `${m.key}copy${n++}`;
  const copy = { ...m, _id: null, key, label: m.label + " (copy)" };
  const all = moves();
  all.splice(all.indexOf(m) + 1, 0, copy);
  S.openMove = copy;
  markDirty("moves");
  render();
}

// ---------------------------------------------------------------- balance view
function renderBalance(root) {
  const B = S.balance;
  const guilds = [...new Set(chars().map((c) => c.guild).filter(Boolean))];
  const rows = moves().map((m) => {
    const c = charByName(m.character) || {};
    const dmg = damageSteps(m);
    const total = dmg.reduce((s, d) => s + Number(d.base || 0), 0);
    const cost = Number(m.sp_cost) || 0;
    return { m, c, dmg, total, cost, ratio: cost ? total / cost : total ? Infinity : 0 };
  }).filter(({ m, c }) => {
    if (B.guild && c.guild !== B.guild) return false;
    const q = B.filter.toLowerCase();
    return !q || `${m.character} ${m.label} ${m.key} ${m.target}`.toLowerCase().includes(q);
  });
  const sorters = {
    character: (r) => r.m.character, spd: (r) => Number(r.c.spd) || 0, move: (r) => r.m.label,
    cost: (r) => r.cost, target: (r) => r.m.target, damage: (r) => r.total, ratio: (r) => r.ratio,
  };
  const f = sorters[B.sort];
  rows.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * B.dir; });
  const th = (key, label, cls = "") => h("th", { class: (B.sort === key ? "sorted " : "") + cls, onclick: () => { B.dir = B.sort === key ? -B.dir : 1; B.sort = key; render(); } },
    label, B.sort === key ? (B.dir > 0 ? " ▲" : " ▼") : "");

  const table = h("table", { class: "data" },
    h("thead", {}, h("tr", {}, th("character", "Character"), th("spd", "SPD"), th("move", "Move"), th("cost", "SP"),
      th("target", "Target"), th("damage", "Damage"), h("th", {}, ""), th("ratio", "Dmg / SP"), h("th", {}, "Other effects"))),
    h("tbody", {}, rows.map(({ m, c, dmg, total, ratio }) => {
      const dmgCell = dmg.length === 0 ? h("span", { class: "muted" }, "—")
        : h("div", { style: { display: "flex", gap: "4px", alignItems: "center" } },
          ...dmg.map((d, di) => h("input", { type: "number", value: d.base ?? 0, title: `Damage step ${di + 1}`, style: { width: "64px", textAlign: "right" }, onchange: (e) => {
            const acts = parseJSON(m.actions, []);
            const steps = acts.filter((s) => s.kind === "damage");
            steps[di].base = Number(e.target.value) || 0;
            m.actions = JSON.stringify(acts);
            markDirty("moves");
            render();
          } })));
      const other = (parseJSON(m.actions, []) || []).filter((s) => s.kind !== "damage").flatMap(stepChips).map((x) => x[1]).join(" · ");
      const extra = parseJSON(m.extra, {}) || {};
      return h("tr", {},
        h("td", {}, h("a", { style: { cursor: "pointer", color: "var(--teamA)" }, onclick: () => { S.view = "roster"; S.selChar = m.character; S.openMove = m; render(); } }, m.character)),
        h("td", { class: "num" }, c.name ? h("input", { type: "number", value: c.spd, onchange: (e) => { c.spd = e.target.value; markDirty("characters"); render(); } }) : "?"),
        h("td", {}, m.label, extra.altActions || extra.extraActions || extra.extras ? h("span", { class: "chip alt", style: { marginLeft: "6px" }, title: "Has conditional actions — open the move to see them" }, "cond.") : null),
        h("td", { class: "num" }, h("input", { type: "number", value: m.sp_cost, onchange: (e) => { m.sp_cost = e.target.value; markDirty("moves"); render(); } })),
        h("td", {}, h("select", { onchange: (e) => { m.target = e.target.value; markDirty("moves"); } }, options(TARGETS, m.target))),
        h("td", {}, dmgCell),
        h("td", { style: { width: "90px" } }, total ? h("div", { class: "bar", title: `${total} of 100 HP`, style: { width: `${Math.min(total, 100)}%` } }) : null),
        h("td", { class: "muted" }, ratio === Infinity ? "free" : ratio ? ratio.toFixed(2) : "—"),
        h("td", { class: "hint" }, other));
    })));

  root.append(h("div", { class: "panel" },
    h("div", { class: "toolbar" },
      h("input", { placeholder: "Filter by character, move, target…", value: B.filter, oninput: (e) => { B.filter = e.target.value; clearTimeout(renderBalance.t); renderBalance.t = setTimeout(() => { render(); const el = document.querySelector(".toolbar input"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 200); } }),
      h("select", { onchange: (e) => { B.guild = e.target.value; render(); } }, options(guilds, B.guild, [["", "All guilds"]])),
      h("span", { class: "hint" }, `${rows.length} moves · damage = base of each damage step (before stacks, ATK/DEF and conditionals) · bar = share of a 100 HP health bar`)),
    table));
}

// ---------------------------------------------------------------- dialogue view
function scenes() {
  const order = [];
  const by = {};
  for (const l of lines()) {
    if (!by[l.pair]) { by[l.pair] = []; order.push(l.pair); }
    by[l.pair].push(l);
  }
  return order.map((pair) => ({ pair, rows: by[pair].slice().sort((a, b) => Number(a.order) - Number(b.order)) }));
}
// Rows grouped scene-by-scene, so each scene's lines sit together in the CSV.
function groupDialogueRows() {
  return scenes().flatMap((s) => s.rows);
}
function sceneKind(pair) {
  const [a, b] = pair.split("|");
  if (a === "*" && b === "*") return "generic";
  if (a === "*" || b === "*") return "solo";
  return "matchup";
}
function renumber(pair) {
  const s = scenes().find((x) => x.pair === pair);
  if (!s) return;
  s.rows.forEach((r, i) => { if (String(r.order) !== String(i + 1)) r.order = String(i + 1); });
}
function openScene(pair, seedSpeaker) {
  if (!scenes().some((s) => s.pair === pair)) {
    lines().push({ _id: null, pair, order: "1", speaker: seedSpeaker || pair.split("|").find((x) => x !== "*") || "Narrator", line: "" });
    markDirty("dialogue");
  }
  S.selScene = pair;
  S.playIdx = 0;
  S.view = "dialogue";
  render();
}

function renderDialogue(root) {
  const all = scenes();
  if (!S.selScene || !all.some((s) => s.pair === S.selScene)) S.selScene = all[0]?.pair || null;
  const names = chars().map((c) => c.name);
  const side = h("aside", { class: "sidebar" });
  const labels = { matchup: "Matchups (A vs B)", solo: "Solo intros (vs anyone)", generic: "Generic fallback" };
  for (const kind of ["matchup", "solo", "generic"]) {
    const group = all.filter((s) => sceneKind(s.pair) === kind);
    side.append(h("h4", {}, `${labels[kind]} (${group.length})`));
    for (const s of group) {
      const [a, b] = s.pair.split("|");
      const label = kind === "solo" ? (a === "*" ? b : a) : kind === "generic" ? "Any vs any" : `${a} vs ${b}`;
      side.append(h("div", { class: "list-item" + (s.pair === S.selScene ? " active" : ""), onclick: () => { S.selScene = s.pair; S.playIdx = 0; render(); } },
        h("span", { class: "name" }, label), h("span", { class: "sub" }, `${s.rows.length} line${s.rows.length === 1 ? "" : "s"}`)));
    }
  }
  // New scene creator
  const aSel = h("select", {}, options(names, null, [["*", "* Anyone"]]));
  const bSel = h("select", {}, options(names, null, [["*", "* Anyone"]]));
  side.append(h("h4", {}, "New scene"),
    h("div", { class: "grid", style: { gap: "6px" } }, aSel, h("div", { class: "hint", style: { textAlign: "center" } }, "vs"), bSel,
      h("button", { onclick: () => openScene(`${aSel.value}|${bSel.value}`) }, "Create / open scene")));
  // Coverage
  const voiced = new Set(lines().flatMap((l) => [l.speaker, ...l.pair.split("|")]));
  const silent = names.filter((n) => !voiced.has(n));
  side.append(h("h4", {}, `No dialogue yet (${silent.length})`),
    silent.length ? silent.map((n) => h("div", { class: "list-item", title: "Create a solo intro line", onclick: () => openScene(`${n}|*`, n) },
      avatar(charByName(n)?.img), h("span", { class: "name" }, n), h("span", { class: "sub" }, "+ intro"))) : h("div", { class: "hint", style: { padding: "0 8px" } }, "Everyone has at least one line. 🎉"));

  const mainEl = h("section", {});
  const scene = all.find((s) => s.pair === S.selScene);
  if (!scene) mainEl.append(h("div", { class: "panel empty" }, "No scenes yet. Create one from the sidebar."));
  else mainEl.append(sceneEditor(scene, names), scenePreview(scene));
  root.append(h("div", { class: "layout" }, side, mainEl));
}

function sceneEditor(scene, names) {
  const [a, b] = scene.pair.split("|");
  const changePair = (na, nb) => {
    const np = `${na}|${nb}`;
    if (np === scene.pair) return;
    if (scenes().some((s) => s.pair === np)) { toast(`A scene for ${np} already exists — open it from the sidebar.`, "error"); render(); return; }
    scene.rows.forEach((r) => { r.pair = np; });
    S.selScene = np;
    markDirty("dialogue");
    render();
  };
  const aSel = h("select", { onchange: (e) => changePair(e.target.value, b) }, options(names, a, [["*", "* Anyone"]]));
  const bSel = h("select", { onchange: (e) => changePair(a, e.target.value) }, options(names, b, [["*", "* Anyone"]]));
  const speakerOpts = (cur) => {
    const pairNames = [a, b].filter((x) => x !== "*");
    const sel = h("select", {});
    sel.append(h("optgroup", { label: "In this scene" }, options([...pairNames, "Narrator"], cur)));
    const others = names.filter((n) => !pairNames.includes(n));
    sel.append(h("optgroup", { label: "Other characters" }, options(others, pairNames.includes(cur) || cur === "Narrator" ? null : cur)));
    return sel;
  };
  const list = h("div", {});
  scene.rows.forEach((row, i) => {
    const sp = speakerOpts(row.speaker);
    sp.value = row.speaker;
    sp.addEventListener("change", (e) => { row.speaker = e.target.value; markDirty("dialogue"); render(); });
    const ta = h("textarea", { rows: 2, placeholder: "What do they say?", oninput: (e) => { row.line = e.target.value; markDirty("dialogue"); refreshPreview(); } }, row.line);
    const swap = (d) => {
      const other = scene.rows[i + d];
      if (!other) return;
      [row.order, other.order] = [other.order, row.order];
      renumber(scene.pair);
      markDirty("dialogue");
      render();
    };
    list.append(h("div", { class: "line-row" }, h("div", { class: "num" }, i + 1), sp, ta,
      h("div", { class: "line-tools" },
        h("button", { class: "icon small", title: "Move up", disabled: i === 0, onclick: () => swap(-1) }, "↑"),
        h("button", { class: "icon small", title: "Move down", disabled: i === scene.rows.length - 1, onclick: () => swap(1) }, "↓"),
        h("button", { class: "icon small danger", title: "Delete line", onclick: () => {
          S.files.dialogue.rows = lines().filter((l) => l !== row);
          renumber(scene.pair);
          markDirty("dialogue");
          render();
        } }, "✕"))));
  });
  const addLine = () => {
    const last = scene.rows.at(-1);
    const named = [a, b].filter((x) => x !== "*");
    // Alternate speakers by default, which is what most banter wants.
    const next = last ? (named.find((n) => n !== last.speaker) || last.speaker) : (named[0] || "Narrator");
    const row = { _id: null, pair: scene.pair, order: String(scene.rows.length + 1), speaker: next, line: "" };
    const all = lines();
    all.splice(last ? all.indexOf(last) + 1 : all.length, 0, row);
    markDirty("dialogue");
    render();
    setTimeout(() => { const tas = document.querySelectorAll(".line-row textarea"); tas[tas.length - 1]?.focus(); }, 0);
  };
  const deleteScene = () => {
    if (!confirm(`Delete this whole scene (${scene.rows.length} lines)?`)) return;
    S.files.dialogue.rows = lines().filter((l) => l.pair !== scene.pair);
    S.selScene = null;
    markDirty("dialogue");
    render();
  };
  const kind = sceneKind(scene.pair);
  const help = {
    matchup: "Plays when these two characters headline opposite sides (either order). Takes priority over solo intros.",
    solo: "Plays when this character headlines and no matchup scene exists for the pairing. If both headliners have solo intros, both play.",
    generic: "Fallback used only when neither headliner has any lines of their own.",
  }[kind];
  return h("div", { class: "panel" },
    h("div", { class: "panel-head" }, h("h3", {}, "Scene"), h("div", { class: "spacer" }),
      h("button", { class: "danger small", onclick: deleteScene }, "Delete scene")),
    h("div", { class: "grid", style: { gridTemplateColumns: "1fr auto 1fr" } },
      h("div", {}, h("label", {}, "Side A headliner"), aSel), h("div", { class: "vs" }, "VS"), h("div", {}, h("label", {}, "Side B headliner"), bSel)),
    h("p", { class: "hint" }, help, " Each battle picks one random headliner per team; guild announcements may be added in front, and the cutscene is capped at 12 lines."),
    scene.rows.length > 10 ? h("p", { class: "warn-text" }, `This scene has ${scene.rows.length} lines; with guild announcements the game may cut the last ones (12 line cap).`) : null,
    h("div", { class: "section-title" }, "Lines"),
    list,
    h("div", { style: { marginTop: "10px" } }, h("button", { onclick: addLine }, "+ Add line")));
}

let refreshPreview = () => {};
function scenePreview(scene) {
  const [a, b] = scene.pair.split("|");
  const sideOf = (sp) => (sp === a ? "A" : sp === b ? "B" : "N");
  const transcript = h("div", {});
  const player = h("div", { class: "player" });
  const draw = () => {
    const rows = scene.rows;
    transcript.replaceChildren(...rows.map((r) => h("div", { class: `bubble ${sideOf(r.speaker)}` }, h("div", { class: "who" }, r.speaker), r.line || h("span", { class: "muted" }, "(empty)"))));
    S.playIdx = Math.min(S.playIdx, Math.max(0, rows.length - 1));
    const cur = rows[S.playIdx];
    player.replaceChildren(
      cur ? h("div", {}, h("b", { style: { color: sideOf(cur.speaker) === "A" ? "var(--teamA)" : sideOf(cur.speaker) === "B" ? "var(--teamB)" : "var(--muted)" } }, cur.speaker), ": ", cur.line) : h("span", { class: "muted" }, "No lines"),
      h("div", { class: "dots" }, rows.map((_, i) => h("span", { class: i === S.playIdx ? "on" : "" }))),
      h("div", { style: { display: "flex", gap: "6px", marginTop: "10px" } },
        h("button", { class: "small", disabled: S.playIdx === 0, onclick: () => { S.playIdx--; draw(); } }, "◀ Back"),
        h("button", { class: "small", disabled: S.playIdx >= rows.length - 1, onclick: () => { S.playIdx++; draw(); } }, "Next ▶")));
  };
  refreshPreview = draw;
  draw();
  return h("div", { class: "panel" },
    h("div", { class: "panel-head" }, h("h3", {}, "Preview"), h("span", { class: "hint" }, "Blue = side A, red = side B, centered = narrator / other")),
    h("div", { class: "grid g2" },
      h("div", {}, h("label", {}, "As players see it"), h("div", { class: "preview" }, player)),
      h("div", {}, h("label", {}, "Full script"), h("div", { class: "preview" }, transcript))));
}

// ---------------------------------------------------------------- issues
function computeIssues() {
  if (!S.files) return [];
  const out = [];
  const names = new Set();
  for (const c of chars()) {
    if (!c.name.trim()) out.push({ sev: "error", msg: "A character has an empty name", go: () => {} });
    if (names.has(c.name)) out.push({ sev: "error", msg: `Duplicate character name "${c.name}"`, go: () => goChar(c.name) });
    names.add(c.name);
    if (!Number.isFinite(Number(c.spd)) || c.spd === "") out.push({ sev: "error", msg: `${c.name}: SPD "${c.spd}" is not a number`, go: () => goChar(c.name) });
    if (!movesOf(c.name).length) out.push({ sev: "warn", msg: `${c.name} has no moves (only Rest)`, go: () => goChar(c.name) });
  }
  const keys = new Set();
  for (const m of moves()) {
    const id = `${m.character}|${m.key}`;
    const go = () => { goChar(m.character); S.openMove = m; render(); };
    if (!names.has(m.character)) out.push({ sev: "error", msg: `Move "${m.label}" belongs to unknown character "${m.character}"`, go });
    if (keys.has(id)) out.push({ sev: "error", msg: `${m.character}: duplicate move key "${m.key}"`, go });
    keys.add(id);
    if (!m.key.trim()) out.push({ sev: "error", msg: `${m.character}: "${m.label}" has an empty key`, go });
    if (!Number.isFinite(Number(m.sp_cost)) || m.sp_cost === "") out.push({ sev: "error", msg: `${m.character} · ${m.label}: SP cost "${m.sp_cost}" is not a number`, go });
    const acts = parseJSON(m.actions, undefined);
    if (!Array.isArray(acts)) out.push({ sev: "error", msg: `${m.character} · ${m.label}: actions JSON is invalid`, go });
    const extra = parseJSON(m.extra, {});
    if (extra === undefined) out.push({ sev: "error", msg: `${m.character} · ${m.label}: extra JSON is invalid`, go });
    const walk = (arr) => (arr || []).forEach((s) => {
      if (!ACTION_KINDS.includes(s?.kind)) out.push({ sev: "warn", msg: `${m.character} · ${m.label}: unknown action kind "${s?.kind}" (the engine will ignore it)`, go });
    });
    if (Array.isArray(acts)) walk(acts);
    if (extra) { walk(extra.altActions); walk(extra.extraActions); (extra.extras || []).forEach((x) => walk(x.actions)); }
    if (!TARGETS.includes(m.target)) out.push({ sev: "warn", msg: `${m.character} · ${m.label}: unusual target "${m.target}"`, go });
    if (Array.isArray(acts) && staleDescription(m)) out.push({ sev: "info", msg: `${m.character} · ${m.label}: description doesn't mention ${staleDescription(m).join(", ")}`, go });
  }
  for (const s of scenes()) {
    const go = () => { S.selScene = s.pair; S.view = "dialogue"; render(); };
    const parts = s.pair.split("|");
    for (const p of parts) if (p !== "*" && !names.has(p)) out.push({ sev: "error", msg: `Dialogue scene "${s.pair}" references unknown character "${p}"`, go });
    for (const r of s.rows) {
      if (!r.line.trim()) out.push({ sev: "warn", msg: `Scene "${s.pair}" line ${r.order} is empty`, go });
      if (r.speaker !== "Narrator" && !names.has(r.speaker)) out.push({ sev: "warn", msg: `Scene "${s.pair}": speaker "${r.speaker}" isn't in the roster`, go });
      else if (r.speaker !== "Narrator" && !parts.includes(r.speaker)) out.push({ sev: "info", msg: `Scene "${s.pair}": ${r.speaker} speaks but isn't a headliner, so their line shows as narrator-style`, go });
    }
  }
  return out;
}
function goChar(name) { S.view = "roster"; S.selChar = name; S.openMove = null; render(); }

function renderIssues(root) {
  const issues = computeIssues();
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.sev] - order[b.sev]);
  root.append(h("div", { class: "panel" },
    h("h2", {}, "Issues"),
    h("p", { class: "hint" }, "Errors block saving. Warnings and info are worth a look but won't stop you."),
    issues.length ? issues.map((i) => h("div", { class: "issue" }, h("span", { class: `sev ${i.sev}` }, i.sev), h("span", {}, i.msg), h("a", { onclick: i.go }, "Go →")))
      : h("div", { class: "empty" }, "No issues found. ✨")));
}

// ---------------------------------------------------------------- shell
function render() {
  const root = document.getElementById("app");
  const scroll = window.scrollY;
  root.replaceChildren();
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === S.view));
  // Shared suggestion lists used by text inputs in the JSON editors.
  root.append(...Object.entries(SUGGEST).map(([k, list]) => h("datalist", { id: `dl-${k}` }, options(list, null))));
  if (S.view === "roster") renderRoster(root);
  else if (S.view === "balance") renderBalance(root);
  else if (S.view === "dialogue") renderDialogue(root);
  else renderIssues(root);
  updateChrome();
  window.scrollTo(0, scroll);
}

async function showBackups() {
  const { backups } = await api("GET", "/api/backups");
  modal([
    h("h3", { style: { marginTop: 0 } }, "Backups"),
    h("p", { class: "hint" }, "A copy of each file is taken before every save (last 25 per file, in data/.editor-backups/). Restoring replaces the current file on disk; the current version is backed up first."),
    backups.length ? h("table", { class: "data" }, h("tbody", {}, backups.map((f) => h("tr", {}, h("td", { class: "mono" }, f),
      h("td", {}, h("button", { class: "small", onclick: async () => {
        if (S.dirty.size && !confirm("You have unsaved edits; restoring will discard them. Continue?")) return;
        if (!confirm(`Restore ${f}?`)) return;
        try { await api("POST", "/api/backups/restore", { file: f }); closeModal(); await loadAll(); toast(`Restored ${f}`); }
        catch (e) { toast(e.message, "error"); }
      } }, "Restore")))))) : h("div", { class: "empty" }, "No backups yet — they appear after your first save."),
    h("div", { style: { textAlign: "right", marginTop: "12px" } }, h("button", { onclick: closeModal }, "Close")),
  ]);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  S.view = b.dataset.view;
  render();
});
document.getElementById("btnSave").addEventListener("click", saveAll);
document.getElementById("btnDiscard").addEventListener("click", async () => {
  if (S.dirty.size && !confirm("Discard all unsaved changes and reload from disk?")) return;
  await loadAll();
  toast("Reloaded from disk");
});
document.getElementById("btnPush").addEventListener("click", async () => {
  if (S.dirty.size) toast("Note: unsaved edits aren't included — save first.", "warn");
  try {
    const r = await api("POST", "/api/reload-game", {});
    toast(`Game server on port ${S.gamePort} reloaded: ${r.counts ? `${r.counts.chars} characters, ${r.counts.dialogues} dialogue lines` : "ok"}`);
  } catch (e) { toast(e.message, "error", 6000); }
});
document.getElementById("btnBackups").addEventListener("click", () => showBackups().catch((e) => toast(e.message, "error")));
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveAll(); }
  if (e.key === "Escape") closeModal();
});
window.addEventListener("beforeunload", (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ""; } });

loadAll().catch((e) => {
  document.getElementById("app").replaceChildren(h("div", { class: "empty" }, "Could not load data: " + e.message));
});
