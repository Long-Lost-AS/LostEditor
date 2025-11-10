import { beforeEach, describe, expect, it } from "vitest";
import { tilesetIndexManager } from "../tilesetIndexManager";

describe("tilesetIndexManager", () => {
	beforeEach(() => {
		// Clear the manager before each test to ensure isolation
		tilesetIndexManager.clear();
	});

	describe("registerIndex", () => {
		it("should register a single index", () => {
			tilesetIndexManager.registerIndex(0);
			expect(tilesetIndexManager.isIndexUsed(0)).toBe(true);
		});

		it("should register multiple indices", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(5);

			expect(tilesetIndexManager.isIndexUsed(0)).toBe(true);
			expect(tilesetIndexManager.isIndexUsed(1)).toBe(true);
			expect(tilesetIndexManager.isIndexUsed(5)).toBe(true);
		});

		it("should handle registering the same index multiple times", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(0);

			expect(tilesetIndexManager.isIndexUsed(0)).toBe(true);
			expect(tilesetIndexManager.getUsedIndices()).toEqual([0]);
		});

		it("should register large indices", () => {
			tilesetIndexManager.registerIndex(1000);
			tilesetIndexManager.registerIndex(9999);

			expect(tilesetIndexManager.isIndexUsed(1000)).toBe(true);
			expect(tilesetIndexManager.isIndexUsed(9999)).toBe(true);
		});

		it("should register negative indices", () => {
			tilesetIndexManager.registerIndex(-1);
			tilesetIndexManager.registerIndex(-5);

			expect(tilesetIndexManager.isIndexUsed(-1)).toBe(true);
			expect(tilesetIndexManager.isIndexUsed(-5)).toBe(true);
		});
	});

	describe("getNextAvailableIndex", () => {
		it("should return 0 when no indices are used", () => {
			const index = tilesetIndexManager.getNextAvailableIndex();
			expect(index).toBe(0);
		});

		it("should return 1 when 0 is already used", () => {
			tilesetIndexManager.registerIndex(0);
			const index = tilesetIndexManager.getNextAvailableIndex();
			expect(index).toBe(1);
		});

		it("should return the lowest available index", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			const index = tilesetIndexManager.getNextAvailableIndex();
			expect(index).toBe(3);
		});

		it("should fill gaps in index sequence", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(2);
			tilesetIndexManager.registerIndex(3);

			const index = tilesetIndexManager.getNextAvailableIndex();
			expect(index).toBe(1); // Gap at 1
		});

		it("should automatically register the returned index", () => {
			const index = tilesetIndexManager.getNextAvailableIndex();
			expect(tilesetIndexManager.isIndexUsed(index)).toBe(true);
		});

		it("should return sequential indices when called multiple times", () => {
			const index1 = tilesetIndexManager.getNextAvailableIndex();
			const index2 = tilesetIndexManager.getNextAvailableIndex();
			const index3 = tilesetIndexManager.getNextAvailableIndex();

			expect(index1).toBe(0);
			expect(index2).toBe(1);
			expect(index3).toBe(2);
		});

		it("should handle gaps correctly", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(2);
			tilesetIndexManager.registerIndex(4);

			const index1 = tilesetIndexManager.getNextAvailableIndex();
			const index2 = tilesetIndexManager.getNextAvailableIndex();

			expect(index1).toBe(1);
			expect(index2).toBe(3);
		});
	});

	describe("releaseIndex", () => {
		it("should release a registered index", () => {
			tilesetIndexManager.registerIndex(0);
			expect(tilesetIndexManager.isIndexUsed(0)).toBe(true);

			tilesetIndexManager.releaseIndex(0);
			expect(tilesetIndexManager.isIndexUsed(0)).toBe(false);
		});

		it("should allow reusing released indices", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);

			tilesetIndexManager.releaseIndex(0);

			const nextIndex = tilesetIndexManager.getNextAvailableIndex();
			expect(nextIndex).toBe(0); // 0 is now available again
		});

		it("should handle releasing non-existent indices gracefully", () => {
			tilesetIndexManager.releaseIndex(999);
			// Should not throw, just do nothing
			expect(tilesetIndexManager.isIndexUsed(999)).toBe(false);
		});

		it("should handle releasing the same index multiple times", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.releaseIndex(0);
			tilesetIndexManager.releaseIndex(0);
			tilesetIndexManager.releaseIndex(0);

			expect(tilesetIndexManager.isIndexUsed(0)).toBe(false);
		});

		it("should update getUsedIndices after release", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			tilesetIndexManager.releaseIndex(1);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 2]);
		});
	});

	describe("isIndexUsed", () => {
		it("should return false for unused index", () => {
			expect(tilesetIndexManager.isIndexUsed(0)).toBe(false);
			expect(tilesetIndexManager.isIndexUsed(100)).toBe(false);
		});

		it("should return true for used index", () => {
			tilesetIndexManager.registerIndex(5);
			expect(tilesetIndexManager.isIndexUsed(5)).toBe(true);
		});

		it("should return false after index is released", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.releaseIndex(0);

			expect(tilesetIndexManager.isIndexUsed(0)).toBe(false);
		});

		it("should handle checking negative indices", () => {
			tilesetIndexManager.registerIndex(-1);
			expect(tilesetIndexManager.isIndexUsed(-1)).toBe(true);
			expect(tilesetIndexManager.isIndexUsed(-2)).toBe(false);
		});
	});

	describe("clear", () => {
		it("should clear all registered indices", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			tilesetIndexManager.clear();

			expect(tilesetIndexManager.isIndexUsed(0)).toBe(false);
			expect(tilesetIndexManager.isIndexUsed(1)).toBe(false);
			expect(tilesetIndexManager.isIndexUsed(2)).toBe(false);
		});

		it("should reset to initial state", () => {
			tilesetIndexManager.registerIndex(5);
			tilesetIndexManager.registerIndex(10);

			tilesetIndexManager.clear();

			const nextIndex = tilesetIndexManager.getNextAvailableIndex();
			expect(nextIndex).toBe(0);
		});

		it("should clear empty manager gracefully", () => {
			tilesetIndexManager.clear();
			tilesetIndexManager.clear();

			expect(tilesetIndexManager.getUsedIndices()).toEqual([]);
		});

		it("should return empty array after clear", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);

			tilesetIndexManager.clear();

			expect(tilesetIndexManager.getUsedIndices()).toEqual([]);
		});
	});

	describe("getUsedIndices", () => {
		it("should return empty array when no indices used", () => {
			expect(tilesetIndexManager.getUsedIndices()).toEqual([]);
		});

		it("should return array of used indices", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 1, 2]);
		});

		it("should return sorted indices", () => {
			tilesetIndexManager.registerIndex(5);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(10);
			tilesetIndexManager.registerIndex(3);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([1, 3, 5, 10]);
		});

		it("should handle negative indices in sorting", () => {
			tilesetIndexManager.registerIndex(-5);
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(5);
			tilesetIndexManager.registerIndex(-1);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([-5, -1, 0, 5]);
		});

		it("should exclude released indices", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			tilesetIndexManager.releaseIndex(1);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 2]);
		});

		it("should not include duplicates", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(0);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0]);
		});
	});

	describe("integration scenarios", () => {
		it("should handle typical project lifecycle", () => {
			// Load project with 3 tilesets
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 1, 2]);

			// Add a new tileset
			const newIndex = tilesetIndexManager.getNextAvailableIndex();
			expect(newIndex).toBe(3);

			// Remove middle tileset
			tilesetIndexManager.releaseIndex(1);

			// Add another tileset (should reuse 1)
			const anotherIndex = tilesetIndexManager.getNextAvailableIndex();
			expect(anotherIndex).toBe(1);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 1, 2, 3]);
		});

		it("should handle project switch", () => {
			// Project 1
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);

			// Switch to project 2
			tilesetIndexManager.clear();

			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(1);
			tilesetIndexManager.registerIndex(2);

			expect(tilesetIndexManager.getUsedIndices()).toEqual([0, 1, 2]);
		});

		it("should handle many tilesets", () => {
			// Register 100 tilesets
			for (let i = 0; i < 100; i++) {
				const index = tilesetIndexManager.getNextAvailableIndex();
				expect(index).toBe(i);
			}

			expect(tilesetIndexManager.getUsedIndices().length).toBe(100);
		});

		it("should handle sparse index allocation", () => {
			tilesetIndexManager.registerIndex(0);
			tilesetIndexManager.registerIndex(10);
			tilesetIndexManager.registerIndex(20);
			tilesetIndexManager.registerIndex(30);

			// Should fill gaps first
			expect(tilesetIndexManager.getNextAvailableIndex()).toBe(1);
			expect(tilesetIndexManager.getNextAvailableIndex()).toBe(2);
		});

		it("should maintain consistency after multiple operations", () => {
			for (let i = 0; i < 10; i++) {
				tilesetIndexManager.registerIndex(i);
			}

			// Release every other index
			for (let i = 0; i < 10; i += 2) {
				tilesetIndexManager.releaseIndex(i);
			}

			expect(tilesetIndexManager.getUsedIndices()).toEqual([1, 3, 5, 7, 9]);

			// Get next available should fill gaps
			expect(tilesetIndexManager.getNextAvailableIndex()).toBe(0);
			expect(tilesetIndexManager.getNextAvailableIndex()).toBe(2);
			expect(tilesetIndexManager.getNextAvailableIndex()).toBe(4);
		});
	});
});
