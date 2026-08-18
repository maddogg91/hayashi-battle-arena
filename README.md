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

### Optional: Discord notifications

Set the `DISCORD_WEBHOOK_URL` environment variable to enable two things:

- Every "Report a Bug" submission also posts to Discord, in addition to
  being saved to disk.
- Clicking **Save Replay** after a match posts a recap of that match's
  battle log to Discord. If `ANTHROPIC_API_KEY` is also set (see "Optional:
  AI-generated replay recaps" below), the recap is a real TLDR written by
  Claude; otherwise (or if that call fails for any reason) it falls back to
  a plain-text recap capped at Discord's 2000-character message limit,
  keeping the most recent lines first if the full log doesn't fit (with a
  note on how many earlier lines were left out).

Both post to the same channel by default. To send match recaps to a
*different* channel than bug reports, also set `DISCORD_REPLAY_WEBHOOK_URL`
— when it's set, Save Replay posts there instead; when it's unset, Save
Replay falls back to `DISCORD_WEBHOOK_URL` like before, so existing
single-webhook setups keep working unchanged.

To get a webhook URL: in Discord, go to the target channel's Settings ->
Integrations -> Webhooks -> New Webhook, then copy its URL.

```bash
# locally (.env, not committed)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_REPLAY_WEBHOOK_URL=https://discord.com/api/webhooks/...   # optional, separate channel for replays

# Heroku
heroku config:set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
heroku config:set DISCORD_REPLAY_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Treat these URLs like secrets — anyone who has one can post to that
channel. If both are unset, both features still work as normal (feedback
saved to disk, replay saved to disk); Discord posting is simply skipped.

### Optional: AI-generated replay recaps

Set the `ANTHROPIC_API_KEY` environment variable to have **Save Replay**'s
Discord post be a real Claude-written TLDR of the match (key turning
points, standout moves, who won and how) instead of a plain truncated
log dump. Uses `claude-opus-5` via the official `@anthropic-ai/sdk`
package. If the key is unset, the request fails, or the response is
empty for any reason, it silently falls back to the plain-text recap
described above — Save Replay never fails because of this.

```bash
# locally (.env, not committed)
ANTHROPIC_API_KEY=sk-ant-...

# Heroku
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
```

Get a key from the [Anthropic Console](https://console.anthropic.com/).
Treat it like a secret the same as the Discord webhook URLs above.

## Changelog

### 2026-08-18 — AI-generated replay recaps

- **Save Replay's Discord recap can now be a real Claude-written TLDR**
  of the match instead of a truncated log dump — set `ANTHROPIC_API_KEY`
  to enable it (see "Optional: AI-generated replay recaps" above). Falls
  back to the existing plain-text recap automatically if the key is
  unset or the request fails for any reason, so this is purely additive.

### 2026-08-15 — Custom icon for Arisa

- **Arisa Huang now has a custom winged-hammer icon** instead of the
  generic 🔨 emoji, shown everywhere character portraits appear
  (Character Guide, team select, and the battle grid). Added support for
  characters to use an image-based icon instead of an emoji — the other
  24 characters are unaffected and still render their emoji as before.

### 2026-08-07 — Save Replay now recaps the battle log, not chat

- **Fixed Save Replay's Discord recap posting the match's personal chat
  instead of the battle log** — it now summarizes the actual combat
  narrative (attacks, damage, status effects, who won), which is what a
  replay recap should show. Same 2000-character cap and "keep the most
  recent lines" truncation behavior as before, just against the right
  data.

### 2026-08-07 — Separate Discord webhook for replay recaps

- **Match recaps posted by Save Replay can now go to a different Discord
  channel than bug reports** — set the new `DISCORD_REPLAY_WEBHOOK_URL`
  environment variable (see "Running locally" above). If it's unset,
  replay recaps fall back to the general `DISCORD_WEBHOOK_URL` exactly as
  before, so nothing changes for existing setups.

### 2026-08-07 — Save Replay posts a chat recap to Discord

- **Clicking Save Replay now also posts a recap of that match's personal
  chat to Discord** (when `DISCORD_WEBHOOK_URL` is set — see "Running
  locally" above), alongside the existing on-disk replay save. The recap
  is capped at Discord's 2000-character message limit; if the full chat
  log doesn't fit, it keeps the most recent messages and notes how many
  earlier ones were left out, rather than cutting off mid-message.
  Extracted the Discord-webhook-posting logic (previously only used by
  bug reports) into a small shared helper (`discord.js`) so both features
  reuse the same fire-and-forget, fails-gracefully posting code.

### 2026-08-07 — Stun is now a coin flip instead of a guaranteed skip

- **Stunned characters get a 50/50 chance to act on each of their own
  turns while stunned**, instead of automatically losing the turn for the
  whole duration. The battle log calls out which happened each time —
  "💪 X powers through the stun and is ready to act!" or "😵 X is too
  stunned to act — turn skipped." Stun's duration still counts down
  normally either way. Bind is unchanged: it's still a guaranteed skip.

### 2026-08-07 — Status effects and stacks now visible for every fighter

- **The battle grid now shows status effects, stacks, and active modes for
  every character on both teams**, not just whoever's currently acting.
  Previously this info (Stun/Bind/Burn/Shield/Reflect/Invulnerable/Charmed,
  plus stacks like Creature Summon/Chain Dance/Lightning Charge/Rock Armor
  and modes like Kimura Special/Arahabaki/Intangible Flames/Imbue with
  Light) only appeared for the acting unit in the moves panel — now it's
  always visible on every portrait in both team grids, so you can track
  what's charmed, stacked, or buffed across the whole matchup at a glance.
  Stack/mode names also now render with proper display names (e.g.
  "Lightning Charge" instead of the raw "lightningcharge") everywhere
  they're shown.

### 2026-08-07 — Turn order ties are now a coin flip

- **Speed ties no longer always favor Team A** — turn order was already a
  single queue spanning both players' units sorted by speed (not
  team-by-team turns), but a tie in speed used to always resolve in Team
  A's favor. Ties are now randomly ordered among the tied units — a fresh
  coin flip every round, not a fixed outcome for the whole match.

### 2026-08-07 — New signature movesets for Star, Sai, Sendara, Kenshin, and Kairu

- **Five more reworked kits**, each built around a new signature mechanic:
  - **Star Trethowan** afflicts enemies with Charm via Charm-shuriken, then
    cashes it in with Love Illusion (self-invulnerable unguardable AOE),
    Kiss of Death (a big unguardable AOE nuke), or Broken Heart (an AOE
    stun) — all of which clear Charm afterward.
  - **Sai Ryuzaki's** Ball & Chain hits much harder and unguardably if the
    target is currently bound by Binding Chain; Chain Dance stacks up to 3
    times to power up Half-moon Melee's unguardable payoff.
  - **Sendara Al Vere's** Spear Chuck gains +5 damage for every consecutive
    turn it's used in a row (reset by using anything else); Warrior Spirit
    grants stacking per-turn bonus SP; Unyielding Barrage can't follow a
    Spear Chuck and locks Sendara down afterward; Stand Your Ground halves
    incoming damage for 2 turns at the cost of her next turn.
  - **Kenshin** now stacks either Lightning Charge (bonus damage on all his
    attacks) or Rock Armor (reduces incoming damage) — never both at once —
    and Elemental Barrage pays off whichever is active with bonus burn or
    stun before clearing the stacks.
  - **Kairu Yusoko's** Imbue with Light grants a 50% dodge chance for 3
    turns; while active, Bo Staff Strike and Flash Kick also stun, and
    Light of Life heals the whole team instead of just himself.
  - New engine mechanics added for this batch: a Charm status with a
    "target all charmed enemies" scope, unguardable damage (bypasses
    Shield), branching a skill off the *target's* status instead of the
    actor's own, consecutive-same-move combo tracking, stacking per-turn SP
    regen, mutually-exclusive stack gating, persistent incoming-damage
    reduction, and chance-based dodging. Verified with a 51-assertion test
    script covering every new interaction, plus a full regression
    playthrough of the previous batch and the untouched legacy roster.

### 2026-08-07 — Discord notifications for player feedback

- **Report a Bug submissions now optionally post to Discord** — set the
  `DISCORD_WEBHOOK_URL` environment variable (see "Running locally" above)
  and every bug report, feedback, or suggestion submitted through the
  lobby's 🐛 button also gets posted as an embed to that channel, in
  addition to being saved to disk as before. Fully optional and
  non-blocking: if the variable is unset or Discord is unreachable, the
  submission still saves normally and the player still sees their
  confirmation.

### 2026-08-07 — New signature movesets for Arisa, Erika, Jett, Shou, and Maako

- **Rest replaces Basic Attack** — every character's free fallback move now
  recovers an extra 10 SP (on top of the usual +5 everyone gets whenever any
  action resolves) instead of dealing 10 damage, so choosing not to attack is
  a real tradeoff instead of a wasted turn.
- **Five reworked kits** — Arisa Huang, Erika Sharp, Jett Kimura, Shou, and
  Maako Karsean each got a full new 4-skill moveset built around a signature
  mechanic:
  - **Arisa** stacks Creature Summon (up to 3) to power up Hammer Attack,
    then cashes stacks in with Unleash the Beast for AOE damage; Pep Talk
    refuels the whole team's SP.
  - **Erika** gets a real single-target Heal and Page Turner, a party-wide
    cleanse; Angelic Radiance nukes and heals the battlefield at once.
  - **Jett's Kimura Special** temporarily transforms Warning Shot and
    Piercing Volley into a piercing poke and AOE nuke; Reload and Cover is a
    free defensive reset.
  - **Shou's Arahabaki** trades ongoing self-damage for a massively upgraded
    Heavy Slash and Conjure the Elements; Self Preservation trades allies'
    HP for his own.
  - **Maako's Intangible Flames** makes him untargetable and changes how
    Fiery Punch and Fire Wall behave, building toward the AOE payoff of
    Flames of Reckoning.
  - Under the hood this added several new engine mechanics: stacking
    counters, temporary "modes" that swap a skill's behavior or add bonus
    effects, chance-based status procs, true invulnerability, and
    untargetability — all verified with a 40+ assertion test script
    covering every new interaction before shipping.

### 2026-08-06 — Bug reporting, matchmaking fix, move-selection fix

- **Report a Bug button** — a 🐛 button on the lobby landing page opens a
  form (bug/feedback/suggestion + description) that's saved server-side
  for review, so players can flag issues without leaving the app.
- **Fixed active matches breaking when a 3rd+ player showed up** —
  starting a private match without first leaving the public queue (both
  are reachable from the same lobby screen at once) left a stale queue
  entry behind. The next unrelated player to click "Find Match" got
  silently paired with it, corrupting the room data of whoever was
  already mid-match. Both directions of this are now guarded.
- **Fixed move selection misbehaving on desktop** — hovering near other
  moves while trying to reach a target or the Confirm button could swap
  the description panel to the wrong move, and, more seriously, the move
  buttons were being torn down and rebuilt on every re-render, which
  under mouse hover could loop indefinitely. Moves now each have their
  own ⓘ info icon for previewing descriptions, fully separate from
  selecting a move to use.

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
