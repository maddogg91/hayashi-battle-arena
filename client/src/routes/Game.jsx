import { useEffect, useRef, useState } from "react";
import { socket } from "../api/socket";
import Lobby from "./Lobby";
import CharacterSelect from "./CharacterSelect";
import CharacterGuide from "./CharacterGuide";
import TeamGrid from "../components/TeamGrid";
import MovesPanel from "../components/MovesPanel";
import ReplayViewer from "../components/ReplayViewer";
import PreBattleCutscene from "../components/PreBattleCutscene";
import ChatPanel from "../components/ChatPanel";
import LobbyUsersPanel from "../components/LobbyUsersPanel";

// Mirrors requirementsMet() in game/engine.js — mostly a belt-and-suspenders
// guard since MovesPanel already greys out buttons that fail this, but
// chooseMove is reachable independently of that render (e.g. a stale click).
function meetsRequires(skill, unit, team) {
  const req = skill.requires;
  if (!req) return true;
  if (req.stacks && (unit.stacks?.[req.stacks.name] || 0) < req.stacks.min) return false;
  if (req.mode && !(unit.modes?.[req.mode]?.turns > 0)) return false;
  if (req.alliesAlive) {
    const others = (team || []).filter((u) => u !== unit && u.hp > 0);
    if (others.length === 0) return false;
  }
  if (req.stacksZero && (unit.stacks?.[req.stacksZero] || 0) > 0) return false;
  if (req.notAfterMove && unit.comboKey === req.notAfterMove) return false;
  if (req.modeZero && unit.modes?.[req.modeZero]?.turns > 0) return false;
  return true;
}

// Mirrors costMultOf() in game/engine.js — some active modes surcharge the
// unit's own SP costs (e.g. Lyra's Hera Takeover doubling hers), so the
// client has to account for it too or a move can look affordable here and
// then get silently rejected server-side for insufficient SP.
function effectiveCost(skill, unit) {
  const modes = unit.modes || {};
  const mult = Object.values(modes).reduce(
    (m, mode) => (mode && mode.turns > 0 && mode.costMultiplier ? m * mode.costMultiplier : m),
    1
  );
  return Math.ceil((skill.cost || 0) * mult);
}

// Persisted just long enough to survive a page reload/browser relaunch —
// {roomId, role} for whatever match is currently in progress. Written the
// moment we're matched, cleared the moment the match is genuinely over
// (opponent confirmed gone, we voluntarily leave, or a rejoin attempt comes
// back invalid) so a stale session never lingers past its match.
const SESSION_KEY = "hayashi_session";
const saveSession = (roomId, role) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, role })); } catch { /* storage unavailable (e.g. private browsing) — non-fatal */ }
};
const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable — non-fatal */ }
};
const loadSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.roomId && (parsed.role === "A" || parsed.role === "B")) return parsed;
  } catch { /* storage unavailable or corrupt value — treat as no session */ }
  return null;
};

export default function Game() {
  // Flow
  const [inLobby, setInLobby] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  // Net/Game
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null); // "A" | "B"
  const [team, setTeam] = useState(null);
  const [game, setGame] = useState(null);
  const [log, setLog] = useState([]);
  const [replayId, setReplayId] = useState(null);
  const logRef = useRef(null);

  // autoscroll the battle log to the latest entry
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // Names
  const [names, setNames] = useState({ A: "Player A", B: "Player B" });
  const [myName, setMyName] = useState("Player");

  // Target
  const [target, setTarget] = useState(null);
  // A move that's been picked but still needs a target tapped/clicked:
  // { key, label, needs: 'enemy'|'ally', desiredRole: 'A'|'B' }
  const [pendingMove, setPendingMove] = useState(null);

  // Cutscene
  const [cutscene, setCutscene] = useState(null);

  // Reload/relaunch recovery: true while we're attempting to rejoin a match
  // found in localStorage, resolved by either a successful "matched" (normal
  // handler below) or a "rejoinFailed" from the server. rejoinNotice is a
  // one-time message shown on the lobby screen after a failed attempt.
  const [reconnecting, setReconnecting] = useState(() => !!loadSession());
  const [rejoinNotice, setRejoinNotice] = useState(null);
  // Transient heads-up while our opponent's own connection is in its grace
  // window (see RECONNECT_GRACE_MS server-side) — not the same as
  // opponentLeft, which means they're confirmed gone.
  const [opponentStatus, setOpponentStatus] = useState(null);

  // Chat
  const [chat, setChat] = useState([]);
  const handleChatHistory = (hist) => setChat(hist || []);
  const handleChatPush = (msg) => setChat((c) => [...c, msg]);
  const chatDisplayName = myName || (role ? `Player ${role}` : "Player");

  // Global (lobby-wide) chat — not tied to a room, available on every screen
  const [globalChat, setGlobalChat] = useState([]);
  const handleGlobalChatHistory = (hist) => setGlobalChat(hist || []);
  const handleGlobalChatPush = (msg) => setGlobalChat((c) => [...c, msg]);

  // load my saved name
  useEffect(() => {
    const saved = localStorage.getItem("hayashi_player_name");
    if (saved) setMyName(saved);
  }, []);

  // On first load, if a match session was persisted (a previous tab/page had
  // us in a match when it closed or crashed), try to rejoin it before
  // showing the normal lobby — covers a full page reload or relaunch, not
  // just a brief in-tab network drop (that's the separate "connect" effect
  // below). Resolves via the "matched" or "rejoinFailed" handlers.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    setReconnecting(true);
    const name = localStorage.getItem("hayashi_player_name") || "";
    const attempt = () => socket.emit("joinRoom", { roomId: session.roomId, role: session.role, name });
    if (socket.connected) attempt();
    else socket.once("connect", attempt);
  }, []);

  // Re-bind to our room if the socket reconnects mid-match (brief network
  // drop). Socket.IO's connectionStateRecovery covers short gaps, but this
  // is a belt-and-suspenders fallback for reconnects that land outside that
  // window — without it the server can still process our moves, but has no
  // route back to us since our new socket was never re-joined to the room.
  useEffect(() => {
    const onConnect = () => {
      if (roomId && role) {
        socket.emit("joinRoom", { roomId, role, name: myName });
      }
    };
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, [roomId, role, myName]);

  // Socket listeners (single mount)
  useEffect(() => {
    const onMatched = ({ roomId, role, names }) => {
      setRoomId(roomId);
      setRole(role);
      if (names) setNames(names);
      setInLobby(false);
      setWaiting(true);
      setReconnecting(false);
      saveSession(roomId, role);
    };

    const onLobbyComplete = ({ roomId, names }) => {
      // legacy support
      if (roomId) setRoomId(roomId);
      if (names) setNames(names);
      setInLobby(false);
      setWaiting(true);
    };

    // A reload/relaunch tried to rejoin a match that's no longer there
    // (server restarted, grace window expired, opponent already left).
    const onRejoinFailed = ({ message }) => {
      clearSession();
      setReconnecting(false);
      setRejoinNotice(message || "Your previous match is no longer available.");
    };

    // The opponent's own connection dropped but they still have time to
    // reconnect (server-side grace window) — surface it as a heads-up
    // rather than silently going quiet, without ending the match.
    const onOpponentDisconnected = ({ role: oppRole, graceMs }) =>
      setOpponentStatus({ role: oppRole, graceMs });
    const onOpponentReconnected = () => setOpponentStatus(null);

    const onNames = (n) => setNames((prev) => ({ ...prev, ...n }));

    const onCutscene = ({ cutscene }) => setCutscene(cutscene || []);

    const onStartGame = (gameState) => {
      setCutscene(null);
      setWaiting(false);
      setGame({ ...gameState, names });
      setLog(gameState.log || []);
      setTarget(null);
    };

    const onUpdateGame = (gameState) => {
      setGame({ ...gameState, names });
      setLog([...gameState.log]);
      if (gameState && target) {
        const tArr = gameState.teams?.[target.role] || [];
        if (!tArr[target.index] || tArr[target.index].hp <= 0) setTarget(null);
      }
    };

    const onOpponentLeft = () => {
      clearSession();
      setOpponentStatus(null);
      setWaiting(true);
      setGame(null);
      setLog(["Opponent left the arena."]);
      setTeam(null);
      setTarget(null);
      setPendingMove(null);
      setReplayId(null);
      setCutscene(null);
      setRoomId(null);
      setRole(null);
      setInLobby(true);
    };

    const onReplaySaved = ({ replayId }) => setReplayId(replayId);

    socket.on("matched", onMatched);
    socket.on("lobbyComplete", onLobbyComplete);
    socket.on("playerNames", onNames);
    socket.on("preBattleDialogue", onCutscene);
    socket.on("startGame", onStartGame);
    socket.on("updateGame", onUpdateGame);
    socket.on("opponentLeft", onOpponentLeft);
    socket.on("replaySaved", onReplaySaved);
    socket.on("rejoinFailed", onRejoinFailed);
    socket.on("opponentDisconnected", onOpponentDisconnected);
    socket.on("opponentReconnected", onOpponentReconnected);

    return () => {
      socket.off("matched", onMatched);
      socket.off("lobbyComplete", onLobbyComplete);
      socket.off("playerNames", onNames);
      socket.off("preBattleDialogue", onCutscene);
      socket.off("startGame", onStartGame);
      socket.off("updateGame", onUpdateGame);
      socket.off("opponentLeft", onOpponentLeft);
      socket.off("replaySaved", onReplaySaved);
      socket.off("rejoinFailed", onRejoinFailed);
      socket.off("opponentDisconnected", onOpponentDisconnected);
      socket.off("opponentReconnected", onOpponentReconnected);
    };
  }, [names, target]);

  // Helpers
  const currentActor =
    game?.actor ? game.teams[game.actor.role][game.actor.i] : null;
  const iAmActing = !!(game?.actor && role === game.actor.role);

  // Clear any in-progress targeting whenever the acting unit changes (new
  // turn, or the opponent started acting instead of us).
  useEffect(() => {
    setTarget(null);
    setPendingMove(null);
  }, [game?.actor?.role, game?.actor?.i]);

  // Submits whatever move is currently armed. This is the ONLY path that
  // emits to the server — selecting a move or a target never fires on its
  // own, so there's no ambiguous "did that click apply?" state: nothing
  // happens until this explicit confirm, and this always has everything
  // it needs to build a valid payload (canConfirm gates when it's callable).
  const confirmAction = () => {
    if (!canConfirm) return;
    const { key: moveKey, needs } = pendingMove;

    const payload = { move: moveKey };
    if (needs === "self") {
      payload.target = { role, index: game.actor.i };
    } else if (needs === "enemy" || needs === "ally") {
      payload.target = target;
    }
    socket.emit("playerMove", { roomId, move: payload, role });
    setTarget(null);
    setPendingMove(null);
  };

  // Clicking a move only arms it — nothing executes until confirmAction()
  // runs. If the move needs a target the player already had selected for a
  // *different* side (e.g. they had an ally targeted, then picked an enemy
  // move), drop it rather than leaving a stale, invalid target in place.
  const chooseMove = (moveKey) => {
    if (!iAmActing || game?.over) return;
    const myUnit = currentActor;
    if (!myUnit) return;

    const m = (myUnit.skills || []).find((s) => s.key === moveKey);
    if (!m || (myUnit.sp ?? 0) < effectiveCost(m, myUnit)) return;
    if (!meetsRequires(m, myUnit, game.teams?.[role] ?? [])) return;
    const needs = m?.target || "none";
    const desiredRole =
      needs === "ally" ? role : needs === "enemy" ? (role === "A" ? "B" : "A") : null;

    setPendingMove({ key: moveKey, label: m.label, needs, desiredRole });
    if (desiredRole && target?.role !== desiredRole) setTarget(null);
  };

  // Tapping a grid portrait only arms a target — same deal, confirmAction()
  // is what actually submits.
  const selectMyTarget = (whoRole, idx) => {
    if (!iAmActing) return;
    const unit = game?.teams?.[whoRole]?.[idx];
    if (!unit || unit.hp <= 0) return;
    setTarget({ role: whoRole, index: idx });
  };

  const pendingNeedsTarget = pendingMove?.needs === "enemy" || pendingMove?.needs === "ally";
  const canConfirm = !!(
    iAmActing &&
    !game?.over &&
    pendingMove &&
    (!pendingNeedsTarget || (target && target.role === pendingMove.desiredRole))
  );

  // Voluntary exit before a match has finished — character select, the
  // waiting-for-opponent screen, or the cutscene. Tells the server we're
  // leaving (so the opponent, if any, is notified and the room is cleaned
  // up) and resets local state back to the idle lobby.
  const leaveToLobby = () => {
    socket.emit("leaveRoom");
    clearSession();
    setOpponentStatus(null);
    setWaiting(true);
    setGame(null);
    setLog([]);
    setTeam(null);
    setTarget(null);
    setPendingMove(null);
    setReplayId(null);
    setCutscene(null);
    setRoomId(null);
    setRole(null);
    setInLobby(true);
    setChat([]);
  };

  // ---- Renders ----
  if (reconnecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6">
        <div className="h-10 w-10 rounded-full border-4 border-gold-500/30 border-t-gold-400 animate-spin" />
        <p className="text-lg font-display font-semibold text-gold-300">Reconnecting to your match…</p>
        <p className="text-sm text-slate-400 max-w-sm">
          Picking back up where you left off. This only takes a moment.
        </p>
      </div>
    );
  }

  if (showGuide) {
    return <CharacterGuide onBack={() => setShowGuide(false)} />;
  }

  if (inLobby) {
    return (
      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6 p-4 sm:p-6">
        <div className="lg:col-span-2">
          {rejoinNotice && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-900/40 border border-amber-700 text-amber-200 text-sm flex items-start justify-between gap-3">
              <span>{rejoinNotice}</span>
              <button
                onClick={() => setRejoinNotice(null)}
                className="text-amber-300 hover:text-amber-100 shrink-0"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
          <Lobby
            onReady={() => setInLobby(false)}
            setRoomId={setRoomId}
            setRole={setRole}
            onNameSaved={setMyName}
            onOpenGuide={() => setShowGuide(true)}
          />
        </div>
        <div className="space-y-5 sm:space-y-6">
          <LobbyUsersPanel socket={socket} myName={myName} />
          <ChatPanel
            socket={socket}
            roomId={roomId}
            role={role}
            playerName={chatDisplayName}
            messages={chat}
            onHistory={handleChatHistory}
            onPush={handleChatPush}
            globalMessages={globalChat}
            onGlobalHistory={handleGlobalChatHistory}
            onGlobalPush={handleGlobalChatPush}
          />
        </div>
      </div>
    );
  }

  // `team` is purely local, in-memory state (this player's own draft picks,
  // set once CharacterSelect calls onSelect) — it's never persisted, so a
  // rejoin after a page reload never has it even when the match has long
  // since moved past drafting. `game` is authoritative and comes straight
  // from the server on rejoin, so once it exists there's no reason to
  // gate on `team` at all — fall through to the battle render below
  // instead of incorrectly bouncing a mid-battle rejoin back to
  // CharacterSelect.
  if (!team && !game) {
    return (
      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6 p-4 sm:p-6">
        <div className="lg:col-span-2">
          <CharacterSelect
            roomId={roomId}
            role={role}
            onSelect={(chosen) => setTeam(chosen)}
            onLeave={leaveToLobby}
          />
        </div>
        <ChatPanel
          socket={socket}
          roomId={roomId}
          role={role}
          playerName={chatDisplayName}
          messages={chat}
          onHistory={handleChatHistory}
          onPush={handleChatPush}
          globalMessages={globalChat}
          onGlobalHistory={handleGlobalChatHistory}
          onGlobalPush={handleGlobalChatPush}
        />
      </div>
    );
  }

  if (team && waiting && !game && !cutscene) {
    return (
      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6 p-4 sm:p-6">
        <div className="lg:col-span-2 flex flex-col items-center justify-center text-center mt-6 sm:mt-10 gap-3">
          <div className="h-9 w-9 rounded-full border-4 border-gold-500/30 border-t-gold-400 animate-spin mb-1" />
          <h2 className="font-display text-2xl font-bold text-gold-300">Hayashi Academy Arena</h2>
          <p className="text-slate-400 text-sm">Waiting for opponent to select their team...</p>
          <button
            onClick={leaveToLobby}
            className="mt-2 text-xs px-4 py-2 rounded-lg bg-panel-raised hover:bg-panel-line text-slate-300 border border-panel-line transition"
          >
            Return to Lobby
          </button>
        </div>
        <ChatPanel
          socket={socket}
          roomId={roomId}
          role={role}
          playerName={chatDisplayName}
          messages={chat}
          onHistory={handleChatHistory}
          onPush={handleChatPush}
          globalMessages={globalChat}
          onGlobalHistory={handleGlobalChatHistory}
          onGlobalPush={handleGlobalChatPush}
        />
      </div>
    );
  }

  if (cutscene && !game) {
    return (
      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6 p-4 sm:p-6">
        <div className="lg:col-span-2">
          <PreBattleCutscene
            cutscene={cutscene}
            onDone={() => socket.emit("cutsceneComplete", { roomId })}
            onLeave={leaveToLobby}
          />
        </div>
        <ChatPanel
          socket={socket}
          roomId={roomId}
          role={role}
          playerName={chatDisplayName}
          messages={chat}
          onHistory={handleChatHistory}
          onPush={handleChatPush}
          globalMessages={globalChat}
          onGlobalHistory={handleGlobalChatHistory}
          onGlobalPush={handleGlobalChatPush}
        />
      </div>
    );
  }

  if (game) {
    const myTeam = game.teams?.[role] ?? [];
    const enemyRole = role === "A" ? "B" : "A";
    const enemyTeam = game.teams?.[enemyRole] ?? [];
    const leftName = role === "A" ? myName : names.A;
    const rightName = role === "B" ? myName : names.B;

    return (
      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6 p-4 sm:p-6">
        <div className="lg:col-span-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 text-gold-300">
            Battle Arena — 5v5
          </h1>
          <div className="text-slate-400 text-sm mb-3">
            <span className="text-teamA-400 font-medium">{leftName || "Player A"}</span>
            {" "}vs{" "}
            <span className="text-teamB-400 font-medium">{rightName || "Player B"}</span>
          </div>
          {opponentStatus && (
            <div className="mb-3 px-4 py-2 rounded-xl bg-amber-900/40 border border-amber-700 text-amber-200 text-sm">
              {(opponentStatus.role === "A" ? leftName : rightName) || "Your opponent"} disconnected — waiting up to{" "}
              {Math.round((opponentStatus.graceMs || 30000) / 1000)}s for them to reconnect…
            </div>
          )}
          <div className={`text-sm mb-4 px-3.5 py-2 rounded-xl inline-block ${game.over ? "text-slate-400" : (game?.actor && role === game.actor.role) ? "bg-gold-500/15 text-gold-300 font-semibold" : "text-slate-400 bg-panel"}`}>
            {game.over
              ? "Match finished."
              : (game?.actor && role === game.actor.role)
              ? `Your turn — ${game.teams[game.actor.role][game.actor.i]?.name}`
              : `Waiting… ${game.teams[game.actor.role][game.actor.i]?.name} is acting`}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
            <TeamGrid
              label={`Your Team (${role})`}
              team={myTeam}
              side="left"
              selected={target?.role === role ? target.index : null}
              onSelect={(i) => selectMyTarget(role, i)}
              highlight={iAmActing && pendingMove?.desiredRole === role}
            />
            <TeamGrid
              label={`Opponent (${enemyRole})`}
              team={enemyTeam}
              side="right"
              selected={target?.role === enemyRole ? target.index : null}
              onSelect={(i) => selectMyTarget(enemyRole, i)}
              highlight={iAmActing && pendingMove?.desiredRole === enemyRole}
            />
          </div>

          <div className="mt-3 text-xs text-slate-400 text-center">
            {pendingMove
              ? canConfirm
                ? `${pendingMove.label} ready — press Confirm to use it.`
                : `${pendingMove.label}: tap a highlighted target, then press Confirm.`
              : target
              ? `Target: ${target.role} #${target.index + 1} — ${
                  game.teams[target.role][target.index].name
                }`
              : "Select a target for single-target skills (when required)."}
          </div>

          <MovesPanel
            myUnit={game?.teams?.[game.actor.role]?.[game.actor.i] || {}}
            myTeam={game?.teams?.[game.actor.role] || []}
            canAct={iAmActing && !game.over}
            onUse={chooseMove}
            pendingMove={iAmActing ? pendingMove : null}
            onCancelPending={() => { setPendingMove(null); setTarget(null); }}
            canConfirm={iAmActing ? canConfirm : false}
            onConfirm={confirmAction}
          />

          <div className="mt-6 panel p-4 max-w-3xl text-left">
            <h2 className="font-display text-lg font-bold mb-2 text-slate-100">Battle Log</h2>
            <div ref={logRef} className="h-48 overflow-y-auto space-y-1 bg-ink-950 rounded-lg p-3">
              {log.map((entry, i) => (
                <p key={i} className="text-sm text-slate-300">{entry}</p>
              ))}
            </div>
          </div>

          {game.over && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => socket.emit("saveReplay", { roomId })}
                className="px-5 py-2.5 rounded-xl bg-teamA-500 hover:bg-teamA-400 text-ink-950 font-display font-bold transition"
              >
                Save Replay
              </button>
              <button
                onClick={leaveToLobby}
                className="px-5 py-2.5 rounded-xl bg-panel-raised hover:bg-panel-line text-slate-200 font-display font-bold border border-panel-line transition"
              >
                Back to Lobby
              </button>
            </div>
          )}

          {replayId && <ReplayViewer replayId={replayId} />}
        </div>

        <ChatPanel
          socket={socket}
          roomId={roomId}
          role={role}
          playerName={chatDisplayName}
          messages={chat}
          onHistory={handleChatHistory}
          onPush={handleChatPush}
          globalMessages={globalChat}
          onGlobalHistory={handleGlobalChatHistory}
          onGlobalPush={handleGlobalChatPush}
        />
      </div>
    );
  }

  return <div className="text-center mt-20 text-gray-400">Loading...</div>;
}
