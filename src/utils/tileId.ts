/**
 * Tile ID Packing Utilities
 *
 * Packs tile sprite position, tileset hash, and flip flags into a single 48-bit number.
 * Width and height are NOT packed - they are looked up from the tileset definition.
 *
 * Bit Layout (48 bits, safely within JavaScript's 53-bit integer limit):
 * - Bits  0-15: sprite x (0-65535 pixels) - position in tileset image
 * - Bits 16-31: sprite y (0-65535 pixels) - position in tileset image
 * - Bits 32-45: tileset hash (14-bit hash of tileset ID)
 * - Bit  46: flipX
 * - Bit  47: flipY
 * - Bits 48-49: reserved for future use
 */

const MAX_SPRITE_COORD = 65535; // 16 bits = 2^16 - 1
const MAX_TILESET_HASH = 16383; // 14 bits = 2^14 - 1
const MASK_16_BITS = 0xffff; // 65535
const MASK_14_BITS = 0x3fff; // 16383

/**
 * Generates a 14-bit hash from a tileset ID string
 * Uses a simple but consistent hashing algorithm
 */
export function hashTilesetId(tilesetId: string): number {
	let hash = 0;
	for (let i = 0; i < tilesetId.length; i++) {
		const char = tilesetId.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	// Ensure positive and within 14-bit range
	return Math.abs(hash) & MASK_14_BITS;
}

export interface TileGeometry {
	x: number;
	y: number;
	tilesetHash: number;
	flipX: boolean;
	flipY: boolean;
}

/**
 * Packs tile sprite position, tileset hash, and flip flags into a single number
 * Note: Width and height are looked up from the tileset definition, not packed
 */
export function packTileId(
	x: number,
	y: number,
	tilesetHash: number,
	flipX: boolean = false,
	flipY: boolean = false,
): number {
	// Validate inputs
	if (x < 0 || x > MAX_SPRITE_COORD) {
		throw new Error(
			`Tile sprite x coordinate ${x} out of range (0-${MAX_SPRITE_COORD})`,
		);
	}
	if (y < 0 || y > MAX_SPRITE_COORD) {
		throw new Error(
			`Tile sprite y coordinate ${y} out of range (0-${MAX_SPRITE_COORD})`,
		);
	}
	if (tilesetHash < 0 || tilesetHash > MAX_TILESET_HASH) {
		throw new Error(
			`Tileset hash ${tilesetHash} out of range (0-${MAX_TILESET_HASH})`,
		);
	}

	// Pack the values
	// Bits 0-15: sprite x
	let packed = x;

	// Bits 16-31: sprite y (use bitwise OR since it's within 32 bits)
	packed |= y << 16;

	// Bits 32-45: tileset hash (use multiplication since shift > 32 doesn't work in JS)
	packed += tilesetHash * 2 ** 32;

	// Bit 46: flipX (use multiplication for bits beyond 32)
	if (flipX) {
		packed += 2 ** 46;
	}

	// Bit 47: flipY (use multiplication for bits beyond 32)
	if (flipY) {
		packed += 2 ** 47;
	}

	return packed;
}

/**
 * Unpacks a tile ID into its sprite position, tileset hash, and flip flags
 * Note: Width and height must be looked up from the tileset definition
 */
export function unpackTileId(tileId: number): TileGeometry {
	// Handle 0 (empty tile)
	if (tileId === 0) {
		return { x: 0, y: 0, tilesetHash: 0, flipX: false, flipY: false };
	}

	// Extract each component
	// Bits 0-15: sprite x (bitwise AND works fine)
	const x = tileId & MASK_16_BITS;

	// Bits 16-31: sprite y (bitwise shift works within 32 bits)
	const y = (tileId >> 16) & MASK_16_BITS;

	// Bits 32-45: tileset hash (use division since shift > 32 doesn't work in JS)
	const tilesetHash = Math.floor(tileId / 2 ** 32) & MASK_14_BITS;

	// Bit 46: flipX (use division to access bits beyond 32)
	const flipX = (Math.floor(tileId / 2 ** 46) & 1) === 1;

	// Bit 47: flipY (use division to access bits beyond 32)
	const flipY = (Math.floor(tileId / 2 ** 47) & 1) === 1;

	return { x, y, tilesetHash, flipX, flipY };
}

/**
 * Creates a new tile ID with flips applied
 */
export function setFlips(
	tileId: number,
	flipX: boolean,
	flipY: boolean,
): number {
	const geometry = unpackTileId(tileId);
	return packTileId(geometry.x, geometry.y, geometry.tilesetHash, flipX, flipY);
}

/**
 * Gets the base tile ID without flip flags (for looking up tile properties)
 */
export function getBaseTileId(tileId: number): number {
	const geometry = unpackTileId(tileId);
	return packTileId(geometry.x, geometry.y, geometry.tilesetHash, false, false);
}

/**
 * Checks if two tile IDs represent the same geometry (ignoring flips)
 */
export function isSameGeometry(tileId1: number, tileId2: number): boolean {
	return getBaseTileId(tileId1) === getBaseTileId(tileId2);
}
