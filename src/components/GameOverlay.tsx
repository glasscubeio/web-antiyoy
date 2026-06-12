import { GameState } from '../types'
import { MapSize } from '../lib/constants'

interface Props {
  state: GameState
  mapSize: MapSize
  onNewGame: (sz?: MapSize) => void
}

export default function GameOverlay({ state, mapSize, onNewGame }: Props) {
  if (state.phase !== 'gameover' || state.winner === null) return null

  const winner = state.players[state.winner]

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
      <div className="bg-gray-900 border border-gray-600 rounded-xl px-10 py-8 text-center shadow-2xl max-w-xs w-full mx-4">
        <div className="text-4xl mb-3">🏆</div>
        <div className="text-2xl font-bold text-white mb-1">{winner.name} Wins!</div>
        <div
          className="text-sm mb-6 font-medium"
          style={{ color: winner.color }}
        >
          Conquered in {state.turn} turns
        </div>
        <button
          onClick={() => onNewGame(mapSize)}
          className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-base transition-colors"
        >
          Play Again
        </button>
        <p className="text-xs text-gray-500 mt-3">Choose mode &amp; map size in the menu</p>
      </div>
    </div>
  )
}
