// Reads and writes the game's roster CSVs for the offline editor.
//
// Rows the editor didn't change are written back byte-for-byte from the
// original file (quoting, spacing and all), so saving produces a git diff
// that only touches the rows you actually edited. Each file's own line
// ending (CRLF vs LF) and trailing-newline style is detected and kept.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parse } from "csv-parse/sync";

export const DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../data");
export const BACKUP_DIR = path.join(DATA_DIR, ".editor-backups");
const MAX_BACKUPS_PER_FILE = 25;

export const FILES = {
  characters: { file: "characters.csv", columns: ["name", "type", "guild", "spd", "img", "description"] },
  moves: { file: "moves.csv", columns: ["character", "key", "label", "sp_cost", "target", "actions", "description", "extra"] },
  dialogue: { file: "dialogue.csv", columns: ["pair", "order", "speaker", "line"] },
};

// Last snapshot read from disk per file, used to reuse raw row text and to
// detect the file changing underneath the editor between load and save.
const snapshots = {};

function hash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export function loadFile(name) {
  const spec = FILES[name];
  const full = path.join(DATA_DIR, spec.file);
  const text = fs.readFileSync(full, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(text);
  const parsed = parse(text, { columns: true, raw: true, skip_empty_lines: true, bom: true });
  const header = text.split(/\r?\n/, 1)[0].replace(/^﻿/, "");
  const columns = header.split(",");
  // Remember how many blank lines sat above each row (and after the last
  // one) so an otherwise untouched file round-trips exactly.
  // Each gap between rows holds one line terminator plus any blank lines.
  let pos = text.indexOf(header) + header.length;
  const blankLines = (gap) => Math.max(0, (gap.match(/\n/g) || []).length - 1);
  const rows = parsed.map(({ record, raw }) => {
    // csv-parse can leave stray CR/LF from neighbouring blank lines in raw.
    const clean = raw.replace(/^[\r\n]+|[\r\n]+$/g, "");
    const at = text.indexOf(clean, pos);
    const blanksBefore = blankLines(text.slice(pos, at));
    pos = at + clean.length;
    return { record, raw: clean, blanksBefore, fields: splitRawFields(clean) };
  });
  const tailBlanks = blankLines(text.slice(pos));
  const version = hash(text);
  snapshots[name] = { version, rows, eol, trailingNewline, tailBlanks, header, columns };
  return {
    version,
    columns,
    rows: rows.map((r, i) => ({ _id: i, ...r.record })),
  };
}

function quote(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Splits one raw CSV record into its fields exactly as written (quotes
// included), so unchanged fields of an edited row keep their original form.
function splitRawFields(raw) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function sameRecord(a, b, columns) {
  return columns.every((c) => String(a[c] ?? "") === String(b[c] ?? ""));
}

export function serialize(name, rows) {
  const snap = snapshots[name];
  const columns = snap.columns;
  const lines = [snap.header];
  for (const row of rows) {
    const orig = Number.isInteger(row._id) ? snap.rows[row._id] : undefined;
    if (orig) for (let i = 0; i < orig.blanksBefore; i++) lines.push("");
    if (orig && sameRecord(orig.record, row, columns)) lines.push(orig.raw);
    else if (orig && orig.fields.length === columns.length) {
      lines.push(columns.map((c, i) => (String(orig.record[c] ?? "") === String(row[c] ?? "") ? orig.fields[i] : quote(row[c]))).join(","));
    } else lines.push(columns.map((c) => quote(row[c])).join(","));
  }
  for (let i = 0; i < snap.tailBlanks; i++) lines.push("");
  return lines.join(snap.eol) + (snap.trailingNewline ? snap.eol : "");
}

// Mirrors what data/rosterLoader.js does with each file so a save can never
// write something the game server would choke on at startup.
export function validate(name, text) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  const errors = [];
  rows.forEach((r, i) => {
    const where = `${FILES[name].file} row ${i + 2}`;
    if (name === "characters") {
      if (!r.name) errors.push(`${where}: name is empty`);
      if (!Number.isFinite(Number(r.spd))) errors.push(`${where}: spd "${r.spd}" is not a number`);
    } else if (name === "moves") {
      if (!r.character || !r.key) errors.push(`${where}: character and key are required`);
      if (!Number.isFinite(Number(r.sp_cost))) errors.push(`${where}: sp_cost "${r.sp_cost}" is not a number`);
      try {
        if (!Array.isArray(JSON.parse(r.actions))) errors.push(`${where}: actions must be a JSON array`);
      } catch (e) {
        errors.push(`${where}: actions is not valid JSON (${e.message})`);
      }
      if (r.extra) {
        try {
          const x = JSON.parse(r.extra);
          if (!x || typeof x !== "object" || Array.isArray(x)) errors.push(`${where}: extra must be a JSON object`);
        } catch (e) {
          errors.push(`${where}: extra is not valid JSON (${e.message})`);
        }
      }
    } else if (name === "dialogue") {
      if (!/^[^|]+\|[^|]+$/.test(r.pair || "")) errors.push(`${where}: pair "${r.pair}" must look like "A|B"`);
      if (!Number.isFinite(Number(r.order || 0))) errors.push(`${where}: order "${r.order}" is not a number`);
    }
  });
  return errors;
}

function backup(name) {
  const spec = FILES[name];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = spec.file.replace(/\.csv$/, "");
  fs.copyFileSync(path.join(DATA_DIR, spec.file), path.join(BACKUP_DIR, `${base}.${stamp}.csv`));
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(base + ".")).sort();
  for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS_PER_FILE))) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
  }
}

export class ConflictError extends Error {}
export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.errors = errors;
  }
}

export function saveFile(name, rows, expectedVersion) {
  const spec = FILES[name];
  const full = path.join(DATA_DIR, spec.file);
  const current = hash(fs.readFileSync(full, "utf8"));
  if (!snapshots[name] || current !== snapshots[name].version || current !== expectedVersion) {
    throw new ConflictError(`${spec.file} changed on disk since it was loaded. Reload to pick up the new version.`);
  }
  const text = serialize(name, rows);
  const errors = validate(name, text);
  if (errors.length) throw new ValidationError(errors);
  backup(name);
  const tmp = full + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, full);
  return loadFile(name);
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".csv")).sort().reverse();
}

export function restoreBackup(fileName) {
  const safe = path.basename(fileName);
  const match = Object.entries(FILES).find(([, s]) => safe.startsWith(s.file.replace(/\.csv$/, "") + "."));
  if (!match || !fs.existsSync(path.join(BACKUP_DIR, safe))) throw new Error("Unknown backup");
  const [name, spec] = match;
  backup(name);
  fs.copyFileSync(path.join(BACKUP_DIR, safe), path.join(DATA_DIR, spec.file));
  return name;
}
