import type {
	EntityDefinition,
	Layer,
	MapData,
	PolygonCollider,
	ProjectData,
	TilesetData,
} from "../types";

/**
 * Factory functions for creating test data objects
 */

export function createMockTileset(
	overrides?: Partial<TilesetData>,
): TilesetData {
	return {
		version: "1.0",
		name: "test-tileset",
		id: "test-tileset-id",
		order: 0,
		imagePath: "/test/tileset.png",
		tileWidth: 16,
		tileHeight: 16,
		tiles: [],
		terrainLayers: [],
		...overrides,
	};
}

export function createMockLayer(overrides?: Partial<Layer>): Layer {
	return {
		id: "test-layer-1",
		type: "tile",
		name: "Tile Layer 1",
		visible: true,
		tiles: [],
		...overrides,
	};
}

export function createMockMap(overrides?: Partial<MapData>): MapData {
	return {
		name: "Test Map",
		width: 32,
		height: 24,
		tileWidth: 16,
		tileHeight: 16,
		layers: [createMockLayer()],
		entities: [],
		...overrides,
	};
}

export function createMockEntity(
	overrides?: Partial<EntityDefinition>,
): EntityDefinition {
	return {
		id: "test-entity-id",
		name: "test-entity",
		sprites: [],
		...overrides,
	};
}

export function createMockProject(
	overrides?: Partial<ProjectData>,
): ProjectData {
	return {
		version: "1.0.0",
		name: "test-project",
		tilesets: [],
		maps: [],
		lastModified: new Date().toISOString(),
		...overrides,
	};
}

export function createMockCollisionPolygon(
	overrides?: Partial<PolygonCollider>,
): PolygonCollider {
	return {
		id: "test-collider-id",
		name: "test-collider",
		type: "",
		points: [
			{ x: 0, y: 0 },
			{ x: 16, y: 0 },
			{ x: 16, y: 16 },
			{ x: 0, y: 16 },
		],
		...overrides,
	};
}

/**
 * Helper to create a tile ID with packed data
 */
export function createTileId(options: {
	tilesetIndex?: number;
	localId?: number;
	flipX?: boolean;
	flipY?: boolean;
	flipD?: boolean;
}): bigint {
	const {
		tilesetIndex = 0,
		localId = 0,
		flipX = false,
		flipY = false,
		flipD = false,
	} = options;

	// Simplified version of packTileId logic
	let id = BigInt(localId);
	id |= BigInt(tilesetIndex) << 32n;
	if (flipX) id |= 1n << 45n;
	if (flipY) id |= 1n << 46n;
	if (flipD) id |= 1n << 47n;

	return id;
}

/**
 * Helper to create mock image data
 */
export function createMockImageData(width = 32, height = 32): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	return { width, height, data } as ImageData;
}

/**
 * Helper to create a populated tile layer
 */
export function createPopulatedTileLayer(
	width: number,
	height: number,
	fillTileId = 0,
): Layer {
	const tiles = new Array(width * height).fill(fillTileId);
	return createMockLayer({ tiles });
}

/**
 * Helper to wait for async operations in tests
 */
export function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to create mock file content
 */
export function createMockFileContent(data: object): string {
	return JSON.stringify(data, null, 2);
}
