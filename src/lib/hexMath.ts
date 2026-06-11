export interface HexCoord {
  q: number
  r: number
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}

const NEIGHBOR_DIRS: HexCoord[] = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
]

export function hexNeighbors(q: number, r: number): HexCoord[] {
  return NEIGHBOR_DIRS.map(d => ({ q: q + d.q, r: r + d.r }))
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
}

export function isAdjacent(a: HexCoord, b: HexCoord): boolean {
  return hexDistance(a, b) === 1
}

// Pointy-top hexagons
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  }
}

export function hexCornerPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

// BFS flood-fill to find connected region
export function floodFill(start: HexCoord, passable: (q: number, r: number) => boolean): Set<string> {
  const visited = new Set<string>()
  const queue: HexCoord[] = [start]
  visited.add(hexKey(start.q, start.r))

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nb of hexNeighbors(cur.q, cur.r)) {
      const k = hexKey(nb.q, nb.r)
      if (!visited.has(k) && passable(nb.q, nb.r)) {
        visited.add(k)
        queue.push(nb)
      }
    }
  }
  return visited
}
