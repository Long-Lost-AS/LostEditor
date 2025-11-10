import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	FileOperationError,
	SerializationError,
	ValidationError,
} from "../../errors/FileErrors";
import { FileLoader } from "../FileLoader";
import { fileManager } from "../FileManager";

// Mock Tauri file system
vi.mock("@tauri-apps/plugin-fs", () => ({
	readTextFile: vi.fn(),
	writeTextFile: vi.fn(),
}));

// Test schema and types
const TestSchema = z.object({
	id: z.string(),
	name: z.string(),
	count: z.number(),
});

type TestJson = z.infer<typeof TestSchema>;

interface TestData extends TestJson {
	loaded: boolean; // Runtime field added in postProcess
}

// Concrete implementation for testing
class TestFileLoader extends FileLoader<TestData, TestJson> {
	protected get schema() {
		return TestSchema;
	}

	protected prepareForSave(data: TestData): TestJson {
		// Remove runtime field
		const { loaded: _loaded, ...json } = data;
		return json;
	}

	protected async postProcess(
		validated: TestJson,
		_filePath: string,
	): Promise<TestData> {
		// Add runtime field
		return {
			...validated,
			loaded: true,
		};
	}
}

describe("FileLoader", () => {
	let loader: TestFileLoader;
	const mockReadTextFile = readTextFile as ReturnType<typeof vi.fn>;
	const mockWriteTextFile = writeTextFile as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		loader = new TestFileLoader();
		vi.clearAllMocks();
		vi.spyOn(fileManager, "resolvePath").mockImplementation(
			(path) => `/absolute/${path}`,
		);
		vi.spyOn(fileManager, "normalize").mockImplementation((path) =>
			path.toLowerCase(),
		);
	});

	describe("load", () => {
		it("should load and cache file successfully", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			const result = await loader.load("test.json");

			expect(result).toEqual({
				...testData,
				loaded: true,
			});
			expect(mockReadTextFile).toHaveBeenCalledWith("/absolute/test.json");
		});

		it("should return cached data on subsequent loads", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			const result1 = await loader.load("test.json");
			const result2 = await loader.load("test.json");

			expect(result1).toBe(result2); // Same object reference
			expect(mockReadTextFile).toHaveBeenCalledTimes(1); // Only loaded once
		});

		it("should handle concurrent loads without duplicate requests", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(() => resolve(JSON.stringify(testData)), 10),
					),
			);

			// Start two loads concurrently
			const [result1, result2] = await Promise.all([
				loader.load("test.json"),
				loader.load("test.json"),
			]);

			expect(result1).toBe(result2); // Same object reference
			expect(mockReadTextFile).toHaveBeenCalledTimes(1); // Only one actual load
		});

		it("should throw ValidationError for invalid data", async () => {
			const invalidData = { id: "test-1", name: "Test" }; // Missing 'count'
			mockReadTextFile.mockResolvedValue(JSON.stringify(invalidData));

			await expect(loader.load("test.json")).rejects.toThrow(ValidationError);
		});

		it("should throw FileOperationError for file read errors", async () => {
			mockReadTextFile.mockRejectedValue(new Error("File not found"));

			await expect(loader.load("test.json")).rejects.toThrow(
				FileOperationError,
			);
		});

		it("should throw FileOperationError for JSON parse errors", async () => {
			mockReadTextFile.mockResolvedValue("{ invalid json }");

			await expect(loader.load("test.json")).rejects.toThrow(
				FileOperationError,
			);
		});

		it("should rethrow non-Error objects", async () => {
			mockReadTextFile.mockRejectedValue("string error");

			await expect(loader.load("test.json")).rejects.toBe("string error");
		});
	});

	describe("save", () => {
		it("should save data and update cache", async () => {
			const testData: TestData = {
				id: "test-1",
				name: "Test",
				count: 42,
				loaded: true,
			};
			mockWriteTextFile.mockResolvedValue(undefined);

			await loader.save(testData, "test.json");

			expect(mockWriteTextFile).toHaveBeenCalledWith(
				"/absolute/test.json",
				JSON.stringify({ id: "test-1", name: "Test", count: 42 }, null, 2),
			);

			// Should be cached
			const cached = loader["cache"].get("/absolute/test.json");
			expect(cached).toBe(testData);
		});

		it("should throw FileOperationError for write errors", async () => {
			const testData: TestData = {
				id: "test-1",
				name: "Test",
				count: 42,
				loaded: true,
			};
			mockWriteTextFile.mockRejectedValue(new Error("Permission denied"));

			await expect(loader.save(testData, "test.json")).rejects.toThrow(
				FileOperationError,
			);
		});

		it("should throw SerializationError for JSON serialization errors", async () => {
			const testData: TestData = {
				id: "test-1",
				name: "Test",
				count: 42,
				loaded: true,
			};

			// Mock writeTextFile to throw a JSON-related error
			mockWriteTextFile.mockRejectedValue(
				new Error("Failed to serialize JSON"),
			);

			await expect(loader.save(testData, "test.json")).rejects.toThrow(
				SerializationError,
			);
		});

		it("should rethrow non-Error objects during save", async () => {
			const testData: TestData = {
				id: "test-1",
				name: "Test",
				count: 42,
				loaded: true,
			};
			mockWriteTextFile.mockRejectedValue("string error");

			await expect(loader.save(testData, "test.json")).rejects.toBe(
				"string error",
			);
		});
	});

	describe("updatePath", () => {
		it("should move cached data to new path", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			// Load and cache
			await loader.load("old.json");

			// Update path
			loader.updatePath("old.json", "new.json");

			// Old path should be removed
			expect(loader["cache"].has("/absolute/old.json")).toBe(false);

			// New path should have the data
			const cached = loader["cache"].get("/absolute/new.json");
			expect(cached).toBeDefined();
			expect(cached?.id).toBe("test-1");
		});

		it("should do nothing if old path is not cached", () => {
			loader.updatePath("old.json", "new.json");

			// Should not throw, just no-op
			expect(loader["cache"].has("/absolute/old.json")).toBe(false);
			expect(loader["cache"].has("/absolute/new.json")).toBe(false);
		});
	});

	describe("invalidate", () => {
		it("should remove file from cache", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			// Load and cache
			await loader.load("test.json");
			expect(loader["cache"].has("/absolute/test.json")).toBe(true);

			// Invalidate
			loader.invalidate("test.json");
			expect(loader["cache"].has("/absolute/test.json")).toBe(false);
		});

		it("should do nothing if file is not cached", () => {
			loader.invalidate("nonexistent.json");
			// Should not throw
			expect(loader["cache"].size).toBe(0);
		});
	});

	describe("clearCache", () => {
		it("should clear all cached data and loading promises", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			// Load and cache multiple files
			await loader.load("test1.json");
			await loader.load("test2.json");

			expect(loader["cache"].size).toBe(2);

			// Clear cache
			loader.clearCache();

			expect(loader["cache"].size).toBe(0);
			expect(loader["loadingPromises"].size).toBe(0);
		});
	});

	describe("getCachedPaths", () => {
		it("should return all cached paths", async () => {
			const testData = { id: "test-1", name: "Test", count: 42 };
			mockReadTextFile.mockResolvedValue(JSON.stringify(testData));

			// Load and cache multiple files
			await loader.load("test1.json");
			await loader.load("test2.json");

			const paths = loader.getCachedPaths();

			expect(paths).toHaveLength(2);
			expect(paths).toContain("/absolute/test1.json");
			expect(paths).toContain("/absolute/test2.json");
		});

		it("should return empty array when cache is empty", () => {
			const paths = loader.getCachedPaths();
			expect(paths).toEqual([]);
		});
	});
});
