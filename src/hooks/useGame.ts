import { useState, useCallback, useEffect, useRef } from 'react'
import { GameState, UnitType, StructureType, ActionMode } from '../types'
import { generateMap } from '../lib/mapGenerator'
import { hexKey } from '../lib/hexMath'
import { MAP_SIZES, MapSize } from '../lib/constants'
import {
  handleTileClick as engineHandleTileClick,
  endTurn,
  setActionMode,
  canBuyUnit,
  canBuildStructure,
  getPlayerTotalGold,
  getFarmCost,
} from '../lib/gameEngine'
import { runAI } from '../lib/ai'
import { playSound, startMusicIfNeeded } from '../lib/sound'

const SAVE_KEY = 'antiyoy_save'
const HUMAN_PLAYER = 0

function makeInitialState(playerCount: number, mapSize: MapSize = 'medium'): GameState {
  const radius = MAP_SIZES[mapSize]
  const { tiles, players, provinceGold, farmsBought } = generateMap(playerCount, undefined, radius)
  return {
    tiles, players, provinceGold, farmsBought,
    currentPlayer: 0, turn: 1, phase: 'playing', winner: null,
    actionMode: { type: 'idle' },
    log: ['Game started!'],
    mapRadius: radius,
  }
}

export function useGame(playerCount: number = 2) {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem(SAVE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GameState
        if (!parsed.provinceGold) parsed.provinceGold = {}
        if (!parsed.farmsBought) parsed.farmsBought = {}
        if (!parsed.mapRadius) parsed.mapRadius = 8
        return parsed
      } catch { /* fall through */ }
    }
    return makeInitialState(playerCount)
  })

  // Always-fresh state ref so callbacks with empty deps can read current state
  const stateRef = useRef(state)
  stateRef.current = state

  const aiRunning = useRef(false)
  const undoStack = useRef<GameState[]>([])
  const [canUndo, setCanUndo] = useState(false)

  // Auto-save
  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  }, [state])

  // AI turn trigger
  useEffect(() => {
    if (state.phase === 'gameover') return
    if (state.currentPlayer === HUMAN_PLAYER) return
    if (aiRunning.current) return

    aiRunning.current = true
    runAI(state, setState)
      .then(newState => {
        setState(newState)
        aiRunning.current = false
      })
      .catch(() => { aiRunning.current = false })
  }, [state.currentPlayer, state.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const clickTile = useCallback((q: number, r: number) => {
    const s = stateRef.current
    if (s.currentPlayer !== HUMAN_PLAYER) return
    startMusicIfNeeded()

    const key = hexKey(q, r)
    const tile = s.tiles[key]
    const mode = s.actionMode

    // Trigger appropriate sound based on what's about to happen
    if (mode.type === 'buyingUnit') {
      playSound('coin')
    } else if (mode.type === 'buyingStructure') {
      playSound('build')
    } else if (mode.type === 'unitSelected') {
      const fromKey = hexKey(mode.coord.q, mode.coord.r)
      if (key !== fromKey) {
        playSound(tile?.owner !== s.currentPlayer ? 'attack' : 'walk')
      }
    } else if (mode.type === 'idle') {
      if (tile?.owner === s.currentPlayer && tile?.unit && !tile.unit.moved) {
        playSound('select_unit')
      }
    }

    setState(prev => {
      const prevMode = prev.actionMode
      const isRealAction =
        prevMode.type === 'buyingUnit' ||
        prevMode.type === 'buyingStructure' ||
        (prevMode.type === 'unitSelected' && key !== hexKey(prevMode.coord.q, prevMode.coord.r))
      const next = engineHandleTileClick(prev, key)
      if (isRealAction && next !== prev) {
        undoStack.current = [...undoStack.current.slice(-9), prev]
        setCanUndo(true)
      }
      return next
    })
  }, []) // uses stateRef.current

  const doEndTurn = useCallback(() => {
    if (stateRef.current.currentPlayer !== HUMAN_PLAYER) return
    startMusicIfNeeded()
    playSound('end_turn')
    undoStack.current = []
    setCanUndo(false)
    setState(s => endTurn(s))
  }, [])

  const doUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    playSound('kb_press')
    const prev = undoStack.current[undoStack.current.length - 1]
    undoStack.current = undoStack.current.slice(0, -1)
    setCanUndo(undoStack.current.length > 0)
    setState(prev)
  }, [])

  const startBuyingUnit = useCallback((unitType: UnitType) => {
    playSound('menu_button')
    setState(s => {
      const mode: ActionMode = s.actionMode.type === 'buyingUnit' && s.actionMode.unitType === unitType
        ? { type: 'idle' }
        : { type: 'buyingUnit', unitType }
      return setActionMode(s, mode)
    })
  }, [])

  const startBuyingStructure = useCallback((structureType: StructureType) => {
    playSound('menu_button')
    setState(s => {
      const isAlreadyBuying =
        s.actionMode.type === 'buyingStructure' && s.actionMode.structureType === structureType
      const mode: ActionMode = isAlreadyBuying
        ? { type: 'idle' }
        : { type: 'buyingStructure', structureType }
      return setActionMode(s, mode)
    })
  }, [])

  const cancelAction = useCallback(() => {
    playSound('kb_press')
    setState(s => setActionMode(s, { type: 'idle' }))
  }, [])

  const newGame = useCallback((pc?: number, sz: MapSize = 'medium') => {
    playSound('menu_button')
    localStorage.removeItem(SAVE_KEY)
    aiRunning.current = false
    undoStack.current = []
    setCanUndo(false)
    setState(makeInitialState(pc ?? playerCount, sz))
  }, [playerCount])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = stateRef.current
      if (s.phase === 'gameover') return

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          doEndTurn()
          break
        case 'Delete':
          e.preventDefault()
          if (s.currentPlayer === HUMAN_PLAYER) {
            if (s.actionMode.type !== 'idle') cancelAction()
            else doUndo()
          }
          break
        case '1': if (s.currentPlayer === HUMAN_PLAYER) startBuyingUnit('peasant'); break
        case '2': if (s.currentPlayer === HUMAN_PLAYER) startBuyingUnit('spearman'); break
        case '3': if (s.currentPlayer === HUMAN_PLAYER) startBuyingUnit('knight'); break
        case '4': if (s.currentPlayer === HUMAN_PLAYER) startBuyingUnit('baron'); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [doEndTurn, doUndo, cancelAction, startBuyingUnit])

  const currentPlayerObj = state.players[state.currentPlayer]
  const isHumanTurn = state.currentPlayer === HUMAN_PLAYER
  const totalGold = getPlayerTotalGold(state, state.currentPlayer)
  const farmCost = getFarmCost(state, state.currentPlayer)

  return {
    state,
    currentPlayerObj,
    isHumanTurn,
    totalGold,
    farmCost,
    canUndo,
    clickTile,
    doEndTurn,
    doUndo,
    startBuyingUnit,
    startBuyingStructure,
    cancelAction,
    newGame,
    canBuyUnit: (tileKey: string, u: UnitType) => canBuyUnit(state, tileKey, u),
    canBuildStructure: (tileKey: string, t: StructureType) => canBuildStructure(state, tileKey, t),
  }
}
