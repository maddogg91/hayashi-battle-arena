import { useEffect, useState } from "react";
import { backendUrl } from "../api/socket";

export default function ReplayViewer({ replayId }) {
  const [rep, setRep] = useState(null);
  useEffect(() => {
    fetch(`${backendUrl}/api/replay/${replayId}`)
      .then((r) => r.json())
      .then(setRep)
      .catch(() => setRep(null));
  }, [replayId]);

  if (!replayId) return null;
  if (!rep) return <p className="text-center mt-6 text-slate-400">Loading replay...</p>;

  // naive playback: just lists the final state + log
  return (
    <div className="mt-6 panel p-4 max-w-3xl mx-auto">
      <h3 className="font-display text-lg font-bold mb-2 text-gold-300">Replay #{replayId}</h3>
      <div className="h-56 overflow-y-auto space-y-1 text-sm text-slate-300 bg-ink-950 rounded-lg p-3">
        {rep.log?.map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </div>
  );
}
