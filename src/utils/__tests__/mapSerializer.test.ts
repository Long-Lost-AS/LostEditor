import { describe, expect, it } from "vitest";
import {
	createMockLayerGroup,
	createMockSerializedLayer,
	createMockSerializedLayerGroup,
} from "../../__mocks__/testFactories";
import type { MapData, SerializedLayer, SerializedMapData } from "../../types";
import { generateId } from "../id";
import { deserializeMapData, serializeMapData } from "../mapSerializer";

describe("mapSerializer", () => {
	describe("serializeMapData", () => {
		it("should serialize minimal map data", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Test Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.version).toBe("5.0");
			expect(result.name).toBe("Test Map");
			expect(result.layers).toEqual([]);
			expect(result.entities).toEqual([]);
		});

		it("should serialize map with layers", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Layers",
				layers: [
					{
						id: "layer-1",
						name: "Ground",
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
						name: "Objects",
						visible: false,
						foreground: false,
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
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.layers).toHaveLength(2);
			expect(result.layers[0].id).toBe("layer-1");
			expect(result.layers[0].name).toBe("Ground");
			expect(result.layers[0].visible).toBe(true);
			expect(result.layers[0].chunks).toEqual({});
			expect(result.layers[0].tileWidth).toBe(16);
			expect(result.layers[0].tileHeight).toBe(16);

			expect(result.layers[1].id).toBe("layer-2");
			expect(result.layers[1].visible).toBe(false);
		});

		it("should handle layer with undefined properties", () => {
			const mapData = {
				id: generateId(),
				name: "Map with undefined properties",
				layers: [
					{
						id: "layer-1",
						name: "Test",
						visible: true,
						chunks: {},
						tileWidth: 16,
						tileHeight: 16,
						// properties is undefined
					},
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			} as unknown as MapData;

			const result = serializeMapData(mapData);

			// Should default to empty object
			expect(result.layers[0].properties).toEqual({});
		});

		it("should handle map with entities", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Entities",
				layers: [],
				groups: [],
				entities: [
					{
						id: "entity-1",
						x: 10,
						y: 20,
						entityDefId: "player",
						rotation: 0,
						scale: { x: 1, y: 1 },
						properties: {},
					},
					{
						id: "entity-2",
						x: 30,
						y: 40,
						entityDefId: "enemy",
						rotation: 45,
						scale: { x: 2, y: 2 },
						properties: {},
					},
				],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.entities).toHaveLength(2);
			expect(result.entities[0].id).toBe("entity-1");
			expect(result.entities[1].rotation).toBe(45);
		});

		it("should handle map with undefined entities", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.entities).toEqual([]);
		});

		it("should preserve layer chunks", () => {
			const chunks = {};
			const mapData: MapData = {
				id: generateId(),
				name: "Large Map",
				layers: [
					{
						id: "layer-1",
						name: "Test",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks,
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
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.layers[0].chunks).toEqual(chunks);
		});

		it("should filter out empty chunks during serialization", () => {
			// Create chunks with one empty and one non-empty
			const CHUNK_SIZE = 16;
			const emptyChunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			const nonEmptyChunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			nonEmptyChunk[0] = 123; // Make it non-empty

			const chunks: Record<string, number[]> = {
				"0,0": emptyChunk,
				"1,0": nonEmptyChunk,
			};

			const mapData: MapData = {
				id: generateId(),
				name: "Map with empty chunk",
				layers: [
					{
						id: "layer-1",
						name: "Test",
						visible: true,
						foreground: false,
						groupId: null,
						order: 0,
						chunks,
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
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			// Empty chunk should be filtered out
			expect(result.layers[0].chunks["0,0"]).toBeUndefined();
			// Non-empty chunk should be preserved
			expect(result.layers[0].chunks["1,0"]).toEqual(nonEmptyChunk);
		});

		it("should serialize map with groups", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Groups",
				layers: [],
				groups: [
					createMockLayerGroup({
						id: "group-1",
						name: "Foreground Group",
						foreground: true,
						order: 1,
					}),
					createMockLayerGroup({
						id: "group-2",
						name: "Background Group",
						foreground: false,
						order: 0,
						tint: { r: 200, g: 150, b: 100, a: 255 },
					}),
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.groups).toHaveLength(2);
			expect(result.groups[0].id).toBe("group-1");
			expect(result.groups[0].name).toBe("Foreground Group");
			expect(result.groups[0].foreground).toBe(true);
			expect(result.groups[0].order).toBe(1);
			expect(result.groups[1].id).toBe("group-2");
			expect(result.groups[1].tint).toEqual({ r: 200, g: 150, b: 100, a: 255 });
		});

		it("should serialize layer with groupId", () => {
			const mapData: MapData = {
				id: generateId(),
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
				groups: [createMockLayerGroup({ id: "group-1" })],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.layers[0].groupId).toBe("group-1");
		});

		it("should handle undefined groups array", () => {
			const mapData = {
				id: generateId(),
				name: "Map without groups",
				layers: [],
				// groups is undefined
				entities: [],
				points: [],
				colliders: [],
			} as unknown as MapData;

			const result = serializeMapData(mapData);

			expect(result.groups).toEqual([]);
		});

		it("should handle group with undefined properties", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Group",
				layers: [],
				groups: [
					{
						id: "group-1",
						name: "Test Group",
						expanded: true,
						visible: true,
						foreground: false,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						order: 0,
						// properties is undefined
					} as unknown as MapData["groups"][0],
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.groups[0].properties).toEqual({});
		});
	});

	describe("deserializeMapData", () => {
		it("should deserialize minimal map data", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Test Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.name).toBe("Test Map");
			expect(result.layers).toEqual([]);
			expect(result.entities).toEqual([]);
		});

		it("should deserialize map with layers", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [createMockSerializedLayer({ id: "layer-1", name: "Ground" })],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers).toHaveLength(1);
			expect(result.layers[0].chunks).toEqual({});
			expect(result.layers[0].tileWidth).toBe(16);
			expect(result.layers[0].tileHeight).toBe(16);
		});

		it("should deserialize map with chunks", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [createMockSerializedLayer({ id: "layer-1", name: "Ground" })],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].chunks).toEqual({});
		});

		it("should handle layer with empty chunks", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tileWidth: 16,
						tileHeight: 16,
						// chunks is undefined
					} as Partial<SerializedLayer> as SerializedLayer,
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			// Should handle undefined chunks gracefully
			expect(result.layers[0].chunks).toBeDefined();
		});

		it("should default tileWidth and tileHeight to 16 when not provided", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						chunks: {},
						// tileWidth and tileHeight are undefined
					} as Partial<SerializedLayer> as SerializedLayer,
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			// Should default to 16x16
			expect(result.layers[0].tileWidth).toBe(16);
			expect(result.layers[0].tileHeight).toBe(16);
		});

		it("should handle map with entities", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [],
				groups: [],
				entities: [
					{
						id: "entity-1",
						x: 10,
						y: 20,
						entityDefId: "player",
						rotation: 0,
						scale: { x: 1, y: 1 },
						properties: {},
					},
				],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].id).toBe("entity-1");
		});

		it("should handle undefined entities", () => {
			const serialized = {
				version: "5.0",
				name: "Map",
				layers: [],
				// entities is undefined (covered by line 77)
			} as Partial<SerializedMapData> as SerializedMapData;

			const result = deserializeMapData(serialized);

			expect(result.entities).toEqual([]);
		});

		it("should preserve layer properties", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Test Layer",
						visible: false,
					}),
				],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].id).toBe("layer-1");
			expect(result.layers[0].name).toBe("Test Layer");
			expect(result.layers[0].visible).toBe(false);
		});

		it("should handle large chunk storage correctly", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Large Map",
				layers: [createMockSerializedLayer({ id: "layer-1", name: "Large" })],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].chunks).toBeDefined();
			expect(typeof result.layers[0].chunks).toBe("object");
		});

		it("should deserialize map with groups", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map with Groups",
				layers: [],
				groups: [
					createMockSerializedLayerGroup({
						id: "group-1",
						name: "Test Group",
						foreground: true,
						order: 5,
						tint: { r: 100, g: 150, b: 200, a: 255 },
					}),
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].id).toBe("group-1");
			expect(result.groups[0].name).toBe("Test Group");
			expect(result.groups[0].foreground).toBe(true);
			expect(result.groups[0].order).toBe(5);
			expect(result.groups[0].tint).toEqual({ r: 100, g: 150, b: 200, a: 255 });
		});

		it("should deserialize layer with groupId", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map",
				layers: [
					createMockSerializedLayer({
						id: "layer-1",
						name: "Grouped Layer",
						groupId: "group-1",
					}),
				],
				groups: [createMockSerializedLayerGroup({ id: "group-1" })],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].groupId).toBe("group-1");
		});

		it("should handle undefined groups in serialized data", () => {
			const serialized = {
				version: "5.0",
				id: generateId(),
				name: "Map without groups",
				layers: [],
				// groups is undefined
				entities: [],
				points: [],
				colliders: [],
			} as unknown as SerializedMapData;

			const result = deserializeMapData(serialized);

			expect(result.groups).toEqual([]);
		});

		it("should handle group with undefined foreground", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map with Group",
				layers: [],
				groups: [
					{
						id: "group-1",
						name: "Test Group",
						expanded: true,
						visible: true,
						// foreground is undefined
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						order: 1,
						properties: {},
					} as unknown as SerializedMapData["groups"][0],
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.groups[0].foreground).toBe(false);
		});

		it("should handle group with undefined properties", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map with Group",
				layers: [],
				groups: [
					{
						id: "group-1",
						name: "Test Group",
						expanded: true,
						visible: true,
						foreground: false,
						parallaxX: 1.0,
						parallaxY: 1.0,
						tint: { r: 255, g: 255, b: 255, a: 255 },
						order: 1,
						// properties is undefined
					} as unknown as SerializedMapData["groups"][0],
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.groups[0].properties).toEqual({});
		});

		it("should use index for group order when order is 0 and not first group", () => {
			const serialized: SerializedMapData = {
				version: "5.0",
				id: generateId(),
				name: "Map with Groups",
				layers: [],
				groups: [
					createMockSerializedLayerGroup({
						id: "group-1",
						name: "First Group",
						order: 0,
					}),
					createMockSerializedLayerGroup({
						id: "group-2",
						name: "Second Group",
						order: 0, // order is 0 but index is 1
					}),
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			// First group with order 0 at index 0 keeps order 0
			expect(result.groups[0].order).toBe(0);
			// Second group with order 0 at index 1 gets order = index = 1
			expect(result.groups[1].order).toBe(1);
		});
	});

	describe("round-trip serialization", () => {
		it("should preserve data through serialize/deserialize cycle", () => {
			const original: MapData = {
				id: generateId(),
				name: "Round Trip Test",
				layers: [
					{
						id: "layer-1",
						name: "Ground",
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
				groups: [],
				points: [],
				colliders: [],
				entities: [
					{
						id: "entity-1",
						x: 50,
						y: 50,
						entityDefId: "player",
						rotation: 0,
						scale: { x: 1, y: 1 },
						properties: {},
					},
				],
			};

			const serialized = serializeMapData(original);
			const deserialized = deserializeMapData(serialized);

			expect(deserialized.name).toBe(original.name);
			expect(deserialized.layers[0].chunks).toEqual(original.layers[0].chunks);
			expect(deserialized.entities[0].id).toBe(original.entities[0].id);
		});

		it("should handle empty map through round-trip", () => {
			const original: MapData = {
				id: generateId(),
				name: "Empty",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const serialized = serializeMapData(original);
			const deserialized = deserializeMapData(serialized);

			expect(deserialized).toEqual(original);
		});

		it("should migrate colliders without position to new format", () => {
			// Simulate old format without position field
			const serialized: SerializedMapData = {
				version: "5.0",
				id: "test-id",
				name: "Test Map",
				layers: [],
				groups: [],
				entities: [],
				points: [],
				colliders: [
					{
						id: "collider-1",
						name: "Test Collider",
						type: "polygon",
						points: [
							{ x: 10, y: 10 },
							{ x: 20, y: 10 },
							{ x: 20, y: 20 },
							{ x: 10, y: 20 },
						],
						properties: {},
					} as unknown as import("../../types").PolygonCollider,
				],
			};

			const result = deserializeMapData(serialized);

			expect(result.colliders).toHaveLength(1);
			expect(result.colliders[0].position).toEqual({ x: 15, y: 15 });
			expect(result.colliders[0].points).toEqual([
				{ x: -5, y: -5 },
				{ x: 5, y: -5 },
				{ x: 5, y: 5 },
				{ x: -5, y: 5 },
			]);
		});
	});
});
