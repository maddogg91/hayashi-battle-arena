import { useEffect, useRef, useState } from "react";
import { playSfx } from "../utils/sfx";

const FLOATER_LIFETIME_MS = 950;
let idSeq = 0;
const nextId = () => `f${++idSeq}`;

const DODGE_PHRASES = [
  "dodges the attack!",
  "is invulnerable and takes no damage.",
  "barrier negates the attack",
  "mirror negates the attack",
];

// Diffs consecutive `game` snapshots (the same authoritative state the
// server broadcasts on every update) to derive battle-juice cues — floating
// damage/heal numbers, a hit-shake trigger, a knockout trigger, and a
// status-inflicted flash — without the server needing to emit any dedicated
// "effect" events of its own. Also scans newly-appended `log` lines for a
// few full-negation phrases (dodge/invuln/barrier/mirror) that leave no HP
// delta to diff, so those don't go silently unacknowledged.
//
// Every trigger is a per-unit incrementing "nonce" (or a self-expiring
// floater list) rather than a boolean, so the same effect firing twice in a
// row (e.g. two dodges back to back) is still detected as two distinct
// events by whatever's watching it.
export function useBattleEffects(game, log, matchKey) {
  const prevGameRef = useRef(null);
  const prevLogLenRef = useRef(0);
  const matchKeyRef = useRef(matchKey);
  const [floaters, setFloaters] = useState({});
  const [hitNonce, setHitNonce] = useState({});
  const [koNonce, setKoNonce] = useState({});
  const [statusFlash, setStatusFlash] = useState({});

  useEffect(() => {
    // A new match (rejoining the lobby and queuing again) must never diff
    // against the previous match's final state — otherwise a fresh team
    // resetting to full HP would register as one enormous heal.
    if (matchKeyRef.current !== matchKey) {
      matchKeyRef.current = matchKey;
      prevGameRef.current = null;
      prevLogLenRef.current = 0;
      setFloaters({});
      setHitNonce({});
      setKoNonce({});
      setStatusFlash({});
    }

    const prevGame = prevGameRef.current;
    const prevLogLen = prevLogLenRef.current;
    prevGameRef.current = game;
    prevLogLenRef.current = log ? log.length : 0;

    if (!game || !game.teams) return;

    const newFloaters = {};
    let anyHit = false;
    let anyHeal = false;
    let anyStatus = false;
    let anyKo = false;
    const hitKeys = [];
    const koKeys = [];
    const statusKeys = [];

    if (prevGame && prevGame.teams) {
      for (const role of ["A", "B"]) {
        const prevTeam = prevGame.teams[role] || [];
        const curTeam = game.teams[role] || [];
        curTeam.forEach((u, i) => {
          const pu = prevTeam[i];
          if (!pu) return;
          const key = `${role}:${i}`;
          const hpDelta = u.hp - pu.hp;
          if (hpDelta < 0) {
            newFloaters[key] = [{ id: nextId(), text: `-${Math.abs(hpDelta)}`, kind: "damage" }];
            hitKeys.push(key);
            anyHit = true;
          } else if (hpDelta > 0) {
            newFloaters[key] = [{ id: nextId(), text: `+${hpDelta}`, kind: "heal" }];
            anyHeal = true;
          }

          const pe = pu.effects || {};
          const ce = u.effects || {};
          for (const k of Object.keys(ce)) {
            if ((pe[k] || 0) <= 0 && ce[k] > 0) {
              statusKeys.push({ key, type: k });
              anyStatus = true;
            }
          }

          if (pu.hp > 0 && u.hp <= 0) {
            koKeys.push(key);
            anyKo = true;
          }
        });
      }
    }

    // New, full-negation log lines (dodge/invuln/barrier/mirror) never show
    // up as an HP delta above, so they'd otherwise be completely silent.
    let anyDodge = false;
    if (log && log.length > prevLogLen) {
      const added = log.slice(prevLogLen);
      anyDodge = added.some((line) => DODGE_PHRASES.some((p) => line.includes(p)));
    }

    if (anyKo) playSfx("ko");
    else if (anyHit) playSfx("hit");
    if (anyDodge && !anyKo) playSfx("dodge");
    if (anyHeal) playSfx("heal");
    if (anyStatus) playSfx("status");

    if (Object.keys(newFloaters).length) {
      setFloaters((cur) => {
        const merged = { ...cur };
        for (const [key, items] of Object.entries(newFloaters)) {
          merged[key] = [...(merged[key] || []), ...items];
        }
        return merged;
      });
      const ids = Object.entries(newFloaters).flatMap(([key, items]) => items.map((it) => ({ key, id: it.id })));
      setTimeout(() => {
        setFloaters((cur) => {
          const next = { ...cur };
          for (const { key, id } of ids) {
            if (!next[key]) continue;
            next[key] = next[key].filter((f) => f.id !== id);
            if (!next[key].length) delete next[key];
          }
          return next;
        });
      }, FLOATER_LIFETIME_MS);
    }

    if (hitKeys.length) {
      setHitNonce((cur) => {
        const next = { ...cur };
        for (const key of hitKeys) next[key] = (next[key] || 0) + 1;
        return next;
      });
    }
    if (koKeys.length) {
      setKoNonce((cur) => {
        const next = { ...cur };
        for (const key of koKeys) next[key] = (next[key] || 0) + 1;
        return next;
      });
    }
    if (statusKeys.length) {
      setStatusFlash((cur) => {
        const next = { ...cur };
        for (const { key, type } of statusKeys) {
          next[key] = { type, nonce: ((cur[key]?.nonce) || 0) + 1 };
        }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, log, matchKey]);

  return { floaters, hitNonce, koNonce, statusFlash };
}
