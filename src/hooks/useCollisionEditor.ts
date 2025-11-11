/**
 * Shared collision editor state and logic
 * Provides common state management for collision editing across different editors
 */

import { useCallback, useState } from "react";
import type { PolygonCollider } from "../types";
import {
	canClosePolygon,
	findEdgeAtPosition,
	findPointAtPosition,
	isPointInPolygon,
	type Point,
} from "../utils/collisionGeometry";
import { generateId } from "../utils/id";

export interface CollisionEditorState {
	// Drawing state
	isDrawing: boolean;
	drawingPoints: Point[];

	// Selection state
	selectedColliderId: string | null;
	selectedPointIndex: number | null;

	// Drag state
	isDraggingPoint: boolean;
	isDraggingCollider: boolean;
	colliderDragStart: {
		x: number;
		y: number;
		originalPoints: Point[];
	} | null;
	tempPointPosition: Point | null;
}

export interface CollisionEditorActions {
	// Drawing actions
	startDrawing: () => void;
	addDrawingPoint: (x: number, y: number) => void;
	finishDrawing: (
		colliders: PolygonCollider[],
		name?: string,
		type?: string,
	) => PolygonCollider[];
	cancelDrawing: () => void;

	// Selection actions
	selectCollider: (colliderId: string | null) => void;
	selectPoint: (pointIndex: number | null) => void;
	clearSelection: () => void;

	// Drag actions
	startPointDrag: (pointIndex: number) => void;
	startColliderDrag: (x: number, y: number, points: Point[]) => void;
	updateDragPosition: (x: number, y: number) => void;
	endDrag: () => void;

	// Collider actions
	deleteSelectedPoint: (collider: PolygonCollider) => PolygonCollider | null;
	deleteCollider: (
		colliders: PolygonCollider[],
		colliderId: string,
	) => PolygonCollider[];
	insertPointOnEdge: (
		collider: PolygonCollider,
		edgeIndex: number,
		x: number,
		y: number,
	) => PolygonCollider;
	updateColliderPoint: (
		collider: PolygonCollider,
		pointIndex: number,
		x: number,
		y: number,
	) => PolygonCollider;
	updateColliderPosition: (
		collider: PolygonCollider,
		dx: number,
		dy: number,
	) => PolygonCollider;

	// Helper functions
	findClickedPoint: (
		collider: PolygonCollider,
		x: number,
		y: number,
		threshold: number,
	) => number | null;
	findClickedCollider: (
		colliders: PolygonCollider[],
		x: number,
		y: number,
	) => PolygonCollider | null;
	findClickedEdge: (
		collider: PolygonCollider,
		x: number,
		y: number,
		threshold: number,
	) => { edgeIndex: number; insertX: number; insertY: number } | null;
	canCloseCurrentPolygon: (x: number, y: number, threshold: number) => boolean;
}

export interface UseCollisionEditorOptions {
	/** Initial selected collider ID */
	initialSelectedColliderId?: string | null;
}

export function useCollisionEditor(
	options: UseCollisionEditorOptions = {},
): [CollisionEditorState, CollisionEditorActions] {
	// Drawing state
	const [isDrawing, setIsDrawing] = useState(false);
	const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);

	// Selection state
	const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
		options.initialSelectedColliderId ?? null,
	);
	const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
		null,
	);

	// Drag state
	const [isDraggingPoint, setIsDraggingPoint] = useState(false);
	const [isDraggingCollider, setIsDraggingCollider] = useState(false);
	const [colliderDragStart, setColliderDragStart] = useState<{
		x: number;
		y: number;
		originalPoints: Point[];
	} | null>(null);
	const [tempPointPosition, setTempPointPosition] = useState<Point | null>(
		null,
	);

	// Drawing actions
	const startDrawing = useCallback(() => {
		setIsDrawing(true);
		setDrawingPoints([]);
		setSelectedColliderId(null);
		setSelectedPointIndex(null);
	}, []);

	const addDrawingPoint = useCallback((x: number, y: number) => {
		setDrawingPoints((prev) => [...prev, { x, y }]);
	}, []);

	const finishDrawing = useCallback(
		(
			colliders: PolygonCollider[],
			name: string = "Collider",
			type: string = "solid",
		): PolygonCollider[] => {
			if (drawingPoints.length < 3) {
				setIsDrawing(false);
				setDrawingPoints([]);
				return colliders;
			}

			const newCollider: PolygonCollider = {
				id: generateId(),
				name,
				type,
				points: [...drawingPoints],
				properties: {},
			};

			setIsDrawing(false);
			setDrawingPoints([]);
			setSelectedColliderId(newCollider.id);

			return [...colliders, newCollider];
		},
		[drawingPoints],
	);

	const cancelDrawing = useCallback(() => {
		setIsDrawing(false);
		setDrawingPoints([]);
	}, []);

	// Selection actions
	const selectCollider = useCallback((colliderId: string | null) => {
		setSelectedColliderId(colliderId);
		setSelectedPointIndex(null);
	}, []);

	const selectPoint = useCallback((pointIndex: number | null) => {
		setSelectedPointIndex(pointIndex);
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedColliderId(null);
		setSelectedPointIndex(null);
	}, []);

	// Drag actions
	const startPointDrag = useCallback((pointIndex: number) => {
		setIsDraggingPoint(true);
		setSelectedPointIndex(pointIndex);
		setTempPointPosition(null);
	}, []);

	const startColliderDrag = useCallback(
		(x: number, y: number, points: Point[]) => {
			setIsDraggingCollider(true);
			setColliderDragStart({
				x,
				y,
				originalPoints: points.map((p) => ({ ...p })),
			});
		},
		[],
	);

	const updateDragPosition = useCallback(
		(x: number, y: number) => {
			if (isDraggingPoint) {
				setTempPointPosition({ x, y });
			} else if (isDraggingCollider && colliderDragStart) {
				// Position is tracked in parent components for now
				// This could be enhanced to track delta here
			}
		},
		[isDraggingPoint, isDraggingCollider, colliderDragStart],
	);

	const endDrag = useCallback(() => {
		setIsDraggingPoint(false);
		setIsDraggingCollider(false);
		setColliderDragStart(null);
		setTempPointPosition(null);
	}, []);

	// Collider manipulation actions
	const deleteSelectedPoint = useCallback(
		(collider: PolygonCollider): PolygonCollider | null => {
			if (selectedPointIndex === null || collider.points.length <= 3) {
				return null;
			}

			const newPoints = collider.points.filter(
				(_, i) => i !== selectedPointIndex,
			);
			setSelectedPointIndex(null);

			return {
				...collider,
				points: newPoints,
			};
		},
		[selectedPointIndex],
	);

	const deleteCollider = useCallback(
		(colliders: PolygonCollider[], colliderId: string): PolygonCollider[] => {
			if (selectedColliderId === colliderId) {
				setSelectedColliderId(null);
				setSelectedPointIndex(null);
			}
			return colliders.filter((c) => c.id !== colliderId);
		},
		[selectedColliderId],
	);

	const insertPointOnEdge = useCallback(
		(
			collider: PolygonCollider,
			edgeIndex: number,
			x: number,
			y: number,
		): PolygonCollider => {
			const newPoints = [
				...collider.points.slice(0, edgeIndex + 1),
				{ x, y },
				...collider.points.slice(edgeIndex + 1),
			];

			return {
				...collider,
				points: newPoints,
			};
		},
		[],
	);

	const updateColliderPoint = useCallback(
		(
			collider: PolygonCollider,
			pointIndex: number,
			x: number,
			y: number,
		): PolygonCollider => {
			const newPoints = collider.points.map((point, i) =>
				i === pointIndex ? { x, y } : point,
			);

			return {
				...collider,
				points: newPoints,
			};
		},
		[],
	);

	const updateColliderPosition = useCallback(
		(collider: PolygonCollider, dx: number, dy: number): PolygonCollider => {
			const newPoints = collider.points.map((point) => ({
				x: point.x + dx,
				y: point.y + dy,
			}));

			return {
				...collider,
				points: newPoints,
			};
		},
		[],
	);

	// Helper functions that wrap the collision geometry utilities
	const findClickedPoint = useCallback(
		(
			collider: PolygonCollider,
			x: number,
			y: number,
			threshold: number,
		): number | null => {
			return findPointAtPosition(collider.points, x, y, threshold);
		},
		[],
	);

	const findClickedCollider = useCallback(
		(
			colliders: PolygonCollider[],
			x: number,
			y: number,
		): PolygonCollider | null => {
			// Search in reverse order (top to bottom)
			for (let i = colliders.length - 1; i >= 0; i--) {
				const collider = colliders[i];
				if (isPointInPolygon(x, y, collider.points)) {
					return collider;
				}
			}
			return null;
		},
		[],
	);

	const findClickedEdge = useCallback(
		(
			collider: PolygonCollider,
			x: number,
			y: number,
			threshold: number,
		): { edgeIndex: number; insertX: number; insertY: number } | null => {
			return findEdgeAtPosition(collider.points, x, y, threshold);
		},
		[],
	);

	const canCloseCurrentPolygon = useCallback(
		(x: number, y: number, threshold: number): boolean => {
			return canClosePolygon(drawingPoints, x, y, threshold);
		},
		[drawingPoints],
	);

	const state: CollisionEditorState = {
		isDrawing,
		drawingPoints,
		selectedColliderId,
		selectedPointIndex,
		isDraggingPoint,
		isDraggingCollider,
		colliderDragStart,
		tempPointPosition,
	};

	const actions: CollisionEditorActions = {
		startDrawing,
		addDrawingPoint,
		finishDrawing,
		cancelDrawing,
		selectCollider,
		selectPoint,
		clearSelection,
		startPointDrag,
		startColliderDrag,
		updateDragPosition,
		endDrag,
		deleteSelectedPoint,
		deleteCollider,
		insertPointOnEdge,
		updateColliderPoint,
		updateColliderPosition,
		findClickedPoint,
		findClickedCollider,
		findClickedEdge,
		canCloseCurrentPolygon,
	};

	return [state, actions];
}
