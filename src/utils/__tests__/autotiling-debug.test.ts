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
		const grassTileId = packTileId(16, 0, 0); // x=16, y=0, tilesetIndex=0

		const tileset: TilesetData = {
			version: "1.0",
			name: "debug-tileset",
			id: "debug-tileset-0",
			order: 0,
			imagePath: "/test.png",
			tileWidth: 16,
			tileHeight: 16,
			tiles: [createSimpleTile(grassTileId, 16, 0, "grass")],
			terrainLayers: [
				{
					id: "grass-layer",
					name: "grass",
					tiles: [
						{ tileId: grassTileId, bitmask: 16 }, // Isolated tile
					],
				},
			],
		};

		const layer: Layer = {
			id: "test-layer",
			type: "tile",
			name: "Test",
			visible: true,
			tiles: [grassTileId, 0, 0, 0], // 2x2 grid with one grass tile
		};

		const result = applyAutotiling(layer, 0, 0, 2, 2, [tileset]);

		// The function should return a number (the matched tile)
		expect(result).not.toBeNull();
	});
});
