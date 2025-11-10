import type {
	CollisionPolygon,
	CustomProperty,
	EntityData,
	EntityLayer,
	MapData,
	ProjectData,
	TileLayer,
	TilesetData,
} from "../types";

/**
 * Factory functions for creating test data objects
 */

export function createMockTileset(
	overrides?: Partial<TilesetData>,
): TilesetData {
	return {
		name: "test-tileset",
		imagePath: "/test/tileset.png",
		tileWidth: 16,
		tileHeight: 16,
		columns: 8,
		rows: 8,
		spacing: 0,
		margin: 0,
		properties: [],
		...overrides,
	};
}

export function createMockTileLayer(overrides?: Partial<TileLayer>): TileLayer {
	return {
		type: "tile",
		name: "Tile Layer 1",
		visible: true,
		locked: false,
		opacity: 1,
		data: [],
		properties: [],
		...overrides,
	};
}

export function createMockEntityLayer(
	overrides?: Partial<EntityLayer>,
): EntityLayer {
	return {
		type: "entity",
		name: "Entity Layer 1",
		visible: true,
		locked: false,
		opacity: 1,
		entities: [],
		properties: [],
		...overrides,
	};
}

export function createMockMap(overrides?: Partial<MapData>): MapData {
	return {
		width: 32,
		height: 24,
		tileWidth: 16,
		tileHeight: 16,
		tilesets: [],
		layers: [createMockTileLayer()],
		properties: [],
		...overrides,
	};
}

export function createMockEntity(overrides?: Partial<EntityData>): EntityData {
	return {
		name: "test-entity",
		spriteLayers: [],
		collisionPolygons: [],
		properties: [],
		...overrides,
	};
}

export function createMockProject(
	overrides?: Partial<ProjectData>,
): ProjectData {
	return {
		name: "test-project",
		version: "1.0.0",
		...overrides,
	};
}

export function createMockCollisionPolygon(
	overrides?: Partial<CollisionPolygon>,
): CollisionPolygon {
	return {
		points: [
			{ x: 0, y: 0 },
			{ x: 16, y: 0 },
			{ x: 16, y: 16 },
			{ x: 0, y: 16 },
		],
		...overrides,
	};
}

export function createMockCustomProperty(
	overrides?: Partial<CustomProperty>,
): CustomProperty {
	return {
		name: "testProperty",
		type: "string",
		value: "test value",
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
	fillTileId = 0n,
): TileLayer {
	const data = new Array(width * height).fill(fillTileId);
	return createMockTileLayer({ data });
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
