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
