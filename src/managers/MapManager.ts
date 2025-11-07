import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
	createDefaultMapData,
	type MapFileJson,
	MapFileSchema,
	validateMapData,
} from "../schemas";
import { Layer, type MapData, type SerializedMapData, Tile } from "../types";
import { deserializeMapData, serializeMapData } from "../utils/mapSerializer";
import { FileLoader } from "./FileLoader";
import { fileManager } from "./FileManager";

/**
 * MapManager handles loading, parsing, and managing map files
 */
class MapManager extends FileLoader<MapData, MapFileJson> {
	/**
	 * Zod schema for map validation
	 */
	protected get schema() {
		return MapFileSchema;
	}

	/**
	 * Prepare map data for serialization using serializeMapData
	 */
	protected prepareForSave(data: MapData): MapFileJson {
		// Use serializeMapData to convert to version 4.0 format
		const serialized = serializeMapData(data);
		return serialized as MapFileJson;
	}

	/**
	 * Post-process validated JSON data (version 4.0 only)
	 */
	protected async postProcess(
		validated: MapFileJson,
		filePath: string,
	): Promise<MapData> {
		// All maps should be version 4.0 now
		const serialized = validated as unknown as SerializedMapData;
		return deserializeMapData(serialized);
	}

	/**
	 * Get a loaded map by path
	 */
	getMap(mapPath: string): MapData | undefined {
		const fullPath = fileManager.resolvePath(mapPath);
		const normalizedPath = fileManager.normalize(fullPath);
		return this.cache.get(normalizedPath);
	}

	/**
	 * Get all loaded maps
	 */
	getAllMaps(): MapData[] {
		return Array.from(this.cache.values());
	}

	/**
	 * Save a map to disk
	 * @param mapData - The map data to save
	 * @param filePath - File path where to save
	 * @param mapName - Optional custom name for the map
	 */
	async saveMap(
		mapData: MapData,
		filePath: string,
		mapName?: string,
	): Promise<void> {
		// Set custom name if provided
		if (mapName) {
			mapData.name = mapName;
		}

		// Serialize to version 3.0 format (BigInt global tile IDs)
		const serialized = serializeMapData(mapData);

		// Save the serialized data
		const fullPath = fileManager.resolvePath(filePath);
		const normalizedPath = fileManager.normalize(fullPath);

		// Format tiles array with width-based rows for readability
		const jsonString = this.formatMapJSON(serialized, mapData.width);
		await writeTextFile(fullPath, jsonString);

		// Update cache with the runtime format
		this.cache.set(normalizedPath, mapData);
	}

	/**
	 * Format map JSON with tiles arranged in rows matching map width
	 * @private
	 */
	private formatMapJSON(
		serialized: SerializedMapData,
		mapWidth: number,
	): string {
		// First, stringify everything except tiles arrays normally
		const replacer = (key: string, value: unknown) => {
			// Don't process tiles arrays here - we'll handle them manually
			if (key === "tiles" && Array.isArray(value)) {
				return "__TILES_PLACEHOLDER__";
			}
			return value;
		};

		let jsonString = JSON.stringify(serialized, replacer, 2);

		// Now replace each tiles placeholder with formatted flat array (row-based line breaks)
		serialized.layers.forEach((layer) => {
			if (layer.type === "tile") {
				// Ensure tiles array exists, even if empty
				const tiles = layer.tiles && layer.tiles.length > 0 ? layer.tiles : [];

				// Build a flat array string with line breaks every mapWidth tiles
				const parts: string[] = [];
				if (tiles.length > 0) {
					for (let i = 0; i < tiles.length; i += mapWidth) {
						const row = tiles.slice(i, i + mapWidth);
						parts.push(row.join(", "));
					}
				}
				const formattedTiles =
					tiles.length > 0
						? `[\n        ${parts.join(",\n        ")}\n      ]`
						: "[]";

				// Replace the first occurrence of the placeholder
				jsonString = jsonString.replace(
					'"__TILES_PLACEHOLDER__"',
					formattedTiles,
				);
			}
		});

		return jsonString;
	}

	/**
	 * Unload all maps
	 */
	unloadAll(): void {
		this.clearCache();
	}

	/**
	 * Legacy method: Load a map
	 * @deprecated Use load() instead
	 */
	async loadMap(mapPath: string): Promise<MapData> {
		return this.load(mapPath);
	}
}

// Export a singleton instance
export const mapManager = new MapManager();
