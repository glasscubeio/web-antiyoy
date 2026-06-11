export type UnitType = 'peasant' | 'spearman' | 'knight' | 'baron'
export type StructureType = 'capital' | 'tower' | 'strongTower' | 'farm'
export type TerrainType = 'grass' | 'pine' | 'palm' | 'grave'

export interface HexCoord { q: number; r: number }
export interface Unit { type: UnitType; moved: boolean }
export interface Structure { type: StructureType }

export interface HexTile {
  q: number; r: number
  terrain: TerrainType
  owner: number | null
  unit: Unit | null
  structure: Structure | null
}

export interface Player {
  id: number; name: string; color: string; alive: boolean
}

export type GamePhase = 'playing' | 'gameover'
export type ActionMode =
  | { type: 'idle' }
  | { type: 'unitSelected'; coord: HexCoord }
  | { type: 'buyingUnit'; unitType: UnitType }
  | { type: 'buyingStructure'; structureType: StructureType }

export interface GameState {
  tiles: Record<string, HexTile>
  players: Player[]
  provinceGold: Record<string, number>   // capitalHexKey → gold
  farmsBought: Record<number, number>    // playerId → count of farms built (inflation)
  currentPlayer: number
  turn: number
  phase: GamePhase
  winner: number | null
  actionMode: ActionMode
  log: string[]
  mapRadius: number
}
