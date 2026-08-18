import { useEffect, useState } from "react";

const statusChip = (s) => {
  const map = {
    idle: "bg-panel-line text-slate-300",
    queued: "bg-teamA-500/20 text-teamA-400 border border-teamA-500/40",
    private_wait: "bg-teamB-500/20 text-teamB-400 border border-teamB-500/40",
    playing: "bg-panel-line text-slate-400",
  };
  return map[s] || "bg-panel-line text-slate-300";
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
    <div className="panel p-4 h-72 lg:h-[28rem] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-sm font-bold text-slate-200 tracking-wide">Players in Lobby</h3>
        <span className="text-xs text-slate-500 bg-ink-950 px-2 py-0.5 rounded-full">{users.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
        {users.length === 0 && (
          <div className="text-xs text-slate-500">No one's here yet. Be the first!</div>
        )}
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between bg-ink-950 rounded-lg px-3 py-2">
            <div className="text-sm text-slate-200 truncate">{u.name === myName ? `${u.name} (you)` : u.name}</div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusChip(u.status)}`}>
                {u.status.replace("_", " ")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-2 text-[10px] text-slate-600">
        idle = in lobby · queued = public queue · private_wait = waiting in a private room
      </div>
    </div>
  );
}
