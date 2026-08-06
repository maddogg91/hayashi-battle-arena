import { useEffect, useState } from "react";
import { socket } from "../api/socket";
import Lobby from "./Lobby";
import CharacterSelect from "./CharacterSelect";
import TeamGrid from "../components/TeamGrid";
import MovesPanel from "../components/MovesPanel";
import ReplayViewer from "../components/ReplayViewer";
import PreBattleCutscene from "../components/PreBattleCutscene";
import ChatPanel from "../components/ChatPanel";

export default function Game() {
  // Flow
  const [inLobby, setInLobby] = useState(true);
  const [waiting, setWaiting] = useState(true);

  // Net/Game
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null); // "A" | "B"
  const [team, setTeam] = useState(null);
  const [game, setGame] = useState(null);
  const [log, setLog] = useState([]);
  const [replayId, setReplayId] = useState(null);

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

  // Chat
  const [chat, setChat] = useState([]);
  const handleChatHistory = (hist) => setChat(hist || []);
  const handleChatPush = (msg) => setChat((c) => [...c, msg]);
  const chatDisplayName = myName || (role ? `Player ${role}` : "Player");

  // load my saved name
  useEffect(() => {
    const saved = localStorage.getItem("hayashi_player_name");
    if (saved) setMyName(saved);
  }, []);

  // Socket listeners (single mount)
  useEffect(() => {
    const onMatched = ({ roomId, role, names }) => {
      setRoomId(roomId);
      setRole(role);
      if (names) setNames(names);
      setInLobby(false);
      setWaiting(true);
    };

    const onLobbyComplete = ({ roomId, names }) => {
      // legacy support
      if (roomId) setRoomId(roomId);
      if (names) setNames(names);
      setInLobby(false);
      setWaiting(true);
    };

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
      setWaiting(true);
      setGame(null);
      setLog(["Opponent left the arena."]);
      setTeam(null);
      setTarget(null);
      setPendingMove(null);
      setReplayId(null);
      setCutscene(null);
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

    return () => {
      socket.off("matched", onMatched);
      socket.off("lobbyComplete", onLobbyComplete);
      socket.off("playerNames", onNames);
      socket.off("preBattleDialogue", onCutscene);
      socket.off("startGame", onStartGame);
      socket.off("updateGame", onUpdateGame);
      socket.off("opponentLeft", onOpponentLeft);
      socket.off("replaySaved", onReplaySaved);
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

  const executeMove = (moveKey, forcedTarget) => {
    if (!iAmActing || game?.over) return;
    const myUnit = currentActor;
    if (!myUnit) return;

    const m = (myUnit.skills || []).find((s) => s.key === moveKey);
    if (!m || (myUnit.sp ?? 0) < (m.cost || 0)) return;
    const needs = m?.target || "none";

    const payload = { move: moveKey };
    if (needs === "self") {
      payload.target = { role, index: game.actor.i };
    } else if (needs === "enemy" || needs === "ally") {
      const t = forcedTarget || target;
      if (!t) return;
      const desiredRole = needs === "ally" ? role : role === "A" ? "B" : "A";
      if (t.role !== desiredRole) return;
      payload.target = t;
    }
    socket.emit("playerMove", { roomId, move: payload, role });
    setTarget(null);
    setPendingMove(null);
  };

  // Clicking a move either fires immediately (self/AOE, or a target was
  // already picked on the grid) or — for enemy/ally moves with no target
  // yet — arms "pending" mode so the next grid tap fires it, in whichever
  // order the player prefers.
  const chooseMove = (moveKey) => {
    if (!iAmActing || game?.over) return;
    const myUnit = currentActor;
    if (!myUnit) return;

    const m = (myUnit.skills || []).find((s) => s.key === moveKey);
    if (!m || (myUnit.sp ?? 0) < (m.cost || 0)) return;
    const needs = m?.target || "none";

    if (needs === "enemy" || needs === "ally") {
      const desiredRole = needs === "ally" ? role : role === "A" ? "B" : "A";
      if (target && target.role === desiredRole) {
        executeMove(moveKey, target);
      } else {
        setPendingMove({ key: moveKey, label: m.label, needs, desiredRole });
      }
    } else {
      executeMove(moveKey);
    }
  };

  const selectMyTarget = (whoRole, idx) => {
    if (!iAmActing) return;
    const unit = game?.teams?.[whoRole]?.[idx];
    if (!unit || unit.hp <= 0) return;
    if (pendingMove && pendingMove.desiredRole === whoRole) {
      executeMove(pendingMove.key, { role: whoRole, index: idx });
      return;
    }
    setTarget({ role: whoRole, index: idx });
  };

  // ---- Renders ----
  if (inLobby) {
    return (
      <div className="grid md:grid-cols-3 gap-6 p-6">
        <div className="md:col-span-2">
          <Lobby
            onReady={() => setInLobby(false)}
            setRoomId={setRoomId}
            setRole={setRole}
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
        />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="grid md:grid-cols-3 gap-6 p-6">
        <div className="md:col-span-2">
          <CharacterSelect
            roomId={roomId}
            role={role}
            onSelect={(chosen) => setTeam(chosen)}
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
        />
      </div>
    );
  }

  if (team && waiting && !game && !cutscene) {
    return (
      <div className="grid md:grid-cols-3 gap-6 p-6">
        <div className="md:col-span-2 text-center mt-10 text-yellow-400">
          <h2 className="text-2xl font-bold mb-4">Hayashi Academy Arena</h2>
          <p>Waiting for opponent to select their team...</p>
        </div>
        <ChatPanel
          socket={socket}
          roomId={roomId}
          role={role}
          playerName={chatDisplayName}
          messages={chat}
          onHistory={handleChatHistory}
          onPush={handleChatPush}
        />
      </div>
    );
  }

  if (cutscene && !game) {
    return (
      <div className="grid md:grid-cols-3 gap-6 p-6">
        <div className="md:col-span-2">
          <PreBattleCutscene
            cutscene={cutscene}
            onDone={() => socket.emit("cutsceneComplete", { roomId })}
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
      <div className="grid md:grid-cols-3 gap-6 p-6 bg-gray-900 min-h-screen text-gray-200">
        <div className="md:col-span-2">
          <h1 className="text-3xl font-bold mb-1 text-yellow-400">
            Hayashi Academy Battle Arena — 5v5
          </h1>
          <div className="text-gray-400 text-sm mb-3">
            👤 {leftName || "Player A"} vs 👤 {rightName || "Player B"}
          </div>
          <div className="text-sm text-gray-400 mb-4">
            {game.over
              ? "Match finished."
              : (game?.actor && role === game.actor.role)
              ? `Your turn — ${game.teams[game.actor.role][game.actor.i]?.name}`
              : `Waiting… ${game.teams[game.actor.role][game.actor.i]?.name} is acting`}
          </div>

          <div className="grid grid-cols-2 gap-6 max-w-6xl">
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

          <div className="mt-2 text-xs text-gray-300">
            {pendingMove
              ? `${pendingMove.label}: tap a highlighted target to use it.`
              : target
              ? `Target: ${target.role} #${target.index + 1} — ${
                  game.teams[target.role][target.index].name
                }`
              : "Select a target for single-target skills (when required)."}
          </div>

          <MovesPanel
            myUnit={game?.teams?.[game.actor.role]?.[game.actor.i] || {}}
            canAct={iAmActing && !game.over}
            onUse={chooseMove}
            pendingMove={iAmActing ? pendingMove : null}
            onCancelPending={() => setPendingMove(null)}
          />

          <div className="mt-6 bg-gray-800 p-4 rounded-lg max-w-3xl text-left">
            <h2 className="text-xl mb-2">Battle Log</h2>
            <div className="h-48 overflow-y-auto space-y-1">
              {log.map((entry, i) => (
                <p key={i} className="text-sm">{entry}</p>
              ))}
            </div>
          </div>

          {game.over && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => socket.emit("saveReplay", { roomId })}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 font-semibold"
              >
                Save Replay
              </button>
              <button
                onClick={() => {
                  setInLobby(true);
                  setTeam(null);
                  setGame(null);
                  setLog([]);
                  setReplayId(null);
                  setTarget(null);
                  setPendingMove(null);
                  setCutscene(null);
                  setChat([]);
                }}
                className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold"
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
        />
      </div>
    );
  }

  return <div className="text-center mt-20 text-gray-400">Loading...</div>;
}
