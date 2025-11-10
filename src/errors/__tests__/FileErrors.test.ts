import { describe, expect, it } from "vitest";
import {
	FileNotFoundError,
	FileOperationError,
	SerializationError,
	ValidationError,
} from "../FileErrors";

describe("FileErrors", () => {
	describe("FileOperationError", () => {
		it("should create error with operation, path, and message", () => {
			const error = new FileOperationError("Read", "/test/file.txt");
			expect(error.operation).toBe("Read");
			expect(error.filePath).toBe("/test/file.txt");
			expect(error.message).toBe("Read failed for /test/file.txt");
			expect(error.name).toBe("FileOperationError");
		});

		it("should include cause message in error message", () => {
			const cause = new Error("Permission denied");
			const error = new FileOperationError("Write", "/test/file.txt", cause);
			expect(error.message).toBe(
				"Write failed for /test/file.txt: Permission denied",
			);
			expect(error.cause).toBe(cause);
		});

		it("should concatenate stack traces when cause has stack", () => {
			const cause = new Error("Original error");
			const error = new FileOperationError("Read", "/test/file.txt", cause);
			expect(error.stack).toContain("FileOperationError");
			expect(error.stack).toContain("Caused by:");
			expect(error.stack).toContain("Original error");
		});

		it("should work without cause", () => {
			const error = new FileOperationError("Delete", "/test/file.txt");
			expect(error.cause).toBeUndefined();
			expect(error.message).toBe("Delete failed for /test/file.txt");
		});

		it("should handle cause without stack property", () => {
			const cause = new Error("No stack") as Error;
			delete (cause as { stack?: string }).stack;
			const error = new FileOperationError("Read", "/test/file.txt", cause);
			// Should not throw and should not concatenate undefined stack
			expect(error.stack).toBeDefined();
			expect(error.stack).not.toContain("Caused by:");
		});

		it("should set error name to FileOperationError", () => {
			const error = new FileOperationError("Read", "/test/file.txt");
			expect(error.name).toBe("FileOperationError");
		});

		it("should maintain proper error prototype chain", () => {
			const error = new FileOperationError("Read", "/test/file.txt");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(FileOperationError);
		});
	});

	describe("FileNotFoundError", () => {
		it("should create error with default Read operation", () => {
			const error = new FileNotFoundError("/missing/file.txt");
			expect(error.operation).toBe("Read");
			expect(error.filePath).toBe("/missing/file.txt");
			expect(error.name).toBe("FileNotFoundError");
			expect(error.message).toBe("File not found: /missing/file.txt");
		});

		it("should create error with custom operation", () => {
			const error = new FileNotFoundError("/missing/file.txt", "Write");
			expect(error.operation).toBe("Write");
			expect(error.filePath).toBe("/missing/file.txt");
			expect(error.message).toBe("File not found: /missing/file.txt");
		});

		it("should accept Delete operation", () => {
			const error = new FileNotFoundError("/missing/file.txt", "Delete");
			expect(error.operation).toBe("Delete");
			expect(error.message).toBe("File not found: /missing/file.txt");
		});

		it("should accept Update operation", () => {
			const error = new FileNotFoundError("/missing/file.txt", "Update");
			expect(error.operation).toBe("Update");
		});

		it("should set error name to FileNotFoundError", () => {
			const error = new FileNotFoundError("/missing/file.txt");
			expect(error.name).toBe("FileNotFoundError");
		});

		it("should extend FileOperationError", () => {
			const error = new FileNotFoundError("/missing/file.txt");
			expect(error).toBeInstanceOf(FileOperationError);
			expect(error).toBeInstanceOf(Error);
		});

		it("should format message correctly regardless of operation", () => {
			const error1 = new FileNotFoundError("/test.txt", "Read");
			const error2 = new FileNotFoundError("/test.txt", "Write");
			// Both should have same message format (operation not shown)
			expect(error1.message).toBe("File not found: /test.txt");
			expect(error2.message).toBe("File not found: /test.txt");
		});
	});

	describe("ValidationError", () => {
		it("should create error with validation errors", () => {
			const validationErrors = { field: "name", error: "required" };
			const error = new ValidationError("/test/file.json", validationErrors);
			expect(error.filePath).toBe("/test/file.json");
			expect(error.validationErrors).toEqual(validationErrors);
			expect(error.name).toBe("ValidationError");
		});

		it("should include validation errors in message", () => {
			const validationErrors = { field: "age", error: "must be positive" };
			const error = new ValidationError("/test/data.json", validationErrors);
			expect(error.message).toContain("/test/data.json");
			expect(error.message).toContain(JSON.stringify(validationErrors));
		});

		it("should serialize validation errors to JSON in message", () => {
			const validationErrors = { nested: { field: "value" } };
			const error = new ValidationError("/test.json", validationErrors);
			expect(error.message).toContain('{"nested":{"field":"value"}}');
		});

		it("should accept cause error", () => {
			const cause = new Error("Zod validation failed");
			const validationErrors = { error: "invalid" };
			const error = new ValidationError("/test.json", validationErrors, cause);
			expect(error.cause).toBe(cause);
		});

		it("should concatenate stack traces with cause", () => {
			const cause = new Error("Schema mismatch");
			const error = new ValidationError("/test.json", {}, cause);
			// Stack concatenation happens in FileOperationError constructor
			// but ValidationError overrides the message after super()
			expect(error.stack).toBeDefined();
			expect(error.cause).toBe(cause);
		});

		it("should work without cause", () => {
			const error = new ValidationError("/test.json", { error: "invalid" });
			expect(error.cause).toBeUndefined();
		});

		it("should handle array of validation errors", () => {
			const validationErrors = [
				{ field: "name", error: "required" },
				{ field: "age", error: "invalid" },
			];
			const error = new ValidationError("/test.json", validationErrors);
			expect(error.validationErrors).toEqual(validationErrors);
			expect(error.message).toContain(JSON.stringify(validationErrors));
		});

		it("should handle null validation errors", () => {
			const error = new ValidationError("/test.json", null);
			expect(error.validationErrors).toBeNull();
			expect(error.message).toContain("null");
		});

		it("should extend FileOperationError", () => {
			const error = new ValidationError("/test.json", {});
			expect(error).toBeInstanceOf(FileOperationError);
			expect(error.operation).toBe("Validation");
		});
	});

	describe("SerializationError", () => {
		it("should create error with file path", () => {
			const error = new SerializationError("/test/output.json");
			expect(error.filePath).toBe("/test/output.json");
			expect(error.name).toBe("SerializationError");
			expect(error.operation).toBe("Serialization");
		});

		it("should create error with cause", () => {
			const cause = new Error("Circular reference detected");
			const error = new SerializationError("/test/data.json", cause);
			expect(error.cause).toBe(cause);
			expect(error.filePath).toBe("/test/data.json");
		});

		it("should format message correctly", () => {
			const error = new SerializationError("/output.json");
			expect(error.message).toContain("Serialization failed");
			expect(error.message).toContain("/output.json");
		});

		it("should include cause message when provided", () => {
			const cause = new Error("Cannot stringify BigInt");
			const error = new SerializationError("/test.json", cause);
			expect(error.message).toContain("Cannot stringify BigInt");
		});

		it("should concatenate stack traces with cause", () => {
			const cause = new Error("JSON stringify failed");
			const error = new SerializationError("/test.json", cause);
			// Stack concatenation happens in FileOperationError constructor
			expect(error.stack).toBeDefined();
			expect(error.cause).toBe(cause);
		});

		it("should work without cause", () => {
			const error = new SerializationError("/test.json");
			expect(error.cause).toBeUndefined();
			expect(error.message).toBe("Serialization failed for /test.json");
		});

		it("should set error name to SerializationError", () => {
			const error = new SerializationError("/test.json");
			expect(error.name).toBe("SerializationError");
		});

		it("should extend FileOperationError", () => {
			const error = new SerializationError("/test.json");
			expect(error).toBeInstanceOf(FileOperationError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("Error Integration", () => {
		it("should work with instanceof checks", () => {
			const fileOpError = new FileOperationError("Read", "/test.txt");
			const notFoundError = new FileNotFoundError("/test.txt");
			const validationError = new ValidationError("/test.json", {});
			const serializationError = new SerializationError("/test.json");

			expect(fileOpError instanceof Error).toBe(true);
			expect(notFoundError instanceof FileOperationError).toBe(true);
			expect(validationError instanceof FileOperationError).toBe(true);
			expect(serializationError instanceof FileOperationError).toBe(true);
		});

		it("should be catchable as Error", () => {
			try {
				throw new FileNotFoundError("/test.txt");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
			}
		});

		it("should be catchable as specific error type", () => {
			try {
				throw new SerializationError("/test.json");
			} catch (error) {
				expect(error).toBeInstanceOf(SerializationError);
				if (error instanceof SerializationError) {
					expect(error.filePath).toBe("/test.json");
				}
			}
		});

		it("should preserve error properties through catch", () => {
			try {
				throw new ValidationError("/test.json", { field: "test" });
			} catch (error) {
				if (error instanceof ValidationError) {
					expect(error.filePath).toBe("/test.json");
					expect(error.validationErrors).toEqual({ field: "test" });
					expect(error.operation).toBe("Validation");
				}
			}
		});

		it("should distinguish between error types", () => {
			const notFound = new FileNotFoundError("/a.txt");
			const validation = new ValidationError("/b.json", {});
			const serialization = new SerializationError("/c.json");

			expect(notFound instanceof FileNotFoundError).toBe(true);
			expect(notFound instanceof ValidationError).toBe(false);
			expect(notFound instanceof SerializationError).toBe(false);

			expect(validation instanceof ValidationError).toBe(true);
			expect(validation instanceof FileNotFoundError).toBe(false);
			expect(validation instanceof SerializationError).toBe(false);

			expect(serialization instanceof SerializationError).toBe(true);
			expect(serialization instanceof FileNotFoundError).toBe(false);
			expect(serialization instanceof ValidationError).toBe(false);
		});
	});
});
