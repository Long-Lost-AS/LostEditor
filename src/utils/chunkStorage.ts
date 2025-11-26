/**
 * Chunk-based tile storage utilities for infinite maps.
 *
 * Tiles are stored in 16x16 chunks, keyed by "chunkX,chunkY".
 * Supports negative coordinates for truly infinite maps.
 */

export const CHUNK_SIZE = 16;

/**
 * Convert world tile coordinates to chunk coordinates.
 * Works correctly for negative coordinates.
 */
export function worldToChunk(
	x: number,
	y: number,
): { chunkX: number; chunkY: number } {
	return {
		chunkX: Math.floor(x / CHUNK_SIZE),
		chunkY: Math.floor(y / CHUNK_SIZE),
	};
}

/**
 * Convert world tile coordinates to local position within a chunk.
 * Uses proper modulo (not remainder) to handle negative coordinates.
 */
export function worldToLocal(
	x: number,
	y: number,
): { localX: number; localY: number } {
	// JavaScript % is remainder, not modulo - need this for negatives
	const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return { localX, localY };
}

/**
 * Get chunk key string from chunk coordinates.
 */
export function getChunkKey(chunkX: number, chunkY: number): string {
	return `${chunkX},${chunkY}`;
}

/**
 * Parse chunk key string back to chunk coordinates.
 */
export function parseChunkKey(key: string): { chunkX: number; chunkY: number } {
	const [chunkX, chunkY] = key.split(",").map(Number);
	return { chunkX, chunkY };
}

/**
 * Get a tile from chunk storage.
 * Returns 0 (empty) for tiles in non-existent chunks.
 */
export function getTile(
	chunks: Map<string, number[]>,
	x: number,
	y: number,
): number {
	const { chunkX, chunkY } = worldToChunk(x, y);
	const key = getChunkKey(chunkX, chunkY);
	const chunk = chunks.get(key);
	if (!chunk) return 0; // Empty tile for missing chunks

	const { localX, localY } = worldToLocal(x, y);
	const index = localY * CHUNK_SIZE + localX;
	return chunk[index] ?? 0;
}

/**
 * Set a tile in chunk storage.
 * Creates the chunk if it doesn't exist.
 */
export function setTile(
	chunks: Map<string, number[]>,
	x: number,
	y: number,
	tileId: number,
): void {
	const { chunkX, chunkY } = worldToChunk(x, y);
	const key = getChunkKey(chunkX, chunkY);

	let chunk = chunks.get(key);
	if (!chunk) {
		chunk = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
		chunks.set(key, chunk);
	}

	const { localX, localY } = worldToLocal(x, y);
	const index = localY * CHUNK_SIZE + localX;
	chunk[index] = tileId;
}

/**
 * Check if a chunk is empty (all zeros).
 */
export function isChunkEmpty(chunk: number[]): boolean {
	return chunk.every((tile) => tile === 0);
}

/**
 * Remove all empty chunks from storage.
 * Useful for memory cleanup and before serialization.
 */
export function pruneEmptyChunks(chunks: Map<string, number[]>): void {
	for (const [key, chunk] of chunks) {
		if (isChunkEmpty(chunk)) {
			chunks.delete(key);
		}
	}
}

/**
 * Create an empty chunk (filled with zeros).
 */
export function createEmptyChunk(): number[] {
	return new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
}

/**
 * Clone a chunk storage map (deep copy).
 */
export function cloneChunks(
	chunks: Map<string, number[]>,
): Map<string, number[]> {
	const clone = new Map<string, number[]>();
	for (const [key, chunk] of chunks) {
		clone.set(key, [...chunk]);
	}
	return clone;
}

/**
 * Get the bounding box of all non-empty chunks.
 * Returns null if no chunks exist.
 */
export function getChunkBounds(
	chunks: Map<string, number[]>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
	if (chunks.size === 0) return null;

	let minChunkX = Number.POSITIVE_INFINITY;
	let minChunkY = Number.POSITIVE_INFINITY;
	let maxChunkX = Number.NEGATIVE_INFINITY;
	let maxChunkY = Number.NEGATIVE_INFINITY;

	for (const key of chunks.keys()) {
		const { chunkX, chunkY } = parseChunkKey(key);
		minChunkX = Math.min(minChunkX, chunkX);
		minChunkY = Math.min(minChunkY, chunkY);
		maxChunkX = Math.max(maxChunkX, chunkX);
		maxChunkY = Math.max(maxChunkY, chunkY);
	}

	return {
		minX: minChunkX * CHUNK_SIZE,
		minY: minChunkY * CHUNK_SIZE,
		maxX: (maxChunkX + 1) * CHUNK_SIZE - 1,
		maxY: (maxChunkY + 1) * CHUNK_SIZE - 1,
	};
}
