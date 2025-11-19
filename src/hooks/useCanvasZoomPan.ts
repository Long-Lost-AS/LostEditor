/**
 * Custom hook for canvas zoom and pan functionality
 * Provides mouse wheel zooming, panning, and coordinate conversion utilities
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ZoomPanState {
	scale: number;
	pan: { x: number; y: number };
}

export interface UseCanvasZoomPanOptions {
	/** Initial scale/zoom level (default: 1) */
	initialScale?: number;
	/** Initial pan position (default: { x: 0, y: 0 }) */
	initialPan?: { x: number; y: number };
	/** Minimum scale/zoom level (default: 0.1) */
	minScale?: number;
	/** Maximum scale/zoom level (default: 16) */
	maxScale?: number;
	/** Zoom sensitivity multiplier (default: 0.01) */
	zoomSpeed?: number;
	/** Whether to enable wheel event handling (default: true) */
	enableWheel?: boolean;
}

export interface UseCanvasZoomPanResult {
	/** Current scale/zoom level */
	scale: number;
	/** Current pan position */
	pan: { x: number; y: number };
	/** Set scale programmatically */
	setScale: (scale: number) => void;
	/** Set pan programmatically */
	setPan: (pan: { x: number; y: number }) => void;
	/** Convert screen coordinates to canvas coordinates */
	screenToCanvas: (
		screenX: number,
		screenY: number,
	) => { x: number; y: number };
	/** Convert mouse event to canvas coordinates */
	eventToCanvas: (
		e: React.MouseEvent | MouseEvent,
		elementRef: React.RefObject<HTMLElement>,
	) => { x: number; y: number };
	/** Ref to attach to the container element for wheel events */
	containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook that provides zoom and pan functionality for canvas elements
 */
export function useCanvasZoomPan(
	options: UseCanvasZoomPanOptions = {},
): UseCanvasZoomPanResult {
	const {
		initialScale = 1,
		initialPan = { x: 0, y: 0 },
		minScale = 0.1,
		maxScale = 16,
		zoomSpeed = 0.01,
		enableWheel = true,
	} = options;

	const [scale, setScale] = useState(initialScale);
	const [pan, setPan] = useState(initialPan);

	// Refs to access current values in event handlers without recreating them
	const scaleRef = useRef(scale);
	const panRef = useRef(pan);
	const containerRef = useRef<HTMLDivElement>(null);

	// Update refs when state changes
	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		panRef.current = pan;
	}, [pan]);

	// Convert screen coordinates to canvas coordinates
	const screenToCanvas = useCallback((screenX: number, screenY: number) => {
		const x = (screenX - panRef.current.x) / scaleRef.current;
		const y = (screenY - panRef.current.y) / scaleRef.current;
		return { x, y };
	}, []);

	// Convert mouse event to canvas coordinates
	const eventToCanvas = useCallback(
		(
			e: React.MouseEvent | MouseEvent,
			elementRef: React.RefObject<HTMLElement>,
		) => {
			const element = elementRef.current;
			if (!element) return { x: 0, y: 0 };

			const rect = element.getBoundingClientRect();
			const screenX = e.clientX - rect.left;
			const screenY = e.clientY - rect.top;

			return screenToCanvas(screenX, screenY);
		},
		[screenToCanvas],
	);

	// Setup wheel event listener for zoom and pan
	useEffect(() => {
		if (!enableWheel) return;

		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey || e.metaKey) {
				// Zoom towards mouse position
				const rect = container.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				// Get world coordinates at mouse position
				const worldX = (mouseX - panRef.current.x) / scaleRef.current;
				const worldY = (mouseY - panRef.current.y) / scaleRef.current;

				// Normalize deltaY to handle both mouse wheels and trackpads
				// Mouse wheels typically send ±100, trackpads send smaller values
				// Clamp to ±20 to prevent extreme zoom jumps
				const normalizedDelta = Math.max(-20, Math.min(20, e.deltaY));

				// Calculate new scale
				const delta = -normalizedDelta * zoomSpeed;
				const newScale = Math.max(
					minScale,
					Math.min(maxScale, scaleRef.current + delta),
				);

				// Adjust pan to keep world position under mouse
				const newPanX = mouseX - worldX * newScale;
				const newPanY = mouseY - worldY * newScale;

				setPan({ x: newPanX, y: newPanY });
				setScale(newScale);
			} else {
				// Pan
				setPan({
					x: panRef.current.x - e.deltaX,
					y: panRef.current.y - e.deltaY,
				});
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, [enableWheel, minScale, maxScale, zoomSpeed]);

	return {
		scale,
		pan,
		setScale,
		setPan,
		screenToCanvas,
		eventToCanvas,
		containerRef,
	};
}
