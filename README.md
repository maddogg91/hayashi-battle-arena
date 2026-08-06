# Hayashi Academy Battle Arena

Real-time 5v5 turn-based battler. Two players queue up (publicly or with a
private passcode), draft a 5-character team, watch a pre-battle cutscene,
and fight it out with cooldown-based skills, status effects, and a live
battle log.

## Running locally

```bash
npm install
npm run build   # builds the client into public/app
npm start        # serves the app + Socket.IO on $PORT (default 8080)
```

## Changelog

### 2026-08-06 — Reconnect fix, room controls, character guide

- **Fixed attacks/actions appearing "stuck" over a real deployment** —
  Socket.IO does not automatically restore room membership or per-socket
  session data across a reconnect. A brief network drop mid-match (far
  more likely on a real deployment than in same-machine local testing)
  let the server keep processing that player's moves, but had no route
  left to broadcast the results back to them or their opponent, since
  their new connection was never re-joined to the match's room. Enabled
  Socket.IO's connectionStateRecovery for short gaps, and added a client
  fallback that re-binds to the room on any reconnect outside that
  window. Verified at the protocol level with a forced hard-disconnect
  and reconnect mid-battle.
- **Cancel button for a pending private match** — you can now back out of
  "Waiting for an opponent to join with passcode..." instead of being
  stuck there.
- **Return to Lobby button** added to character select, the
  waiting-for-opponent screen, and the pre-battle cutscene, so you're
  never stuck without a way back except refreshing.
- **Character guide** — a new browsable roster page (via the lobby's
  "📖 Character Guide" button) showing every fighter's profile blurb and
  full skill list with SP costs and descriptions, covering damage, buff,
  and other effect types alike.

### 2026-08-06 — Lobby privacy, chat names, and global chat

- **Private match codes no longer leak** — the passcode for a private
  room was being broadcast to every connected player via the public
  lobby list (both the server's presence payload and a "Code: ..." chip
  in the UI), instead of staying known only to the two players joining
  that room.
- **Chat now shows real names** — a first-time player's name typed into
  the lobby gate never made it into the chat display name for that
  session (it only synced from localStorage on page load), so chat fell
  back to "Player A"/"Player B" instead.
- **Chat renamed to "Chat" with Personal/Global tabs** — Personal is the
  existing private chat between two matched players; Global is a new
  lobby-wide channel visible to every connected player on any screen,
  not just people already matched into a room.

### 2026-08-06 — Battle log auto-scroll

- The battle log now automatically scrolls to the latest entry instead
  of requiring a manual scroll during a match.

### 2026-08-06 — Combat mechanics overhaul

- **Flat 100 HP for everyone** — characters no longer have varied
  hp/atk/def stats. ATK/DEF only exist as temporary buffs/debuffs a skill
  can grant, starting from 0.
- **Round-based turn order** — every living unit on both teams acts
  exactly once per round, ordered by current speed. Speed only decides
  order now, not how often a unit gets to act.
- **New SP (stamina) resource** — starts at 25, caps at 100. Every
  resolved action grants +5 SP to all living units on both sides, so
  units later in a round's order bank more SP before their turn — the
  intended tradeoff for lower speed.
- **Cooldowns replaced by SP costs** — skills now cost SP instead of
  going on a fixed cooldown. A free 0-cost Basic Attack is always
  available so a unit that can't afford any of its real moves yet still
  has a legal action.

### 2026-08-06 — Playtest fixes

- **Turn skipping** — stunned/bound characters no longer softlock the
  match. Turn advancement is now server-driven and auto-skips a unit
  that can't act, instead of waiting on a move the client was already
  blocking. Also fixed status-effect timing so a freshly applied 1-turn
  stun/bind/shield survives until its target's own next turn instead of
  being wiped out immediately.
- **Descriptive battle log** — actions now read like
  `Jett attacks Maako with Piercing Round, dealing 12 damage.` instead of
  a generic "X uses Y" line, with dedicated lines for heals, buffs/debuffs,
  status effects, and recoil.
- **Kenshin's moveset** — fixed a roster/moves name mismatch that left
  Kenshin with no skills.
- **Cutscenes** — every matchup now gets a pre-battle cutscene (added a
  generic narrator fallback for pairings without custom dialogue).
- **UI/targeting** — moves show a persistent description panel (hover on
  desktop, tap on mobile); picking an enemy/ally move now highlights valid
  targets and can be completed in either order (move-then-target or
  target-then-move); duplicate character picks are tagged with the owning
  player's name, e.g. `Kenshin (Alice)` vs `Kenshin (Bob)`.

### 2026-08-06 — Heroku deploy fix

- Fixed the client connecting to `http://localhost:8080` instead of the
  deployed origin, which broke the lobby and matchmaking on Heroku. The
  client now defaults to the page's own origin instead of a hardcoded
  local address.
