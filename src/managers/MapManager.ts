import { writeTextFile } from "@tauri-apps/plugin-fs";
import { MapFileSchema } from "../schemas";
import type { MapData, MapFileJson, SerializedMapData } from "../types";
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
		// Use serializeMapData to convert to version 5.0 format (chunk-based)
		const serialized = serializeMapData(data);
		return serialized as MapFileJson;
	}

	/**
	 * Post-process validated JSON data (version 5.0 only)
	 */
	protected async postProcess(
		validated: MapFileJson,
		_filePath: string,
	): Promise<MapData> {
		// All maps should be version 5.0 now (chunk-based)
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

		// Serialize to version 5.0 format (chunk-based storage)
		const serialized = serializeMapData(mapData);

		// Save the serialized data
		const fullPath = fileManager.resolvePath(filePath);
		const normalizedPath = fileManager.normalize(fullPath);

		// Format chunks for readability
		const jsonString = this.formatMapJSON(serialized);
		await writeTextFile(fullPath, jsonString);

		// Update cache with the runtime format
		this.cache.set(normalizedPath, mapData);
	}

	/**
	 * Format map JSON with chunks formatted as 16x16 grids for readability
	 * @private
	 */
	private formatMapJSON(serialized: SerializedMapData): string {
		const CHUNK_SIZE = 16;

		// Format a chunk array as a 16x16 grid with each row on its own line
		const formatChunkAsGrid = (chunk: number[], indent: string): string => {
			// Ensure chunk is padded to full size (256 elements)
			const fullChunk =
				chunk.length === CHUNK_SIZE * CHUNK_SIZE
					? chunk
					: [
							...chunk,
							...new Array(CHUNK_SIZE * CHUNK_SIZE - chunk.length).fill(0),
						];

			const rows: string[] = [];
			for (let row = 0; row < CHUNK_SIZE; row++) {
				const start = row * CHUNK_SIZE;
				const rowData = fullChunk.slice(start, start + CHUNK_SIZE);
				rows.push(`${indent}  ${JSON.stringify(rowData).slice(1, -1)}`);
			}
			return `[\n${rows.join(",\n")}\n${indent}]`;
		};

		// First, stringify without chunk formatting
		const baseJson = JSON.stringify(serialized, null, 2);

		// Parse and manually rebuild with formatted chunks
		const parsed = JSON.parse(baseJson);

		// Rebuild JSON manually to control chunk formatting
		const lines: string[] = ["{"];
		lines.push(`  "version": ${JSON.stringify(parsed.version)},`);
		lines.push(`  "id": ${JSON.stringify(parsed.id)},`);
		lines.push(`  "name": ${JSON.stringify(parsed.name)},`);
		lines.push('  "layers": [');

		for (let i = 0; i < parsed.layers.length; i++) {
			const layer = parsed.layers[i];
			lines.push("    {");
			lines.push(`      "id": ${JSON.stringify(layer.id)},`);
			lines.push(`      "name": ${JSON.stringify(layer.name)},`);
			lines.push(`      "visible": ${layer.visible},`);
			lines.push(`      "foreground": ${layer.foreground ?? false},`);
			lines.push('      "chunks": {');

			const chunkKeys = Object.keys(layer.chunks);
			for (let j = 0; j < chunkKeys.length; j++) {
				const key = chunkKeys[j];
				const chunk = layer.chunks[key];
				const formattedChunk = formatChunkAsGrid(chunk, "        ");
				const comma = j < chunkKeys.length - 1 ? "," : "";
				lines.push(`        ${JSON.stringify(key)}: ${formattedChunk}${comma}`);
			}

			lines.push("      },");
			lines.push(`      "tileWidth": ${layer.tileWidth},`);
			lines.push(`      "tileHeight": ${layer.tileHeight},`);
			lines.push(
				`      "properties": ${JSON.stringify(layer.properties || {})}`,
			);
			const layerComma = i < parsed.layers.length - 1 ? "," : "";
			lines.push(`    }${layerComma}`);
		}

		lines.push("  ],");
		lines.push(`  "entities": ${JSON.stringify(parsed.entities)},`);
		lines.push(`  "points": ${JSON.stringify(parsed.points)},`);
		lines.push(`  "colliders": ${JSON.stringify(parsed.colliders)}`);
		lines.push("}");

		return lines.join("\n");
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
