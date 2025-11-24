import type {
	EntityDefinition,
	Layer,
	MapData,
	PolygonCollider,
	ProjectData,
	TileDefinition,
	TilesetData,
} from "../types";
import { generateId } from "../utils/id";

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
		order: 1,
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
		name: "Tile Layer 1",
		visible: true,
		tiles: [],
		...overrides,
	};
}

export function createMockMap(overrides?: Partial<MapData>): MapData {
	return {
		id: generateId(),
		name: "Test Map",
		width: 32,
		height: 24,
		tileWidth: 16,
		tileHeight: 16,
		layers: [createMockLayer()],
		entities: [],
		points: [],
		colliders: [],
		...overrides,
	};
}

export function createMockEntity(
	overrides?: Partial<EntityDefinition>,
): EntityDefinition {
	return {
		id: "test-entity-id",
		name: "test-entity",
		type: "",
		sprites: [],
		offset: { x: 0, y: 0 },
		rotation: 0,
		colliders: [],
		properties: {},
		...overrides,
	};
}

export function createMockProject(
	overrides?: Partial<ProjectData>,
): ProjectData {
	return {
		version: "1.0.0",
		name: "test-project",
		lastModified: new Date().toISOString(),
		openTabs: { tabs: [], activeTabId: null },
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
		properties: {},
		...overrides,
	};
}

export function createMockTileDefinition(
	overrides?: Partial<TileDefinition>,
): TileDefinition {
	return {
		id: 0,
		isCompound: false,
		width: 0,
		height: 0,
		origin: { x: 0, y: 0 },
		colliders: [],
		name: "",
		type: "",
		properties: {},
		...overrides,
	};
}

/**
 * Helper to create a simple tile with minimal fields (for tests)
 * Adds default values for all required fields
 * Note: x and y are packed into the id using packTileId
 */
export function createSimpleTile(
	id: number,
	x?: number,
	y?: number,
	type?: string,
): TileDefinition {
	// If x and y are provided, pack them into the id (for backward compatibility with tests)
	// Otherwise use id as-is
	const packedId =
		x !== undefined && y !== undefined
			? Number(createTileId({ tilesetOrder: 0, localId: id })) // Use helper to pack x/y into id
			: id;
	return createMockTileDefinition({ id: packedId, type: type || "" });
}

/**
 * Helper to create a tile ID with packed data
 */
export function createTileId(options: {
	tilesetOrder?: number;
	localId?: number;
	flipX?: boolean;
	flipY?: boolean;
	flipD?: boolean;
}): bigint {
	const {
		tilesetOrder = 0,
		localId = 0,
		flipX = false,
		flipY = false,
		flipD = false,
	} = options;

	// Simplified version of packTileId logic
	let id = BigInt(localId);
	id |= BigInt(tilesetOrder) << 32n;
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
