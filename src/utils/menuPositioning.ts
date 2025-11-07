/**
 * Calculate optimal position for a context menu to ensure it stays within viewport bounds
 *
 * @param mouseX - The X coordinate of the mouse click (clientX)
 * @param mouseY - The Y coordinate of the mouse click (clientY)
 * @param menuWidth - Estimated or measured width of the menu
 * @param menuHeight - Estimated or measured height of the menu
 * @returns Adjusted coordinates {x, y} that keep the menu within viewport
 */
export function calculateMenuPosition(
	mouseX: number,
	mouseY: number,
	menuWidth: number,
	menuHeight: number,
): { x: number; y: number } {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const padding = 8; // Minimum padding from viewport edges

	let x = mouseX;
	let y = mouseY;

	// Check horizontal overflow
	if (x + menuWidth + padding > viewportWidth) {
		// Position menu to the left of cursor
		x = mouseX - menuWidth;
		// Ensure it doesn't go off the left edge
		if (x < padding) {
			x = padding;
		}
	}

	// Check vertical overflow
	if (y + menuHeight + padding > viewportHeight) {
		// Position menu above cursor
		y = mouseY - menuHeight;
		// Ensure it doesn't go off the top edge
		if (y < padding) {
			y = padding;
		}
	}

	// Ensure minimum padding from edges
	x = Math.max(padding, Math.min(x, viewportWidth - menuWidth - padding));
	y = Math.max(padding, Math.min(y, viewportHeight - menuHeight - padding));

	return { x, y };
}
