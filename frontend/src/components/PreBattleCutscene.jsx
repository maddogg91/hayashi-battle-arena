import { useState } from "react";

export default function PreBattleCutscene({ cutscene = [], onDone }) {
  const [i, setI] = useState(0);
  const line = cutscene[i];

  if (!cutscene.length) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white rounded-xl p-6 w-full max-w-2xl shadow-xl">
        <h3 className="text-lg font-bold text-yellow-400 mb-3">Before the Battle…</h3>
        <div className="min-h-24">
          <p className="text-sm text-gray-300">
            <span className={line?.side === "A" ? "text-green-400" : line?.side === "B" ? "text-blue-400" : "text-gray-200"}>
              {line?.speaker}
            </span>
            {": "}
            {line?.line}
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          {i < cutscene.length - 1 ? (
            <button onClick={() => setI(i + 1)} className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 font-semibold">
              Next
            </button>
          ) : (
            <button onClick={onDone} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 font-semibold">
              Start Battle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
