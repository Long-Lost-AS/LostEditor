import { describe, expect, it } from "vitest";
import type { MapData, SerializedLayer, SerializedMapData } from "../../types";
import { generateId } from "../id";
import { deserializeMapData, serializeMapData } from "../mapSerializer";

describe("mapSerializer", () => {
	describe("serializeMapData", () => {
		it("should serialize minimal map data", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Test Map",
				width: 10,
				height: 10,
				layers: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.version).toBe("4.0");
			expect(result.name).toBe("Test Map");
			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(result.layers).toEqual([]);
			expect(result.entities).toEqual([]);
		});

		it("should serialize map with layers", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Layers",
				width: 2,
				height: 2,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tiles: [1, 2, 3, 4],
						tileWidth: 16,
						tileHeight: 16,
					},
					{
						id: "layer-2",
						name: "Objects",
						visible: false,
						tiles: [0, 0, 0, 0],
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.layers).toHaveLength(2);
			expect(result.layers[0].id).toBe("layer-1");
			expect(result.layers[0].name).toBe("Ground");
			expect(result.layers[0].visible).toBe(true);
			expect(result.layers[0].tiles).toEqual([1, 2, 3, 4]);
			expect(result.layers[0].tileWidth).toBe(16);
			expect(result.layers[0].tileHeight).toBe(16);

			expect(result.layers[1].id).toBe("layer-2");
			expect(result.layers[1].visible).toBe(false);
		});

		it("should handle map with entities", () => {
			const mapData: MapData = {
				id: generateId(),
				name: "Map with Entities",
				width: 5,
				height: 5,
				layers: [],
				entities: [
					{
						id: "entity-1",
						x: 10,
						y: 20,
						entityDefId: "player",
						tilesetId: "tileset-1",
						rotation: 0,
						scale: { x: 1, y: 1 },
						properties: {},
					},
					{
						id: "entity-2",
						x: 30,
						y: 40,
						entityDefId: "enemy",
						tilesetId: "tileset-1",
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
				width: 10,
				height: 10,
				layers: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.entities).toEqual([]);
		});

		it("should preserve layer tile arrays", () => {
			const tiles = new Array(100).fill(0).map((_, i) => i);
			const mapData: MapData = {
				id: generateId(),
				name: "Large Map",
				width: 10,
				height: 10,
				layers: [
					{
						id: "layer-1",
						name: "Test",
						visible: true,
						tiles,
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = serializeMapData(mapData);

			expect(result.layers[0].tiles).toEqual(tiles);
			expect(result.layers[0].tiles).toHaveLength(100);
		});
	});

	describe("deserializeMapData", () => {
		it("should deserialize minimal map data", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Test Map",
				width: 10,
				height: 10,
				layers: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.name).toBe("Test Map");
			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(result.layers).toEqual([]);
			expect(result.entities).toEqual([]);
		});

		it("should deserialize map with layers", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 2,
				height: 2,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tiles: [1, 2, 3, 4],
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers).toHaveLength(1);
			expect(result.layers[0].tiles).toEqual([1, 2, 3, 4]);
			expect(result.layers[0].tileWidth).toBe(16);
			expect(result.layers[0].tileHeight).toBe(16);
		});

		it("should pad tiles array if too small", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 5,
				height: 5,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tiles: [1, 2, 3], // Only 3 tiles, but should be 25
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			// Should pad to 5 * 5 = 25 tiles
			expect(result.layers[0].tiles).toHaveLength(25);
			expect(result.layers[0].tiles[0]).toBe(1);
			expect(result.layers[0].tiles[1]).toBe(2);
			expect(result.layers[0].tiles[2]).toBe(3);
			// Padded tiles should be 0
			expect(result.layers[0].tiles[3]).toBe(0);
			expect(result.layers[0].tiles[24]).toBe(0);
		});

		it("should handle layer with undefined tiles", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 3,
				height: 3,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tileWidth: 16,
						tileHeight: 16,
						// tiles is undefined (covered by line 53)
					} as Partial<SerializedLayer> as SerializedLayer,
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			// Should create array of zeros
			expect(result.layers[0].tiles).toHaveLength(9); // 3 * 3
			expect(result.layers[0].tiles.every((t) => t === 0)).toBe(true);
		});

		it("should default tileWidth and tileHeight to 16 when not provided", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 2,
				height: 2,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tiles: [0, 0, 0, 0],
						// tileWidth and tileHeight are undefined
					} as Partial<SerializedLayer> as SerializedLayer,
				],
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
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 10,
				height: 10,
				layers: [],
				entities: [
					{
						id: "entity-1",
						x: 10,
						y: 20,
						entityDefId: "player",
						tilesetId: "tileset-1",
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
				version: "4.0",
				name: "Map",
				width: 10,
				height: 10,
				layers: [],
				// entities is undefined (covered by line 77)
			} as Partial<SerializedMapData> as SerializedMapData;

			const result = deserializeMapData(serialized);

			expect(result.entities).toEqual([]);
		});

		it("should preserve layer properties", () => {
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Map",
				width: 2,
				height: 2,
				layers: [
					{
						id: "layer-1",
						name: "Test Layer",
						visible: false,
						tiles: [0, 0, 0, 0],
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].id).toBe("layer-1");
			expect(result.layers[0].name).toBe("Test Layer");
			expect(result.layers[0].visible).toBe(false);
		});

		it("should handle large tile arrays correctly", () => {
			const largeTiles = new Array(10000).fill(42);
			const serialized: SerializedMapData = {
				version: "4.0",
				id: generateId(),
				name: "Large Map",
				width: 100,
				height: 100,
				layers: [
					{
						id: "layer-1",
						name: "Large",
						visible: true,
						tiles: largeTiles,
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				entities: [],
				points: [],
				colliders: [],
			};

			const result = deserializeMapData(serialized);

			expect(result.layers[0].tiles).toHaveLength(10000);
			expect(result.layers[0].tiles[0]).toBe(42);
			expect(result.layers[0].tiles[9999]).toBe(42);
		});
	});

	describe("round-trip serialization", () => {
		it("should preserve data through serialize/deserialize cycle", () => {
			const original: MapData = {
				id: generateId(),
				name: "Round Trip Test",
				width: 4,
				height: 4,
				layers: [
					{
						id: "layer-1",
						name: "Ground",
						visible: true,
						tiles: new Array(16).fill(0).map((_, i) => i),
						tileWidth: 16,
						tileHeight: 16,
					},
				],
				points: [],
				colliders: [],
				entities: [
					{
						id: "entity-1",
						x: 50,
						y: 50,
						entityDefId: "player",
						tilesetId: "tileset-1",
						rotation: 0,
						scale: { x: 1, y: 1 },
						properties: {},
					},
				],
			};

			const serialized = serializeMapData(original);
			const deserialized = deserializeMapData(serialized);

			expect(deserialized.name).toBe(original.name);
			expect(deserialized.width).toBe(original.width);
			expect(deserialized.height).toBe(original.height);
			expect(deserialized.layers[0].tiles).toEqual(original.layers[0].tiles);
			expect(deserialized.entities[0].id).toBe(original.entities[0].id);
		});

		it("should handle empty map through round-trip", () => {
			const original: MapData = {
				id: generateId(),
				name: "Empty",
				width: 1,
				height: 1,
				layers: [],
				entities: [],
				points: [],
				colliders: [],
			};

			const serialized = serializeMapData(original);
			const deserialized = deserializeMapData(serialized);

			expect(deserialized).toEqual(original);
		});
	});
});
