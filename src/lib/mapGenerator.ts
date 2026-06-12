import { HexTile, Player, GameState } from '../types'
import { hexKey, hexNeighbors, hexDistance } from './hexMath'
import { PLAYER_COLORS, PLAYER_NAMES, MAP_RADIUS, STARTING_PROVINCE_GOLD } from './constants'

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

/**
 * Generate an organic island shape using radial sinusoidal boundary perturbation.
 * Larger radius → more Fourier modes → more complex coastline.
 */
function generateOrganicIsland(
  allCoords: Array<{ q: number; r: number }>,
  radius: number,
  rng: () => number
): Set<string> {
  // More modes for bigger maps → more complex / varied shapes
  const numModes = Math.min(3 + Math.floor(radius / 2.5), 12)

  const modes = Array.from({ length: numModes }, (_, i) => ({
    freq: i + 1,
    amp: radius * 0.1 * Math.pow(0.72, i) * (0.4 + rng() * 0.8),
    phase: rng() * Math.PI * 2,
  }))

  const baseRadius = radius * (0.68 + rng() * 0.14)

  function radiusBoundary(angle: number): number {
    let r = baseRadius
    for (const m of modes) {
      r += m.amp * Math.cos(m.freq * angle + m.phase)
    }
    return Math.max(1.5, r)
  }

  // Add peninsula blobs for medium+ maps
  const peninsulaCount = radius >= 8 ? 1 + Math.floor(rng() * (radius >= 14 ? 4 : 2)) : 0
  const peninsulas: Array<{ q: number; r: number; rad: number }> = []
  for (let i = 0; i < peninsulaCount; i++) {
    const angle = rng() * Math.PI * 2
    const d = radius * (0.5 + rng() * 0.35)
    peninsulas.push({
      q: Math.round(Math.cos(angle) * d),
      r: Math.round(Math.sin(angle) * d * 1.15),
      rad: radius * (0.1 + rng() * 0.22),
    })
  }

  const included = new Set<string>()

  for (const { q, r } of allCoords) {
    const dist = hexDistance({ q, r }, { q: 0, r: 0 })
    // Use axial→cartesian angle for the boundary function
    const cartX = q + r * 0.5
    const cartY = r * (Math.sqrt(3) / 2)
    const angle = Math.atan2(cartY, cartX)
    const limit = radiusBoundary(angle)

    const inPeninsula = peninsulas.some(
      p => hexDistance({ q, r }, { q: p.q, r: p.r }) <= p.rad
    )

    if (dist <= limit || inPeninsula) {
      included.add(hexKey(q, r))
    }
  }

  included.add(hexKey(0, 0))
  return included
}

export function generateMap(
  playerCount: number = 2,
  seed?: number,
  radius: number = MAP_RADIUS,
  colorOverrides?: string[]
): Pick<GameState, 'tiles' | 'players' | 'provinceGold' | 'farmsBought'> {
  const rng = seededRandom(seed ?? Date.now())

  // Build all hex coords within bounding radius
  const allCoords: Array<{ q: number; r: number }> = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= radius) {
        allCoords.push({ q, r })
      }
    }
  }

  // Organic island shape
  const included = generateOrganicIsland(allCoords, radius, rng)

  // Ensure connectivity by flood fill from center
  const connected = new Set<string>()
  const queue: Array<{ q: number; r: number }> = [{ q: 0, r: 0 }]
  connected.add(hexKey(0, 0))
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nb of hexNeighbors(cur.q, cur.r)) {
      const k = hexKey(nb.q, nb.r)
      if (included.has(k) && !connected.has(k)) {
        connected.add(k)
        queue.push(nb)
      }
    }
  }

  // Build tiles with terrain
  const tiles: Record<string, HexTile> = {}
  for (const k of connected) {
    const [q, r] = k.split(',').map(Number)
    const dist = hexDistance({ q, r }, { q: 0, r: 0 })
    let terrain: HexTile['terrain'] = 'grass'
    if (dist >= radius - 2 && rng() < 0.3) {
      terrain = 'palm'
    } else if (rng() < 0.12) {
      terrain = 'pine'
    }
    tiles[k] = { q, r, terrain, owner: null, unit: null, structure: null }
  }

  // Place players
  const players: Player[] = []
  const provinceGold: Record<string, number> = {}
  const farmsBought: Record<number, number> = {}
  const startPositions = findStartPositions(tiles, playerCount, rng, radius)

  // Human player (0) takes their chosen color.
  // AI players (1+) take remaining PLAYER_COLORS in order, skipping the human's color.
  const humanColor = colorOverrides?.[0] ?? PLAYER_COLORS[0]
  const aiColorPool = PLAYER_COLORS.filter(c => c !== humanColor)
  const colorToName = Object.fromEntries(PLAYER_COLORS.map((c, i) => [c, PLAYER_NAMES[i]]))

  for (let i = 0; i < playerCount; i++) {
    const color = i === 0 ? humanColor : (aiColorPool[i - 1] ?? PLAYER_COLORS[i])
    players.push({
      id: i,
      name: i === 0 ? (colorToName[humanColor] ?? PLAYER_NAMES[0]) : (colorToName[color] ?? PLAYER_NAMES[i]),
      color,
      alive: true,
    })

    const center = startPositions[i]
    const clusterKeys = [hexKey(center.q, center.r)]
    for (const nb of hexNeighbors(center.q, center.r)) {
      const k = hexKey(nb.q, nb.r)
      if (tiles[k]) clusterKeys.push(k)
    }

    for (const k of clusterKeys) {
      tiles[k].owner = i
      tiles[k].terrain = 'grass'
      tiles[k].unit = null
      tiles[k].structure = null
    }

    const capitalKey = hexKey(center.q, center.r)
    tiles[capitalKey].structure = { type: 'capital' }
    provinceGold[capitalKey] = STARTING_PROVINCE_GOLD

    const adj = hexNeighbors(center.q, center.r).find(
      nb => tiles[hexKey(nb.q, nb.r)]?.owner === i && !tiles[hexKey(nb.q, nb.r)].unit
    )
    if (adj) {
      tiles[hexKey(adj.q, adj.r)].unit = { type: 'peasant', moved: false }
    }
  }

  return { tiles, players, provinceGold, farmsBought }
}

function findStartPositions(
  tiles: Record<string, HexTile>,
  count: number,
  rng: () => number,
  radius: number
): Array<{ q: number; r: number }> {
  const keys = Object.keys(tiles)
  const coords = keys.map(k => {
    const [q, r] = k.split(',').map(Number)
    return { q, r }
  })

  coords.sort((a, b) => hexDistance(b, { q: 0, r: 0 }) - hexDistance(a, { q: 0, r: 0 }))

  const positions: Array<{ q: number; r: number }> = []
  const angleSlice = (2 * Math.PI) / count
  const jitter = rng() * Math.PI * 2
  const minPlayerDist = Math.max(3, Math.round(radius * 0.55))

  for (let i = 0; i < count; i++) {
    const targetAngle = jitter + i * angleSlice
    const targetDist = radius * 0.55

    let best = coords[0]
    let bestScore = Infinity

    for (const c of coords) {
      const cartX = c.q + c.r * 0.5
      const cartY = c.r * (Math.sqrt(3) / 2)
      const angle = Math.atan2(cartY, cartX)
      const dist = hexDistance(c, { q: 0, r: 0 })
      let angleDiff = Math.abs(angle - targetAngle)
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
      const score = angleDiff * 4 + Math.abs(dist - targetDist)

      const hasEnoughNeighbors =
        hexNeighbors(c.q, c.r).filter(nb => tiles[hexKey(nb.q, nb.r)]).length >= 3

      const farEnough = positions.every(p => hexDistance(p, c) >= minPlayerDist)

      if (score < bestScore && hasEnoughNeighbors && farEnough) {
        bestScore = score
        best = c
      }
    }

    positions.push(best)
  }

  return positions
}
