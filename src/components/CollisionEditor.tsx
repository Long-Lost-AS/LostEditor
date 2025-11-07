import { useEffect, useRef, useState } from "react";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import type { PolygonCollider } from "../types";
import { calculateMenuPosition } from "../utils/menuPositioning";
import { DragNumberInput } from "./DragNumberInput";
import { LightbulbIcon, PlusIcon, TrashIcon } from "./Icons";

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
	const containerRef = useRef<HTMLDivElement>(null);

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

	// Pan/zoom state
	const [isPanning, setIsPanning] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(4);
	const [pan, setPan] = useState({ x: 50, y: 50 });
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
	const [editingColliderName, setEditingColliderName] = useState(false);
	const [editingColliderType, setEditingColliderType] = useState(false);
	const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
		null,
	);
	const [editingPropertyValue, setEditingPropertyValue] = useState<
		string | null
	>(null);

	// Refs for event handlers
	const panRef = useRef(pan);
	const scaleRef = useRef(scale);

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = scale;
	}, [pan, scale]);

	// Register undo/redo callbacks for keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	// Sync local colliders with parent's onUpdate callback
	useEffect(() => {
		onUpdate(localColliders);
	}, [localColliders, onUpdate]);

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
			updated = updated.map((c, index) => ({
				...c,
				id: c.id || `collider-${Date.now()}-${index}`,
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
		const container = containerRef.current;
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
				const gridSize = 8;
				for (let y = 0; y < height; y += gridSize) {
					for (let x = 0; x < width; x += gridSize) {
						const isEven =
							(Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0;
						ctx.fillStyle = isEven ? "#333" : "#444";
						ctx.fillRect(x, y, gridSize, gridSize);
					}
				}
			}

			// Draw completed colliders
			localColliders.forEach((collider) => {
				if (collider.points.length === 0) return;

				const isSelected = collider.id === selectedColliderId;

				// Fill
				ctx.fillStyle = isSelected
					? "rgba(255, 0, 255, 0.25)"
					: "rgba(255, 0, 255, 0.1)";
				ctx.beginPath();
				ctx.moveTo(collider.points[0].x, collider.points[0].y);
				for (let i = 1; i < collider.points.length; i++) {
					ctx.lineTo(collider.points[i].x, collider.points[i].y);
				}
				ctx.closePath();
				ctx.fill();

				// Stroke
				ctx.strokeStyle = isSelected
					? "rgba(255, 0, 255, 0.9)"
					: "rgba(255, 0, 255, 0.5)";
				ctx.lineWidth = 2 / scale;
				ctx.stroke();

				// Draw control points for selected collider
				if (isSelected) {
					collider.points.forEach((point, index) => {
						const isPointSelected = index === selectedPointIndex;
						ctx.fillStyle = isPointSelected
							? "rgba(255, 255, 0, 0.9)"
							: "rgba(255, 0, 255, 0.9)";
						ctx.beginPath();
						ctx.arc(
							point.x,
							point.y,
							(isPointSelected ? 6 : 4) / scale,
							0,
							Math.PI * 2,
						);
						ctx.fill();

						ctx.fillStyle = "#fff";
						ctx.font = `${10 / scale}px monospace`;
						ctx.fillText(
							index.toString(),
							point.x + 8 / scale,
							point.y - 8 / scale,
						);
					});
				}
			});

			// Draw in-progress polygon
			if (isDrawing && drawingPoints.length > 0) {
				// Draw lines
				ctx.strokeStyle = "rgba(100, 150, 255, 0.8)";
				ctx.lineWidth = 2 / scale;
				ctx.beginPath();
				ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
				for (let i = 1; i < drawingPoints.length; i++) {
					ctx.lineTo(drawingPoints[i].x, drawingPoints[i].y);
				}
				ctx.stroke();

				// Draw points
				drawingPoints.forEach((point, index) => {
					ctx.fillStyle =
						index === 0
							? "rgba(255, 100, 100, 0.9)"
							: "rgba(100, 150, 255, 0.9)";
					ctx.beginPath();
					ctx.arc(
						point.x,
						point.y,
						(index === 0 ? 6 : 4) / scale,
						0,
						Math.PI * 2,
					);
					ctx.fill();
				});

				// Highlight first point if we have at least 3 points
				if (drawingPoints.length >= 3) {
					ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
					ctx.lineWidth = 3 / scale;
					ctx.beginPath();
					ctx.arc(
						drawingPoints[0].x,
						drawingPoints[0].y,
						8 / scale,
						0,
						Math.PI * 2,
					);
					ctx.stroke();
				}
			}

			// Draw 1px grid
			ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
			ctx.lineWidth = 1 / scale;
			for (let x = 0; x <= width; x += 1) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
			}
			for (let y = 0; y <= height; y += 1) {
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
				ctx.stroke();
			}

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
	]);

	// Setup wheel event listener for zoom and pan
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey || e.metaKey) {
				const rect = container.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				const worldX = (mouseX - panRef.current.x) / scaleRef.current;
				const worldY = (mouseY - panRef.current.y) / scaleRef.current;

				const delta = -e.deltaY * 0.01;
				const newScale = Math.max(0.5, Math.min(16, scaleRef.current + delta));

				const newPanX = mouseX - worldX * newScale;
				const newPanY = mouseY - worldY * newScale;

				setPan({ x: newPanX, y: newPanY });
				setScale(newScale);
			} else {
				setPan({
					x: panRef.current.x - e.deltaX,
					y: panRef.current.y - e.deltaY,
				});
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, []);

	// Keyboard shortcuts are now handled by UndoRedoProvider via useRegisterUndoRedo

	const snapCoord = (value: number) => {
		return snapToGrid ? Math.round(value) : value;
	};

	const getCanvasCoords = (
		e: React.MouseEvent<HTMLCanvasElement>,
		applySnap = true,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };

		const rect = canvas.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;

		const canvasX = (screenX - pan.x) / scale;
		const canvasY = (screenY - pan.y) / scale;

		const finalX = applySnap ? snapCoord(canvasX) : canvasX;
		const finalY = applySnap ? snapCoord(canvasY) : canvasY;

		return {
			x: Math.max(0, Math.min(width, finalX)),
			y: Math.max(0, Math.min(height, finalY)),
		};
	};

	const findPointAtPosition = (
		points: Array<{ x: number; y: number }>,
		x: number,
		y: number,
	): number | null => {
		const threshold = 8 / scale;
		for (let i = 0; i < points.length; i++) {
			const dx = points[i].x - x;
			const dy = points[i].y - y;
			if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
				return i;
			}
		}
		return null;
	};

	const findColliderAtPosition = (x: number, y: number): string | null => {
		// Check in reverse order (top to bottom)
		for (let i = colliders.length - 1; i >= 0; i--) {
			const collider = colliders[i];
			if (collider.points.length < 3) continue;

			// Point-in-polygon test
			let inside = false;
			for (
				let j = 0, k = collider.points.length - 1;
				j < collider.points.length;
				k = j++
			) {
				const xi = collider.points[j].x;
				const yi = collider.points[j].y;
				const xj = collider.points[k].x;
				const yj = collider.points[k].y;

				const intersect =
					yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
				if (intersect) inside = !inside;
			}

			if (inside && collider.id) {
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
		if (points.length < 2) return null;

		const threshold = 8 / scale;

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i];
			const p2 = points[(i + 1) % points.length];

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

			const distX = x - projX;
			const distY = y - projY;
			const distance = Math.sqrt(distX * distX + distY * distY);

			if (distance <= threshold) {
				return {
					edgeIndex: i,
					insertPosition: { x: projX, y: projY },
				};
			}
		}

		return null;
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
				if (drawingPoints.length >= 3) {
					const firstPoint = drawingPoints[0];
					const dx = snapped.x - firstPoint.x;
					const dy = snapped.y - firstPoint.y;
					const distance = Math.sqrt(dx * dx + dy * dy);

					if (distance <= 8 / scale) {
						// Close the polygon
						const newCollider: PolygonCollider = {
							id: `collider-${Date.now()}`,
							points: drawingPoints,
						};
						setLocalColliders([...localColliders, newCollider]);
						setDrawingPoints([]);
						setIsDrawing(false);
						setSelectedColliderId(newCollider.id);
						return;
					}
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

			const newColliders = localColliders.map((c) => {
				if (c.id === contextMenu.colliderId) {
					const newPoints = [...c.points];
					newPoints.splice(contextMenu.edgeIndex + 1, 0, {
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

	// Custom properties handlers
	const handleAddProperty = () => {
		const selectedCollider = getSelectedCollider();
		if (!selectedCollider) return;

		const newKey = `__temp_${Date.now()}`;
		const updatedProperties = {
			...(selectedCollider.properties || {}),
			[newKey]: "",
		};

		const newColliders = localColliders.map((c) =>
			c.id === selectedColliderId ? { ...c, properties: updatedProperties } : c,
		);
		setLocalColliders(newColliders);
		setEditingPropertyKey(newKey);
	};

	const handleDeleteProperty = (key: string) => {
		const selectedCollider = getSelectedCollider();
		if (!selectedCollider) return;

		const updatedProperties = { ...(selectedCollider.properties || {}) };
		delete updatedProperties[key];

		const newColliders = localColliders.map((c) =>
			c.id === selectedColliderId ? { ...c, properties: updatedProperties } : c,
		);
		setLocalColliders(newColliders);
	};

	const handleUpdatePropertyKey = (oldKey: string, newKey: string) => {
		const selectedCollider = getSelectedCollider();
		if (!selectedCollider) return;

		if (!newKey.trim()) {
			handleDeleteProperty(oldKey);
			setEditingPropertyKey(null);
			return;
		}

		if (oldKey === newKey) return;

		if (selectedCollider.properties?.[newKey] && newKey !== oldKey) {
			return; // Don't allow duplicate keys
		}

		const updatedProperties = { ...(selectedCollider.properties || {}) };
		const value = updatedProperties[oldKey];
		delete updatedProperties[oldKey];
		updatedProperties[newKey] = value;

		const newColliders = localColliders.map((c) =>
			c.id === selectedColliderId ? { ...c, properties: updatedProperties } : c,
		);
		setLocalColliders(newColliders);
	};

	const handleUpdatePropertyValue = (key: string, value: string) => {
		const selectedCollider = getSelectedCollider();
		if (!selectedCollider) return;

		const updatedProperties = {
			...(selectedCollider.properties || {}),
			[key]: value,
		};

		const newColliders = localColliders.map((c) =>
			c.id === selectedColliderId ? { ...c, properties: updatedProperties } : c,
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
							<div className="text-sm font-semibold text-gray-400 mb-3">
								COLLIDER PROPERTIES
							</div>
							<div className="mb-3">
								<div className="text-xs text-gray-500 mb-1 block">Name</div>
								{editingColliderName ? (
									<input
										type="text"
										defaultValue={selectedCollider.name || ""}
										onBlur={(e) => {
											handleUpdateColliderName(e.target.value);
											setEditingColliderName(false);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateColliderName(e.currentTarget.value);
												setEditingColliderName(false);
											} else if (e.key === "Escape") {
												setEditingColliderName(false);
											}
										}}
										className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none"
										style={{
											background: "#3e3e42",
											border: "1px solid #007acc",
										}}
									/>
								) : (
									<div
										onClick={() => setEditingColliderName(true)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												setEditingColliderName(true);
											}
										}}
										className="px-2 py-1 text-xs rounded text-gray-200 cursor-text"
										style={{
											background: "#3e3e42",
											border: "1px solid #3e3e42",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#4a4a4e";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "#3e3e42";
										}}
										role="button"
										tabIndex={0}
										aria-label="Edit collider name"
									>
										{selectedCollider.name || "(none)"}
									</div>
								)}
							</div>
							<div className="mb-3">
								<div className="text-xs text-gray-500 mb-1 block">Type</div>
								{editingColliderType ? (
									<input
										type="text"
										defaultValue={selectedCollider.type || ""}
										onBlur={(e) => {
											handleUpdateColliderType(e.target.value);
											setEditingColliderType(false);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateColliderType(e.currentTarget.value);
												setEditingColliderType(false);
											} else if (e.key === "Escape") {
												setEditingColliderType(false);
											}
										}}
										className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none"
										style={{
											background: "#3e3e42",
											border: "1px solid #007acc",
										}}
									/>
								) : (
									<div
										onClick={() => setEditingColliderType(true)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												setEditingColliderType(true);
											}
										}}
										className="px-2 py-1 text-xs rounded text-gray-200 cursor-text"
										style={{
											background: "#3e3e42",
											border: "1px solid #3e3e42",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#4a4a4e";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "#3e3e42";
										}}
										role="button"
										tabIndex={0}
										aria-label="Edit collider type"
									>
										{selectedCollider.type || "(none)"}
									</div>
								)}
							</div>

							{/* Position (center of all points) - only show when no specific point is selected */}
							{selectedPointIndex === null && (
								<div
									className="mt-4 pt-4"
									style={{ borderTop: "1px solid #3e3e42" }}
								>
									<div className="text-sm font-semibold text-gray-400 mb-3">
										POSITION
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
										<div className="text-sm font-semibold text-gray-400 mb-3">
											SELECTED POINT
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
							<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
								<span>CUSTOM PROPERTIES</span>
								<button
									type="button"
									onClick={handleAddProperty}
									className="text-xs px-2 py-1 text-gray-200 rounded transition-colors"
									style={{ background: "#3e3e42" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#4a4a4e";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
								>
									+ Add
								</button>
							</div>
							<div className="text-xs text-gray-500">
								{selectedCollider.properties &&
								Object.keys(selectedCollider.properties).length > 0 ? (
									<div className="space-y-2">
										{Object.entries(selectedCollider.properties).map(
											([key, value]) => {
												const isTemp = key.startsWith("__temp_");
												const displayKey = isTemp ? "" : key;

												return (
													<div key={key} className="flex items-center gap-2">
														<div className="flex-1" style={{ minWidth: 0 }}>
															{editingPropertyKey === key ? (
																<input
																	type="text"
																	value={displayKey}
																	onChange={(e) => {
																		const newKey = e.target.value;
																		handleUpdatePropertyKey(key, newKey);
																		if (newKey?.trim()) {
																			setEditingPropertyKey(newKey);
																		}
																	}}
																	onBlur={() => {
																		setEditingPropertyKey(null);
																		if (isTemp) {
																			handleDeleteProperty(key);
																		}
																	}}
																	onKeyDown={(e) => {
																		if (
																			e.key === "Enter" ||
																			e.key === "Escape"
																		) {
																			setEditingPropertyKey(null);
																			if (isTemp || !displayKey.trim()) {
																				handleDeleteProperty(key);
																			}
																		}
																	}}
																	placeholder="Key"
																	className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none font-mono"
																	style={{
																		background: "#3e3e42",
																		border: "1px solid #007acc",
																	}}
																/>
															) : (
																<div
																	onClick={() => setEditingPropertyKey(key)}
																	onKeyDown={(e) => {
																		if (e.key === "Enter" || e.key === " ") {
																			e.preventDefault();
																			setEditingPropertyKey(key);
																		}
																	}}
																	className="text-gray-400 font-mono text-xs cursor-text px-2 py-1 rounded"
																	style={{
																		background: "#3e3e42",
																		border: "1px solid transparent",
																	}}
																	onMouseEnter={(e) => {
																		e.currentTarget.style.background =
																			"#4a4a4e";
																	}}
																	onMouseLeave={(e) => {
																		e.currentTarget.style.background =
																			"#3e3e42";
																	}}
																	role="button"
																	tabIndex={0}
																	aria-label="Edit property key"
																>
																	{displayKey || (
																		<span style={{ opacity: 0.5 }}>Key</span>
																	)}
																</div>
															)}
														</div>
														<div className="flex-1" style={{ minWidth: 0 }}>
															{editingPropertyValue === key ? (
																<input
																	type="text"
																	value={value}
																	onChange={(e) =>
																		handleUpdatePropertyValue(
																			key,
																			e.target.value,
																		)
																	}
																	onBlur={() => setEditingPropertyValue(null)}
																	onKeyDown={(e) => {
																		if (
																			e.key === "Enter" ||
																			e.key === "Escape"
																		) {
																			setEditingPropertyValue(null);
																		}
																	}}
																	placeholder="Value"
																	className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none"
																	style={{
																		background: "#3e3e42",
																		border: "1px solid #007acc",
																	}}
																/>
															) : (
																<div
																	onClick={() => setEditingPropertyValue(key)}
																	onKeyDown={(e) => {
																		if (e.key === "Enter" || e.key === " ") {
																			e.preventDefault();
																			setEditingPropertyValue(key);
																		}
																	}}
																	className="text-gray-300 text-xs cursor-text px-2 py-1 rounded"
																	style={{
																		background: "#3e3e42",
																		border: "1px solid transparent",
																	}}
																	onMouseEnter={(e) => {
																		e.currentTarget.style.background =
																			"#4a4a4e";
																	}}
																	onMouseLeave={(e) => {
																		e.currentTarget.style.background =
																			"#3e3e42";
																	}}
																	role="button"
																	tabIndex={0}
																	aria-label="Edit property value"
																>
																	{value || (
																		<span style={{ opacity: 0.5 }}>Value</span>
																	)}
																</div>
															)}
														</div>
														<button
															type="button"
															onClick={() => handleDeleteProperty(key)}
															className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
															style={{ width: "20px" }}
														>
															✕
														</button>
													</div>
												);
											},
										)}
									</div>
								) : (
									<div className="text-center py-4">No custom properties</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Right Side - Canvas Area */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden relative"
				onKeyDown={handleLocalKeyDown}
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
