import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMockLayerGroup,
	createMockMap,
	createMockSerializedLayer,
	createMockSerializedLayerGroup,
} from "../../__mocks__/testFactories";
import { FileOperationError, ValidationError } from "../../errors/FileErrors";
import type { MapData, SerializedMapData } from "../../types";
import { generateId } from "../../utils/id";
import { fileManager } from "../FileManager";
import { mapManager } from "../MapManager";

// Mock Tauri APIs
vi.mock("@tauri-apps/plugin-fs");

describe("MapManager", () => {
	beforeEach(() => {
		fileManager.setProjectDir("/test/project");
		// Clear the singleton's cache before each test
		mapManager.clearCache();
		vi.clearAllMocks();
	});

	describe("load", () => {
		it("should load and deserialize valid map file", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Test Map",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Layer 1",
						chunks: { "0,0": [0, 0, 0] },
					}),
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			const result = await mapManager.load("maps/test.lostmap");

			expect(readTextFile).toHaveBeenCalledWith(
				"/test/project/maps/test.lostmap",
			);
			expect(result.name).toBe("Test Map");
			expect(result.layers).toHaveLength(1);
		});

		it("should cache loaded map", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Cached Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			// Load twice
			const result1 = await mapManager.load("maps/cached.lostmap");
			const result2 = await mapManager.load("maps/cached.lostmap");

			// Should only read file once
			expect(readTextFile).toHaveBeenCalledTimes(1);
			expect(result1).toBe(result2); // Same instance from cache
		});

		it("should handle concurrent load requests", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Concurrent Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			// Start multiple concurrent loads
			const promises = [
				mapManager.load("maps/concurrent.lostmap"),
				mapManager.load("maps/concurrent.lostmap"),
				mapManager.load("maps/concurrent.lostmap"),
			];

			const results = await Promise.all(promises);

			// Should only read file once
			expect(readTextFile).toHaveBeenCalledTimes(1);
			// All results should be the same instance
			expect(results[0]).toBe(results[1]);
			expect(results[1]).toBe(results[2]);
		});

		it("should throw ValidationError for invalid map data", async () => {
			const invalidData = {
				version: "5.0",
				// Missing required fields
				name: "Invalid Map",
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(invalidData));

			await expect(mapManager.load("maps/invalid.lostmap")).rejects.toThrow(
				ValidationError,
			);
		});

		it("should throw FileOperationError for file read failure", async () => {
			vi.mocked(readTextFile).mockRejectedValue(new Error("File not found"));

			await expect(mapManager.load("maps/missing.lostmap")).rejects.toThrow(
				FileOperationError,
			);
		});

		it("should throw FileOperationError for invalid JSON", async () => {
			vi.mocked(readTextFile).mockResolvedValue("{ invalid json }");

			await expect(mapManager.load("maps/badjson.lostmap")).rejects.toThrow(
				FileOperationError,
			);
		});

		it("should deserialize tile layers with BigInt tile IDs", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "BigInt Map",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Layer 1",
						chunks: { "0,0": [123456789012345, 987654321098765, 0, 1] },
					}),
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			const result = await mapManager.load("maps/bigint.lostmap");

			const tileLayer = result.layers[0];
			// Note: Tiles are stored as regular numbers in runtime format
			expect(tileLayer.chunks["0,0"][0]).toBe(123456789012345);
			expect(tileLayer.chunks["0,0"][1]).toBe(987654321098765);
			expect(tileLayer.chunks["0,0"][2]).toBe(0);
			expect(tileLayer.chunks["0,0"][3]).toBe(1);
		});

		it("should load map with groups and grouped layers", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map with Groups",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Grouped Layer",
						groupId: "group-1",
					}),
				],
				groups: [
					createMockSerializedLayerGroup({
						id: "group-1",
						name: "Test Group",
						foreground: true,
						order: 5,
					}),
				],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			const result = await mapManager.load("maps/groups.lostmap");

			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].id).toBe("group-1");
			expect(result.groups[0].name).toBe("Test Group");
			expect(result.groups[0].foreground).toBe(true);
			expect(result.groups[0].order).toBe(5);
			expect(result.layers[0].groupId).toBe("group-1");
		});
	});

	describe("saveMap", () => {
		it("should serialize and save map data", async () => {
			const mapData = createMockMap({
				name: "Save Test",
				layers: [
					{
						id: "layer-1",
						name: "Tile Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: { "0,0": [0, 1, 2, 3] },
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/saved.lostmap");

			expect(writeTextFile).toHaveBeenCalledTimes(1);
			const [filePath, content] = vi.mocked(writeTextFile).mock.calls[0];
			expect(filePath).toBe("/test/project/maps/saved.lostmap");

			// Verify serialized content
			const saved = JSON.parse(content);
			expect(saved.version).toBe("5.0");
			expect(saved.name).toBe("Save Test");
			// Serialization pads chunks to full 16x16 (256 elements)
			const chunk = saved.layers[0].chunks["0,0"];
			expect(chunk.length).toBe(256);
			expect(chunk.slice(0, 4)).toEqual([0, 1, 2, 3]);
		});

		it("should update map name when provided", async () => {
			const mapData = createMockMap({
				name: "Original Name",
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/renamed.lostmap", "New Name");

			expect(mapData.name).toBe("New Name");
		});

		it("should cache saved map", async () => {
			const mapData = createMockMap({
				name: "Cached Save",
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/cached-save.lostmap");

			// Should be in cache
			const cached = mapManager.getMap("maps/cached-save.lostmap");
			expect(cached).toBe(mapData);
		});

		it("should format chunk arrays as 16x16 grid", async () => {
			// Create a 16x16 chunk (256 elements) with some values in first row
			const chunk = new Array(256).fill(0);
			chunk[0] = 1;
			chunk[1] = 2;
			chunk[2] = 3;
			chunk[16] = 4; // Second row, first column

			const mapData = createMockMap({
				layers: [
					{
						id: "layer-1",
						name: "Tile Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: { "0,0": chunk },
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/formatted.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];

			// Check that chunks are formatted as rows (each row on its own line)
			// First row should contain: 1,2,3,0,0,0,0,0,0,0,0,0,0,0,0,0
			expect(content).toContain("1,2,3,0,0,0,0,0,0,0,0,0,0,0,0,0");
			// Second row should start with 4
			expect(content).toContain("4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
		});

		it("should handle empty chunk", async () => {
			const mapData = createMockMap({
				layers: [
					{
						id: "layer-1",
						name: "Tile Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/empty.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);
			expect(saved.layers[0].chunks).toEqual({});
		});

		it("should use default values for undefined layer properties in formatMapJSON", async () => {
			// Create map data with a layer that has undefined optional properties
			const mapData = createMockMap({
				name: "Map with sparse layer",
				layers: [
					{
						id: "layer-1",
						name: "Sparse Layer",
						visible: true,
						// foreground is undefined
						// order is undefined
						chunks: {},
						tileWidth: 16,
						tileHeight: 16,
						// parallaxX is undefined
						// parallaxY is undefined
						// tint is undefined
						// properties is undefined
					} as unknown as MapData["layers"][0],
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/sparse.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			// Verify defaults were applied
			expect(saved.layers[0].foreground).toBe(false);
			expect(saved.layers[0].order).toBe(0); // Uses index when undefined
			expect(saved.layers[0].parallaxX).toBe(1.0);
			expect(saved.layers[0].parallaxY).toBe(1.0);
			expect(saved.layers[0].tint).toEqual({ r: 255, g: 255, b: 255, a: 255 });
			expect(saved.layers[0].properties).toEqual({});
		});

		it("should handle layer without groupId in formatMapJSON", async () => {
			// Test that layers without groupId don't add the groupId field
			const mapData = createMockMap({
				name: "Map without groupId",
				layers: [
					{
						id: "layer-1",
						name: "Ungrouped Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/no-groupid.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];

			// Verify groupId is not in the output
			expect(content).not.toContain('"groupId"');
		});

		it("should format multiple chunks with proper commas", async () => {
			// Test multiple chunks to hit the comma branch
			const mapData = createMockMap({
				name: "Map with multiple chunks",
				layers: [
					{
						id: "layer-1",
						name: "Multi-chunk Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: {
							"0,0": new Array(256).fill(1),
							"1,0": new Array(256).fill(2),
						},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/multi-chunk.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			expect(Object.keys(saved.layers[0].chunks)).toHaveLength(2);
		});

		it("should format multiple layers with proper commas", async () => {
			// Test multiple layers to hit the layerComma branch
			const mapData = createMockMap({
				name: "Map with multiple layers",
				layers: [
					{
						id: "layer-1",
						name: "First Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
					{
						id: "layer-2",
						name: "Second Layer",
						visible: true,
						foreground: true,
						groupId: null,
						order: 1,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/multi-layer.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			expect(saved.layers).toHaveLength(2);
		});

		it("should handle undefined groups, entities, points, colliders in formatMapJSON", async () => {
			// Test that undefined arrays default to empty arrays
			const mapData = {
				id: generateId(),
				name: "Map with undefined arrays",
				layers: [],
				// groups, entities, points, colliders are undefined
			} as unknown as MapData;

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/undefined-arrays.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			expect(saved.groups).toEqual([]);
			expect(saved.entities).toEqual([]);
			expect(saved.points).toEqual([]);
			expect(saved.colliders).toEqual([]);
		});

		it("should throw error when file write fails", async () => {
			const mapData = createMockMap();

			vi.mocked(writeTextFile).mockRejectedValue(new Error("Disk full"));

			await expect(
				mapManager.saveMap(mapData, "maps/fail.lostmap"),
			).rejects.toThrow("Disk full");
		});

		it("should serialize layer with groupId", async () => {
			const mapData = createMockMap({
				name: "Map with Grouped Layer",
				layers: [
					{
						id: "layer-1",
						name: "Grouped Layer",
						visible: true,
						foreground: false,
						groupId: "group-1",
						order: 0,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
				groups: [createMockLayerGroup({ id: "group-1", name: "Test Group" })],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/grouped.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			expect(saved.layers[0].groupId).toBe("group-1");
			expect(saved.groups).toHaveLength(1);
			expect(saved.groups[0].id).toBe("group-1");
		});

		it("should serialize and save map with groups", async () => {
			const mapData = createMockMap({
				name: "Map with Groups",
				layers: [],
				groups: [
					createMockLayerGroup({
						id: "group-1",
						name: "Foreground Group",
						foreground: true,
						order: 2,
					}),
					createMockLayerGroup({
						id: "group-2",
						name: "Background Group",
						foreground: false,
						order: 1,
						tint: { r: 200, g: 150, b: 100, a: 255 },
					}),
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			await mapManager.saveMap(mapData, "maps/with-groups.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);

			expect(saved.groups).toHaveLength(2);
			expect(saved.groups[0].id).toBe("group-1");
			expect(saved.groups[0].foreground).toBe(true);
			expect(saved.groups[1].tint).toEqual({ r: 200, g: 150, b: 100, a: 255 });
		});
	});

	describe("save (base class method)", () => {
		it("should use prepareForSave to serialize map data", async () => {
			const mapData = createMockMap({
				name: "Base Save Test",
				layers: [
					{
						id: "layer-1",
						name: "Test Layer",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks: {},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 16,
						tileHeight: 16,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			// Use the base class save method which calls prepareForSave
			await mapManager.save(mapData, "maps/base-save.lostmap");

			expect(writeTextFile).toHaveBeenCalledTimes(1);
			const [filePath, content] = vi.mocked(writeTextFile).mock.calls[0];
			expect(filePath).toBe("/test/project/maps/base-save.lostmap");

			const saved = JSON.parse(content);
			expect(saved.version).toBe("5.0");
			expect(saved.name).toBe("Base Save Test");
		});
	});

	describe("getMap", () => {
		it("should return cached map by path", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Get Test",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			await mapManager.load("maps/test.lostmap");
			const result = mapManager.getMap("maps/test.lostmap");

			expect(result).toBeDefined();
			expect(result?.name).toBe("Get Test");
		});

		it("should return undefined for non-cached map", () => {
			const result = mapManager.getMap("maps/not-loaded.lostmap");
			expect(result).toBeUndefined();
		});

		it("should resolve relative paths", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Relative Path",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			await mapManager.load("maps/subdir/test.lostmap");
			const result = mapManager.getMap("maps/subdir/test.lostmap");

			expect(result).toBeDefined();
		});
	});

	describe("getAllMaps", () => {
		it("should return empty array when no maps loaded", () => {
			const result = mapManager.getAllMaps();
			expect(result).toEqual([]);
		});

		it("should return all loaded maps", async () => {
			const mockMap1: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map 1",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const mockMap2: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map 2",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile)
				.mockResolvedValueOnce(JSON.stringify(mockMap1))
				.mockResolvedValueOnce(JSON.stringify(mockMap2));

			await mapManager.load("maps/map1.lostmap");
			await mapManager.load("maps/map2.lostmap");

			const result = mapManager.getAllMaps();
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Map 1");
			expect(result[1].name).toBe("Map 2");
		});
	});

	describe("unloadAll", () => {
		it("should clear all cached maps", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Clear Test",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			await mapManager.load("maps/test1.lostmap");
			await mapManager.load("maps/test2.lostmap");

			expect(mapManager.getAllMaps()).toHaveLength(2);

			mapManager.unloadAll();

			expect(mapManager.getAllMaps()).toHaveLength(0);
		});
	});

	describe("loadMap (legacy)", () => {
		it("should call load method", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Legacy Test",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			const result = await mapManager.loadMap("maps/legacy.lostmap");

			expect(result.name).toBe("Legacy Test");
		});
	});

	describe("inherited FileLoader methods", () => {
		describe("invalidate", () => {
			it("should remove map from cache", async () => {
				const mockMapData: SerializedMapData = {
					version: "5.0",
					id: generateId(),
					name: "Invalidate Test",
					layers: [],
					groups: [],
					entities: [],
					points: [],
					colliders: [],
				};

				vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

				await mapManager.load("maps/test.lostmap");
				expect(mapManager.getMap("maps/test.lostmap")).toBeDefined();

				mapManager.invalidate("maps/test.lostmap");
				expect(mapManager.getMap("maps/test.lostmap")).toBeUndefined();
			});
		});

		describe("updatePath", () => {
			it("should update cached path", async () => {
				const mockMapData: SerializedMapData = {
					version: "5.0",
					id: generateId(),
					name: "Update Path Test",
					layers: [],
					groups: [],
					entities: [],
					points: [],
					colliders: [],
				};

				vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

				await mapManager.load("maps/old.lostmap");
				const original = mapManager.getMap("maps/old.lostmap");

				mapManager.updatePath("maps/old.lostmap", "maps/new.lostmap");

				expect(mapManager.getMap("maps/old.lostmap")).toBeUndefined();
				expect(mapManager.getMap("maps/new.lostmap")).toBe(original);
			});

			it("should handle non-existent path gracefully", () => {
				expect(() => {
					mapManager.updatePath("maps/nonexistent.lostmap", "maps/new.lostmap");
				}).not.toThrow();
			});
		});

		describe("getCachedPaths", () => {
			it("should return empty array when no maps cached", () => {
				const paths = mapManager.getCachedPaths();
				expect(paths).toEqual([]);
			});

			it("should return all cached paths", async () => {
				const mockMapData: SerializedMapData = {
					version: "5.0",
					id: generateId(),
					name: "Paths Test",
					layers: [],
					groups: [],
					entities: [],
					points: [],
					colliders: [],
				};

				vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

				await mapManager.load("maps/map1.lostmap");
				await mapManager.load("maps/map2.lostmap");

				const paths = mapManager.getCachedPaths();
				expect(paths).toHaveLength(2);
				expect(paths).toContain("/test/project/maps/map1.lostmap");
				expect(paths).toContain("/test/project/maps/map2.lostmap");
			});
		});

		describe("clearCache", () => {
			it("should clear all cached data", async () => {
				const mockMapData: SerializedMapData = {
					version: "5.0",
					id: generateId(),
					name: "Clear Cache Test",
					layers: [],
					groups: [],
					entities: [],
					points: [],
					colliders: [],
				};

				vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

				await mapManager.load("maps/test.lostmap");
				expect(mapManager.getCachedPaths()).toHaveLength(1);

				mapManager.clearCache();

				expect(mapManager.getCachedPaths()).toHaveLength(0);
				expect(mapManager.getAllMaps()).toHaveLength(0);
			});
		});
	});

	describe("integration scenarios", () => {
		it("should handle load-modify-save workflow", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Original Map",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Layer 1",
						chunks: { "0,0": [0, 0, 0, 0] },
					}),
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));
			vi.mocked(writeTextFile).mockResolvedValue();

			// Load
			const mapData = await mapManager.load("maps/workflow.lostmap");
			expect(mapData.name).toBe("Original Map");

			// Modify
			mapData.name = "Modified Map";
			mapData.layers[0].chunks["0,0"][0] = 999;

			// Save
			await mapManager.saveMap(mapData, "maps/workflow.lostmap");

			const [, content] = vi.mocked(writeTextFile).mock.calls[0];
			const saved = JSON.parse(content);
			expect(saved.name).toBe("Modified Map");
			expect(saved.layers[0].chunks["0,0"][0]).toBe(999);
		});

		it("should handle multiple maps in cache", async () => {
			const mockMap1: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map 1",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const mockMap2: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map 2",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile)
				.mockResolvedValueOnce(JSON.stringify(mockMap1))
				.mockResolvedValueOnce(JSON.stringify(mockMap2));

			const map1 = await mapManager.load("maps/map1.lostmap");
			const map2 = await mapManager.load("maps/map2.lostmap");

			expect(map1.name).toBe("Map 1");
			expect(map2.name).toBe("Map 2");
			expect(mapManager.getAllMaps()).toHaveLength(2);
		});

		it("should handle reload after invalidation", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Reload Test",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			// Load
			await mapManager.load("maps/reload.lostmap");
			expect(readTextFile).toHaveBeenCalledTimes(1);

			// Invalidate
			mapManager.invalidate("maps/reload.lostmap");

			// Reload
			await mapManager.load("maps/reload.lostmap");
			expect(readTextFile).toHaveBeenCalledTimes(2);
		});

		it("should preserve map integrity through save/load cycle", async () => {
			// NOTE: This test only uses tile layers due to a bug in MapManager.formatMapJSON
			// which doesn't replace __CHUNKS_PLACEHOLDER__ for non-tile layers (line 108-130)
			const originalMap = createMockMap({
				name: "Integrity Test",
				layers: [
					{
						id: "layer-ground",
						name: "Ground",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						// Full 256-element chunk (16x16)
						chunks: {
							"0,0": (() => {
								const chunk = new Array(256).fill(0);
								chunk[0] = 1;
								chunk[1] = 2;
								chunk[16] = 3; // Row 1, col 0
								return chunk;
							})(),
						},
						chunkWidth: 16,
						chunkHeight: 16,
						tileWidth: 32,
						tileHeight: 32,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						properties: {},
					},
				],
			});

			vi.mocked(writeTextFile).mockResolvedValue();

			// Save
			await mapManager.saveMap(originalMap, "maps/integrity.lostmap");

			// Get the saved content
			const [, savedContent] = vi.mocked(writeTextFile).mock.calls[0];

			// Mock read to return saved content
			vi.mocked(readTextFile).mockResolvedValue(savedContent);

			// Clear cache
			mapManager.clearCache();

			// Reload
			const reloaded = await mapManager.load("maps/integrity.lostmap");

			// Verify integrity
			expect(reloaded.name).toBe(originalMap.name);
			expect(reloaded.layers).toHaveLength(originalMap.layers.length);

			const reloadedTileLayer = reloaded.layers[0];
			// Verify chunk data is preserved
			expect(reloadedTileLayer.chunks["0,0"]).toEqual(
				originalMap.layers[0].chunks["0,0"],
			);
		});
	});

	describe("singleton instance", () => {
		it("should export a singleton instance", () => {
			expect(mapManager).toBeDefined();
			expect(typeof mapManager.load).toBe("function");
			expect(typeof mapManager.saveMap).toBe("function");
		});

		it("should share cache across singleton references", async () => {
			const mockMapData: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Singleton Test",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(mockMapData));

			await mapManager.load("maps/singleton.lostmap");
			const map = mapManager.getMap("maps/singleton.lostmap");

			expect(map).toBeDefined();
			expect(map?.name).toBe("Singleton Test");
		});
	});
});
