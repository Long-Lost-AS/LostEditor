import { useEffect, useRef, useState } from "react";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { useCanvasZoomPan } from "../hooks/useCanvasZoomPan";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import type { PolygonCollider } from "../types";
import { drawCheckerboard, drawGrid } from "../utils/canvasUtils";
import {
	canClosePolygon,
	findEdgeAtPosition as findEdgeAtPos,
	findPointAtPosition as findPointAtPos,
	isPointInPolygon,
} from "../utils/collisionGeometry";
import {
	getDefaultColliderOptions,
	renderCollider,
	renderControlPoints,
	renderDrawingPreview,
} from "../utils/collisionRendering";
import { generateId } from "../utils/id";
import { getArrowKeyDelta } from "../utils/keyboardMovement";
import { calculateMenuPosition } from "../utils/menuPositioning";
import { CustomPropertiesEditor } from "./CustomPropertiesEditor";
import { DragNumberInput } from "./DragNumberInput";
import { LightbulbIcon, PlusIcon, TrashIcon } from "./Icons";
import { InlineEdit } from "./InlineEdit";

interface CollisionEditorProps {
	width: number;
	height: number;
	colliders: PolygonCollider[];
	onUpdate: (colliders: PolygonCollider[]) => void;
	backgroundImage?: HTMLImageElement;
	backgroundRect?: { x: number; y: number; width: number; height: number };
}

export const CollisionEditor = ({
	width,
	height,
	colliders,
	onUpdate,
	backgroundImage,
	backgroundRect,
}: CollisionEditorProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Zoom and pan using shared hook
	const {
		scale,
		pan,
		setPan,
		eventToCanvas,
		containerRef: zoomPanContainerRef,
	} = useCanvasZoomPan({
		initialScale: 4,
		initialPan: { x: 50, y: 50 },
		minScale: 0.5,
		maxScale: 16,
		zoomSpeed: 0.01,
	});

	// Drawing state
	const [isDrawing, setIsDrawing] = useState(false);
	const [drawingPoints, setDrawingPoints] = useState<
		Array<{ x: number; y: number }>
	>([]);

	// Selection state
	const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
		null,
	);
	const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
		null,
	);
	const [isDragging, setIsDragging] = useState(false);
	const [isDraggingCollider, setIsDraggingCollider] = useState(false);
	const [colliderDragStart, setColliderDragStart] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Undo/Redo using the reducer pattern
	const [
		localColliders,
		setLocalColliders,
		{ undo, redo, canUndo, canRedo, startBatch, endBatch },
	] = useUndoableReducer<PolygonCollider[]>(colliders);

	// Pan/zoom state for manual panning (middle mouse button)
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [snapToGrid] = useState(true); // Always enabled

	// UI state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		colliderId: string;
		pointIndex?: number;
		edgeIndex?: number;
		insertPosition?: { x: number; y: number };
	} | null>(null);
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);

	// Register undo/redo callbacks for keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	// Sync local colliders with parent's onUpdate callback
	// biome-ignore lint/correctness/useExhaustiveDependencies: onUpdate changes on every render, would cause infinite loop
	useEffect(() => {
		onUpdate(localColliders);
	}, [localColliders]);

	// Ensure all colliders have IDs and remove invalid colliders
	useEffect(() => {
		let needsUpdate = false;
		let updated = [...localColliders];

		// Remove colliders with 0 points (invalid)
		const validColliders = updated.filter((c) => c.points.length > 0);
		if (validColliders.length !== updated.length) {
			updated = validColliders;
			needsUpdate = true;
		}

		// Ensure all colliders have IDs
		const needsIds = updated.some((c) => !c.id);
		if (needsIds) {
			updated = updated.map((c) => ({
				...c,
				id: c.id || generateId(),
			}));
			needsUpdate = true;
		}

		if (needsUpdate) {
			setLocalColliders(updated);
		}
	}, [localColliders, setLocalColliders]);

	const getSelectedCollider = () => {
		return localColliders.find((c) => c.id === selectedColliderId);
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = zoomPanContainerRef.current;
		if (!canvas || !container) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const draw = () => {
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			ctx.save();
			ctx.translate(pan.x, pan.y);
			ctx.scale(scale, scale);

			// Draw background
			if (backgroundImage && backgroundRect) {
				ctx.drawImage(
					backgroundImage,
					backgroundRect.x,
					backgroundRect.y,
					backgroundRect.width,
					backgroundRect.height,
					0,
					0,
					backgroundRect.width,
					backgroundRect.height,
				);
			} else {
				drawCheckerboard(ctx, width, height, 8, "#333", "#444");
			}

			// Draw completed colliders
			const colliderOptions = getDefaultColliderOptions("editor");
			localColliders.forEach((collider) => {
				if (collider.points.length === 0) return;

				const isSelected = collider.id === selectedColliderId;

				// Render collider using shared utility
				renderCollider(ctx, collider, {
					...colliderOptions,
					lineWidth: 2 / scale,
					isSelected,
					fillColor: isSelected
						? "rgba(255, 0, 255, 0.25)"
						: "rgba(255, 0, 255, 0.1)",
					strokeColor: isSelected
						? "rgba(255, 0, 255, 0.9)"
						: "rgba(255, 0, 255, 0.5)",
				});

				// Draw control points for selected collider
				if (isSelected) {
					renderControlPoints(
						ctx,
						collider.points,
						{
							color: "rgba(255, 0, 255, 0.9)",
							radius: 4 / scale,
							selectedColor: "rgba(255, 255, 0, 0.9)",
							showIndices: true,
							fontSize: 10 / scale,
							textColor: "#fff",
						},
						selectedPointIndex,
					);
				}
			});

			// Draw in-progress polygon
			if (isDrawing && drawingPoints.length > 0) {
				renderDrawingPreview(ctx, drawingPoints, mousePos, {
					strokeColor: "rgba(100, 150, 255, 0.8)",
					pointColor: "rgba(100, 150, 255, 0.9)",
					lineWidth: 2 / scale,
					pointRadius: 4 / scale,
					firstPointHighlightColor: "rgba(255, 100, 100, 0.9)",
					canClose: drawingPoints.length >= 3,
				});
			}

			// Draw 1px grid
			drawGrid(ctx, width, height, 1, {
				color: "rgba(255, 255, 255, 0.1)",
				lineWidth: 1 / scale,
			});

			ctx.restore();
		};

		draw();
		window.addEventListener("resize", draw);
		return () => window.removeEventListener("resize", draw);
	}, [
		localColliders,
		selectedColliderId,
		selectedPointIndex,
		isDrawing,
		drawingPoints,
		width,
		height,
		scale,
		pan,
		backgroundImage,
		backgroundRect,
		mousePos,
		zoomPanContainerRef,
	]);

	// Keyboard shortcuts are now handled by UndoRedoProvider via useRegisterUndoRedo
	// Wheel zoom/pan is handled by useCanvasZoomPan hook

	const snapCoord = (value: number) => {
		return snapToGrid ? Math.round(value) : value;
	};

	const getCanvasCoords = (
		e: React.MouseEvent<HTMLCanvasElement>,
		applySnap = true,
	) => {
		const { x: canvasX, y: canvasY } = eventToCanvas(
			e,
			canvasRef as React.RefObject<HTMLElement>,
		);

		const finalX = applySnap ? snapCoord(canvasX) : canvasX;
		const finalY = applySnap ? snapCoord(canvasY) : canvasY;

		return {
			x: Math.max(0, Math.min(width, finalX)),
			y: Math.max(0, Math.min(height, finalY)),
		};
	};

	// Helper wrappers using the shared collision geometry utilities
	const findPointAtPosition = (
		points: Array<{ x: number; y: number }>,
		x: number,
		y: number,
	): number | null => {
		const threshold = 8 / scale;
		return findPointAtPos(points, x, y, threshold);
	};

	const findColliderAtPosition = (x: number, y: number): string | null => {
		// Check in reverse order (top to bottom)
		for (let i = localColliders.length - 1; i >= 0; i--) {
			const collider = localColliders[i];
			if (collider.points.length < 3) continue;

			if (isPointInPolygon(x, y, collider.points) && collider.id) {
				return collider.id;
			}
		}
		return null;
	};

	const findEdgeAtPosition = (
		points: Array<{ x: number; y: number }>,
		x: number,
		y: number,
	): { edgeIndex: number; insertPosition: { x: number; y: number } } | null => {
		const threshold = 8 / scale;
		const result = findEdgeAtPos(points, x, y, threshold);
		if (!result) return null;
		return {
			edgeIndex: result.edgeIndex,
			insertPosition: { x: result.insertX, y: result.insertY },
		};
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			setIsPanning(true);
			setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
		} else if (e.button === 0) {
			const coords = getCanvasCoords(e, false);

			if (isDrawing) {
				// Drawing mode: add points
				const snapped = getCanvasCoords(e, true);

				// Check if clicking near first point to close polygon
				if (canClosePolygon(drawingPoints, snapped.x, snapped.y, 8 / scale)) {
					// Close the polygon
					const newCollider: PolygonCollider = {
						id: generateId(),
						name: "",
						type: "",
						points: drawingPoints,
						properties: {},
					};
					setLocalColliders([...localColliders, newCollider]);
					setDrawingPoints([]);
					setIsDrawing(false);
					setSelectedColliderId(newCollider.id);
					return;
				}

				// Add new point
				setDrawingPoints([...drawingPoints, snapped]);
			} else {
				// Edit mode: select or drag
				const selectedCollider = getSelectedCollider();

				if (selectedCollider) {
					// Check if clicking on a point of selected collider
					const pointIndex = findPointAtPosition(
						selectedCollider.points,
						coords.x,
						coords.y,
					);
					if (pointIndex !== null) {
						setSelectedPointIndex(pointIndex);
						setIsDragging(true);
						startBatch(); // Start batching changes for smooth drag operation
						return;
					}
				}

				// Check if clicking on any collider
				const colliderId = findColliderAtPosition(coords.x, coords.y);
				if (colliderId) {
					setSelectedColliderId(colliderId);
					setSelectedPointIndex(null);

					// If clicking on the selected collider body (not a point), enable dragging the entire collider
					if (colliderId === selectedColliderId) {
						setIsDraggingCollider(true);
						setColliderDragStart(coords);
						startBatch();
					}
				} else {
					setSelectedColliderId(null);
					setSelectedPointIndex(null);
				}
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const { x, y } = getCanvasCoords(e, false);
		setMousePos({ x: Math.floor(x), y: Math.floor(y) });

		if (isPanning) {
			setPan({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		} else if (
			isDragging &&
			selectedPointIndex !== null &&
			selectedColliderId
		) {
			const snappedCoords = getCanvasCoords(e);
			const newColliders = localColliders.map((c) => {
				if (c.id === selectedColliderId) {
					const newPoints = [...c.points];
					newPoints[selectedPointIndex] = {
						x: snappedCoords.x,
						y: snappedCoords.y,
					};
					return { ...c, points: newPoints };
				}
				return c;
			});
			setLocalColliders(newColliders);
		} else if (isDraggingCollider && colliderDragStart && selectedColliderId) {
			// Drag entire collider
			const currentCoords = getCanvasCoords(e);
			const deltaX = currentCoords.x - colliderDragStart.x;
			const deltaY = currentCoords.y - colliderDragStart.y;

			const newColliders = localColliders.map((c) => {
				if (c.id === selectedColliderId) {
					const newPoints = c.points.map((p) => ({
						x: Math.round(p.x + deltaX),
						y: Math.round(p.y + deltaY),
					}));
					return { ...c, points: newPoints };
				}
				return c;
			});
			setLocalColliders(newColliders);
			setColliderDragStart(currentCoords);
		}
	};

	const handleMouseUp = () => {
		if (isDragging || isDraggingCollider) {
			endBatch(); // End batching - all drag changes become one history entry
		}
		setIsDragging(false);
		setIsDraggingCollider(false);
		setColliderDragStart(null);
		setIsPanning(false);
	};

	const handleLocalKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			if (isDrawing) {
				setIsDrawing(false);
				setDrawingPoints([]);
			} else {
				setSelectedColliderId(null);
				setSelectedPointIndex(null);
			}
		} else if (e.key === "Delete" || e.key === "Backspace") {
			if (selectedPointIndex !== null && selectedColliderId) {
				const collider = getSelectedCollider();
				if (collider && collider.points.length > 3) {
					const newPoints = collider.points.filter(
						(_, i) => i !== selectedPointIndex,
					);
					const newColliders = localColliders.map((c) =>
						c.id === selectedColliderId ? { ...c, points: newPoints } : c,
					);
					setLocalColliders(newColliders);
					setSelectedPointIndex(null);
				}
			}
		}

		// Arrow key movement
		const delta = getArrowKeyDelta(e.key);
		if (delta && selectedColliderId) {
			e.preventDefault();

			const collider = getSelectedCollider();
			if (!collider) return;

			// If a specific point is selected, move only that point
			if (selectedPointIndex !== null) {
				const newPoints = [...collider.points];
				newPoints[selectedPointIndex] = {
					x: Math.max(
						0,
						Math.min(width, newPoints[selectedPointIndex].x + delta.deltaX),
					),
					y: Math.max(
						0,
						Math.min(height, newPoints[selectedPointIndex].y + delta.deltaY),
					),
				};
				const newColliders = localColliders.map((c) =>
					c.id === selectedColliderId ? { ...c, points: newPoints } : c,
				);
				setLocalColliders(newColliders);
			} else {
				// Move entire collider
				const newPoints = collider.points.map((p) => ({
					x: Math.max(0, Math.min(width, p.x + delta.deltaX)),
					y: Math.max(0, Math.min(height, p.y + delta.deltaY)),
				}));
				const newColliders = localColliders.map((c) =>
					c.id === selectedColliderId ? { ...c, points: newPoints } : c,
				);
				setLocalColliders(newColliders);
			}
		}
	};

	const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
		e.preventDefault();

		if (isDrawing) return; // No context menu while drawing

		const unsnappedCoords = getCanvasCoords(e, false);

		// Check all colliders for points first (highest priority)
		for (const collider of localColliders) {
			const pointIndex = findPointAtPosition(
				collider.points,
				unsnappedCoords.x,
				unsnappedCoords.y,
			);
			if (pointIndex !== null && collider.id) {
				const position = calculateMenuPosition(e.clientX, e.clientY, 180, 100);
				setContextMenu({
					x: position.x,
					y: position.y,
					colliderId: collider.id,
					pointIndex,
				});
				return;
			}
		}

		// Check all colliders for edges (second priority)
		for (const collider of localColliders) {
			const edge = findEdgeAtPosition(
				collider.points,
				unsnappedCoords.x,
				unsnappedCoords.y,
			);
			if (edge && collider.id) {
				const position = calculateMenuPosition(e.clientX, e.clientY, 180, 100);
				setContextMenu({
					x: position.x,
					y: position.y,
					colliderId: collider.id,
					edgeIndex: edge.edgeIndex,
					insertPosition: edge.insertPosition,
				});
				return;
			}
		}

		// Find which collider we're on (third priority)
		const colliderId = findColliderAtPosition(
			unsnappedCoords.x,
			unsnappedCoords.y,
		);

		if (!colliderId) {
			// Right-click on empty space - offer to create new collider
			const position = calculateMenuPosition(e.clientX, e.clientY, 180, 100);
			setContextMenu({
				x: position.x,
				y: position.y,
				colliderId: "",
				insertPosition: unsnappedCoords,
			});
			return;
		}

		// Right-click on collider but not on point or edge - offer to delete
		const position = calculateMenuPosition(e.clientX, e.clientY, 180, 100);
		setContextMenu({
			x: position.x,
			y: position.y,
			colliderId,
		});
	};

	const handleDeletePoint = () => {
		if (contextMenu && contextMenu.pointIndex !== undefined) {
			const collider = localColliders.find(
				(c) => c.id === contextMenu.colliderId,
			);
			if (collider && collider.points.length > 3) {
				const newPoints = collider.points.filter(
					(_, i) => i !== contextMenu.pointIndex,
				);
				const newColliders = localColliders.map((c) =>
					c.id === contextMenu.colliderId ? { ...c, points: newPoints } : c,
				);
				setLocalColliders(newColliders);
			}
		}
		setContextMenu(null);
	};

	const handleInsertPoint = () => {
		if (
			contextMenu &&
			contextMenu.edgeIndex !== undefined &&
			contextMenu.insertPosition
		) {
			const snappedX = snapCoord(contextMenu.insertPosition.x);
			const snappedY = snapCoord(contextMenu.insertPosition.y);
			const edgeIndex = contextMenu.edgeIndex;

			const newColliders = localColliders.map((c) => {
				if (c.id === contextMenu.colliderId) {
					const newPoints = [...c.points];
					newPoints.splice(edgeIndex + 1, 0, {
						x: snappedX,
						y: snappedY,
					});
					return { ...c, points: newPoints };
				}
				return c;
			});
			setLocalColliders(newColliders);
			setSelectedColliderId(contextMenu.colliderId);
			setSelectedPointIndex(contextMenu.edgeIndex + 1);
		}
		setContextMenu(null);
	};

	const handleNewCollider = () => {
		setIsDrawing(true);
		setDrawingPoints([]);
		setSelectedColliderId(null);
		setSelectedPointIndex(null);
		setContextMenu(null);
	};

	const handleDeleteCollider = () => {
		const colliderIdToDelete = contextMenu?.colliderId || selectedColliderId;
		if (colliderIdToDelete) {
			const newColliders = localColliders.filter(
				(c) => c.id !== colliderIdToDelete,
			);
			setLocalColliders(newColliders);
			setSelectedColliderId(null);
		}
		setContextMenu(null);
	};

	const handleUpdateColliderName = (name: string) => {
		if (selectedColliderId) {
			const newColliders = localColliders.map((c) =>
				c.id === selectedColliderId ? { ...c, name } : c,
			);
			setLocalColliders(newColliders);
		}
	};

	const handleUpdateColliderType = (type: string) => {
		if (selectedColliderId) {
			const newColliders = localColliders.map((c) =>
				c.id === selectedColliderId ? { ...c, type } : c,
			);
			setLocalColliders(newColliders);
		}
	};

	// Handle property changes
	const handlePropertiesChange = (properties: Record<string, string>) => {
		const newColliders = localColliders.map((c) =>
			c.id === selectedColliderId ? { ...c, properties } : c,
		);
		setLocalColliders(newColliders);
	};

	const selectedCollider = getSelectedCollider();

	return (
		<div className="w-full h-full flex" style={{ background: "#1e1e1e" }}>
			{/* Left Sidebar */}
			<div
				className="w-80 flex flex-col overflow-hidden"
				style={{ background: "#252526", borderRight: "1px solid #3e3e42" }}
			>
				<div className="flex-1 overflow-y-auto">
					{/* Drawing hint - only show when actively drawing */}
					{isDrawing && drawingPoints.length >= 3 && (
						<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
							<div className="p-2.5 bg-blue-500 bg-opacity-20 border border-blue-500 border-opacity-40 rounded text-xs text-blue-300 leading-relaxed flex items-center gap-2">
								<LightbulbIcon size={14} />
								<span>Click first point to close</span>
							</div>
						</div>
					)}

					{/* Properties panel for selected collider */}
					{selectedCollider && !isDrawing && (
						<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
							<div
								className="text-xs font-semibold uppercase tracking-wide mb-3"
								style={{ color: "#858585" }}
							>
								Collider Properties
							</div>
							<div className="mb-3">
								<div
									className="text-xs font-medium mb-1 block"
									style={{ color: "#858585" }}
								>
									Name
								</div>
								<InlineEdit
									value={selectedCollider.name || ""}
									onChange={handleUpdateColliderName}
									placeholder="(none)"
								/>
							</div>
							<div className="mb-3">
								<div
									className="text-xs font-medium mb-1 block"
									style={{ color: "#858585" }}
								>
									Type
								</div>
								<InlineEdit
									value={selectedCollider.type || ""}
									onChange={handleUpdateColliderType}
									placeholder="(none)"
								/>
							</div>

							{/* Position (center of all points) - only show when no specific point is selected */}
							{selectedPointIndex === null && (
								<div
									className="mt-4 pt-4"
									style={{ borderTop: "1px solid #3e3e42" }}
								>
									<div
										className="text-xs font-semibold uppercase tracking-wide mb-3"
										style={{ color: "#858585" }}
									>
										Position
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div className="flex">
											<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
												X
											</div>
											<div className="flex-1">
												<DragNumberInput
													value={(() => {
														const sumX = selectedCollider.points.reduce(
															(sum, p) => sum + p.x,
															0,
														);
														return sumX / selectedCollider.points.length;
													})()}
													onInput={(newCenterX) => {
														// Calculate current center
														const sumX = selectedCollider.points.reduce(
															(sum, p) => sum + p.x,
															0,
														);
														const currentCenterX =
															sumX / selectedCollider.points.length;

														// Calculate delta
														const deltaX = newCenterX - currentCenterX;

														// Move all points by delta
														const newPoints = selectedCollider.points.map(
															(p) => ({
																x: Math.round(p.x + deltaX),
																y: p.y,
															}),
														);

														const newColliders = localColliders.map((c) =>
															c.id === selectedColliderId
																? { ...c, points: newPoints }
																: c,
														);
														setLocalColliders(newColliders);
													}}
													onChange={(newCenterX) => {
														// For typing - wrap in batch to preserve undo/redo
														startBatch();
														const sumX = selectedCollider.points.reduce(
															(sum, p) => sum + p.x,
															0,
														);
														const currentCenterX =
															sumX / selectedCollider.points.length;
														const deltaX = newCenterX - currentCenterX;
														const newPoints = selectedCollider.points.map(
															(p) => ({
																x: Math.round(p.x + deltaX),
																y: p.y,
															}),
														);
														const newColliders = localColliders.map((c) =>
															c.id === selectedColliderId
																? { ...c, points: newPoints }
																: c,
														);
														setLocalColliders(newColliders);
														endBatch();
													}}
													onDragStart={startBatch}
													onDragEnd={endBatch}
													dragSpeed={1}
													precision={1}
													roundedLeft={false}
												/>
											</div>
										</div>
										<div className="flex">
											<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
												Y
											</div>
											<div className="flex-1">
												<DragNumberInput
													value={(() => {
														const sumY = selectedCollider.points.reduce(
															(sum, p) => sum + p.y,
															0,
														);
														return sumY / selectedCollider.points.length;
													})()}
													onInput={(newCenterY) => {
														// Calculate current center
														const sumY = selectedCollider.points.reduce(
															(sum, p) => sum + p.y,
															0,
														);
														const currentCenterY =
															sumY / selectedCollider.points.length;

														// Calculate delta
														const deltaY = newCenterY - currentCenterY;

														// Move all points by delta
														const newPoints = selectedCollider.points.map(
															(p) => ({
																x: p.x,
																y: Math.round(p.y + deltaY),
															}),
														);

														const newColliders = localColliders.map((c) =>
															c.id === selectedColliderId
																? { ...c, points: newPoints }
																: c,
														);
														setLocalColliders(newColliders);
													}}
													onChange={(newCenterY) => {
														// For typing - wrap in batch to preserve undo/redo
														startBatch();
														const sumY = selectedCollider.points.reduce(
															(sum, p) => sum + p.y,
															0,
														);
														const currentCenterY =
															sumY / selectedCollider.points.length;
														const deltaY = newCenterY - currentCenterY;
														const newPoints = selectedCollider.points.map(
															(p) => ({
																x: p.x,
																y: Math.round(p.y + deltaY),
															}),
														);
														const newColliders = localColliders.map((c) =>
															c.id === selectedColliderId
																? { ...c, points: newPoints }
																: c,
														);
														setLocalColliders(newColliders);
														endBatch();
													}}
													onDragStart={startBatch}
													onDragEnd={endBatch}
													dragSpeed={1}
													precision={1}
													roundedLeft={false}
												/>
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Selected Point Position */}
							{selectedPointIndex !== null &&
								selectedCollider.points[selectedPointIndex] && (
									<div
										className="mt-4 pt-4"
										style={{ borderTop: "1px solid #3e3e42" }}
									>
										<div
											className="text-xs font-semibold uppercase tracking-wide mb-3"
											style={{ color: "#858585" }}
										>
											Selected Point
										</div>
										<div className="grid grid-cols-2 gap-2">
											<div className="flex">
												<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
													X
												</div>
												<div className="flex-1">
													<DragNumberInput
														value={
															selectedCollider.points[selectedPointIndex].x
														}
														onInput={(newX) => {
															const newPoints = [...selectedCollider.points];
															newPoints[selectedPointIndex] = {
																...newPoints[selectedPointIndex],
																x: Math.round(newX),
															};
															const newColliders = localColliders.map((c) =>
																c.id === selectedColliderId
																	? { ...c, points: newPoints }
																	: c,
															);
															setLocalColliders(newColliders);
														}}
														onChange={(newX) => {
															// For typing - wrap in batch to preserve undo/redo
															startBatch();
															const newPoints = [...selectedCollider.points];
															newPoints[selectedPointIndex] = {
																...newPoints[selectedPointIndex],
																x: Math.round(newX),
															};
															const newColliders = localColliders.map((c) =>
																c.id === selectedColliderId
																	? { ...c, points: newPoints }
																	: c,
															);
															setLocalColliders(newColliders);
															endBatch();
														}}
														onDragStart={startBatch}
														onDragEnd={endBatch}
														dragSpeed={1}
														precision={0}
														roundedLeft={false}
													/>
												</div>
											</div>
											<div className="flex">
												<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
													Y
												</div>
												<div className="flex-1">
													<DragNumberInput
														value={
															selectedCollider.points[selectedPointIndex].y
														}
														onInput={(newY) => {
															const newPoints = [...selectedCollider.points];
															newPoints[selectedPointIndex] = {
																...newPoints[selectedPointIndex],
																y: Math.round(newY),
															};
															const newColliders = localColliders.map((c) =>
																c.id === selectedColliderId
																	? { ...c, points: newPoints }
																	: c,
															);
															setLocalColliders(newColliders);
														}}
														onChange={(newY) => {
															// For typing - wrap in batch to preserve undo/redo
															startBatch();
															const newPoints = [...selectedCollider.points];
															newPoints[selectedPointIndex] = {
																...newPoints[selectedPointIndex],
																y: Math.round(newY),
															};
															const newColliders = localColliders.map((c) =>
																c.id === selectedColliderId
																	? { ...c, points: newPoints }
																	: c,
															);
															setLocalColliders(newColliders);
															endBatch();
														}}
														onDragStart={startBatch}
														onDragEnd={endBatch}
														dragSpeed={1}
														precision={0}
														roundedLeft={false}
													/>
												</div>
											</div>
										</div>
									</div>
								)}
						</div>
					)}

					{/* Custom Properties Section */}
					{selectedCollider && !isDrawing && (
						<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
							<CustomPropertiesEditor
								properties={selectedCollider.properties}
								onChange={handlePropertiesChange}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Right Side - Canvas Area */}
			<div
				ref={zoomPanContainerRef}
				className="flex-1 overflow-hidden relative"
				onKeyDown={handleLocalKeyDown}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Canvas container needs keyboard events for arrow key navigation
				tabIndex={0}
				role="region"
				aria-label="Collision editor canvas"
			>
				<canvas
					ref={canvasRef}
					style={{
						width: "100%",
						height: "100%",
						imageRendering: "pixelated",
						cursor: isPanning
							? "grabbing"
							: isDrawing
								? "crosshair"
								: isDraggingCollider
									? "move"
									: "default",
					}}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onContextMenu={handleContextMenu}
				/>

				{/* Status bar */}
				<div
					className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300"
					style={{
						background: "rgba(37, 37, 38, 0.95)",
						borderTop: "1px solid #3e3e42",
					}}
				>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Canvas:</span>
						<span className="font-mono">
							{width}×{height}
						</span>
					</div>
					<div className="w-px h-4 bg-gray-700" />
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Colliders:</span>
						<span className="font-mono">{localColliders.length}</span>
					</div>
					{selectedCollider && (
						<>
							<div className="w-px h-4 bg-gray-700" />
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Points:</span>
								<span className="font-mono">
									{selectedCollider.points.length}
								</span>
							</div>
						</>
					)}
					{mousePos && (
						<>
							<div className="w-px h-4 bg-gray-700" />
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Cursor:</span>
								<span className="font-mono">
									{mousePos.x}, {mousePos.y}
								</span>
							</div>
						</>
					)}
					<div className="flex-1" />
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Zoom:</span>
						<span className="font-mono">{Math.round(scale * 100)}%</span>
					</div>
				</div>
			</div>

			{/* Context Menu */}
			{contextMenu && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setContextMenu(null)}
						onKeyDown={(e) => {
							if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								setContextMenu(null);
							}
						}}
						role="button"
						tabIndex={0}
						aria-label="Close context menu"
					/>
					<div
						className="fixed z-50 min-w-[160px] py-1 rounded shadow-lg"
						style={{
							left: `${contextMenu.x}px`,
							top: `${contextMenu.y}px`,
							background: "#252526",
							border: "1px solid #3e3e42",
						}}
					>
						{contextMenu.colliderId === "" ? (
							// Empty space - New Collider only
							<div
								onClick={handleNewCollider}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleNewCollider();
									}
								}}
								className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
								style={{ color: "#4ade80" }}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = "#3e3e42";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "transparent";
								}}
								role="menuitem"
								tabIndex={0}
							>
								<span>➕</span>
								<span>New Collider</span>
							</div>
						) : (
							// On a collider - show relevant options
							<>
								{contextMenu.pointIndex !== undefined && (
									<div
										onClick={handleDeletePoint}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleDeletePoint();
											}
										}}
										className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
										style={{ color: "#f48771" }}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#3e3e42";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "transparent";
										}}
										role="menuitem"
										tabIndex={0}
									>
										<TrashIcon size={16} />
										<span>Delete Point</span>
									</div>
								)}
								{contextMenu.edgeIndex !== undefined && (
									<div
										onClick={handleInsertPoint}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleInsertPoint();
											}
										}}
										className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
										style={{ color: "#4ade80" }}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#3e3e42";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "transparent";
										}}
										role="menuitem"
										tabIndex={0}
									>
										<PlusIcon size={16} />
										<span>Add Point</span>
									</div>
								)}
								{contextMenu.colliderId && (
									<div
										onClick={handleDeleteCollider}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleDeleteCollider();
											}
										}}
										className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
										style={{ color: "#f48771" }}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#3e3e42";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "transparent";
										}}
										role="menuitem"
										tabIndex={0}
									>
										<TrashIcon size={16} />
										<span>Delete Collider</span>
									</div>
								)}
							</>
						)}
					</div>
				</>
			)}
		</div>
	);
};
