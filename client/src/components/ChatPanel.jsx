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
    <div className="flex flex-col h-72 lg:h-80 panel">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-panel-line">
        <span className="font-display text-sm font-bold text-slate-200 tracking-wide">Chat</span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("personal")}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${mode === "personal" ? "bg-gold-500 text-ink-950" : "bg-panel-line text-slate-300 hover:bg-panel-line/70"}`}
          >
            Personal
          </button>
          <button
            onClick={() => setMode("global")}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${mode === "global" ? "bg-gold-500 text-ink-950" : "bg-panel-line text-slate-300 hover:bg-panel-line/70"}`}
          >
            Global
          </button>
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2">
        {mode === "personal" && !roomId && (
          <div className="text-xs text-slate-500">You'll be able to chat privately with your opponent once matched.</div>
        )}
        {activeMessages.map((m) => (
          <div key={m.id} className="text-xs">
            <span className={`font-semibold ${m.role === "A" ? "text-teamA-400" : m.role === "B" ? "text-teamB-400" : "text-slate-300"}`}>
              {m.name}
            </span>
            <span className="text-slate-600 ml-2">{tsFmt(m.ts)}</span>
            <div className="text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
        {!activeMessages.length && (mode === "global" || roomId) && (
          <div className="text-xs text-slate-500">
            {mode === "personal" ? "Say hello to your opponent 👋" : "Say hello to the lobby 👋"}
          </div>
        )}
      </div>
      <div className="p-2.5 border-t border-panel-line">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!canSendPersonal}
            placeholder={canSendPersonal ? "Type a message…" : "Waiting for a match…"}
            className="flex-1 resize-none rounded-xl bg-ink-950 text-slate-200 px-3 py-2 text-sm outline-none border border-panel-line focus:border-gold-500 disabled:opacity-50 placeholder:text-slate-500"
          />
          <button
            onClick={send}
            disabled={!canSendPersonal}
            className="px-3.5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-ink-950 text-sm font-bold transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
