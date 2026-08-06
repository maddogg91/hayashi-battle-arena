import { useEffect, useRef, useState } from "react";

export default function ChatPanel({
  socket,
  roomId,
  role = "?",
  playerName = "",
  messages = [],
  onHistory = () => {},
  onPush = () => {},
  globalMessages = [],
  onGlobalHistory = () => {},
  onGlobalPush = () => {},
}) {
  const [mode, setMode] = useState("personal"); // 'personal' | 'global'
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  const activeMessages = mode === "personal" ? messages : globalMessages;

  // autoscroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages, mode]);

  // wire socket listeners if parent didn't already
  useEffect(() => {
    const onHistoryMsg = (hist) => onHistory(hist);
    const onNewMsg = (msg) => onPush(msg);
    const onGlobalHistoryMsg = (hist) => onGlobalHistory(hist);
    const onGlobalNewMsg = (msg) => onGlobalPush(msg);
    socket.on("chatHistory", onHistoryMsg);
    socket.on("chatMessage", onNewMsg);
    socket.on("globalChatHistory", onGlobalHistoryMsg);
    socket.on("globalChatMessage", onGlobalNewMsg);
    socket.emit("globalChatHistoryRequest");
    return () => {
      socket.off("chatHistory", onHistoryMsg);
      socket.off("chatMessage", onNewMsg);
      socket.off("globalChatHistory", onGlobalHistoryMsg);
      socket.off("globalChatMessage", onGlobalNewMsg);
    };
  }, [socket, onHistory, onPush, onGlobalHistory, onGlobalPush]);

  const send = () => {
    const t = input.trim();
    if (!t) return;
    if (mode === "personal") {
      if (!roomId) return;
      socket.emit("chatSend", {
        roomId,
        text: t,
        role,
        name: playerName || `Player ${role}`,
      });
    } else {
      socket.emit("globalChatSend", { text: t, name: playerName || "Player" });
    }
    setInput("");
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const tsFmt = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const canSendPersonal = mode === "personal" ? !!roomId : true;

  return (
    <div className="flex flex-col h-80 bg-gray-800 rounded-xl border border-gray-700">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-semibold text-gray-200">Chat</span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("personal")}
            className={`text-xs px-2 py-1 rounded ${mode === "personal" ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            Personal
          </button>
          <button
            onClick={() => setMode("global")}
            className={`text-xs px-2 py-1 rounded ${mode === "global" ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            Global
          </button>
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {mode === "personal" && !roomId && (
          <div className="text-xs text-gray-400">You'll be able to chat privately with your opponent once matched.</div>
        )}
        {activeMessages.map((m) => (
          <div key={m.id} className="text-xs">
            <span className={`font-semibold ${m.role === "A" ? "text-green-300" : m.role === "B" ? "text-blue-300" : "text-gray-300"}`}>
              {m.name}
            </span>
            <span className="text-gray-500 ml-2">{tsFmt(m.ts)}</span>
            <div className="text-gray-200 whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
        {!activeMessages.length && (mode === "global" || roomId) && (
          <div className="text-xs text-gray-400">
            {mode === "personal" ? "Say hello to your opponent 👋" : "Say hello to the lobby 👋"}
          </div>
        )}
      </div>
      <div className="p-2 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!canSendPersonal}
            placeholder={canSendPersonal ? "Type a message…" : "Waiting for a match…"}
            className="flex-1 resize-none rounded-lg bg-gray-900 text-gray-200 p-2 text-sm outline-none border border-gray-700 focus:border-gray-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={!canSendPersonal}
            className="px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
