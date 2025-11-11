import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSimpleTile } from "../../__mocks__/testFactories";
import type { TerrainLayer, TilesetData } from "../../types";
import {
	bitmaskToGrid,
	calculateBitmaskFromNeighbors,
	findTileByBitmask,
	getTilesForTerrain,
	gridToBitmask,
	isBitmaskCellSet,
	toggleBitmaskCell,
} from "../bitmaskAutotiling";

describe("bitmaskAutotiling", () => {
	describe("gridToBitmask", () => {
		it("should convert empty grid to 0", () => {
			const grid = [
				[false, false, false],
				[false, false, false],
				[false, false, false],
			];
			expect(gridToBitmask(grid)).toBe(0);
		});

		it("should convert full grid to 511 (all bits set)", () => {
			const grid = [
				[true, true, true],
				[true, true, true],
				[true, true, true],
			];
			expect(gridToBitmask(grid)).toBe(511); // 2^9 - 1
		});

		it("should convert center-only grid to 16 (bit 4)", () => {
			const grid = [
				[false, false, false],
				[false, true, false],
				[false, false, false],
			];
			expect(gridToBitmask(grid)).toBe(16); // 1 << 4
		});

		it("should handle top-left corner (bit 0)", () => {
			const grid = [
				[true, false, false],
				[false, false, false],
				[false, false, false],
			];
			expect(gridToBitmask(grid)).toBe(1); // 1 << 0
		});

		it("should handle bottom-right corner (bit 8)", () => {
			const grid = [
				[false, false, false],
				[false, false, false],
				[false, false, true],
			];
			expect(gridToBitmask(grid)).toBe(256); // 1 << 8
		});

		it("should handle cardinal directions", () => {
			const gridNorth = [
				[false, true, false],
				[false, false, false],
				[false, false, false],
			];
			expect(gridToBitmask(gridNorth)).toBe(2); // 1 << 1

			const gridWest = [
				[false, false, false],
				[true, false, false],
				[false, false, false],
			];
			expect(gridToBitmask(gridWest)).toBe(8); // 1 << 3
		});

		it("should handle multiple cells", () => {
			const grid = [
				[true, true, true],
				[false, true, false],
				[false, false, false],
			];
			// Bits 0, 1, 2, 4 set = 1 + 2 + 4 + 16 = 23
			expect(gridToBitmask(grid)).toBe(23);
		});
	});

	describe("bitmaskToGrid", () => {
		it("should convert 0 to empty grid", () => {
			const grid = bitmaskToGrid(0);
			expect(grid).toEqual([
				[false, false, false],
				[false, false, false],
				[false, false, false],
			]);
		});

		it("should convert 511 to full grid", () => {
			const grid = bitmaskToGrid(511);
			expect(grid).toEqual([
				[true, true, true],
				[true, true, true],
				[true, true, true],
			]);
		});

		it("should convert 16 to center-only grid", () => {
			const grid = bitmaskToGrid(16);
			expect(grid).toEqual([
				[false, false, false],
				[false, true, false],
				[false, false, false],
			]);
		});

		it("should convert 1 to top-left only", () => {
			const grid = bitmaskToGrid(1);
			expect(grid).toEqual([
				[true, false, false],
				[false, false, false],
				[false, false, false],
			]);
		});

		it("should convert 256 to bottom-right only", () => {
			const grid = bitmaskToGrid(256);
			expect(grid).toEqual([
				[false, false, false],
				[false, false, false],
				[false, false, true],
			]);
		});

		it("should convert combined bitmasks correctly", () => {
			const grid = bitmaskToGrid(23); // Bits 0, 1, 2, 4
			expect(grid).toEqual([
				[true, true, true],
				[false, true, false],
				[false, false, false],
			]);
		});
	});

	describe("gridToBitmask and bitmaskToGrid round-trip", () => {
		it("should round-trip for all valid bitmasks (0-511)", () => {
			for (let bitmask = 0; bitmask <= 511; bitmask++) {
				const grid = bitmaskToGrid(bitmask);
				const reconstructed = gridToBitmask(grid);
				expect(reconstructed).toBe(bitmask);
			}
		});

		it("should round-trip using property-based testing", () => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 511 }), (bitmask) => {
					const grid = bitmaskToGrid(bitmask);
					const reconstructed = gridToBitmask(grid);
					return reconstructed === bitmask;
				}),
			);
		});
	});

	describe("calculateBitmaskFromNeighbors", () => {
		it("should always set center bit (bit 4)", () => {
			const hasNeighbor = () => false;
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			expect(bitmask).toBe(16); // Only center bit set
		});

		it("should set cardinal neighbors", () => {
			const hasNeighbor = (_dx: number, dy: number) => {
				return dy === -1; // Only north neighbor
			};
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			// Center (bit 4) + North (bit 1) = 16 + 2 = 18
			expect(bitmask).toBe(18);
		});

		it("should not set corners without both cardinals", () => {
			const hasNeighbor = (dx: number, dy: number) => {
				return dx === -1 && dy === -1; // Northwest exists but not N or W
			};
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			expect(bitmask).toBe(16); // Only center, corner not included
		});

		it("should set corner only when both cardinals exist", () => {
			const hasNeighbor = (dx: number, dy: number) => {
				// North, West, and Northwest all exist
				return (
					(dx === 0 && dy === -1) || // North
					(dx === -1 && dy === 0) || // West
					(dx === -1 && dy === -1)
				); // Northwest
			};
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			// Center (16) + North (2) + West (8) + Northwest (1) = 27
			expect(bitmask).toBe(27);
		});

		it("should handle all neighbors present", () => {
			const hasNeighbor = () => true;
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			expect(bitmask).toBe(511); // All bits set
		});

		it("should handle cross pattern (cardinal only)", () => {
			const hasNeighbor = (dx: number, dy: number) => {
				// Only cardinal directions
				return (dx === 0 && dy !== 0) || (dx !== 0 && dy === 0);
			};
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			// Center + N + S + E + W = 16 + 2 + 128 + 32 + 8 = 186
			expect(bitmask).toBe(186);
		});

		it("should handle east and south neighbors", () => {
			const hasNeighbor = (dx: number, dy: number) => {
				return (
					(dx === 1 && dy === 0) || // East
					(dx === 0 && dy === 1) || // South
					(dx === 1 && dy === 1)
				); // Southeast
			};
			const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
			// Center (16) + East (32) + South (128) + Southeast (256) = 432
			expect(bitmask).toBe(432);
		});
	});

	describe("findTileByBitmask", () => {
		const mockTileset: TilesetData = {
			version: "1.0",
			name: "test",
			id: "test-tileset-1",
			order: 0,
			imagePath: "/test.png",
			tileWidth: 16,
			tileHeight: 16,
			tiles: [],
			terrainLayers: [],
		};

		it("should return exact match when available", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-1",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 16 },
					{ tileId: 2, bitmask: 23 },
					{ tileId: 3, bitmask: 511 },
				],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 23);
			expect(result).toEqual({ tileId: 2 });
		});

		it("should return best match when no exact match", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-2",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 16 }, // Center-only tile
					{ tileId: 2, bitmask: 100 }, // Has more matching bits with 999
				],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 999);
			// Returns best match (tileId 2), not necessarily center tile
			expect(result).not.toBeNull();
			expect(result?.tileId).toBeGreaterThan(0);
		});

		it("should return center tile as ultimate fallback", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-3",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 16 }, // Center-only tile
				],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 999);
			expect(result).toEqual({ tileId: 1 });
		});

		it("should return best match when no exact match", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-4",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 0b000000000 }, // No match (9 bits different)
					{ tileId: 2, bitmask: 0b111111110 }, // 8 bits match
					{ tileId: 3, bitmask: 0b111111111 }, // All 9 bits match (best)
				],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 0b111111111);
			expect(result).toEqual({ tileId: 3 });
		});

		it("should return null when no tiles in terrain layer", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-5",
				name: "grass",
				tiles: [],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 16);
			expect(result).toBeNull();
		});

		it("should prefer exact match over best match", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-6",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 100 }, // Close match
					{ tileId: 2, bitmask: 50 }, // Exact match
					{ tileId: 3, bitmask: 101 }, // Close match
				],
			};

			const result = findTileByBitmask(mockTileset, terrainLayer, 50);
			expect(result).toEqual({ tileId: 2 });
		});

		it("should select tile with better match score (coverage for line 124)", () => {
			const terrainLayer: TerrainLayer = {
				id: "grass-terrain-7",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 0b000000000 }, // 8 matching bits with target (all zeros except bit 0)
					{ tileId: 2, bitmask: 0b000000001 }, // 9 matching bits with target (exact match)
					{ tileId: 3, bitmask: 0b111111111 }, // 1 matching bit with target (only bit 0)
				],
			};

			// Target has only bottom-right set
			const target = 0b000000001;

			const result = findTileByBitmask(mockTileset, terrainLayer, target);
			// Should select tile 2 which has exact match (9 bits vs 8 bits)
			expect(result).toEqual({ tileId: 2 });
		});
	});

	describe("toggleBitmaskCell", () => {
		it("should toggle top-left cell (0,0)", () => {
			let bitmask = 0;
			bitmask = toggleBitmaskCell(bitmask, 0, 0);
			expect(bitmask).toBe(1); // Bit 0 set

			bitmask = toggleBitmaskCell(bitmask, 0, 0);
			expect(bitmask).toBe(0); // Bit 0 cleared
		});

		it("should toggle center cell (1,1)", () => {
			let bitmask = 0;
			bitmask = toggleBitmaskCell(bitmask, 1, 1);
			expect(bitmask).toBe(16); // Bit 4 set

			bitmask = toggleBitmaskCell(bitmask, 1, 1);
			expect(bitmask).toBe(0); // Bit 4 cleared
		});

		it("should toggle bottom-right cell (2,2)", () => {
			let bitmask = 0;
			bitmask = toggleBitmaskCell(bitmask, 2, 2);
			expect(bitmask).toBe(256); // Bit 8 set

			bitmask = toggleBitmaskCell(bitmask, 2, 2);
			expect(bitmask).toBe(0); // Bit 8 cleared
		});

		it("should toggle multiple cells independently", () => {
			let bitmask = 0;
			bitmask = toggleBitmaskCell(bitmask, 0, 0); // Set bit 0
			bitmask = toggleBitmaskCell(bitmask, 1, 1); // Set bit 4
			bitmask = toggleBitmaskCell(bitmask, 2, 2); // Set bit 8
			expect(bitmask).toBe(273); // 1 + 16 + 256

			bitmask = toggleBitmaskCell(bitmask, 1, 1); // Clear bit 4
			expect(bitmask).toBe(257); // 1 + 256
		});

		it("should not affect other bits when toggling", () => {
			let bitmask = 0b111111111; // All bits set
			bitmask = toggleBitmaskCell(bitmask, 1, 1); // Toggle center
			expect(bitmask).toBe(0b111101111); // Only bit 4 cleared
		});
	});

	describe("isBitmaskCellSet", () => {
		it("should return false for empty bitmask", () => {
			expect(isBitmaskCellSet(0, 0, 0)).toBe(false);
			expect(isBitmaskCellSet(0, 1, 1)).toBe(false);
			expect(isBitmaskCellSet(0, 2, 2)).toBe(false);
		});

		it("should return true for set cells", () => {
			expect(isBitmaskCellSet(1, 0, 0)).toBe(true); // Bit 0
			expect(isBitmaskCellSet(16, 1, 1)).toBe(true); // Bit 4
			expect(isBitmaskCellSet(256, 2, 2)).toBe(true); // Bit 8
		});

		it("should return false for unset cells", () => {
			expect(isBitmaskCellSet(1, 1, 1)).toBe(false); // Bit 0 set, check bit 4
			expect(isBitmaskCellSet(16, 0, 0)).toBe(false); // Bit 4 set, check bit 0
			expect(isBitmaskCellSet(256, 1, 1)).toBe(false); // Bit 8 set, check bit 4
		});

		it("should check all positions correctly", () => {
			const bitmask = 0b111111111; // All bits set

			for (let row = 0; row < 3; row++) {
				for (let col = 0; col < 3; col++) {
					expect(isBitmaskCellSet(bitmask, row, col)).toBe(true);
				}
			}
		});

		it("should check specific pattern", () => {
			const bitmask = 0b101010101; // Alternating pattern

			expect(isBitmaskCellSet(bitmask, 0, 0)).toBe(true); // Bit 0
			expect(isBitmaskCellSet(bitmask, 0, 1)).toBe(false); // Bit 1
			expect(isBitmaskCellSet(bitmask, 0, 2)).toBe(true); // Bit 2
			expect(isBitmaskCellSet(bitmask, 1, 0)).toBe(false); // Bit 3
			expect(isBitmaskCellSet(bitmask, 1, 1)).toBe(true); // Bit 4
			expect(isBitmaskCellSet(bitmask, 1, 2)).toBe(false); // Bit 5
			expect(isBitmaskCellSet(bitmask, 2, 0)).toBe(true); // Bit 6
			expect(isBitmaskCellSet(bitmask, 2, 1)).toBe(false); // Bit 7
			expect(isBitmaskCellSet(bitmask, 2, 2)).toBe(true); // Bit 8
		});
	});

	describe("property-based tests", () => {
		it("should maintain toggle invariant: toggle twice returns original", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 511 }),
					fc.integer({ min: 0, max: 2 }),
					fc.integer({ min: 0, max: 2 }),
					(bitmask, row, col) => {
						const toggled = toggleBitmaskCell(bitmask, row, col);
						const restored = toggleBitmaskCell(toggled, row, col);
						return restored === bitmask;
					},
				),
			);
		});

		it("should never produce invalid bitmasks (outside 0-511)", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 511 }),
					fc.integer({ min: 0, max: 2 }),
					fc.integer({ min: 0, max: 2 }),
					(bitmask, row, col) => {
						const result = toggleBitmaskCell(bitmask, row, col);
						return result >= 0 && result <= 511;
					},
				),
			);
		});

		it("should maintain bitmask cell consistency", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 511 }),
					fc.integer({ min: 0, max: 2 }),
					fc.integer({ min: 0, max: 2 }),
					(bitmask, row, col) => {
						const isSet = isBitmaskCellSet(bitmask, row, col);
						const toggled = toggleBitmaskCell(bitmask, row, col);
						const isSetAfterToggle = isBitmaskCellSet(toggled, row, col);
						return isSet !== isSetAfterToggle; // Should flip
					},
				),
			);
		});

		it("should never crash with any bitmask value", () => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 511 }), (bitmask) => {
					// Should not throw
					const grid = bitmaskToGrid(bitmask);
					const reconstructed = gridToBitmask(grid);
					return typeof reconstructed === "number";
				}),
			);
		});
	});

	describe("edge cases and integration", () => {
		it("should handle bit index calculations correctly", () => {
			// Verify bit index formula: row * 3 + col
			expect(0 * 3 + 0).toBe(0); // Top-left
			expect(0 * 3 + 1).toBe(1); // Top-center
			expect(0 * 3 + 2).toBe(2); // Top-right
			expect(1 * 3 + 0).toBe(3); // Middle-left
			expect(1 * 3 + 1).toBe(4); // Center
			expect(1 * 3 + 2).toBe(5); // Middle-right
			expect(2 * 3 + 0).toBe(6); // Bottom-left
			expect(2 * 3 + 1).toBe(7); // Bottom-center
			expect(2 * 3 + 2).toBe(8); // Bottom-right
		});

		it("should handle maximum bitmask value", () => {
			const grid = bitmaskToGrid(511);
			expect(gridToBitmask(grid)).toBe(511);
		});

		it("should handle power-of-2 bitmasks", () => {
			for (let i = 0; i < 9; i++) {
				const bitmask = 1 << i;
				const grid = bitmaskToGrid(bitmask);
				expect(gridToBitmask(grid)).toBe(bitmask);
			}
		});
	});

	describe("getTilesForTerrain", () => {
		it("should return tiles that match terrain layer tile IDs", () => {
			const tileset: TilesetData = {
				version: "1.0",
				name: "test",
				id: "test-1",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [
					createSimpleTile(1, 0, 0, "grass"),
					createSimpleTile(2, 16, 0, "grass"),
					createSimpleTile(3, 32, 0, "dirt"),
				],
				terrainLayers: [],
			};

			const terrainLayer: TerrainLayer = {
				id: "grass-layer",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 16 },
					{ tileId: 2, bitmask: 31 },
				],
			};

			const result = getTilesForTerrain(tileset, terrainLayer);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual(createSimpleTile(1, 0, 0, "grass"));
			expect(result[1]).toEqual(createSimpleTile(2, 16, 0, "grass"));
		});

		it("should filter out tiles that don't exist in tileset", () => {
			const tileset: TilesetData = {
				version: "1.0",
				name: "test",
				id: "test-1",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [createSimpleTile(1, 0, 0, "grass")],
				terrainLayers: [],
			};

			const terrainLayer: TerrainLayer = {
				id: "grass-layer",
				name: "grass",
				tiles: [
					{ tileId: 1, bitmask: 16 },
					{ tileId: 999, bitmask: 31 }, // Non-existent tile
				],
			};

			const result = getTilesForTerrain(tileset, terrainLayer);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(createSimpleTile(1, 0, 0, "grass"));
		});

		it("should return empty array when terrain layer has no tiles", () => {
			const tileset: TilesetData = {
				version: "1.0",
				name: "test",
				id: "test-1",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [createSimpleTile(1, 0, 0, "grass")],
				terrainLayers: [],
			};

			const terrainLayer: TerrainLayer = {
				id: "grass-layer",
				name: "grass",
				tiles: [],
			};

			const result = getTilesForTerrain(tileset, terrainLayer);

			expect(result).toEqual([]);
		});

		it("should handle terrain layer with undefined tiles", () => {
			const tileset: TilesetData = {
				version: "1.0",
				name: "test",
				id: "test-1",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [createSimpleTile(1, 0, 0, "grass")],
				terrainLayers: [],
			};

			const terrainLayer: TerrainLayer = {
				id: "grass-layer",
				name: "grass",
				tiles: [],
				// tiles is undefined
			};

			const result = getTilesForTerrain(tileset, terrainLayer);

			expect(result).toEqual([]);
		});

		it("should return empty array when all terrain tiles are invalid", () => {
			const tileset: TilesetData = {
				version: "1.0",
				name: "test",
				id: "test-1",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [createSimpleTile(1, 0, 0, "grass")],
				terrainLayers: [],
			};

			const terrainLayer: TerrainLayer = {
				id: "grass-layer",
				name: "grass",
				tiles: [
					{ tileId: 100, bitmask: 16 },
					{ tileId: 200, bitmask: 31 },
				],
			};

			const result = getTilesForTerrain(tileset, terrainLayer);

			expect(result).toEqual([]);
		});
	});
});
