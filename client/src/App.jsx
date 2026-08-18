import Game from "./routes/Game";

export default function App() {
  return (
    <div className="min-h-screen text-slate-100">
      <header className="sticky top-0 z-40 border-b border-panel-line bg-ink-900/85 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <span className="text-2xl leading-none">🔥</span>
          <h1 className="font-display font-bold text-lg sm:text-xl tracking-wide text-gold-300">
            Hayashi Academy <span className="text-slate-300 font-medium">Battle Arena</span>
          </h1>
        </div>
      </header>
      <Game />
    </div>
  );
}
