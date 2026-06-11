import { useState, useEffect, useRef, useMemo } from 'react'
import { GameState } from '../types'
import { hexKey, hexToPixel, hexCornerPoints, hexNeighbors } from '../lib/hexMath'
import { UNIT_STATS, STRUCTURE_STATS } from '../lib/constants'
import {
  tileDefense,
  getReachableTiles,
  getSpawnableTiles,
  canBuildStructure,
} from '../lib/gameEngine'

const HEX_SIZE = 42

interface Props {
  state: GameState
  onTileClick: (q: number, r: number) => void
}

interface VP { x: number; y: number; w: number; h: number }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function clampVP(vp: VP, b: { minX: number; minY: number; width: number; height: number }): VP {
  const w = clamp(vp.w, b.width / 7, b.width)
  const h = vp.h * (w / vp.w)
  const x = clamp(vp.x, b.minX, b.minX + b.width - w)
  const y = clamp(vp.y, b.minY, b.minY + b.height - h)
  return { x, y, w, h }
}

function getTileColor(state: GameState, tileKey: string): string {
  const tile = state.tiles[tileKey]
  if (!tile) return '#000'
  if (tile.owner !== null) return state.players[tile.owner]?.color ?? '#888'
  if (tile.terrain === 'pine') return '#2D5A1B'
  if (tile.terrain === 'palm') return '#1A4D3A'
  if (tile.terrain === 'grave') return '#5A5A5A'
  return '#8B7D6B'
}

function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.max(0, r - amount).toString(16).padStart(2, '0')
  const dg = Math.max(0, g - amount).toString(16).padStart(2, '0')
  const db = Math.max(0, b - amount).toString(16).padStart(2, '0')
  return `#${dr}${dg}${db}`
}

function getSpriteUrl(state: GameState, tileKey: string): string | null {
  const tile = state.tiles[tileKey]
  if (!tile) return null
  if (tile.unit) return UNIT_STATS[tile.unit.type].sprite
  if (tile.structure) return STRUCTURE_STATS[tile.structure.type].sprite
  if (tile.terrain === 'pine') return '/assets/pine.png'
  if (tile.terrain === 'palm') return '/assets/palm.png'
  if (tile.terrain === 'grave') return '/assets/grave.png'
  return null
}

function computeBounds(tiles: Record<string, { q: number; r: number }>, size: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { q, r } of Object.values(tiles)) {
    const { x, y } = hexToPixel(q, r, size)
    const m = size * 1.2
    minX = Math.min(minX, x - m); minY = Math.min(minY, y - m)
    maxX = Math.max(maxX, x + m); maxY = Math.max(maxY, y + m)
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

const DEFENSE_STRUCTURES = new Set(['tower', 'strongTower', 'capital'])

export default function HexGrid({ state, onTileClick }: Props) {
  const mode = state.actionMode
  const containerRef = useRef<HTMLDivElement>(null)
  const bounds = useMemo(() => computeBounds(state.tiles, HEX_SIZE), [state.tiles])
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  // Viewport (null = show full map)
  const [vp, setVP] = useState<VP | null>(null)
  const evp: VP = vp ?? { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
  const vpRef = useRef(evp)
  vpRef.current = evp

  // Reset viewport on map change
  const tileCount = Object.keys(state.tiles).length
  useEffect(() => { setVP(null) }, [tileCount])

  // Drag-to-pan
  const dragRef = useRef<{ sx: number; sy: number; svp: VP } | null>(null)
  const wasDragging = useRef(false)

  // Pinch-to-zoom (stored as last pinch dist + mid)
  const pinchRef = useRef<{ d: number; mx: number; my: number } | null>(null)

  // Defense visualization
  const [shieldKeys, setShieldKeys] = useState<Set<string>>(new Set())
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Non-passive wheel + touch event listeners
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const cvp = vpRef.current
      const b = boundsRef.current
      const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1)
      const px = cvp.x + fx * cvp.w
      const py = cvp.y + fy * cvp.h
      const fac = e.deltaY > 0 ? 1.13 : 0.87
      const newW = clamp(cvp.w * fac, b.width / 7, b.width)
      const ratio = newW / cvp.w
      const newH = cvp.h * ratio
      setVP(clampVP({ x: px - fx * newW, y: py - fy * newH, w: newW, h: newH }, b))
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dx = e.touches[1].clientX - e.touches[0].clientX
        const dy = e.touches[1].clientY - e.touches[0].clientY
        pinchRef.current = {
          d: Math.hypot(dx, dy),
          mx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          my: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const p = pinchRef.current
        const rect = el!.getBoundingClientRect()
        const cvp = vpRef.current
        const b = boundsRef.current
        const dx = e.touches[1].clientX - e.touches[0].clientX
        const dy = e.touches[1].clientY - e.touches[0].clientY
        const d = Math.hypot(dx, dy)
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2
        const fac = p.d / d  // fingers apart = zoom in (smaller vp window)
        const fx = clamp((mx - rect.left) / rect.width, 0, 1)
        const fy = clamp((my - rect.top) / rect.height, 0, 1)
        const px = cvp.x + fx * cvp.w
        const py = cvp.y + fy * cvp.h
        const panDx = (mx - p.mx) * cvp.w / rect.width
        const panDy = (my - p.my) * cvp.h / rect.height
        const newW = clamp(cvp.w * fac, b.width / 7, b.width)
        const ratio = newW / cvp.w
        const newH = cvp.h * ratio
        setVP(clampVP({
          x: px - fx * newW - panDx,
          y: py - fy * newH - panDy,
          w: newW, h: newH,
        }, b))
        pinchRef.current = { d, mx, my }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchRef.current = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Global pointermove/up for drag-to-pan
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current || pinchRef.current) return
      const dx = e.clientX - dragRef.current.sx
      const dy = e.clientY - dragRef.current.sy
      if (Math.abs(dx) + Math.abs(dy) > 4) wasDragging.current = true
      if (!wasDragging.current) return
      const el = containerRef.current
      if (!el) return
      const { svp } = dragRef.current
      const sdx = -dx * svp.w / el.clientWidth
      const sdy = -dy * svp.h / el.clientHeight
      setVP(clampVP({ x: svp.x + sdx, y: svp.y + sdy, w: svp.w, h: svp.h }, boundsRef.current))
    }
    function onUp() { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Defense zone visualization on tower/castle click.
  // Chains to other friendly defense structures within hex-distance ≤ 2.
  // Shields are shown only on tiles owned by the same player.
  function showDefenseZone(centerKey: string, owner: number | null) {
    if (shieldTimer.current) clearTimeout(shieldTimer.current)
    const CHAIN_MAX_DIST = 2  // chain structures that are ≤ 2 hexes apart
    const covered = new Set<string>()
    const toProcess = [centerKey]
    const done = new Set<string>()

    while (toProcess.length > 0) {
      const sk = toProcess.pop()!
      if (done.has(sk)) continue
      done.add(sk)
      const st = state.tiles[sk]
      if (!st || st.owner !== owner || !st.structure || !DEFENSE_STRUCTURES.has(st.structure.type)) continue

      // Cover this structure's ZOC — only friendly tiles
      covered.add(sk)
      for (const nb of hexNeighbors(st.q, st.r)) {
        const nk = hexKey(nb.q, nb.r)
        const nt = state.tiles[nk]
        if (nt && nt.owner === owner) covered.add(nk)
      }

      // Chain to nearby friendly defense structures within CHAIN_MAX_DIST
      // BFS outward up to CHAIN_MAX_DIST steps from current structure
      const frontier: Array<{ q: number; r: number; d: number }> = [{ q: st.q, r: st.r, d: 0 }]
      const visited = new Set<string>([sk])
      while (frontier.length > 0) {
        const cur = frontier.shift()!
        if (cur.d >= CHAIN_MAX_DIST) continue
        for (const nb of hexNeighbors(cur.q, cur.r)) {
          const nk = hexKey(nb.q, nb.r)
          if (visited.has(nk)) continue
          visited.add(nk)
          frontier.push({ q: nb.q, r: nb.r, d: cur.d + 1 })
          const nt = state.tiles[nk]
          if (nt && nt.owner === owner && nt.structure && DEFENSE_STRUCTURES.has(nt.structure.type) && !done.has(nk)) {
            toProcess.push(nk)
          }
        }
      }
    }

    setShieldKeys(covered)
    shieldTimer.current = setTimeout(() => setShieldKeys(new Set()), 3000)
  }

  function handleTileClick(q: number, r: number) {
    if (wasDragging.current) { wasDragging.current = false; return }
    const key = hexKey(q, r)
    const tile = state.tiles[key]
    if (tile?.structure && DEFENSE_STRUCTURES.has(tile.structure.type)) {
      showDefenseZone(key, tile.owner)
    }
    onTileClick(q, r)
  }

  // Selected / reachable / buyable tiles
  const selectedKey = mode.type === 'unitSelected' ? hexKey(mode.coord.q, mode.coord.r) : null

  const reachable = useMemo(() => {
    if (mode.type !== 'unitSelected') return new Set<string>()
    return getReachableTiles(state, hexKey(mode.coord.q, mode.coord.r))
  }, [mode, state])

  const buyHighlight = useMemo(() => {
    if (mode.type === 'buyingUnit') return getSpawnableTiles(state, mode.unitType)
    if (mode.type === 'buyingStructure') {
      const set = new Set<string>()
      for (const k of Object.keys(state.tiles)) {
        if (canBuildStructure(state, k, mode.structureType)) set.add(k)
      }
      return set
    }
    return new Set<string>()
  }, [mode, state])

  const tileKeys = Object.keys(state.tiles)
  const viewBox = `${evp.x} ${evp.y} ${evp.w} ${evp.h}`

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#1a1a2e] overflow-hidden"
      style={{ cursor: wasDragging.current ? 'grabbing' : 'grab', touchAction: 'pan-x pan-y' }}
      onPointerDown={e => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, svp: evp }
        wasDragging.current = false
      }}
    >
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {tileKeys.map(k => {
          const tile = state.tiles[k]
          const { x, y } = hexToPixel(tile.q, tile.r, HEX_SIZE)
          const points = hexCornerPoints(x, y, HEX_SIZE - 1)
          const fill = getTileColor(state, k)
          const isSelected = k === selectedKey
          const isReachable = reachable.has(k)
          const isBuyable = buyHighlight.has(k)
          const isMovedUnit = tile.unit?.moved && tile.owner === state.currentPlayer
          const showDefense = isReachable && tile.owner !== state.currentPlayer
          const defNum = showDefense ? tileDefense(tile, state.tiles) : 0
          const spriteUrl = getSpriteUrl(state, k)
          const spriteSize = HEX_SIZE * 0.9
          const sx = x - spriteSize / 2
          const sy = y - spriteSize / 2
          const shouldBounce = !!tile.unit && !tile.unit.moved && tile.owner === state.currentPlayer

          const stroke = isSelected ? '#FBBF24'
            : isReachable ? '#34D399'
            : isBuyable ? '#38BDF8'
            : tile.owner !== null ? darkenHex(state.players[tile.owner]?.color ?? '#888', 50)
            : '#5A4E3C'
          const strokeWidth = (isSelected || isReachable || isBuyable) ? 2.5 : 1

          // Upgrade indicator: tower tile highlighted for strongTower buy
          const isUpgradable = isBuyable && mode.type === 'buyingStructure' &&
            mode.structureType === 'strongTower' && tile.structure?.type === 'tower'

          return (
            <g key={k} onClick={() => handleTileClick(tile.q, tile.r)} style={{ cursor: 'pointer' }}>
              <polygon
                points={points}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={isMovedUnit ? 0.65 : 1}
              />
              {isSelected && (
                <polygon points={points} fill="none" stroke="#FBBF24" strokeWidth={3} opacity={0.6} />
              )}
              {isReachable && !isSelected && (
                <polygon
                  points={points}
                  fill={tile.owner !== state.currentPlayer ? '#FCA5A5' : '#D1FAE5'}
                  fillOpacity={0.25}
                  stroke="#34D399" strokeWidth={2.5}
                />
              )}
              {isBuyable && !isSelected && !isReachable && (
                <polygon
                  points={points}
                  fill={isUpgradable ? '#FFF3B0' : '#E0F2FE'}
                  fillOpacity={isUpgradable ? 0.4 : 0.22}
                  stroke={isUpgradable ? '#FACC15' : '#38BDF8'}
                  strokeWidth={2.5}
                />
              )}
              {/* Sprite with bounce for unmoved units */}
              {spriteUrl && (
                <g style={shouldBounce ? {
                  animation: 'bounce-unit 0.8s ease-in-out infinite',
                  transformOrigin: `${x}px ${y}px`,
                } : undefined}>
                  <image
                    href={spriteUrl}
                    x={sx} y={sy - HEX_SIZE * 0.05}
                    width={spriteSize} height={spriteSize}
                    style={{ pointerEvents: 'none' }}
                    opacity={isMovedUnit ? 0.55 : 1}
                  />
                </g>
              )}
              {/* Unit strength badge */}
              {tile.unit && (
                <text
                  x={x + HEX_SIZE * 0.42} y={y - HEX_SIZE * 0.38}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fontWeight="bold"
                  fill="white" stroke="#000" strokeWidth={2} paintOrder="stroke"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {UNIT_STATS[tile.unit.type].strength}
                </text>
              )}
              {/* Defense badge on attackable tiles */}
              {showDefense && defNum > 0 && (
                <text
                  x={x - HEX_SIZE * 0.35} y={y - HEX_SIZE * 0.38}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fontWeight="bold"
                  fill="#FCA5A5" stroke="#000" strokeWidth={2} paintOrder="stroke"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  🛡{defNum}
                </text>
              )}
              {/* Shield defense visualization (1-second flash) */}
              {shieldKeys.has(k) && (
                <image
                  href="/assets/shield.png"
                  x={sx + spriteSize * 0.1}
                  y={sy - HEX_SIZE * 0.05 + spriteSize * 0.1}
                  width={spriteSize * 0.8}
                  height={spriteSize * 0.8}
                  opacity={0.75}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
