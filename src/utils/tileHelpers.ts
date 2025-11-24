import type { TileDefinition, TilesetData } from "../types";

/**
 * Check if a tile is a compound tile (multi-tile sprite).
 * A tile is compound if it has custom dimensions different from the tileset defaults.
 */
export function isCompoundTile(
	tile: TileDefinition,
	tileset: TilesetData,
): boolean {
	return (
		tile.width !== 0 &&
		tile.height !== 0 &&
		(tile.width !== tileset.tileWidth || tile.height !== tileset.tileHeight)
	);
}

/**
 * Get the effective width of a tile.
 * Returns the tile's custom width if set, otherwise the tileset's default tile width.
 */
export function getTileWidth(
	tile: TileDefinition,
	tileset: TilesetData,
): number {
	return tile.width || tileset.tileWidth;
}

/**
 * Get the effective height of a tile.
 * Returns the tile's custom height if set, otherwise the tileset's default tile height.
 */
export function getTileHeight(
	tile: TileDefinition,
	tileset: TilesetData,
): number {
	return tile.height || tileset.tileHeight;
}
