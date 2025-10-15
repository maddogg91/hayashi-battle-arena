import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const DATA_DIR = path.join(process.cwd(), "data");

function loadCSV(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
}

export function loadRoster() {
  const chars = loadCSV("characters.csv").map((r) => ({
    name: r.name,
    type: r.type,
    hp: Number(r.hp),
    atk: Number(r.atk),
    def: Number(r.def),
    spd: Number(r.spd),
    img: r.img || "🎭",
    description: r.description || "",
  }));

  const movesRows = loadCSV("moves.csv");
  // group moves by character
  const movesByChar = {};
  for (const m of movesRows) {
    const actions = JSON.parse(m.actions);
    const entry = {
      key: m.key,
      label: m.label,
      cd: Number(m.cd),
      target: m.target,      // enemy | ally | self | aoe_enemy | aoe_team | aoe_all
      desc: m.description || "",
      actions,
    };
    if (!movesByChar[m.character]) movesByChar[m.character] = [];
    movesByChar[m.character].push(entry);
  }

  const dialogueRows = loadCSV("dialogue.csv").map((r) => ({
    pair: r.pair,                  // "A|B" or "A|*" or "*|B" or "*|*"
    order: Number(r.order || 0),
    speaker: r.speaker,
    line: r.line,
  }));

  return { chars, movesByChar, dialogueRows };
}
