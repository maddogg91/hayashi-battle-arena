import { useEffect, useRef, useState } from "react";

export default function ChatPanel({
  socket,
  roomId,
  role = "?",
  playerName = "",
  messages = [],
  onHistory = () => {},
  onPush = () => {},
}) {
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  // autoscroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // wire socket listeners if parent didn't already
  useEffect(() => {
    const onHistoryMsg = (hist) => onHistory(hist);
    const onNewMsg = (msg) => onPush(msg);
    socket.on("chatHistory", onHistoryMsg);
    socket.on("chatMessage", onNewMsg);
    return () => {
      socket.off("chatHistory", onHistoryMsg);
      socket.off("chatMessage", onNewMsg);
    };
  }, [socket, onHistory, onPush]);

  const send = () => {
    const t = input.trim();
    if (!t || !roomId) return;
    socket.emit("chatSend", {
      roomId,
      text: t,
      role,
      name: playerName || `Player ${role}`,
    });
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

  return (
    <div className="flex flex-col h-80 bg-gray-800 rounded-xl border border-gray-700">
      <div className="px-3 py-2 text-sm font-semibold text-gray-200 border-b border-gray-700">
        Room Chat
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-xs">
            <span className={`font-semibold ${m.role === "A" ? "text-green-300" : m.role === "B" ? "text-blue-300" : "text-gray-300"}`}>
              [{m.role}] {m.name}
            </span>
            <span className="text-gray-500 ml-2">{tsFmt(m.ts)}</span>
            <div className="text-gray-200 whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
        {!messages.length && (
          <div className="text-xs text-gray-400">Say hello to your opponent 👋</div>
        )}
      </div>
      <div className="p-2 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Type a message…"
            className="flex-1 resize-none rounded-lg bg-gray-900 text-gray-200 p-2 text-sm outline-none border border-gray-700 focus:border-gray-500"
          />
          <button
            onClick={send}
            className="px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-sm font-semibold"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
