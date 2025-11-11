/**
 * Canvas utility functions
 * Shared helpers for common canvas drawing operations
 */

export interface GridOptions {
	/** Grid line color (default: "rgba(255, 255, 255, 0.1)") */
	color?: string;
	/** Grid line width (default: 1) */
	lineWidth?: number;
}

/**
 * Draw a grid on a canvas context
 * @param ctx Canvas rendering context
 * @param width Canvas width in world coordinates
 * @param height Canvas height in world coordinates
 * @param gridSize Size of each grid cell
 * @param options Optional styling options
 */
export function drawGrid(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	gridSize: number,
	options: GridOptions = {},
): void {
	const { color = "rgba(255, 255, 255, 0.1)", lineWidth = 1 } = options;

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;

	// Draw vertical lines
	for (let x = 0; x <= width; x += gridSize) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}

	// Draw horizontal lines
	for (let y = 0; y <= height; y += gridSize) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}

	ctx.restore();
}

/**
 * Draw a checkerboard pattern background
 * @param ctx Canvas rendering context
 * @param width Canvas width
 * @param height Canvas height
 * @param cellSize Size of each checkerboard cell
 * @param color1 First color (default: "#333")
 * @param color2 Second color (default: "#444")
 */
export function drawCheckerboard(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	cellSize: number,
	color1: string = "#333",
	color2: string = "#444",
): void {
	ctx.save();

	for (let y = 0; y < height; y += cellSize) {
		for (let x = 0; x < width; x += cellSize) {
			const isEven =
				(Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
			ctx.fillStyle = isEven ? color1 : color2;
			ctx.fillRect(x, y, cellSize, cellSize);
		}
	}

	ctx.restore();
}

/**
 * Clear a canvas
 * @param ctx Canvas rendering context
 * @param width Canvas width
 * @param height Canvas height
 */
export function clearCanvas(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
): void {
	ctx.clearRect(0, 0, width, height);
}

/**
 * Get pixel-perfect line width for current scale
 * Ensures lines render at 1 device pixel regardless of zoom
 * @param scale Current canvas scale/zoom level
 * @returns Appropriate line width for 1px rendering
 */
export function getPixelPerfectLineWidth(scale: number): number {
	return 1 / scale;
}
