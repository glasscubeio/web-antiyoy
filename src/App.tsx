import { useState, useEffect } from 'react'
import { useGame } from './hooks/useGame'
import HexGrid from './components/HexGrid'
import TopBar from './components/TopBar'
import BottomPanel from './components/BottomPanel'
import LogPanel from './components/LogPanel'
import GameOverlay from './components/GameOverlay'
import MobileControls from './components/MobileControls'
import { MapSize } from './lib/constants'
import {
  preloadSounds,
  setSoundOn,
  setMusicOn,
  isSoundOn,
  isMusicOn,
} from './lib/sound'

export default function App() {
  const [mapSize, setMapSize] = useState<MapSize>('medium')
  const [soundOn, setSoundOnState] = useState(true)
  const [musicOn, setMusicOnState] = useState(true)

  // Preload sounds once on mount
  useEffect(() => {
    preloadSounds()
  }, [])

  function handleToggleSound() {
    const next = !isSoundOn()
    setSoundOn(next)
    setSoundOnState(next)
  }

  function handleToggleMusic() {
    const next = !isMusicOn()
    setMusicOn(next)
    setMusicOnState(next)
  }

  const {
    state,
    isHumanTurn,
    farmCost,
    canUndo,
    clickTile,
    doEndTurn,
    doUndo,
    startBuyingUnit,
    startBuyingStructure,
    cancelAction,
    newGame,
  } = useGame(2)

  function handleSetMapSize(sz: MapSize) {
    setMapSize(sz)
    newGame(2, sz)
  }

  const showUndoFloat = isHumanTurn && (canUndo || state.actionMode.type !== 'idle')

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 select-none">
      <TopBar
        state={state}
        mapSize={mapSize}
        soundOn={soundOn}
        musicOn={musicOn}
        onNewGame={() => newGame(2, mapSize)}
        onSetMapSize={handleSetMapSize}
        onToggleSound={handleToggleSound}
        onToggleMusic={handleToggleMusic}
      />

      <div className="flex flex-1 min-h-0 relative">
        {/* Main game area */}
        <div className="flex-1 min-w-0 relative">
          <HexGrid state={state} onTileClick={clickTile} />
          <GameOverlay state={state} mapSize={mapSize} onNewGame={handleSetMapSize} />
        </div>

        {/* Desktop: log panel */}
        <div className="hidden md:flex">
          <LogPanel log={state.log} />
        </div>
      </div>

      {/* Mobile: floating undo / cancel — bottom-left */}
      {showUndoFloat && (
        <button
          onPointerDown={state.actionMode.type !== 'idle' ? cancelAction : doUndo}
          className="md:hidden fixed bottom-4 left-3 z-20 rounded-full bg-gray-800/95 border border-gray-500 text-white flex items-center justify-center shadow-xl backdrop-blur-sm active:scale-95 transition-transform touch-none"
          style={{ width: 48, height: 48 }}
          title={state.actionMode.type !== 'idle' ? 'Cancel' : 'Undo'}
        >
          <span className="text-xl leading-none">
            {state.actionMode.type !== 'idle' ? '✕' : '↩'}
          </span>
        </button>
      )}

      {/* Mobile: floating action buttons — bottom-right */}
      <MobileControls
        state={state}
        isHumanTurn={isHumanTurn}
        farmCost={farmCost}
        onEndTurn={doEndTurn}
        onBuyUnit={startBuyingUnit}
        onBuyStructure={startBuyingStructure}
        onCancel={cancelAction}
      />

      {/* Desktop bottom panel */}
      <BottomPanel
        state={state}
        isHumanTurn={isHumanTurn}
        farmCost={farmCost}
        canUndo={canUndo}
        onEndTurn={doEndTurn}
        onUndo={doUndo}
        onBuyUnit={startBuyingUnit}
        onBuyStructure={startBuyingStructure}
        onCancel={cancelAction}
      />
    </div>
  )
}
