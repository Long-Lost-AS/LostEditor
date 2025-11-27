/**
 * Map serialization utilities
 * Converts between runtime format (MapData) and serialized format (SerializedMapData)
 * Version 5.0: Uses chunk-based storage for infinite maps
 */

import type {
	Layer,
	MapData,
	SerializedLayer,
	SerializedMapData,
} from "../types";
import { isChunkEmpty } from "./chunkStorage";

/**
 * Serialize map data to file format (chunk-based storage)
 * @param mapData - Runtime map data
 * @returns Serialized map data ready for JSON.stringify
 */
export function serializeMapData(mapData: MapData): SerializedMapData {
	// Convert layers - filter out empty chunks
	const serializedLayers: SerializedLayer[] = mapData.layers.map((layer) => {
		// Convert Map to Record, filtering empty chunks
		const chunks: Record<string, number[]> = {};
		for (const [key, chunk] of Object.entries(layer.chunks)) {
			if (!isChunkEmpty(chunk)) {
				chunks[key] = chunk;
			}
		}

		return {
			id: layer.id,
			name: layer.name,
			visible: layer.visible,
			foreground: layer.foreground,
			chunks, // Chunk-based storage
			tileWidth: layer.tileWidth,
			tileHeight: layer.tileHeight,
			properties: layer.properties || {},
		};
	});

	return {
		version: "5.0",
		id: mapData.id,
		name: mapData.name,
		// No width/height - infinite map!
		layers: serializedLayers,
		entities: mapData.entities,
		points: mapData.points,
		colliders: mapData.colliders,
	};
}

/**
 * Deserialize map data from file format
 * @param serialized - Serialized map data from JSON
 * @returns Runtime map data
 */
export function deserializeMapData(serialized: SerializedMapData): MapData {
	// Convert layers - chunks are already in the correct format
	const layers: Layer[] = serialized.layers.map((layer) => {
		return {
			id: layer.id,
			name: layer.name,
			visible: layer.visible,
			foreground: layer.foreground ?? false,
			chunks: layer.chunks || {}, // Already a Record, use as-is
			tileWidth: layer.tileWidth ?? 16,
			tileHeight: layer.tileHeight ?? 16,
			properties: layer.properties || {},
		};
	});

	return {
		id: serialized.id,
		name: serialized.name,
		// No width/height - infinite map!
		layers,
		entities: serialized.entities || [],
		points: serialized.points || [],
		colliders: serialized.colliders || [],
	};
}
