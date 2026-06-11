import { GameState, HexTile, UnitType, StructureType, ActionMode } from '../types'
import { hexKey, hexNeighbors, floodFill } from './hexMath'
import {
  UNIT_STATS,
  STRUCTURE_STATS,
  UNIT_ORDER,
  FARM_INCOME,
  NORMAL_TILE_INCOME,
  TREE_CUT_REWARD,
  GRAVE_TO_PINE_CHANCE,
  PINE_SPREAD_CHANCE,
  CAPITAL_BASE_COST,
  FARM_BASE_COST,
  FARM_INFLATION,
} from './constants'

// ── helpers ───────────────────────────────────────────────────────────────────

function isTree(tile: HexTile): boolean {
  return tile.terrain === 'pine' || tile.terrain === 'palm'
}

function isFree(tile: HexTile): boolean {
  return !tile.unit && !tile.structure
}

/**
 * Full ZOC-aware defense for a tile.
 * Defense = max of:
 *   - tile's own unit strength
 *   - tile's own structure defense
 *   - each adjacent same-faction tile's unit strength
 *   - each adjacent same-faction tile's structure defense
 */
export function tileDefense(tile: HexTile, tiles: Record<string, HexTile>): number {
  const unitStr = tile.unit ? UNIT_STATS[tile.unit.type].strength : 0
  const structDef = tile.structure ? STRUCTURE_STATS[tile.structure.type].defense : 0
  let zoc = 0

  if (tile.owner !== null) {
    for (const nb of hexNeighbors(tile.q, tile.r)) {
      const nbTile = tiles[hexKey(nb.q, nb.r)]
      if (!nbTile || nbTile.owner !== tile.owner) continue
      if (nbTile.unit) zoc = Math.max(zoc, UNIT_STATS[nbTile.unit.type].strength)
      if (nbTile.structure) zoc = Math.max(zoc, STRUCTURE_STATS[nbTile.structure.type].defense)
    }
  }

  return Math.max(unitStr, structDef, zoc)
}

function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s))
}

// ── province helpers ──────────────────────────────────────────────────────────

/** BFS flood fill to get all connected tiles owned by `owner` starting from `tileKey`. */
export function getProvinceOf(
  tiles: Record<string, HexTile>,
  tileKey: string,
  owner: number
): Set<string> {
  const startTile = tiles[tileKey]
  if (!startTile || startTile.owner !== owner) return new Set()
  return floodFill({ q: startTile.q, r: startTile.r }, (q, r) => {
    const t = tiles[hexKey(q, r)]
    return !!t && t.owner === owner
  })
}

/** Find the capital (TOWN) tile key in a province, or null if none. */
export function getProvinceCapital(
  tiles: Record<string, HexTile>,
  province: Set<string>
): string | null {
  for (const k of province) {
    if (tiles[k]?.structure?.type === 'capital') return k
  }
  return null
}

/** Get saved gold for a province identified by its capital key. */
export function getProvinceGold(state: GameState, capitalKey: string): number {
  return state.provinceGold[capitalKey] ?? 0
}

/** Sum all province golds belonging to a player (for display). */
export function getPlayerTotalGold(state: GameState, playerId: number): number {
  let total = 0
  const provinces = getProvinces(state, playerId)
  for (const province of provinces) {
    const capKey = getProvinceCapital(state.tiles, province)
    if (capKey) total += getProvinceGold(state, capKey)
  }
  return total
}

/** Total net income per turn for a player (income - upkeep, all provinces). */
export function getPlayerNetIncome(state: GameState, playerId: number): number {
  let total = 0
  for (const province of getProvinces(state, playerId)) {
    total += provinceIncome(state, province) - provinceTax(state, province)
  }
  return total
}

/** All provinces (connected same-owner regions) for a player. */
export function getProvinces(state: GameState, playerId: number): Array<Set<string>> {
  const ownedKeys = Object.keys(state.tiles).filter(k => state.tiles[k].owner === playerId)
  const visited = new Set<string>()
  const provinces: Array<Set<string>> = []

  for (const k of ownedKeys) {
    if (visited.has(k)) continue
    const province = getProvinceOf(state.tiles, k, playerId)
    for (const pk of province) visited.add(pk)
    provinces.push(province)
  }

  return provinces
}

/**
 * Get the province (Set<string>) and capital key for a given tile.
 * Returns null if the tile has no owner.
 */
function getProvinceContext(
  state: GameState,
  tileKey: string
): { province: Set<string>; capitalKey: string | null } | null {
  const tile = state.tiles[tileKey]
  if (!tile || tile.owner === null) return null
  const province = getProvinceOf(state.tiles, tileKey, tile.owner)
  const capitalKey = getProvinceCapital(state.tiles, province)
  return { province, capitalKey }
}

// ── income / upkeep per province ──────────────────────────────────────────────

function tileIncome(tile: HexTile): number {
  if (isTree(tile) || tile.terrain === 'grave') return 0
  if (tile.structure?.type === 'farm') return FARM_INCOME
  return NORMAL_TILE_INCOME
}

function tileTax(tile: HexTile): number {
  let tax = 0
  if (tile.unit) tax += UNIT_STATS[tile.unit.type].upkeep
  if (tile.structure) tax += STRUCTURE_STATS[tile.structure.type].upkeep
  return tax
}

function provinceIncome(state: GameState, province: Set<string>): number {
  let total = 0
  for (const k of province) total += tileIncome(state.tiles[k])
  return total
}

function provinceTax(state: GameState, province: Set<string>): number {
  let total = 0
  for (const k of province) total += tileTax(state.tiles[k])
  return total
}

// ── movement BFS ──────────────────────────────────────────────────────────────

/**
 * BFS through the unit's province up to its movement range.
 * Peasants: 3 steps. All other ranks: 4 steps.
 * Can merge into friendly units even if they have already moved this turn.
 */
export function getReachableTiles(state: GameState, fromKey: string): Set<string> {
  const from = state.tiles[fromKey]
  if (!from?.unit || from.unit.moved || from.owner !== state.currentPlayer) return new Set()

  const atkStr = UNIT_STATS[from.unit.type].strength
  const maxDist = atkStr === 1 ? 3 : 4  // peasant 3 steps, others 4 steps

  const reachable = new Set<string>()
  const distMap = new Map<string, number>([[fromKey, 0]])
  const queue: Array<{ key: string; dist: number }> = [{ key: fromKey, dist: 0 }]

  while (queue.length > 0) {
    const { key, dist } = queue.shift()!
    const tile = state.tiles[key]

    for (const nb of hexNeighbors(tile.q, tile.r)) {
      const nk = hexKey(nb.q, nb.r)
      const nt = state.tiles[nk]
      if (!nt) continue

      if (nt.owner === state.currentPlayer) {
        const newDist = dist + 1
        if (!distMap.has(nk) && newDist <= maxDist) {
          distMap.set(nk, newDist)
          queue.push({ key: nk, dist: newDist })
          if (!nt.unit) {
            reachable.add(nk)
          } else {
            // Can merge into ANY friendly unit (moved or not) if combined strength ≤ 4
            const merged = atkStr + UNIT_STATS[nt.unit.type].strength
            if (merged <= 4) reachable.add(nk)
          }
        }
      } else {
        // Enemy/neutral: attack from any reachable adjacent friendly position
        if (!reachable.has(nk)) {
          const defStr = tileDefense(nt, state.tiles)
          if (atkStr > defStr) reachable.add(nk)
        }
      }
    }
  }

  return reachable
}

// ── action validation ─────────────────────────────────────────────────────────

export function canMoveUnit(state: GameState, fromKey: string, toKey: string): boolean {
  const reachable = getReachableTiles(state, fromKey)
  return reachable.has(toKey)
}

/**
 * Can buy a unit on tileKey:
 *   - tile owned by current player
 *   - tile empty (no unit)
 *   - province has a capital
 *   - province gold >= unit cost
 */
export function canBuyUnit(state: GameState, tileKey: string, unitType: UnitType): boolean {
  const tile = state.tiles[tileKey]
  if (!tile || tile.owner !== state.currentPlayer) return false
  if (tile.unit) {
    // Allow merge: combined strength must be ≤ 4
    const merged = UNIT_STATS[tile.unit.type].strength + UNIT_STATS[unitType].strength
    if (merged > 4) return false
  }
  const ctx = getProvinceContext(state, tileKey)
  if (!ctx) return false
  if (!ctx.capitalKey) return false
  const gold = getProvinceGold(state, ctx.capitalKey)
  return gold >= UNIT_STATS[unitType].cost
}

/**
 * Can build a structure on tileKey:
 *   - tile owned by current player
 *   - no unit on tile
 *   - no existing structure (can't double-build)
 *   - province has capital and enough gold
 */
export function canBuildStructure(state: GameState, tileKey: string, type: StructureType): boolean {
  if (type === 'capital') return false
  const tile = state.tiles[tileKey]
  if (!tile || tile.owner !== state.currentPlayer) return false
  if (tile.unit) return false
  if (tile.structure) {
    // Only allowed upgrade: tower → strongTower
    if (type === 'strongTower' && tile.structure.type === 'tower') { /* proceed */ }
    else return false
  }
  // Farms can only be placed adjacent to a capital or another farm
  if (type === 'farm') {
    const adjToAnchor = hexNeighbors(tile.q, tile.r).some(nb => {
      const nt = state.tiles[hexKey(nb.q, nb.r)]
      return nt?.owner === state.currentPlayer &&
        (nt.structure?.type === 'capital' || nt.structure?.type === 'farm')
    })
    if (!adjToAnchor) return false
  }
  const ctx = getProvinceContext(state, tileKey)
  if (!ctx || !ctx.capitalKey) return false
  const gold = getProvinceGold(state, ctx.capitalKey)
  const cost = type === 'farm' ? getFarmCost(state, state.currentPlayer) : STRUCTURE_STATS[type].cost
  return gold >= cost
}

/** Cost of the next farm for a player (inflation: +4 per farm already built). */
export function getFarmCost(state: GameState, playerId: number): number {
  const count = state.farmsBought[playerId] ?? 0
  return FARM_BASE_COST + count * FARM_INFLATION
}

/** Can manually build a capital: owned tile, no unit/structure, province has no capital, player can afford it. */
export function canBuildCapital(state: GameState, tileKey: string): boolean {
  const tile = state.tiles[tileKey]
  if (!tile || tile.owner !== state.currentPlayer) return false
  if (tile.unit || tile.structure) return false
  // Province must not already have a capital
  const province = getProvinceOf(state.tiles, tileKey, state.currentPlayer)
  if (getProvinceCapital(state.tiles, province)) return false
  // Fixed cost — deducted from richest province
  return getPlayerTotalGold(state, state.currentPlayer) >= CAPITAL_BASE_COST
}

/** Build a capital on tileKey; deducts fixed cost from the player's richest province. */
export function buildCapital(state: GameState, tileKey: string): GameState {
  if (!canBuildCapital(state, tileKey)) return state
  const s = cloneState(state)
  const cost = CAPITAL_BASE_COST
  let richestCapKey: string | null = null
  let maxGold = -1
  for (const province of getProvinces(s, s.currentPlayer)) {
    const capKey = getProvinceCapital(s.tiles, province)
    if (!capKey) continue
    const gold = getProvinceGold(s, capKey)
    if (gold >= cost && gold > maxGold) { maxGold = gold; richestCapKey = capKey }
  }
  if (!richestCapKey) return state
  s.provinceGold[richestCapKey] -= cost
  s.tiles[tileKey].structure = { type: 'capital' }
  s.provinceGold[tileKey] = 0
  s.actionMode = { type: 'idle' }
  return s
}

/**
 * All tiles the current player can spawn `unitType` on:
 *   - empty owned tiles whose province can afford it
 *   - non-owned tiles adjacent to owned territory where unit strength > tile defense
 *     (province adjacent to that tile must be able to afford)
 */
export function getSpawnableTiles(state: GameState, unitType: UnitType): Set<string> {
  const set = new Set<string>()
  const cost = UNIT_STATS[unitType].cost
  const atkStr = UNIT_STATS[unitType].strength
  const cp = state.currentPlayer

  // Collect capital keys whose province can afford the unit
  const affordableCapKeys = new Set<string>()
  for (const province of getProvinces(state, cp)) {
    const capKey = getProvinceCapital(state.tiles, province)
    if (capKey && getProvinceGold(state, capKey) >= cost) affordableCapKeys.add(capKey)
  }
  if (affordableCapKeys.size === 0) return set

  // Owned tiles from affordable provinces (empty, or mergeable unit)
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.owner !== cp) continue
    if (tile.unit) {
      // Allow placement if merge would be valid (combined strength ≤ 4)
      const merged = UNIT_STATS[tile.unit.type].strength + atkStr
      if (merged > 4) continue
    }
    const ctx = getProvinceContext(state, k)
    if (ctx?.capitalKey && affordableCapKeys.has(ctx.capitalKey)) set.add(k)
  }

  // Adjacent non-owned tiles (one layer out) where unit can capture
  for (const affordCapKey of affordableCapKeys) {
    // BFS outward from this province
    const province = getProvinceOf(state.tiles, affordCapKey, cp)
    for (const ownedKey of province) {
      const tile = state.tiles[ownedKey]
      for (const nb of hexNeighbors(tile.q, tile.r)) {
        const nk = hexKey(nb.q, nb.r)
        if (set.has(nk)) continue
        const nt = state.tiles[nk]
        if (!nt || nt.owner === cp) continue
        const def = tileDefense(nt, state.tiles)
        if (atkStr > def) set.add(nk)
      }
    }
  }

  return set
}

/**
 * Spawn a unit on tileKey (own tile = normal buy; non-owned adjacent = capture + buy).
 */
export function spawnUnit(state: GameState, tileKey: string, unitType: UnitType): GameState {
  if (!getSpawnableTiles(state, unitType).has(tileKey)) return state
  const tile = state.tiles[tileKey]
  if (!tile) return state

  if (tile.owner === state.currentPlayer) {
    // Normal buy on owned territory
    return buyUnit(state, tileKey, unitType)
  }

  // Capture-spawn: place unit on adjacent non-owned tile
  const cost = UNIT_STATS[unitType].cost

  // Find richest adjacent affordable province
  let spendCapKey: string | null = null
  let maxGold = -1
  for (const nb of hexNeighbors(tile.q, tile.r)) {
    const nt = state.tiles[hexKey(nb.q, nb.r)]
    if (!nt || nt.owner !== state.currentPlayer) continue
    const ctx = getProvinceContext(state, hexKey(nb.q, nb.r))
    if (!ctx?.capitalKey) continue
    const gold = getProvinceGold(state, ctx.capitalKey)
    if (gold >= cost && gold > maxGold) { maxGold = gold; spendCapKey = ctx.capitalKey }
  }
  if (!spendCapKey) return state

  const s = cloneState(state)
  const t = s.tiles[tileKey]
  const prevOwner = t.owner

  if (isTree(t)) {
    s.provinceGold[spendCapKey] = (s.provinceGold[spendCapKey] ?? 0) + TREE_CUT_REWARD
    t.terrain = 'grass'
  }

  s.provinceGold[spendCapKey] -= cost
  if (t.unit) t.terrain = 'grave'
  t.structure = null
  t.owner = s.currentPlayer
  t.unit = { type: unitType, moved: true }

  if (prevOwner !== null) {
    _cleanupOrphanedProvinceGold(s, prevOwner)
    fixProvinces(s)
    s.log = [`${s.players[s.currentPlayer].name} captured a tile`, ...s.log.slice(0, 9)]
  }

  s.actionMode = { type: 'idle' }
  return checkEliminations(s)
}

// ── state mutations ───────────────────────────────────────────────────────────

/**
 * Move unit from fromKey to toKey.
 * Handles: tree cutting (+gold), merging, capture, province gold update.
 */
export function moveUnit(state: GameState, fromKey: string, toKey: string): GameState {
  if (!canMoveUnit(state, fromKey, toKey)) return state
  const s = cloneState(state)
  const from = s.tiles[fromKey]
  const to = s.tiles[toKey]

  const isCapture = to.owner !== s.currentPlayer
  const hasMerge = to.owner === s.currentPlayer && !!to.unit

  // Tree cut reward: if landing on a tree tile, give +3 to the province gold
  if (isTree(to)) {
    const fromCtx = getProvinceContext(s, fromKey)
    if (fromCtx?.capitalKey) {
      s.provinceGold[fromCtx.capitalKey] = (s.provinceGold[fromCtx.capitalKey] ?? 0) + TREE_CUT_REWARD
    }
    to.terrain = 'grass'
    to.structure = null
  }

  if (hasMerge) {
    // Merge units: sum strengths capped at 4. Result inherits target's moved status —
    // target's unspent move is preserved for the merged unit.
    const fromStr = UNIT_STATS[from.unit!.type].strength
    const toStr = UNIT_STATS[to.unit!.type].strength
    const merged = Math.min(fromStr + toStr, 4)
    const newType = UNIT_ORDER[merged - 1]
    to.unit = { type: newType, moved: to.unit!.moved }
    from.unit = null
  } else {
    // Normal move
    to.unit = { ...from.unit!, moved: true }
    from.unit = null
  }

  if (isCapture) {
    const prevOwner = to.owner
    // Destroy any structures on captured tile
    to.structure = null
    to.terrain = 'grass'
    to.owner = s.currentPlayer
    s.log = [`${s.players[s.currentPlayer].name} captured a tile`, ...s.log.slice(0, 9)]

    if (prevOwner !== null) {
      _cleanupOrphanedProvinceGold(s, prevOwner)
    }
    // Auto-split/merge provinces for all affected players
    fixProvinces(s)
  }

  s.actionMode = { type: 'idle' }
  return checkEliminations(s)
}

/**
 * After a capture, remove province gold entries for capitals that no longer exist.
 */
function _cleanupOrphanedProvinceGold(state: GameState, forOwner: number): void {
  for (const capKey of Object.keys(state.provinceGold)) {
    const capTile = state.tiles[capKey]
    // If the capital tile no longer belongs to this owner or no longer has a capital structure, remove entry
    if (!capTile || capTile.owner !== forOwner || capTile.structure?.type !== 'capital') {
      // Only remove if it belonged to the affected owner
      // We need to check if the tile was ever owned by forOwner — if tile is now null/different owner, clean up
      if (!capTile || capTile.structure?.type !== 'capital') {
        delete state.provinceGold[capKey]
      }
    }
  }
}

export function buyUnit(state: GameState, tileKey: string, unitType: UnitType): GameState {
  if (!canBuyUnit(state, tileKey, unitType)) return state
  const s = cloneState(state)
  const tile = s.tiles[tileKey]

  // Tree cut reward if buying onto a tree tile
  if (isTree(tile)) {
    const ctx = getProvinceContext(s, tileKey)
    if (ctx?.capitalKey) {
      s.provinceGold[ctx.capitalKey] = (s.provinceGold[ctx.capitalKey] ?? 0) + TREE_CUT_REWARD
    }
    tile.terrain = 'grass'
    tile.structure = null
  }

  const ctx = getProvinceContext(s, tileKey)
  if (!ctx?.capitalKey) return state
  s.provinceGold[ctx.capitalKey] -= UNIT_STATS[unitType].cost

  if (tile.unit) {
    // Merge: combine strengths, preserve the existing unit's moved status
    const existingStr = UNIT_STATS[tile.unit.type].strength
    const newStr = UNIT_STATS[unitType].strength
    const mergedStr = Math.min(existingStr + newStr, 4)
    s.tiles[tileKey].unit = { type: UNIT_ORDER[mergedStr - 1], moved: tile.unit.moved }
  } else {
    s.tiles[tileKey].unit = { type: unitType, moved: true }
  }

  s.actionMode = { type: 'idle' }
  return s
}

export function buildStructure(state: GameState, tileKey: string, type: StructureType): GameState {
  if (type === 'capital') return state
  if (!canBuildStructure(state, tileKey, type)) return state
  const s = cloneState(state)
  const ctx = getProvinceContext(s, tileKey)
  if (!ctx?.capitalKey) return state
  const cost = type === 'farm' ? getFarmCost(s, s.currentPlayer) : STRUCTURE_STATS[type].cost
  s.provinceGold[ctx.capitalKey] -= cost
  s.tiles[tileKey].structure = { type }
  if (type === 'farm') {
    s.farmsBought[s.currentPlayer] = (s.farmsBought[s.currentPlayer] ?? 0) + 1
  }
  s.actionMode = { type: 'idle' }
  return s
}

// ── economy processing ────────────────────────────────────────────────────────

/**
 * Process economy for a player:
 * Per province:
 *   1. Calculate income and taxes
 *   2. province.gold += income - taxes
 *   3. If gold < 0: kill weakest unit(s) until gold >= 0
 *   4. Provinces without capital: no savings, kill if debt > 0
 */
export function processEconomy(state: GameState, playerId: number): GameState {
  const s = state
  const provinces = getProvinces(s, playerId)

  for (const province of provinces) {
    const capKey = getProvinceCapital(s.tiles, province)
    const income = provinceIncome(s, province)
    const tax = provinceTax(s, province)
    const net = income - tax

    if (capKey) {
      // Province with capital — accumulates gold
      s.provinceGold[capKey] = (s.provinceGold[capKey] ?? 0) + net
      // Kill weakest units if in debt
      while ((s.provinceGold[capKey] ?? 0) < 0) {
        if (!killWeakestUnit(s, province)) break
        // Recalculate tax after kill
        const newTax = provinceTax(s, province)
        const newIncome = provinceIncome(s, province)
        s.provinceGold[capKey] = (s.provinceGold[capKey] ?? 0) + (tax - newTax)
        // If the re-calc still doesn't balance, loop will catch it
        // (We added the gold delta from killing)
        void newIncome // suppress lint
      }
      // Clamp to 0 minimum (shouldn't go negative after kills, but safety)
      if ((s.provinceGold[capKey] ?? 0) < 0) s.provinceGold[capKey] = 0
    } else {
      // Province without capital — no savings, but units still need upkeep
      // If net < 0, kill cheapest unit(s) until net >= 0 or no units left
      let currentTax = tax
      while (currentTax > income) {
        if (!killWeakestUnit(s, province)) break
        currentTax = provinceTax(s, province)
      }
    }
  }

  return s
}

function killWeakestUnit(state: GameState, province: Set<string>): boolean {
  let weakestKey: string | null = null
  let weakestUpkeep = Infinity

  for (const k of province) {
    const tile = state.tiles[k]
    if (tile.unit) {
      const up = UNIT_STATS[tile.unit.type].upkeep
      if (up < weakestUpkeep) {
        weakestUpkeep = up
        weakestKey = k
      }
    }
  }

  if (!weakestKey) return false
  const tile = state.tiles[weakestKey]
  const playerName = state.players[tile.owner!]?.name ?? '?'
  tile.unit = null
  tile.terrain = 'grave'  // leave a gravestone
  state.log = [`${playerName}: a unit starved`, ...state.log.slice(0, 9)]
  return true
}

// ── province repair: auto-split capitals and auto-merge duplicates ────────────

/**
 * After any ownership change, ensure every connected province has exactly one capital.
 * - Fragment with 0 capitals → auto-place a new free capital
 * - Fragment with 2+ capitals → keep richest, merge gold, remove extras
 */
export function fixProvinces(state: GameState): GameState {
  const s = state

  for (const player of s.players) {
    if (!player.alive) continue
    const playerId = player.id

    const ownedKeys = Object.keys(s.tiles).filter(k => s.tiles[k].owner === playerId)
    if (ownedKeys.length === 0) continue

    const visited = new Set<string>()
    const fragments: Array<Set<string>> = []

    for (const k of ownedKeys) {
      if (visited.has(k)) continue
      const fragment = getProvinceOf(s.tiles, k, playerId)
      for (const fk of fragment) visited.add(fk)
      fragments.push(fragment)
    }

    for (const fragment of fragments) {
      const capitalKeysInFragment: string[] = []
      for (const k of fragment) {
        if (s.tiles[k].structure?.type === 'capital') capitalKeysInFragment.push(k)
      }

      if (capitalKeysInFragment.length === 0) {
        // Province was cut off — auto-create a capital (free, game mechanic)
        let targetKey: string | null = null
        for (const k of fragment) {
          const t = s.tiles[k]
          if (!t.unit && !t.structure) { targetKey = k; break }
        }
        // Fallback: tile with non-capital structure (replace it)
        if (!targetKey) {
          for (const k of fragment) {
            const t = s.tiles[k]
            if (!t.unit) { targetKey = k; break }
          }
        }
        if (targetKey) {
          s.tiles[targetKey].structure = { type: 'capital' }
          s.provinceGold[targetKey] = 0
          s.log = [`${s.players[playerId].name}: a new capital was established!`, ...s.log.slice(0, 9)]
        }
      } else if (capitalKeysInFragment.length > 1) {
        // Two provinces merged — keep richest capital, sum gold, remove extras
        let richestKey = capitalKeysInFragment[0]
        let totalGold = 0
        for (const capKey of capitalKeysInFragment) {
          const g = s.provinceGold[capKey] ?? 0
          totalGold += g
          if (g > (s.provinceGold[richestKey] ?? 0)) richestKey = capKey
        }
        for (const capKey of capitalKeysInFragment) {
          if (capKey === richestKey) continue
          delete s.provinceGold[capKey]
          s.tiles[capKey].structure = null
        }
        s.provinceGold[richestKey] = totalGold
        s.log = [`${s.players[playerId].name}: provinces merged!`, ...s.log.slice(0, 9)]
      }
    }
  }

  return s
}

// ── tree/grave growth ─────────────────────────────────────────────────────────

function growTrees(state: GameState): GameState {
  const s = state
  const tileList = Object.values(s.tiles)
  const mapRadius = s.mapRadius ?? 8

  // 1. Graves → Pine (random chance per grave)
  for (const tile of tileList) {
    if (tile.terrain === 'grave') {
      if (Math.random() < GRAVE_TO_PINE_CHANCE) {
        tile.terrain = 'pine'
      }
    }
  }

  // 2. Pine spreading: neutral, free tiles adjacent to 2+ pines
  const pineCandidates = tileList.filter(
    t => t.terrain === 'grass' && isFree(t) && t.owner === null
  )
  for (const tile of pineCandidates) {
    const nearbyPines = hexNeighbors(tile.q, tile.r).filter(nb => {
      const nbt = s.tiles[hexKey(nb.q, nb.r)]
      return nbt?.terrain === 'pine'
    }).length
    if (nearbyPines >= 2 && Math.random() < PINE_SPREAD_CHANCE) {
      tile.terrain = 'pine'
    }
  }

  // 3. Palm spreading: neutral, free tiles near map edge
  const palmCandidates = tileList.filter(
    t => t.terrain === 'grass' && isFree(t) && t.owner === null
  )
  for (const tile of palmCandidates) {
    const dist = (Math.abs(tile.q) + Math.abs(tile.r) + Math.abs(tile.q + tile.r)) / 2
    const isNearEdge = dist >= mapRadius - 2
    if (!isNearEdge) continue
    const hasPalmNearby = hexNeighbors(tile.q, tile.r).some(nb => {
      return s.tiles[hexKey(nb.q, nb.r)]?.terrain === 'palm'
    })
    if (hasPalmNearby && Math.random() < 0.4) {
      tile.terrain = 'palm'
    }
  }

  return s
}

// ── eliminations check ────────────────────────────────────────────────────────

function checkEliminations(state: GameState): GameState {
  for (const player of state.players) {
    if (!player.alive) continue
    const hasAnyTile = Object.values(state.tiles).some(t => t.owner === player.id)
    if (!hasAnyTile) {
      player.alive = false
      state.log = [`${player.name} has been eliminated!`, ...state.log.slice(0, 9)]
    }
  }

  const alivePlayers = state.players.filter(p => p.alive)
  if (alivePlayers.length === 1) {
    state.phase = 'gameover'
    state.winner = alivePlayers[0].id
    state.log = [`${alivePlayers[0].name} wins!`, ...state.log.slice(0, 9)]
  }

  return state
}

// ── end turn ──────────────────────────────────────────────────────────────────

export function endTurn(state: GameState): GameState {
  let s = cloneState(state)

  // Reset moved flags for current player's units
  for (const tile of Object.values(s.tiles)) {
    if (tile.owner === s.currentPlayer && tile.unit) {
      tile.unit.moved = false
    }
  }

  // Advance to next alive player
  let next = (s.currentPlayer + 1) % s.players.length
  while (!s.players[next].alive && next !== s.currentPlayer) {
    next = (next + 1) % s.players.length
  }
  s.currentPlayer = next

  // Economy for the new current player
  s = processEconomy(s, next)

  // Tree/grave growth
  s = growTrees(s)

  s.turn += 1
  s.actionMode = { type: 'idle' }

  return checkEliminations(s)
}

// ── action mode helper ────────────────────────────────────────────────────────

export function setActionMode(state: GameState, mode: ActionMode): GameState {
  return { ...state, actionMode: mode }
}

// ── tile click handler ────────────────────────────────────────────────────────

export function handleTileClick(state: GameState, tileKey: string): GameState {
  if (state.phase === 'gameover') return state

  const tile = state.tiles[tileKey]
  if (!tile) return state

  const mode = state.actionMode

  // Buying unit mode — can spawn on own tiles OR adjacent capturable tiles
  if (mode.type === 'buyingUnit') {
    return spawnUnit(state, tileKey, mode.unitType)
  }

  // Buying structure mode
  if (mode.type === 'buyingStructure') {
    if (canBuildStructure(state, tileKey, mode.structureType)) {
      return buildStructure(state, tileKey, mode.structureType)
    }
    return state
  }

  // Unit selected: try to move/attack/merge
  if (mode.type === 'unitSelected') {
    const fromKey = hexKey(mode.coord.q, mode.coord.r)

    if (tileKey === fromKey) {
      // Deselect
      return { ...state, actionMode: { type: 'idle' } }
    }

    // Try move/attack (includes merge via BFS reachable)
    if (canMoveUnit(state, fromKey, tileKey)) {
      return moveUnit(state, fromKey, tileKey)
    }

    // Clicking another own unmoved unit selects it
    if (tile.owner === state.currentPlayer && tile.unit && !tile.unit.moved) {
      return { ...state, actionMode: { type: 'unitSelected', coord: { q: tile.q, r: tile.r } } }
    }

    return { ...state, actionMode: { type: 'idle' } }
  }

  // Idle: select own unit
  if (tile.owner === state.currentPlayer && tile.unit && !tile.unit.moved) {
    return { ...state, actionMode: { type: 'unitSelected', coord: { q: tile.q, r: tile.r } } }
  }

  return { ...state, actionMode: { type: 'idle' } }
}
