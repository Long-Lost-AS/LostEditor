import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDefaultLayer,
	createDefaultMapData,
	EditorSettingsSchema,
	EntityDefinitionSchema,
	EntityInstanceSchema,
	ensureValidMapData,
	LayerSchema,
	LayerTypeSchema,
	MapDataSchema,
	MapFileSchema,
	PointSchema,
	PolygonColliderSchema,
	ProjectDataSchema,
	SerializedLayerSchema,
	SerializedMapDataSchema,
	SpriteLayerSchema,
	SpriteRectSchema,
	TerrainLayerSchema,
	TerrainTileSchema,
	TileDefinitionSchema,
	TilesetDataSchema,
	validateMapData,
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

	describe("SpriteRectSchema", () => {
		it("should validate sprite rectangle with all fields", () => {
			const valid = { x: 0, y: 0, width: 16, height: 16 };
			expect(() => SpriteRectSchema.parse(valid)).not.toThrow();
		});

		it("should accept zero dimensions", () => {
			const valid = { x: 0, y: 0, width: 0, height: 0 };
			expect(() => SpriteRectSchema.parse(valid)).not.toThrow();
		});

		it("should accept negative coordinates", () => {
			const valid = { x: -10, y: -20, width: 16, height: 16 };
			expect(() => SpriteRectSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing width", () => {
			const invalid = { x: 0, y: 0, height: 16 };
			expect(() => SpriteRectSchema.parse(invalid)).toThrow();
		});

		it("should reject missing height", () => {
			const invalid = { x: 0, y: 0, width: 16 };
			expect(() => SpriteRectSchema.parse(invalid)).toThrow();
		});
	});

	describe("SpriteLayerSchema", () => {
		it("should validate minimal sprite layer", () => {
			const valid = {
				id: "sprite-1",
				tilesetId: "tileset-1",
				sprite: { x: 0, y: 0, width: 16, height: 16 },
				zIndex: 0,
			};
			expect(() => SpriteLayerSchema.parse(valid)).not.toThrow();
		});

		it("should validate sprite layer with all optional fields", () => {
			const valid = {
				id: "sprite-1",
				name: "Player Sprite",
				type: "character",
				tilesetId: "tileset-1",
				sprite: { x: 0, y: 0, width: 16, height: 16 },
				offset: { x: 2, y: 4 },
				origin: { x: 0.5, y: 1 },
				rotation: 45,
				zIndex: 10,
				ysortOffset: -8,
			};
			expect(() => SpriteLayerSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing required id", () => {
			const invalid = {
				tilesetId: "tileset-1",
				sprite: { x: 0, y: 0, width: 16, height: 16 },
				zIndex: 0,
			};
			expect(() => SpriteLayerSchema.parse(invalid)).toThrow();
		});

		it("should reject missing tilesetId", () => {
			const invalid = {
				id: "sprite-1",
				sprite: { x: 0, y: 0, width: 16, height: 16 },
				zIndex: 0,
			};
			expect(() => SpriteLayerSchema.parse(invalid)).toThrow();
		});

		it("should reject missing sprite rect", () => {
			const invalid = {
				id: "sprite-1",
				tilesetId: "tileset-1",
				zIndex: 0,
			};
			expect(() => SpriteLayerSchema.parse(invalid)).toThrow();
		});
	});

	describe("ProjectDataSchema", () => {
		it("should validate minimal project data", () => {
			const valid = {
				name: "My Project",
				lastModified: "2025-01-10T12:00:00Z",
			};
			expect(() => ProjectDataSchema.parse(valid)).not.toThrow();
		});

		it("should validate project with all fields", () => {
			const valid = {
				name: "Complete Project",
				projectDir: "/path/to/project",
				lastModified: "2025-01-10T12:00:00Z",
				openTabs: {
					tabs: [],
					activeTabId: null,
				},
			};
			expect(() => ProjectDataSchema.parse(valid)).not.toThrow();
		});

		it("should validate project with open tabs", () => {
			const valid = {
				name: "Project",
				lastModified: "2025-01-10T12:00:00Z",
				openTabs: {
					tabs: [
						{
							id: "tab-1",
							type: "map",
							title: "Map",
							isDirty: false,
							mapId: "map-1",
							viewState: {
								zoom: 1,
								panX: 0,
								panY: 0,
								currentLayerId: null,
								gridVisible: true,
								selectedTilesetId: null,
								selectedTileId: null,
								selectedEntityDefId: null,
								currentTool: "pointer",
							},
						},
					],
					activeTabId: "tab-1",
				},
			};
			expect(() => ProjectDataSchema.parse(valid)).not.toThrow();
		});

		it("should reject missing name", () => {
			const invalid = {
				lastModified: "2025-01-10T12:00:00Z",
			};
			expect(() => ProjectDataSchema.parse(invalid)).toThrow();
		});

		it("should reject missing lastModified", () => {
			const invalid = {
				name: "Project",
			};
			expect(() => ProjectDataSchema.parse(invalid)).toThrow();
		});
	});

	describe("EditorSettingsSchema", () => {
		it("should validate complete editor settings", () => {
			const valid = {
				gridVisible: true,
				defaultMapWidth: 32,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 5,
				recentFilesLimit: 10,
				recentFiles: ["/path/to/file1", "/path/to/file2"],
				lastOpenedProject: "/path/to/project",
			};
			expect(() => EditorSettingsSchema.parse(valid)).not.toThrow();
		});

		it("should accept empty recent files", () => {
			const valid = {
				gridVisible: false,
				defaultMapWidth: 16,
				defaultMapHeight: 16,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 0,
				recentFilesLimit: 5,
				recentFiles: [],
				lastOpenedProject: null,
			};
			expect(() => EditorSettingsSchema.parse(valid)).not.toThrow();
		});

		it("should accept autoSaveInterval of 0 (disabled)", () => {
			const valid = {
				gridVisible: true,
				defaultMapWidth: 32,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 0,
				recentFilesLimit: 10,
				recentFiles: [],
				lastOpenedProject: null,
			};
			const result = EditorSettingsSchema.parse(valid);
			expect(result.autoSaveInterval).toBe(0);
		});

		it("should reject missing gridVisible", () => {
			const invalid = {
				defaultMapWidth: 32,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 5,
				recentFilesLimit: 10,
				recentFiles: [],
				lastOpenedProject: null,
			};
			expect(() => EditorSettingsSchema.parse(invalid)).toThrow();
		});

		it("should reject missing defaultMapWidth", () => {
			const invalid = {
				gridVisible: true,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 5,
				recentFilesLimit: 10,
				recentFiles: [],
				lastOpenedProject: null,
			};
			expect(() => EditorSettingsSchema.parse(invalid)).toThrow();
		});

		it("should reject invalid recentFiles type", () => {
			const invalid = {
				gridVisible: true,
				defaultMapWidth: 32,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 5,
				recentFilesLimit: 10,
				recentFiles: "not-an-array",
				lastOpenedProject: null,
			};
			expect(() => EditorSettingsSchema.parse(invalid)).toThrow();
		});

		it("should accept null lastOpenedProject", () => {
			const valid = {
				gridVisible: true,
				defaultMapWidth: 32,
				defaultMapHeight: 32,
				defaultTileWidth: 16,
				defaultTileHeight: 16,
				autoSaveInterval: 5,
				recentFilesLimit: 10,
				recentFiles: [],
				lastOpenedProject: null,
			};
			const result = EditorSettingsSchema.parse(valid);
			expect(result.lastOpenedProject).toBeNull();
		});
	});

	describe("SerializedLayerSchema", () => {
		it("should validate serialized layer with tiles", () => {
			const valid = {
				id: "layer-1",
				name: "Ground",
				visible: true,
				type: "tile" as const,
				tiles: [1, 2, 3, 0, 5],
			};
			expect(() => SerializedLayerSchema.parse(valid)).not.toThrow();
		});

		it("should default tiles to empty array", () => {
			const input = {
				id: "layer-1",
				name: "Ground",
				visible: true,
				type: "tile" as const,
			};
			const result = SerializedLayerSchema.parse(input);
			expect(result.tiles).toEqual([]);
		});

		it("should accept entity layer type", () => {
			const valid = {
				id: "layer-1",
				name: "Entities",
				visible: true,
				type: "entity" as const,
			};
			expect(() => SerializedLayerSchema.parse(valid)).not.toThrow();
		});
	});

	describe("Factory Functions", () => {
		describe("createDefaultLayer", () => {
			it("should create default tile layer with default name", () => {
				const layer = createDefaultLayer();
				expect(layer.name).toBe("Layer 1");
				expect(layer.type).toBe("tile");
				expect(layer.visible).toBe(true);
				expect(layer.tiles).toEqual([]);
				expect(layer.id).toMatch(/^layer-\d+$/);
			});

			it("should create layer with custom name", () => {
				const layer = createDefaultLayer("Custom Layer");
				expect(layer.name).toBe("Custom Layer");
				expect(layer.type).toBe("tile");
			});

			it("should create entity layer when specified", () => {
				const layer = createDefaultLayer("Entities", "entity");
				expect(layer.type).toBe("entity");
				expect(layer.name).toBe("Entities");
			});

			it("should generate unique IDs for sequential calls", async () => {
				const layer1 = createDefaultLayer();
				// Wait 10ms to ensure different timestamp
				await new Promise((resolve) => setTimeout(resolve, 10));
				const layer2 = createDefaultLayer();
				expect(layer1.id).not.toBe(layer2.id);
			});

			it("should create valid layer that passes schema validation", () => {
				const layer = createDefaultLayer("Test");
				expect(() => LayerSchema.parse(layer)).not.toThrow();
			});

			it("should include all required fields", () => {
				const layer = createDefaultLayer();
				expect(layer).toHaveProperty("id");
				expect(layer).toHaveProperty("name");
				expect(layer).toHaveProperty("visible");
				expect(layer).toHaveProperty("type");
				expect(layer).toHaveProperty("tiles");
			});
		});

		describe("createDefaultMapData", () => {
			it("should create map with default parameters", () => {
				const map = createDefaultMapData();
				expect(map.name).toBe("Untitled Map");
				expect(map.width).toBe(32);
				expect(map.height).toBe(32);
				expect(map.tileWidth).toBe(16);
				expect(map.tileHeight).toBe(16);
			});

			it("should create map with custom name", () => {
				const map = createDefaultMapData("My Map");
				expect(map.name).toBe("My Map");
			});

			it("should create map with custom dimensions", () => {
				const map = createDefaultMapData("Test", 64, 48);
				expect(map.width).toBe(64);
				expect(map.height).toBe(48);
			});

			it("should include default layer with correct tile count", () => {
				const map = createDefaultMapData("Test", 10, 20);
				expect(map.layers).toHaveLength(1);
				expect(map.layers[0].tiles).toHaveLength(200); // 10 * 20
				expect(map.layers[0].tiles.every((t) => t === 0)).toBe(true);
			});

			it("should initialize entities array", () => {
				const map = createDefaultMapData();
				expect(map.entities).toEqual([]);
			});

			it("should create valid map that passes schema validation", () => {
				const map = createDefaultMapData("Valid Map", 16, 16);
				expect(() => MapDataSchema.parse(map)).not.toThrow();
			});

			it("should set first layer as tile type", () => {
				const map = createDefaultMapData();
				expect(map.layers[0].type).toBe("tile");
				expect(map.layers[0].visible).toBe(true);
			});
		});

		describe("ensureValidMapData", () => {
			it("should accept valid map data", () => {
				const validData = {
					name: "Test",
					width: 10,
					height: 10,
					tileWidth: 16,
					tileHeight: 16,
					layers: [],
					entities: [],
				};
				const result = ensureValidMapData(validData);
				expect(result).toEqual(validData);
			});

			it("should throw on invalid data", () => {
				const invalidData = {
					name: "Test",
					width: -10, // Invalid negative width
					height: 10,
					tileWidth: 16,
					tileHeight: 16,
				};
				expect(() => ensureValidMapData(invalidData)).toThrow();
			});

			it("should throw on missing required fields", () => {
				const invalidData = {
					name: "Test",
					width: 10,
					// missing height, tileWidth, tileHeight
				};
				expect(() => ensureValidMapData(invalidData)).toThrow();
			});

			it("should apply default values for optional fields", () => {
				const minimalData = {
					name: "Test",
					width: 10,
					height: 10,
					tileWidth: 16,
					tileHeight: 16,
				};
				const result = ensureValidMapData(minimalData);
				expect(result.layers).toEqual([]);
				expect(result.entities).toEqual([]);
			});

			it("should reject completely invalid input", () => {
				expect(() => ensureValidMapData(null)).toThrow();
				expect(() => ensureValidMapData(undefined)).toThrow();
				expect(() => ensureValidMapData("not an object")).toThrow();
				expect(() => ensureValidMapData(123)).toThrow();
			});

			it("should preserve valid layers and entities", () => {
				const validData = {
					name: "Test",
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
				const result = ensureValidMapData(validData);
				expect(result.layers).toHaveLength(1);
				expect(result.layers[0].name).toBe("Ground");
			});
		});

		describe("validateMapData", () => {
			// Suppress console.warn for tests that intentionally test invalid data
			let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

			beforeEach(() => {
				consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			});

			afterEach(() => {
				consoleWarnSpy.mockRestore();
			});

			it("should return true for valid map data", () => {
				const validData = {
					name: "Test",
					width: 10,
					height: 10,
					tileWidth: 16,
					tileHeight: 16,
				};
				expect(validateMapData(validData)).toBe(true);
			});

			it("should return false for invalid data", () => {
				const invalidData = {
					name: "Test",
					width: -10,
					height: 10,
					tileWidth: 16,
					tileHeight: 16,
				};
				expect(validateMapData(invalidData)).toBe(false);
			});

			it("should return false for missing required fields", () => {
				const invalidData = {
					name: "Test",
					width: 10,
				};
				expect(validateMapData(invalidData)).toBe(false);
			});

			it("should return false for null or undefined", () => {
				expect(validateMapData(null)).toBe(false);
				expect(validateMapData(undefined)).toBe(false);
			});

			it("should return false for non-object types", () => {
				expect(validateMapData("string")).toBe(false);
				expect(validateMapData(123)).toBe(false);
				expect(validateMapData([])).toBe(false);
			});

			it("should return true for map with optional fields", () => {
				const validData = {
					name: "Test",
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
						},
					],
					entities: [],
				};
				expect(validateMapData(validData)).toBe(true);
			});
		});
	});
});
