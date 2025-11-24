import { describe, expect, it } from "vitest";
import type { TileDefinition, TilesetData } from "../../types";
import { getTileHeight, getTileWidth, isCompoundTile } from "../tileHelpers";

describe("tileHelpers", () => {
	const mockTileset: TilesetData = {
		version: "0.4.0",
		id: "test-tileset",
		name: "Test Tileset",
		filePath: "/test/tileset.lostset",
		imagePath: "/test/image.png",
		imageData: new Image(),
		order: 1,
		tileWidth: 16,
		tileHeight: 16,
		tiles: [],
		terrainLayers: [],
	};

	describe("isCompoundTile", () => {
		it("should return false for regular tiles with default dimensions", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(false);
		});

		it("should return false for tiles with width and height matching tileset defaults", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 16,
				height: 16,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(false);
		});

		it("should return true for tiles with custom width", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 32,
				height: 16,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(true);
		});

		it("should return true for tiles with custom height", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 16,
				height: 32,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(true);
		});

		it("should return true for tiles with both custom width and height", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 32,
				height: 48,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(true);
		});

		it("should return false when width is 0", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 0,
				height: 32,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(false);
		});

		it("should return false when height is 0", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 32,
				height: 0,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(isCompoundTile(tile, mockTileset)).toBe(false);
		});
	});

	describe("getTileWidth", () => {
		it("should return tile width when set", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 32,
				height: 16,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(getTileWidth(tile, mockTileset)).toBe(32);
		});

		it("should return tileset default width when tile width is 0", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 0,
				height: 16,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(getTileWidth(tile, mockTileset)).toBe(16);
		});
	});

	describe("getTileHeight", () => {
		it("should return tile height when set", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 16,
				height: 48,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(getTileHeight(tile, mockTileset)).toBe(48);
		});

		it("should return tileset default height when tile height is 0", () => {
			const tile: TileDefinition = {
				x: 0,
				y: 0,
				width: 16,
				height: 0,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			expect(getTileHeight(tile, mockTileset)).toBe(16);
		});
	});
});
