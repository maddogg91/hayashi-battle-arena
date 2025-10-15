import { useEffect, useState } from "react";

const statusChip = (s) => {
  const map = {
    idle: "bg-gray-700 text-gray-200",
    queued: "bg-green-700 text-white",
    private_wait: "bg-blue-700 text-white",
    playing: "bg-gray-600 text-gray-300",
  };
  return map[s] || "bg-gray-700 text-gray-200";
};

export default function LobbyUsersPanel({ socket, myName }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const onList = (list) => setUsers(list || []);
    socket.on("lobbyUsers", onList);
    socket.emit("lobbyListRequest");
    return () => socket.off("lobbyUsers", onList);
  }, [socket]);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 h-[28rem] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-200">Players in Lobby</h3>
        <span className="text-xs text-gray-400">{users.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {users.length === 0 && (
          <div className="text-xs text-gray-400">No one’s here yet. Be the first!</div>
        )}
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
            <div className="text-sm text-gray-200 truncate">{u.name === myName ? `${u.name} (you)` : u.name}</div>
            <div className="flex items-center gap-2">
              {u.status === "private_wait" && u.passcode && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-700 text-yellow-100">
                  Code: {u.passcode}
                </span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded ${statusChip(u.status)}`}>
                {u.status.replace("_", " ")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-2 text-[10px] text-gray-500">
        Status legend: idle = in lobby, queued = public queue, private_wait = waiting in a private room.
      </div>
    </div>
  );
}
