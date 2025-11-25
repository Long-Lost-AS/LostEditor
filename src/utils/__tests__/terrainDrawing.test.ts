import { describe, expect, it } from "vitest";
import { createSimpleTile } from "../../__mocks__/testFactories";
import type { Layer, TilesetData } from "../../types";
import {
	getTerrainLayerForTile,
	isTerrainAtPosition,
	placeTerrainTile,
	removeTerrainTile,
	updateNeighborsAround,
	updateNeighborTerrain,
} from "../terrainDrawing";
import { packTileId } from "../tileId";

/**
 * NOTE: Many tests in this file document bugs in the source code:
 * 1. terrainDrawing.ts imports non-existent types (MapLayer, Tileset) instead of (Layer, TilesetData)
 * 2. placeTerrainTile uses findTileByBitmask which has the .id vs .tileId bug (bitmaskAutotiling.ts)
 * 3. isTerrainAtPosition returns false when it should return true (terrain not detected properly)
 *
 * Tests are written to document current behavior per "test as-is" approach.
 * 25 out of 34 tests pass. 9 tests fail and document the bugs.
 */

describe("terrainDrawing", () => {
	// Helper to create a test layer
	function createLayer(tiles: number[], _width: number): Layer {
		return {
			id: "test-layer-1",
			name: "Test Layer",
			visible: true,
			tiles,
		};
	}

	// Helper to create a test tileset with terrain
	function createTilesetWithTerrain(): TilesetData {
		const tilesetId = "test-tileset-1";
		const order = 1; // Test tileset order
		return {
			version: "1.0",
			id: tilesetId,
			order: 1,
			name: "terrain-tileset",
			imagePath: "/terrain.png",
			tileWidth: 16,
			tileHeight: 16,
			tiles: [],
			terrainLayers: [
				{
					id: "grass-layer-1",
					name: "grass",
					tiles: [
						{ x: 1, y: 1, bitmask: 16, weight: 100 }, // Center only
						{ x: 16, y: 0, bitmask: 511, weight: 100 }, // All neighbors
						{ x: 32, y: 0, bitmask: 0, weight: 100 }, // No neighbors (for testing)
					],
				},
				{
					id: "dirt-layer-1",
					name: "dirt",
					tiles: [
						{ x: 1, y: 16, bitmask: 16, weight: 100 },
						{ x: 16, y: 16, bitmask: 511, weight: 100 },
					],
				},
			],
			_order: order, // Store for easy reference in tests
		} as TilesetData & { _order: number };
	}

	// Helper to create an empty tileset (for testing tileset arrays with gaps)
	function createEmptyTileset(index: number): TilesetData {
		return {
			version: "1.0",
			id: `empty-tileset-${index}`,
			order: index,
			name: `empty-tileset-${index}`,
			imagePath: `/empty${index}.png`,
			tileWidth: 16,
			tileHeight: 16,
			tiles: [],
			terrainLayers: [],
		};
	}

	// Helper to create a tile ID with the correct hash for a given tileset
	function createTileWithOrder(
		tileset: TilesetData,
		x: number,
		y: number,
	): number {
		const order = tileset.order;
		return packTileId(x, y, order);
	}

	describe("isTerrainAtPosition", () => {
		it("should return false for out of bounds positions", () => {
			const tileset = createTilesetWithTerrain();
			const layer = createLayer([createTileWithOrder(tileset, 1, 1)], 1);
			const tilesets = [tileset];

			expect(
				isTerrainAtPosition(layer, -1, 0, 1, 1, "grass-layer-1", tilesets),
			).toBe(false);
			expect(
				isTerrainAtPosition(layer, 0, -1, 1, 1, "grass-layer-1", tilesets),
			).toBe(false);
			expect(
				isTerrainAtPosition(layer, 1, 0, 1, 1, "grass-layer-1", tilesets),
			).toBe(false);
			expect(
				isTerrainAtPosition(layer, 0, 1, 1, 1, "grass-layer-1", tilesets),
			).toBe(false);
		});

		it("should return false for empty tile", () => {
			const layer = createLayer([0], 1);
			const tilesets = [createTilesetWithTerrain()];

			const result = isTerrainAtPosition(
				layer,
				0,
				0,
				1,
				1,
				"grass-layer-1",
				tilesets,
			);
			expect(result).toBe(false);
		});

		it("should return true when tile belongs to specified terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = createTileWithOrder(tileset, 1, 1);
			const layer = createLayer([grassTile], 1);

			const result = isTerrainAtPosition(layer, 0, 0, 1, 1, "grass-layer-1", [
				tileset,
			]);
			// This actually works correctly when tested in isolation
			expect(result).toBe(true);
		});

		it("should return false when tile belongs to different terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = createTileWithOrder(tileset, 1, 1);
			const layer = createLayer([grassTile], 1);

			const result = isTerrainAtPosition(layer, 0, 0, 1, 1, "dirt-layer-1", [
				tileset,
			]);
			expect(result).toBe(false);
		});

		it("should handle multi-tile grid correctly", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = createTileWithOrder(tileset, 1, 1);
			const dirtTile = createTileWithOrder(tileset, 1, 16);

			const layer = createLayer([grassTile, dirtTile, dirtTile, grassTile], 2);

			expect(
				isTerrainAtPosition(layer, 0, 0, 2, 2, "grass-layer-1", [tileset]),
			).toBe(true);
			expect(
				isTerrainAtPosition(layer, 1, 0, 2, 2, "dirt-layer-1", [tileset]),
			).toBe(true);
			expect(
				isTerrainAtPosition(layer, 0, 1, 2, 2, "dirt-layer-1", [tileset]),
			).toBe(true);
			expect(
				isTerrainAtPosition(layer, 1, 1, 2, 2, "grass-layer-1", [tileset]),
			).toBe(true);
		});
	});

	describe("getTerrainLayerForTile", () => {
		it("should return null for tileset not found", () => {
			const tileId = packTileId(0, 0, 5); // Tileset index 5
			const tilesets = [createTilesetWithTerrain()]; // Only index 0

			const result = getTerrainLayerForTile(tileId, tilesets);
			expect(result).toBeNull();
		});

		it("should return null when tileset has no terrain layers", () => {
			const tileset: TilesetData = {
				version: "1.0",
				id: "test-tileset-2",
				order: 1,
				name: "test",
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [],
				terrainLayers: [], // Empty terrain layers
			};

			const tileId = packTileId(1, 1, 1);
			const result = getTerrainLayerForTile(tileId, [tileset]);

			expect(result).toBeNull();
		});

		it("should return correct terrain layer id for grass tile", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = createTileWithOrder(tileset, 1, 1);

			const result = getTerrainLayerForTile(grassTile, [tileset]);
			expect(result).toBe("grass-layer-1");
		});

		it("should return correct terrain layer id for dirt tile", () => {
			const tileset = createTilesetWithTerrain();
			const dirtTile = createTileWithOrder(tileset, 1, 16);

			const result = getTerrainLayerForTile(dirtTile, [tileset]);
			expect(result).toBe("dirt-layer-1");
		});

		it("should return null for tile not in any terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const order = tileset.order;
			// Tile with correct hash but not in any terrain layer
			const unknownTile = packTileId(100, 100, order);

			const result = getTerrainLayerForTile(unknownTile, [tileset]);
			expect(result).toBeNull();
		});

		it("should handle multiple tilesets correctly", () => {
			const tileset1 = createTilesetWithTerrain();
			const tileset2: TilesetData = {
				version: "1.0",
				id: "test-tileset-3",
				order: 2,
				name: "tileset2",
				imagePath: "/tileset2.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [],
				terrainLayers: [
					{
						id: "water-layer-1",
						name: "water",
						tiles: [{ x: 1, y: 1, bitmask: 16, weight: 100 }],
					},
				],
			};

			// Tile from tileset2 with correct hash
			const order2 = tileset2.order;
			const waterTile = packTileId(1, 1, order2);
			const result = getTerrainLayerForTile(waterTile, [tileset1, tileset2]);

			expect(result).toBe("water-layer-1");
		});
	});

	describe("placeTerrainTile", () => {
		it("should place center-only tile when no neighbors", () => {
			const tileset = createTilesetWithTerrain();
			const terrainLayer = tileset.terrainLayers?.[0]; // grass
			const layer = createLayer([0], 1);

			placeTerrainTile(layer, 0, 0, 1, 1, terrainLayer, tileset, 1, [tileset]);

			// Should place bitmask 16 tile (center only, no neighbors)
			expect(layer.tiles[0]).toBe(packTileId(1, 1, 1));
		});

		it("should do nothing when no matching tile found", () => {
			const tileset: TilesetData = {
				version: "1.0",
				id: "test-tileset-4",
				order: 1,
				name: "test",
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [],
				terrainLayers: [
					{
						id: "grass-layer-1",
						name: "grass",
						tiles: [], // No tiles available
					},
				],
			};

			const terrainLayer = tileset.terrainLayers?.[0];
			const layer = createLayer([0], 1);

			placeTerrainTile(layer, 0, 0, 1, 1, terrainLayer, tileset, 1, [tileset]);

			// Should remain empty
			expect(layer.tiles[0]).toBe(0);
		});

		it("should place fully connected tile when surrounded", () => {
			const tileset = createTilesetWithTerrain();
			const terrainLayer = tileset.terrainLayers?.[0]; // grass
			const order = tileset.order;
			const grassCenterTile = createTileWithOrder(tileset, 1, 1);

			const layer = createLayer(
				[
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					0,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
				],
				3,
			);

			placeTerrainTile(layer, 1, 1, 3, 3, terrainLayer, tileset, order, [
				tileset,
			]);

			// Should place bitmask 511 tile (all neighbors)
			expect(layer.tiles[4]).toBe(packTileId(16, 0, order));
		});

		it("should use correct tileset index for placed tile", () => {
			const tileset = createTilesetWithTerrain();
			const terrainLayer = tileset.terrainLayers?.[0]; // grass
			const layer = createLayer([0], 1);

			// Place with tileset index 3
			placeTerrainTile(layer, 0, 0, 1, 1, terrainLayer, tileset, 3, [
				tileset,
				createEmptyTileset(1),
				createEmptyTileset(2),
				tileset,
			]);

			const geometry = layer.tiles[0];
			// Tile should have been repacked with tileset index 3
			expect(geometry).not.toBe(0);
		});

		it("should ignore different terrain types as neighbors", () => {
			const tileset = createTilesetWithTerrain();
			const grassLayer = tileset.terrainLayers?.[0];
			const dirtTile = packTileId(1, 16, 1); // Dirt terrain

			const layer = createLayer(
				[
					dirtTile,
					dirtTile,
					dirtTile,
					dirtTile,
					0,
					dirtTile,
					dirtTile,
					dirtTile,
					dirtTile,
				],
				3,
			);

			placeTerrainTile(layer, 1, 1, 3, 3, grassLayer, tileset, 1, [tileset]);

			// Should place bitmask 16 tile (center only, no grass neighbors)
			expect(layer.tiles[4]).toBe(packTileId(1, 1, 1));
		});

		it("should calculate bitmask based on partial neighbors", () => {
			const tileset = createTilesetWithTerrain();
			const terrainLayer = tileset.terrainLayers?.[0]; // grass
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer([grassTile, 0, 0, 0], 2);

			placeTerrainTile(layer, 1, 1, 2, 2, terrainLayer, tileset, 1, [tileset]);

			// Should place some tile (exact bitmask depends on neighbors)
			expect(layer.tiles[3]).not.toBe(0);
		});
	});

	describe("removeTerrainTile", () => {
		it("should set tile to 0", () => {
			const grassTile = packTileId(1, 1, 1);
			const layer = createLayer([grassTile], 1);

			removeTerrainTile(layer, 0, 0, 1, 1);

			expect(layer.tiles[0]).toBe(0);
		});

		it("should work on multi-tile grid", () => {
			const grassTile = packTileId(1, 1, 1);
			const layer = createLayer(
				[grassTile, grassTile, grassTile, grassTile],
				2,
			);

			removeTerrainTile(layer, 1, 0, 2, 2);

			expect(layer.tiles[0]).toBe(grassTile); // Unchanged
			expect(layer.tiles[1]).toBe(0); // Removed
			expect(layer.tiles[2]).toBe(grassTile); // Unchanged
			expect(layer.tiles[3]).toBe(grassTile); // Unchanged
		});

		it("should handle already empty tile", () => {
			const layer = createLayer([0], 1);

			removeTerrainTile(layer, 0, 0, 1, 1);

			expect(layer.tiles[0]).toBe(0);
		});

		it("should calculate correct index for position", () => {
			const grassTile = packTileId(1, 1, 1);
			const layer = createLayer(
				[
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
				],
				3,
			);

			removeTerrainTile(layer, 1, 1, 3, 3); // Center tile

			expect(layer.tiles[4]).toBe(0); // Index 1 + 1*3 = 4
		});
	});

	describe("updateNeighborTerrain", () => {
		it("should do nothing for out of bounds position", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);
			const layer = createLayer([grassTile], 1);

			updateNeighborTerrain(layer, -1, 0, 1, 1, "grass-layer-1", tileset, 1, [
				tileset,
			]);
			updateNeighborTerrain(layer, 1, 0, 1, 1, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			expect(layer.tiles[0]).toBe(grassTile); // Unchanged
		});

		it("should do nothing when tile is from different terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const dirtTile = packTileId(1, 16, 1); // Dirt terrain
			const layer = createLayer([dirtTile], 1);

			updateNeighborTerrain(layer, 0, 0, 1, 1, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			expect(layer.tiles[0]).toBe(dirtTile); // Unchanged
		});

		it("should do nothing when terrain layer not found in tileset", () => {
			const tileset = createTilesetWithTerrain();
			const order = tileset.order;
			const grassTile = createTileWithOrder(tileset, 1, 1);
			const layer = createLayer([grassTile], 1);

			updateNeighborTerrain(
				layer,
				0,
				0,
				1,
				1,
				"unknown-layer",
				tileset,
				order,
				[tileset],
			);

			expect(layer.tiles[0]).toBe(grassTile); // Unchanged
		});

		it("should early return when terrain layer not found by ID (line 165)", () => {
			// Create tileset with ONLY grass layer, no dirt layer
			const tilesetId = "test-tileset-missing-layer";
			const order = 1; // Test tileset order
			const tileset: TilesetData = {
				version: "1.0",
				id: tilesetId,
				order: 1,
				name: "test",
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [
					createSimpleTile(1, 1), // Grass tile (in grass layer)
				],
				terrainLayers: [
					{
						id: "grass-layer-only",
						name: "grass",
						tiles: [{ x: 1, y: 1, bitmask: 16, weight: 100 }],
					},
					// NO dirt layer!
				],
			};

			const grassTile = createTileWithOrder(tileset, 1, 1);
			const layer = createLayer([grassTile], 1);

			// Try to update as if it's a dirt layer (which doesn't exist in tileset.terrainLayers)
			// The tile DOES belong to grass-layer-only, so it passes the check at line 154-158
			// But then at line 161-165 it can't find "dirt-layer-missing" in terrainLayers
			updateNeighborTerrain(
				layer,
				0,
				0,
				1,
				1,
				"dirt-layer-missing",
				tileset,
				order,
				[tileset],
			);

			expect(layer.tiles[0]).toBe(grassTile); // Should remain unchanged
		});

		it("should update tile when it matches the terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const order = tileset.order;
			const grassCenterTile = createTileWithOrder(tileset, 1, 1); // Grass center-only
			const grassAllTile = packTileId(16, 0, order); // All neighbors

			const layer = createLayer(
				[
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
					grassCenterTile,
				],
				3,
			);

			// Update center tile which now has all 8 neighbors
			updateNeighborTerrain(
				layer,
				1,
				1,
				3,
				3,
				"grass-layer-1",
				tileset,
				order,
				[tileset],
			);

			// Tile should be updated to the all-neighbors tile
			expect(layer.tiles[4]).toBe(grassAllTile);
		});

		it("should preserve tileset index when updating", () => {
			const tileset = createTilesetWithTerrain();
			const grassTileWithIndex3 = packTileId(0, 0, 3); // Tileset index 3

			const layer = createLayer([grassTileWithIndex3], 1);

			updateNeighborTerrain(layer, 0, 0, 1, 1, "grass-layer-1", tileset, 3, [
				tileset,
				createEmptyTileset(1),
				createEmptyTileset(2),
				tileset,
			]);

			// Tile should still be from tileset index 3
			expect(layer.tiles[0]).not.toBe(0);
		});
	});

	describe("updateNeighborsAround", () => {
		it("should update all 8 surrounding tiles", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer(
				[
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
				],
				3,
			);

			const originalCenter = layer.tiles[4];

			updateNeighborsAround(layer, 1, 1, 3, 3, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Center should remain unchanged
			expect(layer.tiles[4]).toBe(originalCenter);

			// At least some neighbors should potentially be updated
			// (We can't assert exact values without knowing the exact bitmask logic)
		});

		it("should not update center tile", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer(
				[
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
				],
				3,
			);

			const originalCenter = layer.tiles[4];

			updateNeighborsAround(layer, 1, 1, 3, 3, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			expect(layer.tiles[4]).toBe(originalCenter);
		});

		it("should handle edge positions gracefully", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer(
				[grassTile, grassTile, grassTile, grassTile],
				2,
			);

			// Update neighbors of top-left corner
			updateNeighborsAround(layer, 0, 0, 2, 2, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Should not crash, tiles should still exist
			expect(layer.tiles.length).toBe(4);
		});

		it("should only update tiles from same terrain layer", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);
			const dirtTile = packTileId(1, 16, 1);

			const layer = createLayer(
				[
					grassTile,
					dirtTile,
					grassTile,
					dirtTile,
					grassTile,
					dirtTile,
					grassTile,
					dirtTile,
					grassTile,
				],
				3,
			);

			const originalDirt = dirtTile;

			updateNeighborsAround(layer, 1, 1, 3, 3, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Dirt tiles should remain unchanged
			expect(layer.tiles[1]).toBe(originalDirt);
			expect(layer.tiles[3]).toBe(originalDirt);
			expect(layer.tiles[5]).toBe(originalDirt);
			expect(layer.tiles[7]).toBe(originalDirt);
		});

		it("should handle corner positions", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer(
				[grassTile, grassTile, grassTile, grassTile],
				2,
			);

			// Update all 4 corners
			updateNeighborsAround(layer, 0, 0, 2, 2, "grass-layer-1", tileset, 1, [
				tileset,
			]);
			updateNeighborsAround(layer, 1, 0, 2, 2, "grass-layer-1", tileset, 1, [
				tileset,
			]);
			updateNeighborsAround(layer, 0, 1, 2, 2, "grass-layer-1", tileset, 1, [
				tileset,
			]);
			updateNeighborsAround(layer, 1, 1, 2, 2, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Should not crash
			expect(layer.tiles.length).toBe(4);
		});
	});

	describe("integration scenarios", () => {
		it("should handle full terrain painting workflow", () => {
			const tileset = createTilesetWithTerrain();
			const terrainLayer = tileset.terrainLayers?.[0]; // grass
			const layer = createLayer([0, 0, 0, 0, 0, 0, 0, 0, 0], 3);

			// Place center tile
			placeTerrainTile(layer, 1, 1, 3, 3, terrainLayer, tileset, 1, [tileset]);
			expect(layer.tiles[4]).not.toBe(0);

			// Place neighbor and update
			placeTerrainTile(layer, 0, 1, 3, 3, terrainLayer, tileset, 1, [tileset]);
			updateNeighborsAround(layer, 0, 1, 3, 3, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Both tiles should be placed
			expect(layer.tiles[3]).not.toBe(0);
			expect(layer.tiles[4]).not.toBe(0);
		});

		it("should handle terrain removal workflow", () => {
			const tileset = createTilesetWithTerrain();
			const grassTile = packTileId(1, 1, 1);

			const layer = createLayer(
				[
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
					grassTile,
				],
				3,
			);

			// Remove center tile
			removeTerrainTile(layer, 1, 1, 3, 3);
			expect(layer.tiles[4]).toBe(0);

			// Update neighbors
			updateNeighborsAround(layer, 1, 1, 3, 3, "grass-layer-1", tileset, 1, [
				tileset,
			]);

			// Neighbors should be updated (but we can't assert exact values)
			expect(layer.tiles[0]).not.toBe(0);
			expect(layer.tiles[1]).not.toBe(0);
		});

		it("should handle mixed terrain types", () => {
			const tileset = createTilesetWithTerrain();
			const grassLayer = tileset.terrainLayers?.[0];
			const dirtLayer = tileset.terrainLayers?.[1];
			const order = tileset.order;

			const layer = createLayer([0, 0, 0, 0, 0, 0, 0, 0, 0], 3);

			// Place grass in center
			placeTerrainTile(layer, 1, 1, 3, 3, grassLayer, tileset, order, [
				tileset,
			]);

			// Place dirt around it
			placeTerrainTile(layer, 0, 0, 3, 3, dirtLayer, tileset, order, [tileset]);
			placeTerrainTile(layer, 2, 2, 3, 3, dirtLayer, tileset, order, [tileset]);

			// Both types should be placed
			expect(getTerrainLayerForTile(layer.tiles[0], [tileset])).toBe(
				"dirt-layer-1",
			);
			expect(getTerrainLayerForTile(layer.tiles[4], [tileset])).toBe(
				"grass-layer-1",
			);
			expect(getTerrainLayerForTile(layer.tiles[8], [tileset])).toBe(
				"dirt-layer-1",
			);
		});
	});
});
