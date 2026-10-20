import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { socket, backendUrl } from "../api/socket";
import ReportBugModal from "../components/ReportBugModal";
import AuthModal from "../components/AuthModal";
import { getMe, logout as apiLogout } from "../api/auth";
import { playSfx, isMuted, setMuted } from "../utils/sfx";
import CharIcon from "../components/CharIcon";

const tap = { scale: 0.95 };

// Shared between the full "What's New" panel (returning players) and the
// condensed "Latest Update" teaser on the landing page (new players) —
// newest first, kept as plain strings so both can .slice() it freely.
const WHATS_NEW = [
  "The landing page for new players now includes an original Hayashi Academy story summary, a How to Play teaser, real gameplay screenshots, a \"Meet the Cast\" preview linking to the full Character Guide, and a condensed Latest Update teaser.",
  "Character Select now shows your opponent's name once a match is found. Fixed a bug where re-entering a private match's passcode right after it ended could wrongly say the room was full.",
  "Balance: Rock's Clone Technique evasion reduced to 15% per token (was 25%), and taking a hit now costs him one Clone token. Star's Charm-shuriken now only targets opponents who aren't already Charmed, and Charmed units only have a 75% chance to land their own attacks.",
  "The Leaderboard now shows each player's rank and current win-or-loss streak, plus a \"How to Reach Each Rank\" reference section. The Missions page now tracks rank progression too, alongside character unlocks.",
  "Rock West, Teru Fukuzawa, and Leia Claasen are now grouped under \"Staff\" instead of a guild; Raven, Caine, Ivy Al Vere, and Lance are now grouped under \"Villains\".",
  "Balance: Sendara's Unyielding Barrage now deals 55 piercing damage and only self-stuns for 1 turn (was 50 non-piercing, 2-turn self-stun). Kairu's Flash Kick nerfed to 40 damage / 50 SP (was 50 / 60).",
  "Four more unlockable characters, all Villains: Raven — Shadow Crawl, Swift Strikes, Quick Retreat, Desperate Lunge, unlocked via 20 wins with Liara Mitsuke; Caine — a strict Un!/Deux!/Trois!/Crimson Finale! combo chain, unlocked via a 5-win streak specifically while playing Teru Fukuzawa; Ivy Al Vere — Sendara's long-missing sister, Lightning Spear, Oppressive Spirit, Concentrated Barrage, Abandon Principles, unlocked via 20 wins with Sendara Al Vere; Lance — Lyra's long-lost older brother, Darkness Flames, Doppelganger, Refresh, Gugnir, unlocked via 10 wins with Lyra plus 5 wins each with Kairu, Soren, and Arthur.",
  "Three new unlockable Junior Instructors, all Staff, each requiring Junior Instructor rank (1,000 career wins) plus 10 wins with a specific character and a 10-match win streak: Rock West — Substitution, Clone Technique, Shuriken Barrage, Gale of Devastation, unlocked via Star Trethowan; Teru Fukuzawa — Scout Target, Quick Shot, Gunplay Carnival, Final Act, unlocked via Jett Kimura; Leia Claasen — Almighty Charge, Bullish Cutter, Absolute Refusal, Intimidation, unlocked via Sendara Al Vere. Yuka has also been corrected to Terra Guild and given a fully reworked kit: Mouse Trap, Age Hex, Body Swap, and Topsy-turvy Ordeal.",
  "New: Ranks (based on career wins, from Academy Prospect up to Headmaster) and a Missions page for registered users. The roster now supports locked, unlockable characters — shown as a \"🔒 ???\" card until earned.",
  "Sai rework: Chain Dance is now a passive that boosts his damage output by 15% per stack (up to 3) instead of feeding a single move. Half-moon Melee is now Opponent Drag — 40 SP (down from 65), deals 15 unguardable damage, and grants Sai invulnerability for one action if the target is bound by Binding Chain. No longer requires Chain Dance stacks to use.",
  "Balance pass: Liara's Sonic Edge costs less (50→40 SP) and hits harder (25→45 dmg). Ben's Fist of the King can no longer be recast while already active. Sai's Binding Chain now leaves him taking 25% more damage for its 2-turn duration. Kairu's Imbue with Light dodge chance reduced 50%→25%. Arthur's Direct Shot deals less (40→30, 55→45 with Lock-on). Sora's Wave Runner evasion reduced 50%→25%. Jett's Kimura Special now correctly describes its effects and costs him 2 SPD steps while active.",
  "New Practice Mode (below) — draft a team of 5 and fight 5 Training Dummies that only ever Rest, so you can freely test out combinations. No cutscene, no opponent, and nothing counts toward your record or the leaderboard. Swap in a different team or head back to the lobby with one click, any time, mid-battle included.",
  "Battle animations and sound effects — hits shake the target and pop a floating damage number, heals pop a green number, a new status effect flashes the portrait, knockouts flash white, and the acting fighter's portrait pulses gold. All sound effects (hits, heals, statuses, dodges, KOs, turn pings, menu clicks, and a victory/defeat fanfare) are synthesized in-browser — no audio files — and can be muted with the 🔊 button at the top of the lobby. Screens now fade in instead of switching abruptly, and buttons/cards have a bit more tactile feedback.",
  "New Battle Summary screen after every match — a winner banner, an MVP card (based on a composite \"Impact Score\": damage dealt + damage guarded + healing done + KOs×40, not just who got the finishing blow), and a full per-character stat table for both teams covering damage dealt, damage guarded, damage taken, healing done, healing received, KOs, and every status effect they were afflicted with.",
  "Optional accounts — log in or sign up (link next to your name) to get a Profile with your win/loss record and per-character stats, and a place on the new Leaderboard. Guest play still works exactly like before; logging in is never required.",
  "New How to Play section (above) — a plain-language rundown of match flow, turn order, the SP economy, targeting, and every status effect in the game.",
  "New signature movesets for Kobayashi, Sora, Allie, Kara, and Hakudoshi — completing the Terra guild with a Chi-stacking martial artist, a reckless glass-cannon speedster, a vengeful Spite-hoarder who can disable your skills, a support bard who heals over time, and a taunting damage-sponge.",
  "New signature movesets for Alasia, Robert, Soren, Lyra, and Arthur — a bomb-token demolitionist, a streak-punching brawler with a counter stance, a shield/barrier/mirror-warden support, a Hera-Takeover-mode buffer/debuffer, and a lock-on marksman.",
  "Balance pass: Jett's Warning Shot now stuns and deals piercing damage in one hit (20 dmg + 2-turn stun under Kimura Special). Erika's Cutesy Magic and Star's Broken Heart now apply Expose (−50% DEF) instead of raw DEF-ignore. Star's Charm-shuriken now hits two random opponents. Kairu's Flash Kick (60 SP), Kenshin's Elemental Barrage (70 SP), and Kaitsu's Impressive Showcase (65 SP) cost more; Tana's Infernal Outburst deals less (35 AOE, 50 vs Burn).",
  "Pre-battle cutscenes now spotlight a random fighter from each team instead of always whoever was drafted first, every fighter has at least one line of their own, and drafting a full 5-fighter team from a single guild (AERO, Celestial, Flame, Mist, or Terra) triggers a special \"guild joins the battle!\" announcement.",
  "Fixed Ben's Warrior Instinct crashing the match after a few uses.",
  "Brand new look across the whole app — redesigned lobby, character select, guide, and battle screens with a proper responsive layout tuned for phones as well as desktop.",
  "You can now refresh the page, lose connection, or close the tab mid-match and pick right back up where you left off — your opponent sees a \"reconnecting\" notice instead of the match just ending.",
  "Balance pass: reduced max damage on Shou's Arahabaki Heavy Slash (80→65), Sai's Half-moon Melee (75→55 cap), Sendara's Unyielding Barrage (70→50), and Star's Kiss of Death (50→30). Buffed Arisa (Creature Summon stacks now also grant +25% DEF), Jett (Kimura Special Piercing Volley 35→45 AOE), and Kairu (Flash Kick now costs 50 SP instead of 60).",
  "Maako's Intangible Flames now grants a 75% dodge chance instead of full untargetability, and its empowered Fiery Punch deals 10 damage instead of 5.",
  "New signature movesets for Liara, Tana, Ben, Paul, and Kaitsu — a double-acting sword-dancer with an avenging guard, a burn-punishing pyro, a Ki-fueled brawler with a berserker mode, a drone-stacking engineer, and an evasive trick-shot archer.",
  "Arisa Huang has a new custom winged-hammer icon in place of the generic 🔨.",
  "Stun now gives a 50/50 chance to act each turn instead of guaranteeing a skipped turn — watch the battle log for \"powers through\" vs \"too stunned.\"",
  "Status effects, stacks, and active modes (Charmed, Creature Summon, Lightning Charge, Kimura Special, etc.) are now shown for every fighter on the battle grid, not just whoever's currently acting.",
  "Speed ties in turn order are now a coin flip each round instead of always favoring Team A.",
  "New signature movesets for Star, Sai, Sendara, Kenshin, and Kairu — a charm-and-punish assassin, a chain-stacking brawler, a combo spearwoman, a Lightning-vs-Rock stance switcher, and a dodge-tank light-user.",
  "New signature movesets for Arisa, Erika, Jett, Shou, and Maako — stacking summons, a mode-switching gunslinger, a self-sacrificing demon form, intangible flames, and more. Basic Attack is now Rest: skip your turn for a bonus 10 SP.",
  "New Report a Bug button (🐛 above) — send us a bug report, feedback, or suggestion straight from the app.",
  "Fixed active matches occasionally breaking when a 3rd or more player joined the lobby or tried to queue.",
  "Fixed move selection misbehaving on desktop — each move now has its own ⓘ info icon so previewing a description never gets mixed up with the move you've actually selected.",
  "Fixed attacks appearing \"stuck\" after a brief connection drop — battles now recover cleanly instead of losing the ability to act.",
  "You can now cancel a pending private match, and Return to Lobby from character select, the waiting screen, or the cutscene.",
  "New Character Guide (📖 above) — browse every fighter's profile and full skill list before you draft.",
  "Private match codes are no longer visible to the rest of the lobby — only you and your opponent ever see it.",
  "Chat now shows your real name instead of falling back to \"Player A\"/\"Player B\", and is split into Personal (your match) and Global (everyone online) tabs.",
  "New SP (stamina) system: everyone has a flat 100 HP, skills cost SP instead of using cooldowns, and turn order is set by speed each round.",
];

// A curated, stable spread of unlocked characters — one guild each — for
// the landing page's "Meet the Cast" teaser. Fetched live from /api/roster
// so names/art/bios never drift out of sync with the real data; this list
// just picks which ones to feature.
const CAST_PREVIEW_NAMES = ["Arisa Huang", "Star Trethowan", "Liara Mitsuke", "Lyra", "Kobayashi", "Jett Kimura"];

const btnPrimary =
  "w-full bg-gradient-to-b from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-ink-950 font-display font-bold text-base py-3 rounded-xl shadow-lg shadow-gold-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gold-500 disabled:to-gold-500 disabled:shadow-none";
const btnSecondary =
  "text-sm px-4 py-2.5 rounded-xl bg-panel-raised hover:bg-panel-line text-slate-200 font-semibold border border-panel-line transition";

export default function Lobby({ onReady, setRoomId, setRole, onNameSaved, onOpenGuide, onOpenProfile, onOpenLeaderboard, onOpenMissions }) {
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [castPreview, setCastPreview] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [code, setCode] = useState("");
  const [privStatus, setPrivStatus] = useState("");
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [waitingCode, setWaitingCode] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authUser, setAuthUser] = useState(null); // null = guest/logged out
  const [soundMuted, setSoundMuted] = useState(() => isMuted());

  const toggleSound = () => {
    const next = !soundMuted;
    setMuted(next);
    setSoundMuted(next);
    if (!next) playSfx("click"); // audible confirmation only when turning sound back on
  };

  const applyIdentity = (displayName) => {
    setName(displayName);
    setHasName(true);
    socket.emit("presenceHello", { name: displayName });
    onNameSaved?.(displayName);
  };

  // Prefer an existing login session over the guest name saved locally —
  // a logged-in user always plays as their account, never a stale guest
  // name from before they signed up.
  useEffect(() => {
    (async () => {
      try {
        const user = await getMe();
        if (user) {
          setAuthUser(user);
          applyIdentity(user.username);
          return;
        }
      } catch {
        // Accounts disabled on this server, or a network hiccup — fall
        // back to the guest flow below exactly like before this feature.
      }
      const saved = localStorage.getItem("hayashi_player_name");
      if (saved) applyIdentity(saved);
    })();
  }, []);

  // Teaser cast for the pre-name landing screen — fetched live so the
  // names/art/bios never drift out of sync with the real roster.
  useEffect(() => {
    fetch(`${backendUrl}/api/roster`)
      .then((r) => r.json())
      .then((data) => {
        const byName = new Map((data.chars || []).map((c) => [c.name, c]));
        setCastPreview(CAST_PREVIEW_NAMES.map((n) => byName.get(n)).filter(Boolean));
      })
      .catch(() => {}); // Purely decorative on the landing screen — fail quietly.
  }, []);

  const handleAuthed = (user) => {
    setAuthUser(user);
    setShowAuthModal(false);
    applyIdentity(user.username);
  };

  const handleLogout = async () => {
    try { await apiLogout(); } catch { /* session cookie may already be gone — proceed anyway */ }
    setAuthUser(null);
    // Drop back to the guest flow rather than leaving a logged-out user
    // stuck on an identity screen with no way to change it.
    setHasName(false);
    setName("");
    localStorage.removeItem("hayashi_player_name");
  };

  // Core listeners
  useEffect(() => {
    const onMatched = ({ roomId, role, names }) => {
      setRoomId(roomId);
      setRole(role);
      setLoadingPublic(false);
      setLoadingPrivate(false);
      setLoadingPractice(false);
      setPrivStatus("");
      onReady?.();
    };
    const onLobbyComplete = ({ roomId }) => {
      setRoomId(roomId);
      setLoadingPublic(false);
      setLoadingPrivate(false);
      setPrivStatus("");
      onReady?.();
    };
    const onRole = (r) => setRole(r);
    const onPrivateWaiting = ({ roomId, passcode }) => {
      setWaitingCode(passcode);
      setPrivStatus("waiting");
      setLoadingPrivate(false);
    };
    const onPrivateError = ({ message }) => {
      setLoadingPrivate(false);
      setPrivStatus("error");
      alert(message || "Private match error");
    };

    socket.on("matched", onMatched);
    socket.on("lobbyComplete", onLobbyComplete);
    socket.on("playerRole", onRole);
    socket.on("privateWaiting", onPrivateWaiting);
    socket.on("privateError", onPrivateError);

    return () => {
      socket.off("matched", onMatched);
      socket.off("lobbyComplete", onLobbyComplete);
      socket.off("playerRole", onRole);
      socket.off("privateWaiting", onPrivateWaiting);
      socket.off("privateError", onPrivateError);
    };
  }, [onReady, setRole, setRoomId]);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return alert("Please enter your name first!");
    localStorage.setItem("hayashi_player_name", trimmed);
    setHasName(true);
    socket.emit("presenceHello", { name: trimmed }); // <— announce presence
    onNameSaved?.(trimmed);
  };

  const findMatch = () => {
    if (!hasName) return saveName();
    setLoadingPublic(true);
    socket.emit("queue", { name: name.trim() });
  };

  const startPrivate = () => {
    if (!hasName) return saveName();
    const pass = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(pass)) {
      return alert("Use a passcode with 4–12 letters/numbers (A–Z, 0–9).");
    }
    setLoadingPrivate(true);
    setPrivStatus("");
    setWaitingCode(pass);
    socket.emit("privateMatch", { passcode: pass, name: name.trim() });
  };

  const cancelPrivate = () => {
    socket.emit("cancelPrivateMatch");
    setPrivStatus("");
    setWaitingCode("");
    setLoadingPrivate(false);
  };

  // Solo practice: draft a team of 5 and fight 5 Training Dummies that only
  // ever Rest. No opponent to wait for, so "matched" fires back almost
  // immediately — see socket.js's startPractice().
  const startPractice = () => {
    if (!hasName) return saveName();
    setLoadingPractice(true);
    socket.emit("startPractice", { name: name.trim() });
  };

  if (!hasName) {
    return (
      <div className="flex flex-col items-center text-slate-200 px-4 py-6 sm:py-10 space-y-10 sm:space-y-14">
        <div className="panel w-full max-w-md p-7 sm:p-8">
          <h2 className="font-display text-2xl font-bold text-gold-300 mb-1">Welcome, challenger</h2>
          <p className="text-sm text-slate-400 mb-5">Enter a name to enter the arena.</p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
            Your name
          </label>
          <input
            type="text"
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-ink-950 border border-panel-line focus:outline-none focus:border-gold-500 text-slate-100 placeholder:text-slate-500"
            placeholder="e.g. Kobayashi"
            autoFocus
          />
          <motion.button whileTap={tap} onClick={() => { playSfx("confirm"); saveName(); }} className={btnPrimary}>
            Continue
          </motion.button>
          <button
            onClick={() => { playSfx("click"); setShowAuthModal(true); }}
            className="w-full mt-3 text-sm text-gold-300 hover:text-gold-200 font-semibold transition"
          >
            Have an account? Log in instead
          </button>
          <p className="mt-5 text-xs text-slate-500 text-center">Your name is stored locally for next time.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => { playSfx("click"); setShowReportModal(true); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-panel hover:bg-panel-raised text-slate-400 border border-panel-line transition"
            >
              🐛 Report a Bug
            </button>
            <button
              onClick={toggleSound}
              aria-label={soundMuted ? "Unmute sound effects" : "Mute sound effects"}
              title={soundMuted ? "Sound off" : "Sound on"}
              className="text-xs px-3 py-1.5 rounded-lg bg-panel hover:bg-panel-raised text-slate-400 border border-panel-line transition"
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>

        {/* The Hayashi Academy story */}
        <div className="panel w-full max-w-3xl p-6 sm:p-8">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-300 mb-3 text-center">
            The Hayashi Academy
          </h3>
          <div className="text-sm sm:text-base text-slate-300 space-y-3 leading-relaxed">
            <p>
              High in the mountains, Hayashi Academy trains fighters into five
              rival guilds — AERO, Celestial, Flame, Mist, and Terra — each
              built around its own fighting style and its own found family.
              Every semester ends the same way: guild against guild, 5v5, in
              the arena, until one side is left standing.
            </p>
            <p>
              The guilds don't always see eye to eye, but they share the same
              Staff — veteran instructors like Rock West, Teru Fukuzawa, and
              Leia Claasen, who were students themselves not long ago. What
              they can't train away is the trouble that keeps finding the
              Academy from outside its walls: a loose faction of Villains,
              some with grudges, some with scores to settle, and at least two
              with family ties to current students that nobody saw coming.
            </p>
            <p>
              New challengers are always welcome. Pick a guild, pick a team,
              and find out where you fit in the story.
            </p>
          </div>
        </div>

        {/* How to Play teaser */}
        <div className="panel w-full max-w-3xl p-6 sm:p-8">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-300 mb-3 text-center">
            How to Play
          </h3>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-4 text-center">
            Draft a team of 5 fighters, then battle it out 5v5. Turn order is
            set by speed each round, skills cost SP instead of using
            cooldowns, and everyone — including you — starts at a flat 100
            HP. Pick a move, tap a target if it needs one, hit Confirm.
            That's the whole loop.
          </p>
          <p className="text-xs text-slate-500 text-center">
            The full rundown — turn order, the SP economy, targeting, and
            every status effect — is one tap away from the lobby once you're
            in.
          </p>
        </div>

        {/* Screenshots */}
        <div className="w-full max-w-5xl">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-300 mb-4 text-center">
            See It In Action
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <figure className="panel p-2">
              <img
                src="/screenshots/character-select.png"
                alt="Drafting a team of 5 fighters on the Character Select screen"
                className="w-full rounded-lg"
              />
              <figcaption className="text-xs text-slate-400 mt-2 text-center">
                Draft your team of 5 from the full roster
              </figcaption>
            </figure>
            <figure className="panel p-2">
              <img
                src="/screenshots/battle.png"
                alt="A 5v5 battle underway at Hayashi Academy"
                className="w-full rounded-lg"
              />
              <figcaption className="text-xs text-slate-400 mt-2 text-center">
                Fight it out 5v5, turn by turn
              </figcaption>
            </figure>
            <figure className="panel p-2">
              <img
                src="/screenshots/battle-summary.png"
                alt="The post-battle summary screen showing the winning team and MVP"
                className="w-full rounded-lg"
              />
              <figcaption className="text-xs text-slate-400 mt-2 text-center">
                Full stats and an MVP breakdown after every match
              </figcaption>
            </figure>
          </div>
        </div>

        {/* Meet the Cast teaser */}
        {castPreview.length > 0 && (
          <div className="w-full max-w-5xl">
            <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-300 mb-4 text-center">
              Meet the Cast
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {castPreview.map((c) => (
                <div key={c.name} className="panel p-4 flex flex-col items-center text-center">
                  <CharIcon img={c.img} alt={c.name} sizePx={48} className="mb-2" />
                  <div className="font-display font-bold text-slate-100">{c.name}</div>
                  <div className="text-xs text-gold-300 mb-2">{c.guild || c.type}</div>
                  <p className="text-xs text-slate-400 line-clamp-3">{c.description}</p>
                </div>
              ))}
            </div>
            {onOpenGuide && (
              <div className="flex justify-center mt-5">
                <button onClick={() => { playSfx("click"); onOpenGuide(); }} className={btnSecondary}>
                  📖 View Full Character Guide
                </button>
              </div>
            )}
          </div>
        )}

        {/* Latest Update teaser */}
        <div className="panel w-full max-w-3xl p-6 sm:p-8">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-300 mb-3 text-center">
            What's New
          </h3>
          <ul className="text-sm text-slate-300 space-y-1.5 list-disc list-inside">
            {WHATS_NEW.slice(0, 3).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {showReportModal && (
          <ReportBugModal name={name || "Anonymous"} onClose={() => setShowReportModal(false)} />
        )}
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuth={handleAuthed} />}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-300">
            Welcome, {name}!
            {!authUser && (
              <button
                onClick={() => { playSfx("click"); setShowAuthModal(true); }}
                className="ml-3 align-middle text-xs px-2.5 py-1 rounded-lg bg-panel-line hover:bg-panel-line/70 text-slate-300 font-body font-normal transition"
              >
                Log in
              </button>
            )}
          </h2>
          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={toggleSound}
              aria-label={soundMuted ? "Unmute sound effects" : "Mute sound effects"}
              title={soundMuted ? "Sound off" : "Sound on"}
              className={btnSecondary}
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
            {onOpenLeaderboard && (
              <button onClick={() => { playSfx("click"); onOpenLeaderboard(); }} className={btnSecondary}>
                🏆 Leaderboard
              </button>
            )}
            {authUser && onOpenProfile && (
              <button onClick={() => { playSfx("click"); onOpenProfile(); }} className={btnSecondary}>
                👤 <span className="hidden sm:inline">My </span>Profile
              </button>
            )}
            {authUser && onOpenMissions && (
              <button onClick={() => { playSfx("click"); onOpenMissions(); }} className={btnSecondary}>
                🎯 Missions
              </button>
            )}
            {onOpenGuide && (
              <button onClick={() => { playSfx("click"); onOpenGuide(); }} className={btnSecondary}>
                📖 <span className="hidden sm:inline">Character </span>Guide
              </button>
            )}
            <button onClick={() => { playSfx("click"); setShowReportModal(true); }} className={btnSecondary}>
              🐛 <span className="hidden sm:inline">Report a </span>Bug
            </button>
            {authUser && (
              <button onClick={() => { playSfx("click"); handleLogout(); }} className={btnSecondary}>
                Log Out
              </button>
            )}
          </div>
        </div>
        {showReportModal && (
          <ReportBugModal name={name} onClose={() => setShowReportModal(false)} />
        )}
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuth={handleAuthed} />}

        <div className="grid sm:grid-cols-2 gap-5">
          {/* Quick Match */}
          <div className="panel p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold text-slate-100 mb-1.5">Find a Match</h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter the public queue and get paired with the next available player.
            </p>
            <motion.button
              whileTap={!loadingPublic ? tap : undefined}
              onClick={() => { if (!loadingPublic) playSfx("confirm"); findMatch(); }}
              disabled={loadingPublic}
              className={btnPrimary}
            >
              {loadingPublic ? "Searching…" : "Find Match"}
            </motion.button>
          </div>

          {/* Private Match */}
          <div className="panel p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold text-slate-100 mb-1.5">Private Match</h3>
            <p className="text-sm text-slate-400 mb-3">
              Share a passcode with a friend. The match starts when both join with the same code.
            </p>
            <input
              type="text"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && startPrivate()}
              placeholder="e.g. HAYA1234"
              className="w-full mb-3 px-3.5 py-2.5 rounded-xl bg-ink-950 border border-panel-line focus:outline-none focus:border-gold-500 text-slate-100 placeholder:text-slate-500"
            />
            <motion.button
              whileTap={!(loadingPrivate || !code.trim()) ? tap : undefined}
              onClick={() => { if (!loadingPrivate && code.trim()) playSfx("confirm"); startPrivate(); }}
              disabled={loadingPrivate || !code.trim()}
              className={btnPrimary}
            >
              {loadingPrivate ? "Connecting…" : "Start Private Match"}
            </motion.button>

            {privStatus === "waiting" && (
              <div className="mt-3 text-sm text-slate-300 flex flex-wrap items-center gap-2">
                <span>
                  Waiting for an opponent with passcode{" "}
                  <span className="font-semibold text-gold-300">{waitingCode}</span>…
                </span>
                <button
                  onClick={() => { playSfx("click"); cancelPrivate(); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-danger-500/90 hover:bg-danger-500 text-white font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            )}
            {privStatus === "error" && (
              <div className="mt-3 text-sm text-hp-400">
                Could not start private match. Try a different code.
              </div>
            )}
          </div>
        </div>

        {/* Practice Mode */}
        <div className="panel p-5 sm:p-6">
          <h3 className="font-display text-lg font-bold text-slate-100 mb-1.5">🏋️ Practice Mode</h3>
          <p className="text-sm text-slate-400 mb-4">
            Draft a team of 5 and battle 5 Training Dummies that only ever
            Rest — never attack — so you can freely try out different
            fighter combinations. No opponent, no cutscene, and nothing is
            recorded to your record or the leaderboard. Leave for the lobby
            or swap in a different team at any point.
          </p>
          <motion.button
            whileTap={!loadingPractice ? tap : undefined}
            onClick={() => { if (!loadingPractice) playSfx("confirm"); startPractice(); }}
            disabled={loadingPractice}
            className={btnPrimary}
          >
            {loadingPractice ? "Starting…" : "Start Practice Match"}
          </motion.button>
        </div>

        <div className="panel p-5 sm:p-6">
          <button
            onClick={() => setShowHowToPlay((v) => !v)}
            className="w-full flex items-center justify-between font-display text-lg font-bold text-gold-300"
          >
            How to Play
            <span className="text-slate-400 text-sm font-body">{showHowToPlay ? "Hide ▲" : "Show ▼"}</span>
          </button>
          {showHowToPlay && (
            <div className="mt-3 text-sm text-slate-300 space-y-4">
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">The flow of a match</div>
                <p>
                  Draft a team of 5 fighters from the roster, then sit through a short
                  pre-battle cutscene before the fight begins. Battle is 5v5 — last
                  team with a living fighter wins.
                </p>
              </div>
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">Turn order</div>
                <p>
                  Every living fighter on both sides acts once per round, fastest
                  Speed first, interleaved freely between teams (not "your team,
                  then theirs"). Ties are a coin flip, reshuffled every round. A
                  fighter with low Speed still always gets a turn each round — Speed
                  only decides <em>when</em>, not <em>if</em>.
                </p>
              </div>
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">HP &amp; SP</div>
                <p>
                  Everyone starts at a flat 100 HP and 25 SP (max 100). Skills cost
                  SP instead of using cooldowns — check the number on each move
                  button, and tap the ⓘ next to any move to read exactly what it
                  does. Every resolved action grants +5 SP to <em>everyone</em>{" "}
                  still standing on either side. Can't afford anything yet? Rest
                  costs 0 SP and grants an extra +10 on top of that +5, so you're
                  never stuck with no legal move.
                </p>
              </div>
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">Targeting</div>
                <p>
                  Pick a move first, then tap the highlighted portrait(s) it needs
                  a target from — yourself, an ally, or an opponent — and hit
                  Confirm to lock it in. Nothing happens until you actually
                  confirm, so lining up the wrong target is never a mistake you
                  can't undo. AOE moves need no target at all.
                </p>
              </div>
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">Status effects</div>
                <p className="text-slate-300">
                  <strong className="text-slate-100">Stun</strong> — 50/50 chance
                  to lose your turn each turn it's active.{" "}
                  <strong className="text-slate-100">Bind</strong> — guaranteed to
                  lose your turn.{" "}
                  <strong className="text-slate-100">Burn</strong> — damage at the
                  start of your turn.{" "}
                  <strong className="text-slate-100">Shield</strong> — 50% less
                  damage taken.{" "}
                  <strong className="text-slate-100">Reflect</strong> — bounces
                  half of incoming damage back at the attacker.{" "}
                  <strong className="text-slate-100">Invulnerable</strong> — takes
                  no damage at all.{" "}
                  <strong className="text-slate-100">Charmed</strong> — marks a
                  target for charm-punishing moves.{" "}
                  <strong className="text-slate-100">Confused</strong> — a chance
                  each turn to strike your own random ally instead of acting.{" "}
                  <strong className="text-slate-100">Exposed</strong> — takes more
                  damage from a halved effective DEF.{" "}
                  <strong className="text-slate-100">Barrier</strong> — the next
                  hit is fully negated and backlashes the attacker.{" "}
                  <strong className="text-slate-100">Mirror</strong> — the next
                  hit is fully negated and heals the defender instead.
                </p>
              </div>
              <div>
                <div className="font-display font-bold text-slate-100 mb-1">Stacks &amp; modes</div>
                <p>
                  Many fighters build up named stacks (like bomb tokens or Chi) or
                  activate timed modes (like Kimura Special or Hera Takeover) that
                  change how their other moves behave. These show up as chips
                  under a fighter's portrait and countdown timers on their move
                  descriptions — when in doubt, the ⓘ icon on each move always has
                  the current, exact numbers.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="panel p-5 sm:p-6">
          <button
            onClick={() => setShowWhatsNew((v) => !v)}
            className="w-full flex items-center justify-between font-display text-lg font-bold text-gold-300"
          >
            What's New
            <span className="text-slate-400 text-sm font-body">{showWhatsNew ? "Hide ▲" : "Show ▼"}</span>
          </button>
          {showWhatsNew && (
            <ul className="mt-3 text-sm text-slate-300 space-y-1.5 list-disc list-inside">
              {WHATS_NEW.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
    </div>
  );
}
