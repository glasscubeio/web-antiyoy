import { useState, useEffect, useRef } from 'react'
import { useGame } from './hooks/useGame'
import HexGrid from './components/HexGrid'
import TopBar from './components/TopBar'
import BottomPanel from './components/BottomPanel'
import LogPanel from './components/LogPanel'
import GameOverlay from './components/GameOverlay'
import MobileControls from './components/MobileControls'
import { MapSize, MAX_ARMIES, PLAYER_COLORS, SELECTABLE_COLORS, UNIT_STATS, STRUCTURE_STATS } from './lib/constants'
import { hexKey } from './lib/hexMath'
import {
  preloadSounds,
  setSoundOn,
  setMusicOn,
  isSoundOn,
  isMusicOn,
} from './lib/sound'

type ModalType = 'none' | 'newgame' | 'settings' | 'rules'

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return JSON.parse(v) as T
  } catch { return fallback }
}

export default function App() {
  const [mapSize, setMapSize] = useState<MapSize>(() => loadPref('antiyoy_map_size', 'medium'))
  const [soundOn, setSoundOnState] = useState(() => loadPref('antiyoy_sound', true))
  const [musicOn, setMusicOnState] = useState(() => loadPref('antiyoy_music', true))
  const [playerColor, setPlayerColor] = useState(() => loadPref('antiyoy_player_color', PLAYER_COLORS[0]))
  const [modal, setModal] = useState<ModalType>('none')
  const [pendingMapSize, setPendingMapSize] = useState<MapSize>(mapSize)
  const [pendingPlayerCount, setPendingPlayerCount] = useState(2)
  // Temporarily show an enemy player's stats in the navbar when their capital is tapped
  const [previewPlayerId, setPreviewPlayerId] = useState<number | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { preloadSounds() }, [])

  useEffect(() => {
    setSoundOn(soundOn)
    setMusicOn(musicOn)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    state,
    isHumanTurn,
    farmCost,
    canUndo,
    clickTile: rawClickTile,
    doEndTurn,
    doUndo,
    startBuyingUnit,
    startBuyingStructure,
    cancelAction,
    newGame,
  } = useGame()

  // Wrap clickTile: when an enemy capital is tapped, briefly show that player's stats
  function clickTile(q: number, r: number) {
    const tile = state.tiles[hexKey(q, r)]
    if (tile?.structure?.type === 'capital' && tile.owner !== null && tile.owner !== 0) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      setPreviewPlayerId(tile.owner)
      previewTimerRef.current = setTimeout(() => setPreviewPlayerId(null), 2000)
    }
    rawClickTile(q, r)
  }

  function handleToggleSound() {
    const next = !isSoundOn()
    setSoundOn(next)
    setSoundOnState(next)
    localStorage.setItem('antiyoy_sound', JSON.stringify(next))
  }

  function handleToggleMusic() {
    const next = !isMusicOn()
    setMusicOn(next)
    setMusicOnState(next)
    localStorage.setItem('antiyoy_music', JSON.stringify(next))
  }

  function handleSetPlayerColor(c: string) {
    setPlayerColor(c)
    localStorage.setItem('antiyoy_player_color', JSON.stringify(c))
  }

  function openNewGame(sz?: MapSize) {
    const size = sz ?? mapSize
    setPendingMapSize(size)
    setPendingPlayerCount(pc => Math.min(pc, MAX_ARMIES[size]))
    setModal('newgame')
  }

  function handlePendingMapSize(sz: MapSize) {
    setPendingMapSize(sz)
    localStorage.setItem('antiyoy_map_size', JSON.stringify(sz))
    setPendingPlayerCount(pc => Math.min(pc, MAX_ARMIES[sz]))
  }

  function commitNewGame() {
    const sz = pendingMapSize
    setMapSize(sz)
    localStorage.setItem('antiyoy_map_size', JSON.stringify(sz))
    newGame(pendingPlayerCount, sz, [playerColor])
    setModal('none')
  }
  const showUndoFloat = isHumanTurn && (canUndo || state.actionMode.type !== 'idle')

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 select-none">
      <TopBar
        state={state}
        soundOn={soundOn}
        musicOn={musicOn}
        playerColor={playerColor}
        previewPlayerId={previewPlayerId}
        onNewGame={() => openNewGame()}
        onToggleSound={handleToggleSound}
        onToggleMusic={handleToggleMusic}
        onOpenSettings={() => setModal('settings')}
        onOpenRules={() => setModal('rules')}
      />

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 min-w-0 relative">
          <HexGrid state={state} onTileClick={clickTile} />
          <GameOverlay state={state} mapSize={mapSize} onNewGame={openNewGame} />
        </div>
        <div className="hidden md:flex">
          <LogPanel log={state.log} />
        </div>
      </div>

      {showUndoFloat && (
        <button
          onPointerDown={state.actionMode.type !== 'idle' ? cancelAction : doUndo}
          className="md:hidden fixed bottom-4 left-3 z-20 rounded-full bg-gray-800/95 border border-gray-500 text-white flex items-center justify-center shadow-xl backdrop-blur-sm active:scale-95 transition-transform touch-none"
          style={{ width: 48, height: 48 }}
        >
          <span className="text-xl leading-none">
            {state.actionMode.type !== 'idle' ? '✕' : '↩'}
          </span>
        </button>
      )}

      <MobileControls
        state={state}
        isHumanTurn={isHumanTurn}
        farmCost={farmCost}
        onEndTurn={doEndTurn}
        onBuyUnit={startBuyingUnit}
        onBuyStructure={startBuyingStructure}
        onCancel={cancelAction}
        onOpenRules={() => setModal('rules')}
      />

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

      {/* ══ NEW GAME MODAL ══ */}
      {modal === 'newgame' && (() => {
        const maxPlayers = MAX_ARMIES[pendingMapSize]
        return (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xs p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-base">New Game</h2>
                <button onClick={() => setModal('none')} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
              </div>

              {/* Map size */}
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Map Size</p>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as MapSize[]).map(sz => (
                    <button
                      key={sz}
                      onClick={() => handlePendingMapSize(sz)}
                      className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-colors ${
                        pendingMapSize === sz
                          ? 'bg-blue-700 border-blue-400 text-white'
                          : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {sz.charAt(0).toUpperCase() + sz.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player count */}
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Players — up to {maxPlayers} on {pendingMapSize}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: maxPlayers - 1 }, (_, i) => i + 2).map(n => (
                    <button
                      key={n}
                      onClick={() => setPendingPlayerCount(n)}
                      className={`w-9 h-9 rounded-lg border font-bold text-sm transition-colors ${
                        pendingPlayerCount === n
                          ? 'bg-yellow-500 border-yellow-400 text-black'
                          : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={commitNewGame}
                className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition-colors"
              >
                Start — {pendingPlayerCount} Players
              </button>
            </div>
          </div>
        )
      })()}

      {/* ══ SETTINGS MODAL ══ */}
      {modal === 'settings' && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xs p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-base">Settings</h2>
              <button onClick={() => setModal('none')} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Army color */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Your Army Color</p>
              <div className="grid grid-cols-5 gap-2">
                {SELECTABLE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => handleSetPlayerColor(c)}
                    className="w-full aspect-square rounded-lg transition-all hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: c,
                      outline: playerColor === c ? '2px solid #FBBF24' : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">Takes effect on next new game</p>
            </div>

            <div className="h-px bg-gray-800" />

            {/* Sound & music */}
            <div className="flex gap-3">
              <button
                onClick={handleToggleSound}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                  soundOn ? 'bg-green-900/50 border-green-600 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-500'
                }`}
              >
                <span>{soundOn ? '🔊' : '🔇'}</span> Sound
              </button>
              <button
                onClick={handleToggleMusic}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                  musicOn ? 'bg-green-900/50 border-green-600 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-500'
                }`}
              >
                <span>🎵</span> Music
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RULES MODAL ══ */}
      {modal === 'rules' && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-white font-bold text-base">Game Rules</h2>
              <button onClick={() => setModal('none')} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-5 flex flex-col gap-4 text-sm">
              <div>
                <p className="text-yellow-400 font-bold mb-1">Goal</p>
                <p className="text-gray-300 text-xs">Destroy every opponent's capital to win.</p>
              </div>
              <div>
                <p className="text-yellow-400 font-bold mb-1">Economy</p>
                <ul className="text-gray-300 text-xs space-y-0.5 list-disc list-inside">
                  <li>Each tile: +1 gold/turn · Farm tile: +4 gold/turn</li>
                  <li>Isolated land (≥2 tiles) gets its own economy</li>
                  <li>Single isolated tile is abandoned automatically</li>
                </ul>
              </div>
              <div>
                <p className="text-yellow-400 font-bold mb-1.5">Units</p>
                <div className="grid grid-cols-4 gap-1 text-[10px] text-gray-500 mb-1">
                  <span>Unit</span><span className="text-center">Str</span><span className="text-center">Cost</span><span className="text-center">Upkeep</span>
                </div>
                {Object.entries(UNIT_STATS).map(([k, s]) => (
                  <div key={k} className="grid grid-cols-4 gap-1 text-xs text-gray-200 py-0.5 border-t border-gray-800">
                    <span>{s.label}</span>
                    <span className="text-center">{s.strength}</span>
                    <span className="text-center text-yellow-400">{s.cost}💰</span>
                    <span className="text-center text-red-400">{s.upkeep}/t</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-yellow-400 font-bold mb-1.5">Structures</p>
                {[
                  { label: 'Farm', note: `+4 income, cost ${STRUCTURE_STATS.farm.cost}+ (inflation)` },
                  { label: 'Tower', note: `Def ${STRUCTURE_STATS.tower.defense}, cost ${STRUCTURE_STATS.tower.cost}, upkeep ${STRUCTURE_STATS.tower.upkeep}/t` },
                  { label: 'Strong Tower', note: `Def ${STRUCTURE_STATS.strongTower.defense}, cost ${STRUCTURE_STATS.strongTower.cost}, upkeep ${STRUCTURE_STATS.strongTower.upkeep}/t` },
                ].map(({ label, note }) => (
                  <div key={label} className="flex justify-between text-xs py-0.5 border-t border-gray-800">
                    <span className="text-gray-200">{label}</span>
                    <span className="text-gray-500">{note}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-yellow-400 font-bold mb-1">Controls</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                  {[
                    ['S', 'Cycle soldiers'],
                    ['T', 'Cycle structures'],
                    ['Enter / J', 'End turn'],
                    ['Backspace / U', 'Undo'],
                    ['Esc / Z', 'Cancel'],
                    ['Click tower', 'Show defense'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center gap-1.5 py-0.5">
                      <span className="font-mono bg-gray-800 text-gray-300 px-1 rounded text-[10px] leading-5 flex-shrink-0 whitespace-nowrap">{key}</span>
                      <span className="text-gray-400">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
