import { useEffect, useState } from "react";

export default function ReplayViewer({ replayId }) {
  const [rep, setRep] = useState(null);
  useEffect(() => {
    fetch(`http://localhost:4000/replay/${replayId}`)
      .then((r) => r.json())
      .then(setRep)
      .catch(() => setRep(null));
  }, [replayId]);

  if (!replayId) return null;
  if (!rep) return <p className="text-center mt-6">Loading replay...</p>;

  // naive playback: just lists the final state + log
  return (
    <div className="mt-8 bg-gray-800 p-4 rounded-lg max-w-3xl mx-auto">
      <h3 className="text-lg mb-2 text-yellow-400">Replay #{replayId}</h3>
      <div className="h-56 overflow-y-auto space-y-1 text-sm">
        {rep.game?.log?.map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </div>
  );
}
