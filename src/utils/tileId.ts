/**
 * Tile ID Packing Utilities
 *
 * Packs tile geometry and flip flags into a single 64-bit integer.
 *
 * Bit Layout (51 bits used, 13 reserved):
 * - Bits  0-11: source x (0-4095 pixels)
 * - Bits 12-23: source y (0-4095 pixels)
 * - Bits 24-35: width (0-4095 pixels)
 * - Bits 36-47: height (0-4095 pixels)
 * - Bit  48: flipX
 * - Bit  49: flipY
 * - Bit  50: isCompound (marks compound tiles)
 * - Bits 51-63: reserved for future use
 */

const MAX_VALUE = 4095; // 12 bits = 2^12 - 1
const MASK_12_BITS = 0xFFF; // 4095 in binary: 111111111111

export interface TileGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
  isCompound: boolean;
}

/**
 * Packs tile geometry and flip flags into a single integer
 */
export function packTileId(
  x: number,
  y: number,
  width: number,
  height: number,
  flipX: boolean = false,
  flipY: boolean = false,
  isCompound: boolean = false
): number {
  // Validate inputs
  if (x < 0 || x > MAX_VALUE) {
    throw new Error(`Tile x coordinate ${x} out of range (0-${MAX_VALUE})`);
  }
  if (y < 0 || y > MAX_VALUE) {
    throw new Error(`Tile y coordinate ${y} out of range (0-${MAX_VALUE})`);
  }
  if (width < 0 || width > MAX_VALUE) {
    throw new Error(`Tile width ${width} out of range (0-${MAX_VALUE})`);
  }
  if (height < 0 || height > MAX_VALUE) {
    throw new Error(`Tile height ${height} out of range (0-${MAX_VALUE})`);
  }

  // Pack the values using multiplication (JS bitwise ops only work on 32-bit)
  // Bits 0-11: x
  let packed = x;

  // Bits 12-23: y
  packed += y * Math.pow(2, 12);

  // Bits 24-35: width
  packed += width * Math.pow(2, 24);

  // Bits 36-47: height
  packed += height * Math.pow(2, 36);

  // Bit 48: flipX
  if (flipX) {
    packed += Math.pow(2, 48);
  }

  // Bit 49: flipY
  if (flipY) {
    packed += Math.pow(2, 49);
  }

  // Bit 50: isCompound
  if (isCompound) {
    packed += Math.pow(2, 50);
  }

  return packed;
}

/**
 * Unpacks a tile ID into its geometry and flip flags
 */
export function unpackTileId(tileId: number): TileGeometry {
  // Extract each component using division/modulo (JS bitwise ops only work on 32-bit)
  let remaining = tileId;

  // Bits 0-11: x
  const x = Math.floor(remaining % Math.pow(2, 12));
  remaining = Math.floor(remaining / Math.pow(2, 12));

  // Bits 12-23: y
  const y = Math.floor(remaining % Math.pow(2, 12));
  remaining = Math.floor(remaining / Math.pow(2, 12));

  // Bits 24-35: width
  const width = Math.floor(remaining % Math.pow(2, 12));
  remaining = Math.floor(remaining / Math.pow(2, 12));

  // Bits 36-47: height
  const height = Math.floor(remaining % Math.pow(2, 12));
  remaining = Math.floor(remaining / Math.pow(2, 12));

  // Bit 48: flipX
  const flipX = (Math.floor(remaining % 2) === 1);
  remaining = Math.floor(remaining / 2);

  // Bit 49: flipY
  const flipY = (Math.floor(remaining % 2) === 1);
  remaining = Math.floor(remaining / 2);

  // Bit 50: isCompound
  const isCompound = (Math.floor(remaining % 2) === 1);

  return { x, y, width, height, flipX, flipY, isCompound };
}

/**
 * Creates a new tile ID with flips applied
 */
export function setFlips(tileId: number, flipX: boolean, flipY: boolean): number {
  const geometry = unpackTileId(tileId);
  return packTileId(geometry.x, geometry.y, geometry.width, geometry.height, flipX, flipY, geometry.isCompound);
}

/**
 * Gets the base tile ID without flip flags (for looking up tile properties)
 */
export function getBaseTileId(tileId: number): number {
  const geometry = unpackTileId(tileId);
  return packTileId(geometry.x, geometry.y, geometry.width, geometry.height, false, false, geometry.isCompound);
}

/**
 * Checks if two tile IDs represent the same geometry (ignoring flips)
 */
export function isSameGeometry(tileId1: number, tileId2: number): boolean {
  return getBaseTileId(tileId1) === getBaseTileId(tileId2);
}
