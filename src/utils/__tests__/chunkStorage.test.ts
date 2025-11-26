import { describe, expect, it } from "vitest";
import {
	CHUNK_SIZE,
	cloneChunks,
	createEmptyChunk,
	getChunkBounds,
	getChunkKey,
	getTile,
	isChunkEmpty,
	parseChunkKey,
	pruneEmptyChunks,
	setTile,
	worldToChunk,
	worldToLocal,
} from "../chunkStorage";

describe("chunkStorage", () => {
	describe("worldToChunk", () => {
		it("should convert positive coordinates to chunk coordinates", () => {
			expect(worldToChunk(0, 0)).toEqual({ chunkX: 0, chunkY: 0 });
			expect(worldToChunk(15, 15)).toEqual({ chunkX: 0, chunkY: 0 });
			expect(worldToChunk(16, 16)).toEqual({ chunkX: 1, chunkY: 1 });
			expect(worldToChunk(31, 31)).toEqual({ chunkX: 1, chunkY: 1 });
			expect(worldToChunk(32, 32)).toEqual({ chunkX: 2, chunkY: 2 });
		});

		it("should convert negative coordinates to chunk coordinates", () => {
			expect(worldToChunk(-1, -1)).toEqual({ chunkX: -1, chunkY: -1 });
			expect(worldToChunk(-16, -16)).toEqual({ chunkX: -1, chunkY: -1 });
			expect(worldToChunk(-17, -17)).toEqual({ chunkX: -2, chunkY: -2 });
			expect(worldToChunk(-32, -32)).toEqual({ chunkX: -2, chunkY: -2 });
		});

		it("should handle mixed positive/negative coordinates", () => {
			expect(worldToChunk(-1, 0)).toEqual({ chunkX: -1, chunkY: 0 });
			expect(worldToChunk(0, -1)).toEqual({ chunkX: 0, chunkY: -1 });
			expect(worldToChunk(16, -16)).toEqual({ chunkX: 1, chunkY: -1 });
		});
	});

	describe("worldToLocal", () => {
		it("should convert positive coordinates to local coordinates", () => {
			expect(worldToLocal(0, 0)).toEqual({ localX: 0, localY: 0 });
			expect(worldToLocal(15, 15)).toEqual({ localX: 15, localY: 15 });
			expect(worldToLocal(16, 16)).toEqual({ localX: 0, localY: 0 });
			expect(worldToLocal(17, 17)).toEqual({ localX: 1, localY: 1 });
		});

		it("should convert negative coordinates to local coordinates", () => {
			// -1 should be at local position 15 (last position in chunk -1)
			expect(worldToLocal(-1, -1)).toEqual({ localX: 15, localY: 15 });
			// -16 should be at local position 0 (first position in chunk -1)
			expect(worldToLocal(-16, -16)).toEqual({ localX: 0, localY: 0 });
			// -17 should be at local position 15 (last position in chunk -2)
			expect(worldToLocal(-17, -17)).toEqual({ localX: 15, localY: 15 });
		});

		it("should always return values in range [0, CHUNK_SIZE)", () => {
			for (let i = -200; i <= 200; i++) {
				const { localX, localY } = worldToLocal(i, i);
				expect(localX).toBeGreaterThanOrEqual(0);
				expect(localX).toBeLessThan(CHUNK_SIZE);
				expect(localY).toBeGreaterThanOrEqual(0);
				expect(localY).toBeLessThan(CHUNK_SIZE);
			}
		});
	});

	describe("getChunkKey / parseChunkKey", () => {
		it("should create and parse positive chunk keys", () => {
			expect(getChunkKey(0, 0)).toBe("0,0");
			expect(getChunkKey(1, 2)).toBe("1,2");
			expect(parseChunkKey("0,0")).toEqual({ chunkX: 0, chunkY: 0 });
			expect(parseChunkKey("1,2")).toEqual({ chunkX: 1, chunkY: 2 });
		});

		it("should create and parse negative chunk keys", () => {
			expect(getChunkKey(-1, -1)).toBe("-1,-1");
			expect(getChunkKey(-10, 5)).toBe("-10,5");
			expect(parseChunkKey("-1,-1")).toEqual({ chunkX: -1, chunkY: -1 });
			expect(parseChunkKey("-10,5")).toEqual({ chunkX: -10, chunkY: 5 });
		});

		it("should round-trip chunk keys", () => {
			const coords = [
				{ chunkX: 0, chunkY: 0 },
				{ chunkX: 10, chunkY: 20 },
				{ chunkX: -5, chunkY: -10 },
				{ chunkX: -100, chunkY: 100 },
			];
			for (const coord of coords) {
				const key = getChunkKey(coord.chunkX, coord.chunkY);
				expect(parseChunkKey(key)).toEqual(coord);
			}
		});
	});

	describe("getTile / setTile", () => {
		it("should get and set tiles at positive coordinates", () => {
			const chunks = new Map<string, number[]>();

			setTile(chunks, 0, 0, 123);
			expect(getTile(chunks, 0, 0)).toBe(123);

			setTile(chunks, 15, 15, 456);
			expect(getTile(chunks, 15, 15)).toBe(456);

			setTile(chunks, 16, 16, 789);
			expect(getTile(chunks, 16, 16)).toBe(789);
		});

		it("should get and set tiles at negative coordinates", () => {
			const chunks = new Map<string, number[]>();

			setTile(chunks, -1, -1, 111);
			expect(getTile(chunks, -1, -1)).toBe(111);

			setTile(chunks, -16, -16, 222);
			expect(getTile(chunks, -16, -16)).toBe(222);

			setTile(chunks, -17, -17, 333);
			expect(getTile(chunks, -17, -17)).toBe(333);
		});

		it("should return 0 for unset tiles", () => {
			const chunks = new Map<string, number[]>();
			expect(getTile(chunks, 0, 0)).toBe(0);
			expect(getTile(chunks, 100, 100)).toBe(0);
			expect(getTile(chunks, -50, -50)).toBe(0);
		});

		it("should return 0 for sparse chunk with undefined index", () => {
			const chunks = new Map<string, number[]>();
			// Create a sparse array with undefined values
			const sparseChunk: number[] = [];
			sparseChunk[0] = 123;
			// Most indices are undefined (sparse array)
			chunks.set("0,0", sparseChunk);

			// Index 0 should return the set value
			expect(getTile(chunks, 0, 0)).toBe(123);
			// Other indices should return 0 via nullish coalescing
			expect(getTile(chunks, 1, 0)).toBe(0);
			expect(getTile(chunks, 15, 15)).toBe(0);
		});

		it("should create chunks on demand when setting tiles", () => {
			const chunks = new Map<string, number[]>();
			expect(chunks.size).toBe(0);

			setTile(chunks, 0, 0, 1);
			expect(chunks.size).toBe(1);
			expect(chunks.has("0,0")).toBe(true);

			setTile(chunks, 16, 0, 1);
			expect(chunks.size).toBe(2);
			expect(chunks.has("1,0")).toBe(true);

			setTile(chunks, -1, -1, 1);
			expect(chunks.size).toBe(3);
			expect(chunks.has("-1,-1")).toBe(true);
		});

		it("should not affect other tiles in the same chunk", () => {
			const chunks = new Map<string, number[]>();

			setTile(chunks, 0, 0, 100);
			setTile(chunks, 1, 1, 200);
			setTile(chunks, 15, 15, 300);

			expect(getTile(chunks, 0, 0)).toBe(100);
			expect(getTile(chunks, 1, 1)).toBe(200);
			expect(getTile(chunks, 15, 15)).toBe(300);
			expect(getTile(chunks, 2, 2)).toBe(0);
		});
	});

	describe("isChunkEmpty", () => {
		it("should return true for empty chunk", () => {
			const chunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			expect(isChunkEmpty(chunk)).toBe(true);
		});

		it("should return false for chunk with any non-zero tile", () => {
			const chunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			chunk[0] = 1;
			expect(isChunkEmpty(chunk)).toBe(false);

			const chunk2 = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			chunk2[CHUNK_SIZE * CHUNK_SIZE - 1] = 1;
			expect(isChunkEmpty(chunk2)).toBe(false);
		});
	});

	describe("pruneEmptyChunks", () => {
		it("should remove empty chunks", () => {
			const chunks = new Map<string, number[]>();

			// Create an empty chunk
			const emptyChunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			chunks.set("0,0", emptyChunk);

			// Create a non-empty chunk
			const nonEmptyChunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
			nonEmptyChunk[0] = 123;
			chunks.set("1,0", nonEmptyChunk);

			expect(chunks.size).toBe(2);

			pruneEmptyChunks(chunks);

			expect(chunks.size).toBe(1);
			expect(chunks.has("0,0")).toBe(false);
			expect(chunks.has("1,0")).toBe(true);
		});

		it("should handle all empty chunks", () => {
			const chunks = new Map<string, number[]>();
			chunks.set("0,0", new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0));
			chunks.set("1,1", new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0));

			pruneEmptyChunks(chunks);

			expect(chunks.size).toBe(0);
		});
	});

	describe("createEmptyChunk", () => {
		it("should create a chunk of correct size filled with zeros", () => {
			const chunk = createEmptyChunk();
			expect(chunk.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
			expect(chunk.every((tile) => tile === 0)).toBe(true);
		});
	});

	describe("cloneChunks", () => {
		it("should create a deep copy of chunks", () => {
			const chunks = new Map<string, number[]>();
			setTile(chunks, 0, 0, 123);
			setTile(chunks, 16, 16, 456);

			const clone = cloneChunks(chunks);

			// Should have same content
			expect(getTile(clone, 0, 0)).toBe(123);
			expect(getTile(clone, 16, 16)).toBe(456);

			// Should be independent
			setTile(chunks, 0, 0, 999);
			expect(getTile(clone, 0, 0)).toBe(123);
		});
	});

	describe("getChunkBounds", () => {
		it("should return null for empty chunks", () => {
			const chunks = new Map<string, number[]>();
			expect(getChunkBounds(chunks)).toBeNull();
		});

		it("should return bounds for single chunk at origin", () => {
			const chunks = new Map<string, number[]>();
			setTile(chunks, 0, 0, 1);

			const bounds = getChunkBounds(chunks);
			expect(bounds).toEqual({
				minX: 0,
				minY: 0,
				maxX: 15,
				maxY: 15,
			});
		});

		it("should return bounds for multiple positive chunks", () => {
			const chunks = new Map<string, number[]>();
			setTile(chunks, 0, 0, 1);
			setTile(chunks, 32, 16, 1);

			const bounds = getChunkBounds(chunks);
			expect(bounds).toEqual({
				minX: 0,
				minY: 0,
				maxX: 47, // chunk 2 ends at 48-1
				maxY: 31, // chunk 1 ends at 32-1
			});
		});

		it("should return bounds for negative chunks", () => {
			const chunks = new Map<string, number[]>();
			setTile(chunks, -16, -16, 1);
			setTile(chunks, -1, -1, 1);

			const bounds = getChunkBounds(chunks);
			expect(bounds).toEqual({
				minX: -16,
				minY: -16,
				maxX: -1,
				maxY: -1,
			});
		});

		it("should return bounds spanning positive and negative", () => {
			const chunks = new Map<string, number[]>();
			setTile(chunks, -16, -16, 1);
			setTile(chunks, 16, 16, 1);

			const bounds = getChunkBounds(chunks);
			expect(bounds).toEqual({
				minX: -16,
				minY: -16,
				maxX: 31,
				maxY: 31,
			});
		});
	});
});
