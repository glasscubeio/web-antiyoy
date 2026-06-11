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

export function generateMap(
  playerCount: number = 2,
  seed?: number,
  radius: number = MAP_RADIUS
): Pick<GameState, 'tiles' | 'players' | 'provinceGold' | 'farmsBought'> {
  const rng = seededRandom(seed ?? Date.now())

  // Build hex island
  const allCoords: Array<{ q: number; r: number }> = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= radius) {
        allCoords.push({ q, r })
      }
    }
  }

  // Random island shape
  const included = new Set<string>()
  for (const { q, r } of allCoords) {
    const dist = hexDistance({ q, r }, { q: 0, r: 0 })
    const noise = rng() * 2.5
    if (dist + noise <= radius - 0.5) {
      included.add(hexKey(q, r))
    }
  }

  // Ensure connectivity by flood filling from center
  const connected = new Set<string>()
  const queue: Array<{ q: number; r: number }> = [{ q: 0, r: 0 }]
  if (!included.has(hexKey(0, 0))) included.add(hexKey(0, 0))
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

  // Build tiles with appropriate terrain
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

  for (let i = 0; i < playerCount; i++) {
    players.push({
      id: i,
      name: PLAYER_NAMES[i],
      color: PLAYER_COLORS[i],
      alive: true,
    })

    // Give each player a starting cluster
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

    // Capital at center
    const capitalKey = hexKey(center.q, center.r)
    tiles[capitalKey].structure = { type: 'capital' }
    provinceGold[capitalKey] = STARTING_PROVINCE_GOLD

    // Starting peasant adjacent to capital
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

  // Sort by distance from center descending to prefer outer positions
  coords.sort((a, b) => hexDistance(b, { q: 0, r: 0 }) - hexDistance(a, { q: 0, r: 0 }))

  const positions: Array<{ q: number; r: number }> = []
  const angleSlice = (2 * Math.PI) / count
  const jitter = rng() * Math.PI * 2
  const minPlayerDist = Math.max(3, Math.round(radius * 0.6))

  for (let i = 0; i < count; i++) {
    const targetAngle = jitter + i * angleSlice
    const targetDist = radius * 0.55

    let best = coords[0]
    let bestScore = Infinity

    for (const c of coords) {
      const angle = Math.atan2(c.r, c.q)
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
