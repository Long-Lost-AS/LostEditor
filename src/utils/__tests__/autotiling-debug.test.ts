import { describe, expect, it } from "vitest";
import { createSimpleTile } from "../../__mocks__/testFactories";
import type { Layer, TilesetData } from "../../types";
import { applyAutotiling } from "../autotiling";
import { hashTilesetId, packTileId } from "../tileId";

describe("autotiling - debug coverage", () => {
	it("should successfully execute full autotiling path", () => {
		// Create a properly structured tileset
		// IMPORTANT: x=0, y=0 packs to ID 0, which is treated as EMPTY!
		// Use x=16, y=0 instead
		const tilesetId = "debug-tileset-0";
		const hash = hashTilesetId(tilesetId);
		const grassTileIdLocal = packTileId(16, 0, 0); // Local ID for terrain layer definition
		const grassTileIdGlobal = packTileId(16, 0, hash); // Global ID with tileset hash

		const tileset: TilesetData = {
			version: "1.0",
			name: "debug-tileset",
			id: tilesetId,
			order: 0,
			imagePath: "/test.png",
			tileWidth: 16,
			tileHeight: 16,
			tiles: [createSimpleTile(grassTileIdLocal, 16, 0, "grass")],
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
			type: "tile",
			name: "Test",
			visible: true,
			tiles: [grassTileIdGlobal, 0, 0, 0], // 2x2 grid with one grass tile (global ID)
		};

		const result = applyAutotiling(layer, 0, 0, 2, 2, [tileset]);

		// The function should return a number (the matched tile)
		expect(result).not.toBeNull();
	});
});
