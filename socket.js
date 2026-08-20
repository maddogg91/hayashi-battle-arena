// backend/src/socket.js
// Hayashi Academy — matchmaking, private rooms, presence, chat, cutscene, battle

import { Server } from "socket.io";
import crypto from "crypto";
import { initGame, handleMove, getGame } from "./game/engine.js";
import { saveReplayToDisk } from "./replays.js";
import { postToDiscord } from "./discord.js";
import { buildBattleLogSummary } from "./battleLogSummary.js";
import { summarizeBattleLogWithClaude } from "./aiBattleSummary.js";
import { sessionMiddleware } from "./config/session.js";
import { isAllowedOrigin } from "./config/corsOrigins.js";
import { recordMatchResult } from "./db/users.js";
import { mongoEnabled } from "./db/mongo.js";

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
const replays = Object.create(null);          // in-memory index of replays persisted to disk

// Global chat: lobby-wide, not tied to any room — visible to every
// connected player regardless of what screen they're on.
const globalChat = [];

// Public queue
const waitQueue = [];                          // sockets waiting for public match
const inQueue = new Set();                     // socket.id currently queued

// Lobby presence (global)
const presence = Object.create(null);
// presence[socket.id] = { id, name, status: 'idle'|'queued'|'private_wait'|'playing', passcode?: string|null }

const rid = (len = 8) => crypto.randomBytes(len).toString("hex");
const now = () => Date.now();

// How long a seat stays reserved after its socket disconnects before the
// match is declared abandoned. Covers a page refresh, a browser crash, or a
// brief network drop that lands outside Socket.IO's own connectionStateRecovery
// window — the client re-establishes with a *new* socket id in all of those
// cases, so recovery has to happen at the room/role level, not the socket level.
const RECONNECT_GRACE_MS = 30_000;

/* -------------------- Presence helpers -------------------- */
function presenceList() {
  // Show everyone not "playing" so active matches don't clutter the lobby.
  // Passcodes are intentionally omitted here — they're only ever known to
  // the two players in that private room, never broadcast to the lobby.
  return Object.values(presence)
    .filter(p => p.status !== "playing")
    .map(p => ({ id: p.id, name: p.name, status: p.status }));
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
    // Logged-in user id occupying each seat, if any (null for guests) —
    // used at match end to credit wins/losses/character usage to the
    // right account. Never broadcast to clients.
    userIds: { A: null, B: null },
    selections: { A: null, B: null },
    chat: [],
    cutsceneAck: { A: false, B: false },
    isPrivate: false,
    passcode: null,
    // Timer ids for a seat currently in its reconnect grace window (see
    // RECONNECT_GRACE_MS) — cleared the moment that role rejoins.
    disconnectTimers: { A: null, B: null },
  };
  return rooms[roomId];
}
function opponentRole(role) { return role === "A" ? "B" : "A"; }

// Credits each logged-in seat's account with a win or loss and updates
// their per-character usage, once, when a match actually finishes (all of
// one side's fighters defeated). Guest seats (room.userIds[role] === null)
// are skipped entirely — a guest's presence in the match never blocks the
// other, logged-in side's result from being recorded. Deliberately scoped
// to natural match completions only: a player leaving or disconnecting
// mid-match does not currently record a loss for them.
export async function recordMatchOutcome(room, state) {
  if (!mongoEnabled()) return;
  const aAlive = state.teams.A.some((u) => u.hp > 0);
  const winnerRole = aAlive ? "A" : "B";
  for (const role of ["A", "B"]) {
    const userId = room.userIds[role];
    if (!userId) continue;
    const characters = (room.selections[role] || []).map((c) => c?.name).filter(Boolean);
    await recordMatchResult(userId, { won: role === winnerRole, characters });
  }
}
function safeEmit(io, roomId, event, payload) { try { io.to(roomId).emit(event, payload); } catch {} }
function dropFromRoom(io, roomId, role) {
  const room = rooms[roomId];
  if (!room) return;
  clearDisconnectTimer(room, role);
  room.players[role] = "__LEFT__";
  safeEmit(io, roomId, "opponentLeft", { role });
  maybeCleanupRoom(roomId);
}
function clearDisconnectTimer(room, role) {
  if (room.disconnectTimers?.[role]) {
    clearTimeout(room.disconnectTimers[role]);
    room.disconnectTimers[role] = null;
  }
}
// A socket disconnect (network drop, tab close, page refresh) doesn't mean
// the player is gone for good — the client reconnects with a brand-new
// socket id, so recovery has to be tracked at the room/role level. Instead
// of tearing the match down immediately, park the seat as __PENDING__ for
// RECONNECT_GRACE_MS and only declare them gone (dropFromRoom) if nobody
// rejoins that role in time. If the opponent's seat was never filled (still
// solo-waiting), there's nobody to protect from a false "opponent left", so
// fall back to the old immediate-drop behavior.
function startDisconnectGrace(io, roomId, role) {
  const room = rooms[roomId];
  if (!room) return;
  const other = room.players[opponentRole(role)];
  const opponentSeated = other && other !== "__LEFT__";
  if (!opponentSeated) {
    dropFromRoom(io, roomId, role);
    return;
  }
  room.players[role] = "__PENDING__";
  safeEmit(io, roomId, "opponentDisconnected", { role, graceMs: RECONNECT_GRACE_MS });
  clearDisconnectTimer(room, role);
  room.disconnectTimers[role] = setTimeout(() => {
    const r = rooms[roomId];
    if (!r) return;
    r.disconnectTimers[role] = null;
    if (r.players[role] === "__PENDING__") dropFromRoom(io, roomId, role);
  }, RECONNECT_GRACE_MS);
}
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
  room.userIds.A = s1.data.userId || null;
  room.userIds.B = s2.data.userId || null;

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
  // Symmetric guard to the one in privateMatch(): if this socket is
  // currently sitting solo in a private room it created (waiting for an
  // opponent), joining the public queue instead would let it get paired
  // here while that private room still lists it as seated — two rooms
  // fighting over one socket's roomId/role. Tear the stale one down first.
  leaveSoloPrivateWait(socket);

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
  // The Lobby screen shows the public-queue and private-match cards at the
  // same time, so a player can click "Find Match", then — while still
  // waiting — also start a private match. Without this, the socket stays
  // in waitQueue; a later, unrelated public-queue join can then pair with
  // this stale entry and overwrite this socket's roomId/role, silently
  // corrupting whatever room it's actually in.
  safeLeaveQueue(socket);

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
        room.userIds.A = socket.data.userId || null;
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
        room.userIds.B = socket.data.userId || null;
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
  room.userIds.A = socket.data.userId || null;
  room.status = "select";

  socket.data.roomId = roomId; socket.data.role = "A";
  socket.join(roomId);

  // presence: waiting in private
  setPresence(io, socket, { name: socket.data.name, status: "private_wait", passcode: code });

  // tell creator we're waiting
  socket.emit("privateWaiting", { roomId, passcode: code });
}

// Tears down a still-solo private room this socket is waiting in (seat A
// filled, no opponent yet). Used both for an explicit Cancel click and as a
// guard when the same socket starts a different matchmaking flow (public
// queue) while still parked here, so it can't end up straddling two rooms.
// Never touches a room whose opponent has already joined.
function leaveSoloPrivateWait(socket) {
  const roomId = socket.data?.roomId;
  if (!roomId) return false;
  const room = rooms[roomId];
  if (!room || !room.isPrivate) return false;
  if (room.players.A && room.players.B) return false;

  if (room.passcode) delete passcodeRooms[room.passcode];
  delete rooms[roomId];
  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.role = null;
  return true;
}

function cancelPrivateMatch(io, socket) {
  if (leaveSoloPrivateWait(socket)) {
    setPresence(io, socket, { status: "idle", passcode: null });
  }
}

/* -------------------- Replay recap -------------------- */
// Tries a real LLM-generated TLDR of the battle log first (needs
// ANTHROPIC_API_KEY); falls back to the plain-truncation summary on any
// failure — missing key, rate limit, network error, empty log, etc. —
// so a Save Replay click never fails to post *something* to Discord.
async function postReplayRecap(room, state) {
  const namesA = room?.names?.A || "Player A";
  const namesB = room?.names?.B || "Player B";
  const log = state.log || [];
  const winnerLine = log.find((l) => l.includes("🏆")) || null;

  let summary = null;
  try {
    summary = await summarizeBattleLogWithClaude({ namesA, namesB, log, winnerLine });
  } catch (err) {
    console.error("Claude battle summary failed, falling back to plain recap:", err.message);
  }
  if (!summary) {
    summary = buildBattleLogSummary({ namesA, namesB, log, winnerLine });
  }
  await postToDiscord({ content: summary }, { webhookUrl: process.env.DISCORD_REPLAY_WEBHOOK_URL });
}

/* -------------------- Public API: init Socket.IO -------------------- */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), methods: ["GET", "POST"], credentials: true },
    // Socket.IO does not restore room membership or socket.data across a
    // reconnect by default — a brief network drop mid-match (much more
    // common on a real deployment than same-machine local testing) silently
    // un-joins the player from their room. The server can still process
    // their next move, but io.to(roomId).emit(...) never reaches them again
    // since their new socket was never re-joined, so battle updates just
    // stop arriving. This restores rooms/data automatically for reconnects
    // within the window; see also the client's "joinRoom" re-emit on
    // connect for reconnects that land outside it.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  // Attaches the same express-session middleware used by the HTTP API to
  // Socket.IO's underlying engine.io upgrade requests, so a socket can read
  // req.session (and therefore who's logged in) straight off the same
  // cookie the browser already sends. io.engine.use() runs middleware on
  // every handshake/poll request without needing a separate cookie-parsing
  // + session-store lookup here. No-ops if accounts are disabled.
  if (sessionMiddleware) io.engine.use(sessionMiddleware);

  io.on("connection", (socket) => {
    // Populated only if this socket's handshake carried a valid session
    // cookie for a logged-in user (see io.engine.use(sessionMiddleware)
    // above) — stays null for guests, exactly like today.
    socket.data.userId = socket.request?.session?.userId || null;
    socket.data.username = socket.request?.session?.username || null;

    // Send the current global chat history right away so it's available
    // even before the client explicitly asks for it.
    socket.emit("globalChatHistory", globalChat);

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
    socket.on("cancelPrivateMatch", () => cancelPrivateMatch(io, socket));

    /* -------- Manual room join (legacy/manual flow, also used to rebind a
       reconnected socket back to its room mid-match — see the client's
       "joinRoom" re-emit on connect) -------- */
    socket.on("joinRoom", ({ roomId, role, name } = {}) => {
      if (!roomId || !role || !["A","B"].includes(role)) return;
      // joinRoom only ever rebinds an EXISTING room (a brief network drop,
      // or a client restoring a persisted session after a full page
      // reload) — it's never used to create one from scratch, so a missing
      // room means that match is genuinely gone (server restarted, grace
      // window expired, opponent left). Fabricating a fresh empty room
      // here would silently strand a rejoining player in a phantom lobby
      // instead of telling them their match is over.
      const room = rooms[roomId];
      if (!room) {
        socket.emit("rejoinFailed", { message: "That match is no longer available." });
        return;
      }
      safeLeaveQueue(socket);

      const alreadyUnderway = room.status !== "lobby";
      const wasPending = room.players[role] === "__PENDING__";
      clearDisconnectTimer(room, role);

      room.players[role] = socket.id;
      room.names[role] = (name || room.names[role] || `Player ${role}`).slice(0, 40);
      // A reconnect keeps whatever userId the seat already had (a guest
      // reconnecting is still a guest; a logged-in player reconnecting with
      // a new socket picks their session back up via socket.data.userId).
      room.userIds[role] = socket.data.userId || room.userIds[role] || null;
      socket.data.roomId = roomId;
      socket.data.role = role;
      socket.data.name = room.names[role];
      socket.join(roomId);

      if (wasPending) safeEmit(io, roomId, "opponentReconnected", { role });

      if (alreadyUnderway) {
        // Rebind only: the match already progressed past this player's
        // original join, so just resync their client to current state
        // instead of replaying the "match found" flow / room.status.
        emitMatched(io, socket, roomId, role);
        socket.emit("playerNames", room.names);
        socket.emit("chatHistory", room.chat || []);
        const game = getGame(roomId);
        if (game) {
          if (room.status === "cutscene") socket.emit("preBattleDialogue", { cutscene: game.cutscene });
          else socket.emit("startGame", game);
        }
        markPlaying(io, socket);
        return;
      }

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
        const gameState = initGame(room.selections, roomId, room.names);
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
      if (state?.over && room.status !== "over") {
        room.status = "over";
        recordMatchOutcome(room, state).catch((err) => {
          console.error("Failed to record match outcome:", err.message);
        });
      }
    });

    /* -------- Replay -------- */
    socket.on("saveReplay", ({ roomId }) => {
      const state = getGame(roomId);
      if (!state) return;
      const replayId = saveReplayToDisk({
        roomId,
        ts: now(),
        teams: state.teams,
        log: state.log,
      });
      replays[replayId] = { id: replayId, ts: now(), roomId, turns: state.log?.length || 0 };
      io.to(roomId).emit("replaySaved", { replayId });

      // Fire-and-forget: post a recap of this match's battle log to
      // Discord, independent of the disk save above so a slow/unreachable
      // webhook (or LLM call) never delays the player's confirmation.
      // Posts to a dedicated DISCORD_REPLAY_WEBHOOK_URL if set, else
      // falls back to the general DISCORD_WEBHOOK_URL (see
      // postToDiscord); no-op if neither is configured.
      const room = rooms[roomId];
      postReplayRecap(room, state).catch((err) => {
        console.error("Replay recap failed:", err.message);
      });
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

    /* -------- Global chat (lobby-wide, not room-scoped) -------- */
    socket.on("globalChatHistoryRequest", () => socket.emit("globalChatHistory", globalChat));
    socket.on("globalChatSend", ({ text, name } = {}) => {
      if (typeof text !== "string") return;

      const clean = text.trim().slice(0, 500);
      if (!clean) return;

      const msg = {
        id: `${now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: clean,
        name: (name || socket.data?.name || "Player").slice(0, 40),
        ts: now(),
      };

      globalChat.push(msg);
      if (globalChat.length > 200) globalChat.shift();
      io.emit("globalChatMessage", msg);
    });

    /* -------- Voluntary leave (Return to Lobby before a match finishes) -------- */
    socket.on("leaveRoom", () => {
      const roomId = socket.data?.roomId;
      const role = socket.data?.role;
      if (!roomId || !role) return;

      safeLeaveQueue(socket);
      socket.leave(roomId);
      dropFromRoom(io, roomId, role);

      socket.data.roomId = null;
      socket.data.role = null;
      setPresence(io, socket, { status: "idle", passcode: null });
    });

    /* -------- Disconnect -------- */
    socket.on("disconnect", () => {
      // Remove from queue if present
      safeLeaveQueue(socket);

      const roomId = socket.data?.roomId;
      const role = socket.data?.role;

      clearPresence(io, socket);

      if (!roomId || !role) return;
      startDisconnectGrace(io, roomId, role);
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
