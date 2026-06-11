import { GameState } from '../types'
import { MapSize } from '../lib/constants'

interface Props {
  state: GameState
  mapSize: MapSize
  onNewGame: (sz: MapSize) => void
}

export default function GameOverlay({ state, mapSize, onNewGame }: Props) {
  if (state.phase !== 'gameover' || state.winner === null) return null

  const winner = state.players[state.winner]

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
      <div className="bg-gray-900 border border-gray-600 rounded-xl px-10 py-8 text-center shadow-2xl">
        <div className="text-4xl mb-3">🏆</div>
        <div className="text-2xl font-bold text-white mb-1">{winner.name} Wins!</div>
        <div
          className="text-sm mb-6 font-medium"
          style={{ color: winner.color }}
        >
          Conquered in {state.turn} turns
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          {(['small', 'medium', 'large'] as MapSize[]).map(sz => (
            <button
              key={sz}
              onClick={() => onNewGame(sz)}
              className={`px-4 py-2 rounded text-sm font-bold border transition-colors ${
                mapSize === sz
                  ? 'bg-yellow-500 border-yellow-400 text-black'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {sz.charAt(0).toUpperCase() + sz.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">Choose map size to play again</p>
      </div>
    </div>
  )
}
