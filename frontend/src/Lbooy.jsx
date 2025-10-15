import { useState, useEffect } from "react";
import { socket } from "./api";

export default function Lobby({ onReady, setRoomId, setRole }) {
  const [roomInput, setRoomInput] = useState("");
  const [roomJoined, setRoomJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [ready, setReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  useEffect(() => {
    socket.on("playerRole", (r) => {
      setRole(r);
    });

    socket.on("updateLobby", (lobby) => {
      setPlayers(lobby.players);
      setOpponentReady(lobby.ready.A && lobby.ready.B);
      if (lobby.ready.A && lobby.ready.B) {
        onReady();
      }
    });

    return () => {
      socket.off("playerRole");
      socket.off("updateLobby");
    };
  }, []);

  const joinRoom = () => {
    if (!roomInput) return;
    setRoomId(roomInput);
    socket.emit("joinRoom", roomInput);
    setRoomJoined(true);
  };

  const markReady = () => {
    setReady(true);
    socket.emit("playerReady");
  };

  if (!roomJoined) {
    return (
      <div className="text-center mt-20">
        <h1 className="text-3xl mb-6 font-bold text-yellow-400">
          Hayashi Academy Battle Arena
        </h1>
        <input
          type="text"
          placeholder="Enter Room Name"
          className="p-2 rounded-md text-black"
          value={roomInput}
          onChange={(e) => setRoomInput(e.target.value)}
        />
        <button
          onClick={joinRoom}
          className="ml-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700"
        >
          Join Room
        </button>
      </div>
    );
  }
