// All sound effects in the game are synthesized on the fly with the Web
// Audio API — no audio asset files. That sidesteps licensing/sourcing
// entirely and keeps the bundle tiny, at the cost of sounding more like
// chiptune blips than sampled SFX, which fits an arena-brawler well enough.
//
// Browsers block audio until a user gesture, so the AudioContext is created
// lazily on first playSfx() call (always itself triggered by a click/tap)
// rather than at module load.

const MUTE_KEY = "hayashi_sfx_muted";

let ctx = null;
function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable — the toggle just won't persist across reloads */
  }
}

// A short envelope-shaped oscillator tone. `type` is a standard
// OscillatorType; freq can be a single number or a [start, end] pair for a
// linear pitch glide (used for hit "thuds" and the KO downward sweep).
function tone(t0, { freq, type = "sine", duration = 0.15, gain = 0.2, glideTo = null }) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration);
  }
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// A burst of white noise through a bandpass filter — used for percussive
// hits and the dodge "whoosh", which read as noise-like rather than tonal.
function noiseBurst(t0, { duration = 0.12, gain = 0.18, filterFreq = 1200, filterQ = 0.7, sweepTo = null }) {
  const audio = getCtx();
  if (!audio) return;
  const bufferSize = Math.ceil(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = audio.createBufferSource();
  src.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFreq, t0);
  filter.Q.value = filterQ;
  if (sweepTo != null) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);

  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter).connect(amp).connect(audio.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

// Each recipe is a function(t0) scheduling its own oscillators/noise nodes
// relative to a shared start time, so multi-note effects (victory fanfare,
// heal chime) stay rhythmically tight regardless of call overhead.
const RECIPES = {
  // A weighty attack landing — noise thump plus a quick low pitch-drop tone.
  hit: (t0) => {
    noiseBurst(t0, { duration: 0.09, gain: 0.22, filterFreq: 900, sweepTo: 300 });
    tone(t0, { freq: 180, glideTo: 70, type: "triangle", duration: 0.12, gain: 0.16 });
  },
  // A lighter, higher-pitched hit for weak/glancing damage.
  hitLight: (t0) => {
    noiseBurst(t0, { duration: 0.06, gain: 0.15, filterFreq: 1600, sweepTo: 700 });
  },
  // Two quick ascending notes — a friendly, medical-adjacent chime.
  heal: (t0) => {
    tone(t0, { freq: 520, type: "sine", duration: 0.16, gain: 0.16 });
    tone(t0 + 0.09, { freq: 780, type: "sine", duration: 0.2, gain: 0.16 });
  },
  // A wobbling square-wave buzz for stun/bind/burn/etc. landing.
  status: (t0) => {
    const audio = getCtx();
    if (!audio) return;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.linearRampToValueAtTime(160, t0 + 0.08);
    osc.frequency.linearRampToValueAtTime(220, t0 + 0.16);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.09, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(amp).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.24);
  },
  // A quick upward whoosh — dodge, invuln no-sell, guard.
  dodge: (t0) => {
    noiseBurst(t0, { duration: 0.14, gain: 0.12, filterFreq: 500, sweepTo: 2400, filterQ: 1.2 });
  },
  // A descending sweep for a knockout.
  ko: (t0) => {
    tone(t0, { freq: 420, glideTo: 60, type: "sawtooth", duration: 0.4, gain: 0.18 });
  },
  // Rising major-triad arpeggio for a win.
  victory: (t0) => {
    [0, 0.14, 0.28].forEach((dt, i) => {
      tone(t0 + dt, { freq: [392, 494, 587][i], type: "triangle", duration: 0.35, gain: 0.18 });
    });
    tone(t0 + 0.42, { freq: 784, type: "triangle", duration: 0.55, gain: 0.2 });
  },
  // Descending minor interval for a loss — understated, not harsh.
  defeat: (t0) => {
    tone(t0, { freq: 330, type: "triangle", duration: 0.3, gain: 0.16 });
    tone(t0 + 0.18, { freq: 262, type: "triangle", duration: 0.45, gain: 0.16 });
  },
  // Tiny UI blip for hovers/menu navigation.
  click: (t0) => {
    tone(t0, { freq: 660, type: "sine", duration: 0.06, gain: 0.1 });
  },
  // A slightly brighter blip for committing an action (Confirm).
  confirm: (t0) => {
    tone(t0, { freq: 523, type: "sine", duration: 0.07, gain: 0.13 });
    tone(t0 + 0.05, { freq: 784, type: "sine", duration: 0.09, gain: 0.13 });
  },
  // A soft ping marking the start of your own turn.
  turnStart: (t0) => {
    tone(t0, { freq: 880, type: "sine", duration: 0.12, gain: 0.1 });
  },
};

export function playSfx(name) {
  if (isMuted()) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  const audio = getCtx();
  if (!audio) return;
  // A context created during a user gesture can still start "suspended" in
  // some browsers until explicitly resumed.
  if (audio.state === "suspended") audio.resume().catch(() => {});
  try {
    recipe(audio.currentTime);
  } catch {
    // Never let a synthesis glitch (e.g. a browser oddity) interrupt the game.
  }
}
