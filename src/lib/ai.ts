import { GameState, UnitType } from '../types'
import { hexKey, hexNeighbors } from './hexMath'
import { UNIT_STATS, UNIT_ORDER, STRUCTURE_STATS } from './constants'
import {
  canBuyUnit,
  canBuildStructure,
  moveUnit,
  spawnUnit,
  buildStructure,
  endTurn,
  getReachableTiles,
  getSpawnableTiles,
  getProvinces,
  getProvinceCapital,
  getProvinceGold,
  getFarmCost,
} from './gameEngine'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Local income helpers ──────────────────────────────────────────────────────

function provIncome(state: GameState, province: Set<string>): number {
  let v = 0
  for (const k of province) {
    const t = state.tiles[k]
    if (t.terrain === 'pine' || t.terrain === 'palm' || t.terrain === 'grave') continue
    v += t.structure?.type === 'farm' ? 4 : 1
  }
  return v
}

function provTax(state: GameState, province: Set<string>): number {
  let v = 0
  for (const k of province) {
    const t = state.tiles[k]
    if (t.unit) v += UNIT_STATS[t.unit.type].upkeep
    if (t.structure) v += STRUCTURE_STATS[t.structure.type].upkeep
  }
  return v
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function attackScore(state: GameState, tileKey: string, aiId: number): number {
  const t = state.tiles[tileKey]
  if (!t || t.owner === aiId) return -999

  let score = t.owner === null ? 3 : 6
  if (t.owner !== null) {
    if (t.structure?.type === 'capital') score += 50
    else if (t.structure?.type === 'strongTower') score += 10
    else if (t.structure?.type === 'tower') score += 5
    if (t.unit) score += UNIT_STATS[t.unit.type].strength * 3
  }
  // More of our tiles adjacent = easier to hold
  for (const nb of hexNeighbors(t.q, t.r)) {
    if (state.tiles[hexKey(nb.q, nb.r)]?.owner === aiId) score += 0.5
  }
  return score
}

function borderExposure(state: GameState, k: string, aiId: number): number {
  const t = state.tiles[k]
  let n = 0
  for (const nb of hexNeighbors(t.q, t.r)) {
    const nt = state.tiles[hexKey(nb.q, nb.r)]
    if (nt && nt.owner !== aiId) n++
  }
  return n
}

function loneliness(state: GameState, k: string, aiId: number): number {
  const t = state.tiles[k]
  let presence = 0
  if (t.unit) presence += UNIT_STATS[t.unit.type].strength * 3
  if (t.structure) presence += STRUCTURE_STATS[t.structure.type].defense * 2
  for (const nb of hexNeighbors(t.q, t.r)) {
    const nt = state.tiles[hexKey(nb.q, nb.r)]
    if (!nt || nt.owner !== aiId) continue
    if (nt.unit) presence += UNIT_STATS[nt.unit.type].strength
    if (nt.structure) presence += STRUCTURE_STATS[nt.structure.type].defense * 0.5
  }
  return Math.max(0, 6 - presence)
}

// ── Movement selection ────────────────────────────────────────────────────────

function pickBestMove(state: GameState, fromKey: string): string | null {
  const reachable = getReachableTiles(state, fromKey)
  if (!reachable.size) return null
  const aiId = state.currentPlayer

  let bestKey: string | null = null
  let bestScore = -Infinity

  for (const k of reachable) {
    const t = state.tiles[k]
    let score: number

    if (t.owner !== aiId) {
      score = attackScore(state, k, aiId) + Math.random() * 0.6
    } else {
      // Defensive reposition: only if border tile and lonely
      const exp = borderExposure(state, k, aiId)
      score = exp > 0 ? loneliness(state, k, aiId) + exp - 6 : -12
    }

    if (score > bestScore) {
      bestScore = score
      bestKey = k
    }
  }

  // Always move to attack; only reposition defensively if genuinely needed
  return bestScore >= 1 ? bestKey : null
}

// ── Spending helpers ──────────────────────────────────────────────────────────

function pickStrongestAffordable(gold: number): UnitType | null {
  for (let i = UNIT_ORDER.length - 1; i >= 0; i--) {
    if (gold >= UNIT_STATS[UNIT_ORDER[i]].cost) return UNIT_ORDER[i]
  }
  return null
}

function findBestPlacementTile(state: GameState, province: Set<string>, aiId: number): string | null {
  let bestKey: string | null = null
  let bestScore = -Infinity
  for (const k of province) {
    const t = state.tiles[k]
    if (t.owner !== aiId || t.unit || t.structure) continue
    const score = borderExposure(state, k, aiId) * 2 + loneliness(state, k, aiId) + Math.random() * 0.4
    if (score > bestScore) { bestScore = score; bestKey = k }
  }
  return bestKey
}

function findValidFarmTile(state: GameState, province: Set<string>): string | null {
  // Picks any province tile that passes canBuildStructure (enforces adjacency to capital/farm)
  for (const k of province) {
    if (canBuildStructure(state, k, 'farm')) return k
  }
  return null
}

function findTowerSpot(state: GameState, province: Set<string>, aiId: number): string | null {
  let bestKey: string | null = null
  let bestScore = -Infinity
  for (const k of province) {
    const t = state.tiles[k]
    if (t.owner !== aiId || t.unit || t.structure) continue
    const exp = borderExposure(state, k, aiId)
    if (exp === 0) continue
    const score = exp * 3 + loneliness(state, k, aiId)
    if (score > bestScore) { bestScore = score; bestKey = k }
  }
  return bestScore >= 4 ? bestKey : null
}

// ── Main AI ───────────────────────────────────────────────────────────────────

export async function runAI(
  state: GameState,
  onStateUpdate: (s: GameState) => void
): Promise<GameState> {
  let s = state
  const aiId = s.currentPlayer

  await sleep(100)

  // ── Phase 1: Move all units — most exposed first, always attack ───────────

  const getUnmoved = () =>
    Object.keys(s.tiles)
      .filter(k => s.tiles[k].owner === aiId && !!s.tiles[k].unit && !s.tiles[k].unit!.moved)
      .sort((a, b) => borderExposure(s, b, aiId) - borderExposure(s, a, aiId))

  for (const fromKey of getUnmoved()) {
    if (!s.tiles[fromKey]?.unit || s.tiles[fromKey].unit!.moved) continue
    const toKey = pickBestMove(s, fromKey)
    if (toKey) {
      s = moveUnit(s, fromKey, toKey)
      onStateUpdate(s)
      await sleep(60)
    }
  }

  // ── Phase 2: Aggressive per-province spending ─────────────────────────────

  for (const province of getProvinces(s, aiId)) {
    const capKey = getProvinceCapital(s.tiles, province)
    if (!capKey) continue

    // Build farms to shore up economy: whenever income is negative or province is large
    const net = provIncome(s, province) - provTax(s, province)
    const farmCost = getFarmCost(s, aiId)
    const farmCount = [...province].filter(k => s.tiles[k].structure?.type === 'farm').length
    const wantFarm = (net < -2 && province.size >= 4) || (province.size >= 8 && farmCount < Math.floor(province.size / 6))
    if (wantFarm && getProvinceGold(s, capKey) >= farmCost) {
      const ft = findValidFarmTile(s, province)
      if (ft) {
        s = buildStructure(s, ft, 'farm')
        onStateUpdate(s)
        await sleep(30)
      }
    }

    // Buy + attack-spawn as many units as possible (up to 8 per province)
    for (let i = 0; i < 8; i++) {
      const gold = getProvinceGold(s, capKey)
      const unitType = pickStrongestAffordable(gold)
      if (!unitType) break

      // Try attack-spawn onto adjacent capturable tile first
      const spawnable = getSpawnableTiles(s, unitType)
      let bestAttackKey: string | null = null
      let bestAttackScore = -Infinity

      for (const k of spawnable) {
        const t = s.tiles[k]
        if (t.owner === aiId) continue
        // Must be adjacent to this province
        const adj = hexNeighbors(t.q, t.r).some(nb => {
          const nk = hexKey(nb.q, nb.r)
          return province.has(nk) && s.tiles[nk]?.owner === aiId
        })
        if (!adj) continue
        const sc = attackScore(s, k, aiId)
        if (sc > bestAttackScore) { bestAttackScore = sc; bestAttackKey = k }
      }

      if (bestAttackKey && bestAttackScore >= 1) {
        const prev = s
        s = spawnUnit(s, bestAttackKey, unitType)
        if (s !== prev) { onStateUpdate(s); await sleep(55); continue }
      }

      // Otherwise place on best owned border tile
      const place = findBestPlacementTile(s, province, aiId)
      if (!place || !canBuyUnit(s, place, unitType)) break
      const prev = s
      s = spawnUnit(s, place, unitType)
      if (s === prev) break  // placement failed, stop buying
      onStateUpdate(s)
      await sleep(40)
    }

    // Build tower at most exposed lonely border (if leftover gold)
    if (getProvinceGold(s, capKey) >= STRUCTURE_STATS.tower.cost) {
      const ts = findTowerSpot(s, province, aiId)
      if (ts && canBuildStructure(s, ts, 'tower')) {
        s = buildStructure(s, ts, 'tower')
        onStateUpdate(s)
        await sleep(30)
      }
    }
  }

  await sleep(55)
  s = endTurn(s)
  return s
}
