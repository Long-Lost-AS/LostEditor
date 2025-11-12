import { convertFileSrc } from "@tauri-apps/api/core";
import { FileNotFoundError } from "../errors/FileErrors";
import { TilesetDataSchema } from "../schemas";
import type {
	TileDefinition,
	TileDefinitionJson,
	TilesetData,
	TilesetDataJson,
} from "../types";
import { unpackTileId } from "../utils/tileId";
import { tilesetIndexManager } from "../utils/tilesetIndexManager";
import { FileLoader } from "./FileLoader";
import { fileManager } from "./FileManager";

/**
 * TilesetManager handles loading, parsing, and managing tileset files
 */
class TilesetManager extends FileLoader<TilesetData, TilesetDataJson> {
	/**
	 * Zod schema for tileset validation
	 */
	protected get schema() {
		return TilesetDataSchema;
	}

	/**
	 * Prepare tileset data for serialization by filtering runtime-only fields
	 */
	protected prepareForSave(data: TilesetData): TilesetDataJson {
		// Get projectDir for making paths relative
		const projectDir = fileManager.getProjectDir();

		// Determine base directory for relative paths
		const baseDir = projectDir || fileManager.dirname(data.filePath || "");
		const relativeImagePath = fileManager.makeRelativeTo(
			baseDir,
			data.imagePath,
		);

		return {
			version: data.version,
			name: data.name,
			id: data.id,
			order: data.order, // Save the order to file
			imagePath: relativeImagePath,
			tileWidth: data.tileWidth,
			tileHeight: data.tileHeight,
			tiles: data.tiles
				.filter((tile) => {
					// Check if this is a compound tile
					if (tile.isCompound) return true;

					// For regular tiles, only save if they have properties
					return (
						tile.colliders?.length > 0 ||
						tile.name !== "" ||
						tile.type !== "" ||
						Object.keys(tile.properties).length > 0
					);
				})
				.map((tile) => {
					// Save id and properties (sprite position is in the packed ID)
					const saved: Record<string, unknown> = {
						id: tile.id,
					};

					// For compound tiles, save isCompound flag and dimensions
					if (tile.isCompound) {
						saved.isCompound = true;
						saved.width = tile.width;
						saved.height = tile.height;
					}

					// Save non-default properties
					if (tile.colliders?.length > 0) saved.colliders = tile.colliders;
					if (tile.name !== "") saved.name = tile.name;
					if (tile.type !== "") saved.type = tile.type;
					if (tile.origin?.x !== 0 || tile.origin?.y !== 0)
						saved.origin = tile.origin;
					if (Object.keys(tile.properties).length > 0)
						saved.properties = tile.properties;
					return saved as TileDefinitionJson;
				}),
			terrainLayers: data.terrainLayers?.map((layer) => ({
				...layer,
				// Filter out tiles with bitmask 0 (nothing painted)
				tiles: layer.tiles
					?.filter((t) => t.bitmask !== 0)
					.map((t) => ({
						tileId: t.tileId, // No conversion needed - already a number
						bitmask: t.bitmask,
					})),
			})),
		};
	}

	/**
	 * Post-process validated JSON data by loading images and resolving paths
	 */
	protected async postProcess(
		validated: TilesetDataJson,
		filePath: string,
	): Promise<TilesetData> {
		const projectDir = fileManager.getProjectDir();

		// Resolve image path
		// If projectDir is available, resolve relative to it (all paths relative to assets root)
		// Otherwise, fall back to resolving relative to the tileset file
		const baseDir = projectDir || fileManager.dirname(filePath);
		const imagePath = fileManager.normalize(
			fileManager.join(baseDir, validated.imagePath),
		);

		// Load the image
		const imageElement = await this.loadImage(imagePath);

		// Unpack tile geometries from packed IDs
		const tilesWithGeometry = (validated.tiles || []).map((tile) => {
			const geometry = unpackTileId(tile.id);
			return {
				...tile,
				x: geometry.x,
				y: geometry.y,
				// width/height are preserved from tile if present (for compound tiles)
				// Add default values for properties that may not exist in older files
				colliders: tile.colliders || [],
				origin: tile.origin || { x: 0, y: 0 },
			};
		});

		// Handle tileset order assignment
		// Check for order conflicts with already-loaded tilesets
		const existingTileset = Array.from(this.cache.values()).find(
			(ts) =>
				ts.order === validated.order &&
				ts.id !==
					(validated.id !== "" ? validated.id : this.generateId(filePath)),
		);

		if (existingTileset) {
			throw new Error(
				`Order conflict: Tileset ${validated.name} has order ${validated.order}, but it's already used by ${existingTileset.name}`,
			);
		}

		// Use order from file
		const tilesetOrder = validated.order;
		tilesetIndexManager.registerIndex(tilesetOrder);

		// Create the TilesetData object with runtime fields
		return {
			...validated,
			id: validated.id !== "" ? validated.id : this.generateId(filePath),
			order: tilesetOrder, // Store the order in runtime data
			imagePath: imagePath, // Use resolved absolute path
			imageData: imageElement,
			filePath: filePath, // Set the filePath so we know where this tileset was loaded from
			tiles: tilesWithGeometry,
		};
	}

	/**
	 * Load an image file and return an HTMLImageElement
	 */
	async loadImage(imagePath: string): Promise<HTMLImageElement> {
		// First verify the file exists to prevent browser cache hits
		const { exists } = await import("@tauri-apps/plugin-fs");
		const fileExists = await exists(imagePath);

		if (!fileExists) {
			throw new FileNotFoundError(imagePath, "Load image");
		}

		return new Promise((resolve, reject) => {
			const img = new Image();

			img.onload = () => {
				resolve(img);
			};

			img.onerror = () => {
				reject(new Error(`Failed to load image: ${imagePath}`));
			};

			// Use Tauri's convertFileSrc with cache-busting timestamp
			// This prevents browser from serving stale cached images
			const cacheBuster = `?t=${Date.now()}`;
			img.src = convertFileSrc(imagePath) + cacheBuster;
		});
	}

	/**
	 * Generate a unique ID for a tileset based on its path
	 */
	private generateId(tilesetPath: string): string {
		const basename = fileManager.basename(tilesetPath, ".lostset");
		return basename.replace(/[^a-zA-Z0-9_-]/g, "_");
	}

	/**
	 * Get a loaded tileset by path
	 */
	getTileset(tilesetPath: string): TilesetData | undefined {
		const fullPath = fileManager.resolvePath(tilesetPath);
		const normalizedPath = fileManager.normalize(fullPath);
		return this.cache.get(normalizedPath);
	}

	/**
	 * Get a loaded tileset by path (alias for getTileset)
	 */
	getTilesetByPath(tilesetPath: string): TilesetData | undefined {
		return this.getTileset(tilesetPath);
	}

	/**
	 * Update the imagePath in all loaded tilesets when an image is moved
	 */
	updateImagePath(oldImagePath: string, newImagePath: string): void {
		const normalizedOld = fileManager.normalize(oldImagePath);
		const normalizedNew = fileManager.normalize(newImagePath);

		for (const tileset of this.cache.values()) {
			const normalizedTilesetImagePath = fileManager.normalize(
				tileset.imagePath,
			);
			if (normalizedTilesetImagePath === normalizedOld) {
				tileset.imagePath = normalizedNew;
			}
		}
	}

	/**
	 * Get a loaded tileset by ID
	 */
	getTilesetById(tilesetId: string): TilesetData | undefined {
		return Array.from(this.cache.values()).find((t) => t.id === tilesetId);
	}

	/**
	 * Get a tile definition from a tileset
	 */
	getTileDefinition(
		tilesetId: string,
		tileId: number,
	): TileDefinition | undefined {
		const tileset = Array.from(this.cache.values()).find(
			(t) => t.id === tilesetId,
		);
		if (!tileset) return undefined;
		return tileset.tiles.find((t) => t.id === tileId);
	}

	/**
	 * Get all loaded tilesets
	 */
	getAllTilesets(): TilesetData[] {
		return Array.from(this.cache.values());
	}

	/**
	 * Unload a tileset
	 */
	unloadTileset(tilesetPath: string): boolean {
		const fullPath = fileManager.resolvePath(tilesetPath);
		const normalizedPath = fileManager.normalize(fullPath);

		// Get the tileset before deleting to clear image and release index
		const tileset = this.cache.get(normalizedPath);
		if (tileset) {
			if (tileset.imageData) {
				tileset.imageData.src = "";
			}
			// Release the tileset's order
			tilesetIndexManager.releaseIndex(tileset.order);
		}

		this.cache.delete(normalizedPath);
		return true;
	}

	/**
	 * Unload all tilesets
	 */
	unloadAll(): void {
		// Clear image src to help browser garbage collection and cache invalidation
		for (const tileset of this.cache.values()) {
			if (tileset.imageData) {
				tileset.imageData.src = "";
			}
		}
		this.clearCache();
		// Clear all tileset indices
		tilesetIndexManager.clear();
	}

	/**
	 * Reload a tileset (useful for hot-reloading during development)
	 */
	async reloadTileset(tilesetPath: string): Promise<TilesetData> {
		this.invalidate(tilesetPath);
		return this.load(tilesetPath);
	}

	/**
	 * Check if a tileset is loaded
	 */
	isLoaded(tilesetPath: string): boolean {
		const fullPath = fileManager.resolvePath(tilesetPath);
		const normalizedPath = fileManager.normalize(fullPath);
		return this.cache.has(normalizedPath);
	}

	/**
	 * Save a tileset to disk
	 * @param tileset - The tileset data to save
	 * @param filePath - Optional file path (uses tileset.filePath if not provided)
	 */
	async saveTileset(tileset: TilesetData, filePath?: string): Promise<void> {
		const targetPath = filePath || tileset.filePath;
		if (!targetPath) {
			throw new Error("No file path specified for saving tileset");
		}

		// Update the tileset's filePath before saving
		tileset.filePath = targetPath;

		await this.save(tileset, targetPath);
	}

	/**
	 * Legacy method: Load a tileset (now without projectDir parameter)
	 * @deprecated Use load() instead
	 */
	async loadTileset(tilesetPath: string): Promise<TilesetData> {
		return this.load(tilesetPath);
	}
}

// Export a singleton instance
export const tilesetManager = new TilesetManager();
