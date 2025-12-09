/**
 * Map PNG Export Utility
 *
 * Exports the visible layers of a map to a PNG image.
 */

import type {
	EntityDefinition,
	EntityInstance,
	Layer,
	MapData,
	TilesetData,
} from "../types";
import { CHUNK_SIZE, parseChunkKey } from "./chunkStorage";
import { unpackTileId } from "./tileId";

export interface MapExportOptions {
	/** Map to export */
	map: MapData;
	/** Available tilesets (must be loaded with imageData) */
	tilesets: TilesetData[];
	/** Entity definitions for rendering entities */
	entityDefs: EntityDefinition[];
	/** Scale factor (1 = 100%, 2 = 200%, etc.) */
	scale?: number;
	/** Background color (default: transparent) */
	backgroundColor?: string;
}

export interface MapExportResult {
	/** The rendered canvas */
	canvas: HTMLCanvasElement;
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
	/** Export as data URL */
	toDataURL: () => string;
	/** Export as Blob */
	toBlob: () => Promise<Blob>;
}

/**
 * Calculate tight bounding box for a layer by scanning actual tile content.
 * Returns tile coordinates, or null if layer is empty.
 */
function getLayerTileBounds(
	layer: Layer,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
	let minTileX = Number.POSITIVE_INFINITY;
	let minTileY = Number.POSITIVE_INFINITY;
	let maxTileX = Number.NEGATIVE_INFINITY;
	let maxTileY = Number.NEGATIVE_INFINITY;
	let hasContent = false;

	const chunks = Object.entries(layer.chunks);
	for (const [key, chunkData] of chunks) {
		const { chunkX, chunkY } = parseChunkKey(key);

		// Scan each tile in chunk
		for (let localY = 0; localY < CHUNK_SIZE; localY++) {
			for (let localX = 0; localX < CHUNK_SIZE; localX++) {
				const index = localY * CHUNK_SIZE + localX;
				const tileId = chunkData[index];
				if (tileId === 0) continue; // Empty tile

				const worldTileX = chunkX * CHUNK_SIZE + localX;
				const worldTileY = chunkY * CHUNK_SIZE + localY;

				minTileX = Math.min(minTileX, worldTileX);
				minTileY = Math.min(minTileY, worldTileY);
				maxTileX = Math.max(maxTileX, worldTileX);
				maxTileY = Math.max(maxTileY, worldTileY);
				hasContent = true;
			}
		}
	}

	if (!hasContent) return null;
	return { minX: minTileX, minY: minTileY, maxX: maxTileX, maxY: maxTileY };
}

/**
 * Calculate the bounding box of all visible content in the map.
 * Returns pixel coordinates.
 */
function calculateMapBounds(
	map: MapData,
	entityDefs: EntityDefinition[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let hasContent = false;

	// Get layer groups for visibility checking
	const groupsById = new Map(map.groups.map((g) => [g.id, g]));

	// Check all visible layers - use tight tile bounds
	for (const layer of map.layers) {
		// Skip invisible layers
		if (!layer.visible) continue;

		// Skip if parent group is invisible
		if (layer.groupId) {
			const group = groupsById.get(layer.groupId);
			if (group && !group.visible) continue;
		}

		// Get tight tile bounds for this layer
		const tileBounds = getLayerTileBounds(layer);
		if (tileBounds) {
			const pixelMinX = tileBounds.minX * layer.tileWidth;
			const pixelMinY = tileBounds.minY * layer.tileHeight;
			const pixelMaxX = (tileBounds.maxX + 1) * layer.tileWidth;
			const pixelMaxY = (tileBounds.maxY + 1) * layer.tileHeight;

			minX = Math.min(minX, pixelMinX);
			minY = Math.min(minY, pixelMinY);
			maxX = Math.max(maxX, pixelMaxX);
			maxY = Math.max(maxY, pixelMaxY);
			hasContent = true;
		}
	}

	// Check all entities
	const entityDefById = new Map(entityDefs.map((e) => [e.id, e]));
	for (const entity of map.entities) {
		const def = entityDefById.get(entity.entityDefId);
		if (!def?.sprites) continue;

		// Calculate entity bounds from its sprites
		for (const spriteLayer of def.sprites) {
			if (!spriteLayer.rect) continue;

			const sprite = spriteLayer.rect;
			const offset = spriteLayer.offset || { x: 0, y: 0 };
			const origin = spriteLayer.origin || { x: 0.5, y: 1 };
			const scale = entity.scale;

			const scaledWidth = sprite.width * scale.x;
			const scaledHeight = sprite.height * scale.y;

			const originOffsetX = origin.x * scaledWidth;
			const originOffsetY = origin.y * scaledHeight;

			const spriteX = entity.x - originOffsetX + offset.x;
			const spriteY = entity.y - originOffsetY + offset.y;

			minX = Math.min(minX, spriteX);
			minY = Math.min(minY, spriteY);
			maxX = Math.max(maxX, spriteX + scaledWidth);
			maxY = Math.max(maxY, spriteY + scaledHeight);
			hasContent = true;
		}
	}

	if (!hasContent) return null;

	return { minX, minY, maxX, maxY };
}

/**
 * Render layer tiles to a canvas context.
 */
function renderLayerTiles(
	ctx: CanvasRenderingContext2D,
	layer: Layer,
	tilesetByOrder: Map<number, TilesetData>,
	offsetX: number,
	offsetY: number,
): void {
	const chunks = Object.entries(layer.chunks);

	for (const [key, chunkData] of chunks) {
		const { chunkX, chunkY } = parseChunkKey(key);

		// Render each tile in the chunk
		for (let localY = 0; localY < CHUNK_SIZE; localY++) {
			for (let localX = 0; localX < CHUNK_SIZE; localX++) {
				const index = localY * CHUNK_SIZE + localX;
				const tileId = chunkData[index];
				if (tileId === 0) continue; // Empty tile

				const geometry = unpackTileId(tileId);
				const tileset = tilesetByOrder.get(geometry.tilesetOrder);
				if (!tileset?.imageData) continue;

				// Find tile definition for custom dimensions
				const tileDef = tileset.tiles.find(
					(t) => t.x === geometry.x && t.y === geometry.y,
				);
				const srcWidth = tileDef?.width || tileset.tileWidth;
				const srcHeight = tileDef?.height || tileset.tileHeight;

				// Calculate world position
				const worldTileX = chunkX * CHUNK_SIZE + localX;
				const worldTileY = chunkY * CHUNK_SIZE + localY;
				const destX = worldTileX * layer.tileWidth - offsetX;
				const destY = worldTileY * layer.tileHeight - offsetY;

				// Handle flipping
				ctx.save();
				if (geometry.flipX || geometry.flipY) {
					ctx.translate(
						destX + (geometry.flipX ? layer.tileWidth : 0),
						destY + (geometry.flipY ? layer.tileHeight : 0),
					);
					ctx.scale(geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1);
					ctx.drawImage(
						tileset.imageData,
						geometry.x,
						geometry.y,
						srcWidth,
						srcHeight,
						0,
						0,
						layer.tileWidth,
						layer.tileHeight,
					);
				} else {
					ctx.drawImage(
						tileset.imageData,
						geometry.x,
						geometry.y,
						srcWidth,
						srcHeight,
						destX,
						destY,
						layer.tileWidth,
						layer.tileHeight,
					);
				}
				ctx.restore();
			}
		}
	}
}

interface TintColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

/**
 * Get the effective tint for a layer, combining layer and group tints.
 * Matches MapCanvas getEffectiveLayerProps logic.
 */
function getEffectiveTint(
	layer: Layer,
	groupsById: Map<string, { tint?: TintColor }>,
): TintColor {
	const layerTint = layer.tint ?? { r: 255, g: 255, b: 255, a: 255 };

	if (!layer.groupId) return layerTint;

	const group = groupsById.get(layer.groupId);
	if (!group) return layerTint;

	const groupTint = group.tint ?? { r: 255, g: 255, b: 255, a: 255 };

	// Check if a tint is effectively "no tint" (white)
	const isWhite = (t: TintColor) => t.r >= 250 && t.g >= 250 && t.b >= 250;

	// Combine tints: if one is white use the other, otherwise average them
	if (isWhite(groupTint)) {
		return layerTint;
	} else if (isWhite(layerTint)) {
		return groupTint;
	} else {
		// Average the tints for intuitive color mixing
		return {
			r: Math.round((layerTint.r + groupTint.r) / 2),
			g: Math.round((layerTint.g + groupTint.g) / 2),
			b: Math.round((layerTint.b + groupTint.b) / 2),
			a: Math.round((layerTint.a * groupTint.a) / 255),
		};
	}
}

/**
 * Render a single layer to the canvas with tint support.
 */
function renderLayer(
	ctx: CanvasRenderingContext2D,
	layer: Layer,
	tilesetByOrder: Map<number, TilesetData>,
	offsetX: number,
	offsetY: number,
	canvasWidth: number,
	canvasHeight: number,
	groupsById: Map<string, { tint?: TintColor }>,
): void {
	const tint = getEffectiveTint(layer, groupsById);
	const needsTint =
		tint.r !== 255 || tint.g !== 255 || tint.b !== 255 || tint.a !== 255;

	if (!needsTint) {
		// No tint - render directly to main canvas
		renderLayerTiles(ctx, layer, tilesetByOrder, offsetX, offsetY);
		return;
	}

	// Render to offscreen canvas first, then apply tint
	const offscreen = document.createElement("canvas");
	offscreen.width = canvasWidth;
	offscreen.height = canvasHeight;
	const offCtx = offscreen.getContext("2d");
	if (!offCtx) return;

	// Render tiles to offscreen canvas
	renderLayerTiles(offCtx, layer, tilesetByOrder, offsetX, offsetY);

	// Apply color tint with multiply
	offCtx.globalCompositeOperation = "multiply";
	offCtx.fillStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
	offCtx.fillRect(0, 0, canvasWidth, canvasHeight);

	// Clip to original alpha with destination-in
	offCtx.globalCompositeOperation = "destination-in";
	offCtx.globalAlpha = tint.a / 255;

	// Re-render tiles to get the alpha mask
	const alphaCanvas = document.createElement("canvas");
	alphaCanvas.width = canvasWidth;
	alphaCanvas.height = canvasHeight;
	const alphaCtx = alphaCanvas.getContext("2d");
	if (alphaCtx) {
		renderLayerTiles(alphaCtx, layer, tilesetByOrder, offsetX, offsetY);
		offCtx.drawImage(alphaCanvas, 0, 0);
	}

	// Draw tinted layer to main canvas
	ctx.drawImage(offscreen, 0, 0);
}

/**
 * Render an entity to the canvas (matching MapCanvas renderEntity logic).
 */
function renderEntity(
	ctx: CanvasRenderingContext2D,
	entity: EntityInstance,
	def: EntityDefinition,
	tilesetById: Map<string, TilesetData>,
	offsetX: number,
	offsetY: number,
): void {
	if (!def.sprites || def.sprites.length === 0) return;

	const parentX = entity.x - offsetX;
	const parentY = entity.y - offsetY;

	for (const spriteLayer of def.sprites) {
		if (!spriteLayer.rect) continue;

		const tileset = tilesetById.get(spriteLayer.tilesetId);
		if (!tileset?.imageData) continue;

		ctx.save();

		const sprite = spriteLayer.rect;
		const offset = spriteLayer.offset || { x: 0, y: 0 };
		const origin = spriteLayer.origin || { x: 0.5, y: 1 };
		const rotation = (spriteLayer.rotation || 0) + entity.rotation;
		const scale = entity.scale;

		// Calculate scaled dimensions
		const scaledWidth = sprite.width * scale.x;
		const scaledHeight = sprite.height * scale.y;

		// Calculate position based on origin point (using scaled dimensions)
		const originOffsetX = origin.x * scaledWidth;
		const originOffsetY = origin.y * scaledHeight;

		const x = parentX - originOffsetX + offset.x;
		const y = parentY - originOffsetY + offset.y;

		// Apply rotation if needed
		if (rotation !== 0) {
			ctx.translate(parentX, parentY);
			ctx.rotate((rotation * Math.PI) / 180);
			ctx.translate(-parentX, -parentY);
		}

		// Draw sprite with scale applied
		ctx.drawImage(
			tileset.imageData,
			sprite.x,
			sprite.y,
			sprite.width,
			sprite.height,
			x,
			y,
			scaledWidth,
			scaledHeight,
		);

		// Apply tint if not white
		const tint = spriteLayer.tint || { r: 255, g: 255, b: 255, a: 255 };
		const needsTint =
			tint.r !== 255 || tint.g !== 255 || tint.b !== 255 || tint.a !== 255;

		if (needsTint) {
			// Use offscreen canvas for tinting to avoid affecting background
			const offscreen = document.createElement("canvas");
			offscreen.width = scaledWidth;
			offscreen.height = scaledHeight;
			const offCtx = offscreen.getContext("2d");

			if (offCtx) {
				// Draw sprite to offscreen canvas
				offCtx.drawImage(
					tileset.imageData,
					sprite.x,
					sprite.y,
					sprite.width,
					sprite.height,
					0,
					0,
					scaledWidth,
					scaledHeight,
				);

				// Apply color tint with multiply
				offCtx.globalCompositeOperation = "multiply";
				offCtx.fillStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
				offCtx.fillRect(0, 0, scaledWidth, scaledHeight);

				// Clip to original sprite alpha with destination-in
				offCtx.globalCompositeOperation = "destination-in";
				offCtx.globalAlpha = tint.a / 255;
				offCtx.drawImage(
					tileset.imageData,
					sprite.x,
					sprite.y,
					sprite.width,
					sprite.height,
					0,
					0,
					scaledWidth,
					scaledHeight,
				);

				// Draw tinted sprite from offscreen canvas (replacing previous draw)
				ctx.globalCompositeOperation = "source-over";
				ctx.drawImage(offscreen, x, y);
			}
		}

		ctx.restore();
	}
}

/**
 * Export a map to PNG.
 */
export function exportMapToPng(
	options: MapExportOptions,
): MapExportResult | null {
	const { map, tilesets, entityDefs, scale = 1, backgroundColor } = options;

	// Build tileset lookups
	const tilesetByOrder = new Map<number, TilesetData>();
	const tilesetById = new Map<string, TilesetData>();
	for (const ts of tilesets) {
		tilesetByOrder.set(ts.order, ts);
		tilesetById.set(ts.id, ts);
	}

	// Calculate bounds
	const bounds = calculateMapBounds(map, entityDefs);
	if (!bounds) return null;

	const width = Math.ceil((bounds.maxX - bounds.minX) * scale);
	const height = Math.ceil((bounds.maxY - bounds.minY) * scale);

	if (width <= 0 || height <= 0) return null;

	// Create canvas
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	// Apply scale
	ctx.scale(scale, scale);

	// Fill background
	if (backgroundColor) {
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(0, 0, width / scale, height / scale);
	}

	// Get groups for visibility
	const groupsById = new Map(map.groups.map((g) => [g.id, g]));

	// Sort layers by order
	const sortedLayers = [...map.layers].sort((a, b) => {
		// Groups first if present
		const aGroup = a.groupId ? groupsById.get(a.groupId) : null;
		const bGroup = b.groupId ? groupsById.get(b.groupId) : null;
		const aGroupOrder = aGroup?.order ?? 0;
		const bGroupOrder = bGroup?.order ?? 0;

		if (aGroupOrder !== bGroupOrder) return aGroupOrder - bGroupOrder;
		return a.order - b.order;
	});

	// Unscaled dimensions for offscreen canvases
	const unscaledWidth = width / scale;
	const unscaledHeight = height / scale;

	// Render background layers (foreground: false)
	for (const layer of sortedLayers) {
		if (layer.foreground) continue;
		if (!layer.visible) continue;
		if (layer.groupId) {
			const group = groupsById.get(layer.groupId);
			if (group && !group.visible) continue;
		}

		renderLayer(
			ctx,
			layer,
			tilesetByOrder,
			bounds.minX,
			bounds.minY,
			unscaledWidth,
			unscaledHeight,
			groupsById,
		);
	}

	// Render entities (sorted by Y for proper depth)
	const entityDefById = new Map(entityDefs.map((e) => [e.id, e]));
	const sortedEntities = [...map.entities].sort((a, b) => a.y - b.y);

	for (const entity of sortedEntities) {
		const def = entityDefById.get(entity.entityDefId);
		if (!def) continue;

		renderEntity(ctx, entity, def, tilesetById, bounds.minX, bounds.minY);
	}

	// Render foreground layers (foreground: true)
	for (const layer of sortedLayers) {
		if (!layer.foreground) continue;
		if (!layer.visible) continue;
		if (layer.groupId) {
			const group = groupsById.get(layer.groupId);
			if (group && !group.visible) continue;
		}

		renderLayer(
			ctx,
			layer,
			tilesetByOrder,
			bounds.minX,
			bounds.minY,
			unscaledWidth,
			unscaledHeight,
			groupsById,
		);
	}

	return {
		canvas,
		width,
		height,
		toDataURL: () => canvas.toDataURL("image/png"),
		toBlob: () =>
			new Promise((resolve, reject) => {
				canvas.toBlob((blob) => {
					if (blob) resolve(blob);
					else reject(new Error("Failed to create blob"));
				}, "image/png");
			}),
	};
}
