/**
 * Keyboard movement utilities
 * Shared helpers for arrow key movement and keyboard navigation
 */

export interface MovementDelta {
	deltaX: number;
	deltaY: number;
}

/**
 * Get movement delta from arrow key event
 * @param key Keyboard key string (e.g., "ArrowUp", "ArrowDown", etc.)
 * @param multiplier Optional multiplier for movement amount (default: 1)
 * @returns Object with deltaX and deltaY, or null if not an arrow key
 */
export function getArrowKeyDelta(
	key: string,
	multiplier: number = 1,
): MovementDelta | null {
	switch (key) {
		case "ArrowUp":
			return { deltaX: 0, deltaY: -multiplier };
		case "ArrowDown":
			return { deltaX: 0, deltaY: multiplier };
		case "ArrowLeft":
			return { deltaX: -multiplier, deltaY: 0 };
		case "ArrowRight":
			return { deltaX: multiplier, deltaY: 0 };
		default:
			return null;
	}
}

/**
 * Check if a key is an arrow key
 * @param key Keyboard key string
 * @returns true if the key is an arrow key
 */
export function isArrowKey(key: string): boolean {
	return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);
}

/**
 * Apply movement delta to a point
 * @param point Point with x and y coordinates
 * @param delta Movement delta
 * @returns New point with delta applied
 */
export function applyDelta<T extends { x: number; y: number }>(
	point: T,
	delta: MovementDelta,
): T {
	return {
		...point,
		x: point.x + delta.deltaX,
		y: point.y + delta.deltaY,
	};
}

/**
 * Apply movement delta to an array of points
 * @param points Array of points with x and y coordinates
 * @param delta Movement delta
 * @returns New array of points with delta applied
 */
export function applyDeltaToPoints<T extends { x: number; y: number }>(
	points: T[],
	delta: MovementDelta,
): T[] {
	return points.map((point) => applyDelta(point, delta));
}

/**
 * Get movement multiplier based on modifier keys
 * Useful for implementing Shift+Arrow for larger movements
 * @param event Keyboard event
 * @param baseMultiplier Base movement amount (default: 1)
 * @param shiftMultiplier Multiplier when Shift is held (default: 10)
 * @returns Appropriate multiplier based on modifier keys
 */
export function getMovementMultiplier(
	event: KeyboardEvent | React.KeyboardEvent,
	baseMultiplier: number = 1,
	shiftMultiplier: number = 10,
): number {
	return event.shiftKey ? shiftMultiplier : baseMultiplier;
}
