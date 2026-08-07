import { useEffect, useState } from "react";
import { socket } from "../api/socket";
import LobbyUsersPanel from "../components/LobbyUsersPanel";
import ReportBugModal from "../components/ReportBugModal";

export default function Lobby({ onReady, setRoomId, setRole, onNameSaved, onOpenGuide }) {
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [code, setCode] = useState("");
  const [privStatus, setPrivStatus] = useState("");
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [waitingCode, setWaitingCode] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);

  // Load saved name + announce presence if we already have one
  useEffect(() => {
    const saved = localStorage.getItem("hayashi_player_name");
    if (saved) {
      setName(saved);
      setHasName(true);
      socket.emit("presenceHello", { name: saved });
      onNameSaved?.(saved);
    }
  }, []);

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
      <div className="flex flex-col items-center justify-center min-h-screen text-gray-200 bg-gray-900">
        <h1 className="text-3xl font-bold mb-6 text-yellow-400">
          Hayashi Academy Battle Arena
        </h1>
        <div className="bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md">
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Enter your name:
          </label>
          <input
            type="text"
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-4 p-2 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:border-yellow-500 text-gray-100"
            placeholder="Your name..."
          />
          <button
            onClick={saveName}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 rounded-lg"
          >
            Continue
          </button>
        </div>
        <p className="mt-6 text-sm text-gray-400">
          Your name is stored locally for next time.
        </p>
        <button
          onClick={() => setShowReportModal(true)}
          className="mt-4 text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
        >
          🐛 Report a Bug
        </button>
        {showReportModal && (
          <ReportBugModal name={name || "Anonymous"} onClose={() => setShowReportModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6 p-6 min-h-screen bg-gray-900 text-gray-200">
      <div className="md:col-span-2 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-400">Welcome, {name}!</h1>
          <div className="flex gap-2">
            {onOpenGuide && (
              <button
                onClick={onOpenGuide}
                className="text-sm px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 font-semibold"
              >
                📖 Character Guide
              </button>
            )}
            <button
              onClick={() => setShowReportModal(true)}
              className="text-sm px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold"
            >
              🐛 Report a Bug
            </button>
          </div>
        </div>
        {showReportModal && (
          <ReportBugModal name={name} onClose={() => setShowReportModal(false)} />
        )}

        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h2 className="text-lg font-semibold text-yellow-400 mb-3">What's New</h2>
          <ul className="text-sm text-gray-300 space-y-1.5 list-disc list-inside">
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
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Match */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-2">Find a Match</h2>
            <p className="text-sm text-gray-400 mb-4">
              Enter the public queue and get paired with the next available player.
            </p>
            <button
              onClick={findMatch}
              disabled={loadingPublic}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
            >
              {loadingPublic ? "Searching…" : "Find Match"}
            </button>
          </div>

          {/* Private Match */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-2">Private Match</h2>
            <p className="text-sm text-gray-400 mb-3">
              Share a passcode with a friend. The match starts when both join with the same code.
            </p>
            <input
              type="text"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter passcode (e.g., HAYA1234)"
              className="w-full mb-3 p-2 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:border-yellow-500 text-gray-100"
            />
            <button
              onClick={startPrivate}
              disabled={loadingPrivate || !code.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg"
            >
              {loadingPrivate ? "Connecting…" : "Start Private Match"}
            </button>

            {privStatus === "waiting" && (
              <div className="mt-3 text-sm text-gray-300">
                Waiting for an opponent to join with passcode{" "}
                <span className="font-semibold text-yellow-300">{waitingCode}</span>…
                <button
                  onClick={cancelPrivate}
                  className="ml-3 text-xs px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-semibold"
                >
                  Cancel
                </button>
              </div>
            )}
            {privStatus === "error" && (
              <div className="mt-3 text-sm text-red-400">
                Could not start private match. Try a different code.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Lobby list */}
      <LobbyUsersPanel socket={socket} myName={name} />
    </div>
  );
}
