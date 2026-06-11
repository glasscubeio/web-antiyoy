import { useState, useRef, useEffect } from 'react'
import { GameState } from '../types'
import { MapSize } from '../lib/constants'
import { getProvinces, getPlayerTotalGold, getPlayerNetIncome } from '../lib/gameEngine'

interface Props {
  state: GameState
  mapSize: MapSize
  soundOn: boolean
  musicOn: boolean
  onNewGame: () => void
  onSetMapSize: (size: MapSize) => void
  onToggleSound: () => void
  onToggleMusic: () => void
}

const SIZE_LABELS: Record<MapSize, string> = { small: 'S', medium: 'M', large: 'L' }

export default function TopBar({
  state, mapSize, soundOn, musicOn,
  onNewGame, onSetMapSize, onToggleSound, onToggleMusic,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [menuOpen])

  return (
    <div className="relative flex-shrink-0">
      {/* ── Desktop bar ── */}
      <div className="hidden md:flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm">
        {/* Left: title + turn + size picker */}
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-base tracking-wide">ANTIYOY</span>
          <span className="text-gray-400">Turn {state.turn}</span>
          <div className="flex items-center gap-1 ml-1">
            {(['small', 'medium', 'large'] as MapSize[]).map(sz => (
              <button
                key={sz}
                onClick={() => onSetMapSize(sz)}
                title={sz.charAt(0).toUpperCase() + sz.slice(1)}
                className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                  mapSize === sz
                    ? 'bg-blue-600 border-blue-400 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'
                }`}
              >
                {SIZE_LABELS[sz]}
              </button>
            ))}
          </div>
        </div>

        {/* Center: player scores */}
        <div className="flex items-center gap-3">
          {state.players.map(p => {
            const provinces = getProvinces(state, p.id)
            const tileCount = provinces.reduce((s, pr) => s + pr.size, 0)
            const totalGold = getPlayerTotalGold(state, p.id)
            const isCurrent = p.id === state.currentPlayer
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
                  isCurrent ? 'ring-2 ring-yellow-400 bg-gray-800' : 'opacity-60'
                } ${!p.alive ? 'line-through opacity-30' : ''}`}
              >
                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-white font-medium">{p.name}</span>
                <span className="text-yellow-400">💰{totalGold}</span>
                <span className="text-gray-300">🗺{tileCount}</span>
              </div>
            )
          })}
        </div>

        {/* Right: sound + music + new game */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            title={soundOn ? 'Sound ON — click to mute' : 'Sound OFF — click to unmute'}
            className={`px-2 py-1 rounded border text-sm transition-colors ${
              soundOn
                ? 'border-gray-600 text-gray-300 hover:text-white hover:border-gray-400'
                : 'border-gray-700 text-gray-600 hover:text-gray-400'
            }`}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button
            onClick={onToggleMusic}
            title={musicOn ? 'Music ON — click to mute' : 'Music OFF — click to unmute'}
            className={`px-2 py-1 rounded border text-sm transition-colors ${
              musicOn
                ? 'border-gray-600 text-gray-300 hover:text-white hover:border-gray-400'
                : 'border-gray-700 text-gray-600 hover:text-gray-400'
            }`}
          >
            {musicOn ? '🎵' : '🎵'}
            {!musicOn && <span className="text-red-400 text-[10px] ml-0.5">✕</span>}
          </button>
          <button
            onClick={onNewGame}
            className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-3 py-1 rounded transition-colors"
          >
            New Game
          </button>
        </div>
      </div>

      {/* ── Mobile bar ── */}
      <div className="flex md:hidden items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700" ref={menuRef}>
        {/* Left: turn counter */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-white font-bold text-sm tracking-wide">A</span>
          <span className="text-gray-500 text-xs">T{state.turn}</span>
        </div>

        {/* Center: player status — color + gold + income */}
        <div className="flex items-center gap-3 flex-1 justify-center">
          {state.players.map(p => {
            const gold = getPlayerTotalGold(state, p.id)
            const net = getPlayerNetIncome(state, p.id)
            const isCurrent = p.id === state.currentPlayer
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1 transition-opacity ${
                  !p.alive ? 'opacity-20' : isCurrent ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${isCurrent ? 'ring-2 ring-yellow-400' : ''}`}
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-yellow-300 text-xs font-bold">{gold}</span>
                <span className={`text-[10px] font-medium ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {net >= 0 ? '+' : ''}{net}
                </span>
              </div>
            )
          })}
        </div>

        {/* Right: triple-dot menu */}
        <button
          onPointerDown={() => setMenuOpen(o => !o)}
          className="w-8 h-8 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-800 text-xl leading-none touch-none flex-shrink-0"
        >
          ⋮
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute top-full right-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 w-52 flex flex-col gap-3">
            {/* Sound / Music toggles */}
            <div className="flex gap-2">
              <button
                onPointerDown={onToggleSound}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  soundOn
                    ? 'bg-green-900 border-green-600 text-green-300'
                    : 'bg-gray-800 border-gray-600 text-gray-400'
                }`}
              >
                {soundOn ? '🔊' : '🔇'}
                <span className="text-xs">{soundOn ? 'SFX' : 'SFX'}</span>
              </button>
              <button
                onPointerDown={onToggleMusic}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  musicOn
                    ? 'bg-green-900 border-green-600 text-green-300'
                    : 'bg-gray-800 border-gray-600 text-gray-400'
                }`}
              >
                🎵
                <span className="text-xs">{musicOn ? 'Music' : 'Music'}</span>
                {!musicOn && <span className="text-red-400 text-xs">✕</span>}
              </button>
            </div>

            <div className="h-px bg-gray-700" />

            {/* Map size */}
            <div>
              <div className="text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Map Size</div>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as MapSize[]).map(sz => (
                  <button
                    key={sz}
                    onPointerDown={() => { onSetMapSize(sz); setMenuOpen(false) }}
                    className={`flex-1 py-1.5 rounded-lg border text-sm font-bold transition-colors ${
                      mapSize === sz
                        ? 'bg-blue-700 border-blue-400 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-300 active:bg-gray-700'
                    }`}
                  >
                    {SIZE_LABELS[sz]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-gray-700" />

            {/* New Game */}
            <button
              onPointerDown={() => { onNewGame(); setMenuOpen(false) }}
              className="w-full py-2 rounded-lg bg-yellow-500 text-black font-bold text-sm hover:bg-yellow-400 transition-colors"
            >
              New Game
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
