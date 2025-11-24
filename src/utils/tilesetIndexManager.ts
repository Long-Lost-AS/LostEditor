/**
 * TilesetIndexManager handles allocation and tracking of tileset indices.
 * Ensures that each tileset has a unique numeric index that's persistent
 * across project loads, making tileset references deterministic.
 */
class TilesetIndexManager {
	private usedIndices = new Set<number>();

	/**
	 * Register an index as being in use
	 * @param index - The index to register
	 */
	registerIndex(index: number): void {
		this.usedIndices.add(index);
	}

	/**
	 * Get the next available index (lowest unused index)
	 * Note: Starts from 1 to avoid collision with empty tile (tileId = 0)
	 * @returns The next available index (minimum 1)
	 */
	getNextAvailableIndex(): number {
		let index = 1; // Start from 1 to avoid packTileId(0,0,0) = 0 collision
		while (this.usedIndices.has(index)) {
			index++;
		}
		this.usedIndices.add(index);
		return index;
	}

	/**
	 * Release an index when a tileset is unloaded
	 * @param index - The index to release
	 */
	releaseIndex(index: number): void {
		this.usedIndices.delete(index);
	}

	/**
	 * Check if an index is currently in use
	 * @param index - The index to check
	 * @returns True if the index is in use
	 */
	isIndexUsed(index: number): boolean {
		return this.usedIndices.has(index);
	}

	/**
	 * Clear all registered indices (when loading a new project)
	 */
	clear(): void {
		this.usedIndices.clear();
	}

	/**
	 * Get all currently used indices
	 * @returns Array of used indices
	 */
	getUsedIndices(): number[] {
		return Array.from(this.usedIndices).sort((a, b) => a - b);
	}
}

// Export singleton instance
export const tilesetIndexManager = new TilesetIndexManager();
