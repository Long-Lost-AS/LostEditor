/**
 * Base error class for all file operations
 */
export class FileOperationError extends Error {
	constructor(
		public operation: string,
		public filePath: string,
		public cause?: Error,
	) {
		super(
			`${operation} failed for ${filePath}${cause ? `: ${cause.message}` : ""}`,
		);
		this.name = "FileOperationError";

		// Maintain proper stack trace
		if (cause?.stack) {
			this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
		}
	}
}

/**
 * Thrown when a file cannot be found
 */
export class FileNotFoundError extends FileOperationError {
	constructor(filePath: string, operation: string = "Read") {
		super(operation, filePath);
		this.name = "FileNotFoundError";
		this.message = `File not found: ${filePath}`;
	}
}

/**
 * Thrown when file content fails schema validation
 */
export class ValidationError extends FileOperationError {
	constructor(
		filePath: string,
		public validationErrors: unknown,
		cause?: Error,
	) {
		super("Validation", filePath, cause);
		this.name = "ValidationError";
		this.message = `Validation failed for ${filePath}: ${JSON.stringify(validationErrors)}`;
	}
}

/**
 * Thrown when data cannot be serialized to JSON
 */
export class SerializationError extends FileOperationError {
	constructor(filePath: string, cause?: Error) {
		super("Serialization", filePath, cause);
		this.name = "SerializationError";
	}
}
