import type { Layer, Tile, TerrainLayer, TilesetData } from "../types";
import {
	calculateBitmaskFromNeighbors,
	findTileByBitmask,
} from "./bitmaskAutotiling";

/**
 * Check if a tile at the given position matches the specified terrain type
 */
function getTileTerrainType(
	layer: Layer,
	x: number,
	y: number,
	tilesets: Map<string, TilesetData>,
): string | null {
	const tile = layer.tiles.get(`${x},${y}`);
	if (!tile) return null;

	const tileset = tilesets.get(tile.tilesetId);
	if (!tileset) return null;

	const tileDef = tileset.tiles.find((t) => t.id === tile.tileId);
	if (!tileDef) return null;

	return tileDef.type || null;
}

/**
 * Apply autotiling to a specific tile position
 * Returns the new tile that should be placed, or null if no autotile rule applies
 *
 * Uses Godot-style bitmask matching.
 */
export function applyAutotiling(
	layer: Layer,
	x: number,
	y: number,
	tilesets: Map<string, TilesetData>,
): Tile | null {
	const currentTile = layer.tiles.get(`${x},${y}`);
	if (!currentTile) return null;

	const tileset = tilesets.get(currentTile.tilesetId);
	if (!tileset) return null;

	const tileDef = tileset.tiles.find((t) => t.id === currentTile.tileId);
	if (!tileDef || !tileDef.type) return null;

	const terrainType = tileDef.type;

	// Create a neighbor check function
	const hasNeighbor = (dx: number, dy: number): boolean => {
		return getTileTerrainType(layer, x + dx, y + dy, tilesets) === terrainType;
	};

	// Calculate the required bitmask based on neighbors
	const targetBitmask = calculateBitmaskFromNeighbors(hasNeighbor);

	// Find the best matching tile
	const matchedTile = findTileByBitmask(tileset, terrainType, targetBitmask);

	if (matchedTile) {
		return {
			...currentTile,
			tileId: matchedTile.id,
		};
	}

	// If no bitmask match found, keep current tile
	return currentTile;
}

/**
 * Update a tile and all its neighbors with autotiling
 * Returns a map of position -> tile for all updated tiles
 */
export function updateTileAndNeighbors(
	layer: Layer,
	positions: Array<{ x: number; y: number }>,
	tilesets: Map<string, TilesetData>,
): Map<string, Tile> {
	const updatedTiles = new Map<string, Tile>();
	const positionsToUpdate = new Set<string>();

	// Add all initial positions and their neighbors
	for (const pos of positions) {
		positionsToUpdate.add(`${pos.x},${pos.y}`);

		// Add 8 neighbors
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
		const updatedTile = applyAutotiling(layer, x, y, tilesets);

		if (updatedTile) {
			updatedTiles.set(posKey, updatedTile);
		}
	}

	return updatedTiles;
}

/**
 * Get all terrain layers from loaded tilesets
 */
export function getAllAutotileGroups(
	tilesets: Map<string, TilesetData>,
): TerrainLayer[] {
	const groups: TerrainLayer[] = [];

	for (const tileset of tilesets.values()) {
		if (tileset.terrainLayers) {
			groups.push(...tileset.terrainLayers);
		}
	}

	return groups;
}
