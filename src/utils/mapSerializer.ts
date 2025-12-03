/**
 * Map serialization utilities
 * Converts between runtime format (MapData) and serialized format (SerializedMapData)
 * Version 5.0: Uses chunk-based storage for infinite maps
 */

import type {
	Layer,
	LayerGroup,
	MapData,
	PolygonCollider,
	SerializedLayer,
	SerializedLayerGroup,
	SerializedMapData,
} from "../types";
import { isChunkEmpty } from "./chunkStorage";
import { migrateColliderToPositionFormat } from "./collisionGeometry";

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
			groupId: layer.groupId,
			order: layer.order,
			chunks, // Chunk-based storage
			chunkWidth: layer.chunkWidth,
			chunkHeight: layer.chunkHeight,
			tileWidth: layer.tileWidth,
			tileHeight: layer.tileHeight,
			parallaxX: layer.parallaxX,
			parallaxY: layer.parallaxY,
			tint: layer.tint,
			properties: layer.properties || {},
		};

		return serializedLayer;
	});

	// Serialize groups
	const serializedGroups: SerializedLayerGroup[] = (mapData.groups || []).map(
		(group) => ({
			id: group.id,
			name: group.name,
			expanded: group.expanded,
			visible: group.visible,
			foreground: group.foreground,
			parallaxX: group.parallaxX,
			parallaxY: group.parallaxY,
			tint: group.tint,
			order: group.order,
			properties: group.properties || {},
		}),
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
	// Convert layers - apply defaults for backwards compatibility with old files
	const layers: Layer[] = serialized.layers.map((layer, index) => ({
		id: layer.id,
		name: layer.name,
		visible: layer.visible,
		foreground: layer.foreground ?? false,
		groupId: layer.groupId,
		order: layer.order ?? index, // Use index for old files without order
		chunks: layer.chunks ?? {},
		chunkWidth: layer.chunkWidth ?? 16,
		chunkHeight: layer.chunkHeight ?? 16,
		tileWidth: layer.tileWidth ?? 16,
		tileHeight: layer.tileHeight ?? 16,
		parallaxX: layer.parallaxX ?? 1.0,
		parallaxY: layer.parallaxY ?? 1.0,
		tint: layer.tint ?? { r: 255, g: 255, b: 255, a: 255 },
		properties: layer.properties ?? {},
	}));

	// Deserialize groups (schema provides defaults, but we use index for order backwards compat)
	const groups: LayerGroup[] = (serialized.groups || []).map(
		(group, index) => ({
			id: group.id,
			name: group.name,
			expanded: group.expanded,
			visible: group.visible,
			foreground: group.foreground ?? false,
			parallaxX: group.parallaxX,
			parallaxY: group.parallaxY,
			tint: group.tint,
			order: group.order === 0 && index > 0 ? index : group.order, // Use index for old files
			properties: group.properties ?? {},
		}),
	);

	// Migrate colliders to new format with position (backwards compatibility)
	const colliders: PolygonCollider[] = (serialized.colliders || []).map(
		(collider) => migrateColliderToPositionFormat(collider) as PolygonCollider,
	);

	return {
		id: serialized.id,
		name: serialized.name,
		// No width/height - infinite map!
		layers,
		groups,
		entities: serialized.entities || [],
		points: serialized.points || [],
		colliders,
	};
}
