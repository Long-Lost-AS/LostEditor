/**
 * Map serialization utilities
 * Converts between runtime format (MapData) and serialized format (SerializedMapData)
 * Version 4.0: Uses dense arrays of regular numbers (48-bit packed tile IDs)
 */

import type {
	Layer,
	MapData,
	SerializedLayer,
	SerializedMapData,
} from "../types";

/**
 * Serialize map data to file format (dense array of tile IDs)
 * @param mapData - Runtime map data
 * @returns Serialized map data ready for JSON.stringify
 */
export function serializeMapData(mapData: MapData): SerializedMapData {
	// Convert layers - tiles are already in the right format!
	const serializedLayers: SerializedLayer[] = mapData.layers.map((layer) => ({
		id: layer.id,
		name: layer.name,
		visible: layer.visible,
		type: layer.type,
		tiles: layer.tiles, // Dense array - already serializable!
	}));

	return {
		version: "4.0",
		name: mapData.name,
		width: mapData.width,
		height: mapData.height,
		tileWidth: mapData.tileWidth,
		tileHeight: mapData.tileHeight,
		layers: serializedLayers,
		entities: mapData.entities, // Entities at map level
		points: mapData.points, // Points at map level
		colliders: mapData.colliders, // Colliders at map level
	};
}

/**
 * Deserialize map data from file format
 * @param serialized - Serialized map data from JSON
 * @returns Runtime map data
 */
export function deserializeMapData(serialized: SerializedMapData): MapData {
	// Convert layers - ensure tiles array has correct size
	const layers: Layer[] = serialized.layers.map((layer) => {
		// Tiles are already in the correct format
		// Just ensure the array exists and has the right size for the map
		const expectedSize = serialized.width * serialized.height;
		let tiles = layer.tiles || [];

		// If tiles array is too small, pad with zeros
		if (tiles.length < expectedSize) {
			tiles = [...tiles, ...new Array(expectedSize - tiles.length).fill(0)];
		}

		return {
			id: layer.id,
			name: layer.name,
			visible: layer.visible,
			type: layer.type,
			tiles,
		};
	});

	return {
		name: serialized.name,
		width: serialized.width,
		height: serialized.height,
		tileWidth: serialized.tileWidth,
		tileHeight: serialized.tileHeight,
		layers,
		entities: serialized.entities || [], // Entities at map level
		points: serialized.points || [], // Points at map level
		colliders: serialized.colliders || [], // Colliders at map level
	};
}
