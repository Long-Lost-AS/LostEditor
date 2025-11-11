/**
 * Collision geometry utilities
 * Shared algorithms for collision detection and manipulation
 */

export interface Point {
	x: number;
	y: number;
}

/**
 * Calculate Euclidean distance between two points
 */
export function calculateDistance(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find a point at or near the given position within a threshold distance
 * @param points Array of points to search
 * @param x X coordinate to search near
 * @param y Y coordinate to search near
 * @param threshold Maximum distance from point (typically 8 / scale or 8 / zoom)
 * @returns Index of the found point, or null if none found
 */
export function findPointAtPosition(
	points: Point[],
	x: number,
	y: number,
	threshold: number,
): number | null {
	for (let i = 0; i < points.length; i++) {
		const distance = calculateDistance(points[i].x, points[i].y, x, y);
		if (distance <= threshold) {
			return i;
		}
	}
	return null;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param x X coordinate of point to test
 * @param y Y coordinate of point to test
 * @param points Polygon vertices
 * @returns true if point is inside polygon
 */
export function isPointInPolygon(
	x: number,
	y: number,
	points: Point[],
): boolean {
	if (points.length < 3) return false;

	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const xi = points[i].x;
		const yi = points[i].y;
		const xj = points[j].x;
		const yj = points[j].y;

		const intersect =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

		if (intersect) inside = !inside;
	}

	return inside;
}

/**
 * Find the closest edge to a point and determine if it's within threshold
 * @param points Polygon vertices
 * @param x X coordinate of point
 * @param y Y coordinate of point
 * @param threshold Maximum distance from edge
 * @returns Object with edge index and insertion position, or null if none found
 */
export function findEdgeAtPosition(
	points: Point[],
	x: number,
	y: number,
	threshold: number,
): { edgeIndex: number; insertX: number; insertY: number } | null {
	if (points.length < 2) return null;

	for (let i = 0; i < points.length; i++) {
		const j = (i + 1) % points.length;
		const p1 = points[i];
		const p2 = points[j];

		// Calculate projection of point onto line segment
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const lengthSquared = dx * dx + dy * dy;

		if (lengthSquared === 0) continue;

		const t = Math.max(
			0,
			Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSquared),
		);

		const projX = p1.x + t * dx;
		const projY = p1.y + t * dy;

		const distance = calculateDistance(x, y, projX, projY);

		if (distance <= threshold) {
			return {
				edgeIndex: i,
				insertX: projX,
				insertY: projY,
			};
		}
	}

	return null;
}

/**
 * Calculate the center point (centroid) of a polygon
 */
export function calculatePolygonCenter(points: Point[]): Point {
	if (points.length === 0) {
		return { x: 0, y: 0 };
	}

	let sumX = 0;
	let sumY = 0;

	for (const point of points) {
		sumX += point.x;
		sumY += point.y;
	}

	return {
		x: sumX / points.length,
		y: sumY / points.length,
	};
}

/**
 * Offset all points in a polygon by a delta
 */
export function offsetPolygon(
	points: Point[],
	dx: number,
	dy: number,
): Point[] {
	return points.map((point) => ({
		x: point.x + dx,
		y: point.y + dy,
	}));
}

/**
 * Check if a polygon can be closed (has at least 3 points and cursor is near first point)
 */
export function canClosePolygon(
	drawingPoints: Point[],
	mouseX: number,
	mouseY: number,
	threshold: number,
): boolean {
	if (drawingPoints.length < 3) return false;
	const firstPoint = drawingPoints[0];
	const distance = calculateDistance(
		mouseX,
		mouseY,
		firstPoint.x,
		firstPoint.y,
	);
	return distance <= threshold;
}
