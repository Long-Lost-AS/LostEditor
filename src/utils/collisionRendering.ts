/**
 * Collision rendering utilities
 * Shared canvas drawing functions for collision editors
 */

import type { PolygonCollider } from "../types";
import type { Point } from "./collisionGeometry";

export interface ColliderRenderOptions {
	/** Fill color (e.g., 'rgba(255, 0, 255, 0.2)') */
	fillColor: string;
	/** Stroke color (e.g., 'rgba(255, 0, 255, 0.8)') */
	strokeColor: string;
	/** Line width for stroke */
	lineWidth: number;
	/** Whether this collider is selected */
	isSelected?: boolean;
	/** Selection highlight color (default: orange) */
	selectionColor?: string;
	/** Selection fill opacity multiplier (default: 1.5) */
	selectionFillOpacity?: number;
}

export interface ControlPointRenderOptions {
	/** Base color for control points */
	color: string;
	/** Radius of control points */
	radius: number;
	/** Color for selected point */
	selectedColor?: string;
	/** Whether to show point indices */
	showIndices?: boolean;
	/** Font size for indices */
	fontSize?: number;
	/** Text color for indices */
	textColor?: string;
	/** Stroke width for point outline (optional, scales with radius if not provided) */
	strokeWidth?: number;
}

export interface DrawingPreviewOptions {
	/** Color for preview lines */
	strokeColor: string;
	/** Color for preview points */
	pointColor: string;
	/** Line width */
	lineWidth: number;
	/** Point radius */
	pointRadius: number;
	/** First point highlight color (when closeable) */
	firstPointHighlightColor?: string;
	/** Whether polygon can be closed */
	canClose?: boolean;
}

/**
 * Render a single polygon collider
 * Points are stored as offsets from collider.position
 */
export function renderCollider(
	ctx: CanvasRenderingContext2D,
	collider: PolygonCollider,
	options: ColliderRenderOptions,
): void {
	if (collider.points.length < 2) return;

	const {
		fillColor,
		strokeColor,
		lineWidth,
		isSelected = false,
		selectionColor = "rgba(255, 165, 0, 0.8)",
		selectionFillOpacity = 1.5,
	} = options;

	// Get position offset (default to 0,0 for backwards compatibility)
	const posX = collider.position?.x ?? 0;
	const posY = collider.position?.y ?? 0;

	ctx.save();

	// Draw filled polygon
	if (collider.points.length >= 3) {
		ctx.beginPath();
		ctx.moveTo(collider.points[0].x + posX, collider.points[0].y + posY);
		for (let i = 1; i < collider.points.length; i++) {
			ctx.lineTo(collider.points[i].x + posX, collider.points[i].y + posY);
		}
		ctx.closePath();

		if (isSelected) {
			// Increase opacity for selected collider
			const selectedFill = fillColor.replace(
				/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/,
				(_, r, g, b, a) =>
					`rgba(${r}, ${g}, ${b}, ${parseFloat(a) * selectionFillOpacity})`,
			);
			ctx.fillStyle = selectedFill;
		} else {
			ctx.fillStyle = fillColor;
		}
		ctx.fill();
	}

	// Draw polygon outline
	ctx.beginPath();
	ctx.moveTo(collider.points[0].x + posX, collider.points[0].y + posY);
	for (let i = 1; i < collider.points.length; i++) {
		ctx.lineTo(collider.points[i].x + posX, collider.points[i].y + posY);
	}
	if (collider.points.length >= 3) {
		ctx.closePath();
	}

	ctx.strokeStyle = isSelected ? selectionColor : strokeColor;
	ctx.lineWidth = lineWidth;
	ctx.stroke();

	ctx.restore();
}

/**
 * Render control points for a collider
 */
export function renderControlPoints(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	options: ControlPointRenderOptions,
	selectedIndex: number | null = null,
): void {
	const {
		color,
		radius,
		selectedColor = "rgba(255, 100, 100, 0.9)",
		showIndices = false,
		fontSize = 12,
		textColor = "#ffffff",
		strokeWidth,
	} = options;

	ctx.save();

	// Calculate stroke width - if not provided, scale with radius
	const effectiveStrokeWidth = strokeWidth ?? Math.max(0.5, radius * 0.25);

	for (let i = 0; i < points.length; i++) {
		const point = points[i];
		const isSelected = selectedIndex === i;

		// Draw point circle
		ctx.beginPath();
		ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
		ctx.fillStyle = isSelected ? selectedColor : color;
		ctx.fill();
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = effectiveStrokeWidth;
		ctx.stroke();

		// Draw point index
		if (showIndices) {
			ctx.fillStyle = textColor;
			ctx.font = `${fontSize}px monospace`;
			ctx.textAlign = "left";
			ctx.textBaseline = "bottom";
			ctx.fillText(i.toString(), point.x + radius * 2, point.y - radius * 2);
		}
	}

	ctx.restore();
}

/**
 * Render a polygon that's currently being drawn
 */
export function renderDrawingPreview(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	currentMousePos: Point | null,
	options: DrawingPreviewOptions,
): void {
	if (points.length === 0) return;

	const {
		strokeColor,
		pointColor,
		lineWidth,
		pointRadius,
		firstPointHighlightColor = "rgba(255, 100, 100, 0.8)",
		canClose = false,
	} = options;

	ctx.save();

	// Draw lines between points
	if (points.length > 0) {
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}

		// Draw line to current mouse position
		if (currentMousePos) {
			ctx.lineTo(currentMousePos.x, currentMousePos.y);
		}

		ctx.strokeStyle = strokeColor;
		ctx.lineWidth = lineWidth;
		ctx.stroke();
	}

	// Draw points
	for (let i = 0; i < points.length; i++) {
		const point = points[i];

		ctx.beginPath();
		ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
		ctx.fillStyle = pointColor;
		ctx.fill();
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	// Highlight first point when polygon can be closed
	if (canClose && points.length >= 3) {
		const firstPoint = points[0];
		ctx.beginPath();
		ctx.arc(firstPoint.x, firstPoint.y, pointRadius * 1.5, 0, Math.PI * 2);
		ctx.strokeStyle = firstPointHighlightColor;
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	ctx.restore();
}

/**
 * Render multiple colliders with selection state
 */
export function renderColliders(
	ctx: CanvasRenderingContext2D,
	colliders: PolygonCollider[],
	selectedColliderId: string | null,
	options: ColliderRenderOptions,
): void {
	for (const collider of colliders) {
		renderCollider(ctx, collider, {
			...options,
			isSelected: collider.id === selectedColliderId,
		});
	}
}

/**
 * Get default collider render options for different contexts
 */
export function getDefaultColliderOptions(
	context: "editor" | "map" | "entity",
): ColliderRenderOptions {
	switch (context) {
		case "editor":
			return {
				fillColor: "rgba(255, 0, 255, 0.2)",
				strokeColor: "rgba(255, 0, 255, 0.8)",
				lineWidth: 2,
				selectionColor: "rgba(255, 0, 255, 1)",
			};
		case "map":
			return {
				fillColor: "rgba(255, 165, 0, 0.2)",
				strokeColor: "rgba(255, 165, 0, 0.8)",
				lineWidth: 2,
				selectionColor: "rgba(255, 165, 0, 1)",
			};
		case "entity":
			return {
				fillColor: "rgba(100, 200, 255, 0.2)",
				strokeColor: "rgba(100, 200, 255, 0.8)",
				lineWidth: 2,
				selectionColor: "rgba(100, 200, 255, 1)",
			};
	}
}

/**
 * Get default control point options
 */
export function getDefaultControlPointOptions(
	scale: number = 1,
): ControlPointRenderOptions {
	return {
		color: "rgba(255, 255, 255, 0.9)",
		radius: 5 / scale,
		selectedColor: "rgba(255, 100, 100, 0.9)",
		showIndices: true,
		fontSize: 12 / scale,
		textColor: "#000000",
	};
}

/**
 * Get default drawing preview options
 */
export function getDefaultDrawingPreviewOptions(): DrawingPreviewOptions {
	return {
		strokeColor: "rgba(100, 150, 255, 0.8)",
		pointColor: "rgba(100, 150, 255, 0.9)",
		lineWidth: 2,
		pointRadius: 5,
		firstPointHighlightColor: "rgba(255, 100, 100, 0.8)",
	};
}
