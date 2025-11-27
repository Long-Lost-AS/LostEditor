/**
 * Map serialization utilities
 * Converts between runtime format (MapData) and serialized format (SerializedMapData)
 * Version 5.0: Uses chunk-based storage for infinite maps
 */

import type {
	Layer,
	LayerGroup,
	MapData,
	SerializedLayer,
	SerializedLayerGroup,
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

		const serializedLayer: SerializedLayer = {
			id: layer.id,
			name: layer.name,
			visible: layer.visible,
			foreground: layer.foreground,
			chunks, // Chunk-based storage
			tileWidth: layer.tileWidth,
			tileHeight: layer.tileHeight,
			parallaxX: layer.parallaxX,
			parallaxY: layer.parallaxY,
			properties: layer.properties || {},
		};

		// Only include groupId if it's defined
		if (layer.groupId) {
			serializedLayer.groupId = layer.groupId;
		}

		return serializedLayer;
	});

	// Serialize groups - only include non-default values
	const serializedGroups: SerializedLayerGroup[] = (mapData.groups || []).map(
		(group) => {
			const serializedGroup: SerializedLayerGroup = {
				id: group.id,
				name: group.name,
			};

			// Only include non-default values
			if (!group.expanded) serializedGroup.expanded = group.expanded;
			if (!group.visible) serializedGroup.visible = group.visible;
			if (group.parallaxX !== 1.0) serializedGroup.parallaxX = group.parallaxX;
			if (group.parallaxY !== 1.0) serializedGroup.parallaxY = group.parallaxY;
			if (
				group.tint.r !== 255 ||
				group.tint.g !== 255 ||
				group.tint.b !== 255 ||
				group.tint.a !== 255
			) {
				serializedGroup.tint = group.tint;
			}

			return serializedGroup;
		},
	);

	return {
		version: "5.0",
		id: mapData.id,
		name: mapData.name,
		// No width/height - infinite map!
		layers: serializedLayers,
		groups: serializedGroups,
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
			groupId: layer.groupId, // Optional - undefined if not in a group
			chunks: layer.chunks || {}, // Already a Record, use as-is
			tileWidth: layer.tileWidth ?? 16,
			tileHeight: layer.tileHeight ?? 16,
			parallaxX: layer.parallaxX ?? 1.0, // Default for old maps without parallax
			parallaxY: layer.parallaxY ?? 1.0, // Default for old maps without parallax
			tint: layer.tint ?? { r: 255, g: 255, b: 255, a: 255 }, // Default white = no tint
			properties: layer.properties || {},
		};
	});

	// Deserialize groups with defaults
	const groups: LayerGroup[] = (serialized.groups || []).map((group) => {
		return {
			id: group.id,
			name: group.name,
			expanded: group.expanded ?? true,
			visible: group.visible ?? true,
			parallaxX: group.parallaxX ?? 1.0,
			parallaxY: group.parallaxY ?? 1.0,
			tint: group.tint ?? { r: 255, g: 255, b: 255, a: 255 },
		};
	});

	return {
		id: serialized.id,
		name: serialized.name,
		// No width/height - infinite map!
		layers,
		groups,
		entities: serialized.entities || [],
		points: serialized.points || [],
		colliders: serialized.colliders || [],
	};
}
