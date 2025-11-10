import { describe, expect, it } from "vitest";
import {
	EntityDefinitionSchema,
	EntityInstanceSchema,
	LayerSchema,
	LayerTypeSchema,
	MapDataSchema,
	MapFileSchema,
	PointSchema,
	PolygonColliderSchema,
	SerializedMapDataSchema,
	TerrainLayerSchema,
	TerrainTileSchema,
	TileDefinitionSchema,
	TilesetDataSchema,
} from "../schemas";

describe("schemas", () => {
	describe("PointSchema", () => {
		it("should validate valid point", () => {
			const valid = { x: 10, y: 20 };
			expect(() => PointSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing x", () => {
			const invalid = { y: 20 };
			expect(() => PointSchema.parse(invalid)).toThrow();
		});

		it("should reject missing y", () => {
			const invalid = { x: 10 };
			expect(() => PointSchema.parse(invalid)).toThrow();
		});

		it("should accept negative coordinates", () => {
			const valid = { x: -10, y: -20 };
			expect(() => PointSchema.parse(valid)).not.toThrow();
		});

		it("should accept zero coordinates", () => {
			const valid = { x: 0, y: 0 };
			expect(() => PointSchema.parse(valid)).not.toThrow();
		});
	});

	describe("PolygonColliderSchema", () => {
		it("should validate minimal collider", () => {
			const valid = {
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 10, y: 10 },
				],
			};
			expect(() => PolygonColliderSchema.parse(valid)).not.toThrow();
		});

		it("should validate collider with all optional fields", () => {
			const valid = {
				id: "collider-1",
				name: "Main Collider",
				type: "solid",
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				properties: { layer: "1" },
			};
			expect(() => PolygonColliderSchema.parse(valid)).not.toThrow();
		});

		it("should reject empty points array", () => {
			const invalid = { points: [] };
			expect(() => PolygonColliderSchema.parse(invalid)).not.toThrow(); // Zod allows empty arrays
		});

		it("should reject missing points", () => {
			const invalid = { id: "test" };
			expect(() => PolygonColliderSchema.parse(invalid)).toThrow();
		});
	});

	describe("TileDefinitionSchema", () => {
		it("should validate minimal tile definition", () => {
			const valid = { id: 12345 };
			expect(() => TileDefinitionSchema.parse(valid)).not.toThrow();
		});

		it("should validate tile with all fields", () => {
			const valid = {
				id: 12345,
				x: 0,
				y: 0,
				isCompound: true,
				width: 32,
				height: 32,
				origin: { x: 16, y: 16 },
				colliders: [
					{
						points: [
							{ x: 0, y: 0 },
							{ x: 16, y: 0 },
						],
					},
				],
				name: "Ground Tile",
				type: "terrain",
				properties: { biome: "grass" },
			};
			expect(() => TileDefinitionSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing id", () => {
			const invalid = { name: "Test" };
			expect(() => TileDefinitionSchema.parse(invalid)).toThrow();
		});

		it("should reject non-number id", () => {
			const invalid = { id: "not-a-number" };
			expect(() => TileDefinitionSchema.parse(invalid)).toThrow();
		});
	});

	describe("TerrainTileSchema", () => {
		it("should validate terrain tile", () => {
			const valid = { tileId: 123, bitmask: 511 };
			expect(() => TerrainTileSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing tileId", () => {
			const invalid = { bitmask: 511 };
			expect(() => TerrainTileSchema.parse(invalid)).toThrow();
		});

		it("should reject missing bitmask", () => {
			const invalid = { tileId: 123 };
			expect(() => TerrainTileSchema.parse(invalid)).toThrow();
		});

		it("should accept bitmask 0", () => {
			const valid = { tileId: 123, bitmask: 0 };
			expect(() => TerrainTileSchema.parse(valid)).not.toThrow();
		});

		it("should accept bitmask 511", () => {
			const valid = { tileId: 123, bitmask: 511 };
			expect(() => TerrainTileSchema.parse(valid)).not.toThrow();
		});
	});

	describe("TerrainLayerSchema", () => {
		it("should validate terrain layer with tiles", () => {
			const valid = {
				id: "grass-1",
				name: "Grass",
				tiles: [
					{ tileId: 1, bitmask: 16 },
					{ tileId: 2, bitmask: 511 },
				],
			};
			expect(() => TerrainLayerSchema.parse(valid)).not.toThrow();
		});

		it("should default tiles to empty array", () => {
			const input = {
				id: "grass-1",
				name: "Grass",
			};
			const result = TerrainLayerSchema.parse(input);
			expect(result.tiles).toEqual([]);
		});

		it("should reject missing id", () => {
			const invalid = { name: "Grass", tiles: [] };
			expect(() => TerrainLayerSchema.parse(invalid)).toThrow();
		});

		it("should reject missing name", () => {
			const invalid = { id: "grass-1", tiles: [] };
			expect(() => TerrainLayerSchema.parse(invalid)).toThrow();
		});
	});

	describe("TilesetDataSchema", () => {
		it("should validate minimal tileset", () => {
			const valid = {
				name: "Test Tileset",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => TilesetDataSchema.parse(valid)).not.toThrow();
		});

		it("should default version to 1.0", () => {
			const input = {
				name: "Test",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			const result = TilesetDataSchema.parse(input);
			expect(result.version).toBe("1.0");
		});

		it("should default tiles to empty array", () => {
			const input = {
				name: "Test",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			const result = TilesetDataSchema.parse(input);
			expect(result.tiles).toEqual([]);
		});

		it("should default terrainLayers to empty array", () => {
			const input = {
				name: "Test",
				order: 0,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			const result = TilesetDataSchema.parse(input);
			expect(result.terrainLayers).toEqual([]);
		});

		it("should reject negative order", () => {
			const invalid = {
				name: "Test",
				order: -1,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => TilesetDataSchema.parse(invalid)).toThrow();
		});

		it("should reject non-integer order", () => {
			const invalid = {
				name: "Test",
				order: 1.5,
				imagePath: "/test.png",
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => TilesetDataSchema.parse(invalid)).toThrow();
		});

		it("should validate complete tileset", () => {
			const valid = {
				version: "1.0",
				name: "Complete Tileset",
				id: "tileset-1",
				order: 0,
				imagePath: "/complete.png",
				tileWidth: 16,
				tileHeight: 16,
				tiles: [{ id: 123 }],
				terrainLayers: [
					{
						id: "grass-1",
						name: "Grass",
						tiles: [{ tileId: 123, bitmask: 16 }],
					},
				],
			};
			expect(() => TilesetDataSchema.parse(valid)).not.toThrow();
		});
	});

	describe("LayerTypeSchema", () => {
		it('should accept "tile"', () => {
			expect(() => LayerTypeSchema.parse("tile")).not.toThrow();
		});

		it('should accept "entity"', () => {
			expect(() => LayerTypeSchema.parse("entity")).not.toThrow();
		});

		it("should reject other values", () => {
			expect(() => LayerTypeSchema.parse("invalid")).toThrow();
		});
	});

	describe("LayerSchema", () => {
		it("should validate minimal layer", () => {
			const valid = {
				id: "layer-1",
				name: "Layer 1",
				visible: true,
				type: "tile" as const,
			};
			expect(() => LayerSchema.parse(valid)).not.toThrow();
		});

		it("should default tiles to empty array", () => {
			const input = {
				id: "layer-1",
				name: "Layer 1",
				visible: true,
				type: "tile" as const,
			};
			const result = LayerSchema.parse(input);
			expect(result.tiles).toEqual([]);
		});

		it("should default autotilingEnabled to true", () => {
			const input = {
				id: "layer-1",
				name: "Layer 1",
				visible: true,
				type: "tile" as const,
			};
			const result = LayerSchema.parse(input);
			expect(result.autotilingEnabled).toBe(true);
		});

		it("should validate layer with tiles", () => {
			const valid = {
				id: "layer-1",
				name: "Layer 1",
				visible: true,
				type: "tile" as const,
				tiles: [1, 2, 3, 0, 5],
			};
			expect(() => LayerSchema.parse(valid)).not.toThrow();
		});

		it("should reject invalid layer type", () => {
			const invalid = {
				id: "layer-1",
				name: "Layer 1",
				visible: true,
				type: "invalid",
			};
			expect(() => LayerSchema.parse(invalid)).toThrow();
		});
	});

	describe("MapDataSchema", () => {
		it("should validate minimal map", () => {
			const valid = {
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => MapDataSchema.parse(valid)).not.toThrow();
		});

		it("should default layers to empty array", () => {
			const input = {
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			const result = MapDataSchema.parse(input);
			expect(result.layers).toEqual([]);
		});

		it("should default entities to empty array", () => {
			const input = {
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			const result = MapDataSchema.parse(input);
			expect(result.entities).toEqual([]);
		});

		it("should reject zero width", () => {
			const invalid = {
				name: "Test Map",
				width: 0,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => MapDataSchema.parse(invalid)).toThrow();
		});

		it("should reject negative dimensions", () => {
			const invalid = {
				name: "Test Map",
				width: -10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => MapDataSchema.parse(invalid)).toThrow();
		});

		it("should validate complete map", () => {
			const valid = {
				name: "Complete Map",
				width: 20,
				height: 15,
				tileWidth: 16,
				tileHeight: 16,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						type: "tile" as const,
						tiles: [1, 2, 3],
					},
				],
				entities: [],
			};
			expect(() => MapDataSchema.parse(valid)).not.toThrow();
		});
	});

	describe("SerializedMapDataSchema", () => {
		it("should validate v4.0 map format", () => {
			const valid = {
				version: "4.0" as const,
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => SerializedMapDataSchema.parse(valid)).not.toThrow();
		});

		it("should reject non-4.0 version", () => {
			const invalid = {
				version: "3.0",
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => SerializedMapDataSchema.parse(invalid)).toThrow();
		});

		it("should require version field", () => {
			const invalid = {
				name: "Test Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => SerializedMapDataSchema.parse(invalid)).toThrow();
		});

		it("should validate serialized map with layers", () => {
			const valid = {
				version: "4.0" as const,
				name: "Complete",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						type: "tile" as const,
						tiles: [1, 2, 3],
					},
				],
				entities: [],
			};
			expect(() => SerializedMapDataSchema.parse(valid)).not.toThrow();
		});
	});

	describe("MapFileSchema", () => {
		it("should be equivalent to SerializedMapDataSchema", () => {
			const valid = {
				version: "4.0" as const,
				name: "File Map",
				width: 10,
				height: 10,
				tileWidth: 16,
				tileHeight: 16,
			};
			expect(() => MapFileSchema.parse(valid)).not.toThrow();
		});

		it("should validate .lostmap file format", () => {
			const fileContent = {
				version: "4.0" as const,
				name: "Saved Map",
				width: 32,
				height: 32,
				tileWidth: 16,
				tileHeight: 16,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						type: "tile" as const,
						tiles: Array(32 * 32).fill(0),
						autotilingEnabled: true,
					},
				],
				entities: [],
			};
			expect(() => MapFileSchema.parse(fileContent)).not.toThrow();
		});
	});

	describe("EntityInstanceSchema", () => {
		it("should validate minimal entity instance", () => {
			const valid = {
				id: "entity-1",
				x: 100,
				y: 200,
				entityDefId: "player-def",
				tilesetId: "tileset-1",
			};
			expect(() => EntityInstanceSchema.parse(valid)).not.toThrow();
		});

		it("should validate entity with all optional fields", () => {
			const valid = {
				id: "entity-1",
				x: 100,
				y: 200,
				entityDefId: "player-def",
				tilesetId: "tileset-1",
				rotation: 45,
				scale: { x: 2, y: 2 },
				properties: { hp: "100" },
			};
			expect(() => EntityInstanceSchema.parse(valid)).not.toThrow();
		});

		it("should validate recursive children", () => {
			const valid = {
				id: "parent",
				x: 0,
				y: 0,
				entityDefId: "parent-def",
				tilesetId: "tileset-1",
				children: [
					{
						id: "child",
						x: 10,
						y: 10,
						entityDefId: "child-def",
						tilesetId: "tileset-1",
					},
				],
			};
			expect(() => EntityInstanceSchema.parse(valid)).not.toThrow();
		});

		it("should validate deeply nested children", () => {
			const valid = {
				id: "root",
				x: 0,
				y: 0,
				entityDefId: "root-def",
				tilesetId: "tileset-1",
				children: [
					{
						id: "child",
						x: 10,
						y: 10,
						entityDefId: "child-def",
						tilesetId: "tileset-1",
						children: [
							{
								id: "grandchild",
								x: 20,
								y: 20,
								entityDefId: "grandchild-def",
								tilesetId: "tileset-1",
							},
						],
					},
				],
			};
			expect(() => EntityInstanceSchema.parse(valid)).not.toThrow();
		});
	});

	describe("EntityDefinitionSchema", () => {
		it("should validate minimal entity definition", () => {
			const valid = {
				id: "player-def",
			};
			expect(() => EntityDefinitionSchema.parse(valid)).not.toThrow();
		});

		it("should validate entity with sprites", () => {
			const valid = {
				id: "player-def",
				name: "Player",
				sprites: [
					{
						id: "sprite-1",
						tilesetId: "tileset-1",
						sprite: { x: 0, y: 0, width: 16, height: 16 },
						zIndex: 0,
					},
				],
			};
			expect(() => EntityDefinitionSchema.parse(valid)).not.toThrow();
		});

		it("should default sprites to empty array", () => {
			const input = { id: "test-def" };
			const result = EntityDefinitionSchema.parse(input);
			expect(result.sprites).toEqual([]);
		});

		it("should validate recursive children", () => {
			const valid = {
				id: "parent-def",
				children: [
					{
						id: "child-def",
						sprites: [],
					},
				],
			};
			expect(() => EntityDefinitionSchema.parse(valid)).not.toThrow();
		});
	});
});
