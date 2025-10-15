import { useEffect, useState } from "react";
import { socket } from "./api";
import LobbyUsersPanel from "./components/LobbyUsersPanel";

export default function Lobby({ onReady, setRoomId, setRole }) {
  const [name, setName] = useState("");
  const [hasName, setHasName] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [code, setCode] = useState("");
  const [privStatus, setPrivStatus] = useState("");
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [waitingCode, setWaitingCode] = useState("");

  // Load saved name + announce presence if we already have one
  useEffect(() => {
    const saved = localStorage.getItem("hayashi_player_name");
    if (saved) {
      setName(saved);
      setHasName(true);
      socket.emit("presenceHello", { name: saved });
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
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6 p-6 min-h-screen bg-gray-900 text-gray-200">
      <div className="md:col-span-2 space-y-6">
        <h1 className="text-3xl font-bold text-yellow-400">Welcome, {name}!</h1>

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
