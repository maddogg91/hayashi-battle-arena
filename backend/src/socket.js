// backend/src/socket.js
// Hayashi Academy — matchmaking, private rooms, presence, chat, cutscene, battle

import { Server } from "socket.io";
import crypto from "crypto";
import { initGame, handleMove, getGame } from "./game/engine.js";

/**
 * Room shape:
 * rooms[roomId] = {
 *   id, status: 'lobby'|'select'|'cutscene'|'battle'|'over', createdAt,
 *   players: { A: socketId|null, B: socketId|null },
 *   names:   { A: string, B: string },
 *   selections: { A: null|arrayOf5, B: null|arrayOf5 },
 *   chat: [{ id, text, name, role, ts }],
 *   cutsceneAck: { A:false, B:false },
 *   isPrivate: boolean, passcode: string|null
 * }
 */

const rooms = Object.create(null);
const passcodeRooms = Object.create(null);    // passcode -> roomId
const replays = Object.create(null);          // simple in-memory replay store

// Public queue
const waitQueue = [];                          // sockets waiting for public match
const inQueue = new Set();                     // socket.id currently queued

// Lobby presence (global)
const presence = Object.create(null);
// presence[socket.id] = { id, name, status: 'idle'|'queued'|'private_wait'|'playing', passcode?: string|null }

const rid = (len = 8) => crypto.randomBytes(len).toString("hex");
const now = () => Date.now();

/* -------------------- Presence helpers -------------------- */
function presenceList() {
  // Show everyone not "playing" so active matches don't clutter the lobby
  return Object.values(presence)
    .filter(p => p.status !== "playing")
    .map(p => ({ id: p.id, name: p.name, status: p.status, passcode: p.passcode || null }));
}
function broadcastPresence(io) {
  io.emit("lobbyUsers", presenceList());
}
function setPresence(io, socket, patch) {
  const base = presence[socket.id] || {
    id: socket.id,
    name: socket.data?.name || "Player",
    status: "idle",
    passcode: null
  };
  presence[socket.id] = { ...base, ...patch };
  broadcastPresence(io);
}
function clearPresence(io, socket) {
  if (presence[socket.id]) {
    delete presence[socket.id];
    broadcastPresence(io);
  }
}

/* -------------------- Room helpers -------------------- */
function ensureRoom(roomId) {
  rooms[roomId] ||= {
    id: roomId,
    status: "lobby",
    createdAt: now(),
    players: { A: null, B: null },
    names: { A: "Player A", B: "Player B" },
    selections: { A: null, B: null },
    chat: [],
    cutsceneAck: { A: false, B: false },
    isPrivate: false,
    passcode: null,
  };
  return rooms[roomId];
}
function opponentRole(role) { return role === "A" ? "B" : "A"; }
function safeEmit(io, roomId, event, payload) { try { io.to(roomId).emit(event, payload); } catch {} }
function safeLeaveQueue(socket) {
  if (inQueue.has(socket.id)) {
    inQueue.delete(socket.id);
    const i = waitQueue.findIndex(s => s.id === socket.id);
    if (i >= 0) waitQueue.splice(i, 1);
  }
}
function maybeCleanupRoom(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  const aliveA = r.players.A && r.players.A !== "__LEFT__";
  const aliveB = r.players.B && r.players.B !== "__LEFT__";
  if (!aliveA && !aliveB) {
    if (r.isPrivate && r.passcode) delete passcodeRooms[r.passcode];
    delete rooms[roomId];
  }
}

/* -------------------- Pairing helpers -------------------- */
function emitMatched(io, s, roomId, role) {
  const room = rooms[roomId];
  const payload = { roomId, role, names: room.names };
  s.emit("matched", payload);
}

function markPlaying(io, socket) {
  setPresence(io, socket, { status: "playing", passcode: null });
}

function pairPlayers(io, s1, s2) {
  safeLeaveQueue(s1);
  safeLeaveQueue(s2);

  const roomId = `rm_${rid(6)}`;
  const room = ensureRoom(roomId);

  // roles
  room.players.A = s1.id;
  room.players.B = s2.id;
  room.status = "select";

  // names
  room.names.A = (s1.data.name || "Player A").slice(0, 40);
  room.names.B = (s2.data.name || "Player B").slice(0, 40);

  // bind + join
  s1.data.roomId = roomId; s1.data.role = "A";
  s2.data.roomId = roomId; s2.data.role = "B";
  s1.join(roomId); s2.join(roomId);

  // definitive event
  emitMatched(io, s1, roomId, "A");
  emitMatched(io, s2, roomId, "B");

  // chat history
  s1.emit("chatHistory", room.chat);
  s2.emit("chatHistory", room.chat);

  // legacy compat (optional)
  io.to(roomId).emit("playerNames", room.names);
  io.to(roomId).emit("lobbyComplete", { roomId, names: room.names });

  // presence
  markPlaying(io, s1);
  markPlaying(io, s2);
}

function enqueueOrPair(io, socket, name) {
  socket.data.name = (name || "").slice(0, 40) || "Player";
  // Try to pair with someone already waiting
  while (waitQueue.length) {
    const other = waitQueue.shift();
    if (other?.connected && inQueue.has(other.id)) {
      inQueue.delete(other.id);
      return pairPlayers(io, other, socket);
    }
  }
  // Otherwise, enqueue if not already queued
  if (!inQueue.has(socket.id)) {
    inQueue.add(socket.id);
    waitQueue.push(socket);
  }
  socket.emit("queued");
}

/* -------------------- Private matchmaking -------------------- */
function privateMatch(io, socket, passcode, name) {
  socket.data.name = (name || "").slice(0, 40) || "Player";
  const code = (passcode || "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    socket.emit("privateError", { message: "Invalid passcode. Use 4–12 A–Z / 0–9." });
    return;
  }

  // Join existing?
  const existingRoomId = passcodeRooms[code];
  if (existingRoomId) {
    const room = rooms[existingRoomId];
    if (!room) {
      delete passcodeRooms[code];
    } else {
      // Seat A open?
      if (!room.players.A || room.players.A === "__LEFT__") {
        room.players.A = socket.id;
        room.names.A = socket.data.name || "Player A";
        room.status = "select";
        socket.data.roomId = room.id; socket.data.role = "A";
        socket.join(room.id);
        emitMatched(io, socket, room.id, "A");
        io.to(room.id).emit("playerNames", room.names);
        socket.emit("chatHistory", room.chat);
        markPlaying(io, socket);
        return;
      }
      // Seat B open?
      if (!room.players.B || room.players.B === "__LEFT__") {
        room.players.B = socket.id;
        room.names.B = socket.data.name || "Player B";
        room.status = "select";
        socket.data.roomId = room.id; socket.data.role = "B";
        socket.join(room.id);

        // notify both sides
        const sids = [room.players.A, room.players.B].filter(Boolean);
        sids.forEach((sid) => {
          const s = io.sockets.sockets.get(sid);
          if (s?.connected) emitMatched(io, s, room.id, s.data.role);
        });

        io.to(room.id).emit("playerNames", room.names);
        io.to(room.id).emit("lobbyComplete", { roomId: room.id, names: room.names });

        // presence
        sids.forEach((sid) => {
          const s = io.sockets.sockets.get(sid);
          if (s?.connected) markPlaying(io, s);
        });
        return;
      }
      // Full
      socket.emit("privateError", { message: "That passcode room is full. Try a different code." });
      return;
    }
  }

  // Create new private room; become A and wait
  const roomId = `rm_${rid(6)}`;
  const room = ensureRoom(roomId);
  room.isPrivate = true;
  room.passcode = code;
  passcodeRooms[code] = roomId;

  room.players.A = socket.id;
  room.names.A = socket.data.name || "Player A";
  room.status = "select";

  socket.data.roomId = roomId; socket.data.role = "A";
  socket.join(roomId);

  // presence: waiting in private
  setPresence(io, socket, { name: socket.data.name, status: "private_wait", passcode: code });

  // tell creator we're waiting
  socket.emit("privateWaiting", { roomId, passcode: code });
}

/* -------------------- Public API: init Socket.IO -------------------- */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    /* -------- Presence -------- */
    socket.on("presenceHello", ({ name } = {}) => {
      const nm = (name || "").trim().slice(0, 40) || "Player";
      socket.data.name = nm;
      setPresence(io, socket, { name: nm, status: "idle", passcode: null });
      socket.emit("lobbyUsers", presenceList()); // immediate snapshot
    });
    socket.on("lobbyListRequest", () => socket.emit("lobbyUsers", presenceList()));

    /* -------- Public queue -------- */
    socket.on("queue", ({ name } = {}) => {
      enqueueOrPair(io, socket, name);
      setPresence(io, socket, { name: (name || socket.data?.name || "Player").slice(0,40), status: "queued", passcode: null });
    });

    /* -------- Private passcode match -------- */
    socket.on("privateMatch", ({ passcode, name } = {}) =>
      privateMatch(io, socket, passcode, name)
    );

    /* -------- Manual room join (legacy/manual flow) -------- */
    socket.on("joinRoom", ({ roomId, role, name } = {}) => {
      if (!roomId || !role || !["A","B"].includes(role)) return;
      const room = ensureRoom(roomId);
      safeLeaveQueue(socket);

      room.players[role] = socket.id;
      room.names[role] = (name || `Player ${role}`).slice(0, 40);
      socket.data.roomId = roomId;
      socket.data.role = role;
      socket.data.name = room.names[role];
      socket.join(roomId);

      emitMatched(io, socket, roomId, role);
      io.to(roomId).emit("playerNames", room.names);
      socket.emit("chatHistory", room.chat || []);

      if (room.players.A && room.players.B) {
        room.status = "select";
        io.to(roomId).emit("lobbyComplete", { roomId, names: room.names });
        markPlaying(io, socket);
        const opp = io.sockets.sockets.get(room.players[opponentRole(role)]);
        if (opp?.connected) markPlaying(io, opp);
      }
    });

    /* -------- Character selection -------- */
    socket.on("selectCharacter", ({ roomId, role, characters }) => {
      const room = rooms[roomId];
      if (!room || !role || !Array.isArray(characters)) return;

      // constrain to 5 picks
      room.selections[role] = characters.slice(0, 5);

      if (room.selections.A && room.selections.B) {
        const gameState = initGame(room.selections, roomId);
        if (gameState.cutscene && gameState.cutscene.length) {
          room.status = "cutscene";
          room.cutsceneAck = { A: false, B: false };
          io.to(roomId).emit("preBattleDialogue", { cutscene: gameState.cutscene });
        } else {
          room.status = "battle";
          io.to(roomId).emit("startGame", gameState);
        }
      }
    });

    /* -------- Cutscene acknowledge -------- */
    socket.on("cutsceneComplete", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      const role = socket.data?.role;
      if (role !== "A" && role !== "B") return;
      room.cutsceneAck[role] = true;

      if (room.cutsceneAck.A && room.cutsceneAck.B) {
        const game = getGame(roomId);
        if (game) {
          room.status = "battle";
          io.to(roomId).emit("startGame", game);
        }
      }
    });

    /* -------- Battle turn -------- */
    socket.on("playerMove", ({ roomId, move, role }) => {
      const room = rooms[roomId];
      if (!room) return;
      const state = handleMove(roomId, role, move);
      io.to(roomId).emit("updateGame", state);
      if (state?.over) room.status = "over";
    });

    /* -------- Replay -------- */
    socket.on("saveReplay", ({ roomId }) => {
      const state = getGame(roomId);
      if (!state) return;
      const replayId = `rep_${rid(6)}`;
      replays[replayId] = {
        id: replayId,
        ts: now(),
        roomId,
        teams: state.teams,
        log: state.log,
      };
      io.to(roomId).emit("replaySaved", { replayId });
    });

    /* -------- Chat -------- */
    socket.on("chatSend", ({ roomId, text, name, role }) => {
      const room = rooms[roomId];
      if (!room || typeof text !== "string") return;

      const clean = text.trim().slice(0, 500);
      if (!clean) return;

      const msg = {
        id: `${now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: clean,
        name: (name || socket.data?.name || "").slice(0, 40) || `Player ${role || socket.data?.role || "?"}`,
        role: role || socket.data?.role || "?",
        ts: now(),
      };

      room.chat.push(msg);
      if (room.chat.length > 100) room.chat.shift();
      io.to(roomId).emit("chatMessage", msg);
    });

    /* -------- Disconnect -------- */
    socket.on("disconnect", () => {
      // Remove from queue if present
      safeLeaveQueue(socket);

      const roomId = socket.data?.roomId;
      const role = socket.data?.role;

      clearPresence(io, socket);

      if (!roomId || !role) return;

      const room = rooms[roomId];
      if (!room) return;

      room.players[role] = "__LEFT__";
      safeEmit(io, roomId, "opponentLeft", { role });
      maybeCleanupRoom(roomId);
    });
  });

  /* -------- Optional admin namespace -------- */
  io.of("/admin").on("connection", (socket) => {
    socket.emit("rooms", Object.values(rooms).map(r => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      players: { A: !!r.players.A && r.players.A !== "__LEFT__", B: !!r.players.B && r.players.B !== "__LEFT__" },
      selections: { A: !!r.selections.A, B: !!r.selections.B },
      chatCount: r.chat.length,
      isPrivate: !!r.isPrivate,
      passcode: r.passcode || null,
    })));
    socket.on("replays", () => {
      socket.emit("replays", Object.values(replays).map(r => ({
        id: r.id, roomId: r.roomId, ts: r.ts, turns: r.log?.length || 0
      })));
    });
    socket.on("presence", () => socket.emit("presence", presenceList()));
  });

  return io;
}
