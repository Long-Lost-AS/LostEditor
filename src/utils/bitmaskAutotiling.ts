import type { TileDefinition, TilesetData, TerrainLayer } from '../types'

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
 * Find the best matching tile for a given bitmask and terrain layer.
 *
 * Looks for tiles with matching bitmask in the terrain layer.
 * If no exact match, finds the closest match (most matching bits).
 * As ultimate fallback, uses the center-only tile (bitmask 16) if available.
 *
 * @param tileset - The tileset to search
 * @param terrainLayer - The terrain layer to match
 * @param targetBitmask - The target bitmask to match
 * @returns The matching terrain tile (with tileId), or null if none found
 */
export function findTileByBitmask(
  tileset: TilesetData,
  terrainLayer: TerrainLayer,
  targetBitmask: number
): { tileId: number } | null {
  let bestMatch: { tileId: number } | null = null
  let bestMatchScore = -1
  let centerTile: { tileId: number } | null = null

  const terrainTiles = terrainLayer.tiles || []

  for (const terrainTile of terrainTiles) {
    const tileBitmask = terrainTile.bitmask

    // Check for exact match
    if (tileBitmask === targetBitmask) {
      return { tileId: terrainTile.tileId }
    }

    // Save center-only tile (bitmask 16 = bit 4 only) as fallback
    if (tileBitmask === 16) {
      centerTile = { tileId: terrainTile.tileId }
    }

    // Calculate match score (number of matching bits)
    const matchingBits = countMatchingBits(tileBitmask, targetBitmask)
    if (matchingBits > bestMatchScore) {
      bestMatchScore = matchingBits
      bestMatch = { tileId: terrainTile.tileId }
    }
  }

  // Use best match if found, otherwise use center tile as fallback
  return bestMatch || centerTile
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
 * Get all tiles that belong to a specific terrain layer
 */
export function getTilesForTerrain(
  tileset: TilesetData,
  terrainLayer: TerrainLayer
): TileDefinition[] {
  const terrainTiles = terrainLayer.tiles || []
  return terrainTiles
    .map(tt => tileset.tiles.find(t => t.id === tt.tileId))
    .filter((t): t is TileDefinition => t !== undefined)
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
