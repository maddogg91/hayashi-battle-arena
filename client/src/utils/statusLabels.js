// Display names for the stack/mode keys defined in data/moves.csv — these
// keys are plain lowercase identifiers (e.g. "lightningcharge"), not
// camelCase, so they can't be auto-split into words.
const STACK_LABELS = {
  creature: "Creature Summon",
  chaindance: "Chain Dance",
  lightningcharge: "Lightning Charge",
  rockarmor: "Rock Armor",
  dronestack: "Drone Stack",
  bomb: "Bomb Token",
  chi: "Chi Token",
  spite: "Spite Token",
};

const MODE_LABELS = {
  kimura: "Kimura Special",
  arahabaki: "Arahabaki",
  intangible: "Intangible Flames",
  imbuedlight: "Imbue with Light",
  quickstep: "Quick Step",
  kicontrol: "Ki Control",
  fistoftheking: "Fist of the King",
  strategize: "Strategize",
  selfproclamation: "Self-Proclamation",
  steadyaim: "Steady Aim",
  asukoroll: "Asuko Roll",
  fortress: "Impenetrable Fortress",
  hera: "Hera Takeover",
  cover: "Mount & Cover",
  lockon: "Lock-on",
  falsebravado: "False Bravado",
  waverunner: "Wave Runner",
  darkshroud: "Dark Shroud",
  songofhope: "Song of Hope",
  tempo: "Tempo of Victory",
  disrupted: "Disrupting Symphony",
  toughbody: "Tough Body",
};

export function stackLabel(name) {
  return STACK_LABELS[name] || name;
}

export function modeLabel(name) {
  return MODE_LABELS[name] || name;
}
