import { useState, useRef, useEffect } from 'react'
import { GameState } from '../types'
import { getProvinces, getPlayerTotalGold, getPlayerNetIncome } from '../lib/gameEngine'

interface Props {
  state: GameState
  soundOn: boolean
  musicOn: boolean
  playerColor: string
  /** When non-null, temporarily show this player's stats in the "my stats" chip */
  previewPlayerId: number | null
  onNewGame: () => void
  onToggleSound: () => void
  onToggleMusic: () => void
  onOpenSettings: () => void
  onOpenRules: () => void
}

function PlayerRow({ state, id, isMe }: { state: GameState; id: number; isMe: boolean }) {
  const p = state.players[id]
  const provinces = getProvinces(state, id)
  const tiles = provinces.reduce((s, pr) => s + pr.size, 0)
  const gold = getPlayerTotalGold(state, id)
  const net = getPlayerNetIncome(state, id)
  const isCurrent = id === state.currentPlayer

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${isCurrent ? 'bg-gray-800' : ''} ${!p.alive ? 'opacity-30' : ''}`}>
      <span className="relative flex-shrink-0">
        <span className="block w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
        {isCurrent && <span className="absolute -inset-0.5 rounded-full ring-2 ring-yellow-400 pointer-events-none" />}
      </span>
      <span className="text-white text-xs font-medium min-w-[36px]">{isMe ? 'You' : p.name}</span>
      {p.alive ? (
        <>
          <span className="text-yellow-300 text-xs font-bold ml-auto">{gold}💰</span>
          <span className={`text-[11px] font-medium w-10 text-right ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {net >= 0 ? '+' : ''}{net}/t
          </span>
          <span className="text-gray-400 text-[11px] w-8 text-right">{tiles}🗺</span>
        </>
      ) : (
        <span className="text-red-500 text-xs ml-auto">Eliminated</span>
      )}
    </div>
  )
}

export default function TopBar({
  state, soundOn, musicOn, playerColor, previewPlayerId,
  onNewGame, onToggleSound, onToggleMusic, onOpenSettings, onOpenRules,
}: Props) {
  const [statsOpen, setStatsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mobileMenuOpen && !mobileStatsOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
        setMobileStatsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [mobileMenuOpen, mobileStatsOpen])

  function handleStatsEnter() {
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current)
    setStatsOpen(true)
  }
  function handleStatsLeave() {
    statsTimerRef.current = setTimeout(() => setStatsOpen(false), 120)
  }

  const myId = 0

  // Which player to display in the "my stats" chip — preview overrides self
  const displayId = previewPlayerId ?? myId
  const displayPlayer = state.players[displayId]
  const displayGold = getPlayerTotalGold(state, displayId)
  const displayNet = getPlayerNetIncome(state, displayId)
  const isPreview = previewPlayerId !== null

  const btnBase = 'px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 bg-gray-900'

  return (
    <div className="relative flex-shrink-0">

      {/* ══ DESKTOP BAR ══ */}
      <div className="hidden md:flex items-center h-11 px-4 bg-gray-950 border-b border-gray-800 gap-3 text-sm">

        {/* Logo + Turn */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-white font-black tracking-widest text-sm">ANTIYOY</span>
          <span className="text-gray-600 text-xs font-mono">T{state.turn}</span>
        </div>

        <div className="w-px h-5 bg-gray-800 flex-shrink-0" />

        {/* My Stats (or previewed player stats) */}
        <div className={`flex items-center gap-1.5 flex-shrink-0 transition-all ${isPreview ? 'ring-1 ring-yellow-500/50 px-1.5 rounded-lg' : ''}`}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: displayPlayer?.color ?? playerColor }} />
          {isPreview && <span className="text-yellow-500/80 text-[9px] font-bold uppercase tracking-wide">enemy</span>}
          <span className="text-yellow-300 font-bold text-sm">{displayGold}</span>
          <span className="text-[10px]">💰</span>
          <span className={`text-xs font-medium ${displayNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {displayNet >= 0 ? '+' : ''}{displayNet}/t
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats dropdown */}
        <div
          ref={statsRef}
          className="relative flex-shrink-0"
          onMouseEnter={handleStatsEnter}
          onMouseLeave={handleStatsLeave}
        >
          <button className={`${btnBase} flex items-center gap-1`}>
            Stats
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 8 5">
              <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {statsOpen && (
            <div
              className="absolute top-full right-0 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-2 z-50"
              onMouseEnter={handleStatsEnter}
              onMouseLeave={handleStatsLeave}
            >
              <p className="text-[10px] text-gray-600 uppercase tracking-wider px-2 mb-1">Armies</p>
              {state.players.map(p => (
                <PlayerRow key={p.id} state={state} id={p.id} isMe={p.id === myId} />
              ))}
            </div>
          )}
        </div>

        <button onClick={onOpenRules} className={btnBase} title="Game Rules">Rules</button>
        <button onClick={onOpenSettings} className={btnBase} title="Settings">
          <span className="text-base leading-none">⚙</span>
        </button>
        <button
          onClick={onNewGame}
          className="px-3 py-1 rounded-lg border border-yellow-600 bg-yellow-600/10 text-yellow-300 hover:bg-yellow-500 hover:text-black font-bold text-xs transition-colors flex-shrink-0"
        >
          New Game
        </button>
      </div>

      {/* ══ MOBILE BAR ══ */}
      <div className="flex md:hidden items-center h-11 px-3 bg-gray-950 border-b border-gray-800 gap-2" ref={menuRef}>

        {/* Logo + Turn */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-white font-black text-sm tracking-widest">A</span>
          <span className="text-gray-600 text-[11px] font-mono">T{state.turn}</span>
        </div>

        {/* My stats chip (or preview) — tappable to show all-player stats */}
        <button
          onPointerDown={() => { setMobileStatsOpen(o => !o); setMobileMenuOpen(false) }}
          className={`flex items-center gap-1.5 flex-shrink-0 touch-none transition-all ${isPreview ? 'bg-yellow-500/10 ring-1 ring-yellow-500/40 rounded-lg px-1' : ''}`}
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: displayPlayer?.color ?? playerColor }} />
          {isPreview && <span className="text-yellow-500/80 text-[9px] font-bold">👁</span>}
          <span className="text-yellow-300 font-bold text-xs">{displayGold}💰</span>
          <span className={`text-[10px] font-medium ${displayNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {displayNet >= 0 ? '+' : ''}{displayNet}
          </span>
          <svg className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 8 5">
            <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Enemy color dots */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {state.players.filter(p => p.id !== myId).map(p => (
            <span
              key={p.id}
              className={`w-2 h-2 rounded-full ${!p.alive ? 'opacity-30' : ''} ${p.id === state.currentPlayer ? 'ring-1 ring-yellow-400' : ''}`}
              style={{ backgroundColor: p.color }}
            />
          ))}
        </div>

        {/* Menu toggle */}
        <button
          onPointerDown={() => { setMobileMenuOpen(o => !o); setMobileStatsOpen(false) }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 text-lg leading-none touch-none flex-shrink-0"
        >
          ⋮
        </button>

        {/* Mobile Stats panel */}
        {mobileStatsOpen && (
          <div className="absolute top-full left-0 right-0 z-50 bg-gray-900 border-b border-gray-700 shadow-2xl p-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider px-2 mb-1">Armies</p>
            {state.players.map(p => (
              <PlayerRow key={p.id} state={state} id={p.id} isMe={p.id === myId} />
            ))}
          </div>
        )}

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute top-full right-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 w-48 flex flex-col gap-2 mr-2 mt-0.5">
            <button
              onPointerDown={() => { onOpenSettings(); setMobileMenuOpen(false) }}
              className="w-full py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm font-medium text-left px-3"
            >
              ⚙ Settings
            </button>
            <button
              onPointerDown={() => { onOpenRules(); setMobileMenuOpen(false) }}
              className="w-full py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm font-medium text-left px-3"
            >
              ? Rules
            </button>
            <div className="flex gap-2">
              <button
                onPointerDown={onToggleSound}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${soundOn ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
              >
                {soundOn ? '🔊' : '🔇'} SFX
              </button>
              <button
                onPointerDown={onToggleMusic}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${musicOn ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
              >
                🎵 {musicOn ? 'On' : 'Off'}
              </button>
            </div>
            <button
              onPointerDown={() => { onNewGame(); setMobileMenuOpen(false) }}
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
