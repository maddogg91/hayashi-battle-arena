# Hayashi Arena Editor (offline)

A local-only tool for browsing the roster, tuning movesets and writing
cutscene dialogue. It edits `data/characters.csv`, `data/moves.csv` and
`data/dialogue.csv` in place. It isn't deployed anywhere: `tools/` is left out
of the Docker image, and the server only listens on `127.0.0.1`.

## Run it

```bash
npm install          # once, from the repo root
npm run editor       # then open http://127.0.0.1:5178
```

Use `EDITOR_PORT=6000 npm run editor` to pick a different port.

## What you can do

- **Roster & Moves**: every character grouped by guild. Edit name, type,
  guild, SPD, icon and description. Open any move to change its label, key,
  SP cost, target and description, plus its actions:
  - **Visual editor**: one card per action step (damage, heal, effect, stack,
    mode, ...), with typed inputs for every field (base damage, turns, chance,
    stack bonuses and so on). You can add, remove, reorder and duplicate
    steps, and edit conditional behaviour (`altIf`/`altActions`,
    `extraIf`/`extraActions`, `requires`, ...) the same way.
  - **Raw JSON**: edit the `actions`/`extra` JSON directly. It's checked as
    you type.
  - A warning appears when a move's damage, heal or SP numbers no longer show
    up in its description text.
  - Renaming a character also updates their moves and dialogue.
- **Balance Table**: every move in one sortable, filterable table. Edit SPD,
  SP cost, target and each damage step's base damage inline, with a
  damage-per-SP column and damage bars measured against 100 HP.
- **Cutscene Dialogue**: scenes grouped into matchups (`A|B`), solo intros
  (`A|*`) and the generic fallback (`*|*`). Add, reorder and delete lines,
  pick speakers, and preview a scene both as players see it and as a full
  script. The sidebar lists characters who have no lines yet, with one-click
  intro creation.
- **Issues**: duplicate names or move keys, invalid JSON, unknown action
  kinds, dialogue that points at missing characters, empty lines, and so on.
  Errors block saving.

## Saving

- **Save** (or Ctrl/Cmd+S) writes only the files you changed. Rows and fields
  you didn't touch are written back exactly as they were, so the git diff
  shows only your edits.
- Before writing, the new CSV is checked the same way `data/rosterLoader.js`
  parses it, so a save can't break game startup.
- Each save first copies the old file to `data/.editor-backups/` (the last 25
  per file are kept; the folder is gitignored). Use **Backups** to restore one.
- If a file changed on disk after the editor loaded it (for example from a
  `git pull`), the save is refused. Click **Discard** to reload.
- **Reload game server** asks a game server running locally (`npm start`,
  port 8080 or `GAME_PORT`) to re-read the CSVs through
  `/api/admin/reload-data`, so you can playtest without a restart.
