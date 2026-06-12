import { GameState, UnitType, StructureType } from '../types'
import { UNIT_STATS, UNIT_ORDER } from '../lib/constants'

const STRUCTURE_CYCLE: StructureType[] = ['farm', 'tower', 'strongTower']
const STRUCTURE_ICONS: Record<StructureType, string> = {
  farm: '🌾', tower: '🗼', strongTower: '🏰', capital: '⭐',
}

interface Props {
  state: GameState
  isHumanTurn: boolean
  farmCost: number
  onEndTurn: () => void
  onBuyUnit: (u: UnitType) => void
  onBuyStructure: (t: StructureType) => void
  onCancel: () => void
  onOpenRules: () => void
}

export default function MobileControls({
  state, isHumanTurn, onEndTurn, onBuyUnit, onBuyStructure, onCancel, onOpenRules,
}: Props) {
  const mode = state.actionMode

  const activeUnit: UnitType = mode.type === 'buyingUnit' ? mode.unitType : 'peasant'
  const activeStructure: StructureType = mode.type === 'buyingStructure' ? mode.structureType : 'farm'
  const unitIdx = UNIT_ORDER.indexOf(activeUnit)
  const structureIdx = STRUCTURE_CYCLE.indexOf(activeStructure)

  const isUnitActive = mode.type === 'buyingUnit'
  const isStructureActive = mode.type === 'buyingStructure'

  function handleSoldier() {
    if (!isHumanTurn) return
    if (mode.type === 'buyingUnit') {
      const idx = UNIT_ORDER.indexOf(mode.unitType)
      if (idx >= UNIT_ORDER.length - 1) onCancel()
      else onBuyUnit(UNIT_ORDER[idx + 1])
    } else {
      onBuyUnit('peasant')
    }
  }

  function handleStructure() {
    if (!isHumanTurn) return
    if (mode.type === 'buyingStructure') {
      const idx = STRUCTURE_CYCLE.indexOf(mode.structureType)
      if (idx >= STRUCTURE_CYCLE.length - 1) onCancel()
      else onBuyStructure(STRUCTURE_CYCLE[idx + 1])
    } else {
      onBuyStructure('farm')
    }
  }

  const unitStat = UNIT_STATS[activeUnit]

  return (
    <div className="md:hidden fixed bottom-4 right-3 z-20 flex flex-col items-center gap-2">
      {/* AI thinking indicator */}
      {!isHumanTurn && (
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-900/90 border border-gray-600 text-lg animate-pulse shadow-lg">
          ⏳
        </div>
      )}

      {/* Rules button */}
      <button
        onPointerDown={onOpenRules}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-900/80 border border-gray-600 text-gray-300 text-sm font-bold shadow touch-none select-none active:scale-95 transition-transform"
        title="Game Rules"
      >
        ?
      </button>

      {/* Soldier cycle button */}
      <button
        onPointerDown={handleSoldier}
        disabled={!isHumanTurn}
        className={`relative w-12 h-12 flex flex-col items-center justify-center rounded-full border-2 shadow-lg touch-none select-none transition-all ${
          isUnitActive
            ? 'bg-green-800/95 border-green-400 text-white scale-110'
            : isHumanTurn
            ? 'bg-gray-900/90 border-gray-500 text-white active:scale-95'
            : 'bg-gray-900/60 border-gray-700 text-gray-600'
        }`}
      >
        <img src={unitStat.sprite} alt={unitStat.label} className="w-7 h-7 object-contain" />
        <div className="absolute -bottom-1 flex gap-0.5">
          {UNIT_ORDER.map((_, i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full ${
                isUnitActive && i === unitIdx ? 'bg-green-400' : 'bg-gray-500'
              }`}
            />
          ))}
        </div>
      </button>

      {/* Structure cycle button */}
      <button
        onPointerDown={handleStructure}
        disabled={!isHumanTurn}
        className={`relative w-12 h-12 flex flex-col items-center justify-center rounded-full border-2 shadow-lg touch-none select-none transition-all ${
          isStructureActive
            ? 'bg-blue-800/95 border-blue-400 text-white scale-110'
            : isHumanTurn
            ? 'bg-gray-900/90 border-gray-500 text-white active:scale-95'
            : 'bg-gray-900/60 border-gray-700 text-gray-600'
        }`}
      >
        <span className="text-xl leading-none">{STRUCTURE_ICONS[activeStructure]}</span>
        <div className="absolute -bottom-1 flex gap-0.5">
          {STRUCTURE_CYCLE.map((_, i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full ${
                isStructureActive && i === structureIdx ? 'bg-blue-400' : 'bg-gray-500'
              }`}
            />
          ))}
        </div>
      </button>

      {/* End Turn button */}
      <button
        onPointerDown={onEndTurn}
        disabled={!isHumanTurn}
        className={`w-12 h-12 flex items-center justify-center rounded-full border-2 shadow-lg font-bold touch-none select-none transition-all text-lg ${
          isHumanTurn
            ? 'bg-yellow-500/95 border-yellow-300 text-black active:scale-95'
            : 'bg-gray-900/60 border-gray-700 text-gray-600'
        }`}
        title="End Turn"
      >
        ▶
      </button>
    </div>
  )
}
