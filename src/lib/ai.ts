import { GameState, UnitType } from '../types'
import { hexKey, hexNeighbors } from './hexMath'
import { UNIT_STATS, UNIT_ORDER, STRUCTURE_STATS } from './constants'
import {
  canBuildStructure,
  tileDefense,
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

// ── Economy ───────────────────────────────────────────────────────────────────

function provIncome(state: GameState, province: Set<string>): number {
  let v = 0
  for (const k of province) {
    const t = state.tiles[k]
    if (t.terrain === 'pine' || t.terrain === 'palm' || t.terrain === 'grave') continue
    v += t.structure?.type === 'farm' ? 4 : 1
  }
  return v
}

function provUpkeep(state: GameState, province: Set<string>): number {
  let v = 0
  for (const k of province) {
    const t = state.tiles[k]
    if (t.unit) v += UNIT_STATS[t.unit.type].upkeep
    if (t.structure) v += STRUCTURE_STATS[t.structure.type].upkeep
  }
  return v
}

// ── Province snapshot ─────────────────────────────────────────────────────────

interface ProvInfo {
  net: number
  gold: number
  farmCount: number
  towerCount: number
  /**
   * Adjacent non-own tiles, sorted cheapest-to-capture first, then by value.
   * minUnit = cheapest unit that can breach; null = unbreachable.
   */
  capturable: Array<{ key: string; isNeutral: boolean; minUnit: UnitType; minCost: number; score: number }>
  /**
   * Our own border tiles that have no unit and no structure, sorted by:
   *   underThreat first, then exposure count descending.
   */
  exposedBorder: Array<{ key: string; exposure: number; underThreat: boolean }>
}

function snapshotProvince(state: GameState, province: Set<string>, aiId: number): ProvInfo {
  const net = provIncome(state, province) - provUpkeep(state, province)
  const capKey = getProvinceCapital(state.tiles, province)!
  const gold = getProvinceGold(state, capKey)
  const farmCount = [...province].filter(k => state.tiles[k].structure?.type === 'farm').length
  const towerCount = [...province].filter(k => {
    const st = state.tiles[k].structure?.type
    return st === 'tower' || st === 'strongTower'
  }).length

  // Adjacent non-own tiles
  const seenAdj = new Set<string>()
  const capturable: ProvInfo['capturable'] = []
  for (const k of province) {
    const t = state.tiles[k]
    for (const nb of hexNeighbors(t.q, t.r)) {
      const nk = hexKey(nb.q, nb.r)
      if (seenAdj.has(nk)) continue
      seenAdj.add(nk)
      const nt = state.tiles[nk]
      if (!nt || nt.owner === aiId) continue
      const def = tileDefense(nt, state.tiles)
      const neededStr = def + 1
      if (neededStr > 4) continue
      const minUnit = UNIT_ORDER[neededStr - 1]
      capturable.push({
        key: nk,
        isNeutral: nt.owner === null,
        minUnit,
        minCost: UNIT_STATS[minUnit].cost,
        score: attackScore(state, nk, aiId),
      })
    }
  }
  // Sort: cheapest first (peasant targets before knight targets), then highest value
  capturable.sort((a, b) => a.minCost - b.minCost || b.score - a.score)

  // Our own undefended border tiles
  const exposedBorder: ProvInfo['exposedBorder'] = []
  for (const k of province) {
    const t = state.tiles[k]
    if (t.owner !== aiId || t.unit || t.structure) continue
    let exposure = 0
    let underThreat = false
    for (const nb of hexNeighbors(t.q, t.r)) {
      const nk = hexKey(nb.q, nb.r)
      const nt = state.tiles[nk]
      if (!nt || nt.owner === aiId) continue
      exposure++
      if (nt.owner !== null && nt.unit) {
        if (UNIT_STATS[nt.unit.type].strength > tileDefense(t, state.tiles)) underThreat = true
      }
    }
    if (exposure > 0) exposedBorder.push({ key: k, exposure, underThreat })
  }
  exposedBorder.sort((a, b) =>
    (b.underThreat ? 1 : 0) - (a.underThreat ? 1 : 0) || b.exposure - a.exposure
  )

  return { net, gold, farmCount, towerCount, capturable, exposedBorder }
}

// ── Scoring / helpers ─────────────────────────────────────────────────────────

function attackScore(state: GameState, tileKey: string, aiId: number): number {
  const t = state.tiles[tileKey]
  if (!t || t.owner === aiId) return -999
  let score = t.owner === null ? 4 : 8
  if (t.owner !== null) {
    if (t.structure?.type === 'capital')          score += 80
    else if (t.structure?.type === 'strongTower') score += 14
    else if (t.structure?.type === 'tower')       score += 6
    if (t.unit) score += UNIT_STATS[t.unit.type].strength * 4
  }
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

/**
 * Can we afford this unit without risking bankruptcy?
 * Allows mild deficits if there's enough gold buffer to survive.
 */
function canAffordSafely(info: ProvInfo, unitType: UnitType): boolean {
  const cost = UNIT_STATS[unitType].cost
  if (info.gold < cost) return false
  const newNet = info.net - UNIT_STATS[unitType].upkeep
  if (newNet >= -2) return true
  // Negative net OK only with enough banked gold (at least 4 turns of survival)
  return (info.gold - cost) >= (-newNet) * 4
}

// ── Movement ──────────────────────────────────────────────────────────────────

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
      score = attackScore(state, k, aiId) + Math.random() * 0.5
    } else {
      const exp = borderExposure(state, k, aiId)
      score = exp > 0 ? loneliness(state, k, aiId) + exp - 6 : -12
    }
    if (score > bestScore) { bestScore = score; bestKey = k }
  }

  return bestScore >= 1 ? bestKey : null
}

// ── Merge upgrade ─────────────────────────────────────────────────────────────

/**
 * Find an existing unit that can be upgraded via merge to reach `targetStr`.
 * Merging is gold-efficient: adding a peasant (10g) onto a peasant = spearman,
 * instead of paying full spearman cost (20g).
 */
function findMergeUpgrade(
  state: GameState,
  province: Set<string>,
  capKey: string,
  aiId: number,
  targetStr: number
): { key: string; unitType: UnitType } | null {
  const gold = getProvinceGold(state, capKey)
  for (const k of province) {
    const tile = state.tiles[k]
    if (!tile.unit || tile.owner !== aiId) continue
    const existingStr = UNIT_STATS[tile.unit.type].strength
    if (existingStr >= targetStr || existingStr >= 4) continue
    for (let addStr = 1; addStr <= 4 - existingStr; addStr++) {
      if (existingStr + addStr < targetStr) continue
      const addUnit = UNIT_ORDER[addStr - 1]
      const cost = UNIT_STATS[addUnit].cost
      if (gold >= cost) {
        // Check that the merge tile is reachable from the capital's province
        // (just use canBuyUnit which validates province membership)
        const ctx = getProvinceCapital(state.tiles, province)
        if (ctx === capKey) return { key: k, unitType: addUnit }
      }
    }
  }
  return null
}

// ── Farm placement ────────────────────────────────────────────────────────────

function findValidFarmTile(state: GameState, province: Set<string>): string | null {
  for (const k of province) {
    if (canBuildStructure(state, k, 'farm')) return k
  }
  return null
}

// ── Main AI ───────────────────────────────────────────────────────────────────

export async function runAI(
  state: GameState,
  onStateUpdate: (s: GameState) => void
): Promise<GameState> {
  let s = state
  const aiId = s.currentPlayer

  await sleep(80)

  // ── Phase 1: Move existing units (strongest + most-exposed first) ─────────

  const getUnmoved = () =>
    Object.keys(s.tiles)
      .filter(k => s.tiles[k].owner === aiId && !!s.tiles[k].unit && !s.tiles[k].unit!.moved)
      .sort((a, b) => {
        const sa = UNIT_STATS[s.tiles[a].unit!.type].strength
        const sb = UNIT_STATS[s.tiles[b].unit!.type].strength
        const ea = borderExposure(s, a, aiId)
        const eb = borderExposure(s, b, aiId)
        return (sb * 2 + eb) - (sa * 2 + ea)
      })

  for (const fromKey of getUnmoved()) {
    if (!s.tiles[fromKey]?.unit || s.tiles[fromKey].unit!.moved) continue
    const toKey = pickBestMove(s, fromKey)
    if (toKey) {
      s = moveUnit(s, fromKey, toKey)
      onStateUpdate(s)
      await sleep(55)
    }
  }

  // ── Phase 2: Per-province spending with strict priority ───────────────────
  //
  // PRIORITY ORDER:
  //   P1 – Fix critical income bleed (emergency farm)
  //   P2 – Build towers on exposed undefended border (defense first)
  //   P3 – Expand neutral land with peasants (free income, cheapest growth)
  //   P4 – Merge-upgrade existing units to needed strength (cost-efficient)
  //   P5 – Attack enemy tiles with MINIMUM required unit tier
  //   P6 – Upgrade tower → strong tower under enemy pressure
  //   P7 – Build farms for stable long-term growth

  for (const province of getProvinces(s, aiId)) {
    const capKey = getProvinceCapital(s.tiles, province)
    if (!capKey) continue

    // Helper: re-snapshot after each state change
    const snap = () => snapshotProvince(s, province, aiId)
    let info = snap()

    // ── P1: Emergency income fix ──────────────────────────────────────────
    // Province bleeding badly → a farm is the only lasting fix
    if (info.net < -4 && info.gold >= getFarmCost(s, aiId)) {
      const ft = findValidFarmTile(s, province)
      if (ft) {
        s = buildStructure(s, ft, 'farm')
        onStateUpdate(s); await sleep(30)
        info = snap()
      }
    }

    // ── P2: Tower defense on exposed border ───────────────────────────────
    // A single tower (15g, 1/t) defends itself + all 6 neighbors from str ≤ 2.
    // Build whenever border coverage is thin or a tile is directly threatened.
    {
      const directThreat = info.exposedBorder.some(e => e.underThreat)
      // How many tiles does each tower notionally cover? ~3 undefended border tiles.
      const needsMoreTowers = info.exposedBorder.length > info.towerCount * 3 || directThreat

      if (needsMoreTowers && info.gold >= STRUCTURE_STATS.tower.cost) {
        for (const { key } of info.exposedBorder) {
          if (canBuildStructure(s, key, 'tower')) {
            s = buildStructure(s, key, 'tower')
            onStateUpdate(s); await sleep(30)
            info = snap()
            break
          }
        }
      }
    }

    // ── P3: Expand neutral land with peasants ─────────────────────────────
    // Neutral tiles cost 0 to take (def 0), give income, and are cheap (10g, 2/t).
    // Always grab free territory before worrying about enemy targets.
    if (info.gold >= UNIT_STATS.peasant.cost) {
      const neutralTargets = info.capturable.filter(c => c.isNeutral)
      if (neutralTargets.length > 0) {
        const spawnable = getSpawnableTiles(s, 'peasant')
        let claimed = false

        for (const { key } of neutralTargets) {
          if (spawnable.has(key)) {
            const prev = s
            s = spawnUnit(s, key, 'peasant')
            if (s !== prev) {
              onStateUpdate(s); await sleep(50)
              info = snap()
              claimed = true
              break
            }
          }
        }

        // If can't spawn directly onto neutral tile, place peasant on closest
        // unoccupied own border tile adjacent to neutral — it will move next turn
        if (!claimed) {
          for (const { key: borderKey } of info.exposedBorder) {
            const hasNeutralNeighbor = hexNeighbors(s.tiles[borderKey].q, s.tiles[borderKey].r)
              .some(nb => {
                const nt = s.tiles[hexKey(nb.q, nb.r)]
                return nt && nt.owner === null
              })
            if (!hasNeutralNeighbor) continue
            if (!spawnable.has(borderKey)) continue
            const prev = s
            s = spawnUnit(s, borderKey, 'peasant')
            if (s !== prev) { onStateUpdate(s); await sleep(40); info = snap(); break }
          }
        }
      }
    }

    // ── P4: Merge-upgrade for attack efficiency ───────────────────────────
    // Figure out the minimum strength needed to breach the cheapest enemy target.
    // Merging is far cheaper: peasant + peasant = spearman for 10g vs 20g.
    {
      const enemyTargets = info.capturable.filter(c => !c.isNeutral)
      const neededStr = enemyTargets.length > 0
        ? UNIT_STATS[enemyTargets[0].minUnit].strength
        : 0
      if (neededStr > 0) {
        const merge = findMergeUpgrade(s, province, capKey, aiId, neededStr)
        if (merge) {
          const prev = s
          s = spawnUnit(s, merge.key, merge.unitType)
          if (s !== prev) { onStateUpdate(s); await sleep(45); info = snap() }
        }
      }
    }

    // ── P5: Attack enemy tiles with the MINIMUM required unit ────────────
    // Never use a knight to capture what a peasant can take.
    // Save up if the needed unit is unaffordable but close (≤ 3 turns away).
    for (let i = 0; i < 5; i++) {
      info = snap()

      // Find the best target we can afford safely right now
      const target = info.capturable.find(c =>
        !c.isNeutral &&                          // neutrals handled in P3
        canAffordSafely(info, c.minUnit)
      )
      if (!target) break

      const net = provIncome(s, province) - provUpkeep(s, province)
      const turnsToAfford = net > 0
        ? Math.ceil((target.minCost - info.gold) / net)
        : 0

      // If we can almost afford the minimum unit, be patient
      if (info.gold < target.minCost && turnsToAfford <= 3) break

      const spawnableForUnit = getSpawnableTiles(s, target.minUnit)

      // Direct capture-spawn
      if (spawnableForUnit.has(target.key)) {
        const prev = s
        s = spawnUnit(s, target.key, target.minUnit)
        if (s !== prev) { onStateUpdate(s); await sleep(50); continue }
      }

      // Can't capture directly — place unit on best exposed border tile
      // so it can advance next turn
      let placed = false
      for (const { key: borderKey } of info.exposedBorder) {
        if (!spawnableForUnit.has(borderKey)) continue
        const prev = s
        s = spawnUnit(s, borderKey, target.minUnit)
        if (s !== prev) { onStateUpdate(s); await sleep(40); placed = true; break }
      }
      if (!placed) break
    }

    // ── P6: Upgrade tower → strong tower at high-exposure spots ──────────
    // Worth doing when enemies are adjacent and we have surplus gold.
    if (info.capturable.some(c => !c.isNeutral) && info.gold >= STRUCTURE_STATS.strongTower.cost) {
      let bestKey: string | null = null
      let bestExp = 1  // only upgrade if actually exposed (exp ≥ 2)
      for (const k of province) {
        const t = s.tiles[k]
        if (t.owner !== aiId || t.structure?.type !== 'tower') continue
        const exp = borderExposure(s, k, aiId)
        if (exp > bestExp && canBuildStructure(s, k, 'strongTower')) {
          bestExp = exp; bestKey = k
        }
      }
      if (bestKey) {
        s = buildStructure(s, bestKey, 'strongTower')
        onStateUpdate(s); await sleep(30)
        info = snap()
      }
    }

    // ── P7: Farm for growth ───────────────────────────────────────────────
    // Build farms when income is mildly negative, or when province is large
    // enough to justify the investment.
    {
      const farmCost = getFarmCost(s, aiId)
      const wantFarm =
        (info.net < -1 && province.size >= 4) ||
        (info.net >= 0 && province.size >= 6 && info.farmCount < Math.floor(province.size / 5))
      if (wantFarm && info.gold >= farmCost) {
        const ft = findValidFarmTile(s, province)
        if (ft) {
          s = buildStructure(s, ft, 'farm')
          onStateUpdate(s); await sleep(30)
        }
      }
    }
  }

  await sleep(50)
  s = endTurn(s)
  return s
}
