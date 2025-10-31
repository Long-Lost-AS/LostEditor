import type { TileDefinition, TilesetData } from '../types'

/**
 * Godot-style bitmask autotiling utilities.
 *
 * In Godot, each tile stores a 3×3 bitmask representing which cells belong to a terrain type.
 * When painting, the system checks neighbors and selects the tile whose bitmask matches.
 *
 * Bitmask bit layout (9 bits, 0-511):
 * [0] [1] [2]    (top-left, top-center, top-right)
 * [3] [4] [5]    (middle-left, center, middle-right)
 * [6] [7] [8]    (bottom-left, bottom-center, bottom-right)
 */

/**
 * Convert a 3×3 boolean grid to a bitmask number
 */
export function gridToBitmask(grid: boolean[][]): number {
  let bitmask = 0
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const bitIndex = row * 3 + col
      if (grid[row]?.[col]) {
        bitmask |= (1 << bitIndex)
      }
    }
  }
  return bitmask
}

/**
 * Convert a bitmask number to a 3×3 boolean grid
 */
export function bitmaskToGrid(bitmask: number): boolean[][] {
  const grid: boolean[][] = [[false, false, false], [false, false, false], [false, false, false]]
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const bitIndex = row * 3 + col
      grid[row][col] = (bitmask & (1 << bitIndex)) !== 0
    }
  }
  return grid
}

/**
 * Generate a bitmask based on neighboring tiles of the same terrain type.
 *
 * For a given position, check all 8 neighbors to determine which cells
 * in the 3×3 grid should be filled.
 *
 * The logic:
 * - Center cell (bit 4) is always set (the tile being placed)
 * - Edge cells (bits 1, 3, 5, 7) are set if that cardinal neighbor exists
 * - Corner cells (bits 0, 2, 6, 8) are set if BOTH adjacent cardinal neighbors exist
 *
 * @param hasNeighbor - Function that returns true if a neighbor exists at offset (dx, dy)
 * @returns Bitmask value (0-511)
 */
export function calculateBitmaskFromNeighbors(
  hasNeighbor: (dx: number, dy: number) => boolean
): number {
  // Check cardinal directions
  const hasNorth = hasNeighbor(0, -1)
  const hasSouth = hasNeighbor(0, 1)
  const hasWest = hasNeighbor(-1, 0)
  const hasEast = hasNeighbor(1, 0)

  // Check diagonal directions (only if both adjacent cardinals exist)
  const hasNorthWest = hasNorth && hasWest && hasNeighbor(-1, -1)
  const hasNorthEast = hasNorth && hasEast && hasNeighbor(1, -1)
  const hasSouthWest = hasSouth && hasWest && hasNeighbor(-1, 1)
  const hasSouthEast = hasSouth && hasEast && hasNeighbor(1, 1)

  // Build the 3×3 grid
  const grid: boolean[][] = [
    [hasNorthWest, hasNorth, hasNorthEast],      // Top row
    [hasWest, true, hasEast],                    // Middle row (center is always true)
    [hasSouthWest, hasSouth, hasSouthEast]       // Bottom row
  ]

  return gridToBitmask(grid)
}

/**
 * Find the best matching tile for a given bitmask and terrain type.
 *
 * Looks for tiles with matching bitmask for the terrain type.
 * If no exact match, finds the closest match (most matching bits).
 *
 * @param tileset - The tileset to search
 * @param terrainType - The terrain type to match
 * @param targetBitmask - The target bitmask to match
 * @returns The matching tile definition, or null if none found
 */
export function findTileByBitmask(
  tileset: TilesetData,
  terrainType: string,
  targetBitmask: number
): TileDefinition | null {
  let bestMatch: TileDefinition | null = null
  let bestMatchScore = -1

  for (const tile of tileset.tiles) {
    if (!tile.bitmasks || !(terrainType in tile.bitmasks)) {
      continue
    }

    const tileBitmask = tile.bitmasks[terrainType]

    // Check for exact match
    if (tileBitmask === targetBitmask) {
      return tile
    }

    // Calculate match score (number of matching bits)
    const matchingBits = countMatchingBits(tileBitmask, targetBitmask)
    if (matchingBits > bestMatchScore) {
      bestMatchScore = matchingBits
      bestMatch = tile
    }
  }

  return bestMatch
}

/**
 * Count the number of matching bits between two bitmasks
 */
function countMatchingBits(bitmask1: number, bitmask2: number): number {
  // XOR to find differences, then count zeros (matching bits)
  const diff = bitmask1 ^ bitmask2
  let matchCount = 0
  for (let i = 0; i < 9; i++) {
    if ((diff & (1 << i)) === 0) {
      matchCount++
    }
  }
  return matchCount
}

/**
 * Get all tiles that have a bitmask defined for a specific terrain type
 */
export function getTilesForTerrain(
  tileset: TilesetData,
  terrainType: string
): TileDefinition[] {
  return tileset.tiles.filter(tile =>
    tile.bitmasks && terrainType in tile.bitmasks
  )
}

/**
 * Toggle a cell in a bitmask
 * @param bitmask - Current bitmask value
 * @param row - Row index (0-2)
 * @param col - Column index (0-2)
 * @returns New bitmask value
 */
export function toggleBitmaskCell(bitmask: number, row: number, col: number): number {
  const bitIndex = row * 3 + col
  return bitmask ^ (1 << bitIndex)
}

/**
 * Check if a specific cell is set in a bitmask
 */
export function isBitmaskCellSet(bitmask: number, row: number, col: number): boolean {
  const bitIndex = row * 3 + col
  return (bitmask & (1 << bitIndex)) !== 0
}
