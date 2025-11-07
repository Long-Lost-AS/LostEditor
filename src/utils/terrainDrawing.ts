import type { MapLayer, TerrainLayer, Tileset } from "../types";
import {
	calculateBitmaskFromNeighbors,
	findTileByBitmask,
} from "./bitmaskAutotiling";
import { packTileId, unpackTileId } from "./tileId";

/**
 * Check if a specific position on the map has terrain from a specific terrain layer
 */
export function isTerrainAtPosition(
	layer: MapLayer,
	x: number,
	y: number,
	mapWidth: number,
	mapHeight: number,
	terrainLayerId: string,
	tilesets: Tileset[],
): boolean {
	// Bounds check
	if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
		return false;
	}

	const index = y * mapWidth + x;
	const tileId = layer.tiles[index];

	// No tile at this position
	if (tileId === 0) {
		return false;
	}

	// Find which terrain layer this tile belongs to
	const belongsToLayer = getTerrainLayerForTile(tileId, tilesets);
	return belongsToLayer === terrainLayerId;
}

/**
 * Find which terrain layer ID a tile belongs to, if any
 */
export function getTerrainLayerForTile(
	tileId: number,
	tilesets: Tileset[],
): string | null {
	const geometry = unpackTileId(tileId);
	const tileset = tilesets[geometry.tilesetIndex];

	if (!tileset || !tileset.terrainLayers) {
		return null;
	}

	// Create a local tile ID (tileset index 0) for comparison
	const localTileId = packTileId(geometry.x, geometry.y, 0);

	// Check each terrain layer to see if this tile belongs to it
	for (const terrainLayer of tileset.terrainLayers) {
		if (terrainLayer.tiles?.some((tt) => tt.tileId === localTileId)) {
			return terrainLayer.id;
		}
	}

	return null;
}

/**
 * Place a terrain tile at the specified position with smart neighbor detection
 */
export function placeTerrainTile(
	layer: MapLayer,
	x: number,
	y: number,
	mapWidth: number,
	mapHeight: number,
	terrainLayer: TerrainLayer,
	tileset: Tileset,
	tilesetIndex: number,
	tilesets: Tileset[],
): void {
	// Calculate bitmask based on neighbors
	const bitmask = calculateBitmaskFromNeighbors((dx, dy) => {
		return isTerrainAtPosition(
			layer,
			x + dx,
			y + dy,
			mapWidth,
			mapHeight,
			terrainLayer.id,
			tilesets,
		);
	});

	// Find matching tile from terrain layer (with fallback to center tile)
	const matchingTile = findTileByBitmask(tileset, terrainLayer, bitmask);

	if (!matchingTile) {
		return;
	}

	// Unpack the matched tile's local ID and repack with correct tileset index
	const localGeometry = unpackTileId(matchingTile.tileId);
	const globalTileId = packTileId(
		localGeometry.x,
		localGeometry.y,
		tilesetIndex,
	);

	// Place the tile
	const index = y * mapWidth + x;
	layer.tiles[index] = globalTileId;
}

/**
 * Remove a terrain tile and update neighbors
 */
export function removeTerrainTile(
	layer: MapLayer,
	x: number,
	y: number,
	mapWidth: number,
	_mapHeight: number,
): void {
	const index = y * mapWidth + x;
	layer.tiles[index] = 0;
}

/**
 * Update the terrain tile at a specific position based on its neighbors
 * Used when a neighbor changes and this tile needs to recalculate its bitmask
 */
export function updateNeighborTerrain(
	layer: MapLayer,
	x: number,
	y: number,
	mapWidth: number,
	mapHeight: number,
	terrainLayerId: string,
	tileset: Tileset,
	tilesetIndex: number,
	tilesets: Tileset[],
): void {
	// Bounds check
	if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
		return;
	}

	const index = y * mapWidth + x;
	const currentTileId = layer.tiles[index];

	// Check if this position has terrain from the same layer
	const belongsToLayer = getTerrainLayerForTile(currentTileId, tilesets);
	if (belongsToLayer !== terrainLayerId) {
		// This position doesn't have terrain from this layer, skip it
		return;
	}

	// Find the terrain layer
	const terrainLayer = tileset.terrainLayers?.find(
		(l) => l.id === terrainLayerId,
	);
	if (!terrainLayer) {
		return;
	}

	// Recalculate bitmask and place updated tile
	placeTerrainTile(
		layer,
		x,
		y,
		mapWidth,
		mapHeight,
		terrainLayer,
		tileset,
		tilesetIndex,
		tilesets,
	);
}

/**
 * Update all 8 neighbors around a position after terrain changes
 */
export function updateNeighborsAround(
	layer: MapLayer,
	x: number,
	y: number,
	mapWidth: number,
	mapHeight: number,
	terrainLayerId: string,
	tileset: Tileset,
	tilesetIndex: number,
	tilesets: Tileset[],
): void {
	// Update all 8 surrounding tiles
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			if (dx === 0 && dy === 0) continue; // Skip center (the tile we just placed)

			updateNeighborTerrain(
				layer,
				x + dx,
				y + dy,
				mapWidth,
				mapHeight,
				terrainLayerId,
				tileset,
				tilesetIndex,
				tilesets,
			);
		}
	}
}
