import Game from "./Game";

export default function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-6">🔥 Hayashi Academy Battle Arena</h1>
      <Game />
    </div>
  );
}
