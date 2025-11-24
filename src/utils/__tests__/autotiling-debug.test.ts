import { describe, expect, it } from "vitest";
import { createSimpleTile } from "../../__mocks__/testFactories";
import type { Layer, TilesetData } from "../../types";
import { applyAutotiling } from "../autotiling";
import { packTileId } from "../tileId";

describe("autotiling - debug coverage", () => {
	it("should successfully execute full autotiling path", () => {
		// Create a properly structured tileset
		// IMPORTANT: x=0, y=0 packs to ID 0, which is treated as EMPTY!
		// Use x=16, y=0 instead
		const tilesetId = "debug-tileset-0";
		// Tileset order is 1 for test tileset
		const grassTileIdLocal = packTileId(16, 0, 1); // Local ID for terrain layer definition
		const grassTileIdGlobal = packTileId(16, 0, 1); // Global ID with tileset order

		const tileset: TilesetData = {
			version: "1.0",
			name: "debug-tileset",
			id: tilesetId,
			order: 1,
			imagePath: "/test.png",
			tileWidth: 16,
			tileHeight: 16,
			tiles: [createSimpleTile(16, 0, "grass")],
			terrainLayers: [
				{
					id: "grass-layer",
					name: "grass",
					tiles: [
						{ tileId: grassTileIdLocal, bitmask: 16 }, // Isolated tile (local ID)
					],
				},
			],
		};

		const layer: Layer = {
			id: "test-layer",
			name: "Test",
			visible: true,
			tiles: [grassTileIdGlobal, 0, 0, 0], // 2x2 grid with one grass tile (global ID)
		};

		const result = applyAutotiling(layer, 0, 0, 2, 2, [tileset]);

		// The function should return a number (the matched tile)
		expect(result).not.toBeNull();
	});
});
