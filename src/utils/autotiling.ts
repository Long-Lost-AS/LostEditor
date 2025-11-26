import type { Layer, TerrainLayer, TilesetData } from "../types";
import {
	calculateBitmaskFromNeighbors,
	findTileByBitmask,
} from "./bitmaskAutotiling";
import { getTile } from "./chunkStorage";
import { packTileId, unpackTileId } from "./tileId";

/**
 * Get tile ID from chunk storage at position (x, y)
 * Returns 0 if no tile exists at that position
 * Works with infinite maps - no bounds checking needed
 */
function getTileIdAt(layer: Layer, x: number, y: number): number {
	const chunksMap = new Map(Object.entries(layer.chunks));
	return getTile(chunksMap, x, y);
}

/**
 * Check if a tile at the given position matches the specified terrain type
 * Works with infinite maps - no bounds checking needed
 */
function getTileTerrainType(
	layer: Layer,
	x: number,
	y: number,
	tilesets: TilesetData[],
): string | null {
	const tileId = getTileIdAt(layer, x, y);
	if (tileId === 0) return null;

	// Unpack to get tileset order and geometry
	const geometry = unpackTileId(tileId);
	const tileset = tilesets.find((ts) => ts.order === geometry.tilesetOrder);
	if (!tileset) return null;

	// Find tile definition by matching geometry (x, y coords in sprite sheet)
	const tileDef = tileset.tiles.find(
		(t) => t.x === geometry.x && t.y === geometry.y,
	);
	if (!tileDef) return null;

	return tileDef.type ?? null;
}

/**
 * Apply autotiling to a specific tile position
 * Returns the new tile ID that should be placed, or null if no autotile rule applies
 * Works with infinite maps - no bounds checking needed
 *
 * Uses Godot-style bitmask matching.
 */
export function applyAutotiling(
	layer: Layer,
	x: number,
	y: number,
	tilesets: TilesetData[],
): number | null {
	const currentTileId = getTileIdAt(layer, x, y);
	if (currentTileId === 0) return null;

	// Unpack to get tileset hash and geometry
	const geometry = unpackTileId(currentTileId);
	const tileset = tilesets.find((ts) => ts.order === geometry.tilesetOrder);
	if (!tileset) return null;

	// Find tile definition by matching geometry (x, y coords in sprite sheet)
	const tileDef = tileset.tiles.find(
		(t) => t.x === geometry.x && t.y === geometry.y,
	);
	if (!tileDef || !tileDef.type) return null;

	const terrainType = tileDef.type;

	// Find the terrain layer for this terrain type
	const terrainLayer = tileset.terrainLayers?.find(
		(layer) => layer.name === terrainType,
	);
	if (!terrainLayer) return null; // No terrain layer found

	// Create a neighbor check function (infinite - no bounds checking)
	const hasNeighbor = (dx: number, dy: number): boolean => {
		return getTileTerrainType(layer, x + dx, y + dy, tilesets) === terrainType;
	};

	// Calculate the required bitmask based on neighbors
	const targetBitmask = calculateBitmaskFromNeighbors(hasNeighbor);

	// Find the best matching tile
	const matchedTile = findTileByBitmask(tileset, terrainLayer, targetBitmask);

	if (matchedTile) {
		// Pack the matched tile coordinates with the tileset order
		return packTileId(matchedTile.x, matchedTile.y, tileset.order);
	}

	// If no bitmask match found, keep current tile
	return currentTileId;
}

/**
 * Update a tile and all its neighbors with autotiling
 * Returns an array of { x, y, tileId } for all updated tiles
 * Works with infinite maps - no bounds checking needed
 */
export function updateTileAndNeighbors(
	layer: Layer,
	positions: Array<{ x: number; y: number }>,
	tilesets: TilesetData[],
): Array<{ x: number; y: number; tileId: number }> {
	const updatedTiles: Array<{ x: number; y: number; tileId: number }> = [];
	const positionsToUpdate = new Set<string>();

	// Add all initial positions and their neighbors (no bounds checking for infinite maps)
	for (const pos of positions) {
		positionsToUpdate.add(`${pos.x},${pos.y}`);

		// Add 8 neighbors (infinite - no bounds checking)
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				positionsToUpdate.add(`${pos.x + dx},${pos.y + dy}`);
			}
		}
	}

	// Apply autotiling to all positions
	for (const posKey of positionsToUpdate) {
		const [x, y] = posKey.split(",").map(Number);
		const updatedTileId = applyAutotiling(layer, x, y, tilesets);

		if (updatedTileId !== null) {
			updatedTiles.push({ x, y, tileId: updatedTileId });
		}
	}

	return updatedTiles;
}

/**
 * Get all terrain layers from loaded tilesets
 */
export function getAllAutotileGroups(tilesets: TilesetData[]): TerrainLayer[] {
	const groups: TerrainLayer[] = [];

	for (const tileset of tilesets) {
		groups.push(...tileset.terrainLayers);
	}

	return groups;
}
