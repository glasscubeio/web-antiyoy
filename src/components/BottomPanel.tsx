import { GameState, UnitType, StructureType } from '../types'
import { UNIT_STATS, STRUCTURE_STATS, UNIT_ORDER } from '../lib/constants'
import { getPlayerTotalGold } from '../lib/gameEngine'

interface Props {
  state: GameState
  isHumanTurn: boolean
  farmCost: number
  canUndo: boolean
  onEndTurn: () => void
  onUndo: () => void
  onBuyUnit: (u: UnitType) => void
  onBuyStructure: (t: StructureType) => void
  onCancel: () => void
}

export default function BottomPanel({
  state,
  isHumanTurn,
  farmCost,
  canUndo,
  onEndTurn,
  onUndo,
  onBuyUnit,
  onBuyStructure,
  onCancel,
}: Props) {
  const player = state.players[state.currentPlayer]
  const mode = state.actionMode
  const totalGold = getPlayerTotalGold(state, state.currentPlayer)

  const modeLabel = () => {
    if (!isHumanTurn) return '⏳ AI is thinking...'
    if (mode.type === 'unitSelected') return 'Unit selected — click a tile to move or attack'
    if (mode.type === 'buyingUnit') return `Placing ${UNIT_STATS[mode.unitType].label} — click a friendly tile`
    if (mode.type === 'buyingStructure') {
      const label = STRUCTURE_STATS[mode.structureType].icon + ' ' + mode.structureType
      return `Placing ${label} — click an empty friendly tile`
    }
    return 'Select a unit or buy one below'
  }

  if (!isHumanTurn) {
    return (
      <div className="hidden md:flex items-center justify-center px-4 py-3 bg-gray-900 border-t border-gray-700 text-sm text-gray-400 flex-shrink-0 h-20">
        <span className="animate-pulse">⏳ AI is playing...</span>
      </div>
    )
  }

  const structureButtons: Array<{ type: StructureType; label: string; cost?: number; note?: string }> = [
    { type: 'tower', label: 'Tower' },
    { type: 'strongTower', label: 'S.Tower' },
    { type: 'farm', label: 'Farm', cost: farmCost, note: '+4 each' },
  ]

  return (
    <div className="hidden md:flex items-center gap-3 px-4 py-3 bg-gray-900 border-t border-gray-700 flex-shrink-0 flex-wrap">
      {/* Player info */}
      <div className="text-xs text-gray-400 min-w-[190px] flex-shrink-0">
        <div>
          <span
            className="w-2 h-2 rounded-full inline-block mr-1"
            style={{ backgroundColor: player.color }}
          />
          <span className="text-white">{player.name}</span>
          {' · '}
          <span className="text-yellow-400">💰 {totalGold}</span>
        </div>
        <div className="mt-0.5 text-gray-500 text-[11px]">{modeLabel()}</div>
      </div>

      <div className="w-px h-8 bg-gray-700 flex-shrink-0" />

      {/* Unit buy buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {UNIT_ORDER.map((u, idx) => {
          const stats = UNIT_STATS[u]
          const canAfford = totalGold >= stats.cost
          const isActive = mode.type === 'buyingUnit' && mode.unitType === u
          return (
            <button
              key={u}
              onClick={() => onBuyUnit(u)}
              disabled={!canAfford}
              title={`${stats.label} — cost ${stats.cost}, upkeep ${stats.upkeep}/t, str ${stats.strength} [Key: ${idx + 1}]`}
              className={`flex flex-col items-center px-2 py-1.5 rounded text-xs border transition-all relative ${
                isActive
                  ? 'bg-green-700 border-green-400 text-white'
                  : canAfford
                  ? 'bg-gray-800 border-gray-600 text-white hover:bg-gray-700 hover:border-gray-400'
                  : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              <span className="absolute top-0.5 left-1 text-[9px] text-gray-500 font-mono">{idx + 1}</span>
              <img src={stats.sprite} alt={stats.label} className="w-6 h-6 object-contain" />
              <span className="mt-0.5 font-medium">{stats.label}</span>
              <span className="text-yellow-400">{stats.cost}💰</span>
              <span className="text-gray-400">↑{stats.upkeep}/t</span>
            </button>
          )
        })}
      </div>

      <div className="w-px h-8 bg-gray-700 flex-shrink-0" />

      {/* Structure buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {structureButtons.map(({ type, label, cost: overrideCost, note }) => {
          const stats = STRUCTURE_STATS[type]
          const displayCost = overrideCost ?? stats.cost
          const canAfford = totalGold >= displayCost
          const isActive = mode.type === 'buyingStructure' && mode.structureType === type
          return (
            <button
              key={type}
              onClick={() => onBuyStructure(type)}
              disabled={!canAfford}
              title={`${label} — cost ${displayCost}${note ? ` (${note})` : ''}${stats.defense > 0 ? `, defense ${stats.defense}` : ''}${stats.upkeep > 0 ? `, upkeep ${stats.upkeep}/t` : ''}`}
              className={`flex flex-col items-center px-2 py-1.5 rounded text-xs border transition-all ${
                isActive
                  ? 'bg-blue-700 border-blue-400 text-white'
                  : canAfford
                  ? 'bg-gray-800 border-gray-600 text-white hover:bg-gray-700'
                  : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              <img src={stats.sprite} alt={label} className="w-6 h-6 object-contain" />
              <span className="mt-0.5 font-medium">{label}</span>
              <span className="text-yellow-400">{displayCost}💰</span>
              {stats.defense > 0 && <span className="text-gray-400">🛡{stats.defense}</span>}
              {type === 'farm' && <span className="text-green-400">+4/tile</span>}
              {note && <span className="text-orange-400 text-[10px]">{note}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex-1" />

      {/* Undo / Cancel / End Turn */}
      <div className="flex gap-2 flex-shrink-0">
        {canUndo && (
          <button
            onClick={onUndo}
            title="Undo last action [Backspace / U]"
            className="px-3 py-2 rounded text-sm border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
          >
            ↩ Undo <span className="text-[10px] opacity-50 font-mono">⌫/U</span>
          </button>
        )}
        {mode.type !== 'idle' && (
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded text-sm border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={onEndTurn}
          title="End Turn [Enter]"
          className="px-4 py-2 rounded text-sm font-bold bg-yellow-500 hover:bg-yellow-400 text-black transition-colors"
        >
          End Turn <span className="text-[10px] opacity-60 font-normal ml-1">↵/J</span>
        </button>
      </div>
    </div>
  )
}
