import { useEffect, useState } from "react";
import { socket } from "../api/socket";
import ReportBugModal from "../components/ReportBugModal";
import AuthModal from "../components/AuthModal";
import { getMe, logout as apiLogout } from "../api/auth";

const btnPrimary =
  "w-full bg-gradient-to-b from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-ink-950 font-display font-bold text-base py-3 rounded-xl shadow-lg shadow-gold-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gold-500 disabled:to-gold-500 disabled:shadow-none";
const btnSecondary =
  "text-sm px-4 py-2.5 rounded-xl bg-panel-raised hover:bg-panel-line text-slate-200 font-semibold border border-panel-line transition";

export default function Lobby({ onReady, setRoomId, setRole, onNameSaved, onOpenGuide, onOpenProfile, onOpenLeaderboard }) {
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [code, setCode] = useState("");
  const [privStatus, setPrivStatus] = useState("");
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [waitingCode, setWaitingCode] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authUser, setAuthUser] = useState(null); // null = guest/logged out

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

  if (!hasName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-slate-200 px-4">
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
          <button onClick={saveName} className={btnPrimary}>
            Continue
          </button>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full mt-3 text-sm text-gold-300 hover:text-gold-200 font-semibold transition"
          >
            Have an account? Log in instead
          </button>
        </div>
        <p className="mt-5 text-xs text-slate-500">Your name is stored locally for next time.</p>
        <button
          onClick={() => setShowReportModal(true)}
          className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-panel hover:bg-panel-raised text-slate-400 border border-panel-line transition"
        >
          🐛 Report a Bug
        </button>
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
                onClick={() => setShowAuthModal(true)}
                className="ml-3 align-middle text-xs px-2.5 py-1 rounded-lg bg-panel-line hover:bg-panel-line/70 text-slate-300 font-body font-normal transition"
              >
                Log in
              </button>
            )}
          </h2>
          <div className="flex gap-2 flex-wrap">
            {onOpenLeaderboard && (
              <button onClick={onOpenLeaderboard} className={btnSecondary}>
                🏆 Leaderboard
              </button>
            )}
            {authUser && onOpenProfile && (
              <button onClick={onOpenProfile} className={btnSecondary}>
                👤 <span className="hidden sm:inline">My </span>Profile
              </button>
            )}
            {onOpenGuide && (
              <button onClick={onOpenGuide} className={btnSecondary}>
                📖 <span className="hidden sm:inline">Character </span>Guide
              </button>
            )}
            <button onClick={() => setShowReportModal(true)} className={btnSecondary}>
              🐛 <span className="hidden sm:inline">Report a </span>Bug
            </button>
            {authUser && (
              <button onClick={handleLogout} className={btnSecondary}>
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
            <button onClick={findMatch} disabled={loadingPublic} className={btnPrimary}>
              {loadingPublic ? "Searching…" : "Find Match"}
            </button>
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
            <button
              onClick={startPrivate}
              disabled={loadingPrivate || !code.trim()}
              className={btnPrimary}
            >
              {loadingPrivate ? "Connecting…" : "Start Private Match"}
            </button>

            {privStatus === "waiting" && (
              <div className="mt-3 text-sm text-slate-300 flex flex-wrap items-center gap-2">
                <span>
                  Waiting for an opponent with passcode{" "}
                  <span className="font-semibold text-gold-300">{waitingCode}</span>…
                </span>
                <button
                  onClick={cancelPrivate}
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
              <li>New Battle Summary screen after every match — a winner banner, an MVP card (based on a composite "Impact Score": damage dealt + damage guarded + healing done + KOs×40, not just who got the finishing blow), and a full per-character stat table for both teams covering damage dealt, damage guarded, damage taken, healing done, healing received, KOs, and every status effect they were afflicted with.</li>
              <li>Optional accounts — log in or sign up (link next to your name) to get a Profile with your win/loss record and per-character stats, and a place on the new Leaderboard. Guest play still works exactly like before; logging in is never required.</li>
              <li>New How to Play section (above) — a plain-language rundown of match flow, turn order, the SP economy, targeting, and every status effect in the game.</li>
              <li>New signature movesets for Kobayashi, Sora, Allie, Kara, and Hakudoshi — completing the Terra guild with a Chi-stacking martial artist, a reckless glass-cannon speedster, a vengeful Spite-hoarder who can disable your skills, a support bard who heals over time, and a taunting damage-sponge.</li>
              <li>New signature movesets for Alasia, Robert, Soren, Lyra, and Arthur — a bomb-token demolitionist, a streak-punching brawler with a counter stance, a shield/barrier/mirror-warden support, a Hera-Takeover-mode buffer/debuffer, and a lock-on marksman.</li>
              <li>Balance pass: Jett's Warning Shot now stuns and deals piercing damage in one hit (20 dmg + 2-turn stun under Kimura Special). Erika's Cutesy Magic and Star's Broken Heart now apply Expose (−50% DEF) instead of raw DEF-ignore. Star's Charm-shuriken now hits two random opponents. Kairu's Flash Kick (60 SP), Kenshin's Elemental Barrage (70 SP), and Kaitsu's Impressive Showcase (65 SP) cost more; Tana's Infernal Outburst deals less (35 AOE, 50 vs Burn).</li>
              <li>Pre-battle cutscenes now spotlight a random fighter from each team instead of always whoever was drafted first, every fighter has at least one line of their own, and drafting a full 5-fighter team from a single guild (AERO, Celestial, Flame, Mist, or Terra) triggers a special "guild joins the battle!" announcement.</li>
              <li>Fixed Ben's Warrior Instinct crashing the match after a few uses.</li>
              <li>Brand new look across the whole app — redesigned lobby, character select, guide, and battle screens with a proper responsive layout tuned for phones as well as desktop.</li>
              <li>You can now refresh the page, lose connection, or close the tab mid-match and pick right back up where you left off — your opponent sees a "reconnecting" notice instead of the match just ending.</li>
              <li>Balance pass: reduced max damage on Shou's Arahabaki Heavy Slash (80→65), Sai's Half-moon Melee (75→55 cap), Sendara's Unyielding Barrage (70→50), and Star's Kiss of Death (50→30). Buffed Arisa (Creature Summon stacks now also grant +25% DEF), Jett (Kimura Special Piercing Volley 35→45 AOE), and Kairu (Flash Kick now costs 50 SP instead of 60).</li>
              <li>Maako's Intangible Flames now grants a 75% dodge chance instead of full untargetability, and its empowered Fiery Punch deals 10 damage instead of 5.</li>
              <li>New signature movesets for Liara, Tana, Ben, Paul, and Kaitsu — a double-acting sword-dancer with an avenging guard, a burn-punishing pyro, a Ki-fueled brawler with a berserker mode, a drone-stacking engineer, and an evasive trick-shot archer.</li>
              <li>Arisa Huang has a new custom winged-hammer icon in place of the generic 🔨.</li>
              <li>Stun now gives a 50/50 chance to act each turn instead of guaranteeing a skipped turn — watch the battle log for "powers through" vs "too stunned."</li>
              <li>Status effects, stacks, and active modes (Charmed, Creature Summon, Lightning Charge, Kimura Special, etc.) are now shown for every fighter on the battle grid, not just whoever's currently acting.</li>
              <li>Speed ties in turn order are now a coin flip each round instead of always favoring Team A.</li>
              <li>New signature movesets for Star, Sai, Sendara, Kenshin, and Kairu — a charm-and-punish assassin, a chain-stacking brawler, a combo spearwoman, a Lightning-vs-Rock stance switcher, and a dodge-tank light-user.</li>
              <li>New signature movesets for Arisa, Erika, Jett, Shou, and Maako — stacking summons, a mode-switching gunslinger, a self-sacrificing demon form, intangible flames, and more. Basic Attack is now Rest: skip your turn for a bonus 10 SP.</li>
              <li>New Report a Bug button (🐛 above) — send us a bug report, feedback, or suggestion straight from the app.</li>
              <li>Fixed active matches occasionally breaking when a 3rd or more player joined the lobby or tried to queue.</li>
              <li>Fixed move selection misbehaving on desktop — each move now has its own ⓘ info icon so previewing a description never gets mixed up with the move you've actually selected.</li>
              <li>Fixed attacks appearing "stuck" after a brief connection drop — battles now recover cleanly instead of losing the ability to act.</li>
              <li>You can now cancel a pending private match, and Return to Lobby from character select, the waiting screen, or the cutscene.</li>
              <li>New Character Guide (📖 above) — browse every fighter's profile and full skill list before you draft.</li>
              <li>Private match codes are no longer visible to the rest of the lobby — only you and your opponent ever see it.</li>
              <li>Chat now shows your real name instead of falling back to "Player A"/"Player B", and is split into Personal (your match) and Global (everyone online) tabs.</li>
              <li>New SP (stamina) system: everyone has a flat 100 HP, skills cost SP instead of using cooldowns, and turn order is set by speed each round.</li>
            </ul>
          )}
        </div>
    </div>
  );
}
