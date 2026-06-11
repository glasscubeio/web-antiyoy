import { UnitType, StructureType } from '../types'

export interface UnitStats {
  strength: number
  cost: number
  upkeep: number
  label: string
  icon: string
  sprite: string
}

export interface StructureStats {
  defense: number
  cost: number
  upkeep: number
  icon: string
  sprite: string
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  peasant:  { strength: 1, cost: 10,  upkeep: 2,  label: 'Peasant',  icon: '🧑', sprite: '/assets/man0.png' },
  spearman: { strength: 2, cost: 20,  upkeep: 6,  label: 'Spearman', icon: '💂', sprite: '/assets/man1.png' },
  knight:   { strength: 3, cost: 30,  upkeep: 18, label: 'Knight',   icon: '🐴', sprite: '/assets/man2.png' },
  baron:    { strength: 4, cost: 40,  upkeep: 54, label: 'Baron',    icon: '👑', sprite: '/assets/man3.png' },
}

export const STRUCTURE_STATS: Record<StructureType, StructureStats> = {
  capital:     { defense: 1, cost: 15, upkeep: 0, icon: '⭐', sprite: '/assets/castle.png' },
  tower:       { defense: 2, cost: 15, upkeep: 1, icon: '🗼', sprite: '/assets/tower.png' },
  strongTower: { defense: 3, cost: 35, upkeep: 6, icon: '🏰', sprite: '/assets/strong_tower.png' },
  farm:        { defense: 0, cost: 12, upkeep: 0, icon: '🌾', sprite: '/assets/farm1.png' },
}

export const UNIT_ORDER: UnitType[] = ['peasant', 'spearman', 'knight', 'baron']

export const PLAYER_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B']
export const PLAYER_NAMES = ['Blue', 'Red', 'Green', 'Yellow']

export const MAP_RADIUS = 8

export const MAP_SIZES = { small: 5, medium: 8, large: 16 } as const
export type MapSize = keyof typeof MAP_SIZES

// Economy constants
export const FARM_INCOME = 4          // income per farm tile (replaces normal 1)
export const NORMAL_TILE_INCOME = 1   // income per normal grass tile owned
export const TREE_CUT_REWARD = 3      // gold gained when cutting a tree
export const STARTING_PROVINCE_GOLD = 10

// Farm inflation: cost = FARM_BASE_COST + farmsBought * FARM_INFLATION
export const FARM_BASE_COST = 12
export const FARM_INFLATION = 4

// Capital building (fixed cost, no inflation)
export const CAPITAL_BASE_COST = 15

// Tree / grave growth
export const GRAVE_TO_PINE_CHANCE = 0.3
export const PINE_SPREAD_CHANCE = 0.8
